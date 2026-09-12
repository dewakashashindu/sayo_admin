// src/app/api/appointments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { sendAppointmentSMS } from "@/lib/sms";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/adminSession";
import { logActivity, maskPhoneForLog } from "@/lib/activityLog";
import {
  composeBookingRemarks,
  decodeBookingSchedule,
  minutesToClock,
  stripBookingSchedule,
  type StoredBookingScheduleEntry,
} from "@/lib/bookingSchedule";
import {
  BOOKING_SERVICE_DETAIL_FROM_SQL,
} from "@/lib/bookingReadModel";

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

  const raw = value instanceof Date
    ? value.toISOString().replace("T", " ").slice(0, 19)
    : String(value);
  if (raw.startsWith("1900-01-01")) return null;

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
): "confirmed" | "pending" | "cancelled" | "ongoing" | "done" {
  const status = trimValue(raw).toLowerCase();

  if (status === "confirmed" || status === "confirm") return "confirmed";
  if (status === "cancelled" || status === "cancel") return "cancelled";
  if (status === "ongoing" || status === "in progress") return "ongoing";
  if (status === "done" || status === "completed") return "done";
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
): "PENDING" | "CONFIRMED" | "CANCELLED" | "ONGOING" | "DONE" {
  const normalized = trimValue(status).toLowerCase();

  if (normalized === "confirmed") return "CONFIRMED";
  if (normalized === "cancelled" || normalized === "cancel") return "CANCELLED";
  if (normalized === "ongoing") return "ONGOING";
  if (normalized === "done") return "DONE";
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
  return value === true || Number(value) === 1 || value === "true";
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
  ScheduleIndex?: number | string | null;
  ScheduleStartMin?: number | string | null;
  ScheduleEndMin?: number | string | null;
  ItemDes?: string | null;
  ItemPrintDes?: string | null;
  SerDuration?: number | string | null;
  Category1?: string | null;
  Category2?: string | null;
  Category3?: string | null;
  Category4?: string | null;
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

  // Header and transaction data are read through the database views. The
  // transaction aggregation restores the status-event fields that the old
  // header table carried while keeping TxnDetail authoritative.
  return prisma.$queryRaw<RawHeader[]>`
    SELECT
      RTRIM(h.BookingID) AS BookingID,
      RTRIM(h.LocCode) AS LocCode,
      RTRIM(h.CusCode) AS CusCode,
      h.BookingDate AS BookingDate,
      h.TxnDateTime AS TxnDateTime,
      RTRIM(h.BookingTypeID) AS BookingTypeID,
      RTRIM(h.Status) AS Status,
      RTRIM(h.ConfirmationType) AS ConfirmationType,
      RTRIM(h.AdvBookingPayMode) AS AdvBookingPayMode,
      h.AdvBookingAmount AS AdvBookingAmount,
      h.Remarks AS Remarks,
      RTRIM(h.UserID) AS UserID,
      MAX(
        CASE
          WHEN t.CancelledDate > '1900-01-01 00:00:00' THEN t.CancelledDate
          ELSE NULL
        END
      ) AS CancelledDate,
      MAX(CASE WHEN t.CancelledDate > '1900-01-01 00:00:00' THEN RTRIM(t.CancelledBy) ELSE NULL END) AS CancelledBy,
      h.Pax AS Pax,
      COALESCE(MAX(t.Confirmed), 0) AS Confirmed,
      MAX(CASE WHEN t.Confirmed = 1 THEN RTRIM(t.ConfirmedBy) ELSE NULL END) AS ConfirmedBy,
      MAX(CASE WHEN t.ConfirmedDate > '1900-01-01 00:00:00' THEN t.ConfirmedDate ELSE NULL END) AS ConfirmedDate,
      MAX(CASE WHEN t.CheckInTime > '1900-01-01 00:00:00' THEN t.CheckInTime ELSE NULL END) AS CheckInTime,
      h.BillingTime AS BillingTime
    FROM tbl_bookingheder h
    LEFT JOIN tbl_bookingtxndetail t
      ON RTRIM(t.LocCode) = RTRIM(h.LocCode)
     AND RTRIM(t.BookingID) = RTRIM(h.BookingID)
    WHERE
      (${hasLocationFilter ? 1 : 0} = 0 OR RTRIM(h.LocCode) = ${locationValue})
      AND (
        ${hasDateFilter ? 1 : 0} = 0
        OR DATE(h.BookingDate) = ${dateValue}
        OR (
          h.BookingDate IS NULL
          AND h.Remarks LIKE ${legacyDatePattern}
        )
      )
    GROUP BY
      h.BookingID,
      h.LocCode,
      h.CusCode,
      h.BookingDate,
      h.TxnDateTime,
      h.BookingTypeID,
      h.Status,
      h.ConfirmationType,
      h.AdvBookingPayMode,
      h.AdvBookingAmount,
      h.Remarks,
      h.UserID,
      h.Pax,
      h.BillingTime
    ORDER BY h.TxnDateTime DESC
    LIMIT 500
  `;
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

function hasDetailSchedule(detail: RawDetail): boolean {
  const startMin = Number(detail.ScheduleStartMin);
  const endMin = Number(detail.ScheduleEndMin);
  return Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin;
}

/** New rows store placement on each service row; older rows use Remarks. */
function orderDetailsForSchedule(details: RawDetail[]): RawDetail[] {
  const hasIndexes = details.some((detail) => {
    const index = Number(detail.ScheduleIndex);
    return Number.isInteger(index) && index >= 0;
  });
  if (!hasIndexes) return details;

  return [...details].sort((first, second) => {
    const firstIndex = Number(first.ScheduleIndex);
    const secondIndex = Number(second.ScheduleIndex);
    const firstValid = Number.isInteger(firstIndex) && firstIndex >= 0;
    const secondValid = Number.isInteger(secondIndex) && secondIndex >= 0;
    if (firstValid && secondValid) return firstIndex - secondIndex;
    if (firstValid) return -1;
    if (secondValid) return 1;
    return trimValue(first.ServiceItemID).localeCompare(trimValue(second.ServiceItemID));
  });
}

function scheduleFromDetailColumns(
  details: RawDetail[],
): StoredBookingScheduleEntry[] | null {
  if (details.length === 0 || !details.every(hasDetailSchedule)) return null;
  return details.map((detail, serviceIndex) => ({
    serviceIndex,
    itemCode: "",
    startMin: Number(detail.ScheduleStartMin),
    endMin: Number(detail.ScheduleEndMin),
  }));
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

    const details = await prisma.$queryRaw<RawDetail[]>`
      SELECT
        RTRIM(h.BookingID)     AS BookingID,
        RTRIM(h.LocCode)       AS LocCode,
        RTRIM(d.GuessID)       AS GuessID,
        RTRIM(d.ServiceItemID) AS ServiceItemID,
        d.Qty,
        d.ItemPrice,
        RTRIM(d.TechID)        AS TechID,
        d.ScheduleIndex,
        d.ScheduleStartMin,
        d.ScheduleEndMin,
        RTRIM(i.ItemDes)       AS ItemDes,
        RTRIM(i.ItemPrintDes)  AS ItemPrintDes,
        i.SerDuration,
        RTRIM(i.Category1)     AS Category1,
        RTRIM(i.Category2)     AS Category2,
        RTRIM(i.Category3)     AS Category3,
        RTRIM(i.Category4)     AS Category4
      ${Prisma.raw(BOOKING_SERVICE_DETAIL_FROM_SQL)}
      WHERE RTRIM(h.BookingID) IN (${Prisma.join(bookingIDList)})
        AND RTRIM(h.LocCode)   IN (${Prisma.join(locCodeList)})
    `;

    const cusCodeList = [
      ...new Set(filtered.map((header) => trimValue(header.CusCode))),
    ];
    const customers = await prisma.$queryRaw<RawCustomer[]>`
      SELECT
        RTRIM(CusCode)  AS CusCode,
        RTRIM(CusName)  AS CusName,
        RTRIM(RegTel)   AS RegTel,
        RTRIM(CusEmail) AS CusEmail,
        RTRIM(Gender)   AS Gender
      FROM tbl_customermaster
      WHERE RTRIM(CusCode) IN (${Prisma.join(cusCodeList)})
    `;

    // The service-detail view already joins ItemMaster, including the new
    // MOF/SerDuration values and category codes. Build the lookup from that
    // read model instead of querying the old ItemMaster duration column.
    const items: RawItem[] = details.map((detail) => ({
      ItemCode: trimValue(detail.ServiceItemID),
      ItemDes: trimValue(detail.ItemDes) || trimValue(detail.ServiceItemID),
      ItemPrintDes: trimValue(detail.ItemPrintDes) || null,
      DurationMin: detail.SerDuration ?? 0,
      Category1: detail.Category1 ?? null,
      Category2: detail.Category2 ?? null,
      Category3: detail.Category3 ?? null,
      Category4: detail.Category4 ?? null,
    }));

    const techIDList = [
      ...new Set(
        details
          .map((detail) => trimValue(detail.TechID))
          .filter((techID) => techID && techID !== "0"),
      ),
    ];
    let technicians: RawTechnician[] = [];

    if (techIDList.length > 0) {
      technicians = await prisma.$queryRaw<RawTechnician[]>`
        SELECT
          RTRIM(UserId) AS UserId,
          RTRIM(UserName) AS UserName,
          RTRIM(WorkingLocID) AS WorkingLocID
        FROM tbl_userdetails
        WHERE RTRIM(UserId) IN (${Prisma.join(techIDList)})
      `;
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
      const bookingDetails = orderDetailsForSchedule(
        detailMap.get(`${branchCode}|${bookingID}`) ?? [],
      );

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

      const storedSchedule =
        scheduleFromDetailColumns(bookingDetails) ??
        decodeBookingSchedule(header.Remarks);
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
          guessID: trimValue(detail.GuessID),
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

async function ensureTxnRowsTx(
  tx: Prisma.TransactionClient,
  locCode: string,
  bookingID: string,
): Promise<void> {
  // Migration creates these rows for existing bookings. This INSERT IGNORE is
  // an additional guard for a legacy booking that has no guest transaction
  // row, so status updates never silently affect zero rows.
  await tx.$executeRaw`
    INSERT IGNORE INTO tbl_bookingtxndetail (
      LocCode,
      BookingID,
      GuessID,
      BookingDate,
      CancelledDate,
      CancelledBy,
      Confirmed,
      ConfirmedBy,
      ConfirmedDate,
      CheckInTime
    )
    SELECT
      h.LocCode,
      h.BookingID,
      COALESCE(NULLIF(RTRIM(d.GuessID), ''), 'MAIN'),
      h.BookingDate,
      CASE
        WHEN UPPER(RTRIM(h.Status)) IN ('CANCELLED', 'CANCEL') THEN NOW()
        ELSE ${null}
      END,
      ' ',
      CASE
        WHEN UPPER(RTRIM(h.Status)) IN ('CONFIRMED', 'CONFIRM', 'ONGOING', 'IN PROGRESS') THEN 1
        ELSE 0
      END,
      ' ',
      CASE
        WHEN UPPER(RTRIM(h.Status)) IN ('CONFIRMED', 'CONFIRM', 'ONGOING', 'IN PROGRESS') THEN NOW()
        ELSE ${null}
      END,
      CASE
        WHEN UPPER(RTRIM(h.Status)) IN ('ONGOING', 'IN PROGRESS') THEN NOW()
        ELSE ${null}
      END
    FROM tbl_bookingheder h
    LEFT JOIN (
      SELECT DISTINCT LocCode, BookingID, RTRIM(GuessID) AS GuessID
      FROM tbl_bookingservicedetail
    ) d
      ON d.LocCode = h.LocCode
     AND d.BookingID = h.BookingID
    WHERE RTRIM(h.LocCode) = ${locCode}
      AND RTRIM(h.BookingID) = ${bookingID}
  `;
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

    /* The acting user comes from the signed session cookie — never from the
       request body — so ConfirmedBy / CancelledBy audit fields are trustworthy. */
    const session = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);
    const actorName = session?.log || "ADMIN";
    const actor = toChar(actorName, 10);
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
      const remarksSchedule = decodeBookingSchedule(currentRemarks);
      const oldStartMin = slotToMinutes(currentTime);

      await ensureTxnRowsTx(tx, locCode, bookingID);

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
      // used for the conflict check or written to tbl_bookingservicedetail. The
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
          d.ScheduleIndex AS ScheduleIndex,
          d.ScheduleStartMin AS ScheduleStartMin,
          d.ScheduleEndMin AS ScheduleEndMin,
          COALESCE(NULLIF(i.SerDuration, 0), 30) AS DurationMin
        FROM tbl_bookingservicedetail d
        LEFT JOIN tbl_itemmaster i
          ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
         AND RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
        WHERE RTRIM(d.BookingID) = ${bookingID}
          AND RTRIM(d.LocCode) = ${locCode}
        FOR UPDATE
      `;
      const selfDetails = orderDetailsForSchedule(
        selfDetailRows.map((row) => ({
          ...row,
          ItemPrice: Number(row.ItemPrice) || 0,
        })),
      );
      const storedSchedule =
        scheduleFromDetailColumns(selfDetails) ?? remarksSchedule;
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

      if (targetTechID !== null) {
        const targetStartMin = newStartMin >= 0 ? newStartMin : oldStartMin;
        candidatePairs = buildFallbackSchedule(
          effectiveDetails,
          selfDurationMap,
          targetStartMin,
        );
      } else {
        candidatePairs = originalPairs.map(({ detail, entry }) => ({
          detail,
          entry: {
            ...entry,
            startMin: entry.startMin + scheduleShift,
            endMin: entry.endMin + scheduleShift,
          },
        }));
      }

      const candidateWindows = candidatePairs
        .map(({ detail, entry }) => {
          const techID = trimValue(detail.TechID);
          if (!techID || techID === "0") return null;

          return {
            techID,
            startMin: entry.startMin,
            // SerDuration is read from tbl_ItemMaster above. Never derive the
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

      // Cancelling releases capacity — it must never be blocked by a conflict.
      // The overlap assertion only applies when the booking stays active
      // (confirm / reschedule / technician reassignment).
      if (candidateWindows.length > 0 && candidateStartMin >= 0 && status !== "CANCELLED") {
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
            d.ScheduleIndex AS ScheduleIndex,
            d.ScheduleStartMin AS ScheduleStartMin,
            d.ScheduleEndMin AS ScheduleEndMin,
            (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
            h.Remarks AS Remarks,
            COALESCE(NULLIF(i.SerDuration, 0), 30) AS DurationMin
          FROM tbl_bookingheder h
          JOIN tbl_bookingservicedetail d
            ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
          LEFT JOIN tbl_itemmaster i
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
          const current: {
            startMin: number;
            remarks: string | null;
            details: RawDetail[];
            durations: Map<string, number>;
          } = rowsByBooking.get(id) || {
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
          const orderedDetails = orderDetailsForSchedule(booking.details);
          const storedSchedule =
            scheduleFromDetailColumns(orderedDetails) ??
            decodeBookingSchedule(booking.remarks);
          const pairs = resolveSchedulePairs(
            orderedDetails,
            storedSchedule,
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
        ? composeBookingRemarks(extractNotes(currentRemarks), [])
        : currentRemarks;

      // Any transaction-row backfill above is part of this same transaction.
      // From here on all related header/detail/status changes are also grouped,
      // so any later failure rolls every change back together.
      if (targetTechID !== null) {
        await tx.$executeRaw`
          UPDATE tbl_bookingservicedetail
          SET TechID = ${toChar(targetTechID, 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      }

      if (shouldUpdateSchedule) {
        for (const { detail, entry } of candidatePairs) {
          await tx.$executeRaw`
            UPDATE tbl_bookingservicedetail
            SET
              ScheduleIndex = ${entry.serviceIndex},
              ScheduleStartMin = ${entry.startMin},
              ScheduleEndMin = ${entry.endMin}
            WHERE RTRIM(BookingID) = ${bookingID}
              AND RTRIM(LocCode) = ${locCode}
              AND RTRIM(GuessID) = ${trimValue(detail.GuessID)}
              AND RTRIM(ServiceItemID) = ${trimValue(detail.ServiceItemID)}
          `;
        }
      }

      if (hasScheduleChange) {
        // BookingDate stores the complete schedule date and time. Remarks keeps
        // human notes only; old schedule metadata and Date:/Time: prefixes are
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

      if (hasScheduleChange) {
        // TxnDetail stores the booking date as well as the event timestamps.
        await tx.$executeRaw`
          UPDATE tbl_bookingtxndetail
          SET BookingDate = ${bookingDateTime}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      }

      if (statusToApply === "CONFIRMED") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET Status = ${toChar("CONFIRMED", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
        await tx.$executeRaw`
          UPDATE tbl_bookingtxndetail
          SET
            Confirmed = 1,
            ConfirmedBy = ${actor},
            ConfirmedDate = NOW(),
            CancelledDate = ${null},
            CancelledBy = ${toChar("", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (statusToApply === "CANCELLED") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET Status = ${toChar("CANCELLED", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
        await tx.$executeRaw`
          UPDATE tbl_bookingtxndetail
          SET
            Confirmed = 0,
            ConfirmedBy = ${toChar("", 10)},
            ConfirmedDate = ${null},
            CancelledDate = NOW(),
            CancelledBy = ${actor}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (statusToApply === "ONGOING") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET Status = ${toChar("ONGOING", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
        await tx.$executeRaw`
          UPDATE tbl_bookingtxndetail
          SET
            Confirmed = 1,
            ConfirmedBy = CASE
              WHEN COALESCE(RTRIM(ConfirmedBy), '') = '' THEN ${actor}
              ELSE ConfirmedBy
            END,
            ConfirmedDate = CASE
              WHEN ConfirmedDate IS NULL OR ConfirmedDate <= '1900-01-01 00:00:00' THEN NOW()
              ELSE ConfirmedDate
            END,
            CancelledDate = ${null},
            CancelledBy = ${toChar("", 10)},
            CheckInTime = CASE
              WHEN CheckInTime IS NULL OR CheckInTime <= '1900-01-01 00:00:00' THEN NOW()
              ELSE CheckInTime
            END
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
      } else if (statusToApply === "PENDING") {
        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET Status = ${toChar("PENDING", 10)}
          WHERE RTRIM(BookingID) = ${bookingID}
            AND RTRIM(LocCode) = ${locCode}
        `;
        await tx.$executeRaw`
          UPDATE tbl_bookingtxndetail
          SET
            Confirmed = 0,
            ConfirmedBy = ${toChar("", 10)},
            ConfirmedDate = ${null},
            CancelledDate = ${null},
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
          void logActivity(
            "system", "sms",
            `SMS FAILED to ${maskPhoneForLog(smsBooking.RegTel || "")} — booking ${bookingID} (${smsEvent}): ${smsResult.error || "unknown error"}`,
          );
        } else {
          void logActivity(
            "system", "sms",
            `SMS sent to ${maskPhoneForLog(smsBooking.RegTel || "")} — booking ${bookingID} (${smsEvent})`,
          );
        }
      }
    }

    const changes: string[] = [];
    if (status) changes.push(`status → ${trimValue(body.status)}`);
    if (hasScheduleChange)
      changes.push(`rescheduled to ${trimValue(body.date)} ${trimValue(body.timeSlot)}`);
    if (hasTechnicianChange) changes.push("technician reassigned");
    void logActivity(
      actorName, "appointments",
      `Booking ${bookingID}: ${changes.join(", ") || "updated"}`,
    );

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
