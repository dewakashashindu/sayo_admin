// src/lib/adminOtp.ts
// ─────────────────────────────────────────────────────────────────────────────
// Second factor for the hidden super administrator.
//
//   1. POST /api/auth/admin-login        username + password  → NO cookie yet.
//      The password is right, the account is the super admin, so instead of a
//      session the server makes a 6-digit code and sends it to the phone
//      (Text.lk) and the e-mail (SMTP) stored in tbl_userdetails, and answers
//      with `{ otpRequired: true, challenge }`.
//   2. POST /api/auth/admin-login/verify-otp   challenge + code → session cookie.
//
// The challenge is an HMAC-signed, 10-minute token. It is signed with a key
// DERIVED from AUTH_SECRET and NOT with AUTH_SECRET itself, plus it carries
// `typ: "admin-login-otp"`, so a challenge can never be replayed as a session
// cookie (that is the trap to avoid in this codebase — src/lib/adminSession.ts
// accepts any token whose payload has uid + log + exp).
//
// Codes live in Tbl_AdminLoginOtp: bcrypt-hashed, 5-minute life, 5 tries, one
// live code per user (asking again replaces the previous one).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ensureAuthTables } from "@/lib/authTables";
import { sendSms, normalizePhoneSriLanka, maskPhoneForUser } from "@/lib/sms";
import { readPhone, readEmail } from "@/lib/secureContact";
import type { AdminSessionPayload } from "@/lib/adminSession";

export const ADMIN_OTP_TTL_MS = 5 * 60 * 1000;   // the code itself
export const ADMIN_OTP_MAX_ATTEMPTS = 5;         // wrong guesses per code
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;  // password step → OTP step
const CHALLENGE_TYP = "admin-login-otp";

export type AdminOtpChannel = "sms" | "email";

export interface AdminOtpDelivery {
  smsSent: boolean;
  emailSent: boolean;
  smsError?: string;
  emailError?: string;
}

/* ── base64url helpers (no Buffer, so this also runs on the edge runtime) ─── */
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array | null {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * The signing key for challenges. A DIFFERENT secret from the session cookie:
 * `AUTH_SECRET` + a fixed suffix, so a challenge token can never verify as a
 * session token (and vice versa) even though both use the same algorithm.
 */
function challengeSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.trim().length < 16) return null;
  return new TextEncoder().encode(`admin-login-otp|${s}`);
}

async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secret as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface OtpChallenge {
  uid: string;
  log: string;
  name: string;
  exp: number;
  typ: typeof CHALLENGE_TYP;
}

/** Sign a challenge for the account whose password was just accepted. */
export async function createOtpChallenge(
  account: Pick<AdminSessionPayload, "uid" | "log" | "name">,
): Promise<string | null> {
  const secret = challengeSecret();
  if (!secret) return null;

  const payload: OtpChallenge = {
    uid: account.uid,
    log: account.log,
    name: account.name,
    exp: Date.now() + CHALLENGE_TTL_MS,
    typ: CHALLENGE_TYP,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body) as unknown as BufferSource,
  );
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verify signature, expiry and type. Returns the account or null. */
export async function verifyOtpChallenge(token?: string | null): Promise<OtpChallenge | null> {
  if (!token) return null;
  const secret = challengeSecret();
  if (!secret) return null;

  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const sigBytes = b64urlDecode(sig);
  if (!sigBytes) return null;

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as unknown as BufferSource,
    new TextEncoder().encode(body) as unknown as BufferSource,
  );
  if (!ok) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)!)) as OtpChallenge;
    if (payload.typ !== CHALLENGE_TYP) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!payload.uid || !payload.log) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── the code itself ─────────────────────────────────────────────────────── */

/** Six digits from crypto.randomInt — never Math.random. */
export function generateAdminOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** The table is created once per process (src/lib/authTables.ts). */
export async function ensureAdminOtpTable(): Promise<void> {
  await ensureAuthTables();
}

/** 0771096131 → 94 7 7 1 0 9 6 1 3 1 (Text.lk wants 947XXXXXXXX) */
export function smsReadyPhone(phone: string): string {
  return normalizePhoneSriLanka(String(phone ?? "").trim());
}

/** "dewakashashindu@gmail.com" → "dewak***@gmail.com" — enough to recognise. */
export function maskEmailForUser(email: string): string {
  const value = String(email ?? "").trim();
  const [local, domain] = value.split("@");
  if (!domain || !local) return value ? "the saved e-mail address" : "";
  const keep = local.length <= 4 ? 1 : Math.min(6, Math.floor(local.length / 2));
  return `${local.slice(0, keep)}${"*".repeat(Math.max(2, local.length - keep))}@${domain}`;
}

/**
 * Send the code to both channels. One failing channel is not fatal: the
 * caller only refuses the login when BOTH failed.
 */
export async function sendAdminOtpTo(phone: string, email: string, code: string): Promise<AdminOtpDelivery> {
  const out: AdminOtpDelivery = { smsSent: false, emailSent: false };

  const smsTo = smsReadyPhone(phone);
  if (smsTo) {
    try {
      const res = await sendSms(smsTo, `SAYO Admin sign-in code: ${code}. Valid for 5 minutes. Never share it.`);
      out.smsSent = res.success;
      if (!res.success) out.smsError = res.error;
    } catch (e) {
      out.smsError = e instanceof Error ? e.message : "SMS failed";
    }
  } else {
    out.smsError = "No phone number saved for this account.";
  }

  const mailTo = String(email ?? "").trim();
  if (mailTo && mailTo.includes("@")) {
    try {
      await sendAdminOtpEmail(mailTo, code);
      out.emailSent = true;
    } catch (e) {
      out.emailError = e instanceof Error ? e.message : "E-mail failed";
    }
  } else {
    out.emailError = "No e-mail address saved for this account.";
  }

  return out;
}

