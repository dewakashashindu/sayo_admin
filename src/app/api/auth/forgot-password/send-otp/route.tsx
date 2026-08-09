// app/api/auth/forgot-password/send-otp/route.ts
// ─────────────────────────────────────────────────────────────
// POST → check email exists, generate 6-digit OTP, store it
//        with a 10-min expiry, send via Nodemailer (or console)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { prisma }  from '@/lib/prisma';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

/* ── in-memory OTP store (survives within one server process) ── */
/* For production with multiple instances, swap for Redis/DB.    */
export const otpStore = new Map<string, { code: string; expiresAt: number }>();

function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    /* ── find user ── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloudClient = prisma as any;

    const MODEL_NAMES = ['tbl_UserDetails', 'tblUserDetails', 'tbl_userdetails'];
    const cloudModel  = MODEL_NAMES.find(n => typeof cloudClient[n]?.findUnique === 'function');
    const modelName   = cloudModel;

    if (!modelName) {
      return NextResponse.json({ error: 'User model not found. Run: npx prisma generate' }, { status: 500 });
    }

    let user: { UserId: number; UserName: string } | null = null;
    try {
      user = await cloudClient[modelName].findUnique({
        where:  { EmailAddress: emailNorm },
        select: { UserId: true, UserName: true },
      });
    } catch (err) {
      console.error('[send-otp] cloud lookup error:', errMsg(err));
    }

    /* ── always respond the same way to prevent email enumeration ── */
    if (!user) {
      console.log(`[send-otp] email not found (not disclosed to client): ${emailNorm}`);
      return NextResponse.json({ success: true });
    }

    /* ── generate OTP ── */
    const code      = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(emailNorm, { code, expiresAt });

    /* ── send email ── */
    await sendOtpEmail(emailNorm, user.UserName, code);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[send-otp POST]', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

/* ─── email sender ─────────────────────────────────────────── */
async function sendOtpEmail(to: string, name: string, code: string) {
  /* ── If you have SMTP env vars configured, use Nodemailer ── */
  if (process.env.SMTP_HOST) {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? '"SAYO Beauty" <no-reply@sayobeauty.com>',
      to,
      subject: 'Your SAYO Password Reset Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#B8860B">SAYO Beauty</h2>
          <p>Hi ${name},</p>
          <p>Your password reset code is:</p>
          <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.4em;
                      color:#B8860B;text-align:center;padding:1.5rem 0">
            ${code}
          </div>
          <p style="color:#666;font-size:0.85rem">
            This code expires in <strong>10 minutes</strong>.
            If you didn't request this, ignore this email.
          </p>
        </div>
      `,
    });

    console.log(`[send-otp] email sent to ${to}`);
  } else {
    /* ── No SMTP configured — log to console for local dev ── */
    console.log('─────────────────────────────────────');
    console.log(`[send-otp] OTP for ${to}: ${code}`);
    console.log('─────────────────────────────────────');
  }
}