// src/app/api/auth/login/route.ts
// POST { phone | email, password }
//
// 2026-10-01: sign-in is by PHONE number. The e-mail is optional on a booking
// account, so keying the lookup on CusEmail locked out exactly the customers
// the salon most wants (a walk-in with no e-mail). An address is still accepted
// so anybody who signs in the old way keeps working, but the number is tried
// first. Both are matched on their digits / exact value through
// src/lib/customerIdentity.ts.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createCustomerToken, customerCookieOptions, CUSTOMER_COOKIE } from '@/lib/customerSession';
import { clearRate, rateMessage } from '@/lib/rateLimit';
import { rateLimitStrong, rateLimitStrongPeek, clearRateStrong } from '@/lib/rateLimitDb';
import { clientIp, ipForLog } from '@/lib/clientIp';
import {
  canonicalPhone,
  findCustomerByPhone,
  isUsablePhone,
  phoneForLog,
  type CustomerIdentityRow,
} from '@/lib/customerIdentity';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const CUSTOMER_LOGIN_IP_LIMIT = 20;
const CUSTOMER_LOGIN_ACCOUNT_LIMIT = 8;
const CUSTOMER_LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    /* in MySQL, not in memory: a restart must not hand a script a fresh
       allowance of password guesses */
    const byIp = await rateLimitStrong({
      bucket: 'customer-login:ip',
      key: caller,
      limit: CUSTOMER_LOGIN_IP_LIMIT,
      windowMs: CUSTOMER_LOGIN_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[login] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { error: rateMessage('login', byIp.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(byIp.retryAfterSec) } },
      );
    }

    const body = await req.json();
    const { phone, email, password } = body as {
      phone?: string; email?: string; password?: string;
    };

    const phoneRaw = (phone ?? '').trim();
    const emailRaw = (email ?? '').trim();

    if (!phoneRaw && !emailRaw)
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
    if (phoneRaw && !isUsablePhone(phoneRaw))
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    if (!phoneRaw && !emailRaw.includes('@'))
      return NextResponse.json({ error: 'Enter a valid phone number or email address.' }, { status: 400 });
    /* Only "did you type something" is checked here. An account whose password
       was created before the 8-character rule must still be able to sign in —
       password POLICY belongs on the screens that SET a password. */
    if (!password)
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });

    /* one rate-limit key either way: a wrong guess is counted against the
       number (or the address), never against a form field the caller can
       rename to escape the counter */
    const accountKey = phoneRaw
      ? canonicalPhone(phoneRaw)
      : emailRaw.toLowerCase();

    const accountRule = {
      bucket: 'customer-login:account',
      key: accountKey,
      limit: CUSTOMER_LOGIN_ACCOUNT_LIMIT,
      windowMs: CUSTOMER_LOGIN_WINDOW_MS,
    };
    const accountPeek = await rateLimitStrongPeek(accountRule);
    if (!accountPeek.ok) {
      console.warn(`[login] account paused key=${phoneRaw ? phoneForLog(phoneRaw) : accountKey}`);
      return NextResponse.json(
        { error: rateMessage('login', accountPeek.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(accountPeek.retryAfterSec) } },
      );
    }

    let user: CustomerIdentityRow | null = null;

    try {
      user = phoneRaw
        ? await findCustomerByPhone(phoneRaw)
        : (await prisma.tbl_CustomerMaster.findFirst({
            where:  { CusEmail: emailRaw.toLowerCase() },
            select: {
              CusCode:  true,
              CusName:  true,
              CusEmail: true,
              PSW:      true,
              RegTel:   true,
              Gender:   true,
            },
          })) as CustomerIdentityRow | null;
    } catch (err) {
      console.error('[login] lookup failed:', errMsg(err));
      return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
    }

    if (!user) {
      /* an unknown number is counted too — otherwise a script could use this
         screen to find out which numbers exist, for free */
      await rateLimitStrong(accountRule);
      return NextResponse.json(
        {
          error: phoneRaw
            ? 'No account found with this phone number.'
            : 'No account found with this email address.',
        },
        { status: 401 },
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.PSW);
    if (!passwordMatch) {
      await rateLimitStrong(accountRule);   // count the wrong guess against the account
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 401 },
      );
    }

    /* right password — the account starts again from zero */
    clearRate(accountRule.bucket, accountRule.key);
    await clearRateStrong(accountRule.bucket, accountRule.key);

    console.log(`[login] success — CusCode: ${user.CusCode}`);

    const phoneOut = user.RegTel?.trim() || phoneRaw;
    const token = await createCustomerToken({
      uid:    user.CusCode.trim(),
      log:    phoneOut,
      name:   user.CusName.trim(),
      phone:  phoneOut,
      gender: user.Gender?.trim() || '',
    });

    const res = NextResponse.json({
      success:     true,
      userId:      user.CusCode,
      name:        user.CusName,
      email:       user.CusEmail,
      phoneNumber: phoneOut,
      gender:      user.Gender ?? '',
    }, { status: 200 });

    if (token) {
      res.cookies.set(CUSTOMER_COOKIE, token, customerCookieOptions());
    }
    return res;

  } catch (err) {
    console.error('[login POST] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}
