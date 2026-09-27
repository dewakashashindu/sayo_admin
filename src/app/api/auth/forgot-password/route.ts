// src/app/api/auth/forgot-password/route.ts
// POST { username } — step 1 of the self-service reset:
// finds the user by LogName, makes a 6-digit OTP (bcrypt-hashed at rest),
// expires in 10 minutes, sends it to the user's ContNo (SMS gateway or log).
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneSriLanka, maskPhoneForUser, sendOtpSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW = 10 * 60 * 1000;
const LIMIT = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();
function throttled(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (b && b.resetAt > now) {
    if (b.count >= LIMIT) return Math.ceil((b.resetAt - now) / 1000);
    b.count += 1;
    return 0;
  }
  buckets.set(key, { count: 1, resetAt: now + WINDOW });
  return 0;
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Tbl_PswReset (
      UserId    CHAR(10)     NOT NULL PRIMARY KEY,
      OtpHash   VARCHAR(100) NOT NULL,
      ExpiresAt DATETIME     NOT NULL,
      Attempts  TINYINT      NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: unknown };
    const username = String(body.username ?? "").trim();
    if (!username) {
      return NextResponse.json({ success: false, error: "Type your login name first." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const wait = throttled(`fp:${ip}`);
    if (wait > 0) {
      return NextResponse.json(
        { success: false, error: `Too many requests. Try again in ${Math.ceil(wait / 60)} minute(s).` },
        { status: 429 },
      );
    }

    const user = await prisma.$queryRaw<{ UserId: string; ContNo: string | null; Enable: boolean | number }[]>`
      SELECT UserId, ContNo, Enable FROM tbl_userdetails WHERE LogName = ${username}
    `;
    const u = user[0];

    // Same surface message for known/unknown users — account probing off
    const generic = "If that login name is registered, an OTP has gone out to its contact number.";
    if (!u || Number(u.Enable) !== 1) return NextResponse.json({ success: true, message: generic });

    const phone = normalizePhoneSriLanka((u.ContNo ?? "").trim());
    if (!phone) {
      return NextResponse.json({
        success: false,
        error: "This user has no contact number saved — ask your administrator to reset the password.",
      }, { status: 400 });
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await ensureTable();
    const hash = await bcrypt.hash(otp, 8);
    await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${String(u.UserId).trim().slice(0, 10)}`;
    await prisma.$executeRaw`
      INSERT INTO Tbl_PswReset (UserId, OtpHash, ExpiresAt, Attempts)
      VALUES (${String(u.UserId).trim().slice(0, 10)}, ${hash}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), 0)
    `;
    await sendOtpSms(phone, `Your SAYO password reset OTP is ${otp}. It expires in 10 minutes.`);

    return NextResponse.json({ success: true, message: generic, phoneMasked: maskPhoneForUser(phone) });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Could not send the OTP" },
      { status: 500 },
    );
  }
}
