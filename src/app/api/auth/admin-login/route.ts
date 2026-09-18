import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createAdminToken, adminCookieOptions, ADMIN_COOKIE } from '@/lib/adminSession';
import { rateLimit, rateLimitPeek, clearRate, rateMessage } from '@/lib/rateLimit';
import { clientIp, ipForLog } from '@/lib/clientIp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ── Brute-force protection ─────────────────────────────────────────────── *
 * TWO counters, because one is not enough:
 *   · per CALLER — the address from the socket (`server.mjs` writes it into
 *     `x-sayo-ip`), never the `x-forwarded-for` a caller can type. A script
 *     that changes that header gains nothing.
 *   · per ACCOUNT — counted on every WRONG password only, so a shared branch
 *     address cannot lock a colleague out, and an attacker cannot keep trying
 *     one user name by hopping addresses.
 * A successful sign-in clears the account counter (that is what it is for).
 */
const LOGIN_IP_LIMIT = 20;          // every attempt, per caller
const LOGIN_ACCOUNT_LIMIT = 8;      // WRONG attempts, per user name
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

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

    /* Look the staff/admin user up in tbl_userdetails (LogName + PSW) */
    let user: { UserId: string; LogName: string; UserName: string; PSW: string } | null = null;
    try {
      user = await prisma.tbl_userdetails.findFirst({
        where: { LogName: username.trim(), Enable: true },
        select: { UserId: true, LogName: true, UserName: true, PSW: true },
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
