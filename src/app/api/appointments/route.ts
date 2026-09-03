// src/app/api/appointments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { sendAppointmentSMS } from "@/lib/sms";
import {
  composeBookingRemarks,
  decodeBookingSchedule,
  minutesToClock,
  stripBookingSchedule,
  type StoredBookingScheduleEntry,
} from "@/lib/bookingSchedule";

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

class BookingNotFoundError extends Error {
  constructor(message = "Booking not found") {
    super(message);
    this.name = "BookingNotFoundError";
  }
}

class BookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

function technicianBelongsToBranch(
  workingLocations: unknown,
  locCode: string,
): boolean {
  const branch = trimValue(locCode).toUpperCase();
  const locations = trimValue(workingLocations)
    .split(/[\s,]+/)
    .map((location) => location.trim().toUpperCase())
    .filter(Boolean);

  return Boolean(
    branch && (locations.includes(branch) || locations.includes("ALL")),
  );
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
    mode === "wo" ||
    mode === "wi" ||
    mode === "walkin" ||
    mode === "walk-in" ||
    mode === "without_confirmation"
  ) {
    return "without_confirmation";
  }

  // Public bookings use WC for “with confirmation”. Keep all other legacy
  // confirmation values on the existing pre-booked path.
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

  return stripBookingSchedule(remarks)
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
  DurationMin: number | string | null;
  Category1: string | null;
  Category2: string | null;
  Category3: string | null;
  Category4: string | null;
}

interface RawTechnician {
  UserId: string;
  UserName: string;
  WorkingLocID: string | null;
  qualificationCodes?: string[];
  qualificationNames?: string[];
  categoryCodes?: string[];
}

