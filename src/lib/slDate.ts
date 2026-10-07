/** Sri Lanka (Asia/Colombo) calendar-date helpers.
 *
 * The salon operates on Sri Lanka time, but the server may run in another
 * zone (e.g. UTC). Using `toISOString()` or `getFullYear()` would therefore
 * show the wrong "today" for part of the day. All screens that need the
 * current calendar date must go through these helpers. */

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current calendar date in Sri Lanka, as `YYYY-MM-DD`. */
export function todayISO(d: Date = new Date()): string {
  return fmt.format(d);
}

/** Add `days` to an ISO date (Sri Lanka calendar arithmetic). */
export function shiftDateISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}
