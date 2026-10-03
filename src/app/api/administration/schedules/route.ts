// /api/administration/schedules  — Tbl_StaffSchedule
// GET     ?from=&to=&staffId=     (ADSCH.ACCESS)
// POST    upsert one / many dates (ADSCH.SAVE)
// PUT     same as POST
// DELETE  ?txnDate=&staffId=      (ADSCH.DELETE)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/sessionGuard";
import { isSuperAdminGroupId, isSuperAdminUserId } from "@/lib/superAdmin";
import {
  HOURS_TABLE_HINT,
  asBool,
  bit,
  eachDate,
  isWeekday,
  minutesOf,
  missingHoursTable,
  mysqlDateTime,
  padStaffId,
  parseHhmm,
  parseIsoDate,
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
  TxnDate: string;
  StartTime: string;
  ClosingTime: string;
  OpemOrClose: number | boolean;
  ClosingRemarks: string;
}
interface SchedRow {
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
    TxnDate: String(r.TxnDate).slice(0, 10),
    StartTime: String(r.StartTime).slice(0, 5),
    ClosingTime: String(r.ClosingTime).slice(0, 5),
    Open: asBool(r.OpemOrClose),
    ClosingRemarks: String(r.ClosingRemarks ?? "").trim(),
  };
}
function mapSched(r: SchedRow) {
  return {
    TxnDate: String(r.TxnDate).slice(0, 10),
    StaffID: String(r.StaffID ?? "").trim(),
    StartTime: String(r.StartTime).slice(0, 5),
    ClosingTime: String(r.ClosingTime).slice(0, 5),
    Offday: asBool(r.Offday),
    LeaveOn: asBool(r.LeveOn),
    Remarks: String(r.Remarks ?? "").trim(),
  };
}

async function listHours(from: string, to: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<HoursRow[]>(
      `SELECT DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              OpemOrClose, ClosingRemarks
         FROM tbl_companyoperatinghours
        WHERE DATE(TxnDate) BETWEEN ? AND ?
        ORDER BY TxnDate`,
      from,
      to,
    );
    return rows.map(mapHours);
  } catch (e) {
    if (missingHoursTable(e)) return [] as ReturnType<typeof mapHours>[];
    throw e;
  }
}

async function listSchedules(from: string, to: string, staffId?: string | null) {
  const sql = staffId
    ? `SELECT DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              RTRIM(StaffID) AS StaffID,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              Offday, LeveOn, Remarks
         FROM tbl_staffschedule
        WHERE DATE(TxnDate) BETWEEN ? AND ? AND RTRIM(StaffID) = ?
        ORDER BY TxnDate, StaffID`
    : `SELECT DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              RTRIM(StaffID) AS StaffID,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              Offday, LeveOn, Remarks
         FROM tbl_staffschedule
        WHERE DATE(TxnDate) BETWEEN ? AND ?
        ORDER BY TxnDate, StaffID`;
  const rows = staffId
    ? await prisma.$queryRawUnsafe<SchedRow[]>(sql, from, to, staffId.trim())
    : await prisma.$queryRawUnsafe<SchedRow[]>(sql, from, to);
  return rows.map(mapSched);
}

async function listStaff() {
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
  return users
    .filter((u) => !isSuperAdminUserId(u.UserId) && !isSuperAdminGroupId(u.GroupId))
    .map((u) => ({
      UserId: String(u.UserId ?? "").trim(),
      UserName: String(u.UserName ?? "").trim(),
      GroupId: String(u.GroupId ?? "").trim(),
      Enable: Boolean(u.Enable),
      WorkingLocID: String(u.WorkingLocID ?? "").trim(),
    }));
}

function parseBody(body: Record<string, unknown>) {
  const staffId = String(body.staffId ?? body.StaffID ?? "").trim();
  if (!staffId) return { error: "staffId is required." };
  if (staffId.length > 10) return { error: "staffId must be 10 characters or less." };

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

  return { staffId, startTime, closingTime, offday, leaveOn, remarks, dates: unique };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSCH", action: "ACCESS" });
  if (!guard.ok) return guard.response;

  const from = parseIsoDate(req.nextUrl.searchParams.get("from")) ?? "1970-01-01";
  const to = parseIsoDate(req.nextUrl.searchParams.get("to")) ?? "2099-12-31";
  if (from > to) return err("from must be on or before to");
  const staffId = req.nextUrl.searchParams.get("staffId")?.trim() || null;

  try {
    const [staff, schedules, hours] = await Promise.all([
      listStaff(),
      listSchedules(from, to, staffId),
      listHours(from, to),
    ]);
    return ok({ staff, schedules, hours });
  } catch (e) {
    console.error("GET /api/administration/schedules", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to load staff schedules", 500);
  }
}

async function save(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSCH", action: "SAVE" });
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  const parsed = parseBody(body);
  if ("error" in parsed && parsed.error) return err(parsed.error);

  const { staffId, startTime, closingTime, offday, leaveOn, remarks, dates } = parsed as {
    staffId: string;
    startTime: string;
    closingTime: string;
    offday: number;
    leaveOn: number;
    remarks: string;
    dates: string[];
  };

  const padded = padStaffId(staffId);

  try {
    const placeholders = dates.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params: unknown[] = [];
    for (const txnDate of dates) {
      params.push(
        mysqlDateTime(txnDate, "00:00"),
        padded,
        mysqlDateTime(txnDate, startTime),
        mysqlDateTime(txnDate, closingTime),
        offday,
        leaveOn,
        remarks,
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO tbl_staffschedule
          (TxnDate, StaffID, StartTime, ClosingTime, Offday, LeveOn, Remarks)
       VALUES ${placeholders}
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
    const saved = await listSchedules(lo, hi, staffId);
    const rows = saved.filter((r) => dates.includes(r.TxnDate));
    return ok(dates.length === 1 ? rows[0] ?? {
      TxnDate: dates[0],
      StaffID: staffId,
      StartTime: startTime,
      ClosingTime: closingTime,
      Offday: offday === 1,
      LeaveOn: leaveOn === 1,
      Remarks: remarks.trim(),
    } : rows);
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

  const staffId = req.nextUrl.searchParams.get("staffId")?.trim();
  if (!staffId) return err("staffId is required");

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
    const placeholders = unique.map(() => "?").join(",");
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM tbl_staffschedule WHERE RTRIM(StaffID) = ? AND DATE(TxnDate) IN (${placeholders})`,
      staffId,
      ...unique,
    );
    return ok({ deleted: Number(result) });
  } catch (e) {
    console.error("DELETE /api/administration/schedules", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to delete staff schedule", 500);
  }
}
