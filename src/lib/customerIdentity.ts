// src/lib/customerIdentity.ts
// ─────────────────────────────────────────────────────────────────────────────
// A booking account is identified by its PHONE number, not by its e-mail.
//
// The e-mail is optional now (many customers have none), and it was never a
// reliable key: tbl_customermaster.RegTel is Char(15) and has never been
// normalised — the POS writes "0771234455", the public form writes
// "+94 77 123 4455", and a hand-typed row can hold " 771234455 ". An equality
// test therefore misses rows that are the same number, which is exactly how
// two accounts end up sharing one mobile. Every lookup here compares the
// DIGITS only and accepts each of the spellings a row may already hold.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Digits only — "+94 77 123 4455" → "94771234445". */
export function phoneDigits(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** The number without its country code: 0771234455 / +94 77 … → 771234455. */
export function localPhoneDigits(raw: unknown): string {
  const digits = phoneDigits(raw);
  if (digits.length > 9 && digits.startsWith('94')) return digits.slice(2);
  if (digits.length > 9 && digits.startsWith('0'))  return digits.slice(1);
  return digits;
}

/** The one canonical form used for OTP keys, rate-limit keys and logs. */
export function canonicalPhone(raw: unknown): string {
  const local = localPhoneDigits(raw);
  return local ? `94${local}` : '';
}

/** Rejects anything that cannot be dialled back. */
export function isUsablePhone(raw: unknown): boolean {
  const digits = phoneDigits(raw);
  return digits.length >= 9 && digits.length <= 15;
}

/** Every spelling of one number that may already sit in RegTel. */
export function phoneLookupKeys(raw: unknown): string[] {
  const local = localPhoneDigits(raw);
  if (!local) return [];
  return Array.from(new Set([`94${local}`, `0${local}`, local]));
}

export interface CustomerIdentityRow {
  CusCode:  string;
  CusName:  string;
  CusEmail: string;
  RegTel:   string;
  PSW:      string;
  Gender:   string | null;
}

/* Same separator strip the appointment form already uses for RegTel, so a
   number typed into either screen matches the other. */
export const DIGIT_STRIPPED_TEL = Prisma.sql`
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(RTRIM(RegTel), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '')
`;

/**
 * `… WHERE <digits-only RegTel> IN (…)` — reusable inside a larger statement
 * (e.g. the booking writer's FOR UPDATE lock, which has to match the same rows
 * this helper finds outside a transaction).
 */
export function customerPhoneMatchSql(phone: unknown): Prisma.Sql | null {
  const keys = phoneLookupKeys(phone);
  if (keys.length === 0) return null;
  return Prisma.sql`${DIGIT_STRIPPED_TEL} IN (${Prisma.join(keys)})`;
}

/**
 * The customer who owns this number, whatever shape it was saved in.
 * Returns null when the number is unknown or unusable.
 */
export async function findCustomerByPhone(phone: unknown): Promise<CustomerIdentityRow | null> {
  const keys = phoneLookupKeys(phone);
  if (keys.length === 0) return null;

  const rows = await prisma.$queryRaw<CustomerIdentityRow[]>(Prisma.sql`
    SELECT
      RTRIM(CusCode)  AS CusCode,
      RTRIM(CusName)  AS CusName,
      RTRIM(CusEmail) AS CusEmail,
      RTRIM(RegTel)   AS RegTel,
      PSW              AS PSW,
      Gender           AS Gender
    FROM tbl_customermaster
    WHERE ${DIGIT_STRIPPED_TEL} IN (${Prisma.join(keys)})
    ORDER BY CusCode
    LIMIT 1
  `);

  return rows[0] ?? null;
}

/** Real e-mail, or '' when the column is blank / a placeholder space. */
export function usableCustomerEmail(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s || !s.includes("@")) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s.toLowerCase();
}

/** A short, non-reversible form for logs — never a full number. */
export function phoneForLog(raw: unknown): string {
  const local = localPhoneDigits(raw);
  if (local.length < 4) return '***';
  return `***${local.slice(-4)}`;
}
