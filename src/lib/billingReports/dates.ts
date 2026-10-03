/** Local-calendar date helpers for Billing Reports (UI-only). */

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function yearStartISO(d = new Date()): string {
  return `${d.getFullYear()}-01-01`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function startOfWeekMonday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay(); // 0 Sun
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return todayISO(d);
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export type DatePreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "last30";

export function presetRange(preset: DatePreset, now = new Date()): { from: string; to: string } {
  const to = todayISO(now);
  switch (preset) {
    case "today":
      return { from: to, to };
    case "yesterday": {
      const y = addDaysISO(to, -1);
      return { from: y, to: y };
    }
    case "week":
      return { from: startOfWeekMonday(to), to };
    case "month":
      return { from: startOfMonthISO(to), to };
    case "year":
      return { from: yearStartISO(now), to };
    case "last30":
      return { from: addDaysISO(to, -30), to };
    default:
      return { from: yearStartISO(now), to };
  }
}

export function matchPreset(from: string, to: string, now = new Date()): DatePreset | "" {
  const presets: DatePreset[] = ["today", "yesterday", "week", "month", "year", "last30"];
  for (const p of presets) {
    const r = presetRange(p, now);
    if (r.from === from && r.to === to) return p;
  }
  return "";
}

export function fmtDMY(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function fmtLong(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function inRange(iso: string, from: string, to: string): boolean {
  return iso >= from && iso <= to;
}
