// src/lib/poEmail.ts
// ─────────────────────────────────────────────────────────────────────────────
// EMAILING A PURCHASE ORDER — the rules, kept out of the route and the screen so
// they can be tested on their own (section 12 of scripts/billing-tests.js).
//
// The printed sheet becomes a PDF and goes to the supplier the order is
// addressed to. Everything that is a *decision* lives here:
//
//   supplierEmails()      which address(es) are really on the supplier row
//                         (tbl_suppliermaster.Emails may hold one address, or
//                         several separated by ; or , — and may hold junk)
//   poPdfFileName()       the name of the attachment
//   poEmailSubject()      the subject line
//   poEmailBody()         the covering note
//   smtpMissingEnv()      which SMTP_* settings are not filled in yet
//   smtpSetupMessage()    what to tell the operator when they are not
//
// SMTP credentials are NOT here: they are read from the environment
// (SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM), the
// same variables the rest of this project already mails with.
// ─────────────────────────────────────────────────────────────────────────────
import type { PoPrintCopy } from "./poPrint";

/* ── the supplier's address ──────────────────────────────────────────────── */

/**
 * The e-mail addresses really on a supplier row.
 *
 * `Emails` is a free-text column from the old desktop system: it can hold one
 * address, several separated by `;` or `,` (or a space), and often holds a
 * telephone number or nothing at all. Anything that is not shaped like an
 * address is dropped instead of being handed to the mail server.
 */
export function supplierEmails(value: unknown): string[] {
  const raw = String(value ?? "");
  return Array.from(
    new Set(
      raw
        .split(/[;,\s]+/)
        .map((part) => part.trim().replace(/^[<("']+|[>)"']+$/g, ""))
        .filter((part) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(part)),
    ),
  );
}

/** The one address a purchase order is sent to (the first valid one). */
export function primarySupplierEmail(value: unknown): string {
  return supplierEmails(value)[0] ?? "";
}

/** Everything that is not a usable address, so the screen can say so. */
export function invalidSupplierEmailParts(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[;,]+/)
    .map((part) => part.trim())
    .filter((part) => part && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(part));
}

/* ── the message ─────────────────────────────────────────────────────────── */

export interface PoEmailContext {
  poNo: string;
  /** the salon's own name, as printed on the sheet */
  companyName: string;
  supplierName: string;
  /** already printed the legacy way: 16-Sep-2026 */
  poDate: string;
  dueDate: string;
  lineCount: number;
  copy: PoPrintCopy;
}

/** The attachment name: PO0000004.pdf */
export function poPdfFileName(poNo: string): string {
  const clean = String(poNo ?? "").trim().replace(/[^\w-]+/g, "");
  return `${clean || "purchase-order"}.pdf`;
}

export function poEmailSubject(ctx: Pick<PoEmailContext, "poNo" | "companyName">): string {
  const company = String(ctx.companyName ?? "").trim();
  const poNo = String(ctx.poNo ?? "").trim();
  return company ? `Purchase Order ${poNo} — ${company}` : `Purchase Order ${poNo}`;
}

/**
 * The covering note. Short and factual; the PDF carries the order itself.
 * Plain text on purpose — it goes into any mail client, on any phone.
 */
export function poEmailBody(ctx: PoEmailContext): string {
  const lines: string[] = [];
  lines.push(`Dear ${String(ctx.supplierName ?? "").trim() || "Sir/Madam"},`);
  lines.push("");
  lines.push(
    `Please find our purchase order ${String(ctx.poNo ?? "").trim()} attached as a PDF ` +
      `(${poPdfFileName(ctx.poNo)}).`,
  );
  const dates: string[] = [];
  if (ctx.poDate) dates.push(`Order date: ${ctx.poDate}`);
  if (ctx.dueDate) dates.push(`Required by: ${ctx.dueDate}`);
  if (dates.length) lines.push(dates.join("   ·   "));
  lines.push(`${ctx.lineCount} item line(s) on the order.`);
  lines.push("");
  lines.push("Please confirm the order and the delivery date by reply.");
  lines.push("");
  const company = String(ctx.companyName ?? "").trim();
  lines.push(company || "Thank you,");
  return lines.join("\n");
}

/* ── the mail server ─────────────────────────────────────────────────────── */

/** The environment variables this feature needs, in the order they matter. */
export const SMTP_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;

/**
 * Which of the SMTP_* settings are missing from `.env`.
 * `SMTP_SECURE` is optional (it defaults to false, which is what port 587 wants).
 */
export function smtpMissingEnv(env: Record<string, string | undefined>): string[] {
  return SMTP_ENV_KEYS.filter((key) => !String(env[key] ?? "").trim());
}

/** True when the mail server is ready to be used. */
export function smtpConfigured(env: Record<string, string | undefined>): boolean {
  return smtpMissingEnv(env).length === 0;
}

/**
 * What the operator is told when the mail server is not set up. It names the
 * missing keys and the file they belong in — not "something went wrong".
 */
export function smtpSetupMessage(missing: string[]): string {
  if (missing.length === 0) return "";
  return (
    `Email is not set up yet on this server: ${missing.join(", ")} ` +
    `${missing.length === 1 ? "is" : "are"} empty in .env. ` +
    "Fill in the SMTP_ settings (a Gmail account needs an App Password in SMTP_PASS), " +
    "restart the app, and send again."
  );
}
