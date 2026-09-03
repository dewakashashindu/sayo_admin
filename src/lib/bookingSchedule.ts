// src/lib/bookingSchedule.ts
/**
 * Small shared helpers for persisting a public booking's service-by-service
 * execution schedule in the legacy header Remarks column. The legacy detail
 * table has no start-time column, so the schedule is stored as a compact,
 * versioned metadata line while the normal human notes remain readable.
 */

export interface BookingScheduleEntry {
  serviceIndex: number;
  providerName: string;
  startTime: string;
  endTime: string;
}

export interface StoredBookingScheduleEntry {
  serviceIndex: number;
  itemCode: string;
  startMin: number;
  endMin: number;
}

export const BOOKING_SCHEDULE_PREFIX = '[SAYO_SCHEDULE_V1]';

export function clockToMinutes(value: unknown): number {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return -1;
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

export function minutesToClock(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hour24 = Math.floor(safe / 60);
  const minute = safe % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

export function encodeBookingSchedule(
  schedule: StoredBookingScheduleEntry[],
): string {
  const compact = schedule
    .filter((entry) =>
      Number.isInteger(entry.serviceIndex) &&
      entry.serviceIndex >= 0 &&
      Number.isFinite(entry.startMin) &&
      Number.isFinite(entry.endMin) &&
      entry.endMin > entry.startMin,
    )
    .map((entry) => [
      entry.serviceIndex,
      String(entry.itemCode || '').trim(),
      Math.round(entry.startMin),
      Math.round(entry.endMin),
    ]);

  return compact.length > 0
    ? `${BOOKING_SCHEDULE_PREFIX}${JSON.stringify(compact)}`
    : '';
}

export function decodeBookingSchedule(
  remarks: string | null | undefined,
): StoredBookingScheduleEntry[] {
  const line = String(remarks || '')
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().startsWith(BOOKING_SCHEDULE_PREFIX));
  if (!line) return [];

  try {
    const raw = JSON.parse(line.trim().slice(BOOKING_SCHEDULE_PREFIX.length));
    if (!Array.isArray(raw)) return [];

    return raw.flatMap((entry: unknown) => {
      if (!Array.isArray(entry) || entry.length < 4) return [];
      const serviceIndex = Number(entry[0]);
      const itemCode = String(entry[1] || '').trim();
      const startMin = Number(entry[2]);
      const endMin = Number(entry[3]);
      if (
        !Number.isInteger(serviceIndex) || serviceIndex < 0 ||
        !Number.isFinite(startMin) || !Number.isFinite(endMin) ||
        endMin <= startMin
      ) return [];
      return [{ serviceIndex, itemCode, startMin, endMin }];
    });
  } catch {
    return [];
  }
}

export function stripBookingSchedule(remarks: string | null | undefined): string {
  return String(remarks || '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(BOOKING_SCHEDULE_PREFIX))
    .join('\n')
    .trim();
}

/**
 * Keep the schedule as the highest-priority Remarks content. If the user note
 * is long, only the note is shortened; the schedule is never cut in half.
 */
export function composeBookingRemarks(
  notes: string | null | undefined,
  schedule: StoredBookingScheduleEntry[],
  maxLength = 500,
): string {
  const metadata = encodeBookingSchedule(schedule);
  const cleanNotes = stripBookingSchedule(notes);
  if (!metadata) return cleanNotes.slice(0, maxLength) || ' ';
  if (metadata.length >= maxLength) return metadata;

  const separator = cleanNotes ? '\n' : '';
  const noteRoom = maxLength - metadata.length - separator.length;
  const note = noteRoom > 0 ? cleanNotes.slice(0, noteRoom) : '';
  return `${metadata}${note ? separator + note : ''}`;
}