async function sendAdminOtpEmail(to: string, code: string): Promise<void> {
  if (!process.env.SMTP_HOST) {
    throw new Error("SMTP_HOST is empty in .env, so the code was not mailed.");
  }
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
    subject: "Your SAYO Admin sign-in code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#B8860B">SAYO Beauty — Admin</h2>
        <p>A sign-in was attempted with the super administrator account. Your code is:</p>
        <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.4em;
                    color:#B8860B;text-align:center;padding:1.5rem 0">${code}</div>
        <p style="color:#666;font-size:0.85rem">
          It expires in <strong>5 minutes</strong>. If this was not you, change the password now.
        </p>
      </div>
    `,
  });
}

/**
 * Make a fresh code for one user and send it. The previous code is replaced —
 * only the newest code ever works.
 */
export async function createAndSendAdminOtp(
  userId: string,
  phone: string,
  email: string,
): Promise<AdminOtpDelivery & { phoneMasked: string; emailMasked: string }> {
  const id = String(userId ?? "").trim().slice(0, 10);
  const code = generateAdminOtp();

  await ensureAdminOtpTable();
  const hash = await bcrypt.hash(code, 8); // short-lived secret, 8 rounds is plenty
  await prisma.$executeRaw`DELETE FROM Tbl_AdminLoginOtp WHERE UserId = ${id}`;
  /* The interval is a literal on purpose: MySQL does not take a placeholder
     inside INTERVAL, and the rest of the app already reads DATETIME columns
     against UTC_TIMESTAMP() exactly like this. Keep in step with
     ADMIN_OTP_TTL_MS above. */
  await prisma.$executeRaw`
    INSERT INTO Tbl_AdminLoginOtp (UserId, OtpHash, ExpiresAt, Attempts)
    VALUES (${id}, ${hash}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), 0)
  `;

  const delivery = await sendAdminOtpTo(phone, email, code);

  return {
    ...delivery,
    phoneMasked: phone ? maskPhoneForUser(phone) : "",
    emailMasked: maskEmailForUser(email),
  };
}

export type AdminOtpVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "too_many" | "wrong"; attemptsLeft: number };

/** Judge a typed code. A correct code is burned immediately. */
export async function verifyAdminOtp(userId: string, code: string): Promise<AdminOtpVerdict> {
  const id = String(userId ?? "").trim().slice(0, 10);
  const typed = String(code ?? "").trim();
  if (!/^\d{6}$/.test(typed)) {
    return { ok: false, reason: "wrong", attemptsLeft: ADMIN_OTP_MAX_ATTEMPTS - 1 };
  }

  await ensureAdminOtpTable();
  const rows = await prisma.$queryRaw<{ OtpHash: string; ExpiresAt: Date; Attempts: number }[]>`
    SELECT OtpHash, ExpiresAt, Attempts FROM Tbl_AdminLoginOtp WHERE UserId = ${id}
  `;
  const row = rows[0];
  if (!row) return { ok: false, reason: "missing", attemptsLeft: 0 };

  if (Number(row.Attempts) >= ADMIN_OTP_MAX_ATTEMPTS) {
    await prisma.$executeRaw`DELETE FROM Tbl_AdminLoginOtp WHERE UserId = ${id}`;
    return { ok: false, reason: "too_many", attemptsLeft: 0 };
  }
  if (new Date(row.ExpiresAt).getTime() < Date.now()) {
    await prisma.$executeRaw`DELETE FROM Tbl_AdminLoginOtp WHERE UserId = ${id}`;
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }

  const match = await bcrypt.compare(typed, String(row.OtpHash));
  if (!match) {
    await prisma.$executeRaw`UPDATE Tbl_AdminLoginOtp SET Attempts = Attempts + 1 WHERE UserId = ${id}`;
    return {
      ok: false,
      reason: "wrong",
      attemptsLeft: Math.max(0, ADMIN_OTP_MAX_ATTEMPTS - (Number(row.Attempts) + 1)),
    };
  }

  await prisma.$executeRaw`DELETE FROM Tbl_AdminLoginOtp WHERE UserId = ${id}`;
  return { ok: true };
}

/** The phone + e-mail to send to, read (and decrypted) from the user's row. */
export function otpDestinationsFromRow(row: { ContNo?: string | null; Email?: string | null }): {
  phone: string;
  email: string;
} {
  return { phone: readPhone(row.ContNo), email: readEmail(row.Email) };
}

/** The sentence shown under the code box after a delivery attempt. */
export function otpSentMessage(d: AdminOtpDelivery, phoneMasked: string, emailMasked: string): string {
  const where: string[] = [];
  if (d.smsSent && phoneMasked) where.push(`SMS to ${phoneMasked}`);
  if (d.emailSent && emailMasked) where.push(`e-mail to ${emailMasked}`);
  if (where.length === 0) return "Could not send the code.";
  return `Code sent by ${where.join(" and ")}. It expires in 5 minutes.`;
}
