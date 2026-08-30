// src/app/api/appointments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

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

async function readHeaders(locCode?: string | null): Promise<RawHeader[]> {
  if (locCode && locCode !== "ALL") {
    return prisma.$queryRaw<RawHeader[]>`
      SELECT
        RTRIM(BookingID)        AS BookingID,
        RTRIM(LocCode)          AS LocCode,
        RTRIM(CusCode)          AS CusCode,
        BookingDate,
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
      BookingDate,
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
          RTRIM(ItemPrintDes) AS ItemPrintDes
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

      const appointmentDate =
        dateOnly(header.BookingDate) ||
        extractDateFromRemarks(header.Remarks) ||
        dateOnly(header.TxnDateTime) ||
        "";
      const appointmentTime =
        extractTimeFromRemarks(header.Remarks) || "9:00 AM";

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

    if (body.date || body.timeSlot) {
      const rows = await prisma.$queryRaw<
        { Remarks: string | null; BookingDate: Date | string | null }[]
      >`
        SELECT Remarks, BookingDate
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
      const newDate = trimValue(body.date) || currentDate || "";
      const newTime =
        trimValue(body.timeSlot) ||
        extractTimeFromRemarks(currentRemarks) ||
        "9:00 AM";
      const notes = extractNotes(currentRemarks);

      if (!newDate) {
        return NextResponse.json(
          { success: false, error: "A valid booking date is required" },
          { status: 422 },
        );
      }

      const newRemarks = `Date:${newDate} Time:${newTime} ${notes}`
        .trim()
        .substring(0, 500);

      // BookingDate is the real date field. Remarks is retained only for the
      // legacy time-slot and notes format used by the current application.
      await prisma.$executeRaw`
        UPDATE tbl_bookingheder
        SET
          BookingDate = ${newDate},
          Remarks = ${newRemarks}
        WHERE BookingID = ${bookingID}
          AND LocCode = ${locCode}
      `;
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

    return NextResponse.json({
      success: true,
      message: "Booking updated successfully",
    });
  } catch (err: any) {
    console.error("[PATCH /api/appointments]", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update booking" },
      { status: 500 },
    );
  }
}
