import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createAdminToken, adminCookieOptions, ADMIN_COOKIE } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ── Very basic in-memory brute-force throttle (per IP) ── */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_TRIES = 8;

function throttled(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_TRIES;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  );
}

export async function POST(req: NextRequest) {
  try {
    if (throttled(clientIp(req))) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { username, password } = body as { username?: string; password?: string };

    /* Generic validation errors — never reveal which field was wrong */
    const invalid = NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    if (!username?.trim() || !password) return invalid;

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
    if (!match) return invalid;

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
