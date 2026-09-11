import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

function clearAndRespond() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function POST() {
  return clearAndRespond();
}

export async function GET() {
  return clearAndRespond();
}
