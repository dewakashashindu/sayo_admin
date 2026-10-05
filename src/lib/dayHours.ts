// Server-only: company hours + staff schedule for a booking date + location.
// Missing tables or a missing row ⇒ that branch is closed that day.
// Staff with no roster row at that branch/date do not appear (not salon-hours).

import { prisma } from "@/lib/prisma";
import {
  absStartOnSpan,
  asBool,
  clipClockWindow,
  clockInSpan,
  clockToMinutes,
  generateDaySlots,
  missingHoursTable,
  parseIsoDate,
  spanEndMin,
} from "@/lib/operatingHours";

export interface CompanyDay {
  date: string;
  locCode: string;
  open: boolean;
  startMin: number;
  closeMin: number;
  startTime: string;
  closingTime: string;
  remarks: string;
  slots: string[];
}

export interface StaffWindow {
  startMin: number;
  closeMin: number;
}

export interface StaffDay {
  staffId: string;
  working: boolean;
  offday: boolean;
  leaveOn: boolean;
  startMin: number;
  closeMin: number;
  windows: StaffWindow[];
  remarks: string;
}

interface HoursRow {
  TxnDate: string;
  StartTime: string;
  ClosingTime: string;
  OpemOrClose: number | boolean;
  ClosingRemarks: string;
}
interface SchedRow {
  StaffID: string;
  StartTime: string;
  ClosingTime: string;
  Offday: number | boolean;
  LeveOn: number | boolean;
  Remarks: string;
}

export function closedCompanyDay(date: string, locCode = "", remarks = ""): CompanyDay {
  return {
    date,
    locCode,
    open: false,
    startMin: 0,
    closeMin: 0,
    startTime: "",
    closingTime: "",
    remarks,
    slots: [],
  };
}

function mapCompany(date: string, locCode: string, row: HoursRow | undefined): CompanyDay {
  if (!row) return closedCompanyDay(date, locCode);
  const startMin = clockToMinutes(`${row.StartTime}`);
  const closeMin = clockToMinutes(`${row.ClosingTime}`);
  const open = asBool(row.OpemOrClose) && spanEndMin(startMin, closeMin) > startMin;
  if (!open) {
    return {
      ...closedCompanyDay(date, locCode, String(row.ClosingRemarks ?? "").trim()),
      startTime: String(row.StartTime ?? "").slice(0, 5),
      closingTime: String(row.ClosingTime ?? "").slice(0, 5),
    };
  }
  return {
    date,
    locCode,
    open: true,
    startMin,
    closeMin,
    startTime: String(row.StartTime ?? "").slice(0, 5),
    closingTime: String(row.ClosingTime ?? "").slice(0, 5),
    remarks: String(row.ClosingRemarks ?? "").trim(),
    slots: generateDaySlots(startMin, closeMin, true),
  };
}

export async function loadCompanyDays(from: string, to: string, locCode: string): Promise<CompanyDay[]> {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const loc = String(locCode ?? "").trim();
  if (!a || !b || a > b || !loc) return [];
  try {
    const rows = await prisma.$queryRawUnsafe<HoursRow[]>(
      `SELECT DATE_FORMAT(TxnDate, '%Y-%m-%d') AS TxnDate,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              OpemOrClose, ClosingRemarks
         FROM tbl_companyoperatinghours
        WHERE DATE(TxnDate) BETWEEN ? AND ?
          AND RTRIM(LocCode) = ?
        ORDER BY TxnDate`,
      a,
      b,
      loc,
    );
    const byDate = new Map(rows.map((r) => [String(r.TxnDate).slice(0, 10), r]));
    // Return only stored days (calendar clients collect open dates from this list).
    return rows.map((r) => mapCompany(String(r.TxnDate).slice(0, 10), loc, byDate.get(String(r.TxnDate).slice(0, 10))));
  } catch (e) {
    if (missingHoursTable(e)) return [];
    throw e;
  }
}

export async function loadCompanyDay(date: string, locCode: string): Promise<CompanyDay> {
  const iso = parseIsoDate(date);
  const loc = String(locCode ?? "").trim();
  if (!iso) return closedCompanyDay(String(date ?? ""), loc);
  if (!loc) return closedCompanyDay(iso, "");
  const days = await loadCompanyDays(iso, iso, loc);
  return days[0] ?? closedCompanyDay(iso, loc);
}

