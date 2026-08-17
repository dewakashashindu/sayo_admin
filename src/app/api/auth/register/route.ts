import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendRegistrationSMS } from '@/lib/sms'; 

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'genderqueer', label: 'Genderqueer' },
  { value: 'genderfluid', label: 'Gender-fluid' },
  { value: 'agender', label: 'Agender' },
  { value: 'bigender', label: 'Bigender' },
  { value: 'two_spirit', label: 'Two-Spirit' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other', label: 'Other' },
] as const;

export type GenderValue = typeof GENDER_OPTIONS[number]['value'];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
    }

    const { name, email, phone, password, gender } = body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      gender?: string;
    };

    if (!name?.trim()) return NextResponse.json({ success: false, message: 'Full name is required.' }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ success: false, message: 'Email address is required.' }, { status: 400 });
    if (!password || password.length < 6) return NextResponse.json({ success: false, message: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailLower = email.trim().toLowerCase();

    // quick duplicate check
    try {
      const exists = await prisma.tbl_UserDetails.findFirst({ where: { EmailAddress: emailLower } });
      if (exists) {
        return NextResponse.json({ success: false, message: 'An account with this email already exists.' }, { status: 409 });
      }
    } catch (err) {
      console.error('[register] duplicate-check error:', errMsg(err));
      return NextResponse.json({ success: false, message: 'Registration failed.' }, { status: 500 });
    }

    const PasswordHash = await bcrypt.hash(password, 12);
    const payload = {
      UserName:     name.trim(),
      EmailAddress: emailLower,
      PhoneNumber:  phone?.trim() ?? null,
      PasswordHash,
      Gender:       gender?.trim() ?? null,
    };

    try {
      const created = await prisma.tbl_UserDetails.create({ data: payload });

     
      if (payload.PhoneNumber) {
        try {
          await sendRegistrationSMS({
            name: payload.UserName,
            email: payload.EmailAddress,
            phone: payload.PhoneNumber,
          });
        } catch (smsErr) {
          
          console.error('[register] SMS trigger failed:', smsErr);
        }
      }
      // ─────────────────────────────────────────────────────────────

      return NextResponse.json({ success: true, message: 'User registered successfully', userId: (created as any).UserId ?? null }, { status: 201 });
    } catch (err) {
      const code = err instanceof Error ? (err as any).code : undefined;
      if (code === 'P2002') {
        return NextResponse.json({ success: false, message: 'An account with this email already exists.' }, { status: 409 });
      }
      console.error('[register] create error:', errMsg(err));
      return NextResponse.json({ success: false, message: 'Registration failed due to server error.' }, { status: 500 });
    }
  } catch (err) {
    console.error('[register POST] unexpected error:', err);
    return NextResponse.json({ success: false, message: 'Unexpected server error.' }, { status: 500 });
  }
}