// src/app/api/auth/forgot-password/send-otp/route.ts
// POST { phone } — step 1 of the CUSTOMER reset (a booking account).
//
// 2026-09-29 fixes:
//   • the code is stored in MySQL (Tbl_CustomerOtpReset), BCrypt-hashed —
//     before it lived in a server-memory Map (lost on every restart / not
//     shared between workers) and, in the legacy Tbl_OtpStore table, in clear
//     text.
//   • counters moved to MySQL (rateLimitStrong) so a restart cannot reset them.
//   • the answer never says whether the address exists (no enumeration).
//
// 2026-10-01: the code goes to the PHONE number and the account is found by
//   it. The e-mail is optional on a booking account, so a customer who never
//   gave one had no way back in: the screen demanded an address, the lookup
//   used CusEmail, and the code was mailed. The number is the one thing every
//   booking account is guaranteed to hold.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newCustomerOtp, saveCustomerOtp } from "@/lib/customerOtp";
import { rateLimitStrong } from "@/lib/rateLimitDb";
import { rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";
import { sendMail, codeMailHtml, mailConfigured, mailMissingEnv } from "@/lib/mailer";
import { sendSms, normalizeSmsPhone, smsConfigured, smsMissingEnv } from "@/lib/sms";
import {
  canonicalPhone,
  findCustomerByPhone,
  isUsablePhone,
  phoneForLog,
  type CustomerIdentityRow,
} from "@/lib/customerIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const OTP_SEND_IP_LIMIT = 5;              // per caller, per 30 minutes
const OTP_SEND_TARGET_LIMIT = 3;          // per number/address, per 15 minutes
const OTP_SEND_IP_WINDOW_MS = 30 * 60 * 1000;
const OTP_SEND_TARGET_WINDOW_MS = 15 * 60 * 1000;

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

    const { phone, email } = (await req.json().catch(() => ({}))) as {
      phone?: string;
      email?: string;
    };
    const phoneRaw = (phone ?? "").trim();
    const emailRaw = (email ?? "").trim();

    if (!phoneRaw && !emailRaw)
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    if (phoneRaw && !isUsablePhone(phoneRaw))
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

    /* The key the code is stored under. /reset must compute the same one. */
    const otpKey = phoneRaw ? canonicalPhone(phoneRaw) : emailRaw.toLowerCase().slice(0, 200);

    const byTarget = await rateLimitStrong({
      bucket: "otp-send:account",
      key: otpKey,
      limit: OTP_SEND_TARGET_LIMIT,
      windowMs: OTP_SEND_TARGET_WINDOW_MS,
    });
    if (!byTarget.ok) {
      console.warn(`[send-otp] rate limited account=${phoneRaw ? phoneForLog(phoneRaw) : otpKey}`);
      return NextResponse.json(
        { error: rateMessage("otp_send", byTarget.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byTarget.retryAfterSec) } },
      );
    }

    /* Find the booking account (Tbl_CustomerMaster) */
    let user: CustomerIdentityRow | null = null;
    try {
      user = phoneRaw
        ? await findCustomerByPhone(phoneRaw)
        : ((await prisma.tbl_CustomerMaster.findFirst({
            where: { CusEmail: emailRaw.toLowerCase() },
            select: { CusCode: true, CusName: true, CusEmail: true, RegTel: true, PSW: true, Gender: true },
          })) as CustomerIdentityRow | null);
    } catch (err) {
      console.error("[send-otp] lookup error:", errMsg(err));
    }

    /* security: an unknown number gets the same answer as a known one */
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const code = newCustomerOtp();          // crypto.randomInt — never Math.random
    const salutation = escapeHtml(user.CusName ?? "there");
    const smsNumber = normalizeSmsPhone(user.RegTel ?? phoneRaw);
    const mailAddress = (user.CusEmail ?? "").trim();

    /* Preferred: text the number. A booking account always has one. */
    if (smsNumber && smsConfigured()) {
      await saveCustomerOtp(otpKey, code);
      try {
        const sent = await sendSms(
          smsNumber,
          `Your SAYO password reset code is ${code}. It expires in 10 minutes.`,
        );
        if (sent.success) return NextResponse.json({ success: true, sentTo: "phone" });
        console.error(`[send-otp] SMS rejected: ${sent.error ?? "unknown"}`);
      } catch (err) {
        console.error(`[send-otp] SMS failed: ${errMsg(err)}`);
      }
    }

    /* Fallback for an account with an address but no usable number. */
    if (mailAddress && mailConfigured()) {
      if (!smsNumber || !smsConfigured()) {
        console.error(
          `[send-otp] SMS is not configured (${smsMissingEnv().join(", ")} are empty) — mailing instead`,
        );
      }
      await saveCustomerOtp(otpKey, code);
      try {
        await sendMail({
          to: mailAddress,
          subject: "Your SAYO password reset code",
          text: `Your SAYO password reset code is ${code}. It expires in 10 minutes.`,
          html: codeMailHtml(
            "SAYO Beauty",
            `Hi ${salutation}, your password reset code is:`,
            code,
            "This code expires in <strong>10 minutes</strong>.",
          ),
        });
      } catch (err) {
        console.error(`[send-otp] mail failed: ${errMsg(err)}`);
        return NextResponse.json(
          { error: "The reset code could not be sent. Please try again in a moment." },
          { status: 503 },
        );
      }
      return NextResponse.json({ success: true, sentTo: "email" });
    }

    console.error(
      `[send-otp] no channel available — SMS (${smsMissingEnv().join(", ") || "ok"}) / mail (${mailMissingEnv().join(", ") || "ok"})`,
    );
    return NextResponse.json(
      {
        error: smsConfigured() || mailConfigured()
          ? "The reset code could not be sent to this account. Please call the salon."
          : "Messaging is not set up on this server, so the reset code cannot be sent. Please call the salon.",
      },
      { status: 503 },
    );
  } catch (err) {
    console.error("[send-otp POST]", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
