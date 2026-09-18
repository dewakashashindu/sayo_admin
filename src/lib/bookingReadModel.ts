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
import { itemCodeJoinSql } from './itemCode';

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
   AND ${itemCodeJoinSql('i.ItemCode', 'd.ServiceItemID')}
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
   AND ${itemCodeJoinSql('i.ItemCode', 'd.ServiceItemID')}
  LEFT JOIN tbl_userdetails u
    ON RTRIM(u.UserId) = RTRIM(d.TechID)
`;

/**
 * Collapse the item-master join back to one row per booking detail.
 *
 * tbl_bookingservicedetail.ServiceItemID is CHAR(15) and holds the full
 * tbl_itemmaster.ItemCode. Rows written before
 * scripts/migrate-itemcode-char15.sql hold only the first 10 characters, so the
 * join above accepts an exact match and, for those short legacy values, a
 * prefix match (see itemCodeJoinSql). A legacy value whose prefix is shared by
 * two items still comes back more than once — which silently multiplies
 * services, durations, prices and guest counts everywhere those rows are read.
 *
 * The real key of tbl_bookingservicedetail is
 * (LocCode, BookingID, GuessID, ServiceItemID) — exactly the Prisma composite
 * id — so keep the first row seen for each of those. Rows for the same item
 * booked by DIFFERENT guests are different rows and are all kept.
 */
export function dedupeBookingDetailRows<
  T extends {
    LocCode?: string | null;
    BookingID?: string | null;
    GuessID?: string | null;
    ServiceItemID?: string | null;
  },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = [
      String(row.LocCode ?? "").trim().toUpperCase(),
      String(row.BookingID ?? "").trim().toUpperCase(),
      String(row.GuessID ?? "").trim().toUpperCase(),
      String(row.ServiceItemID ?? "").trim().toUpperCase(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
