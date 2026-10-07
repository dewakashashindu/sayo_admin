// src/lib/bookingGuests.ts
/**
 * Per-guest state of a booking.
 *
 * A group booking files ONE tbl_bookingtxndetail row per guest, each with its
 * own CheckInTime, and its service rows carry their own start/end times. The
 * booking header keeps a single Status, which turns ONGOING the moment the
 * FIRST guest of the group is checked in — so it can never say who else is in
 * the chair. Every screen that has to act on one guest rather than the whole
 * BookingID reads the helpers below instead.
 */
import { clockToMinutes } from "./bookingSchedule";

/** One service row of the booking (tbl_bookingservicedetail, as projected). */
export interface GuestServiceRow {
  guessID?: string;
  /** Item code of the service; empty for a legacy row read from serviceNames. */
  itemCode?: string;
  serviceName: string;
  providerName: string;
  /** Canonical technician UserId on this row ("0"/"" = unassigned). */
  techID?: string;
  startTime: string;
  endTime: string;
  checkedIn?: boolean;
}

/** One guest row (tbl_bookingtxndetail), as sent by GET /api/appointments. */
export interface GuestCheckInRow {
  guessID: string;
  checkInTime: string | null;
  checkedIn: boolean;
  cancelled: boolean;
}

/** The slice of an appointment the helpers need. */
export interface GuestBearingBooking {
  guests: string[];
  timeSlot: string;
  serviceSchedule?: GuestServiceRow[];
  guestCheckIns?: GuestCheckInRow[];
}

export interface GuestGroup {
  guessID: string;
  label: string;
  services: GuestServiceRow[];
  /** Minutes since midnight, or -1 when the booking stored no placement. */
  startMin: number;
  endMin: number;
  startTime: string;
  endTime: string;
  /** This guest's OWN check-in stamp — not the booking's. */
  checkedIn: boolean;
  checkInTime: string | null;
  cancelled: boolean;
}

const guestKey = (guessID?: string) =>
  (guessID ?? "").trim().toUpperCase() || "MAIN";

export type BookingStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "ongoing"
  | "done";

/**
 * The status one service block should be painted with.
 *
 * The booking header carries a single Status and turns ONGOING as soon as the
 * FIRST guest of a group is checked in. Painting every block from that header
 * lights up the guests who are still waiting for their own time — a 3-guest
 * group reads as three blue "ongoing" blocks after one check-in. Each block is
 * therefore coloured from its own guest's tbl_bookingtxndetail row.
 */
export function segmentDisplayStatus(
  booking: GuestBearingBooking,
  segment: GuestServiceRow | undefined,
  bookingStatus: BookingStatus,
): { status: BookingStatus; guestCheckedIn: boolean; guestCancelled: boolean } {
  const guessID = guestKey(segment?.guessID);
  const guestRow = booking.guestCheckIns?.find(
    (guest) => guest.guessID.trim().toUpperCase() === guessID,
  );
  /* Whether this block carries any per-guest information at all. A legacy
     booking with no guest rows and no schedule projection has none — for those
     the header is the only truth, so it must not be downgraded. */
  const guestKnown = guestRow !== undefined || segment?.checkedIn !== undefined;
  const guestCheckedIn = guestRow ? guestRow.checkedIn : !!segment?.checkedIn;
  const guestCancelled = guestRow?.cancelled ?? false;

  const status: BookingStatus = guestCancelled
    ? "cancelled"
    : guestCheckedIn
      ? "ongoing"
      : !guestKnown
        ? bookingStatus
        : /* The header reads ONGOING only because a sibling guest arrived —
             this guest is still merely confirmed. */
          bookingStatus === "ongoing"
          ? "confirmed"
          : bookingStatus;

  return { status, guestCheckedIn, guestCancelled };
}

