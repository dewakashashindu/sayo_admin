
/** The “no expiry” marker, exactly as the purchase tables use it. */
export const ITEM_DETAIL_EMPTY_EXPIRY = "1900-01-01";

/** A line with no expiry date is stored under this bucket. */
export function itemDetailExpiry(value: Date | string | null | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    /* 1900-01-01 is the “empty date” the rest of the tables use — treat it as
       “no expiry” too, so one item never ends up in two no-expiry buckets. */
    if (value.getUTCFullYear() <= 1900) return new Date(Date.UTC(1900, 0, 1));
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const text = value.trim().slice(0, 10);
    if (!/^0000|^1900/.test(text)) {
      const parsed = new Date(`${text}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date(Date.UTC(1900, 0, 1));
}

/** True when the bucket is the “no expiry date on the packet” one. */
export function itemDetailHasExpiry(value: Date | string | null | undefined): boolean {
  return itemDetailExpiry(value).getUTCFullYear() > 1900;
}

/** The bucket as a person reads it — “no expiry date” instead of 1900-01-01. */
export function itemDetailExpiryLabel(value: Date | string | null | undefined): string {
  const date = itemDetailExpiry(value);
  if (!itemDetailHasExpiry(value)) return "no expiry date";
  return `${date.toISOString().slice(0, 10)}`;
}

function round3(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

/**
 * What goes into the batch row for one GRN line: the goods received PLUS the
 * free goods — the same number that went onto `tbl_itemmaster.StockBalance` and
 * into the `tbl_stocktxn` ledger row, so the three always agree.
 */
export function itemDetailQty(received: number, free: number): number {
  return round3((Number(received) || 0) + (Number(free) || 0));
}

/** “+20 BOTTLE into 2027-03-31” — for the activity log. */
export function itemDetailRowWords(qty: number, expiry: Date | string | null): string {
  const amount = round3(qty);
  const sign = amount < 0 ? "" : "+";
  return `${sign}${amount} into ${itemDetailExpiryLabel(expiry)}`;
}

/** The words shown when the database has no tbl_itemdetail at all. */
export const ITEM_DETAIL_MISSING_NOTE =
  "this database has no tbl_itemdetail table, so the batch-wise stock was not written " +
  "(the item balance and the stock ledger were). The Item Master screen reads that table, " +
  "so its Stock box will not move until it exists.";
