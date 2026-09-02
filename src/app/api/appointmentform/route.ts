// src/app/api/appointmentform/route.ts


import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { sendAppointmentSMS } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Keep one Prisma client during Next.js development hot reloads. */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
  pool: true,
  maxConnections: 5,
  rateDelta: 1000,
  rateLimit: 5,
});

function padNum(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function toChar(s: string, len: number): string {
  return s.substring(0, len).padEnd(len, " ");
}

function trimValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

/**
 * Return all useful forms of a Sri Lankan mobile number for searching.
 * This allows 0771234567, 94771234567, +94771234567 and
 * 0094771234567 to match the same customer row.
 */
function getPhoneSearchVariants(value: string): string[] {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return [];

  const without00 = digits.startsWith("00") ? digits.slice(2) : digits;
  const variants = new Set<string>();

  const add = (v: string) => {
    if (v && v.length >= 2) variants.add(v);
  };

  add(digits);
  add(without00);

  if (without00.startsWith("94")) {
    const localPart = without00.slice(2);
    add(`0${localPart}`);
    add(localPart);
  } else if (without00.startsWith("0")) {
    const internationalPart = `94${without00.slice(1)}`;
    add(internationalPart);
    add(`00${internationalPart}`);
  } else if (without00.startsWith("7")) {
    const internationalPart = `94${without00}`;
    add(`0${without00}`);
    add(internationalPart);
    add(`00${internationalPart}`);
  }

  return [...variants];
}

/** Store Sri Lankan mobile numbers consistently as +94XXXXXXXXX. */
function normalizePhoneForStorage(value: string): string {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;

  const without00 = digits.startsWith("00") ? digits.slice(2) : digits;
  let mobile = without00;

  if (without00.startsWith("94")) {
    mobile = without00.slice(2);
  } else if (without00.startsWith("0")) {
    mobile = without00.slice(1);
  }

  if (/^7\d{8}$/.test(mobile)) {
    return `+94${mobile}`;
  }

  return raw;
}

/** SQL expression which removes common formatting from RegTel. */
function normalizedRegTelSql() {
  return Prisma.sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(RTRIM(RegTel), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '')`;
}

function phoneSearchConditions(value: string) {
  const variants = getPhoneSearchVariants(value);
  const normalized = normalizedRegTelSql();

  return variants.map(
    (variant) => Prisma.sql`${normalized} LIKE ${`%${variant}%`}`,
  );
}

async function generateCusCode(): Promise<string> {
  const result = await prisma.$queryRaw<{ maxCode: string | null }[]>`
    SELECT MAX(RTRIM(CusCode)) AS maxCode
    FROM tbl_CustomerMaster
    WHERE CusCode LIKE 'CUS%'
  `;

  const maxCode = result[0]?.maxCode;
  if (!maxCode || !maxCode.startsWith("CUS")) return "CUS0000001";

  const num = parseInt(maxCode.replace("CUS", "").trim(), 10) || 0;
  return `CUS${padNum(num + 1, 7)}`;
}

async function generateBookingIDTx(
  tx: Prisma.TransactionClient,
  locCode: string,
): Promise<string> {
  const result = await tx.$queryRaw<{ maxID: string | null }[]>`
    SELECT MAX(RTRIM(BookingID)) AS maxID
    FROM tbl_bookingheder
    WHERE RTRIM(LocCode) = ${locCode.trim()}
    FOR UPDATE
  `;

  const maxID = result[0]?.maxID;
  if (!maxID || !maxID.startsWith("BK")) return "BK0000001";

  const num = parseInt(maxID.replace("BK", "").trim(), 10) || 0;
  return `BK${padNum(num + 1, 7)}`;
}

function isDuplicateKeyError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "");

  return (
    err?.code === "P2002" ||
    (err?.code === "P2010" &&
      (msg.includes("1062") || msg.toLowerCase().includes("duplicate entry")))
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SERVER-SIDE CONFLICT GUARD (race-safe double-booking prevention)
   -----------------------------------------------------------------------------
   Availability is checked on the client for UX, but the server must re-verify
   inside the SAME database transaction that creates the booking. Two
   receptionists submitting the same technician + slot concurrently are
   serialized by a SELECT ... FOR UPDATE lock: the second transaction blocks
   until the first commits, then sees the new row and is rejected with 409.
──────────────────────────────────────────────────────────────────────────────── */
class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingConflictError";
  }
}

/** Parse "HH:MM AM/PM" (or 24h "HH:MM") into minutes since midnight. */
function slotToMinutes(timeStr: string): number {
  if (!timeStr) return -1;
  const ampm = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const min = parseInt(ampm[2], 10);
    const period = ampm[3].toUpperCase();
    hour = period === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) return hour * 60 + min;
    return -1;
  }
  const military = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (military) {
    const hour = parseInt(military[1], 10);
    const min = parseInt(military[2], 10);
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) return hour * 60 + min;
  }
  return -1;
}

function minutesToTimeLabel(totalMinutes: number): string {
  if (totalMinutes >= 1440) totalMinutes = 1439;
  if (totalMinutes < 0) totalMinutes = 0;
  const h24 = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

interface ProviderWindow {
  techID: string; // technician id (trimmed, "0" = unassigned → never conflicts)
  startMin: number; // minutes since midnight (inclusive)
  endMin: number; // minutes since midnight (exclusive)
}

/** Time windows the incoming payload would occupy, per technician per guest. */
function providerWindowsFromPayload(
  guests: Guest[],
  durationOf: (itemCode: string) => number,
): ProviderWindow[] {
  const windows: ProviderWindow[] = [];

  for (const guest of guests) {
    const startMin = slotToMinutes(guest.timeSlot || "");
    if (startMin < 0) continue;

    // A technician's services run sequentially: window = Σ real durations
    // of that technician's service rows (30 min fallback per unknown row).
    const totals = new Map<string, number>();
    for (const svc of guest.services || []) {
      const tech = trimValue(svc.techID);
      if (!tech || tech === "0") continue;
      const dur = Math.max(30, durationOf(svc.serviceItemID.trim()) || 30);
      totals.set(tech, (totals.get(tech) || 0) + dur);
    }

    for (const [techID, total] of totals) {
      windows.push({ techID, startMin, endMin: startMin + total });
    }
  }

  return windows;
}

interface RawConflictRow {
  BookingID: string;
  StartMin: number;
  TechID: string;
  TotalMin: number;
}

function hasOverlap(a: ProviderWindow, b: ProviderWindow): boolean {
  return a.techID === b.techID && a.startMin < b.endMin && b.startMin < a.endMin;
}

interface GuestService {
  serviceItemID: string;
  serviceName?: string;
  qty: number;
  itemPrice: number;
  techID: string;
  techName?: string;
}

function dedupeGuestServices(services: GuestService[]): GuestService[] {
  const map = new Map<string, GuestService>();

  for (const svc of services) {
    const key = String(svc.serviceItemID || "").trim();
    if (!key) continue;

    const qty = Number(svc.qty) > 0 ? Number(svc.qty) : 1;
    const itemPrice = Number(svc.itemPrice) || 0;

    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.qty = (existing.qty || 1) + qty;
      existing.itemPrice = (existing.itemPrice || 0) + itemPrice * qty;
    } else {
      map.set(key, {
        ...svc,
        serviceItemID: key,
        qty,
        itemPrice: itemPrice * qty,
        techID: String(svc.techID || "0").trim() || "0",
      });
    }
  }

  return Array.from(map.values());
}

function formatDateLong(iso: string): string {
  if (!iso) return "";

  return new Date(`${iso}T00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Preserve the appointment's wall-clock time in a MySQL DATETIME value.
 * A DATETIME has no timezone, so a SQL string is safer than passing a JS Date
 * that could be shifted by the server timezone.
 */
function toBookingDateTime(
  dateValue: string,
  timeValue: string,
): string | null {
  const dateMatch = String(dateValue || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})$/);
  const timeMatch = String(timeValue || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);

  if (!dateMatch || !timeMatch) return null;

  const [year, month, day] = dateMatch[1].split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const period = timeMatch[3].toUpperCase();

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return `${dateMatch[1]} ${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}:00`;
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface Guest {
  guessID: string;
  label: string;
  gender?: string;
  timeSlot?: string;
  services: GuestService[];
}

interface BookingPayload {
  locCode: string;
  regTel: string;
  cusName: string;
  cusEmail?: string;
  gender?: string;
  bookingTypeID: string;
  status: string;
  confirmationType: string;
  advBookingPayMode?: string;
  advBookingAmount?: number;
  remarks?: string;
  userID?: string;
  appointmentDate: string;
  guests: Guest[];
}

interface EmailGuestSection {
  label: string;
  gender: string;
  timeSlot: string;
  services: {
    name: string;
    qty: number;
    price: number;
    techName: string;
  }[];
  subtotal: number;
}

interface EmailData {
  name: string;
  email: string;
  phone: string;
  bookingId: string;
  branch: string;
  date: string;
  guests: EmailGuestSection[];
  grandTotal: number;
  notes: string | null;
}

function buildPlainText(data: EmailData): string {
  const lines: string[] = [
    "SAYO Beauty — Booking Confirmed",
    `Reference: ${data.bookingId}`,
    "",
    `Dear ${data.name},`,
    "",
    "Your walk-in appointment has been registered successfully.",
    "",
    "── APPOINTMENT DETAILS ──────────────────",
    `Date:        ${formatDateLong(data.date)}`,
    `Branch:      ${data.branch}`,
    "",
  ];

  data.guests.forEach((g) => {
    lines.push(
      `── ${g.label.toUpperCase()} ${g.timeSlot ? `(⏰ ${g.timeSlot})` : ""} ──`,
    );

    g.services.forEach((s) => {
      lines.push(
        `  • ${s.name} x${s.qty}  |  LKR ${s.price.toLocaleString()}  |  Provider: ${s.techName}`,
      );
    });

    lines.push(`  Subtotal: LKR ${g.subtotal.toLocaleString()}`);
    lines.push("");
  });

  lines.push(
    "── GRAND TOTAL ───────────────────────────",
    `LKR ${data.grandTotal.toLocaleString()}`,
    "",
  );

  if (data.notes) {
    lines.push(`Notes: ${data.notes}`, "");
  }

  lines.push(
    "── NOTE ─────────────────────────────────",
    "Payment is collected at the salon. Please arrive on time.",
    "",
    "────────────────────────────────────────",
    "SAYO Beauty  |  Colombo • Negombo • Kiribathgoda",
    "sayo.worksofficial@gmail.com",
    "",
    "You are receiving this email because a booking was made at SAYO Beauty.",
    "This is a transactional notification.",
  );

  return lines.join("\n");
}

function buildConfirmationEmail(data: EmailData): {
  subject: string;
  html: string;
} {
  const safe = {
    name: escapeHtml(data.name),
    phone: escapeHtml(data.phone),
    branch: escapeHtml(data.branch),
  };

  const guestBlocks = data.guests
    .map((g, idx) => {
      const rows = g.services
        .map(
          (s) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;color:#1a3a1a;font-size:13px;font-family:Arial,sans-serif;">
          ${escapeHtml(s.name)} ${s.qty > 1 ? `<span style="color:#6a8a6a;">×${s.qty}</span>` : ""}
          <br/><span style="font-size:11px;color:#6a8a6a;">Provider: ${escapeHtml(s.techName)}</span>
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;color:#1a6b1a;font-size:13px;font-family:Arial,sans-serif;text-align:right;white-space:nowrap;font-weight:bold;">
          LKR ${s.price.toLocaleString()}
        </td>
      </tr>`,
        )
        .join("");

      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:14px 18px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#1a6b1a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">
                  ${idx + 1}. ${escapeHtml(g.label)} ${g.gender ? `<span style="font-size:10px;color:#4a6a4a;font-weight:normal;">(${escapeHtml(g.gender)})</span>` : ""}
                </td>
                <td style="text-align:right;color:#1a6b1a;font-size:12px;font-weight:bold;font-family:Arial,sans-serif;">
                  ${g.timeSlot ? `⏰ ${escapeHtml(g.timeSlot)}` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 18px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${rows}
              <tr>
                <td style="padding:8px 0 0;color:#1a3a1a;font-size:12px;font-weight:bold;font-family:Arial,sans-serif;">Subtotal</td>
                <td style="padding:8px 0 0;color:#1a3a1a;font-size:12px;font-weight:bold;font-family:Arial,sans-serif;text-align:right;">
                  LKR ${g.subtotal.toLocaleString()}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    })
    .join("");

  const subject = `Your SAYO Beauty Booking Confirmed — Ref ${data.bookingId}`;
  const preheader = `Your walk-in booking at ${data.branch} on ${formatDateLong(data.date)} has been registered.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Booking Confirmed — SAYO Beauty</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f7f0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f0f7f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader} &zwnj; &zwnj; &zwnj; &zwnj; &zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7f0;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;border-radius:12px;overflow:hidden;border:1px solid #7bc47b;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1a6b1a;padding:36px 40px 28px;text-align:center;">
          <p style="margin:0 0 6px;color:#a0e8a0;font-size:10px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">SAYO BEAUTY</p>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;letter-spacing:1px;font-family:Arial,sans-serif;">Booking <strong style="color:#a0e8a0;">Confirmed</strong></h1>
          <p style="margin:10px 0 0;color:rgba(255,255,255,0.6);font-size:12px;font-family:Arial,sans-serif;">Reference <strong style="color:#a0e8a0;">${data.bookingId}</strong></p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px 40px;">
          <p style="margin:0 0 22px;color:#1a3a1a;font-size:14px;line-height:1.8;font-family:Arial,sans-serif;">Dear <strong style="color:#0a200a;">${safe.name}</strong>,<br/>Your walk-in appointment has been <strong style="color:#1a6b1a;">registered successfully</strong>. Please arrive on time — payment is collected at the salon.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 22px 6px;"><p style="margin:0;color:#1a6b1a;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">BOOKING DETAILS</p></td></tr>
            <tr><td style="padding:6px 22px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td width="38%" style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;">Date</td><td style="padding:6px 0;color:#0a200a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">${formatDateLong(data.date)}</td></tr>
              <tr><td style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;">Branch</td><td style="padding:6px 0;color:#0a200a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">${safe.branch}</td></tr>
              <tr><td style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;">Phone</td><td style="padding:6px 0;color:#0a200a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">${safe.phone}</td></tr>
              ${data.notes ? `<tr><td style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;vertical-align:top;">Notes</td><td style="padding:6px 0;color:#2a4a2a;font-size:13px;font-family:Arial,sans-serif;">${escapeHtml(data.notes)}</td></tr>` : ""}
            </table></td></tr>
          </table>
          <p style="margin:0 0 8px;color:#1a6b1a;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">SERVICES BOOKED</p>
          ${guestBlocks}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a6b1a;border-radius:10px;margin-bottom:24px;"><tr><td style="padding:16px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:rgba(255,255,255,0.7);font-size:12px;font-weight:bold;font-family:Arial,sans-serif;">GRAND TOTAL</td><td style="text-align:right;color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">LKR ${data.grandTotal.toLocaleString()}</td></tr></table></td></tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;"><tr><td style="padding:14px 18px;"><p style="margin:0 0 5px;color:#1a6b1a;font-size:10px;font-weight:bold;letter-spacing:2px;font-family:Arial,sans-serif;">REMINDER</p><p style="margin:0;color:#4a6a4a;font-size:12px;line-height:1.7;font-family:Arial,sans-serif;">Please arrive at least <strong style="color:#1a3a1a;">5 minutes early</strong>. Payment is collected at the salon. To cancel or reschedule, please contact us as soon as possible.</p></td></tr></table>
        </td></tr>
        <tr><td style="background-color:#1a6b1a;padding:22px 40px;text-align:center;"><p style="margin:0 0 4px;color:#a0e8a0;font-size:11px;font-weight:bold;letter-spacing:3px;font-family:Arial,sans-serif;">SAYO BEAUTY</p><p style="margin:0 0 12px;color:rgba(255,255,255,0.6);font-size:11px;font-family:Arial,sans-serif;">Colombo &bull; Negombo &bull; Kiribathgoda</p><p style="margin:0;color:rgba(255,255,255,0.45);font-size:10px;line-height:1.6;font-family:Arial,sans-serif;">You are receiving this email because a booking was made at SAYO Beauty.<br/>This is a transactional notification.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

async function sendBookingEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  bookingId: string,
): Promise<void> {
  try {
    await transporter.sendMail({
      from:
        process.env.SMTP_FROM || "SAYO Beauty <sayo.worksofficial@gmail.com>",
      replyTo:
        process.env.SMTP_FROM || "SAYO Beauty <sayo.worksofficial@gmail.com>",
      to,
      subject,
      text,
      html,
      headers: {
        "List-Unsubscribe":
          "<mailto:sayo.worksofficial@gmail.com?subject=unsubscribe>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Mailer": "SAYO-Beauty-Booking/1.0",
        "X-Priority": "3",
        "X-MS-Exchange-Organization-SCL": "-1",
        Precedence: "transactional",
        "Auto-Submitted": "auto-generated",
        "Message-ID": `<booking-${bookingId}-${Date.now()}@sayo.beauty>`,
        "X-Entity-Ref-ID": `booking-${bookingId}`,
        "Feedback-ID": "booking:sayo-beauty",
      },
    });
    console.log(`[EMAIL_SENT] → ${to} | ${subject}`);
  } catch (err) {
    console.error("[EMAIL_ERROR]", err);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  try {
    if (type === "branches") {
      const branchRows = await prisma.$queryRaw<
        { LocCode: string; LocDes: string; Address: string | null }[]
      >`
        SELECT
          RTRIM(LocCode) AS LocCode,
          RTRIM(LocDes)  AS LocDes,
          RTRIM(Address) AS Address
        FROM tbl_LocationMaster
        WHERE Enable = 1
        ORDER BY LocDes ASC
      `;

      // CHAR(10) columns can come back padded / duplicated: dedupe by the
      // trimmed code so the client never renders duplicate React keys.
      const seen = new Set<string>();
      const branches = branchRows
        .filter((row) => {
          const code = (row.LocCode || "").trim();
          if (!code || seen.has(code)) return false;
          seen.add(code);
          return true;
        })
        .map((row) => ({
          LocCode: row.LocCode.trim(),
          LocDes: row.LocDes?.trim() || row.LocCode.trim(),
          Address: row.Address?.trim() || "",
        }));

      return NextResponse.json({ success: true, data: branches });
    }

    if (type === "services") {
      const locCode = searchParams.get("locCode")?.trim();

      if (!locCode) {
        return NextResponse.json(
          { success: false, error: "locCode is required" },
          { status: 400 },
        );
      }

      const services = await prisma.tbl_ItemMaster.findMany({
        // Return only enabled service items. Products/inventory items
        // with ServiceItem = false are intentionally excluded.
        where: {
          LocCode: locCode,
          ServiceItem: true,
          Enable: true,
        },
        select: {
          ItemCode: true,
          ItemDes: true,
          ItemPrintDes: true,
          Retailprice: true,
          DurationMin: true,
          Category1: true,
          Category2: true,
          Category3: true,
          Category4: true,
          MasterUnitID: true,
        },
        orderBy: { ItemDes: "asc" },
      });

      const [cat1Rows, cat2Rows, cat3Rows, cat4Rows] = await Promise.all([
        prisma.tbl_ItemCategory1
          .findMany({
            where: { Enable: true },
            select: { CatCode: true, CatDes: true },
          })
          .catch(() => []),
        prisma.tbl_ItemCategory2
          .findMany({
            where: { Enable: true },
            select: { CatCode: true, CatDes: true },
          })
          .catch(() => []),
        prisma.tbl_ItemCategory3
          .findMany({
            where: { Enable: true },
            select: { CatCode: true, CatDes: true },
          })
          .catch(() => []),
        prisma.tbl_ItemCategory4
          .findMany({
            where: { Enable: true },
            select: { CatCode: true, CatDes: true },
          })
          .catch(() => []),
      ]);

      const c1Map = Object.fromEntries(
        (cat1Rows as any[]).map((c) => [c.CatCode?.trim(), c.CatDes?.trim()]),
      );
      const c2Map = Object.fromEntries(
        (cat2Rows as any[]).map((c) => [c.CatCode?.trim(), c.CatDes?.trim()]),
      );
      const c3Map = Object.fromEntries(
        (cat3Rows as any[]).map((c) => [c.CatCode?.trim(), c.CatDes?.trim()]),
      );
      const c4Map = Object.fromEntries(
        (cat4Rows as any[]).map((c) => [c.CatCode?.trim(), c.CatDes?.trim()]),
      );

      const enriched = services.map((s) => {
        const itemCode = s.ItemCode.trim();
        const itemDes = s.ItemDes.trim();
        const category1 = s.Category1?.trim() || "";
        const category2 = s.Category2?.trim() || "";
        const category3 = s.Category3?.trim() || "";
        const category4 = s.Category4?.trim() || "";

        return {
          itemCode,
          itemDes,
          itemPrintDes: s.ItemPrintDes?.trim() || itemDes,
          price: Number(s.Retailprice ?? 0),
          durationMin: Number(s.DurationMin) > 0 ? Number(s.DurationMin) : 30,
          category1,
          category1Label: c1Map[category1] || category1,
          category2,
          category2Label: c2Map[category2] || category2,
          category3,
          category3Label: c3Map[category3] || category3,
          category4,
          category4Label: c4Map[category4] || category4,
        };
      });

      return NextResponse.json({ success: true, data: enriched });
    }

    if (type === "customer") {
      const phone = searchParams.get("phone")?.trim() || "";
      const conditions = phoneSearchConditions(phone);

      if (!phone) {
        return NextResponse.json(
          { success: false, error: "phone is required" },
          { status: 400 },
        );
      }

      if (conditions.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      const customers = await prisma.$queryRaw<
        {
          CusCode: string;
          CusName: string;
          RegTel: string;
          CusEmail: string | null;
          Gender: string | null;
          BlackList: number | boolean;
          BlackListRemarks: string | null;
        }[]
      >`
        SELECT
          RTRIM(CusCode) AS CusCode,
          RTRIM(CusName) AS CusName,
          RTRIM(RegTel) AS RegTel,
          RTRIM(CusEmail) AS CusEmail,
          RTRIM(Gender) AS Gender,
          BlackList AS BlackList,
          RTRIM(BlackListRemarks) AS BlackListRemarks
        FROM tbl_CustomerMaster
        WHERE (${Prisma.join(conditions, " OR ")})
          AND Enable = 1
        ORDER BY CreateDateTime DESC
        LIMIT 5
      `;

      const mapped = customers.map((c) => {
        const storedPhone = c.RegTel?.trim() || "";

        return {
          cusCode: c.CusCode?.trim() || "",
          cusName: c.CusName?.trim() || "",
          regTel: normalizePhoneForStorage(storedPhone),
          cusEmail: c.CusEmail?.trim() || "",
          gender: c.Gender?.trim() || "",
          blacklisted: Boolean(c.BlackList),
          blackListRemarks: (c.BlackListRemarks || "").trim() || undefined,
        };
      });

      return NextResponse.json({ success: true, data: mapped });
    }

    return NextResponse.json(
      { success: false, error: `Unknown type: ${type}` },
      { status: 400 },
    );
  } catch (err: any) {
    console.error("[GET /api/appointmentform]", err);

    return NextResponse.json(
      { success: false, error: "Internal server error", detail: err?.message },
      { status: 500 },
    );
  }
}

const MAX_BOOKING_ID_RETRIES = 5;

// Event timestamps are nullable in the database. A booking that has not yet
// been cancelled, confirmed, checked in, or billed must store NULL rather
// than the fake date 1900-01-01 (a DATETIME column cannot store a space).

export async function POST(req: NextRequest) {
  let body: BookingPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const required: (keyof BookingPayload)[] = [
    "locCode",
    "regTel",
    "cusName",
    "bookingTypeID",
    "status",
    "confirmationType",
    "appointmentDate",
    "guests",
  ];

  for (const key of required) {
    if (!body[key]) {
      return NextResponse.json(
        { success: false, error: `Missing required field: ${key}` },
        { status: 422 },
      );
    }
  }

  if (!Array.isArray(body.guests) || body.guests.length === 0) {
    return NextResponse.json(
      { success: false, error: "At least one guest with services is required" },
      { status: 422 },
    );
  }

  body.guests = body.guests.map((g) => ({
    ...g,
    services: dedupeGuestServices(Array.isArray(g.services) ? g.services : []),
  }));

  const hasServices = body.guests.some((g) => g.services.length > 0);
  if (!hasServices) {
    return NextResponse.json(
      { success: false, error: "At least one service must be selected" },
      { status: 422 },
    );
  }

  const mainGuest =
    body.guests.find((g) => g.guessID === "MAIN") ?? body.guests[0];
  const appointmentTime = mainGuest?.timeSlot?.trim() || "";
  const bookingDateTime = toBookingDateTime(
    body.appointmentDate,
    appointmentTime,
  );

  if (!bookingDateTime) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid appointment date and time are required",
      },
      { status: 422 },
    );
  }

  // BookingDate stores the complete schedule date and time. Remarks now
  // contains notes only; old Date:/Time: prefixes are not written anymore.
  const appointmentRemarks =
    String(body.remarks || "")
      .trim()
      .substring(0, 500) || " ";

  try {
    const locCode = body.locCode.trim();
    const phone = normalizePhoneForStorage(body.regTel.trim());
    const cusName = body.cusName.trim();
    const phoneConditions = phoneSearchConditions(phone);

    if (!locCode || !phone || !cusName || phoneConditions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "locCode, regTel and cusName cannot be empty",
        },
        { status: 422 },
      );
    }

    const branchRows = await prisma.$queryRaw<
      {
        LocCode: string;
        LocDes: string;
      }[]
    >`
      SELECT RTRIM(LocCode) AS LocCode, RTRIM(LocDes) AS LocDes
      FROM tbl_LocationMaster
      WHERE RTRIM(LocCode) = ${locCode}
        AND Enable = 1
      LIMIT 1
    `;

    if (!branchRows[0]) {
      return NextResponse.json(
        { success: false, error: "Branch not found or disabled" },
        { status: 404 },
      );
    }

    const branchLabel = branchRows[0].LocDes || locCode;

    const existingRows = await prisma.$queryRaw<
      {
        CusCode: string;
        CusName: string;
        CusEmail: string | null;
        Gender: string | null;
        BlackList: number | boolean;
        BlackListRemarks: string | null;
      }[]
    >`
      SELECT
        RTRIM(CusCode) AS CusCode,
        RTRIM(CusName) AS CusName,
        RTRIM(CusEmail) AS CusEmail,
        RTRIM(Gender) AS Gender,
        BlackList AS BlackList,
        RTRIM(BlackListRemarks) AS BlackListRemarks
      FROM tbl_CustomerMaster
      WHERE (${Prisma.join(phoneConditions, " OR ")})
        AND Enable = 1
      ORDER BY CreateDateTime DESC
      LIMIT 1
    `;

    let cusCode: string;

    if (existingRows[0]) {
      cusCode = existingRows[0].CusCode.trim();
      const stored = existingRows[0];

      // ── Blacklist guard ──────────────────────────────────────────────────
      // Blacklisted customers are now FOUND by the phone lookup (the UI shows
      // the warning banner). Their booking must not proceed silently as if
      // they were a brand-new customer with a fresh CUS code.
      if (Boolean(stored.BlackList)) {
        const reason = stored.BlackListRemarks?.trim() || "no reason recorded";
        return NextResponse.json(
          {
            success: false,
            error: `This phone number belongs to a BLACKLISTED customer (${cusCode}). Booking is not allowed. Reason: ${reason}`,
          },
          { status: 403 },
        );
      }

      // ── Customer master protection (no auto-overwrite) ───────────────────
      // The phone may belong to a different person than the one at the
      // counter (e.g. a friend booking on the customer's number). NEVER
      // overwrite the stored profile with form data — that would silently
      // rename "Nimali" to "Sarah" and corrupt her history. Only backfill
      // fields the master record has never filled in (empty/NULL).
      const formName = cusName.trim();
      const formEmail = body.cusEmail?.trim() || "";

      if (
        formName.toLowerCase() !== (stored.CusName || "").trim().toLowerCase() ||
        (formEmail &&
          formEmail.toLowerCase() !== (stored.CusEmail || "").trim().toLowerCase())
      ) {
        console.warn(
          `[CUSTOMER_KEPT] Booking created under ${cusCode} ("${stored.CusName}") but the master profile was NOT overwritten. Form entered: "${formName}" <${formEmail}>`,
        );
      }

      await prisma.$executeRaw`
        UPDATE tbl_CustomerMaster
        SET
          CusEmail = CASE
            WHEN CusEmail IS NULL OR RTRIM(CusEmail) = ' ' OR RTRIM(CusEmail) = ''
            THEN ${formEmail.substring(0, 200) || " "}
            ELSE CusEmail
          END,
          Gender = CASE
            WHEN Gender IS NULL OR RTRIM(Gender) = ' ' OR RTRIM(Gender) = ''
            THEN ${body.gender?.trim()?.substring(0, 50) || " "}
            ELSE Gender
          END
        WHERE RTRIM(CusCode) = ${cusCode}
      `;
    } else {
      cusCode = await generateCusCode();

      await prisma.$executeRaw`
        INSERT INTO tbl_CustomerMaster (
          CusCode, RegTel, CusName, CusAdd,
          CusEmail, Rmks, PSW, Gender,
          CreatedBy, CreateDateTime
        ) VALUES (
          ${toChar(cusCode, 10)},
          ${toChar(phone, 15)},
          ${cusName.substring(0, 200)},
          ${" "},
          ${body.cusEmail?.trim()?.substring(0, 200) || " "},
          ${" "},
          ${" "},
          ${body.gender?.trim() || " "},
          ${body.userID || "0"},
          ${new Date()}
        )
      `;
    }

    const allItemCodes = [
      ...new Set(
        body.guests.flatMap((g) =>
          g.services.map((s) => s.serviceItemID.trim()),
        ),
      ),
    ];

    let itemNameMap: Record<string, string> = {};
    let itemDurationMap: Record<string, number> = {};

    if (allItemCodes.length > 0) {
      const itemRows = await prisma.$queryRaw<
        {
          ItemCode: string;
          ItemDes: string;
          ItemPrintDes: string | null;
          Retailprice: number;
          DurationMin: number;
        }[]
      >`
        SELECT
          RTRIM(ItemCode) AS ItemCode,
          RTRIM(ItemDes) AS ItemDes,
          RTRIM(ItemPrintDes) AS ItemPrintDes,
          Retailprice AS Retailprice,
          COALESCE(NULLIF(DurationMin, 0), 30) AS DurationMin
        FROM tbl_ItemMaster
        WHERE RTRIM(LocCode) = ${locCode}
          AND RTRIM(ItemCode) IN (${Prisma.join(allItemCodes)})
      `;

      itemNameMap = Object.fromEntries(
        itemRows.map((i) => [
          i.ItemCode.trim(),
          i.ItemPrintDes?.trim() || i.ItemDes.trim(),
        ]),
      );

      // ── Server-authoritative pricing ──────────────────────────────────────
      // Never trust the itemPrice sent by the client. Recompute every line
      // from tbl_ItemMaster.Retailprice so a tampered payload (e.g. a LKR
      // 5,000 service priced at 500 via devtools) can never reach the DB or
      // billing. Any mismatch is logged and silently corrected.
      const itemPriceMap = Object.fromEntries(
        itemRows.map((i) => [i.ItemCode.trim(), Number(i.Retailprice) || 0]),
      );
      // Real per-service durations for the server-side conflict guard —
      // the same source the availability UI now uses.
      itemDurationMap = Object.fromEntries(
        itemRows.map((i) => [
          i.ItemCode.trim(),
          Number(i.DurationMin) > 0 ? Number(i.DurationMin) : 30,
        ]),
      );

      let priceAdjusted = 0;
      for (const guest of body.guests) {
        for (const svc of guest.services) {
          const itemCode = svc.serviceItemID.trim();
          const retailPrice = itemPriceMap[itemCode];

          if (retailPrice === undefined) {
            console.warn(
              `[PRICE_CHECK] Item "${itemCode}" not found for branch ${locCode} — price not validated.`,
            );
            continue;
          }

          const qty = Number(svc.qty) > 0 ? Number(svc.qty) : 1;
          const correctPrice = Math.round(retailPrice * qty * 100) / 100;
          const sentPrice = Number(svc.itemPrice) || 0;

          if (Math.abs(sentPrice - correctPrice) > 0.009) {
            console.warn(
              `[PRICE_FIXED] Item "${itemCode}": client sent LKR ${sentPrice}, ` +
                `tbl_ItemMaster.Retailprice = LKR ${retailPrice} × ${qty} = LKR ${correctPrice}. ` +
                `Storing the DB price.`,
            );
            svc.itemPrice = correctPrice;
            priceAdjusted++;
          }
        }
      }

      if (priceAdjusted > 0) {
        console.warn(
          `[PRICE_FIXED] ${priceAdjusted} service line(s) were corrected to the DB retail price for booking at ${locCode}.`,
        );
      }
    }

    let bookingID = "";
    let detailRowCount = 0;
    let attempt = 0;
    let lastErr: any = null;

    // Computed once, used both inside the transaction (INSERT) and in the
    // response: walk-in bookings are always saved as CONFIRMED.
    const requestedStatus = String(body.status || "PENDING")
      .trim()
      .toUpperCase();
    const isWalkIn =
      trimValue(body.bookingTypeID).toUpperCase() === "WALKIN" ||
      trimValue(body.confirmationType).toUpperCase() === "WI";
    const effectiveStatus = isWalkIn ? "CONFIRMED" : requestedStatus;
    const initiallyConfirmed =
      effectiveStatus === "CONFIRMED" || effectiveStatus === "CONFIRM";
    const initiallyCancelled =
      effectiveStatus === "CANCELLED" || effectiveStatus === "CANCEL";
    const initiallyOngoing =
      effectiveStatus === "ONGOING" || effectiveStatus === "IN PROGRESS";

    while (attempt < MAX_BOOKING_ID_RETRIES) {
      attempt++;

      try {
        await prisma.$transaction(
          async (tx) => {
            // ── Server-side conflict guard (race-safe) ──────────────────────
            // Lock every non-cancelled header row for this branch + date. A
            // concurrent submission from another receptionist blocks here
            // until this transaction commits, so it can never slip past the
            // check below and create a double booking for the same technician.
            const conflictRows = await tx.$queryRaw<RawConflictRow[]>`
              SELECT
                h.BookingID,
                (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
                RTRIM(d.TechID) AS TechID,
                COALESCE(SUM(COALESCE(NULLIF(i.DurationMin, 0), 30)), 30) AS TotalMin
              FROM tbl_bookingheder h
              JOIN tbl_bookingdetail d
                ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
              LEFT JOIN tbl_ItemMaster i
                ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
               AND RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
              WHERE RTRIM(h.LocCode) = ${locCode.trim()}
                AND DATE(h.BookingDate) = ${body.appointmentDate}
                AND RTRIM(h.Status) <> 'CANCELLED'
              GROUP BY h.BookingID, RTRIM(d.TechID), StartMin
              FOR UPDATE
            `;

            // Existing occupancy: per (booking, technician) → real duration
            // (Σ tbl_itemmaster.DurationMin for that technician's rows).
            const byKey = new Map<string, { start: number; total: number }>();
            for (const row of conflictRows) {
              const tech = trimValue(row.TechID);
              if (!tech || tech === "0") continue;
              const key = `${trimValue(row.BookingID)}|${tech}`;
              const entry = byKey.get(key);
              if (entry) entry.total += Number(row.TotalMin) || 30;
              else
                byKey.set(key, {
                  start: Number(row.StartMin) || 0,
                  total: Number(row.TotalMin) || 30,
                });
            }

            const existingWindows: ProviderWindow[] = [...byKey.entries()].map(
              ([key, e]) => ({
                techID: key.slice(key.indexOf("|") + 1),
                startMin: e.start,
                endMin: e.start + Math.max(30, e.total),
              }),
            );

            const candidateWindows = providerWindowsFromPayload(
              body.guests,
              (itemCode) => itemDurationMap[itemCode] || 30,
            );

            for (const cw of candidateWindows) {
              for (const ew of existingWindows) {
                if (hasOverlap(cw, ew)) {
                  throw new BookingConflictError(
                    `Technician ${cw.techID} is already booked on ${body.appointmentDate} at ${minutesToTimeLabel(ew.startMin)}. Please choose another technician or time slot.`,
                  );
                }
              }
            }

            bookingID = await generateBookingIDTx(tx, locCode);

            // Walk-in customers are already physically in the salon, so the
            // booking is saved as CONFIRMED (isWalkIn/effectiveStatus are
            // computed above the transaction) — otherwise the DB stays
            // PENDING/Confirmed=0 while the SMS/email already says "Booking
            // Confirmed", and billing gets blocked later.
            const createdAt = new Date();
            const userID = toChar(body.userID?.trim() || "0", 10);
            const eventActor = toChar(body.userID?.trim() || " ", 10);

            await tx.$executeRaw`
              INSERT INTO tbl_bookingheder (
                LocCode,
                BookingID,
                CusCode,
                BookingDate,
                TxnDateTime,
                BookingTypeID,
                Status,
                ConfirmationType,
                AdvBookingPayMode,
                AdvBookingAmount,
                Remarks,
                UserID,
                CancelledDate,
                CancelledBy,
                Pax,
                Confirmed,
                ConfirmedBy,
                ConfirmedDate,
                CheckInTime,
                BillingTime
              ) VALUES (
                ${toChar(locCode, 10)},
                ${toChar(bookingID, 10)},
                ${toChar(cusCode, 10)},
                ${bookingDateTime},
                ${createdAt},
                ${toChar(body.bookingTypeID, 10)},
                ${toChar(effectiveStatus, 10)},
                ${toChar(body.confirmationType, 2)},
                ${body.advBookingPayMode?.trim() || " "},
                ${body.advBookingAmount ?? 0},
                ${appointmentRemarks},
                ${userID},
                ${initiallyCancelled ? createdAt : null},
                ${initiallyCancelled ? eventActor : " "},
                ${body.guests.length},
                ${initiallyConfirmed ? 1 : 0},
                ${initiallyConfirmed ? eventActor : " "},
                ${initiallyConfirmed ? createdAt : null},
                ${initiallyOngoing ? createdAt : null},
                ${null}
              )
            `;

            detailRowCount = 0;

            for (const guest of body.guests) {
              const guessID = toChar(guest.guessID, 10);

              for (const svc of guest.services) {
                await tx.$executeRaw`
                  INSERT INTO tbl_bookingdetail (
                    LocCode,
                    BookingID,
                    GuessID,
                    ServiceItemID,
                    Qty,
                    ItemPrice,
                    TechID
                  ) VALUES (
                    ${toChar(locCode, 10)},
                    ${toChar(bookingID, 10)},
                    ${guessID},
                    ${toChar(svc.serviceItemID, 10)},
                    ${toChar(String(svc.qty ?? 1), 10)},
                    ${svc.itemPrice ?? 0},
                    ${toChar(svc.techID || "0", 10)}
                  )
                `;

                detailRowCount++;
              }
            }
          },
          { timeout: 15000 },
        );

        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;

        if (isDuplicateKeyError(err) && attempt < MAX_BOOKING_ID_RETRIES) {
          console.warn(
            `[BOOKING] BookingID collision on attempt ${attempt} (${bookingID}) — retrying...`,
          );
          continue;
        }

        throw err;
      }
    }

    if (lastErr) throw lastErr;

    // Walk-ins are saved as CONFIRMED above, so the SMS must say "confirmed"
    // too — otherwise the customer is told it is confirmed while the DB (and
    // any later status check) still treats the message as an ordinary booking.
    const smsResult = await sendAppointmentSMS({
      event: isWalkIn ? "confirmed" : "booked",
      phone,
      name: cusName,
      bookingId: bookingID.trim(),
      branch: branchLabel,
      date: body.appointmentDate,
      timeSlot: appointmentTime,
    });

    if (!smsResult.success) {
      // The booking is already saved. An SMS provider/configuration problem
      // must not turn a successful booking into a failed request.
      console.error(
        `[BOOKING] SMS was not sent for ${bookingID.trim()}: ${smsResult.error}`,
      );
    }

    const customerEmail = body.cusEmail?.trim();

    if (customerEmail) {
      const emailGuests: EmailGuestSection[] = body.guests
        .filter((g) => g.services.length > 0)
        .map((g) => {
          const svcRows = g.services.map((s) => ({
            name:
              s.serviceName?.trim() ||
              itemNameMap[s.serviceItemID.trim()] ||
              s.serviceItemID,
            qty: s.qty ?? 1,
            price: s.itemPrice ?? 0,
            techName:
              s.techName?.trim() ||
              (s.techID && s.techID !== "0" ? s.techID : "To be assigned"),
          }));

          return {
            label: g.label || g.guessID,
            gender: g.gender || "",
            timeSlot: g.timeSlot || "",
            services: svcRows,
            subtotal: svcRows.reduce((a, s) => a + s.price, 0),
          };
        });

      const grandTotal = emailGuests.reduce((a, g) => a + g.subtotal, 0);

      const emailData: EmailData = {
        name: cusName,
        email: customerEmail,
        phone,
        bookingId: bookingID.trim(),
        branch: branchLabel,
        date: body.appointmentDate,
        guests: emailGuests,
        grandTotal,
        notes: body.remarks?.trim() || null,
      };

      const plainText = buildPlainText(emailData);
      const { subject, html } = buildConfirmationEmail(emailData);

      // Keep this awaited so serverless runtimes do not terminate before SMTP sends.
      await sendBookingEmail(
        customerEmail,
        subject,
        html,
        plainText,
        bookingID.trim(),
      );
    } else {
      console.warn(
        `[BOOKING] No email provided for booking ${bookingID.trim()} — skipping email.`,
      );
    }

    return NextResponse.json({
      success: true,
      message: isWalkIn
        ? "Walk-in booking created and confirmed successfully"
        : "Booking created successfully",
      data: {
        bookingID: bookingID.trim(),
        cusCode,
        locCode,
        serviceRows: detailRowCount,
        status: effectiveStatus,
        confirmed: initiallyConfirmed,
        refNumber: `SB-${bookingID.trim()}-${Date.now().toString(36).toUpperCase()}`,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/appointmentform]", err);

    if (err instanceof BookingConflictError) {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
        },
        { status: 409 },
      );
    }

    if (isDuplicateKeyError(err)) {
      return NextResponse.json(
        {
          success: false,
          error: "A booking conflict occurred. Please try submitting again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error", detail: err?.message },
      { status: 500 },
    );
  }
}
