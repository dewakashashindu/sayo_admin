import { NextRequest, NextResponse } from 'next/server';
import { prisma }   from '@/lib/prisma';
import { otpStore } from '@/lib/otpStore';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email?.trim())
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    // ── Find user in Tbl_CustomerMaster ───────────────────────────────────
    let user: { CusCode: string; CusName: string } | null = null;
    try {
      user = await prisma.tbl_CustomerMaster.findFirst({
        where:  { CusEmail: emailNorm },
        select: { CusCode: true, CusName: true },
      });
    } catch (err) {
      console.error('[send-otp] lookup error:', errMsg(err));
    }

    // security: email නැතිනම්ත් success return කරනවා (email enumeration prevent)
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // ── Generate OTP ───────────────────────────────────────────────────────
    const code      = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    otpStore.set(emailNorm, { code, expiresAt });

    await sendOtpEmail(emailNorm, user.CusName, code);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[send-otp POST]', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

async function sendOtpEmail(to: string, name: string, code: string) {
  if (process.env.SMTP_HOST) {
    const nodemailer  = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
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
                      color:#B8860B;text-align:center;padding:1.5rem 0">${code}</div>
          <p style="color:#666;font-size:0.85rem">
            This code expires in <strong>10 minutes</strong>.
          </p>
        </div>
      `,
    });
  } else {
    console.log(`[send-otp] OTP for ${to}: ${code}`);
  }
}