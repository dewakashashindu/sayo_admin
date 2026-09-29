// src/app/api/auth/reset-password/route.ts
// POST { username, otp, password } — step 2 of the STAFF reset.
//
// 2026-09-29 fixes:
//   • rate-limited (it had no limiter of its own before) — per caller, in MySQL
//   • the new password must pass the app-wide rule (src/lib/passwordPolicy.ts);
//     the old check was "length < 3"
//   • a successful reset kills the account's existing sessions at once
//     (forgetAccountState + session version), so a stolen cookie dies here
//   • the super administrator cannot be reset through this screen
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isSuperAdminUserId } from "@/lib/superAdmin";
import { passwordProblem } from "@/lib/passwordPolicy";
import { rateLimitStrong, clearRateStrong } from "@/lib/rateLimitDb";
import { rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";
import { ensureAuthTables } from "@/lib/authTables";
import { forgetAccountState } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RESET_IP_LIMIT = 10;
const RESET_WINDOW_MS = 30 * 60 * 1000;
const MAX_OTP_TRIES = 5;

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    const byIp = await rateLimitStrong({
      bucket: "staff-reset-verify:ip",
      key: caller,
      limit: RESET_IP_LIMIT,
      windowMs: RESET_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[reset-password] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { success: false, error: rateMessage("otp_reset", byIp.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      username?: unknown; otp?: unknown; password?: unknown;
    };
    const username = String(body.username ?? "").trim();
    const otp = String(body.otp ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !otp || !password) {
      return NextResponse.json(
        { success: false, error: "Fill the login name, OTP and new password." },
        { status: 400 },
      );
    }

    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const users = await prisma.$queryRaw<{ UserId: string }[]>`
      SELECT UserId FROM tbl_userdetails WHERE LogName = ${username} LIMIT 1
    `;
    const u = users[0];
    if (!u) return NextResponse.json({ success: false, error: "Invalid login name or OTP." }, { status: 400 });
    const userId = String(u.UserId).trim().slice(0, 10);
    /* the hidden super administrator cannot be reset from here */
    if (isSuperAdminUserId(userId)) {
      return NextResponse.json({ success: false, error: "Invalid login name or OTP." }, { status: 400 });
    }

    await ensureAuthTables();
    const rows = await prisma.$queryRaw<{ OtpHash: string; ExpiresAt: Date; Attempts: number }[]>`
      SELECT OtpHash, ExpiresAt, Attempts FROM Tbl_PswReset WHERE UserId = ${userId}
    `;
    const r = rows[0];
    const fail = (message: string) =>
      NextResponse.json({ success: false, error: message }, { status: 400 });

    if (!r) return fail("No reset request found for this user — request a new OTP.");
    if (new Date(r.ExpiresAt).getTime() < Date.now()) {
      await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${userId}`;
      return fail("That OTP has expired — request a new one.");
    }
    if (Number(r.Attempts) >= MAX_OTP_TRIES) {
      await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${userId}`;
      return fail("Too many wrong OTP tries — request a new OTP.");
    }

    const match = await bcrypt.compare(otp, String(r.OtpHash));
    if (!match) {
      await prisma.$executeRaw`UPDATE Tbl_PswReset SET Attempts = Attempts + 1 WHERE UserId = ${userId}`;
      return fail("Invalid OTP — check the message and type it again.");
    }

    const newHash = await bcrypt.hash(password, 10);
    await prisma.$executeRaw`UPDATE tbl_userdetails SET PSW = ${newHash} WHERE UserId = ${userId}`;
    await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${userId}`;

    /* everything this account was signed in with is now invalid */
    forgetAccountState(userId);
    await clearRateStrong("staff-reset:user", username.toLowerCase());
    await clearRateStrong("staff-login-account", username.toLowerCase());

    console.log(`[reset-password] password changed for ${userId}`);
    return NextResponse.json({ success: true, message: "Password reset ✓ — log in with the new password." });
  } catch (e) {
    /* log the detail, answer generically — a raw Prisma message would hand out
       the database host, port and table names */
    console.error("[reset-password]", e);
    return NextResponse.json(
      { success: false, error: "The password could not be reset right now. Please try again." },
      { status: 500 },
    );
  }
}
