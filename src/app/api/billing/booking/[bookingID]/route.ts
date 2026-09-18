// src/app/api/billing/booking/[bookingID]/route.ts
// Everything the bill screen needs to build itself from the database instead
// of from URL parameters:
//
//   GET /api/billing/booking/:bookingID
//     → { success, booking: { bookingID, locCode, client…, date, timeSlot,
//                             status, mode, notes, billed, total,
//                             services: [ { guessID, itemCode, name, qty,
//                                           price, mainTech, supporters[] } ] } }
//
// The services list is read from tbl_bookingservicedetail (+ item master for
// the printed name, + user details for the technician) and is therefore
// read-only for the cashier: only the technician/materials flow may change it.
//
// Raw SQL + RTRIM() comparisons, same conventions as the other booking APIs.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { timeLabelFromValue } from "@/lib/legacyTime";
import { dedupeBookingDetailRows } from "@/lib/bookingReadModel";
import { createItemCodeIndex, legacyItemCode } from "@/lib/itemCode";
import {
  BillServiceRow,
  groupBookingServices,
} from "@/lib/billingReadModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (v: unknown) => String(v ?? "").trim();

interface BookingRow {
  BookingID: string;
  LocCode: string;
  CusCode: string;
  BookingDate: string | null;
  Remarks: string | null;
  Status: string;
  ConfirmationType: string;
  BillingTime: Date | null;
  Pax: number | null;
  CusName: string | null;
  RegTel: string | null;
  CusEmail: string | null;
  Gender: string | null;
}

interface ServiceRow extends BillServiceRow {
  ScheduleIndex: number | null;
}

interface SupportRow {
  ServiceItemID: string;
  TechID: string | null;
}

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = new Date(value as never);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function timeLabel(value: unknown): string | null {
  // Shared wall-clock reader — see src/lib/legacyTime.ts.
  return timeLabelFromValue(value);
}

function timeFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Time:([\d:]+\s*[AaPp][Mm])/i);
  return match ? match[1].trim() : null;
}

function dateFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Date:(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

const SCHEDULE_PREFIX = /\[\[SCHEDULE:.*?\]\]/gi;

/** Remarks minus the booking-schedule / legacy date-time prefixes. */
function notesFromRemarks(remarks: string | null): string {
  if (!remarks) return "";
  return remarks
    .replace(SCHEDULE_PREFIX, "")
    .replace(/Date:\d{4}-\d{2}-\d{2}/gi, "")
    .replace(/Time:[\d:]+\s*[AaPp][Mm]/gi, "")
    .trim();
}

function modeFromConfirmationType(
  raw: string,
): "pre_booked" | "without_confirmation" {
  const value = trim(raw).toLowerCase();
  if (["wo", "wi", "walkin", "walk-in", "without_confirmation"].includes(value)) {
    return "without_confirmation";
  }
  return "pre_booked";
}

function statusFromDb(raw: string): string {
  const value = trim(raw).toLowerCase();
  if (value === "confirmed" || value === "confirm") return "confirmed";
  if (value === "cancelled" || value === "cancel") return "cancelled";
  if (value === "ongoing" || value === "in progress") return "ongoing";
  if (value === "done" || value === "completed") return "done";
  return "pending";
}

function isBilled(value: Date | string | null): boolean {
  if (value === null || value === undefined) return false;
  const time = new Date(value as never).getTime();
  if (Number.isNaN(time)) return false;
  // Legacy rows use the 1900-01-01 zero date instead of NULL.
  return time > Date.parse("1900-01-02T00:00:00Z");
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    const headerRows = await prisma.$queryRaw<BookingRow[]>`
      SELECT
        RTRIM(h.BookingID)        AS BookingID,
        RTRIM(h.LocCode)          AS LocCode,
        RTRIM(h.CusCode)          AS CusCode,
        DATE_FORMAT(h.BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
        h.Remarks                 AS Remarks,
        RTRIM(h.Status)           AS Status,
        RTRIM(h.ConfirmationType) AS ConfirmationType,
        h.BillingTime             AS BillingTime,
        h.Pax                     AS Pax,
        RTRIM(c.CusName)          AS CusName,
        RTRIM(c.RegTel)           AS RegTel,
        RTRIM(c.CusEmail)         AS CusEmail,
        RTRIM(c.Gender)           AS Gender
      FROM tbl_bookingheder h
      LEFT JOIN tbl_customermaster c
        ON RTRIM(c.CusCode) = RTRIM(h.CusCode)
      WHERE RTRIM(h.BookingID) = ${bookingID}
      LIMIT 1
    `;

    const header = headerRows[0];
    if (!header) {
      return NextResponse.json(
        { success: false, message: "Booking not found" },
        { status: 404 },
      );
    }

    const locCode = trim(header.LocCode);

    /* The booking detail rows are read WITHOUT the item-master join on purpose:
       a join on the item code returns the same detail row once per matching
       item, which multiplies the services on the bill. Names and technicians
       are resolved in separate, non-multiplying lookups instead. */
    const detailRows = await prisma.$queryRaw<ServiceRow[]>`
      SELECT
        RTRIM(d.GuessID)       AS GuessID,
        RTRIM(d.ServiceItemID) AS ServiceItemID,
        d.Qty                  AS Qty,
        d.ItemPrice            AS ItemPrice,
        RTRIM(d.TechID)        AS TechID,
        d.ScheduleIndex        AS ScheduleIndex
      FROM tbl_bookingservicedetail d
      WHERE RTRIM(d.BookingID) = ${bookingID}
        AND RTRIM(d.LocCode)   = ${locCode}
      ORDER BY d.ScheduleIndex, RTRIM(d.GuessID)
    `;

    // One row per (guest, service) — the real key of the detail table.
    const serviceRows = dedupeBookingDetailRows(detailRows);

    const supportRows = await prisma.$queryRaw<SupportRow[]>`
      SELECT
        RTRIM(a.ServiceItemID) AS ServiceItemID,
        RTRIM(a.TechID)        AS TechID
      FROM Tbl_BookingServiceItemAddTech a
      WHERE RTRIM(a.BookingID) = ${bookingID}
    `;

    const itemCodes = Array.from(
      new Set(serviceRows.map((row) => trim(row.ServiceItemID)).filter(Boolean)),
    );
    const techIDs = Array.from(
      new Set(
        [
          ...serviceRows.map((row) => trim(row.TechID)),
          ...supportRows.map((row) => trim(row.TechID)),
        ].filter((id) => id && id !== "0"),
      ),
    );

    // Codes exactly as STORED on the detail rows: the full 15-character code
    // after scripts/migrate-itemcode-char15.sql, the legacy 10-character prefix
    // on older rows. The query returns the candidates, the index below picks
    // the one that really belongs to the stored code.
    const legacyItemCodes = Array.from(
      new Set(itemCodes.map((code) => legacyItemCode(code)).filter(Boolean)),
    );

    const itemRows = await prisma.$queryRaw<
      { ItemCode: string; ItemDes: string | null; ItemPrintDes: string | null }[]
    >`
      SELECT
        RTRIM(ItemCode)      AS ItemCode,
        RTRIM(ItemDes)       AS ItemDes,
        RTRIM(ItemPrintDes)  AS ItemPrintDes
      FROM tbl_itemmaster
      WHERE RTRIM(LocCode) = ${locCode}
        AND (
          RTRIM(ItemCode) IN (${Prisma.join(itemCodes.length ? itemCodes : [""])})
          OR LEFT(RTRIM(ItemCode), 10) IN (${Prisma.join(legacyItemCodes.length ? legacyItemCodes : [""])})
        )
      ORDER BY RTRIM(ItemCode)
    `;

    const techRows = techIDs.length
      ? await prisma.$queryRaw<{ UserId: string; UserName: string | null }[]>`
          SELECT RTRIM(UserId) AS UserId, RTRIM(UserName) AS UserName
          FROM tbl_userdetails
          WHERE RTRIM(UserId) IN (${Prisma.join(techIDs)})
        `
      : [];

    const userNameById = new Map<string, string>();
    techRows.forEach((row) => {
      const id = trim(row.UserId).toUpperCase();
      const name = trim(row.UserName);
      if (id && name && !userNameById.has(id)) userNameById.set(id, name);
    });

    // Stored item code → printed name. The full code wins; a legacy
    // 10-character code resolves through its prefix only while that prefix
    // belongs to exactly one item, so a shared prefix can never name the wrong
    // service on the bill.
    const itemIndex = createItemCodeIndex(
      itemRows
        .map((row) => ({
          code: trim(row.ItemCode),
          name: trim(row.ItemPrintDes) || trim(row.ItemDes),
        }))
        .filter((entry) => entry.code && entry.name),
      (entry) => entry.code,
    );

    const namedServiceRows: BillServiceRow[] = serviceRows.map((row) => {
      const techID = trim(row.TechID);
      return {
        GuessID: row.GuessID,
        ServiceItemID: row.ServiceItemID,
        Qty: row.Qty,
        ItemPrice: row.ItemPrice,
        TechID: row.TechID,
        ItemDes: itemIndex.get(row.ServiceItemID)?.name || null,
        ItemPrintDes: null,
        TechName: userNameById.get(techID.toUpperCase()) || null,
      };
    });

    // Supporting technicians are stored per (guest, service item). Group them
    // by service item so each service line can show who helped.
    const supportRowsWithNames = supportRows.map((row) => ({
      ServiceItemID: row.ServiceItemID,
      TechName: userNameById.get(trim(row.TechID).toUpperCase()) || trim(row.TechID),
    }));
    const supportersByItem = new Map<string, string[]>();
    supportRowsWithNames.forEach((row) => {
      const key = trim(row.ServiceItemID).toUpperCase();
      const name = trim(row.TechName);
      if (!key || !name) return;
      const current = supportersByItem.get(key) || [];
      if (!current.includes(name)) current.push(name);
      supportersByItem.set(key, current);
    });

    // A booking stores one row per (guest, service); the helper collapses those
    // into one line per service so the bill matches the appointment screens and
    // never repeats the same service once per guest.
    const services = groupBookingServices(
      namedServiceRows,
      supportersByItem,
      Array.from(
        new Set(supportRowsWithNames.map((r) => trim(r.TechName)).filter(Boolean)),
      ),
    );

    const bookingDate = trim(header.BookingDate) || null;
    const storedTime = timeLabel(bookingDate);
    const date =
      dateOnly(bookingDate) || dateFromRemarks(header.Remarks) || "";
    const timeSlot =
      (storedTime && storedTime !== "12:00 AM" ? storedTime : null) ||
      timeFromRemarks(header.Remarks) ||
      storedTime ||
      "—";

    const total = services.reduce(
      (sum, service) => sum + service.qty * service.price,
      0,
    );

    return NextResponse.json({
      success: true,
      booking: {
        bookingID: trim(header.BookingID),
        locCode,
        cusCode: trim(header.CusCode),
        clientName: trim(header.CusName) || "Unknown",
        clientPhone: trim(header.RegTel) || "—",
        clientEmail: trim(header.CusEmail),
        gender: trim(header.Gender),
        date,
        timeSlot,
        status: statusFromDb(header.Status),
        mode: modeFromConfirmationType(header.ConfirmationType),
        notes: notesFromRemarks(header.Remarks),
        pax: Number(header.Pax ?? 0) || 0,
        billed: isBilled(header.BillingTime),
        total,
        services,
      },
    });
  } catch (err) {
    console.error("[billing-booking] GET failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load the booking" },
      { status: 500 },
    );
  }
}
