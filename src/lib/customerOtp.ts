// src/lib/customerOtp.ts
// ─────────────────────────────────────────────────────────────────────────────
// The booking customer's password-reset codes, stored in MySQL instead of a Map.
//
// Before: src/lib/otpStore.ts kept live codes in server memory. Two problems —
// an app-pool recycle / deploy silently destroyed a code somebody was holding
// (the screen then said "no reset code found"), and a second worker in front
// of the same site saw a different map, so the code could be sent by one and
// rejected by the other.
//
// Now: Tbl_CustomerOtpReset, one row per e-mail address, the code BCrypt-hashed
// (the old Tbl_OtpStore table kept the 6 digits in clear text — anybody reading
// the database could reset anybody's password), 10-minute life, 5 tries.
//
// src/lib/otpStore.ts (the old in-memory Map + its helpers) is gone: nothing
// imports it any more, and leaving it in the tree invited somebody to use it
// again for the next flow that needs a short-lived code.
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureAuthTables } from "@/lib/authTables";

export const CUSTOMER_OTP_TTL_MS = 10 * 60 * 1000;
export const CUSTOMER_OTP_MAX_ATTEMPTS = 5;

/** Six digits from crypto.randomInt — never Math.random. */
export function newCustomerOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

const normalise = (email: string) => String(email ?? "").trim().toLowerCase().slice(0, 200);

/** Replace any previous code for this address with a fresh one. */
export async function saveCustomerOtp(email: string, code: string): Promise<void> {
  const key = normalise(email);
  await ensureAuthTables();
  const hash = await bcrypt.hash(code, 8); // short-lived secret — 8 rounds is plenty
  await prisma.$executeRaw`DELETE FROM Tbl_CustomerOtpReset WHERE Email = ${key}`;
  await prisma.$executeRaw`
    INSERT INTO Tbl_CustomerOtpReset (Email, OtpHash, ExpiresAt, Attempts)
    VALUES (${key}, ${hash}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), 0)
  `;
}

export async function deleteCustomerOtp(email: string): Promise<void> {
  await ensureAuthTables();
  await prisma.$executeRaw`DELETE FROM Tbl_CustomerOtpReset WHERE Email = ${normalise(email)}`;
}

async function bumpAttempts(email: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE Tbl_CustomerOtpReset SET Attempts = Attempts + 1 WHERE Email = ${normalise(email)}
  `;
}

export type CustomerOtpVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "too_many" | "wrong"; attemptsLeft: number };

/** Judge a typed code. A correct code is burned immediately. */
export async function verifyCustomerOtp(email: string, typed: string): Promise<CustomerOtpVerdict> {
  const key = normalise(email);
  const code = String(typed ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, reason: "wrong", attemptsLeft: CUSTOMER_OTP_MAX_ATTEMPTS - 1 };
  }

  await ensureAuthTables();
  const rows = await prisma.$queryRaw<{ OtpHash: string; ExpiresAt: Date; Attempts: number }[]>`
    SELECT OtpHash, ExpiresAt, Attempts FROM Tbl_CustomerOtpReset WHERE Email = ${key}
  `;
  const row = rows[0];
  if (!row) return { ok: false, reason: "missing", attemptsLeft: 0 };

  if (Number(row.Attempts) >= CUSTOMER_OTP_MAX_ATTEMPTS) {
    await deleteCustomerOtp(key);
    return { ok: false, reason: "too_many", attemptsLeft: 0 };
  }
  if (new Date(row.ExpiresAt).getTime() < Date.now()) {
    await deleteCustomerOtp(key);
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }

  const match = await bcrypt.compare(code, String(row.OtpHash));
  if (!match) {
    await bumpAttempts(key);
    return {
      ok: false,
      reason: "wrong",
      attemptsLeft: Math.max(0, CUSTOMER_OTP_MAX_ATTEMPTS - (Number(row.Attempts) + 1)),
    };
  }

  await deleteCustomerOtp(key);
  return { ok: true };
}
