// /api/administration/hours  — Tbl_CompanyOperatingHours (per LocCode)
// GET    ?from=&to=&locCode=     (ADHRS.ACCESS)  locCode may be csv / omitted = all allowed
// POST   upsert dates × locations (ADHRS.SAVE)
// PUT    same as POST
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/sessionGuard";
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
  parseHhmm,
  parseIsoDate,
  parseLocCodes,
  trimStr,
} from "@/lib/operatingHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function ok(data: unknown, extra?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, data, ...extra }, { status });
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

async function listHours(from: string, to: string, locCodes?: string[]) {
  const locs = (locCodes ?? []).map((c) => c.trim()).filter(Boolean);
  const locSql = locs.length
    ? `AND RTRIM(LocCode) IN (${locs.map(() => "?").join(",")})`
    : "";
  const rows = await prisma.$queryRawUnsafe<HoursRow[]>(
    `SELECT RTRIM(LocCode) AS LocCode,
            DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
            DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
            DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
            OpemOrClose, ClosingRemarks
       FROM tbl_companyoperatinghours
      WHERE DATE(TxnDate) BETWEEN ? AND ?
        ${locSql}
      ORDER BY LocCode, TxnDate`,
    from,
    to,
    ...locs,
  );
  return rows.map(mapHours);
}

function parseBody(body: Record<string, unknown>) {
  const startTime = parseHhmm(body.startTime ?? body.StartTime);
  const closingTime = parseHhmm(body.closingTime ?? body.ClosingTime);
  if (!startTime) return { error: "Start time is required (HH:MM)." };
  if (!closingTime) return { error: "Closing time is required (HH:MM)." };

  const open = bit(body.open ?? body.Open ?? body.OpemOrClose ?? true);
  if (open && minutesOf(closingTime) <= minutesOf(startTime)) {
    return { error: "Closing time must be after start time." };
  }
  const remarks = trimStr(body.closingRemarks ?? body.ClosingRemarks, " ").slice(0, 200);

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

  const locCodes = parseLocCodes(body.locCodes ?? body.locCode ?? body.LocCode);
  const allLocations = body.allLocations === true || body.all === true;

  return { startTime, closingTime, open, remarks, dates: unique, locCodes, allLocations };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADHRS", action: "ACCESS" });
  if (!guard.ok) return guard.response;
  const scoped = await locationScopeForRequest(req);
  if (!scoped.ok) return scoped.response;

  const from = parseIsoDate(req.nextUrl.searchParams.get("from")) ?? "1970-01-01";
  const to = parseIsoDate(req.nextUrl.searchParams.get("to")) ?? "2099-12-31";
  if (from > to) return err("from must be on or before to");

  const asked = parseLocCodes(req.nextUrl.searchParams.get("locCode"));
  const bad = foreignLocation(scoped.scope, asked);
  if (bad) return err(locationDeniedMessage(bad), 403);

  try {
    const locations = await scopedLocationRows(scoped.scope);
    const allowed = asked.length
      ? asked.filter((c) => locations.some((l) => l.LocCode.toUpperCase() === c.toUpperCase()))
      : locations.map((l) => l.LocCode);
    return ok(await listHours(from, to, allowed), { locations });
  } catch (e) {
    console.error("GET /api/administration/hours", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to load operational hours", 500);
  }
}

async function save(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADHRS", action: "SAVE" });
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

  const { startTime, closingTime, open, remarks, dates, locCodes, allLocations } = parsed as {
    startTime: string;
    closingTime: string;
    open: number;
    remarks: string;
    dates: string[];
    locCodes: string[];
    allLocations: boolean;
  };

  const locations = await scopedLocationRows(scoped.scope);
  const allowedUp = new Map(locations.map((l) => [l.LocCode.toUpperCase(), l.LocCode]));
  let targets = allLocations
    ? locations.map((l) => l.LocCode)
    : locCodes.map((c) => allowedUp.get(c.toUpperCase())).filter((c): c is string => Boolean(c));

  if (targets.length === 0) return err("Select at least one location you have access to.");
  const denied = foreignLocation(scoped.scope, targets);
  if (denied) return err(locationDeniedMessage(denied), 403);
  if (targets.length > 50) return err("At most 50 locations can be saved in one request.");

  try {
    const placeholders: string[] = [];
    const params: unknown[] = [];
    for (const loc of targets) {
      const padded = padLocCode(loc);
      for (const txnDate of dates) {
        placeholders.push("(?, ?, ?, ?, ?, ?)");
        params.push(
          padded,
          mysqlDateTime(txnDate, "00:00"),
          mysqlDateTime(txnDate, startTime),
          mysqlDateTime(txnDate, closingTime),
          open,
          remarks,
        );
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO tbl_companyoperatinghours
          (LocCode, TxnDate, StartTime, ClosingTime, OpemOrClose, ClosingRemarks)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
          StartTime = VALUES(StartTime),
          ClosingTime = VALUES(ClosingTime),
          OpemOrClose = VALUES(OpemOrClose),
          ClosingRemarks = VALUES(ClosingRemarks)`,
      ...params,
    );
    const lo = dates.reduce((a, b) => (a < b ? a : b));
    const hi = dates.reduce((a, b) => (a > b ? a : b));
    const list = await listHours(lo, hi, targets);
    const saved = list.filter((r) => dates.includes(r.TxnDate));
    return ok(saved);
  } catch (e) {
    console.error("SAVE /api/administration/hours", e);
    if (missingHoursTable(e)) return err(HOURS_TABLE_HINT, 503);
    return err("Failed to save operational hours", 500);
  }
}

export async function POST(req: NextRequest) {
  return save(req);
}
export async function PUT(req: NextRequest) {
  return save(req);
}
