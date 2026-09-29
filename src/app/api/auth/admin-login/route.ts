import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createAdminToken, adminCookieOptions, ADMIN_COOKIE } from '@/lib/adminSession';
import { rateLimit, rateLimitPeek, clearRate, rateMessage } from '@/lib/rateLimit';
import { clientIp, ipForLog } from '@/lib/clientIp';
import { isSuperAdmin } from '@/lib/superAdmin';
import {
  createAndSendAdminOtp,
  createOtpChallenge,
  otpDestinationsFromRow,
  otpSentMessage,
} from '@/lib/adminOtp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LOGIN_IP_LIMIT = 20;            // every attempt, per caller
const LOGIN_ACCOUNT_LIMIT = 8;        // WRONG attempts, per user name
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const OTP_REQUESTS_PER_WINDOW = 5;    // sign-in codes per user name / 10 min

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    const byIp = rateLimit({
      bucket: 'admin-login:ip',
      key: caller,
      limit: LOGIN_IP_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[admin-login] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { error: rateMessage('login', byIp.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(byIp.retryAfterSec) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { username, password } = body as { username?: string; password?: string };

    /* Generic validation errors — never reveal which field was wrong */
    const invalid = NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    if (!username?.trim() || !password) return invalid;

    /* the account counter — checked before the password is even compared */
    const accountKey = username.trim().toLowerCase();
    const accountRule = {
      bucket: 'admin-login:account',
      key: accountKey,
      limit: LOGIN_ACCOUNT_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    };
    const accountPeek = rateLimitPeek(accountRule);
    if (!accountPeek.ok) {
      console.warn(`[admin-login] account paused user=${accountKey}`);
      return NextResponse.json(
        { error: rateMessage('login', accountPeek.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(accountPeek.retryAfterSec) } },
      );
    }

    /* Look the staff/admin user up in tbl_userdetails (LogName + PSW).
       GroupId / ContNo / Email come along because the hidden super
       administrator needs them: his GroupId decides whether an OTP is
       required, and his contact details are stored encrypted and must be
       decrypted to send it. */
    let user: {
      UserId: string; LogName: string; UserName: string; PSW: string;
      GroupId: string; ContNo: string; Email: string;
    } | null = null;
    try {
      user = await prisma.tbl_userdetails.findFirst({
        where: { LogName: username.trim(), Enable: true },
        select: {
          UserId: true, LogName: true, UserName: true, PSW: true,
          GroupId: true, ContNo: true, Email: true,
        },
      });
    } catch (err) {
      console.error('[admin-login] DB lookup failed:', err);
      return NextResponse.json(
        { error: 'Database error during login — check DATABASE_URL / database access and the server logs.' },
        { status: 500 },
      );
    }

    const storedHash = user?.PSW?.trim() ?? '';
    if (!user || !storedHash) return invalid;

    const match = await bcrypt.compare(password, storedHash);
    if (!match) {
      rateLimit(accountRule);   // count the wrong guess against the user name
      return invalid;
    }

    /* right password — the account counter starts again from zero */
    clearRate(accountRule.bucket, accountRule.key);

    /* ── the hidden super administrator: password is only step one ─────────
       No session cookie is handed out here. A 6-digit code goes to the phone
       number and the e-mail stored (encrypted) in tbl_userdetails; only
       POST /api/auth/admin-login/verify-otp can finish the sign-in. */
    if (isSuperAdmin({ userId: user.UserId, groupId: user.GroupId })) {
      const otpRule = {
        bucket: 'admin-login:otp',
        key: accountKey,
        limit: OTP_REQUESTS_PER_WINDOW,
        windowMs: LOGIN_WINDOW_MS,
      };
      const otpPeek = rateLimitPeek(otpRule);
      if (!otpPeek.ok) {
        console.warn(`[admin-login] otp send paused user=${accountKey}`);
        return NextResponse.json(
          { error: rateMessage('otp_send', otpPeek.retryAfterSec) },
          { status: 429, headers: { 'Retry-After': String(otpPeek.retryAfterSec) } },
        );
      }

      const challenge = await createOtpChallenge({
        uid: user.UserId.trim(),
        log: user.LogName.trim(),
        name: user.UserName.trim(),
      });
      if (!challenge) {
        console.error('[admin-login] AUTH_SECRET is not configured on the server.');
        return NextResponse.json(
          { error: 'Server misconfigured: AUTH_SECRET missing.' },
          { status: 500 },
        );
      }

      /* ContNo / Email may be stored as v1:… ciphertext — read them through
         the decrypting helper, never straight off the row. */
      const { phone, email } = otpDestinationsFromRow(user);
      if (!phone && !email) {
        console.error(`[admin-login] no contact details for super admin ${user.UserId.trim()}`);
        return NextResponse.json(
          {
            error:
              'This account has no phone number or e-mail saved, so the sign-in code cannot be sent. ' +
              'Run scripts/create-superadmin.mjs again with the contact details.',
          },
          { status: 409 },
        );
      }

      const delivery = await createAndSendAdminOtp(user.UserId.trim(), phone, email);
      if (!delivery.smsSent && !delivery.emailSent) {
        console.error(
          `[admin-login] OTP could not be delivered: sms=${delivery.smsError ?? '-'} mail=${delivery.emailError ?? '-'}`,
        );
        return NextResponse.json(
          {
            error:
              'The sign-in code could not be sent. ' +
              `SMS: ${delivery.smsError ?? 'not configured'}. ` +
              `E-mail: ${delivery.emailError ?? 'not configured'}.`,
            otpRequired: true,
            channelErrors: { sms: delivery.smsError ?? '', email: delivery.emailError ?? '' },
          },
          { status: 503 },
        );
      }

      rateLimit(otpRule); // count the send against the account

      const message = otpSentMessage(delivery, delivery.phoneMasked, delivery.emailMasked);
      console.log(
        `[admin-login] super admin OTP issued user=${user.UserId.trim()} sms=${delivery.smsSent} mail=${delivery.emailSent}`,
      );
      return NextResponse.json({
        otpRequired: true,
        challenge,
        message,
        destinations: { phone: delivery.phoneMasked, email: delivery.emailMasked },
        channels: { sms: delivery.smsSent, email: delivery.emailSent },
      });
    }

    const token = await createAdminToken({
      uid: user.UserId.trim(),
      log: user.LogName.trim(),
      name: user.UserName.trim(),
    });
    if (!token) {
      console.error('[admin-login] AUTH_SECRET is not configured on the server.');
      return NextResponse.json(
        { error: 'Server misconfigured: AUTH_SECRET missing.' },
        { status: 500 },
      );
    }

    const res = NextResponse.json({
      success: true,
      user: { username: user.LogName.trim(), name: user.UserName.trim() },
    });
    res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
    return res;
  } catch (err) {
    console.error('[admin-login] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}
