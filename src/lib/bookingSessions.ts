// src/lib/bookingSessions.ts
/**
 * Sessions: how much WORK a booking holds, as opposed to how many BookingIDs.
 *
 * ONE service row of a booking (one tbl_bookingservicedetail row) is ONE
 * session, and every session belongs to exactly one technician. A booking that
 * carries a Facial for Tech-A and a Haircut for Tech-B is 1 booking and
 * 2 sessions, and it lands on two dashboards. 5 bookings holding 12 service
 * rows is therefore "5 Bookings | 12 Sessions".
 *
 * Every screen that has to say how much work is on the floor counts these
 * rather than BookingIDs, and every list that a technician reads is exploded
 * into sessions so a single BookingID never hides a second service.
 */
import type { GuestServiceRow } from "./bookingGuests";

/**
 * One service row as the appointment payload projects it. Structurally shared
 * by the admin screen's `ServiceSchedule` and the technician screen's
 * `TechServiceSchedule`, so both can hand their arrays over directly.
 */
export interface SessionServiceInput {
  serviceIndex?: number;
  itemCode?: string;
  guessID?: string;
  serviceName: string;
  providerName: string;
  /** Canonical technician UserId on this row ("0"/"" = unassigned). */
  techID?: string;
  /** This row's own guest is already checked in — per row, never per booking. */
  checkedIn?: boolean;
  /** The service was marked Done by the technician (per-service stamp). */
  done?: boolean;
  /** The service was already billed and must not reappear anywhere. */
  billed?: boolean;
  startTime: string;
  endTime: string;
}

/** The slice of a booking the session helpers need. */
export interface SessionBearingBooking {
  serviceName: string;
  serviceSchedule?: SessionServiceInput[];
  /** The server's own detail-row count. Wins when no schedule was projected. */
  detailCount?: number;
}

/** One session of a booking, ready to render as its own card or row. */
export interface SessionRow extends GuestServiceRow {
  /** Position inside the booking, 0-based and stable. */
  serviceIndex: number;
  /** How many sessions this booking holds in total (1 when unscheduled). */
  sessionTotal: number;
  /** True when the payload carried no schedule projection, so this row is a
   *  single stand-in for the whole booking rather than a real service. */
  isFallback: boolean;
  /** Per-service Done stamp carried from the server. */
  done?: boolean;
  /** Per-service Billed stamp carried from the server. */
  billed?: boolean;
}

/** How many sessions a booking holds. */
export function sessionCount(booking: SessionBearingBooking): number {
  const schedule = booking.serviceSchedule ?? [];
  if (schedule.length > 0) return schedule.length;
  /* Legacy payloads can carry only the row count; a booking always holds at
     least one service, so an absent/zero count still means one session. */
  const rows = Number(booking.detailCount);
  return Number.isFinite(rows) && rows > 0 ? rows : 1;
}

/**
 * Explode a booking into its sessions. A booking with no schedule projection
 * still yields exactly one row, so a caller can render sessions uniformly
 * without branching on whether the payload was complete.
 */
export function sessionRows(booking: SessionBearingBooking): SessionRow[] {
  const schedule = booking.serviceSchedule ?? [];
  const sessionTotal = sessionCount(booking);

  if (schedule.length === 0) {
    return [
      {
        serviceIndex: 0,
        itemCode: "",
        guessID: undefined,
        serviceName: booking.serviceName || "Service",
        providerName: "",
        startTime: "",
        endTime: "",
        sessionTotal,
        isFallback: true,
        done: false,
        billed: false,
      },
    ];
  }

  return schedule.map((service, index) => ({
    serviceIndex:
      typeof service.serviceIndex === "number" ? service.serviceIndex : index,
    itemCode: service.itemCode,
    guessID: service.guessID,
    serviceName: service.serviceName,
    providerName: service.providerName,
    techID: service.techID,
    checkedIn: service.checkedIn,
    done: service.done === true,
    billed: service.billed === true,
    startTime: service.startTime,
    endTime: service.endTime,
    sessionTotal,
    isFallback: false,
  }));
}

/** Does this session belong to the given technician (by name or UserId)?
 *  Mirrors the match used by `guestCheckInState`, so a session is never shown
 *  to a technician whose rows it does not carry. */
export function sessionBelongsToTechnician(
  session: SessionRow,
  techName: string,
  techUserId?: string,
): boolean {
  const nameKey = (techName || "").trim().toUpperCase();
  const idKey = (techUserId || "").trim().toUpperCase();
  if (!nameKey && !idKey) return true;
  const byName =
    nameKey !== "" &&
    (session.providerName || "").trim().toUpperCase() === nameKey;
  const byId =
    idKey !== "" && (session.techID || "").trim().toUpperCase() === idKey;
  return byName || byId;
}

/** The sessions of one booking that a given technician is responsible for.
 *  A booking with no schedule projection is not attributed to anyone, so an
 *  unfiltered viewer still sees it. */
export function sessionRowsForTechnician(
  booking: SessionBearingBooking,
  techName: string,
  techUserId?: string,
): SessionRow[] {
  const rows = sessionRows(booking);
  if (!techName && !techUserId) return rows;
  const matched = rows.filter((row) =>
    sessionBelongsToTechnician(row, techName, techUserId),
  );
  /* A legacy booking with only a stand-in row cannot be matched by technician;
     showing it beats dropping it, and the booking-level match upstream already
     decided this booking belongs to the viewer. */
  if (matched.length === 0 && rows.every((row) => row.isFallback)) return rows;
  return matched;
}

/** A stable, unique key for one session — safe as a React key. */
export function sessionKey(
  bookingID: string,
  locCode: string,
  session: SessionRow,
): string {
  return `${locCode}|${bookingID}|${session.serviceIndex}|${session.itemCode ||
    session.serviceName}`;
}

export type SessionBucketKey =
  | "total"
  | "confirmed"
  | "ongoing"
  | "pending"
  | "cancelled";

export interface SessionBucket {
  bookings: number;
  sessions: number;
}

export type SessionBuckets = Record<SessionBucketKey, SessionBucket>;

const emptyBucket = (): SessionBucket => ({ bookings: 0, sessions: 0 });

/**
 * Bookings AND sessions per status bucket.
 *
 * `total` counts every booking in the list, while the four status buckets only
 * count bookings whose status matches — so a booking in a state that has no
 * card of its own ("done") is in the total and in none of the four. That is the
 * existing behaviour of the appointment screen and is preserved here.
 */
export function sessionBuckets<
  T extends SessionBearingBooking & { status: string },
>(bookings: readonly T[]): SessionBuckets {
  const buckets: SessionBuckets = {
    total: emptyBucket(),
    confirmed: emptyBucket(),
    ongoing: emptyBucket(),
    pending: emptyBucket(),
    cancelled: emptyBucket(),
  };

  for (const booking of bookings) {
    const sessions = sessionCount(booking);
    buckets.total.bookings += 1;
    buckets.total.sessions += sessions;

    const key = String(booking.status || "")
      .trim()
      .toLowerCase() as SessionBucketKey;
    if (key in buckets && key !== "total") {
      buckets[key].bookings += 1;
      buckets[key].sessions += sessions;
    }
  }

  return buckets;
}

/** "5 Bookings · 12 Sessions" — one label for a count line or a title attr. */
export function bucketLabel(bucket: SessionBucket): string {
  return `${bucket.bookings} Booking${
    bucket.bookings === 1 ? "" : "s"
  } · ${bucket.sessions} Session${bucket.sessions === 1 ? "" : "s"}`;
}
