// src/lib/bookingReadModel.ts
// Shared base-table fragments that reproduce the legacy booking views
// (Vw_BookingHeader, Vw_BookingTxnDetail, Vw_BookingServiceDetail).
//
// WHY: on shared MySQL hosting the Vw_* views are frequently created with a
// DEFINER the runtime account cannot authenticate against, so any SELECT from
// them fails with "Access denied (1045)" even though the same account can read
// the base tables fine. The booking flow therefore reads the same matching
// tables directly. This mirrors the join used by the write path
// (assertNoProviderCapacityConflict) and keeps one source of truth.
import { Prisma } from '@prisma/client';

/** Read-only header — Vw_BookingHeader equivalent (columns map 1:1). */
export const HEADER_TABLE = 'tbl_bookingheder';

/** Read-only transaction detail — Vw_BookingTxnDetail equivalent. */
export const TXN_DETAIL_TABLE = 'tbl_bookingtxndetail';

/**
 * FROM/JOIN clause that reproduces Vw_BookingServiceDetail:
 *   booking detail + header (date/status/remarks) + item master
 *   (duration/description/codes) + technician (name).
 *
 * Aliases used by every consumer:
 *   h = header, d = detail, i = item master, u = user details.
 * Interpolate with `${Prisma.raw(BOOKING_SERVICE_DETAIL_FROM)}`.
 */
export const BOOKING_SERVICE_DETAIL_FROM = Prisma.raw(`
  FROM tbl_bookingheder h
  JOIN tbl_bookingservicedetail d
    ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
  LEFT JOIN tbl_itemmaster i
    ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
   AND (RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
     OR LEFT(RTRIM(i.ItemCode), 10) = RTRIM(d.ServiceItemID))
  LEFT JOIN tbl_userdetails u
    ON RTRIM(u.UserId) = RTRIM(d.TechID)
`);

/**
 * Plain-string version for callers that build raw SQL with $queryRawUnsafe
 * (e.g. appointments, which interpolates an IN (...) list).
 */
export const BOOKING_SERVICE_DETAIL_FROM_SQL = `
  FROM tbl_bookingheder h
  JOIN tbl_bookingservicedetail d
    ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
  LEFT JOIN tbl_itemmaster i
    ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
   AND (RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
     OR LEFT(RTRIM(i.ItemCode), 10) = RTRIM(d.ServiceItemID))
  LEFT JOIN tbl_userdetails u
    ON RTRIM(u.UserId) = RTRIM(d.TechID)
`;
