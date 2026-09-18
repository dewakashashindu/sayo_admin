// src/lib/bookingStatus.ts
// The booking status ladder, in one place.
//
//   PENDING → CONFIRMED → ONGOING → DONE
//
// The bill screen’s REVERT button walks this ladder ONE STEP BACKWARDS:
//
//   DONE    → ONGOING     the technician marked the work done by mistake; the
//                         booking leaves the Billing Dashboard, returns to the
//                         technician list and can be corrected, then marked done
//                         again and billed.
//   ONGOING → CONFIRMED   the check-in itself was wrong (the technician
//                         additions lock again).
//
// CONFIRMED and PENDING have nothing to revert to: going further back would
// undo the customer’s confirmation, which is a cancellation, not a correction.
//
// Pure module (no Prisma, no React) so both the API route and the regression
// suite can use it.

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
