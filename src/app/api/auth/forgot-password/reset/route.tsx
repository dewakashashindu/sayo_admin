// app/api/auth/forgot-password/reset/route.ts

import { NextRequest, NextResponse } from 'next/server';
import bcrypt        from 'bcryptjs';
import { prisma }    from '@/lib/prisma';
import { otpStore }  from '@/lib/otpStore';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

export async function POST(req: NextRequest) {
  try {
    const { email, otp, newPassword } = (await req.json()) as {
      email?: string; otp?: string; newPassword?: string;
    };

    if (!email?.trim())
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    if (!otp || otp.length !== 6)
      return NextResponse.json({ error: 'A 6-digit OTP is required.' }, { status: 400 });
    if (!newPassword || newPassword.length < 6)
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    // ── Validate OTP first ─────────────────────────────────────────────────
    const stored = otpStore.get(emailNorm);

    if (!stored)
      return NextResponse.json({ error: 'No reset code found. Please request a new one.' }, { status: 400 });
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(emailNorm);
      return NextResponse.json({ error: 'Reset code has expired. Please request a new one.' }, { status: 400 });
    }
    if (stored.code !== otp)
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });

    // ── Hash new password ──────────────────────────────────────────────────
    const hashedPSW = await bcrypt.hash(newPassword, 12);

    // ── Update Tbl_CustomerMaster ──────────────────────────────────────────
    try {
      const user = await prisma.tbl_CustomerMaster.findFirst({
        where:  { CusEmail: emailNorm },
        select: { CusCode: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'No account found with this email address.' },
          { status: 404 },
        );
      }

      await prisma.tbl_CustomerMaster.update({
        where: { CusCode: user.CusCode },
        data:  { PSW: hashedPSW },
      });

    } catch (err) {
      console.error('[reset] update error:', errMsg(err));
      return NextResponse.json({ error: 'Password reset failed.' }, { status: 500 });
    }

    // ── Success — delete OTP ───────────────────────────────────────────────
    otpStore.delete(emailNorm);
    console.log(`[reset] password updated for ${emailNorm}`);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[reset POST]', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}