import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createCustomerToken, customerCookieOptions, CUSTOMER_COOKIE } from '@/lib/customerSession';
import { prisma } from '@/lib/prisma';
import { sendRegistrationSMS } from '@/lib/sms';
import { GENDER_OPTIONS } from '@/lib/genderOptions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type GenderValue = typeof GENDER_OPTIONS[number]['value'];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Generate next CusCode (CUS0000001 format) ──────────────────────────────
async function generateCusCode(): Promise<string> {
  const last = await prisma.tbl_CustomerMaster.findFirst({
    orderBy: { CusCode: 'desc' },
    select:  { CusCode: true },
  });

  if (!last) return 'CUS0000001';

  const num  = parseInt(last.CusCode.replace('CUS', ''), 10);
  const next = isNaN(num) ? 1 : num + 1;
  return 'CUS' + String(next).padStart(7, '0');
}

// ───────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
    }

    const { name, email, phone, password, gender } = body as {
      name?: string; email?: string; phone?: string;
      password?: string; gender?: string;
    };

    if (!name?.trim())
      return NextResponse.json({ success: false, message: 'Full name is required.' }, { status: 400 });
    if (!email?.trim())
      return NextResponse.json({ success: false, message: 'Email address is required.' }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ success: false, message: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailLower = email.trim().toLowerCase();

    // ── Duplicate check (Select CusCode only to avoid unnecessary column queries) ─
    try {
      const exists = await prisma.tbl_CustomerMaster.findFirst({
        where: { CusEmail: emailLower },
        select: { CusCode: true },
      });
      if (exists) {
        return NextResponse.json(
          { success: false, message: 'An account with this email already exists.' },
          { status: 409 },
        );
      }
    } catch (err) {
      console.error('[register] duplicate-check error:', errMsg(err));
      return NextResponse.json({ success: false, message: 'Registration failed.' }, { status: 500 });
    }

    // ── Hash password ──────────────────────────────────────────────────────
    const hashedPSW = await bcrypt.hash(password, 12);

    // ── Save to Tbl_CustomerMaster ─────────────────────────────────────────
    try {
      const cusCode = await generateCusCode();

      const created = await prisma.tbl_CustomerMaster.create({
        data: {
          CusCode:   cusCode,
          CusName:   name.trim().substring(0, 200),
          CusEmail:  emailLower.substring(0, 200),
          RegTel:    (phone?.trim() ?? ' ').substring(0, 15) || ' ',
          PSW:       hashedPSW,
          Gender:    gender?.trim() ?? null,
          CreatedBy: 'SYSTEM',
        },
        select: { CusCode: true },
      });

      // ── SMS ───────────────────────────────────────────────────────────────
      if (phone?.trim()) {
        try {
          await sendRegistrationSMS({
            name:  name.trim(),
            email: emailLower,
            phone: phone.trim(),
          });
        } catch (smsErr) {
          console.error('[register] SMS trigger failed:', smsErr);
        }
      }

      const token = await createCustomerToken({
        uid:    created.CusCode.trim(),
        log:    emailLower,
        name:   name.trim(),
        phone:  phone?.trim() || '',
        gender: gender?.trim() || '',
      });

      const res = NextResponse.json(
        { success: true, message: 'User registered successfully', userId: created.CusCode },
        { status: 201 },
      );
      if (token) {
        res.cookies.set(CUSTOMER_COOKIE, token, customerCookieOptions());
      }
      return res;

    } catch (err) {
      console.error('[register] create error:', errMsg(err));
      return NextResponse.json(
        { success: false, message: 'Registration failed due to server error.' },
        { status: 500 },
      );
    }

  } catch (err) {
    console.error('[register POST] unexpected error:', err);
    return NextResponse.json({ success: false, message: 'Unexpected server error.' }, { status: 500 });
  }
}