// /api/administration/schedules  — Tbl_StaffSchedule (per LocCode)
// GET     ?from=&to=&locCode=&staffId=   (ADSCH.ACCESS)
// POST    upsert dates × staff at one location (ADSCH.SAVE)
// PUT     same as POST
// DELETE  ?locCode=&staffId=&txnDate=    (ADSCH.DELETE)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/sessionGuard";
import { isSuperAdminGroupId, isSuperAdminUserId } from "@/lib/superAdmin";
import {
  foreignLocation,
  locationDeniedMessage,
  locationScopeForRequest,
  scopedLocationRows,
} from "@/lib/locationScope";
import {
  HOURS_TABLE_HINT,
  asBool,
  bit,
  eachDate,
  isWeekday,
  minutesOf,
  missingHoursTable,
  mysqlDateTime,
  padLocCode,
  padStaffId,
  parseHhmm,
  parseIsoDate,
  parseLocCodes,
  trimStr,
} from "@/lib/operatingHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

interface HoursRow {
  LocCode: string;
  TxnDate: string;
  StartTime: string;
  ClosingTime: string;
  OpemOrClose: number | boolean;
  ClosingRemarks: string;
}
interface SchedRow {
  LocCode: string;
  TxnDate: string;
  StaffID: string;
  StartTime: string;
  ClosingTime: string;
  Offday: number | boolean;
  LeveOn: number | boolean;
  Remarks: string;
}

function mapHours(r: HoursRow) {
  return {
    LocCode: String(r.LocCode ?? "").trim(),
    TxnDate: String(r.TxnDate).slice(0, 10),
    StartTime: String(r.StartTime).slice(0, 5),
    ClosingTime: String(r.ClosingTime).slice(0, 5),
    Open: asBool(r.OpemOrClose),
    ClosingRemarks: String(r.ClosingRemarks ?? "").trim(),
  };
}
function mapSched(r: SchedRow) {
  return {
    LocCode: String(r.LocCode ?? "").trim(),
    TxnDate: String(r.TxnDate).slice(0, 10),
    StaffID: String(r.StaffID ?? "").trim(),
    StartTime: String(r.StartTime).slice(0, 5),
    ClosingTime: String(r.ClosingTime).slice(0, 5),
    Offday: asBool(r.Offday),
    LeaveOn: asBool(r.LeveOn),
    Remarks: String(r.Remarks ?? "").trim(),
  };
}

async function listHours(from: string, to: string, locCode: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<HoursRow[]>(
      `SELECT RTRIM(LocCode) AS LocCode,
              DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              OpemOrClose, ClosingRemarks
         FROM tbl_companyoperatinghours
        WHERE DATE(TxnDate) BETWEEN ? AND ?
          AND RTRIM(LocCode) = ?
        ORDER BY TxnDate`,
      from,
      to,
      locCode,
    );
    return rows.map(mapHours);
  } catch (e) {
    if (missingHoursTable(e)) return [] as ReturnType<typeof mapHours>[];
    throw e;
  }
}

async function listSchedules(from: string, to: string, locCode: string, staffId?: string | null) {
  const sql = staffId
    ? `SELECT RTRIM(LocCode) AS LocCode,
              DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              RTRIM(StaffID) AS StaffID,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              Offday, LeveOn, Remarks
         FROM tbl_staffschedule
        WHERE DATE(TxnDate) BETWEEN ? AND ? AND RTRIM(LocCode) = ? AND RTRIM(StaffID) = ?
        ORDER BY TxnDate, StaffID`
    : `SELECT RTRIM(LocCode) AS LocCode,
              DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              RTRIM(StaffID) AS StaffID,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              Offday, LeveOn, Remarks
         FROM tbl_staffschedule
        WHERE DATE(TxnDate) BETWEEN ? AND ? AND RTRIM(LocCode) = ?
        ORDER BY TxnDate, StaffID`;
  const rows = staffId
    ? await prisma.$queryRawUnsafe<SchedRow[]>(sql, from, to, locCode, staffId.trim())
    : await prisma.$queryRawUnsafe<SchedRow[]>(sql, from, to, locCode);
  return rows.map(mapSched);
}

async function listStaff(locCode: string) {
  const users = await prisma.tbl_userdetails.findMany({
    orderBy: { UserName: "asc" },
    select: {
      UserId: true,
      UserName: true,
      GroupId: true,
      Enable: true,
      WorkingLocID: true,
    },
  });
  const locUp = locCode.trim().toUpperCase();
  return users
    .filter((u) => !isSuperAdminUserId(u.UserId) && !isSuperAdminGroupId(u.GroupId))
    .filter((u) => String(u.WorkingLocID ?? "").trim().toUpperCase() === locUp)
    .map((u) => ({
      UserId: String(u.UserId ?? "").trim(),
      UserName: String(u.UserName ?? "").trim(),
      GroupId: String(u.GroupId ?? "").trim(),
      Enable: Boolean(u.Enable),
      WorkingLocID: String(u.WorkingLocID ?? "").trim(),
    }));
}

