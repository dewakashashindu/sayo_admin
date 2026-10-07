// Shared helpers for Tbl_CompanyOperatingHours / Tbl_StaffSchedule.
// Times are wall-clock stored in MySQL DATETIME (no timezone). APIs read/write
// via DATE_FORMAT so Node's timezone cannot shift the date or the clock.

export const HOURS_TABLE_HINT =
  "Hours tables need LocCode. Run scripts/create-Tbl_OperatingHours-mysql.sql then scripts/alter-Tbl_OperatingHours-loccode-mysql.sql on the live database (phpMyAdmin). Do not prisma db push.";

export function missingHoursTable(e: unknown): boolean {
  const msg = String((e as { message?: string } | undefined)?.message ?? e);
  return /tbl_companyoperatinghours|tbl_staffschedule|tbl_staffsessions|doesn't exist|ER_NO_SUCH_TABLE|1146|P2021|unknown column ['`]?loccode/i.test(msg);
}

export function missingSessionNo(e: unknown): boolean {
  const msg = String((e as { message?: string } | undefined)?.message ?? e);
  return /unknown column ['`]?(sessionno|seasonno)/i.test(msg);
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

export function padLocCode(id: string): string {
  return String(id ?? "").trim().padEnd(10, " ").slice(0, 10);
}

export function parseLocCodes(v: unknown): string[] {
  const out: string[] = [];
  const push = (x: unknown) => {
    const s = String(x ?? "").trim();
    if (s) out.push(s.slice(0, 10));
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (typeof v === "string" && v.trim()) v.split(",").forEach(push);
  return [...new Set(out)];
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
export const MINUTES_PER_DAY = 24 * 60;

/** Close before start ⇒ overnight (close is next calendar morning). Equal is empty. */
export function isOvernightClock(startMin: number, closeMin: number): boolean {
  return startMin >= 0 && closeMin >= 0 && closeMin < startMin;
}

/** Exclusive end on a 0..2880 timeline. Overnight close is closeMin + 1440. `-1` if empty. */
export function spanEndMin(startMin: number, closeMin: number): number {
  if (!(startMin >= 0) || !(closeMin >= 0) || startMin === closeMin) return -1;
  return closeMin > startMin ? closeMin : closeMin + MINUTES_PER_DAY;
}

export function clockFromAbs(absMin: number): number {
  return ((Math.round(absMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Slot-start (or any clock) inside [start, close) — wraps midnight when overnight. */
export function clockInSpan(t: number, startMin: number, closeMin: number): boolean {
  if (t < 0 || startMin < 0 || closeMin < 0 || startMin === closeMin) return false;
  if (closeMin > startMin) return t >= startMin && t < closeMin;
  return t >= startMin || t < closeMin;
}

/**
 * Shift a same-day or overnight interval onto the company span.
 * Tries 0 / +1440 / −1440 so 00:00–06:00 fits a 22:00–06:00 salon night.
 */
export function absIntervalOnSpan(
  startMin: number,
  closeMin: number,
  companyStart: number,
  companyClose: number,
): { a: number; b: number } | null {
  const c0 = companyStart;
  const c1 = spanEndMin(companyStart, companyClose);
  const s1 = spanEndMin(startMin, closeMin);
  if (c1 < 0 || s1 < 0) return null;
  for (const sh of [0, MINUTES_PER_DAY, -MINUTES_PER_DAY]) {
    const a = startMin + sh;
    const b = s1 + sh;
    if (a >= c0 && b <= c1 && b > a) return { a, b };
  }
  return null;
}

/** Session fully inside salon hours (overnight session only fits an overnight salon). */
export function intervalFitsSpan(
  startMin: number,
  closeMin: number,
  companyStart: number,
  companyClose: number,
): boolean {
  return absIntervalOnSpan(startMin, closeMin, companyStart, companyClose) != null;
}

/** Intersect a staff window with salon hours; overnight-aware. */
export function clipClockWindow(
  startMin: number,
  closeMin: number,
  companyStart: number,
  companyClose: number,
): { startMin: number; closeMin: number } | null {
  const c0 = companyStart;
  const c1 = spanEndMin(companyStart, companyClose);
  const s1 = spanEndMin(startMin, closeMin);
  if (c1 < 0 || s1 < 0) return null;
  for (const sh of [0, MINUTES_PER_DAY, -MINUTES_PER_DAY]) {
    const lo = Math.max(startMin + sh, c0);
    const hi = Math.min(s1 + sh, c1);
    if (hi > lo) {
      return { startMin: clockFromAbs(lo), closeMin: clockFromAbs(hi) };
    }
  }
  return null;
}

export function absStartOnSpan(t: number, companyStart: number, companyClose: number): number {
  const c1 = spanEndMin(companyStart, companyClose);
  if (c1 < 0 || t < 0) return t;
  if (t + MINUTES_PER_DAY >= companyStart && t + MINUTES_PER_DAY < c1 && t < companyStart) {
    return t + MINUTES_PER_DAY;
  }
  return t;
}

/**
 * Booking interval [from, to) inside a window. `to` may be from+duration (>1440)
 * or a wrapped clock (to <= from).
 */
export function intervalInsideSpan(
  fromMin: number,
  toMin: number,
  startMin: number,
  closeMin: number,
): boolean {
  if (fromMin < 0) return false;
  let dur = toMin - fromMin;
  if (dur <= 0) dur += MINUTES_PER_DAY;
  if (dur <= 0 || dur > MINUTES_PER_DAY) return false;
  const c0 = startMin;
  const c1 = spanEndMin(startMin, closeMin);
  if (c1 < 0) return false;
  const clock = clockFromAbs(fromMin);
  for (const sh of [0, MINUTES_PER_DAY]) {
    const a = clock + sh;
    const b = a + dur;
    if (a >= c0 && b <= c1) return true;
  }
  return false;
}

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
 * 30-minute start-time grid from opening up to, but not including, closing.
 * A slot at the exact closing time cannot fit any positive-duration service.
 * Open 10:15 → first slot 10:30. Close 19:00 → last start 06:30 PM.
 */
export function generateDaySlots(startMin: number, closeMin: number, padHour = true): string[] {
  const end = spanEndMin(startMin, closeMin);
  if (end < 0) return [];
  const first = Math.ceil(startMin / SLOT_MINUTES) * SLOT_MINUTES;
  const last = Math.floor((end - 1) / SLOT_MINUTES) * SLOT_MINUTES;
  const out: string[] = [];
  for (let t = first; t <= last; t += SLOT_MINUTES) {
    out.push(minutesToClockSlot(t, padHour));
  }
  return out;
}

export function slotInList(slot: string, slots: string[]): boolean {
  const want = clockToMinutes(slot);
  if (want < 0) return false;
  return slots.some((s) => clockToMinutes(s) === want);
}
