// Shared helpers for Tbl_CompanyOperatingHours / Tbl_StaffSchedule.
// Times are wall-clock stored in MySQL DATETIME (no timezone). APIs read/write
// via DATE_FORMAT so Node's timezone cannot shift the date or the clock.

export const HOURS_TABLE_HINT =
  "Tables are not created yet. Run scripts/create-Tbl_OperatingHours-mysql.sql on the live database (phpMyAdmin), then retry.";

export function missingHoursTable(e: unknown): boolean {
  const msg = String((e as { message?: string } | undefined)?.message ?? e);
  return /tbl_companyoperatinghours|tbl_staffschedule|doesn't exist|ER_NO_SUCH_TABLE|1146|P2021/i.test(msg);
}

export function parseIsoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function parseHhmm(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function mysqlDateTime(isoDate: string, hhmm = "00:00"): string {
  return `${isoDate} ${hhmm}:00`;
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function padStaffId(id: string): string {
  return String(id ?? "").trim().padEnd(10, " ").slice(0, 10);
}

export function bit(v: unknown): number {
  return v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;
}

export function asBool(v: unknown): boolean {
  return Number(v) === 1 || v === true;
}

export function trimStr(v: unknown, fallback = " "): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

export function monthBounds(iso: string): { from: string; to: string } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${iso.slice(0, 7)}-01`,
    to: `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`,
  };
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

export function isWeekday(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`).getDay();
  return d >= 1 && d <= 5;
}

export const SLOT_MINUTES = 30;

/** Minutes past midnight from `HH:MM` or `h:mm AM/PM`. `-1` when unusable. */
export function clockToMinutes(value: unknown): number {
  const raw = String(value ?? "").trim();
  const hhmm = parseHhmm(raw);
  if (hhmm && !/[ap]m/i.test(raw)) return minutesOf(hhmm);
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const period = m[3].toUpperCase();
  if (h < 1 || h > 12 || min > 59) return -1;
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

export function minutesToClockSlot(minutes: number, padHour = true): string {
  const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(safe / 60);
  const mn = safe % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const hour = padHour ? String(h12).padStart(2, "0") : String(h12);
  return `${hour}:${String(mn).padStart(2, "0")} ${period}`;
}

/**
 * 30-minute clock grid from open → close (inclusive of a closing time that
 * lands on :00/:30, matching the old 9:00 AM … 6:00 PM list).
 * Open 10:15 → first slot 10:30. Close 19:00 → last start 07:00 PM.
 */
export function generateDaySlots(startMin: number, closeMin: number, padHour = true): string[] {
  if (!(startMin >= 0) || !(closeMin > startMin)) return [];
  const first = Math.ceil(startMin / SLOT_MINUTES) * SLOT_MINUTES;
  const last = Math.floor(closeMin / SLOT_MINUTES) * SLOT_MINUTES;
  const out: string[] = [];
  for (let t = first; t <= last && t < 24 * 60; t += SLOT_MINUTES) {
    out.push(minutesToClockSlot(t, padHour));
  }
  return out;
}

export function slotInList(slot: string, slots: string[]): boolean {
  const want = clockToMinutes(slot);
  if (want < 0) return false;
  return slots.some((s) => clockToMinutes(s) === want);
}
