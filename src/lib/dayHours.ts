// Server-only: company hours + staff schedule for a booking date + location.
// Missing tables or a missing row ⇒ that branch is closed that day.
// Staff with no roster row at that branch/date do not appear (not salon-hours).

import { prisma } from "@/lib/prisma";
import {
  asBool,
  clockToMinutes,
  generateDaySlots,
  missingHoursTable,
  parseIsoDate,
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

export interface StaffDay {
  staffId: string;
  working: boolean;
  offday: boolean;
  leaveOn: boolean;
  startMin: number;
  closeMin: number;
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
  const open = asBool(row.OpemOrClose) && startMin >= 0 && closeMin > startMin;
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
          AND RTRIM(LocCode) = ?`,
      iso,
      loc,
    );
    for (const r of rows) {
      const staffId = String(r.StaffID ?? "").trim();
      if (!staffId) continue;
      const offday = asBool(r.Offday);
      const leaveOn = asBool(r.LeveOn);
      const startMin = clockToMinutes(`${r.StartTime}`);
      const closeMin = clockToMinutes(`${r.ClosingTime}`);
      out.set(staffId.toUpperCase(), {
        staffId,
        working: !offday && !leaveOn && startMin >= 0 && closeMin > startMin,
        offday,
        leaveOn,
        startMin,
        closeMin,
        remarks: String(r.Remarks ?? "").trim(),
      });
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
  reason: "salon-closed" | "off" | "leave" | "shift" | "unscheduled";
} {
  if (!company.open) {
    return { working: false, startMin: 0, closeMin: 0, reason: "salon-closed" };
  }
  if (!staff) {
    return { working: false, startMin: 0, closeMin: 0, reason: "unscheduled" };
  }
  if (staff.leaveOn) {
    return { working: false, startMin: 0, closeMin: 0, reason: "leave" };
  }
  if (staff.offday || !staff.working) {
    return { working: false, startMin: 0, closeMin: 0, reason: "off" };
  }
  const startMin = Math.max(company.startMin, staff.startMin);
  const closeMin = Math.min(company.closeMin, staff.closeMin);
  if (closeMin <= startMin) {
    return { working: false, startMin: 0, closeMin: 0, reason: "shift" };
  }
  return { working: true, startMin, closeMin, reason: "shift" };
}

export function slotsOutsideWindow(
  slots: string[],
  startMin: number,
  closeMin: number,
): string[] {
  return slots.filter((slot) => {
    const t = clockToMinutes(slot);
    return t < startMin || t >= closeMin;
  });
}
