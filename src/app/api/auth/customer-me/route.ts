import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken, CUSTOMER_COOKIE } from '@/lib/customerSession';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Returns the logged-in booking customer (cookie-based session). */
export async function GET(req: NextRequest) {
  const payload = await verifyCustomerToken(req.cookies.get(CUSTOMER_COOKIE)?.value);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    user: {
      userId:      payload.uid,
      name:        payload.name,
      email:       payload.log,
      phoneNumber: payload.phone || '',
      gender:      payload.gender || '',
    },
  });
}