/** One entry per distinct guest, with that guest's own time window and state. */
export function guestGroupsFromSchedule(
  booking: GuestBearingBooking,
): GuestGroup[] {
  const schedule = booking.serviceSchedule ?? [];
  const ids = Array.from(
    new Set([
      ...booking.guests.map(guestKey).filter(Boolean),
      ...schedule.map((service) => guestKey(service.guessID)),
    ]),
  );

  return ids
    .map((id, index) => {
      const services = schedule.filter(
        (service) => guestKey(service.guessID) === id,
      );
      const starts = services
        .map((service) => clockToMinutes(service.startTime))
        .filter((min) => min >= 0);
      const ends = services
        .map((service) => clockToMinutes(service.endTime))
        .filter((min) => min >= 0);
      const startMin = starts.length > 0 ? Math.min(...starts) : -1;
      const endMin = ends.length > 0 ? Math.max(...ends) : -1;

      /* The per-guest row wins when the API sent it; the service rows are the
         fallback for a payload that predates guestCheckIns. */
      const guestRow = booking.guestCheckIns?.find(
        (guest) => guest.guessID.trim().toUpperCase() === id,
      );
      const checkedIn = guestRow
        ? guestRow.checkedIn
        : services.length > 0 && services.every((service) => service.checkedIn);

      return {
        guessID: id,
        label: id === "MAIN" ? "Main client" : `Guest ${index + 1}`,
        services,
        startMin,
        endMin,
        startTime: services[0]?.startTime || booking.timeSlot,
        endTime: services[services.length - 1]?.endTime || "",
        checkedIn,
        checkInTime: guestRow?.checkInTime ?? null,
        cancelled: guestRow?.cancelled ?? false,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

/** Guests who still have to be checked in — not in yet and not cancelled.
 *  This is what keeps the Check In action alive on a booking whose header
 *  status already reads ONGOING because an earlier guest arrived. */
export function guestsAwaitingCheckIn(booking: GuestBearingBooking): GuestGroup[] {
  return guestGroupsFromSchedule(booking).filter(
    (group) => !group.checkedIn && !group.cancelled,
  );
}

/** Which of a technician's guests are in the chair, and what may therefore be
 *  shown / edited on the technician screens. */
export function guestCheckInState(
  booking: GuestBearingBooking,
  viewer: { viewAll: boolean; techName: string; techUserId?: string } = {
    viewAll: true,
    techName: "",
  },
): {
  /** False for a legacy booking with no schedule projection — those fall back
   *  to the booking-level status. */
  hasSchedule: boolean;
  rowCount: number;
  /** The service rows that may be shown right now. */
  visibleRows: GuestServiceRow[];
  checkedInRows: GuestServiceRow[];
  checkedInGuests: number;
  guestTotal: number;
  /** Guests whose own window has not opened yet at `nowMinutes`. */
  notDueYet: GuestGroup[];
} {
  const schedule = booking.serviceSchedule ?? [];
  const nameKey = (viewer.techName || "").trim().toUpperCase();
  const idKey = (viewer.techUserId || "").trim().toUpperCase();

  const scoped =
    schedule.length > 0 && !viewer.viewAll && (nameKey || idKey)
      ? schedule.filter((service) => {
          const byName =
            nameKey !== "" &&
            (service.providerName || "").trim().toUpperCase() === nameKey;
          const byId =
            idKey !== "" &&
            (service.techID || "").trim().toUpperCase() === idKey;
          return byName || byId;
        })
      : schedule;

  /* `scoped` is the whole schedule when the viewer is not filtered by
     technician. Fall back to it ONLY when there is no schedule projection at
     all (legacy rows): a technician whose name matches no row of a booking that
     DOES have a schedule must see none of it — showing the whole group would
     unlock work belonging to somebody else. */
  const effectiveRows = scoped;
  const guests = new Map<string, boolean>();
  effectiveRows.forEach((service) => {
    const id = guestKey(service.guessID);
    guests.set(id, (guests.get(id) ?? false) || !!service.checkedIn);
  });
  const checkedInRows = effectiveRows.filter((service) => service.checkedIn);

  const now =
    new Date().getHours() * 60 + new Date().getMinutes();
  const notDueYet = guestGroupsFromSchedule(booking).filter(
    (group) =>
      !group.checkedIn &&
      !group.cancelled &&
      group.startMin >= 0 &&
      now < group.startMin,
  );

  return {
    hasSchedule: schedule.length > 0,
    rowCount: effectiveRows.length,
    /* A partially checked-in group shows only the guests already in the chair;
       the rest appear at their own check-in time. */
    visibleRows:
      checkedInRows.length > 0 && checkedInRows.length < effectiveRows.length
        ? checkedInRows
        : effectiveRows,
    checkedInRows,
    checkedInGuests: [...guests.values()].filter(Boolean).length,
    guestTotal: guests.size,
    notDueYet,
  };
}
