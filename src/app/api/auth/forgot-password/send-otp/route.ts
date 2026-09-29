// src/app/api/auth/forgot-password/send-otp/route.ts
// POST { email } — step 1 of the CUSTOMER reset (a booking account).
//
// 2026-09-29 fixes:
//   • the code is stored in MySQL (Tbl_CustomerOtpReset), BCrypt-hashed —
//     before it lived in a server-memory Map (lost on every restart / not
//     shared between workers) and, in the legacy Tbl_OtpStore table, in clear
//     text.
//   • counters moved to MySQL (rateLimitStrong) so a restart cannot reset them.
//   • the answer never says whether the address exists (no enumeration).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newCustomerOtp, saveCustomerOtp } from "@/lib/customerOtp";
import { rateLimitStrong } from "@/lib/rateLimitDb";
import { rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";
import { sendMail, codeMailHtml, mailConfigured, mailMissingEnv } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const byIp = await rateLimitStrong({
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

    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email?.trim())
      return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const emailNorm = email.trim().toLowerCase().slice(0, 200);

    const byEmail = await rateLimitStrong({
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

    /* Find the booking account (Tbl_CustomerMaster) */
    let user: { CusCode: string; CusName: string } | null = null;
    try {
      user = await prisma.tbl_CustomerMaster.findFirst({
        where: { CusEmail: emailNorm },
        select: { CusCode: true, CusName: true },
      });
    } catch (err) {
      console.error("[send-otp] lookup error:", errMsg(err));
    }

    /* security: an unknown address gets the same answer as a known one */
    if (!user) {
      return NextResponse.json({ success: true });
    }

    if (!mailConfigured()) {
      console.error(`[send-otp] SMTP is not configured (${mailMissingEnv().join(", ")} are empty)`);
      return NextResponse.json(
        {
          error:
            "E-mail is not set up on this server, so the reset code cannot be sent. Please call the salon.",
        },
        { status: 503 },
      );
    }

    const code = newCustomerOtp();          // crypto.randomInt — never Math.random
    await saveCustomerOtp(emailNorm, code);

    try {
      await sendMail({
        to: emailNorm,
        subject: "Your SAYO password reset code",
        text: `Your SAYO password reset code is ${code}. It expires in 10 minutes.`,
        html: codeMailHtml(
          "SAYO Beauty",
          `Hi ${escapeHtml(user.CusName ?? "there")}, your password reset code is:`,
          code,
          "This code expires in <strong>10 minutes</strong>.",
        ),
      });
    } catch (err) {
      console.error("[send-otp] mail failed:", errMsg(err));
      return NextResponse.json(
        { error: "The reset code could not be sent. Please try again in a moment." },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-otp POST]", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