export async function loadStaffDays(date: string, locCode: string): Promise<Map<string, StaffDay>> {
  const iso = parseIsoDate(date);
  const loc = String(locCode ?? "").trim();
  const out = new Map<string, StaffDay>();
  if (!iso || !loc) return out;
  try {
    const rows = await prisma.$queryRawUnsafe<SchedRow[]>(
      `SELECT RTRIM(StaffID) AS StaffID,
              DATE_FORMAT(StartTime, '%H:%i') AS StartTime,
              DATE_FORMAT(ClosingTime, '%H:%i') AS ClosingTime,
              Offday, LeveOn, Remarks
         FROM tbl_staffschedule
        WHERE DATE(TxnDate) = ?
          AND RTRIM(LocCode) = ?
        ORDER BY StaffID, StartTime`,
      iso,
      loc,
    );
    for (const r of rows) {
      const staffId = String(r.StaffID ?? "").trim();
      if (!staffId) continue;
      const key = staffId.toUpperCase();
      const offday = asBool(r.Offday);
      const leaveOn = asBool(r.LeveOn);
      const away = offday || leaveOn;
      const startMin = clockToMinutes(`${r.StartTime}`);
      const closeMin = clockToMinutes(`${r.ClosingTime}`);
      const prev = out.get(key);
      const win = !away && spanEndMin(startMin, closeMin) > startMin ? [{ startMin, closeMin }] : [];
      if (!prev) {
        out.set(key, {
          staffId,
          working: win.length > 0,
          offday: away && win.length === 0 && offday,
          leaveOn: away && win.length === 0 && leaveOn,
          startMin: win[0]?.startMin ?? 0,
          closeMin: win[0]?.closeMin ?? 0,
          windows: win,
          remarks: String(r.Remarks ?? "").trim(),
        });
        continue;
      }
      if (win.length) {
        prev.windows = [...prev.windows, ...win].sort((a, b) => {
          const key = (w: StaffWindow) =>
            w.closeMin < w.startMin || w.startMin >= 12 * 60 ? w.startMin : w.startMin + 24 * 60;
          return key(a) - key(b);
        });
        prev.working = true;
        prev.offday = false;
        prev.leaveOn = false;
        prev.startMin = prev.windows[0].startMin;
        prev.closeMin = prev.windows[prev.windows.length - 1].closeMin;
        const rmk = String(r.Remarks ?? "").trim();
        if (rmk) prev.remarks = rmk;
        continue;
      }
      if (!prev.working) {
        prev.offday = prev.offday || offday;
        prev.leaveOn = prev.leaveOn || leaveOn;
      }
    }
    return out;
  } catch (e) {
    if (missingHoursTable(e)) return out;
    throw e;
  }
}

/** No roster row ⇒ not working (hidden from appointments). Off / leave ⇒ not working. */
export function resolveStaffWindow(company: CompanyDay, staff: StaffDay | undefined): {
  working: boolean;
  startMin: number;
  closeMin: number;
  windows: StaffWindow[];
  reason: "salon-closed" | "off" | "leave" | "shift" | "unscheduled";
} {
  const empty = { working: false as const, startMin: 0, closeMin: 0, windows: [] as StaffWindow[] };
  if (!company.open) {
    return { ...empty, reason: "salon-closed" };
  }
  if (!staff) {
    return { ...empty, reason: "unscheduled" };
  }
  if (staff.leaveOn) {
    return { ...empty, reason: "leave" };
  }
  if (staff.offday || !staff.working) {
    return { ...empty, reason: "off" };
  }
  const src = staff.windows.length ? staff.windows : [{ startMin: staff.startMin, closeMin: staff.closeMin }];
  const windows = src
    .map((w) => clipClockWindow(w.startMin, w.closeMin, company.startMin, company.closeMin))
    .filter((w): w is StaffWindow => Boolean(w))
    .sort(
      (a, b) =>
        absStartOnSpan(a.startMin, company.startMin, company.closeMin) -
        absStartOnSpan(b.startMin, company.startMin, company.closeMin),
    );
  if (!windows.length) {
    return { ...empty, reason: "shift" };
  }
  return {
    working: true,
    startMin: windows[0].startMin,
    closeMin: windows[windows.length - 1].closeMin,
    windows,
    reason: "shift",
  };
}

export function slotsOutsideWindow(
  slots: string[],
  startMin: number,
  closeMin: number,
): string[] {
  return slots.filter((slot) => {
    const t = clockToMinutes(slot);
    return !clockInSpan(t, startMin, closeMin);
  });
}

export function slotsOutsideWindows(
  slots: string[],
  windows: StaffWindow[],
): string[] {
  if (!windows.length) return slots;
  return slots.filter((slot) => {
    const t = clockToMinutes(slot);
    return !windows.some((w) => clockInSpan(t, w.startMin, w.closeMin));
  });
}
