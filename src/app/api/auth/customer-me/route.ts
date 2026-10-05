import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken, CUSTOMER_COOKIE } from '@/lib/customerSession';
import { usableCustomerEmail } from '@/lib/customerIdentity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Returns the logged-in booking customer (cookie-based session). */
export async function GET(req: NextRequest) {
  const payload = await verifyCustomerToken(req.cookies.get(CUSTOMER_COOKIE)?.value);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let email = '';
  let phoneNumber = String(payload.phone || '').trim();
  let name = payload.name;
  let gender = payload.gender || '';

  try {
    const rows = await prisma.$queryRawUnsafe<
      { CusName: string; CusEmail: string; RegTel: string; Gender: string | null }[]
    >(
      `SELECT CusName, CusEmail, RegTel, Gender
         FROM tbl_customermaster
        WHERE RTRIM(CusCode) = ?
        LIMIT 1`,
      payload.uid.trim(),
    );
    const row = rows[0];
    if (row) {
      name = String(row.CusName ?? '').trim() || name;
      email = usableCustomerEmail(row.CusEmail);
      phoneNumber = String(row.RegTel ?? '').trim() || phoneNumber;
      gender = String(row.Gender ?? '').trim() || gender;
    }
  } catch (err) {
    console.error('[customer-me] lookup failed:', err);
  }

  return NextResponse.json({
    success: true,
    user: {
      userId: payload.uid,
      name,
      email,
      phoneNumber,
      gender,
    },
  });
}