function parseStaffIds(body: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const one = String(body.staffId ?? body.StaffID ?? "").trim();
  if (one) ids.push(one);
  if (Array.isArray(body.staffIds)) {
    for (const x of body.staffIds) {
      const s = String(x ?? "").trim();
      if (s) ids.push(s);
    }
  }
  return [...new Set(ids)];
}

function parseBody(body: Record<string, unknown>) {
  const staffIds = parseStaffIds(body);
  if (staffIds.length === 0) return { error: "Select at least one staff member." };
  if (staffIds.some((id) => id.length > 10)) return { error: "staffId must be 10 characters or less." };

  const locCodes = parseLocCodes(body.locCode ?? body.LocCode ?? body.locCodes);
  if (locCodes.length !== 1) return { error: "Exactly one location is required." };

  const offday = bit(body.offday ?? body.Offday);
  const leaveOn = bit(body.leaveOn ?? body.LeaveOn ?? body.LeveOn);
  const away = offday === 1 || leaveOn === 1;

  const startTime = parseHhmm(body.startTime ?? body.StartTime) ?? (away ? "00:00" : null);
  const closingTime = parseHhmm(body.closingTime ?? body.ClosingTime) ?? (away ? "00:00" : null);
  if (!startTime) return { error: "Start time is required (HH:MM)." };
  if (!closingTime) return { error: "Closing time is required (HH:MM)." };
  if (!away && minutesOf(closingTime) <= minutesOf(startTime)) {
    return { error: "Closing time must be after start time." };
  }
  const remarks = trimStr(body.remarks ?? body.Remarks, " ").slice(0, 200);

  const dates: string[] = [];
  const one = parseIsoDate(body.txnDate ?? body.TxnDate);
  if (one) dates.push(one);
  if (Array.isArray(body.dates)) {
    for (const d of body.dates) {
      const iso = parseIsoDate(d);
      if (iso) dates.push(iso);
    }
  }
  const from = parseIsoDate(body.from);
  const to = parseIsoDate(body.to);
  if (from && to) {
    const weekdaysOnly = body.weekdaysOnly === true;
    for (const d of eachDate(from, to)) {
      if (!weekdaysOnly || isWeekday(d)) dates.push(d);
    }
  }
  const unique = [...new Set(dates)];
  if (unique.length === 0) return { error: "A date (txnDate) or a date range is required." };
  if (unique.length > 100) return { error: "At most 100 dates can be saved in one request." };
  if (staffIds.length > 50) return { error: "At most 50 staff can be saved in one request." };

  return { staffIds, locCode: locCodes[0], startTime, closingTime, offday, leaveOn, remarks, dates: unique };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSCH", action: "ACCESS" });
  if (!guard.ok) return guard.response;
  const scoped = await locationScopeForRequest(req);
  if (!scoped.ok) return scoped.response;

  const from = parseIsoDate(req.nextUrl.searchParams.get("from")) ?? "1970-01-01";
  const to = parseIsoDate(req.nextUrl.searchParams.get("to")) ?? "2099-12-31";
  if (from > to) return err("from must be on or before to");

  const locations = await scopedLocationRows(scoped.scope);
  const asked = parseLocCodes(req.nextUrl.searchParams.get("locCode"))[0]
    ?? scoped.scope.workingLocId
    ?? locations[0]?.LocCode
    ?? "";
  if (!asked) return ok({ staff: [], schedules: [], hours: [], locations, locCode: "" });
  const bad = foreignLocation(scoped.scope, [asked]);
  if (bad) return err(locationDeniedMessage(bad), 403);

  const staffId = req.nextUrl.searchParams.get("staffId")?.trim() || null;

  try {
    const [staff, schedules, hours] = await Promise.all([
      listStaff(asked),
      listSchedules(from, to, asked, staffId),
      listHours(from, to, asked),
    ]);
    return ok({ staff, schedules, hours, locations, locCode: asked });
  } catch (e) {
    console.error("GET /api/administration/schedules", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to load staff schedules", 500);
  }
}

async function save(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSCH", action: "SAVE" });
  if (!guard.ok) return guard.response;
  const scoped = await locationScopeForRequest(req);
  if (!scoped.ok) return scoped.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  const parsed = parseBody(body);
  if ("error" in parsed && parsed.error) return err(parsed.error);

  const { staffIds, locCode, startTime, closingTime, offday, leaveOn, remarks, dates } = parsed as {
    staffIds: string[];
    locCode: string;
    startTime: string;
    closingTime: string;
    offday: number;
    leaveOn: number;
    remarks: string;
    dates: string[];
  };

  const denied = foreignLocation(scoped.scope, [locCode]);
  if (denied) return err(locationDeniedMessage(denied), 403);

  try {
    const hours = await listHours(
      dates.reduce((a, b) => (a < b ? a : b)),
      dates.reduce((a, b) => (a > b ? a : b)),
      locCode,
    );
    const openDates = new Set(hours.filter((h) => h.Open).map((h) => h.TxnDate));
    const blocked = dates.filter((d) => !openDates.has(d));
    if (blocked.length) {
      return err(
        `Cannot save a staff schedule on a closed or unset day for this location (${blocked.slice(0, 5).join(", ")}${blocked.length > 5 ? "…" : ""}).`,
      );
    }

    const paddedLoc = padLocCode(locCode);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    for (const staffId of staffIds) {
      const padded = padStaffId(staffId);
      for (const txnDate of dates) {
        placeholders.push("(?, ?, ?, ?, ?, ?, ?, ?)");
        params.push(
          paddedLoc,
          mysqlDateTime(txnDate, "00:00"),
          padded,
          mysqlDateTime(txnDate, startTime),
          mysqlDateTime(txnDate, closingTime),
          offday,
          leaveOn,
          remarks,
        );
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO tbl_staffschedule
          (LocCode, TxnDate, StaffID, StartTime, ClosingTime, Offday, LeveOn, Remarks)
       VALUES ${placeholders.join(", ")}
       ON DUPLICATE KEY UPDATE
          StartTime = VALUES(StartTime),
          ClosingTime = VALUES(ClosingTime),
          Offday = VALUES(Offday),
          LeveOn = VALUES(LeveOn),
          Remarks = VALUES(Remarks)`,
      ...params,
    );
    const lo = dates.reduce((a, b) => (a < b ? a : b));
    const hi = dates.reduce((a, b) => (a > b ? a : b));
    const saved = await listSchedules(lo, hi, locCode);
    const idSet = new Set(staffIds.map((s) => s.trim().toUpperCase()));
    const rows = saved.filter((r) => dates.includes(r.TxnDate) && idSet.has(r.StaffID.toUpperCase()));
    return ok(rows);
  } catch (e) {
    console.error("SAVE /api/administration/schedules", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to save staff schedule", 500);
  }
}

export async function POST(req: NextRequest) {
  return save(req);
}
export async function PUT(req: NextRequest) {
  return save(req);
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSCH", action: "DELETE" });
  if (!guard.ok) return guard.response;
  const scoped = await locationScopeForRequest(req);
  if (!scoped.ok) return scoped.response;

  const locCode = parseLocCodes(req.nextUrl.searchParams.get("locCode"))[0] ?? "";
  if (!locCode) return err("locCode is required");
  const denied = foreignLocation(scoped.scope, [locCode]);
  if (denied) return err(locationDeniedMessage(denied), 403);

  const staffIds = [
    req.nextUrl.searchParams.get("staffId")?.trim() || "",
    ...(req.nextUrl.searchParams.get("staffIds") ?? "").split(","),
  ].map((s) => s.trim()).filter(Boolean);
  const uniqueStaff = [...new Set(staffIds)];
  if (uniqueStaff.length === 0) return err("staffId is required");

  const dates: string[] = [];
  const one = parseIsoDate(req.nextUrl.searchParams.get("txnDate"));
  if (one) dates.push(one);
  const extra = req.nextUrl.searchParams.get("dates") ?? "";
  for (const part of extra.split(",")) {
    const iso = parseIsoDate(part);
    if (iso) dates.push(iso);
  }
  const unique = [...new Set(dates)];
  if (unique.length === 0) return err("txnDate or dates is required");
  if (unique.length > 100) return err("At most 100 dates can be deleted in one request.");

  try {
    const datePh = unique.map(() => "?").join(",");
    const staffPh = uniqueStaff.map(() => "?").join(",");
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM tbl_staffschedule
        WHERE RTRIM(LocCode) = ?
          AND RTRIM(StaffID) IN (${staffPh})
          AND DATE(TxnDate) IN (${datePh})`,
      locCode,
      ...uniqueStaff,
      ...unique,
    );
    return ok({ deleted: Number(result) });
  } catch (e) {
    console.error("DELETE /api/administration/schedules", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to delete staff schedule", 500);
  }
}
