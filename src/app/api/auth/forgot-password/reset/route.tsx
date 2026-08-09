// app/api/auth/forgot-password/reset/route.ts

import { NextRequest, NextResponse } from 'next/server';
import bcrypt                        from 'bcryptjs';
import { prisma }  from '@/lib/prisma';
import { otpStore }                  from '../send-otp/route';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

export async function POST(req: NextRequest) {
  try {
    const { email, otp, newPassword } = (await req.json()) as {
      email?: string; otp?: string; newPassword?: string;
    };

    if (!email?.trim())                       return NextResponse.json({ error: 'Email is required.'                       }, { status: 400 });
    if (!otp || otp.length !== 6)             return NextResponse.json({ error: 'A 6-digit OTP is required.'              }, { status: 400 });
    if (!newPassword || newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    /* ── validate OTP FIRST before touching the DB ── */
    const stored = otpStore.get(emailNorm);

    if (!stored) {
      return NextResponse.json({ error: 'No reset code found. Please request a new one.' }, { status: 400 });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(emailNorm);
      return NextResponse.json({ error: 'Reset code has expired. Please request a new one.' }, { status: 400 });
    }
    if (stored.code !== otp) {
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
    }

    /* ── OTP valid — hash new password ── */
    const PasswordHash = await bcrypt.hash(newPassword, 12);

    /* ── find model accessor ── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloudClient = prisma as any;

    const MODEL_NAMES = ['tbl_UserDetails', 'tblUserDetails', 'tbl_userdetails'];
    const cloudModel  = MODEL_NAMES.find(n => typeof cloudClient[n]?.update === 'function');

    if (!cloudModel) {
      return NextResponse.json({ error: 'User model not found. Run: npx prisma generate' }, { status: 500 });
    }

    /* ── update cloud DB ── */
    let cloudResult: unknown = null;
    let cloudError:  unknown = null;

    try {
      cloudResult = await cloudClient[cloudModel].update({
        where: { EmailAddress: emailNorm },
        data:  { PasswordHash },
      });
    } catch (err) {
      cloudError = err;
      console.error('[reset] cloud update error:', errMsg(err));
    }

    if (!cloudResult) {
      return NextResponse.json({
        error:   'Password reset failed.',
        details: { cloud: errMsg(cloudError) },
      }, { status: 500 });
    }

    /* ── success — NOW delete the OTP ── */
    otpStore.delete(emailNorm);
    console.log(`[reset] password updated for ${emailNorm} — source: cloud`);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[reset POST]', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}