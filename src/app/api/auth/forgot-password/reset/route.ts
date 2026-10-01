// src/app/api/auth/forgot-password/reset/route.ts
// POST { phone, otp, newPassword } — step 2 of the CUSTOMER reset.
//
// 2026-09-29 fixes:
//   • the code is read from MySQL (Tbl_CustomerOtpReset, bcrypt-hashed) instead
//     of a server-memory Map, so a restart or a second worker cannot lose it.
//   • the new password must pass the app-wide rule (src/lib/passwordPolicy.ts) —
//     it used to be "at least 6 characters" here and "3" on the staff side.
//   • rate limit counters live in MySQL and are cleared on success.
//
// 2026-10-01: the account is found by its PHONE number, and the code is keyed
//   on the canonical number so it matches what /send-otp stored.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyCustomerOtp, deleteCustomerOtp, CUSTOMER_OTP_MAX_ATTEMPTS } from "@/lib/customerOtp";
import { rateLimitStrong, clearRateStrong } from "@/lib/rateLimitDb";
import { rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";
import { passwordProblem } from "@/lib/passwordPolicy";
import {
  canonicalPhone,
  findCustomerByPhone,
  isUsablePhone,
  phoneForLog,
} from "@/lib/customerIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const OTP_RESET_IP_LIMIT = 10;            // per caller, per 30 minutes
const OTP_RESET_IP_WINDOW_MS = 30 * 60 * 1000;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    const byIp = await rateLimitStrong({
      bucket: "otp-reset:ip",
      key: caller,
      limit: OTP_RESET_IP_LIMIT,
      windowMs: OTP_RESET_IP_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[reset] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { error: rateMessage("otp_reset", byIp.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } },
      );
    }

    const { phone, email, otp, newPassword } = (await req.json().catch(() => ({}))) as {
      phone?: string;
      email?: string;
      otp?: string;
      newPassword?: string;
    };

    const phoneRaw = (phone ?? "").trim();
    const emailRaw = (email ?? "").trim();

    if (!phoneRaw && !emailRaw)
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    if (phoneRaw && !isUsablePhone(phoneRaw))
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    if (!otp || otp.trim().length !== 6)
      return NextResponse.json({ error: "A 6-digit OTP is required." }, { status: 400 });

    const problem = passwordProblem(String(newPassword ?? ""), "customer");
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    /* the SAME key /send-otp stored the code under */
    const otpKey = phoneRaw ? canonicalPhone(phoneRaw) : emailRaw.toLowerCase().slice(0, 200);
    const verdict = await verifyCustomerOtp(otpKey, otp);

    if (!verdict.ok) {
      const message =
        verdict.reason === "missing"
          ? "No reset code found. Please request a new one."
          : verdict.reason === "expired" || verdict.reason === "too_many"
            ? "Reset code has expired. Please request a new one."
            : `Incorrect code. ${verdict.attemptsLeft} attempt${verdict.attemptsLeft === 1 ? "" : "s"} left.`;
      if (verdict.reason === "wrong" && verdict.attemptsLeft === 0) {
        console.warn(`[reset] code burned after ${CUSTOMER_OTP_MAX_ATTEMPTS} wrong tries`);
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const hashedPSW = await bcrypt.hash(String(newPassword), 12);
    try {
      const user = phoneRaw
        ? await findCustomerByPhone(phoneRaw)
        : await prisma.tbl_CustomerMaster.findFirst({
            where: { CusEmail: emailRaw.toLowerCase() },
            select: { CusCode: true },
          });

      if (!user) {
        await deleteCustomerOtp(otpKey);
        return NextResponse.json({ error: "This reset is no longer valid. Please start again." }, { status: 400 });
      }
      await prisma.tbl_CustomerMaster.update({
        where: { CusCode: user.CusCode },
        data: { PSW: hashedPSW },
      });
    } catch (err) {
      console.error(`[reset] update error: ${errMsg(err)}`);
      return NextResponse.json({ error: "Password reset failed." }, { status: 500 });
    }

    await deleteCustomerOtp(otpKey);
    /* the send-otp counter used to live under "otp-send:email" */
    await clearRateStrong("otp-send:account", otpKey);
    await clearRateStrong("otp-send:email", otpKey);
    await clearRateStrong("customer-login:account", otpKey);
    console.log(`[reset] password updated for ${phoneRaw ? phoneForLog(phoneRaw) : otpKey}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset POST]", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
