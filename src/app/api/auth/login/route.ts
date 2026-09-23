import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createCustomerToken, customerCookieOptions, CUSTOMER_COOKIE } from '@/lib/customerSession';
import { rateLimit, rateLimitPeek, clearRate, rateMessage } from '@/lib/rateLimit';
import { clientIp, ipForLog } from '@/lib/clientIp';

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
    const byIp = rateLimit({
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
    const { email, password } = body as { email?: string; password?: string };

    if (!email?.trim())
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    /* the per-account counter, checked before the database is even asked */
    const accountRule = {
      bucket: 'customer-login:account',
      key: emailNorm,
      limit: CUSTOMER_LOGIN_ACCOUNT_LIMIT,
      windowMs: CUSTOMER_LOGIN_WINDOW_MS,
    };
    const accountPeek = rateLimitPeek(accountRule);
    if (!accountPeek.ok) {
      console.warn(`[login] account paused email=${emailNorm}`);
      return NextResponse.json(
        { error: rateMessage('login', accountPeek.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(accountPeek.retryAfterSec) } },
      );
    }

        let user: {
      CusCode:  string;
      CusName:  string;
      CusEmail: string;
      PSW:      string;
      RegTel:   string;
      Gender:   string | null;
    } | null = null;

    try {
      user = await prisma.tbl_CustomerMaster.findFirst({
        where:  { CusEmail: emailNorm },
        select: {
          CusCode:  true,
          CusName:  true,
          CusEmail: true,
          PSW:      true,
          RegTel:   true,
          Gender:   true,
        },
      });
    } catch (err) {
      console.error('[login] lookup failed:', errMsg(err));
      return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
    }

    if (!user) {
      /* an unknown address is counted too — otherwise a script could use this
         screen to find out which addresses exist, for free */
      rateLimit(accountRule);
      return NextResponse.json(
        { error: 'No account found with this email address.' },
        { status: 401 },
      );
    }

        const passwordMatch = await bcrypt.compare(password, user.PSW);
    if (!passwordMatch) {
      rateLimit(accountRule);   // count the wrong guess against the account
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 401 },
      );
    }

    /* right password — the account starts again from zero */
    clearRate(accountRule.bucket, accountRule.key);

    console.log(`[login] success — CusCode: ${user.CusCode}`);

    const token = await createCustomerToken({
      uid:    user.CusCode.trim(),
      log:    user.CusEmail.trim(),
      name:   user.CusName.trim(),
      phone:  user.RegTel.trim() || '',
      gender: user.Gender?.trim() || '',
    });

    const res = NextResponse.json({
      success:     true,
      userId:      user.CusCode,
      name:        user.CusName,
      email:       user.CusEmail,
      phoneNumber: user.RegTel.trim() || '',
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