import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createCustomerToken, customerCookieOptions, CUSTOMER_COOKIE } from '@/lib/customerSession';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email?.trim())
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    // ── Find user in Tbl_CustomerMaster ───────────────────────────────────
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
      return NextResponse.json(
        { error: 'No account found with this email address.' },
        { status: 401 },
      );
    }

    // ── Password check ─────────────────────────────────────────────────────
    const passwordMatch = await bcrypt.compare(password, user.PSW);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 401 },
      );
    }

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