interface RawTechnicianQualification {
  UserID: string;
  SpecAreaID: string;
  Specilities: string | null;
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

async function readHeaders(
  locCode?: string | null,
  requestedDate?: string | null,
): Promise<RawHeader[]> {
  const hasLocationFilter = Boolean(locCode && locCode !== "ALL");
  const hasDateFilter = Boolean(requestedDate);
  const locationValue = locCode?.trim() || "";
  const dateValue = requestedDate?.trim() || "";
  const legacyDatePattern = `%Date:${dateValue}%`;

  // Apply the optional date/branch predicates in SQL before LIMIT 500. The
  // previous implementation limited the newest 500 headers first and only
  // then filtered in JavaScript, which could hide an older appointment on the
  // requested calendar date.
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
    WHERE
      (${hasLocationFilter ? 1 : 0} = 0 OR RTRIM(LocCode) = ${locationValue})
      AND (
        ${hasDateFilter ? 1 : 0} = 0
        OR DATE(BookingDate) = ${dateValue}
        OR (
          BookingDate IS NULL
          AND Remarks LIKE ${legacyDatePattern}
        )
      )
    ORDER BY TxnDateTime DESC
    LIMIT 500
  `;
}

function quotedList(values: string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(",");
}

interface ScheduleDetailPair {
  detail: RawDetail;
  entry: StoredBookingScheduleEntry;
}

function detailDuration(
  detail: RawDetail,
  itemDurationMap: Map<string, number>,
): number {
  const unitDuration =
    itemDurationMap.get(trimValue(detail.ServiceItemID)) || 30;
  const quantity = Number(detail.Qty) > 0 ? Number(detail.Qty) : 1;
  return (Number(unitDuration) > 0 ? Number(unitDuration) : 30) * quantity;
}

/** Build a provider-aware schedule for legacy rows without saved metadata. */
function buildFallbackSchedule(
  details: RawDetail[],
  itemDurationMap: Map<string, number>,
  appointmentStartMin: number,
): ScheduleDetailPair[] {
  const cursors = new Map<string, number>();
  const safeStart = appointmentStartMin >= 0 ? appointmentStartMin : 0;

  return details.map((detail, serviceIndex) => {
    const techID = trimValue(detail.TechID) || "0";
    const providerKey = techID === "0" ? "__UNASSIGNED__" : techID;
    const startHint = safeStart;
    const startMin = Math.max(startHint, cursors.get(providerKey) ?? startHint);
    const endMin = startMin + detailDuration(detail, itemDurationMap);
    cursors.set(providerKey, endMin);

    return {
      detail,
      entry: {
        serviceIndex,
        // Empty itemCode deliberately makes the detail index authoritative;
        // the same service code may appear for more than one guest.
        itemCode: "",
        startMin,
        endMin,
      },
    };
  });
}

/**
 * Use persisted service placement when it covers every detail row. If an old
 * or malformed metadata line is incomplete, rebuild the whole booking from
 * catalog durations instead of mixing two different timing models.
 */
function resolveSchedulePairs(
  details: RawDetail[],
  storedSchedule: StoredBookingScheduleEntry[],
  itemDurationMap: Map<string, number>,
  appointmentStartMin: number,
): ScheduleDetailPair[] {
  if (details.length === 0) return [];

  const used = new Set<number>();
  const pairs: ScheduleDetailPair[] = [];

  details.forEach((detail, serviceIndex) => {
    const code = trimValue(detail.ServiceItemID).toUpperCase();
    const indexed = storedSchedule.findIndex(
      (entry, entryIndex) =>
        !used.has(entryIndex) &&
        entry.serviceIndex === serviceIndex &&
        (!entry.itemCode || entry.itemCode.trim().toUpperCase() === code),
    );
    const byCode =
      indexed >= 0
        ? indexed
        : storedSchedule.findIndex(
            (entry, entryIndex) =>
              !used.has(entryIndex) &&
              entry.itemCode &&
              entry.itemCode.trim().toUpperCase() === code,
          );
    if (byCode < 0) return;

    used.add(byCode);
    const stored = storedSchedule[byCode];
    const startMin = Number(stored.startMin);
    if (!Number.isFinite(startMin)) return;
    pairs.push({
      detail,
      entry: {
        serviceIndex,
        itemCode: "",
        startMin,
        // Catalog duration is authoritative even if an old metadata line has
        // a stale end time.
        endMin: startMin + detailDuration(detail, itemDurationMap),
      },
    });
  });

  return pairs.length === details.length
    ? pairs
    : buildFallbackSchedule(details, itemDurationMap, appointmentStartMin);
}

/* GET /api/appointments */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedDate = searchParams.get("date");
  const locCode = searchParams.get("locCode");

  if (searchParams.get("meta") === "filters") {
    try {
      const [
        locations,
        categories,
        bookingTypes,
        technicians,
        technicianQualifications,
      ] = await Promise.all([
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
        prisma.$queryRaw<RawTechnicianQualification[]>`
          SELECT
            RTRIM(a.UserID) AS UserID,
            RTRIM(a.SpecAreaID) AS SpecAreaID,
            RTRIM(s.Specilities) AS Specilities
          FROM tbl_technicianspecilityassignment a
          LEFT JOIN tbl_technicianspecilities s
            ON RTRIM(s.SpecAreaID) = RTRIM(a.SpecAreaID)
        `,
      ]);

      const qualificationsByUser = new Map<
        string,
        { codes: string[]; names: string[] }
      >();
      technicianQualifications.forEach((qualification) => {
        const userID = trimValue(qualification.UserID);
        if (!userID) return;
        const current = qualificationsByUser.get(userID) || {
          codes: [],
          names: [],
        };
        const code = trimValue(qualification.SpecAreaID);
        const name = trimValue(qualification.Specilities);
        if (code && !current.codes.includes(code)) current.codes.push(code);
        if (name && !current.names.includes(name)) current.names.push(name);
        qualificationsByUser.set(userID, current);
      });

      const enrichedTechnicians = technicians.map((technician) => {
        const userID = trimValue(technician.UserId);
        const qualifications = qualificationsByUser.get(userID) || {
          codes: [],
          names: [],
        };
        return {
          ...technician,
          qualificationCodes: qualifications.codes,
          qualificationNames: qualifications.names,
          // Keep this alias for consumers that already call the values
          // category codes while the legacy table calls them SpecAreaIDs.
          categoryCodes: qualifications.codes,
        };
      });

      return NextResponse.json({
        success: true,
        locations,
        categories,
        bookingTypes,
        technicians: enrichedTechnicians,
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
    const headers = await readHeaders(locCode, requestedDate);

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
          COALESCE(NULLIF(DurationMin, 0), 30) AS DurationMin,
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
    const itemDurationMap = new Map<string, number>();
    items.forEach((item) => {
      const itemCode = trimValue(item.ItemCode);
      const codes = [
        item.Category1,
        item.Category2,
        item.Category3,
        item.Category4,
      ]
        .map((code) => trimValue(code))
        .filter(Boolean);
      itemCategoryMap.set(itemCode, codes);
      itemDurationMap.set(
        itemCode,
        Number(item.DurationMin) > 0 ? Number(item.DurationMin) : 30,
      );
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

      const originalServiceNames = [
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

      const storedSchedule = decodeBookingSchedule(header.Remarks);
      const appointmentStartMin = slotToMinutes(appointmentTime);
      const schedulePairs = resolveSchedulePairs(
        bookingDetails,
        storedSchedule,
        itemDurationMap,
        appointmentStartMin,
      );
      const orderedPairs = [...schedulePairs].sort(
        (a, b) =>
          a.entry.startMin - b.entry.startMin ||
          a.entry.serviceIndex - b.entry.serviceIndex,
      );
      const serviceSchedule = orderedPairs.map(({ detail, entry }) => {
        const itemCode = trimValue(detail.ServiceItemID);
        const detailTechID = trimValue(detail.TechID);
        return {
          serviceIndex: entry.serviceIndex,
          itemCode,
          serviceName: itemMap.get(itemCode) || itemCode,
          providerName:
            detailTechID !== "0"
              ? technicianMap.get(detailTechID) || detailTechID
              : "Unassigned",
          startTime: minutesToClock(entry.startMin),
          endTime: minutesToClock(entry.endMin),
        };
      });

      // Keep each provider's real occupied window independent. Parallel
      // technicians therefore do not inflate the appointment's elapsed time.
      const windowsByProvider = new Map<
        string,
        { startMin: number; endMin: number }[]
      >();
      let unassignedDuration = 0;
      schedulePairs.forEach(({ detail, entry }) => {
        const detailTechID = trimValue(detail.TechID);
        const duration = entry.endMin - entry.startMin;
        if (detailTechID === "0" || !detailTechID) {
          unassignedDuration += duration;
          return;
        }
        const windows = windowsByProvider.get(detailTechID) || [];
        windows.push({ startMin: entry.startMin, endMin: entry.endMin });
        windowsByProvider.set(detailTechID, windows);
      });

      const techWindows = [...windowsByProvider.entries()].flatMap(
        ([techID, windows]) => {
          const merged: { startMin: number; endMin: number }[] = [];
          windows
            .sort((a, b) => a.startMin - b.startMin)
            .forEach((window) => {
              const previous = merged[merged.length - 1];
              if (previous && window.startMin <= previous.endMin) {
                previous.endMin = Math.max(previous.endMin, window.endMin);
              } else {
                merged.push({ ...window });
              }
            });
          return merged.map((window) => ({ techID, ...window }));
        },
      );

      const scheduleStart = schedulePairs.length
        ? Math.min(
            ...schedulePairs.map((pair) => pair.entry.startMin),
            appointmentStartMin >= 0 ? appointmentStartMin : Infinity,
          )
        : appointmentStartMin;
      const scheduleEnd = schedulePairs.length
        ? Math.max(...schedulePairs.map((pair) => pair.entry.endMin))
        : scheduleStart;
      const totalDuration =
        scheduleStart >= 0 && scheduleEnd >= scheduleStart
          ? scheduleEnd - scheduleStart
          : 0;
      const orderedServiceNames = serviceSchedule.length > 0
        ? serviceSchedule.map((service) => service.serviceName)
        : originalServiceNames;
      const firstScheduledDetail = orderedPairs[0]?.detail;
      const displayTechID = trimValue(firstScheduledDetail?.TechID) || techID;
      const displayProviderName =
        serviceSchedule[0]?.providerName || providerName;

      return {
        id: bookingID,
        bookingID,
        locCode: branchCode,
        cusCode: trimValue(header.CusCode),
        clientName: trimValue(customer?.CusName) || "Unknown",
        clientPhone: trimValue(customer?.RegTel),
        clientEmail: trimValue(customer?.CusEmail),
        gender: trimValue(customer?.Gender),
        providerName: displayProviderName,
        techID: displayTechID,
        serviceName: orderedServiceNames.join(", ") || "Service",
        serviceNames: orderedServiceNames,
        serviceSchedule,
        techWindows,
        unassignedDuration,
        date: appointmentDate,
        bookingDate: appointmentDate,
        timeSlot: appointmentTime,
        status: mapStatus(trimValue(header.Status)),
        mode: mapMode(trimValue(header.ConfirmationType)),
        bookingTypeID: trimValue(header.BookingTypeID),
        categoryCodes,
        techIDs,
        location: branchCode,
        duration: totalDuration,
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
    const status =
      body.status !== undefined &&
      body.status !== null &&
      trimValue(body.status)
        ? mapStatusToDb(body.status)
        : null;
    const hasScheduleChange = Boolean(
      trimValue(body.date) || trimValue(body.timeSlot),
    );
    const hasTechID =
      body.techID !== undefined && body.techID !== null &&
      trimValue(body.techID) !== "";
    const hasProviderName =
      body.providerName !== undefined && body.providerName !== null &&
      trimValue(body.providerName) !== "";
    const hasTechnicianChange = hasTechID || hasProviderName;
    const requestedTechnicianValue = hasTechID
      ? body.techID
      : hasProviderName
        ? body.providerName
        : undefined;

    let previousDate: string | null = null;
    let previousTimeSlot: string | null = null;
    let rescheduledDate: string | null = null;
    let rescheduledTimeSlot: string | null = null;

    // All reads that determine the candidate schedule, the conflict check, and
    // the eventual header/detail/status writes live in one transaction. In
    // particular, do not update Status before a reschedule conflict is known to
    // be clear: a failed reschedule must leave the whole booking untouched.
    await prisma.$transaction(async (tx) => {
      const headerRows = await tx.$queryRaw<
        {
          Remarks: string | null;
          BookingDate: Date | string | null;
          Status: string | null;
        }[]
      >`
        SELECT
          Remarks,
          DATE_FORMAT(BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
          RTRIM(Status) AS Status
        FROM tbl_bookingheder
        WHERE RTRIM(BookingID) = ${bookingID}
          AND RTRIM(LocCode) = ${locCode}
        LIMIT 1
        FOR UPDATE
      `;

      if (!headerRows[0]) throw new BookingNotFoundError();

      const currentRemarks = headerRows[0].Remarks || "";
      const currentDate =
        dateOnly(headerRows[0].BookingDate) ||
        extractDateFromRemarks(currentRemarks);
      const currentTime = appointmentTimeLabel(
        headerRows[0].BookingDate,
        currentRemarks,
      );
      const currentStatus = trimValue(headerRows[0].Status).toUpperCase();
      const storedSchedule = decodeBookingSchedule(currentRemarks);
      const oldStartMin = slotToMinutes(currentTime);

      if (hasScheduleChange) {
        previousDate = currentDate;
        previousTimeSlot = currentTime;
      }

      const newDate = trimValue(body.date) || currentDate || "";
      const newTime = trimValue(body.timeSlot) || currentTime;
      const newStartMin = slotToMinutes(newTime);
      const bookingDateTime = hasScheduleChange
        ? toBookingDateTime(newDate, newTime)
        : null;

      if (hasScheduleChange && !bookingDateTime) {
        throw new BookingValidationError(
          "A valid booking date and time are required",
        );
      }

      if (hasScheduleChange) {
        rescheduledDate = newDate;
        rescheduledTimeSlot = newTime;
      }

      // Resolve a calendar display name to the canonical UserId before it is
      // used for the conflict check or written to tbl_bookingdetail. The
      // explicit "0" / "Unassigned" path keeps the existing unassigned admin
      // booking flow intact.
      let targetTechID: string | null = null;
      if (hasTechnicianChange) {
        const requestedTechID = trimValue(requestedTechnicianValue);
        const isUnassigned =
          !requestedTechID ||
          requestedTechID === "0" ||
          requestedTechID.toUpperCase() === "UNASSIGNED";

        if (isUnassigned) {
          targetTechID = "0";
        } else {
          const technicianRows = await tx.$queryRaw<
            {
              UserId: string;
              UserName: string;
              WorkingLocID: string | null;
            }[]
          >`
            SELECT
              RTRIM(UserId) AS UserId,
              RTRIM(UserName) AS UserName,
              RTRIM(WorkingLocID) AS WorkingLocID
            FROM tbl_userdetails
            WHERE Enable = 1
              AND (
                UPPER(RTRIM(UserId)) = UPPER(${requestedTechID})
                OR UPPER(RTRIM(UserName)) = UPPER(${requestedTechID})
              )
            ORDER BY
              CASE
                WHEN UPPER(RTRIM(UserId)) = UPPER(${requestedTechID}) THEN 0
                ELSE 1
              END,
              UserId
            LIMIT 1
          `;

          const technician = technicianRows[0];
          if (!technician) {
            throw new BookingValidationError(
              `Technician "${requestedTechID}" was not found or is inactive`,
            );
          }
          if (!technicianBelongsToBranch(technician.WorkingLocID, locCode)) {
            throw new BookingValidationError(
              `Technician "${trimValue(technician.UserId)}" is not assigned to branch ${locCode}`,
            );
          }

          targetTechID = trimValue(technician.UserId);
        }
      }

      const selfDetailRows = await tx.$queryRaw<
        (RawDetail & { DurationMin: number | string | null })[]
      >`
        SELECT
          RTRIM(d.BookingID) AS BookingID,
          RTRIM(d.LocCode) AS LocCode,
          RTRIM(d.GuessID) AS GuessID,
          RTRIM(d.ServiceItemID) AS ServiceItemID,
          d.Qty AS Qty,
          0 AS ItemPrice,
          RTRIM(d.TechID) AS TechID,
          COALESCE(NULLIF(i.DurationMin, 0), 30) AS DurationMin
        FROM tbl_bookingdetail d
        LEFT JOIN tbl_ItemMaster i
          ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
         AND RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
        WHERE RTRIM(d.BookingID) = ${bookingID}
          AND RTRIM(d.LocCode) = ${locCode}
        FOR UPDATE
      `;
      const selfDetails = selfDetailRows.map((row) => ({
        ...row,
        ItemPrice: Number(row.ItemPrice) || 0,
      }));
      const selfDurationMap = new Map<string, number>(
        selfDetailRows.map((row) => [
          trimValue(row.ServiceItemID),
          Number(row.DurationMin) > 0 ? Number(row.DurationMin) : 30,
        ]),
      );

      // The existing persisted placement is retained for a date/time-only
      // move. When a booking is assigned to another technician, all of its
      // detail rows are moved together (the existing PATCH behaviour), so
      // rebuild the placement sequentially for that target provider. This
      // preserves same-provider sequential work and avoids retaining parallel
      // starts that belonged to the previous provider assignment.
      const effectiveDetails: RawDetail[] =
        targetTechID !== null
          ? selfDetails.map((detail) => ({
              ...detail,
              TechID: targetTechID,
            }))
          : selfDetails;
      const originalPairs = resolveSchedulePairs(
        selfDetails,
        storedSchedule,
        selfDurationMap,
        oldStartMin,
      );
      const scheduleShift =
        hasScheduleChange && oldStartMin >= 0 && newStartMin >= 0
          ? newStartMin - oldStartMin
          : 0;

      let candidatePairs: ScheduleDetailPair[];
      let scheduleToSave: StoredBookingScheduleEntry[] | null = null;

      if (targetTechID !== null) {
        const targetStartMin = newStartMin >= 0 ? newStartMin : oldStartMin;
        candidatePairs = buildFallbackSchedule(
          effectiveDetails,
          selfDurationMap,
          targetStartMin,
        );
        scheduleToSave = candidatePairs.map(({ entry }) => ({ ...entry }));
      } else {
        candidatePairs = originalPairs.map(({ detail, entry }) => ({
          detail,
          entry: {
            ...entry,
            startMin: entry.startMin + scheduleShift,
            endMin: entry.endMin + scheduleShift,
          },
        }));
        if (hasScheduleChange) {
          scheduleToSave = storedSchedule.map((entry) => ({
            ...entry,
            startMin: entry.startMin + scheduleShift,
            endMin: entry.endMin + scheduleShift,
          }));
        }
      }

      const candidateWindows = candidatePairs
        .map(({ detail, entry }) => {
          const techID = trimValue(detail.TechID);
          if (!techID || techID === "0") return null;

          return {
            techID,
            startMin: entry.startMin,
            // DurationMin is read from tbl_ItemMaster above. Never derive the
            // occupancy from detailCount or a fixed 30-minute block.
            endMin: entry.startMin + detailDuration(detail, selfDurationMap),
          };
        })
        .filter(
          (
            window,
          ): window is { techID: string; startMin: number; endMin: number } =>
            Boolean(window),
        );
      const candidateStartMin =
        newStartMin >= 0 ? newStartMin : oldStartMin;

      if (candidateWindows.length > 0 && candidateStartMin >= 0) {
        // Lock every competing non-cancelled booking on the target date before
        // reading its occupancy. A concurrent reschedule therefore cannot pass
        // this check at the same time and commit an overlapping assignment.
        const lockRows = await tx.$queryRaw<
          (RawDetail & {
            StartMin: number;
            Remarks: string | null;
            DurationMin: number | string | null;
          })[]
        >`
          SELECT
            RTRIM(h.BookingID) AS BookingID,
            RTRIM(h.LocCode) AS LocCode,
            RTRIM(d.GuessID) AS GuessID,
            RTRIM(d.ServiceItemID) AS ServiceItemID,
            d.Qty AS Qty,
            0 AS ItemPrice,
            RTRIM(d.TechID) AS TechID,
            (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
            h.Remarks AS Remarks,
            COALESCE(NULLIF(i.DurationMin, 0), 30) AS DurationMin
          FROM tbl_bookingheder h
          JOIN tbl_bookingdetail d
            ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
          LEFT JOIN tbl_ItemMaster i
            ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
           AND RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
          WHERE RTRIM(h.LocCode) = ${locCode}
            AND DATE(h.BookingDate) = ${newDate}
            AND UPPER(RTRIM(h.Status)) <> 'CANCELLED'
            AND RTRIM(h.BookingID) <> ${bookingID}
          FOR UPDATE
        `;

        const rowsByBooking = new Map<
          string,
          {
            startMin: number;
            remarks: string | null;
            details: RawDetail[];
            durations: Map<string, number>;
          }
        >();
        lockRows.forEach((row) => {
          const id = trimValue(row.BookingID);
          const current = rowsByBooking.get(id) || {
            startMin: Number(row.StartMin) || 0,
            remarks: row.Remarks,
            details: [],
            durations: new Map<string, number>(),
          };
          current.details.push({
            ...row,
            ItemPrice: Number(row.ItemPrice) || 0,
          });
          current.durations.set(
            trimValue(row.ServiceItemID),
            Number(row.DurationMin) > 0 ? Number(row.DurationMin) : 30,
          );
          rowsByBooking.set(id, current);
        });

        const otherWindows: {
          techID: string;
          startMin: number;
          endMin: number;
        }[] = [];
        rowsByBooking.forEach((booking) => {
          const pairs = resolveSchedulePairs(
            booking.details,
            decodeBookingSchedule(booking.remarks),
            booking.durations,
            booking.startMin,
          );
          pairs.forEach(({ detail, entry }) => {
            const techID = trimValue(detail.TechID);
            if (!techID || techID === "0") return;
            otherWindows.push({
              techID,
              startMin: entry.startMin,
              endMin:
                entry.startMin +
                detailDuration(detail, booking.durations),
            });
          });
        });

        const conflict = candidateWindows.find((candidate) =>
          otherWindows.some(
            (other) =>
              candidate.techID.toUpperCase() === other.techID.toUpperCase() &&
              candidate.startMin < other.endMin &&
              other.startMin < candidate.endMin,
          ),
        );

        if (conflict) {
          throw new BookingConflictError(
            `Technician ${conflict.techID} is already booked on ${newDate} at the requested time. Choose another technician or time slot.`,
          );
        }
      }

      const shouldUpdateSchedule = hasScheduleChange || hasTechnicianChange;
      const newRemarks = shouldUpdateSchedule
        ? composeBookingRemarks(
            extractNotes(currentRemarks),
            scheduleToSave ?? storedSchedule,
          )
        : currentRemarks;

      // No database write occurs above this point except row locks. From here
      // on all related header/detail/status changes are part of this same
      // transaction, so any later failure rolls them back together.
      if (targetTechID !== null) {
        await tx.$executeRaw`
          UPDATE tbl_bookingdetail
          SET TechID = ${toChar(targetTechID, 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      }

      if (hasScheduleChange) {
        // BookingDate stores the complete schedule date and time. Remarks keeps
        // notes and schedule metadata only; old Date:/Time: prefixes are
        // removed on edit.
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            BookingDate = ${bookingDateTime},
            Remarks = ${newRemarks}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (hasTechnicianChange) {
        // A technician-only reassignment also needs its rebuilt placement
        // persisted so a later GET does not infer the old provider's timing.
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET Remarks = ${newRemarks}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      }

      // A cancelled booking is historical data, not a disposable row. A
      // successful schedule/provider change reactivates it as PENDING while
      // retaining the same header/detail row. Active statuses clear stale
      // cancellation markers; CANCELLED always clears confirmation markers.
      const reactivateCancelled =
        !status &&
        currentStatus === "CANCELLED" &&
        (hasScheduleChange || hasTechnicianChange);
      const statusToApply = status || (reactivateCancelled ? "PENDING" : null);

      if (statusToApply === "CONFIRMED") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar("CONFIRMED", 10)},
            Confirmed = 1,
            ConfirmedBy = ${actor},
            ConfirmedDate = NOW(),
            CancelledDate = NULL,
            CancelledBy = ${toChar("", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (statusToApply === "CANCELLED") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar("CANCELLED", 10)},
            Confirmed = 0,
            ConfirmedBy = ${toChar("", 10)},
            ConfirmedDate = NULL,
            CancelledDate = NOW(),
            CancelledBy = ${actor}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (statusToApply === "ONGOING") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar("ONGOING", 10)},
            Confirmed = 1,
            ConfirmedBy = CASE
              WHEN COALESCE(RTRIM(ConfirmedBy), '') = '' THEN ${actor}
              ELSE ConfirmedBy
            END,
            ConfirmedDate = COALESCE(ConfirmedDate, NOW()),
            CancelledDate = NULL,
            CancelledBy = ${toChar("", 10)},
            CheckInTime = COALESCE(CheckInTime, NOW())
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (statusToApply === "PENDING") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET
            Status = ${toChar("PENDING", 10)},
            Confirmed = 0,
            ConfirmedBy = ${toChar("", 10)},
            ConfirmedDate = NULL,
            CancelledDate = NULL,
            CancelledBy = ${toChar("", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      }
    });

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
          // The database transaction is already complete. SMS failure must not
          // make the status/reschedule request look unsuccessful.
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
    if (err instanceof BookingNotFoundError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 },
      );
    }
    if (err instanceof BookingValidationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update booking" },
      { status: 500 },
    );
  }
}
