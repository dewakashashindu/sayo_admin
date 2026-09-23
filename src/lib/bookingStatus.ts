
/** Status → the status it reverts to. Nothing below CONFIRMED. */
export const PREVIOUS_BOOKING_STATUS: Readonly<Record<string, string>> = {
  DONE: "ONGOING",
  ONGOING: "CONFIRMED",
};

export const BOOKING_STATUS_LABEL: Readonly<Record<string, string>> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  ONGOING: "Ongoing",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/** Uppercase key for a status coming from the database or a request body. */
export function bookingStatusKey(status: unknown): string {
  return String(status ?? "").trim().toUpperCase();
}

/** The status one step back, or null when the booking cannot be reverted. */
export function previousBookingStatus(status: unknown): string | null {
  return PREVIOUS_BOOKING_STATUS[bookingStatusKey(status)] ?? null;
}

/** True when a REVERT button makes sense for this status. */
export function canRevertBookingStatus(status: unknown): boolean {
  return previousBookingStatus(status) !== null;
}

/** “Ongoing” / “Done” … for messages; falls back to the raw value. */
export function bookingStatusLabel(status: unknown): string {
  const key = bookingStatusKey(status);
  return BOOKING_STATUS_LABEL[key] ?? String(status ?? "").trim() ?? "—";
}
