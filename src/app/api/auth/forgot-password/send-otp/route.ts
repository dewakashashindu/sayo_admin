// src/app/api/auth/forgot-password/send-otp/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// E-mails a 6-digit password-reset code.
//
// SECURITY PASS (2026-09-18)
//   · this file was named `route.tsx`, which is NOT a route — Next.js only
//     builds `route.ts`, so the endpoint returned 404 and the whole
//     forgot-password screen could never work. Renamed.
//   · the code comes from crypto.randomInt, never Math.random
//   · the code is NEVER written to the server log any more
//   · rate limited per caller AND per e-mail address, so this inbox cannot be
//     flooded and the SMS/SMTP account cannot be run up from outside
//   · the customer's name is escaped before it goes into the HTML mail
//   · the same “success” answer is given whether the address exists or not
//     (no e-mail enumeration)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { otpStore, generateOtpCode, OTP_TTL_MS, sweepOtps } from "@/lib/otpStore";
import { rateLimit, rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ── how often a code may be requested ───────────────────────────────────── */
const OTP_SEND_IP_LIMIT = 5;              // per caller, per 30 minutes
const OTP_SEND_EMAIL_LIMIT = 3;           // per address, per 15 minutes
const OTP_SEND_IP_WINDOW_MS = 30 * 60 * 1000;
const OTP_SEND_EMAIL_WINDOW_MS = 15 * 60 * 1000;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Nothing a customer types should be able to change the shape of the mail. */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    const byIp = rateLimit({
      bucket: "otp-send:ip",
      key: caller,
      limit: OTP_SEND_IP_LIMIT,
      windowMs: OTP_SEND_IP_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[send-otp] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { error: rateMessage("otp_send", byIp.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } },
      );
    }

    const { email } = (await req.json()) as { email?: string };
    if (!email?.trim())
      return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    const byEmail = rateLimit({
      bucket: "otp-send:email",
      key: emailNorm,
      limit: OTP_SEND_EMAIL_LIMIT,
      windowMs: OTP_SEND_EMAIL_WINDOW_MS,
    });
    if (!byEmail.ok) {
      console.warn(`[send-otp] email rate limited (${emailNorm})`);
      return NextResponse.json(
        { error: rateMessage("otp_send", byEmail.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byEmail.retryAfterSec) } },
      );
    }

    sweepOtps();   // expired codes are dropped instead of living in memory

    // ── Find user in Tbl_CustomerMaster ───────────────────────────────────
    let user: { CusCode: string; CusName: string } | null = null;
    try {
      user = await prisma.tbl_CustomerMaster.findFirst({
        where: { CusEmail: emailNorm },
        select: { CusCode: true, CusName: true },
      });
    } catch (err) {
      console.error("[send-otp] lookup error:", errMsg(err));
    }

    // security: email නැතිනම්ත් success return කරනවා (email enumeration prevent)
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // ── Generate OTP ───────────────────────────────────────────────────────
    const code = generateOtpCode();                 // crypto.randomInt — never Math.random
    const expiresAt = Date.now() + OTP_TTL_MS;
    otpStore.set(emailNorm, { code, expiresAt, attempts: 0 });

    await sendOtpEmail(emailNorm, user.CusName, code);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-otp POST]", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

async function sendOtpEmail(to: string, name: string, code: string) {
  if (process.env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? '"SAYO Beauty" <no-reply@sayobeauty.com>',
      to,
      subject: "Your SAYO Password Reset Code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#B8860B">SAYO Beauty</h2>
          <p>Hi ${escapeHtml(name)},</p>
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
    /* NO code in the log, not even in development — a log file is readable by
       anyone with server access and often lives on for months. */
    console.warn(
      "[send-otp] SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS), so the reset mail was not sent.",
    );
  }
}
