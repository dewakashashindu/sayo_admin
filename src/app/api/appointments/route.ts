// src/app/api/appointments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toChar(s: string, len: number): string {
  return s.substring(0, len).padEnd(len, " ");
}

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface RawHeader {
  BookingID:        string;
  LocCode:          string;
  CusCode:          string;
  TxnDateTime:      Date | string;
  BookingTypeID:    string;
  Status:           string;
  ConfirmationType: string;
  Remarks:          string | null;
  UserID:           string | null;
}

interface RawDetail {
  BookingID:     string;
  LocCode:       string;
  GuessID:       string;
  ServiceItemID: string;
  Qty:           string | number;
  ItemPrice:     number;
  TechID:        string;
}

interface RawCustomer {
  CusCode:  string;
  CusName:  string;
  RegTel:   string;
  CusEmail: string | null;
  Gender:   string | null;
}

interface RawItem {
  ItemCode:     string;
  ItemDes:      string;
  ItemPrintDes: string | null;
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function mapStatus(raw: string): "confirmed" | "pending" | "cancelled" | "ongoing" {
  const s = (raw || "").toLowerCase().trim();
  if (s === "confirmed" || s === "confirm") return "confirmed";
  if (s === "cancelled" || s === "cancel")  return "cancelled";
  if (s === "ongoing")                      return "ongoing";
  return "pending";
}

function mapMode(raw: string): "pre_booked" | "without_confirmation" {
  const s = (raw || "").toLowerCase().trim();
  if (s === "wi" || s === "walkin" || s === "without_confirmation") {
    return "without_confirmation";
  }
  return "pre_booked";
}

function mapStatusToDB(status: string): string {
  if (status === "confirmed") return "CONFIRMED";
  if (status === "cancelled") return "CANCELLED";
  if (status === "ongoing")   return "ONGOING";
  return "PENDING";
}

function extractDateFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const m = remarks.match(/Date:(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractTimeFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const m = remarks.match(/Time:([\d:]+\s*[AaPp][Mm])/);
  return m ? m[1].trim() : null;
}

function extractNotes(remarks: string | null): string {
  if (!remarks) return "";
  return remarks
    .replace(/Date:\d{4}-\d{2}-\d{2}/g, "")
    .replace(/Time:[\d:]+\s*[AaPp][Mm]/g, "")
    .trim();
}

/* ─────────────────────────────────────────────────────────────
   GET — fetch bookings for a given date
───────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date    = searchParams.get("date");
  const locCode = searchParams.get("locCode");

  try {
    let headers: RawHeader[];

    if (locCode && locCode !== "ALL") {
      headers = await prisma.$queryRaw<RawHeader[]>`
        SELECT
          RTRIM(BookingID)        AS BookingID,
          RTRIM(LocCode)          AS LocCode,
          RTRIM(CusCode)          AS CusCode,
          TxnDateTime,
          RTRIM(BookingTypeID)    AS BookingTypeID,
          RTRIM(Status)           AS Status,
          RTRIM(ConfirmationType) AS ConfirmationType,
          Remarks,
          RTRIM(UserID)           AS UserID
        FROM tbl_bookingheder
        WHERE RTRIM(LocCode) = ${locCode.trim()}
        ORDER BY TxnDateTime DESC
        LIMIT 500
      `;
    } else {
      headers = await prisma.$queryRaw<RawHeader[]>`
        SELECT
          RTRIM(BookingID)        AS BookingID,
          RTRIM(LocCode)          AS LocCode,
          RTRIM(CusCode)          AS CusCode,
          TxnDateTime,
          RTRIM(BookingTypeID)    AS BookingTypeID,
          RTRIM(Status)           AS Status,
          RTRIM(ConfirmationType) AS ConfirmationType,
          Remarks,
          RTRIM(UserID)           AS UserID
        FROM tbl_bookingheder
        ORDER BY TxnDateTime DESC
        LIMIT 500
      `;
    }

    const filtered = date
      ? headers.filter(h => extractDateFromRemarks(h.Remarks) === date)
      : headers;

    if (filtered.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const bookingIDList = filtered.map(h => h.BookingID.trim());
    const locCodeList   = [...new Set(filtered.map(h => h.LocCode.trim()))];

    const bidIn  = bookingIDList.map(id => `'${id.replace(/'/g,"''")}'`).join(",");
    const locIn  = locCodeList.map(l  => `'${l.replace(/'/g,"''")}'`).join(",");

    const details: RawDetail[] = await prisma.$queryRawUnsafe<RawDetail[]>(`
      SELECT
        RTRIM(BookingID)     AS BookingID,
        RTRIM(LocCode)       AS LocCode,
        RTRIM(GuessID)       AS GuessID,
        RTRIM(ServiceItemID) AS ServiceItemID,
        Qty,
        ItemPrice,
        RTRIM(TechID)        AS TechID
      FROM tbl_bookingdetail
      WHERE RTRIM(BookingID) IN (${bidIn})
        AND RTRIM(LocCode)   IN (${locIn})
    `);

    const cusCodeList = [...new Set(filtered.map(h => h.CusCode.trim()))];
    const cusIn = cusCodeList.map(c => `'${c.replace(/'/g,"''")}'`).join(",");

    const customers: RawCustomer[] = await prisma.$queryRawUnsafe<RawCustomer[]>(`
      SELECT
        RTRIM(CusCode)  AS CusCode,
        RTRIM(CusName)  AS CusName,
        RTRIM(RegTel)   AS RegTel,
        RTRIM(CusEmail) AS CusEmail,
        RTRIM(Gender)   AS Gender
      FROM tbl_CustomerMaster
      WHERE RTRIM(CusCode) IN (${cusIn})
    `);

    const itemCodeList = [...new Set(details.map(d => d.ServiceItemID.trim()))];
    let items: RawItem[] = [];

    if (itemCodeList.length > 0) {
      const itemIn = itemCodeList.map(i => `'${i.replace(/'/g,"''")}'`).join(",");
      items = await prisma.$queryRawUnsafe<RawItem[]>(`
        SELECT
          RTRIM(ItemCode)     AS ItemCode,
          RTRIM(ItemDes)      AS ItemDes,
          RTRIM(ItemPrintDes) AS ItemPrintDes
        FROM tbl_ItemMaster
        WHERE RTRIM(ItemCode) IN (${itemIn})
          AND RTRIM(LocCode)  IN (${locIn})
      `);
    }

    const cusMap = new Map<string, RawCustomer>();
    customers.forEach(c => cusMap.set(c.CusCode.trim(), c));

    const itemMap = new Map<string, string>();
    items.forEach(i => {
      itemMap.set(
        i.ItemCode.trim(),
        i.ItemPrintDes?.trim() || i.ItemDes.trim()
      );
    });

    const detailMap = new Map<string, RawDetail[]>();
    details.forEach(d => {
      const key = d.BookingID.trim();
      if (!detailMap.has(key)) detailMap.set(key, []);
      detailMap.get(key)!.push(d);
    });

    const result = filtered.map(h => {
      const bID  = h.BookingID.trim();
      const cus  = cusMap.get(h.CusCode.trim());
      const dets = detailMap.get(bID) || [];

      const serviceNames = [
        ...new Set(
          dets.map(d => itemMap.get(d.ServiceItemID.trim()) || d.ServiceItemID.trim())
        ),
      ];

      const totalPrice = dets.reduce((sum, d) => sum + (Number(d.ItemPrice) || 0), 0);

      const firstDet     = dets[0];
      const techID       = firstDet?.TechID?.trim() || "0";
      const providerName = techID !== "0" ? techID : "Unassigned";

      const guests = [...new Set(dets.map(d => d.GuessID.trim()))];

      const apptDate = extractDateFromRemarks(h.Remarks) ||
        new Date(h.TxnDateTime).toISOString().split("T")[0];
      const apptTime = extractTimeFromRemarks(h.Remarks) || "9:00 AM";

      return {
        id:           bID,
        bookingID:    bID,
        locCode:      h.LocCode.trim(),
        cusCode:      h.CusCode.trim(),
        clientName:   cus?.CusName?.trim()  || "Unknown",
        clientPhone:  cus?.RegTel?.trim()   || "",
        clientEmail:  cus?.CusEmail?.trim() || "",
        gender:       cus?.Gender?.trim()   || "",
        providerName,
        techID,
        serviceName:  serviceNames.join(", ") || "Service",
        serviceNames,
        date:         apptDate,
        timeSlot:     apptTime,
        status:       mapStatus(h.Status),
        mode:         mapMode(h.ConfirmationType),
        location:     h.LocCode.trim(),
        duration:     Math.max(30, 30 * dets.length),
        price:        totalPrice,
        notes:        extractNotes(h.Remarks),
        guests,
        detailCount:  dets.length,
        txnDateTime:  new Date(h.TxnDateTime).toISOString(),
      };
    });

    return NextResponse.json({ success: true, data: result });

  } catch (err: any) {
    console.error("[GET /api/appointments]", err);
    return NextResponse.json(
      { success: false, error: err?.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

/* ─────────────────────────────────────────────────────────────
   PATCH — update booking status AND/OR reschedule (date/time/provider)
   NEW: supports drag-drop reschedule + form-based reschedule flow
───────────────────────────────────────────────────────────── */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookingID, locCode, status, date, timeSlot, techID, providerName } = body;

