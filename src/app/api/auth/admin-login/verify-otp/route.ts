// src/app/api/auth/admin-login/verify-otp/route.ts
// POST { challenge, code } — step 2 of the hidden super administrator's login.
// Only this route — never /api/auth/admin-login — sets the session cookie for
// that account. The challenge is the signed, 10-minute token step 1 returned.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAdminToken, adminCookieOptions, sessionVersion, ADMIN_COOKIE } from '@/lib/adminSession';
import { rateLimit, clearRate, rateMessage } from '@/lib/rateLimit';
import { rateLimitStrong, clearRateStrong } from '@/lib/rateLimitDb';
import { clientIp, ipForLog } from '@/lib/clientIp';
import { isSuperAdmin } from '@/lib/superAdmin';
import { verifyAdminOtp, verifyOtpChallenge } from '@/lib/adminOtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VERIFY_IP_LIMIT = 30;       // every code check, per caller
const VERIFY_ACCOUNT_LIMIT = 10;  // code checks per account
const VERIFY_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    const byIp = await rateLimitStrong({
      bucket: 'admin-otp:ip',
      key: caller,
      limit: VERIFY_IP_LIMIT,
      windowMs: VERIFY_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[admin-otp] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { error: rateMessage('otp_reset', byIp.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(byIp.retryAfterSec) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { challenge?: string; code?: string };
    const challenge = String(body.challenge ?? '').trim();
    const code = String(body.code ?? '').trim();

    const invalid = NextResponse.json(
      { error: 'That sign-in code is not valid any more. Start again.' },
      { status: 401 },
    );
    if (!challenge || !code) return invalid;

    const account = await verifyOtpChallenge(challenge);
    if (!account) {
      console.warn('[admin-otp] challenge rejected (expired / tampered / wrong key)');
      return invalid;
    }

    const accountRule = {
      bucket: 'admin-otp:account',
      key: account.log.toLowerCase(),
      limit: VERIFY_ACCOUNT_LIMIT,
      windowMs: VERIFY_WINDOW_MS,
    };
    const accountCheck = await rateLimitStrong(accountRule);
    if (!accountCheck.ok) {
      console.warn(`[admin-otp] account rate limited user=${account.log}`);
      return NextResponse.json(
        { error: rateMessage('otp_reset', accountCheck.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(accountCheck.retryAfterSec) } },
      );
    }

    /* Re-read the row: the account may have been disabled, renamed or moved
       out of the super-admin group between the two steps. */
    const rows = await prisma.$queryRaw<
      { UserId: string; LogName: string; UserName: string; GroupId: string; Enable: number; PSW: string }[]
    >`
      SELECT RTRIM(UserId) AS UserId, RTRIM(LogName) AS LogName, RTRIM(UserName) AS UserName,
             RTRIM(GroupId) AS GroupId, Enable, PSW
      FROM tbl_userdetails WHERE UserId = ${account.uid} LIMIT 1
    `;
    const row = rows[0];
    if (!row || Number(row.Enable) !== 1 || !isSuperAdmin({ userId: row.UserId, groupId: row.GroupId })) {
      console.warn(`[admin-otp] account no longer eligible uid=${account.uid}`);
      return invalid;
    }

    const verdict = await verifyAdminOtp(row.UserId, code);
    if (!verdict.ok) {
      const message =
        verdict.reason === 'missing'
          ? 'That code has already been used or replaced — ask for a new one.'
          : verdict.reason === 'expired'
            ? 'That code has expired — ask for a new one.'
            : verdict.reason === 'too_many'
              ? 'Too many wrong codes — ask for a new one.'
              : `Wrong code. ${verdict.attemptsLeft} attempt${verdict.attemptsLeft === 1 ? '' : 's'} left.`;
      console.warn(`[admin-otp] wrong code uid=${row.UserId} reason=${verdict.reason}`);
      return NextResponse.json({ error: message, attemptsLeft: verdict.attemptsLeft }, { status: 401 });
    }

    const token = await createAdminToken({
      uid: row.UserId.trim(),
      log: row.LogName.trim(),
      name: row.UserName.trim(),
      sv: await sessionVersion(row.PSW),
    });
    if (!token) {
      console.error('[admin-otp] AUTH_SECRET is not configured on the server.');
      return NextResponse.json(
        { error: 'Server misconfigured: AUTH_SECRET missing.' },
        { status: 500 },
      );
    }

    /* the account's counters start clean once the code is right */
    clearRate('admin-login:account', row.LogName.trim().toLowerCase());
    clearRate('admin-login:otp', row.LogName.trim().toLowerCase());
    clearRate(accountRule.bucket, accountRule.key);
    await clearRateStrong('admin-login:account', row.LogName.trim().toLowerCase());
    await clearRateStrong('admin-login:otp', row.LogName.trim().toLowerCase());
    await clearRateStrong(accountRule.bucket, accountRule.key);

    const res = NextResponse.json({
      success: true,
      user: { username: row.LogName.trim(), name: row.UserName.trim() },
    });
    res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
    console.log(`[admin-otp] super admin signed in uid=${row.UserId}`);
    return res;
  } catch (err) {
    console.error('[admin-otp] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}
