// src/lib/otpStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// The password-reset codes, and the rules that make them safe to hand out.
//
// WHAT CHANGED (2026-09-18 security pass)
//   · the code is now generated with crypto.randomInt, not Math.random —
//     Math.random is predictable and must never make a secret
//   · a wrong guess is COUNTED. After OTP_MAX_ATTEMPTS the code dies and a new
//     one has to be requested, so a 6-digit code cannot be walked through
//   · the code is never written to the server log any more
//   · comparing the code is constant-time, so the answer does not leak how
//     many digits were right
//   · expired records are swept away instead of living in memory for ever
//
// The pure parts (generation, comparison, the decision) are exported so
// `bash scripts/run-billing-tests.sh` can check them without a server.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

export interface OtpRecord {
  /** The 6-digit code. */
  code: string;
  /** When it stops working (epoch ms). */
  expiresAt: number;
  /** Wrong guesses so far. */
  attempts: number;
}

/** How long a code lives. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses allowed before the code is thrown away. */
export const OTP_MAX_ATTEMPTS = 5;

/** Shortest password the reset screen accepts. */
export const OTP_MIN_PASSWORD = 6;

/** The live codes, keyed by the lower-cased e-mail address. */
export const otpStore = new Map<string, OtpRecord>();

/** Remove records that have expired or been guessed to death. */
export function sweepOtps(now = Date.now()): void {
  for (const [key, record] of otpStore) {
    if (!record || now > record.expiresAt || record.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(key);
    }
  }
}

/**
 * A fresh 6-digit code. `randInt` is injectable for tests; the real one is
 * crypto.randomInt, which cannot be predicted from earlier values.
 */
export function generateOtpCode(randInt: (min: number, max: number) => number = crypto.randomInt): string {
  const value = randInt(0, 1_000_000);
  const safe = Number.isFinite(value) ? Math.abs(Math.floor(value)) % 1_000_000 : 0;
  return String(safe).padStart(6, "0");
}

/** Constant-time comparison — never `a === b` on a secret. */
export function otpEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export type OtpVerdict =
  | { ok: true; attemptsLeft: number }
  | { ok: false; reason: "missing" | "expired" | "too_many" | "wrong"; attemptsLeft: number };

/**
 * Judge a code against its record. Pure: the caller decides what to store.
 * `attempts` is the record as it was BEFORE this guess.
 */
export function evaluateOtp(
  record: OtpRecord | undefined,
  code: string,
  now = Date.now(),
): OtpVerdict {
  if (!record) return { ok: false, reason: "missing", attemptsLeft: 0 };
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many", attemptsLeft: 0 };
  }
  if (now > record.expiresAt) {
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }
  if (!otpEqual(record.code, String(code ?? "").trim())) {
    const left = Math.max(0, OTP_MAX_ATTEMPTS - (record.attempts + 1));
    return { ok: false, reason: "wrong", attemptsLeft: left };
  }
  return { ok: true, attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - record.attempts) };
}

/** What the customer is told when a guess was wrong. */
export function wrongCodeMessage(attemptsLeft: number): string {
  if (attemptsLeft <= 0) {
    return "Incorrect code. That was the last try — request a new code.";
  }
  return `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`;
}