    if (!bookingID || !locCode) {
      return NextResponse.json(
        { success: false, error: "bookingID, locCode are required" },
        { status: 422 }
      );
    }

    const newTechID = techID || providerName; // accept either field name

    /* ── 1. Status update ── */
    if (status) {
      const dbStatus = mapStatusToDB(status);
      await prisma.$executeRaw`
        UPDATE tbl_bookingheder
        SET Status = ${toChar(dbStatus, 10)}
        WHERE RTRIM(BookingID) = ${bookingID.trim()}
          AND RTRIM(LocCode)   = ${locCode.trim()}
      `;
    }

    /* ── 2. Reschedule: update Date/Time inside Remarks ── */
    if (date || timeSlot) {
      const rows = await prisma.$queryRaw<{ Remarks: string | null }[]>`
        SELECT Remarks FROM tbl_bookingheder
        WHERE RTRIM(BookingID) = ${bookingID.trim()}
          AND RTRIM(LocCode)   = ${locCode.trim()}
      `;
      const currentRemarks = rows[0]?.Remarks || "";
      const notes   = extractNotes(currentRemarks);
      const newDate = date     || extractDateFromRemarks(currentRemarks) || "";
      const newTime = timeSlot || extractTimeFromRemarks(currentRemarks) || "";
      const newRemarks = `Date:${newDate} Time:${newTime} ${notes}`.trim();

      await prisma.$executeRaw`
        UPDATE tbl_bookingheder
        SET Remarks = ${newRemarks}
        WHERE RTRIM(BookingID) = ${bookingID.trim()}
          AND RTRIM(LocCode)   = ${locCode.trim()}
      `;
    }

    /* ── 3. Provider change: update TechID on all detail rows ── */
    if (newTechID) {
      await prisma.$executeRaw`
        UPDATE tbl_bookingdetail
        SET TechID = ${toChar(String(newTechID), 10)}
        WHERE RTRIM(BookingID) = ${bookingID.trim()}
          AND RTRIM(LocCode)   = ${locCode.trim()}
      `;
    }

    return NextResponse.json({
      success: true,
      message: "Booking updated successfully",
    });

  } catch (err: any) {
    console.error("[PATCH /api/appointments]", err);
    return NextResponse.json(
      { success: false, error: err?.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}