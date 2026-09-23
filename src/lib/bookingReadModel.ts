import { Prisma } from '@prisma/client';
import { itemCodeJoinSql } from './itemCode';

/** Read-only header — Vw_BookingHeader equivalent (columns map 1:1). */
export const HEADER_TABLE = 'tbl_bookingheder';

/** Read-only transaction detail — Vw_BookingTxnDetail equivalent. */
export const TXN_DETAIL_TABLE = 'tbl_bookingtxndetail';

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
