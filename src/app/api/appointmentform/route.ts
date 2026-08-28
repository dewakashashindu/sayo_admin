// src/app/api/appointmentform/route.ts
// Sayo Beauty — Walk-in Booking API
// Handles: branch fetch, service fetch, customer lookup/upsert, booking creation + email

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

/* ─────────────────────────────────────────────────────────────
   NODEMAILER TRANSPORTER
───────────────────────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || "smtp.gmail.com",
  port:   Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
  pool:           true,
  maxConnections: 5,
  rateDelta:      1000,
  rateLimit:      5,
});

// ─────────────────────────────────────────────────────────────
// HELPERS — DB / ID
// ─────────────────────────────────────────────────────────────

function padNum(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function toChar(s: string, len: number): string {
  return s.substring(0, len).padEnd(len, " ");
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

/** Generate next BookingID inside a transaction (row-lock aware) */
async function generateBookingIDTx(
  tx: Prisma.TransactionClient,
  locCode: string
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

/** Detects a MySQL duplicate-key error (1062) surfaced through Prisma raw queries */
function isDuplicateKeyError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "");
  return (
    err?.code === "P2002" ||
    (err?.code === "P2010" && (msg.includes("1062") || msg.toLowerCase().includes("duplicate entry")))
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS — SERVICE DEDUPLICATION
// ─────────────────────────────────────────────────────────────

interface GuestService {
  serviceItemID: string;
  serviceName?: string;
  qty: number;
  itemPrice: number;
  techID: string;
  techName?: string;
}

/**
 * Merge duplicate services (same serviceItemID) within a single guest.
 * The composite PK on tbl_bookingdetail is
 * (LocCode, BookingID, GuessID, ServiceItemID) — so the SAME item
 * cannot appear twice for the same guest. If the client sends
 * duplicates (double-click, re-render bug, etc.), we combine their
 * quantities and total price into a single row instead of crashing.
 */
function dedupeGuestServices(services: GuestService[]): GuestService[] {
  const map = new Map<string, GuestService>();

  for (const svc of services) {
    const key = svc.serviceItemID.trim();
    const qty = svc.qty && svc.qty > 0 ? svc.qty : 1;

    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.qty = (existing.qty || 1) + qty;
      existing.itemPrice = (existing.itemPrice || 0) + (svc.itemPrice || 0) * qty;
      // keep the first assigned provider info
    } else {
      map.set(key, {
        ...svc,
        qty,
        itemPrice: (svc.itemPrice || 0) * qty, // store as total for this merged row
      });
    }
  }

  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────
// HELPERS — EMAIL FORMATTING
// ─────────────────────────────────────────────────────────────

function formatDateLong(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
}

// ─────────────────────────────────────────────────────────────
// REQUEST BODY TYPES
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// EMAIL TEMPLATE BUILDERS
// ─────────────────────────────────────────────────────────────

interface EmailGuestSection {
  label:    string;
  gender:   string;
  timeSlot: string;
  services: { name: string; qty: number; price: number; techName: string }[];
  subtotal: number;
}

interface EmailData {
  name:            string;
  email:           string;
  phone:           string;
  bookingId:       string;
  branch:          string;
  date:            string;
  guests:          EmailGuestSection[];
  grandTotal:      number;
  notes:           string | null;
}

function buildPlainText(data: EmailData): string {
  const lines: string[] = [
    `SAYO Beauty — Booking Confirmed`,
    `Reference: ${data.bookingId}`,
    ``,
    `Dear ${data.name},`,
    ``,
    `Your walk-in appointment has been registered successfully.`,
    ``,
    `── APPOINTMENT DETAILS ──────────────────`,
    `Date:        ${formatDateLong(data.date)}`,
    `Branch:      ${data.branch}`,
    ``,
  ];

  data.guests.forEach((g) => {
    lines.push(`── ${g.label.toUpperCase()} ${g.timeSlot ? `(⏰ ${g.timeSlot})` : ""} ──`);
    g.services.forEach(s => {
      lines.push(`  • ${s.name} x${s.qty}  |  LKR ${s.price.toLocaleString()}  |  Provider: ${s.techName}`);
    });
    lines.push(`  Subtotal: LKR ${g.subtotal.toLocaleString()}`);
    lines.push(``);
  });

  lines.push(`── GRAND TOTAL ───────────────────────────`);
  lines.push(`LKR ${data.grandTotal.toLocaleString()}`);
  lines.push(``);

  if (data.notes) {
    lines.push(`Notes: ${data.notes}`);
    lines.push(``);
  }

  lines.push(
    `── NOTE ─────────────────────────────────`,
    `Payment is collected at the salon. Please arrive on time.`,
    ``,
    `────────────────────────────────────────`,
    `SAYO Beauty  |  Colombo • Negombo • Kiribathgoda`,
    `sayo.worksofficial@gmail.com`,
    ``,
    `You are receiving this email because a booking was made at SAYO Beauty.`,
    `This is a transactional notification.`,
  );

  return lines.join("\n");
}

function buildConfirmationEmail(data: EmailData): { subject: string; html: string } {
  const safe = {
    name:   escapeHtml(data.name),
    phone:  escapeHtml(data.phone),
    branch: escapeHtml(data.branch),
  };

  const guestBlocks = data.guests.map((g, idx) => {
    const rows = g.services.map(s => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;color:#1a3a1a;font-size:13px;font-family:Arial,sans-serif;">
          ${escapeHtml(s.name)} ${s.qty > 1 ? `<span style="color:#6a8a6a;">×${s.qty}</span>` : ""}
          <br/><span style="font-size:11px;color:#6a8a6a;">Provider: ${escapeHtml(s.techName)}</span>
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;color:#1a6b1a;font-size:13px;font-family:Arial,sans-serif;text-align:right;white-space:nowrap;font-weight:bold;">
          LKR ${s.price.toLocaleString()}
        </td>
      </tr>`).join("");

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
  }).join("");

  const subject   = `Your SAYO Beauty Booking Confirmed — Ref ${data.bookingId}`;
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
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7f0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="580" cellpadding="0" cellspacing="0"
          style="max-width:580px;width:100%;border-radius:12px;overflow:hidden;border:1px solid #7bc47b;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#1a6b1a;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#a0e8a0;font-size:10px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;letter-spacing:1px;font-family:Arial,sans-serif;">
                Booking <strong style="color:#a0e8a0;">Confirmed</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.6);font-size:12px;font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#a0e8a0;">${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 22px;color:#1a3a1a;font-size:14px;line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#0a200a;">${safe.name}</strong>,<br/>
                Your walk-in appointment has been
                <strong style="color:#1a6b1a;">registered successfully</strong>.
                Please arrive on time — payment is collected at the salon.
              </p>

              <!-- DETAILS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 22px 6px;">
                    <p style="margin:0;color:#1a6b1a;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">
                      BOOKING DETAILS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;">Date</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">${formatDateLong(data.date)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;">Branch</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">${safe.branch}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;">Phone</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;">${safe.phone}</td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;font-size:12px;font-family:Arial,sans-serif;vertical-align:top;">Notes</td>
                        <td style="padding:6px 0;color:#2a4a2a;font-size:13px;font-family:Arial,sans-serif;">${escapeHtml(data.notes)}</td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- GUESTS + SERVICES -->
              <p style="margin:0 0 8px;color:#1a6b1a;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">
                SERVICES BOOKED
              </p>
              ${guestBlocks}

              <!-- GRAND TOTAL -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#1a6b1a;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:rgba(255,255,255,0.7);font-size:12px;font-weight:bold;font-family:Arial,sans-serif;">GRAND TOTAL</td>
                        <td style="text-align:right;color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">
                          LKR ${data.grandTotal.toLocaleString()}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- REMINDER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0 0 5px;color:#1a6b1a;font-size:10px;font-weight:bold;letter-spacing:2px;font-family:Arial,sans-serif;">REMINDER</p>
                    <p style="margin:0;color:#4a6a4a;font-size:12px;line-height:1.7;font-family:Arial,sans-serif;">
                      Please arrive at least <strong style="color:#1a3a1a;">5 minutes early</strong>.
                      Payment is collected at the salon. To cancel or reschedule, please contact us as soon as possible.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1a6b1a;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#a0e8a0;font-size:11px;font-weight:bold;letter-spacing:3px;font-family:Arial,sans-serif;">SAYO BEAUTY</p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.6);font-size:11px;font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:10px;line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because a booking was made at SAYO Beauty.<br/>
                This is a transactional notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/* ─────────────────────────────────────────
   SEND HELPER
───────────────────────────────────────── */
async function sendBookingEmail(
  to:        string,
  subject:   string,
  html:      string,
  text:      string,
  bookingId: string,
): Promise<void> {
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || "SAYO Beauty <sayo.worksofficial@gmail.com>",
      replyTo: process.env.SMTP_FROM || "SAYO Beauty <sayo.worksofficial@gmail.com>",
      to,
      subject,
      text,
      html,
      headers: {
        "List-Unsubscribe": "<mailto:sayo.worksofficial@gmail.com?subject=unsubscribe>",
        "List-Unsubscribe-Post":          "List-Unsubscribe=One-Click",
        "X-Mailer":                       "SAYO-Beauty-Booking/1.0",
        "X-Priority":                     "3",
        "X-MS-Exchange-Organization-SCL": "-1",
        "Precedence":                     "transactional",
        "Auto-Submitted":                 "auto-generated",
        "Message-ID":                     `<booking-${bookingId}-${Date.now()}@sayo.beauty>`,
        "X-Entity-Ref-ID":                `booking-${bookingId}`,
        "Feedback-ID":                    `booking:sayo-beauty`,
      },
    });
    console.log(`[EMAIL_SENT] → ${to} | ${subject}`);
  } catch (err) {
    console.error("[EMAIL_ERROR]", err);
  }
}

// ─────────────────────────────────────────────────────────────
// GET — fetch branches / services / customer lookup
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  try {
    if (type === "branches") {
      const branches = await prisma.tbl_LocationMaster.findMany({
        where: { Enable: true },
        select: { LocCode: true, LocDes: true, Address: true },
        orderBy: { LocDes: "asc" },
      });
      return NextResponse.json({ success: true, data: branches });
    }

    if (type === "services") {
      const locCode = searchParams.get("locCode");
      if (!locCode) {
        return NextResponse.json(
          { success: false, error: "locCode is required" },
          { status: 400 }
        );
      }

      const services = await prisma.tbl_ItemMaster.findMany({
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
          Category1: true,
          Category2: true,
          Category3: true,
          Category4: true,
          MasterUnitID: true,
        },
        orderBy: { ItemDes: "asc" },
      });

      const [cat1, cat2, cat3, cat4] = await Promise.all([
        prisma.tbl_ItemCategory1.findMany({ select: { CatCode: true, CatDes: true } }).catch(() => []),
        prisma.tbl_ItemCategory2.findMany({ select: { CatCode: true, CatDes: true } }).catch(() => []),
        prisma.tbl_ItemCategory3.findMany({ select: { CatCode: true, CatDes: true } }).catch(() => []),
        prisma.tbl_ItemCategory4.findMany({ select: { CatCode: true, CatDes: true } }).catch(() => []),
      ]);

      const c1Map = Object.fromEntries((cat1 as any[]).map((c: any) => [c.CatCode?.trim(), c.CatDes]));
      const c2Map = Object.fromEntries((cat2 as any[]).map((c: any) => [c.CatCode?.trim(), c.CatDes]));
      const c3Map = Object.fromEntries((cat3 as any[]).map((c: any) => [c.CatCode?.trim(), c.CatDes]));
      const c4Map = Object.fromEntries((cat4 as any[]).map((c: any) => [c.CatCode?.trim(), c.CatDes]));

      const enriched = services.map((s) => ({
        itemCode:       s.ItemCode.trim(),
        itemDes:        s.ItemDes.trim(),
        itemPrintDes:   s.ItemPrintDes?.trim() || s.ItemDes.trim(),
        price:          s.Retailprice,
        category1:      s.Category1?.trim() || "",
        category1Label: c1Map[s.Category1?.trim() || ""] || s.Category1?.trim() || "",
        category2:      s.Category2?.trim() || "",
        category2Label: c2Map[s.Category2?.trim() || ""] || s.Category2?.trim() || "",
        category3:      s.Category3?.trim() || "",
        category3Label: c3Map[s.Category3?.trim() || ""] || s.Category3?.trim() || "",
        category4:      s.Category4?.trim() || "",
        category4Label: c4Map[s.Category4?.trim() || ""] || s.Category4?.trim() || "",
      }));

      return NextResponse.json({ success: true, data: enriched });
    }

    if (type === "customer") {
      const phone = searchParams.get("phone")?.trim();
      if (!phone) {
        return NextResponse.json(
          { success: false, error: "phone is required" },
          { status: 400 }
        );
      }

      const customers = await prisma.$queryRaw<
        {
          CusCode:  string;
          CusName:  string;
          RegTel:   string;
          CusEmail: string | null;
          Gender:   string | null;
        }[]
      >`
        SELECT
          RTRIM(CusCode)  AS CusCode,
          RTRIM(CusName)  AS CusName,
          RTRIM(RegTel)   AS RegTel,
          RTRIM(CusEmail) AS CusEmail,
          RTRIM(Gender)   AS Gender
        FROM tbl_CustomerMaster
        WHERE RegTel LIKE ${"%" + phone + "%"}
          AND Enable    = 1
          AND BlackList = 0
        ORDER BY CreateDateTime DESC
        LIMIT 5
      `;

      const mapped = customers.map((c) => ({
        cusCode:  c.CusCode?.trim()  || "",
        cusName:  c.CusName?.trim()  || "",
        regTel:   c.RegTel?.trim()   || "",
        cusEmail: c.CusEmail?.trim() === " " ? "" : c.CusEmail?.trim() || "",
        gender:   c.Gender?.trim()   || "",
      }));

      return NextResponse.json({ success: true, data: mapped });
    }

    return NextResponse.json(
      { success: false, error: `Unknown type: ${type}` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[GET /api/appointmentform]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error", detail: err?.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST — create / confirm booking
// ─────────────────────────────────────────────────────────────

const MAX_BOOKING_ID_RETRIES = 5;

export async function POST(req: NextRequest) {
  let body: BookingPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // ── Basic validation ──────────────────────────────────────
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
        { status: 422 }
      );
    }
  }

  if (!Array.isArray(body.guests) || body.guests.length === 0) {
    return NextResponse.json(
      { success: false, error: "At least one guest with services is required" },
      { status: 422 }
    );
  }

  // ── Dedupe services PER GUEST before anything else ─────────
  // This prevents "Duplicate entry ... PRIMARY" crashes when the
  // same service item somehow appears twice for the same guest.
  body.guests = body.guests.map((g) => ({
    ...g,
    services: dedupeGuestServices(g.services || []),
  }));

  const hasServices = body.guests.some((g) => g.services.length > 0);
  if (!hasServices) {
    return NextResponse.json(
      { success: false, error: "At least one service must be selected" },
      { status: 422 }
    );
  }

  try {
    // ── Validate branch exists ──────────────────────────────
    const branchRows = await prisma.$queryRaw<{ LocCode: string; LocDes: string }[]>`
      SELECT RTRIM(LocCode) AS LocCode, RTRIM(LocDes) AS LocDes
      FROM tbl_LocationMaster
      WHERE RTRIM(LocCode) = ${body.locCode.trim()}
        AND Enable = 1
      LIMIT 1
    `;
    if (!branchRows[0]) {
      return NextResponse.json(
        { success: false, error: "Branch not found or disabled" },
        { status: 404 }
      );
    }
    const branchLabel = branchRows[0].LocDes || body.locCode;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 1 — Customer upsert OUTSIDE transaction (safe — not part
    //           of the unique-key collision surface)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const phone = body.regTel.trim();

    const existingRows = await prisma.$queryRaw<{ CusCode: string }[]>`
      SELECT RTRIM(CusCode) AS CusCode
      FROM tbl_CustomerMaster
      WHERE RTRIM(RegTel) = ${phone}
        AND Enable    = 1
        AND BlackList = 0
      LIMIT 1
    `;

    let cusCode: string;

    if (existingRows[0]) {
      cusCode = existingRows[0].CusCode.trim();

      await prisma.$executeRaw`
        UPDATE tbl_CustomerMaster
        SET
          CusName  = ${body.cusName.trim().substring(0, 200)},
          CusEmail = ${body.cusEmail?.trim()?.substring(0, 200) || " "},
          Gender   = ${body.gender || null}
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
          ${toChar(phone,   15)},
          ${body.cusName.trim().substring(0, 200)},
          ${" "},
          ${body.cusEmail?.trim()?.substring(0, 200) || " "},
          ${" "},
          ${" "},
          ${body.gender || null},
          ${body.userID || "0"},
          ${new Date()}
        )
      `;
    }

    // ── Prepare header note ─────────────────────────────────
    const mainGuest =
      body.guests.find((g) => g.guessID === "MAIN") ?? body.guests[0];

    const apptNote = [
      `Date:${body.appointmentDate}`,
      mainGuest?.timeSlot ? `Time:${mainGuest.timeSlot}` : "",
      body.remarks || "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim()
      .substring(0, 500) || " ";

    // ── Resolve service names (for email) ───────────────────
    const allItemCodes = [
      ...new Set(body.guests.flatMap((g) => g.services.map((s) => s.serviceItemID))),
    ];

    let itemNameMap: Record<string, string> = {};
    if (allItemCodes.length > 0) {
      const itemRows = await prisma.$queryRaw<
        { ItemCode: string; ItemDes: string; ItemPrintDes: string | null }[]
      >`
        SELECT RTRIM(ItemCode) AS ItemCode, RTRIM(ItemDes) AS ItemDes, RTRIM(ItemPrintDes) AS ItemPrintDes
        FROM tbl_ItemMaster
        WHERE RTRIM(LocCode) = ${body.locCode.trim()}
          AND RTRIM(ItemCode) IN (${Prisma.join(allItemCodes)})
      `;
      itemNameMap = Object.fromEntries(
        itemRows.map((i) => [i.ItemCode.trim(), (i.ItemPrintDes?.trim() || i.ItemDes.trim())])
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 2 — Header + Detail insert, WITH RETRY on
    //           BookingID collision (race-condition safe).
    //           BookingID is generated INSIDE the transaction
    //           with a FOR UPDATE lock, and if a duplicate-key
    //           error still slips through (rare edge cases),
    //           we retry with a freshly generated ID.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let bookingID = "";
    let detailRowCount = 0;
    let attempt = 0;
    let lastErr: any = null;

    while (attempt < MAX_BOOKING_ID_RETRIES) {
      attempt++;
      try {
        await prisma.$transaction(
          async (tx) => {
            // Generate a fresh BookingID *inside* the transaction,
            // locking the row-scan with FOR UPDATE to serialize
            // concurrent requests for the same branch.
            bookingID = await generateBookingIDTx(tx, body.locCode);

            await tx.$executeRaw`
              INSERT INTO tbl_bookingheder (
                LocCode,
                BookingID,
                CusCode,
                TxnDateTime,
                BookingTypeID,
                Status,
                ConfirmationType,
                AdvBookingPayMode,
                AdvBookingAmount,
                Remarks,
                UserID
              ) VALUES (
                ${toChar(body.locCode,            10)},
                ${toChar(bookingID,               10)},
                ${toChar(cusCode,                 10)},
                ${new Date()},
                ${toChar(body.bookingTypeID,      10)},
                ${toChar(body.status,             10)},
                ${toChar(body.confirmationType,    2)},
                ${body.advBookingPayMode?.trim()  || " "},
                ${body.advBookingAmount           ?? 0},
                ${apptNote},
                ${toChar(body.userID || "0",      10)}
              )
            `;

            // Build detail rows fresh for this attempt's bookingID
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
                    ${toChar(body.locCode,            10)},
                    ${toChar(bookingID,               10)},
                    ${guessID},
                    ${toChar(svc.serviceItemID,       10)},
                    ${toChar(String(svc.qty ?? 1),    10)},
                    ${svc.itemPrice ?? 0},
                    ${toChar(svc.techID || "0",       10)}
                  )
                `;
                detailRowCount++;
              }
            }
          },
          { timeout: 15000 }
        );

        // Success — break out of retry loop
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        if (isDuplicateKeyError(err) && attempt < MAX_BOOKING_ID_RETRIES) {
          console.warn(
            `[BOOKING] BookingID collision on attempt ${attempt} (${bookingID}) — retrying...`
          );
          continue; // loop again, will generate a new BookingID
        }
        throw err; // not a collision, or retries exhausted
      }
    }

    if (lastErr) {
      throw lastErr;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 3 — Send confirmation email (fire-and-forget)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const customerEmail = body.cusEmail?.trim();

    if (customerEmail) {
      const emailGuests: EmailGuestSection[] = body.guests
        .filter((g) => g.services.length > 0)
        .map((g) => {
          const svcRows = g.services.map((s) => ({
            name:     s.serviceName?.trim() || itemNameMap[s.serviceItemID.trim()] || s.serviceItemID,
            qty:      s.qty ?? 1,
            price:    s.itemPrice ?? 0, // already totalled in dedupeGuestServices
            techName: s.techName?.trim() || (s.techID && s.techID !== "0" ? s.techID : "To be assigned"),
          }));
          return {
            label:    g.label || g.guessID,
            gender:   g.gender || "",
            timeSlot: g.timeSlot || "",
            services: svcRows,
            subtotal: svcRows.reduce((a, s) => a + s.price, 0),
          };
        });

      const grandTotal = emailGuests.reduce((a, g) => a + g.subtotal, 0);

      const emailData: EmailData = {
        name:       body.cusName.trim(),
        email:      customerEmail,
        phone:      body.regTel.trim(),
        bookingId:  bookingID.trim(),
        branch:     branchLabel,
        date:       body.appointmentDate,
        guests:     emailGuests,
        grandTotal,
        notes:      body.remarks?.trim() || null,
      };

      const plainText          = buildPlainText(emailData);
      const { subject, html }  = buildConfirmationEmail(emailData);

      sendBookingEmail(customerEmail, subject, html, plainText, bookingID.trim());
    } else {
      console.warn(`[BOOKING] No email provided for booking ${bookingID.trim()} — skipping email.`);
    }

    // ── Success response ────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: "Booking created successfully",
      data: {
        bookingID,
        cusCode,
        locCode:     body.locCode,
        serviceRows: detailRowCount,
        refNumber:   `SB-${bookingID}-${Date.now().toString(36).toUpperCase()}`,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/appointmentform]", err);

    if (isDuplicateKeyError(err)) {
      return NextResponse.json(
        {
          success: false,
          error: "A booking conflict occurred. Please try submitting again.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error", detail: err?.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}