// src/lib/secureContact.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reversible encryption for the super administrator's contact details.
//
// Why: the row in tbl_userdetails must stay the only place the account lives,
// and the phone number + e-mail must not be readable if somebody opens
// phpMyAdmin, a database backup or a support dump. Those two values are the
// ones the login OTP needs, so they are the two values we must be able to
// decrypt again at sign-in time.
//
//  · AES-256-GCM (authenticated: a changed byte fails instead of decoding to
//    rubbish), key derived with SHA-256 from SUPER_ADMIN_CONTACT_KEY.
//  · Stored as  v1:<base64url(iv | authTag | ciphertext)>  in the existing
//    ContNo / Email columns. A value that does NOT start with "v1:" is treated
//    as plain text, so every other user row keeps working untouched.
//  · tbl_userdetails.ContNo is VARCHAR(100) and Email is VARCHAR(100): a phone
//    (10 digits) becomes ~63 characters and an e-mail of ~30 characters
//    becomes ~80, so both fit. Run the optional ALTER in
//    scripts/create-superadmin.sql if you ever need a longer address.
//
// The password is NOT encrypted — it stays a bcrypt hash (one-way), exactly
// what /api/auth/admin-login compares against.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "node:crypto";

const PREFIX = "v1:";
const CONTEXT = "sayo-superadmin-contact-v1";

/** 32-byte AES key, derived from the .env secret. Null when nothing is set. */
function getKey(): Buffer | null {
  const secret = (process.env.SUPER_ADMIN_CONTACT_KEY?.trim() || process.env.AUTH_SECRET?.trim() || "");
  if (secret.length < 16) return null;
  return crypto.createHash("sha256").update(`${secret}|${CONTEXT}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(text: string): Buffer {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
}

/** Is this stored value ciphertext written by this module? */
export function isEncryptedContact(value?: string | null): boolean {
  return String(value ?? "").trim().startsWith(PREFIX);
}

/**
 * Encrypt one value for storage. Throws when no key is configured — writing
 * the contact in clear by accident is worse than a loud failure.
 */
export function encryptContact(plain: string): string {
  const value = String(plain ?? "").trim();
  if (!value) return value;
  const key = getKey();
  if (!key) {
    throw new Error(
      "SUPER_ADMIN_CONTACT_KEY is not set (add it to .env — at least 16 characters).",
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + b64url(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

/**
 * Decrypt a stored value. Plain (legacy) values are returned unchanged, and a
 * value that cannot be read is returned as "" — callers then behave exactly as
 * they would for a user with no phone / no e-mail.
 */
export function decryptContact(stored?: string | null): string {
  const value = String(stored ?? "").trim();
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value; // not ours → plain text row

  const key = getKey();
  if (!key) {
    console.error("[secureContact] cannot decrypt: SUPER_ADMIN_CONTACT_KEY / AUTH_SECRET is missing.");
    return "";
  }
  try {
    const raw = unb64url(value.slice(PREFIX.length));
    if (raw.length < 29) return "";
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8").trim();
  } catch {
    console.error("[secureContact] a stored contact value did not decrypt (wrong key?).");
    return "";
  }
}

/** The phone number of a stored ContNo — decrypted when it needs to be. */
export function readPhone(stored?: string | null): string {
  return decryptContact(stored);
}

/** The e-mail of a stored Email — decrypted when it needs to be. */
export function readEmail(stored?: string | null): string {
  return decryptContact(stored);
}

/* CLI helper:  node -e "require('ts-node')…"  — easier: scripts/create-superadmin.mjs */
