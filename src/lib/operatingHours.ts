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
