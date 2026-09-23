
/** Minutes past midnight, exactly as stored — or null when there is no time. */
export function minutesFromValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const match = value.match(/[ T](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return hour * 60 + minute;
      }
    }
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value as never);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
}

/**
 * Legacy rows carry the time as a `Time:9:00 AM` token in Remarks when the
 * header column has no usable time. Same convention the appointment API uses.
 */
export function minutesFromRemarks(remarks: unknown): number | null {
  if (typeof remarks !== "string" || !remarks) return null;
  const match = remarks.match(/Time:([\d:]+\s*[AaPp][Mm])/);
  return match ? minutesFromValue(` ${match[1].trim()}`) : null;
}

/** “10:00 AM” for a stored wall-clock value — or null when it carries no time. */
export function timeLabelFromValue(value: unknown): string | null {
  const minutes = minutesFromValue(value);
  return minutes === null ? null : clockLabel(minutes);
}

/** “10:00 AM” for minutes past midnight (the schedule columns store minutes). */
export function clockLabel(minutes: number): string {
  const hour24 = ((Math.floor(minutes / 60) % 24) + 24) % 24;
  const minute = ((Math.round(minutes) % 60) + 60) % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
}
