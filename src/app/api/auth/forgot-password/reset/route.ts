import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  otpStore,
  evaluateOtp,
  wrongCodeMessage,
  OTP_MAX_ATTEMPTS,
  OTP_MIN_PASSWORD,
  sweepOtps,
} from "@/lib/otpStore";
import { rateLimit, rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";

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
    const byIp = rateLimit({
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

    const { email, otp, newPassword } = (await req.json()) as {
      email?: string;
      otp?: string;
      newPassword?: string;
    };

    if (!email?.trim())
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (!otp || otp.trim().length !== 6)
      return NextResponse.json({ error: "A 6-digit OTP is required." }, { status: 400 });
    if (!newPassword || newPassword.length < OTP_MIN_PASSWORD)
      return NextResponse.json(
        { error: `Password must be at least ${OTP_MIN_PASSWORD} characters.` },
        { status: 400 },
      );

    const emailNorm = email.trim().toLowerCase();
    sweepOtps();

        const stored = otpStore.get(emailNorm);
    const verdict = evaluateOtp(stored, otp);

    if (!verdict.ok) {
      if (verdict.reason === "wrong" && stored) {
        stored.attempts += 1;
        if (stored.attempts >= OTP_MAX_ATTEMPTS) {
          otpStore.delete(emailNorm);   // burned — a new code has to be requested
          console.warn(`[reset] code burned after ${OTP_MAX_ATTEMPTS} wrong tries`);
        }
      } else if (verdict.reason === "expired" || verdict.reason === "too_many") {
        otpStore.delete(emailNorm);
      }

      const message =
        verdict.reason === "missing"
          ? "No reset code found. Please request a new one."
          : verdict.reason === "expired" || verdict.reason === "too_many"
            ? "Reset code has expired. Please request a new one."
            : wrongCodeMessage(verdict.attemptsLeft);

      return NextResponse.json({ error: message }, { status: 400 });
    }

        const hashedPSW = await bcrypt.hash(newPassword, 12);

        try {
      const user = await prisma.tbl_CustomerMaster.findFirst({
        where: { CusEmail: emailNorm },
        select: { CusCode: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: "No account found with this email address." },
          { status: 404 },
        );
      }

      await prisma.tbl_CustomerMaster.update({
        where: { CusCode: user.CusCode },
        data: { PSW: hashedPSW },
      });
    } catch (err) {
      console.error("[reset] update error:", errMsg(err));
      return NextResponse.json({ error: "Password reset failed." }, { status: 500 });
    }

        otpStore.delete(emailNorm);
    console.log(`[reset] password updated for ${emailNorm}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset POST]", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
