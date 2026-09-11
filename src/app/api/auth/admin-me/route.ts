import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Returns the currently logged-in admin/staff user (used by the admin UI). */
export async function GET(req: NextRequest) {
  const payload = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    user: { userId: payload.uid, username: payload.log, name: payload.name },
  });
}
