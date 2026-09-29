// src/app/api/auth/reset-password/route.ts
// POST { username, otp, password } — step 2:
// checks the OTP (<= 5 tries, 10-minute life), then bcrypts the new password
// into tbl_userdetails.PSW and burns the reset row.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isSuperAdminUserId } from "@/lib/superAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: unknown; otp?: unknown; password?: unknown };
    const username = String(body.username ?? "").trim();
    const otp = String(body.otp ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !otp || !password) {
      return NextResponse.json({ success: false, error: "Fill the login name, OTP and new password." }, { status: 400 });
    }
    if (password.length < 3) {
      return NextResponse.json({ success: false, error: "Password is too short." }, { status: 400 });
    }

    const users = await prisma.$queryRaw<{ UserId: string }[]>`
      SELECT UserId FROM tbl_userdetails WHERE LogName = ${username}
    `;
    const u = users[0];
    if (!u) return NextResponse.json({ success: false, error: "Invalid login name or OTP." }, { status: 400 });
    const userId = String(u.UserId).trim().slice(0, 10);
    /* the hidden super administrator cannot be reset from here */
    if (isSuperAdminUserId(userId)) {
      return NextResponse.json({ success: false, error: "Invalid login name or OTP." }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<{ OtpHash: string; ExpiresAt: Date; Attempts: number }[]>`
      SELECT OtpHash, ExpiresAt, Attempts FROM Tbl_PswReset WHERE UserId = ${userId}
    `;
    const r = rows[0];
    const fail = (message: string) => NextResponse.json({ success: false, error: message }, { status: 400 });
    if (!r) return fail("No reset request found for this user — request a new OTP.");
    if (new Date(r.ExpiresAt).getTime() < Date.now()) {
      await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${userId}`;
      return fail("That OTP has expired — request a new one.");
    }
    if (Number(r.Attempts) >= 5) {
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
    return NextResponse.json({ success: true, message: "Password reset ✓ — log in with the new password." });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Could not reset the password" },
      { status: 500 },
    );
  }
}
