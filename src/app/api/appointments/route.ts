// src/app/api/appointments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { sendAppointmentSMS } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function toChar(value: string, length: number): string {
  return String(value ?? "")
    .substring(0, length)
    .padEnd(length, " ");
}

function trimValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

/* Server-side conflict guard: rejects a reschedule that would move a booking
   onto a technician's already-booked slot. */
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

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const parsed = new Date(value as any);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function dateTimeIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = new Date(value as any);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function timeLabelFromDateTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const match = value.match(/[ T](\d{1,2}):(\d{2})(?::\d{2})?/);
    if (match) {
      let hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const period = hour >= 12 ? "PM" : "AM";
        hour %= 12;
        if (hour === 0) hour = 12;
        return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
      }
    }
  }

  const parsed = new Date(value as any);
  if (Number.isNaN(parsed.getTime())) return null;

  const period = parsed.getHours() >= 12 ? "PM" : "AM";
  let hour = parsed.getHours() % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(parsed.getMinutes()).padStart(2, "0")} ${period}`;
}

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

function mapStatus(
  raw: string,
): "confirmed" | "pending" | "cancelled" | "ongoing" {
  const status = trimValue(raw).toLowerCase();

  if (status === "confirmed" || status === "confirm") return "confirmed";
  if (status === "cancelled" || status === "cancel") return "cancelled";
  if (status === "ongoing" || status === "in progress") return "ongoing";
  return "pending";
}

function mapMode(raw: string): "pre_booked" | "without_confirmation" {
  const mode = trimValue(raw).toLowerCase();

  if (
    mode === "wi" ||
    mode === "walkin" ||
    mode === "walk-in" ||
    mode === "without_confirmation"
  ) {
    return "without_confirmation";
  }

  return "pre_booked";
}

function mapStatusToDb(
  status: string,
): "PENDING" | "CONFIRMED" | "CANCELLED" | "ONGOING" {
  const normalized = trimValue(status).toLowerCase();

  if (normalized === "confirmed") return "CONFIRMED";
  if (normalized === "cancelled" || normalized === "cancel") return "CANCELLED";
  if (normalized === "ongoing") return "ONGOING";
  return "PENDING";
}

function extractDateFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Date:(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

function extractTimeFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Time:([\d:]+\s*[AaPp][Mm])/i);
  return match ? match[1].trim() : null;
}

function appointmentTimeLabel(
  bookingDate: unknown,
  remarks: string | null,
): string {
  const storedTime = timeLabelFromDateTime(bookingDate);
  const legacyTime = extractTimeFromRemarks(remarks);

  // A DATE column upgraded to DATETIME reads as midnight until its legacy
  // Remarks time is backfilled. Prefer BookingDate for all real DATETIME
  // values, while keeping that one compatibility case during migration.
  if (storedTime && storedTime !== "12:00 AM") return storedTime;
  return legacyTime || storedTime || "9:00 AM";
}

function extractNotes(remarks: string | null): string {
  if (!remarks) return "";

  return remarks
    .replace(/Date:\d{4}-\d{2}-\d{2}/gi, "")
    .replace(/Time:[\d:]+\s*[AaPp][Mm]/gi, "")
    .trim();
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

interface RawHeader {
  BookingID: string;
  LocCode: string;
  CusCode: string;
  BookingDate: Date | string | null;
  TxnDateTime: Date | string;
  BookingTypeID: string;
  Status: string;
  ConfirmationType: string;
  AdvBookingPayMode: string | null;
  AdvBookingAmount: number | string | null;
  Remarks: string | null;
  UserID: string | null;
  CancelledDate: Date | string | null;
  CancelledBy: string | null;
  Pax: number | string | null;
  Confirmed: boolean | number | string | null;
  ConfirmedBy: string | null;
  ConfirmedDate: Date | string | null;
  CheckInTime: Date | string | null;
  BillingTime: Date | string | null;
}

interface RawDetail {
  BookingID: string;
  LocCode: string;
  GuessID: string;
  ServiceItemID: string;
  Qty: string | number;
  ItemPrice: number | string;
  TechID: string;
}

interface RawCustomer {
  CusCode: string;
  CusName: string;
  RegTel: string;
  CusEmail: string | null;
  Gender: string | null;
}

interface RawItem {
  ItemCode: string;
  ItemDes: string;
  ItemPrintDes: string | null;
  Category1: string | null;
  Category2: string | null;
  Category3: string | null;
  Category4: string | null;
}

interface RawTechnician {
  UserId: string;
  UserName: string;
  WorkingLocID: string | null;
}

interface RawLocation {
  LocCode: string;
  LocDes: string;
}

interface RawCategory {
  CatCode: string;
  CatDes: string;
}

interface RawBookingType {
  BooikingTypeID: string;
  BookingTypeDes: string;
}

interface RawSMSBooking {
  CusName: string | null;
  RegTel: string | null;
  LocDes: string | null;
  BookingDate: Date | string | null;
  Remarks: string | null;
}

async function readHeaders(locCode?: string | null): Promise<RawHeader[]> {
  if (locCode && locCode !== "ALL") {
    return prisma.$queryRaw<RawHeader[]>`
      SELECT
        RTRIM(BookingID)        AS BookingID,
        RTRIM(LocCode)          AS LocCode,
        RTRIM(CusCode)          AS CusCode,
        DATE_FORMAT(BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
        TxnDateTime,
        RTRIM(BookingTypeID)    AS BookingTypeID,
        RTRIM(Status)           AS Status,
        RTRIM(ConfirmationType) AS ConfirmationType,
        RTRIM(AdvBookingPayMode) AS AdvBookingPayMode,
        AdvBookingAmount,
        Remarks,
        RTRIM(UserID)           AS UserID,
        CancelledDate,
        RTRIM(CancelledBy)      AS CancelledBy,
        Pax,
        Confirmed,
        RTRIM(ConfirmedBy)      AS ConfirmedBy,
        ConfirmedDate,
        CheckInTime,
        BillingTime
      FROM tbl_bookingheder
      WHERE LocCode = ${locCode.trim()}
      ORDER BY TxnDateTime DESC
      LIMIT 500
    `;
  }

  return prisma.$queryRaw<RawHeader[]>`
    SELECT
      RTRIM(BookingID)        AS BookingID,
      RTRIM(LocCode)          AS LocCode,
      RTRIM(CusCode)          AS CusCode,
      DATE_FORMAT(BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
      TxnDateTime,
      RTRIM(BookingTypeID)    AS BookingTypeID,
      RTRIM(Status)           AS Status,
      RTRIM(ConfirmationType) AS ConfirmationType,
      RTRIM(AdvBookingPayMode) AS AdvBookingPayMode,
      AdvBookingAmount,
      Remarks,
      RTRIM(UserID)           AS UserID,
      CancelledDate,
      RTRIM(CancelledBy)      AS CancelledBy,
      Pax,
      Confirmed,
      RTRIM(ConfirmedBy)      AS ConfirmedBy,
      ConfirmedDate,
      CheckInTime,
      BillingTime
    FROM tbl_bookingheder
    ORDER BY TxnDateTime DESC
    LIMIT 500
  `;
}

function quotedList(values: string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(",");
}

/* GET /api/appointments */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedDate = searchParams.get("date");
  const locCode = searchParams.get("locCode");

  if (searchParams.get("meta") === "filters") {
    try {
      const [locations, categories, bookingTypes, technicians] =
        await Promise.all([
          prisma.$queryRaw<RawLocation[]>`
            SELECT RTRIM(LocCode) AS LocCode, RTRIM(LocDes) AS LocDes
            FROM tbl_locationmaster
            WHERE Enable = 1
            ORDER BY LocDes
          `,
          prisma.$queryRaw<RawCategory[]>`
            SELECT RTRIM(CatCode) AS CatCode, RTRIM(CatDes) AS CatDes
            FROM tbl_itemcategory1
            WHERE Enable = 1
            ORDER BY CatDes
          `,
          prisma.$queryRaw<RawBookingType[]>`
            SELECT
              RTRIM(BooikingTypeID) AS BooikingTypeID,
              RTRIM(BookingTypeDes) AS BookingTypeDes
            FROM tbl_bookingtypes
            WHERE Enabel = 1
            ORDER BY BookingTypeDes
          `,
          prisma.$queryRaw<RawTechnician[]>`
            SELECT
              RTRIM(UserId) AS UserId,
              RTRIM(UserName) AS UserName,
              RTRIM(WorkingLocID) AS WorkingLocID
            FROM tbl_userdetails
            WHERE Enable = 1
            ORDER BY UserName
          `,
        ]);

      return NextResponse.json({
        success: true,
        locations,
        categories,
        bookingTypes,
        technicians,
      });
    } catch (err: any) {
      console.error("[GET /api/appointments?meta=filters]", err);
      return NextResponse.json(
        { success: false, error: err?.message || "Failed to load filters" },
        { status: 500 },
      );
    }
  }

  try {
    const headers = await readHeaders(locCode);

    // BookingDate is now the source of truth. The Remarks fallback keeps old
    // rows created before BookingDate was added visible on the calendar.
    const filtered = requestedDate
      ? headers.filter(
          (header) =>
            dateOnly(header.BookingDate) === requestedDate ||
            (!header.BookingDate &&
              extractDateFromRemarks(header.Remarks) === requestedDate),
        )
      : headers;

    if (filtered.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const bookingIDList = [
      ...new Set(filtered.map((header) => trimValue(header.BookingID))),
    ];
    const locCodeList = [
      ...new Set(filtered.map((header) => trimValue(header.LocCode))),
    ];

    const bidIn = quotedList(bookingIDList);
    const locIn = quotedList(locCodeList);

    const details = await prisma.$queryRawUnsafe<RawDetail[]>(`
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

    const cusCodeList = [
      ...new Set(filtered.map((header) => trimValue(header.CusCode))),
    ];
    const customers = await prisma.$queryRawUnsafe<RawCustomer[]>(`
      SELECT
        RTRIM(CusCode)  AS CusCode,
        RTRIM(CusName)  AS CusName,
        RTRIM(RegTel)   AS RegTel,
        RTRIM(CusEmail) AS CusEmail,
        RTRIM(Gender)   AS Gender
      FROM tbl_customermaster
      WHERE RTRIM(CusCode) IN (${quotedList(cusCodeList)})
    `);

    const itemCodeList = [
      ...new Set(details.map((detail) => trimValue(detail.ServiceItemID))),
    ];
    let items: RawItem[] = [];

    if (itemCodeList.length > 0) {
      items = await prisma.$queryRawUnsafe<RawItem[]>(`
        SELECT
          RTRIM(ItemCode)     AS ItemCode,
          RTRIM(ItemDes)      AS ItemDes,
          RTRIM(ItemPrintDes) AS ItemPrintDes,
          RTRIM(Category1)    AS Category1,
          RTRIM(Category2)    AS Category2,
          RTRIM(Category3)    AS Category3,
          RTRIM(Category4)    AS Category4
        FROM tbl_itemmaster
        WHERE RTRIM(ItemCode) IN (${quotedList(itemCodeList)})
          AND RTRIM(LocCode)  IN (${locIn})
      `);
    }

    const techIDList = [
      ...new Set(
        details
          .map((detail) => trimValue(detail.TechID))
          .filter((techID) => techID && techID !== "0"),
      ),
    ];
    let technicians: RawTechnician[] = [];

    if (techIDList.length > 0) {
      technicians = await prisma.$queryRawUnsafe<RawTechnician[]>(`
        SELECT
          RTRIM(UserId) AS UserId,
          RTRIM(UserName) AS UserName,
          RTRIM(WorkingLocID) AS WorkingLocID
        FROM tbl_userdetails
        WHERE RTRIM(UserId) IN (${quotedList(techIDList)})
      `);
    }

    const customerMap = new Map<string, RawCustomer>();
    customers.forEach((customer) =>
      customerMap.set(trimValue(customer.CusCode), customer),
    );

    const itemMap = new Map<string, string>();
    items.forEach((item) =>
      itemMap.set(
        trimValue(item.ItemCode),
        trimValue(item.ItemPrintDes) || trimValue(item.ItemDes),
      ),
    );

    const itemCategoryMap = new Map<string, string[]>();
    items.forEach((item) => {
      const codes = [
        item.Category1,
        item.Category2,
        item.Category3,
        item.Category4,
      ]
        .map((code) => trimValue(code))
        .filter(Boolean);
      itemCategoryMap.set(trimValue(item.ItemCode), codes);
    });

    const technicianMap = new Map<string, string>();
    technicians.forEach((technician) =>
      technicianMap.set(
        trimValue(technician.UserId),
        trimValue(technician.UserName),
      ),
    );

    const detailMap = new Map<string, RawDetail[]>();
    details.forEach((detail) => {
      const key = `${trimValue(detail.LocCode)}|${trimValue(detail.BookingID)}`;
      const rows = detailMap.get(key) ?? [];
      rows.push(detail);
      detailMap.set(key, rows);
    });

    const data = filtered.map((header) => {
      const bookingID = trimValue(header.BookingID);
      const branchCode = trimValue(header.LocCode);
      const customer = customerMap.get(trimValue(header.CusCode));
      const bookingDetails = detailMap.get(`${branchCode}|${bookingID}`) ?? [];

      const serviceNames = [
        ...new Set(
          bookingDetails.map(
            (detail) =>
              itemMap.get(trimValue(detail.ServiceItemID)) ||
              trimValue(detail.ServiceItemID),
          ),
        ),
      ];

      const totalPrice = bookingDetails.reduce(
        (sum, detail) => sum + (Number(detail.ItemPrice) || 0),
        0,
      );

      const firstDetail = bookingDetails[0];
      const techID = trimValue(firstDetail?.TechID) || "0";
      const providerName =
        techID !== "0" ? technicianMap.get(techID) || techID : "Unassigned";
      const guests = [
        ...new Set(bookingDetails.map((detail) => trimValue(detail.GuessID))),
      ];
      const techIDs = [
        ...new Set(
          bookingDetails
            .map((detail) => trimValue(detail.TechID))
            .filter((techID) => techID && techID !== "0"),
        ),
      ];
      const categoryCodes = [
        ...new Set(
          bookingDetails.flatMap(
            (detail) =>
              itemCategoryMap.get(trimValue(detail.ServiceItemID)) ?? [],
          ),
        ),
      ];

      const appointmentDate =
        dateOnly(header.BookingDate) ||
        extractDateFromRemarks(header.Remarks) ||
        dateOnly(header.TxnDateTime) ||
        "";
      // New rows read the time from BookingDate. Old rows may still have the
      // time prefix in Remarks, so keep the migration fallback.
      const appointmentTime = appointmentTimeLabel(
        header.BookingDate,
        header.Remarks,
      );

      return {
        id: bookingID,
        bookingID,
        locCode: branchCode,
        cusCode: trimValue(header.CusCode),
        clientName: trimValue(customer?.CusName) || "Unknown",
        clientPhone: trimValue(customer?.RegTel),
        clientEmail: trimValue(customer?.CusEmail),
        gender: trimValue(customer?.Gender),
        providerName,
        techID,
        serviceName: serviceNames.join(", ") || "Service",
        serviceNames,
        date: appointmentDate,
        bookingDate: appointmentDate,
        timeSlot: appointmentTime,
        status: mapStatus(trimValue(header.Status)),
        mode: mapMode(trimValue(header.ConfirmationType)),
        bookingTypeID: trimValue(header.BookingTypeID),
        categoryCodes,
        techIDs,
        location: branchCode,
        duration: Math.max(30, 30 * bookingDetails.length),
        price: totalPrice,
        notes: extractNotes(header.Remarks),
        guests,
        detailCount: bookingDetails.length,
        pax: Number(header.Pax ?? guests.length) || guests.length,
        confirmed: isTrue(header.Confirmed),
        confirmedBy: trimValue(header.ConfirmedBy),
        confirmedDate: dateTimeIso(header.ConfirmedDate),
        cancelledBy: trimValue(header.CancelledBy),
        cancelledDate: dateTimeIso(header.CancelledDate),
        checkInTime: dateTimeIso(header.CheckInTime),
        billingTime: dateTimeIso(header.BillingTime),
        txnDateTime:
          dateTimeIso(header.TxnDateTime) || new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[GET /api/appointments]", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load appointments" },
      { status: 500 },
    );
  }
}

/* PATCH /api/appointments */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const bookingID = trimValue(body.bookingID);
    const locCode = trimValue(body.locCode);

    if (!bookingID || !locCode) {
      return NextResponse.json(
        { success: false, error: "bookingID and locCode are required" },
        { status: 422 },
      );
    }

    const actor = toChar(body.userID || body.updatedBy || "ADMIN", 10);
    const status = body.status ? mapStatusToDb(body.status) : null;
    const hasScheduleChange = Boolean(body.date || body.timeSlot);
    let previousDate: string | null = null;
    let previousTimeSlot: string | null = null;
    let rescheduledDate: string | null = null;
    let rescheduledTimeSlot: string | null = null;

    if (status) {
      if (status === "CONFIRMED") {
        await prisma.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar(status, 10)},
            Confirmed = 1,
            ConfirmedBy = ${actor},
            ConfirmedDate = NOW()
          WHERE BookingID = ${bookingID}
            AND LocCode = ${locCode}
        `;
      } else if (status === "CANCELLED") {
        await prisma.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar(status, 10)},
            CancelledDate = NOW(),
            CancelledBy = ${actor}
          WHERE BookingID = ${bookingID}
            AND LocCode = ${locCode}
        `;
      } else if (status === "ONGOING") {
        await prisma.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar(status, 10)},
            CheckInTime = NOW()
          WHERE BookingID = ${bookingID}
            AND LocCode = ${locCode}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE tbl_bookingheder
          SET Status = ${toChar(status, 10)}
          WHERE BookingID = ${bookingID}
            AND LocCode = ${locCode}
        `;
      }
    }

    if (hasScheduleChange) {
      const rows = await prisma.$queryRaw<
        { Remarks: string | null; BookingDate: Date | string | null }[]
      >`
        SELECT
          Remarks,
          DATE_FORMAT(BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate
        FROM tbl_bookingheder
        WHERE BookingID = ${bookingID}
          AND LocCode = ${locCode}
        LIMIT 1
      `;

      if (!rows[0]) {
        return NextResponse.json(
          { success: false, error: "Booking not found" },
          { status: 404 },
        );
      }

      const currentRemarks = rows[0].Remarks || "";
      const currentDate =
        dateOnly(rows[0].BookingDate) || extractDateFromRemarks(currentRemarks);
      const currentTime = appointmentTimeLabel(
        rows[0].BookingDate,
        currentRemarks,
      );
      previousDate = currentDate;
      previousTimeSlot = currentTime;

      const newDate = trimValue(body.date) || currentDate || "";
      const newTime = trimValue(body.timeSlot) || currentTime;
      const bookingDateTime = toBookingDateTime(newDate, newTime);
      const notes = extractNotes(currentRemarks);
      const newRemarks = notes.substring(0, 500) || " ";

      if (!bookingDateTime) {
        return NextResponse.json(
          {
            success: false,
            error: "A valid booking date and time are required",
          },
          { status: 422 },
        );
      }

      rescheduledDate = newDate;
      rescheduledTimeSlot = newTime;

      // ── Server-side conflict guard (race-safe) ────────────────────────────
      // Rescheduling must not move a booking onto a technician's already
      // booked slot. The target date's headers are locked with FOR UPDATE and
      // overlaps are re-checked inside the SAME transaction that updates the
      // row, so concurrent reschedules serialize instead of racing.
      const selfDetailRows = await prisma.$queryRaw<{ TechID: string }[]>`
        SELECT RTRIM(TechID) AS TechID
        FROM tbl_bookingdetail
        WHERE RTRIM(BookingID) = ${bookingID}
          AND RTRIM(LocCode) = ${locCode}
      `;

      const selfTechCounts = new Map<string, number>();
      for (const row of selfDetailRows) {
        const tech = trimValue(row.TechID);
        if (!tech || tech === "0") continue;
        selfTechCounts.set(tech, (selfTechCounts.get(tech) || 0) + 1);
      }

      const newStartMin = slotToMinutes(newTime);

      if (selfTechCounts.size > 0 && newStartMin >= 0) {
        await prisma.$transaction(async (tx) => {
          const lockRows = await tx.$queryRaw<
            { BookingID: string; StartMin: number; TechID: string }[]
          >`
            SELECT
              h.BookingID,
              (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
              RTRIM(d.TechID) AS TechID
            FROM tbl_bookingheder h
            JOIN tbl_bookingdetail d
              ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
            WHERE RTRIM(h.LocCode) = ${locCode.trim()}
              AND DATE(h.BookingDate) = ${newDate}
              AND RTRIM(h.Status) <> 'CANCELLED'
              AND RTRIM(h.BookingID) <> ${bookingID}
            FOR UPDATE
          `;

          const byKey = new Map<string, { start: number; count: number }>();
          for (const row of lockRows) {
            const tech = trimValue(row.TechID);
            if (!tech || tech === "0") continue;
            const key = `${trimValue(row.BookingID)}|${tech}`;
            const entry = byKey.get(key);
            if (entry) entry.count += 1;
            else byKey.set(key, { start: Number(row.StartMin) || 0, count: 1 });
          }

          const conflictingTechs: string[] = [];
          for (const [techID, count] of selfTechCounts) {
            const selfEnd = newStartMin + Math.max(30, 30 * count);
            for (const [key, e] of byKey) {
              if (!key.endsWith(`|${techID}`)) continue;
              const otherEnd = e.start + Math.max(30, 30 * e.count);
              if (newStartMin < otherEnd && e.start < selfEnd) {
                conflictingTechs.push(techID);
              }
            }
          }

          if (conflictingTechs.length > 0) {
            throw new BookingConflictError(
              `Technician ${conflictingTechs[0]} is already booked on ${newDate} at the requested time. Choose another technician or time slot.`,
            );
          }

          // BookingDate stores the complete schedule date and time. Remarks now
          // contains notes only; old Date:/Time: prefixes are removed on edit.
          await tx.$executeRaw`
            UPDATE tbl_bookingheder
            SET
              BookingDate = ${bookingDateTime},
              Remarks = ${newRemarks}
            WHERE BookingID = ${bookingID}
              AND LocCode = ${locCode}
          `;
        });
      } else {
        // BookingDate stores the complete schedule date and time. Remarks now
        // contains notes only; old Date:/Time: prefixes are removed on edit.
        await prisma.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            BookingDate = ${bookingDateTime},
            Remarks = ${newRemarks}
          WHERE BookingID = ${bookingID}
            AND LocCode = ${locCode}
        `;
      }
    }

    if (body.techID || body.providerName) {
      const newTechID = trimValue(body.techID || body.providerName) || "0";

      await prisma.$executeRaw`
        UPDATE tbl_bookingdetail
        SET TechID = ${toChar(newTechID, 10)}
        WHERE BookingID = ${bookingID}
          AND LocCode = ${locCode}
      `;
    }

    const smsEvent: "confirmed" | "cancelled" | "rescheduled" | null =
      status === "CONFIRMED"
        ? "confirmed"
        : status === "CANCELLED"
          ? "cancelled"
          : hasScheduleChange
            ? "rescheduled"
            : null;

    if (smsEvent) {
      const smsRows = await prisma.$queryRaw<RawSMSBooking[]>`
        SELECT
          RTRIM(c.CusName) AS CusName,
          RTRIM(c.RegTel) AS RegTel,
          RTRIM(l.LocDes) AS LocDes,
          DATE_FORMAT(h.BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
          h.Remarks AS Remarks
        FROM tbl_bookingheder AS h
        LEFT JOIN tbl_customermaster AS c
          ON RTRIM(c.CusCode) = RTRIM(h.CusCode)
        LEFT JOIN tbl_locationmaster AS l
          ON RTRIM(l.LocCode) = RTRIM(h.LocCode)
        WHERE RTRIM(h.BookingID) = ${bookingID}
          AND RTRIM(h.LocCode) = ${locCode}
        LIMIT 1
      `;

      const smsBooking = smsRows[0];
      if (!smsBooking?.RegTel?.trim()) {
        console.warn(
          `[BOOKING] No customer phone found for ${bookingID}; skipping ${smsEvent} SMS.`,
        );
      } else {
        const smsDate =
          dateOnly(smsBooking.BookingDate) ||
          rescheduledDate ||
          previousDate ||
          extractDateFromRemarks(smsBooking.Remarks) ||
          "";
        const smsTime = appointmentTimeLabel(
          smsBooking.BookingDate,
          smsBooking.Remarks,
        );
        const smsResult = await sendAppointmentSMS({
          event: smsEvent,
          phone: smsBooking.RegTel,
          name: smsBooking.CusName || "Customer",
          bookingId: bookingID,
          branch: smsBooking.LocDes || locCode,
          date: smsDate,
          timeSlot: smsTime,
          ...(smsEvent === "rescheduled"
            ? {
                previousDate: previousDate || undefined,
                previousTimeSlot: previousTimeSlot || undefined,
              }
            : {}),
        });

        if (!smsResult.success) {
          // The database update is already complete. SMS failure must not make
          // the status/reschedule request look unsuccessful.
          console.error(
            `[BOOKING] SMS was not sent for ${bookingID}: ${smsResult.error}`,
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Booking updated successfully",
    });
  } catch (err: any) {
    console.error("[PATCH /api/appointments]", err);

    if (err instanceof BookingConflictError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update booking" },
      { status: 500 },
    );
  }
}
