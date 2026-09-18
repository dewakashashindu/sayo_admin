// src/lib/itemCode.ts
// Item-code normalisation + matching, shared by every module that reads or
// writes an item code.
//
// WHY THIS EXISTS
// tbl_itemmaster.ItemCode is CHAR(15) and is the real identity of an item.
// The detail tables used to be CHAR(10) and stored only the FIRST 10
// CHARACTERS of that code (tbl_bookingservicedetail.ServiceItemID,
// Tbl_BookingServiceItemAddTech.ServiceItemID, Tbl_BookingServiceRecipe.
// ServiceItemID/RawItemCode, Tbl_Recipes.MenuItmID, tbl_billdetail.ItemID), so
// every lookup had to guess with LEFT(ItemCode, 10) — which silently resolves
// to the WRONG item as soon as two item codes share their first 10 characters
// (e.g. ITM0000000001 and ITM0000000002 both start with "ITM0000000").
//
// scripts/migrate-itemcode-char15.sql widens those columns to CHAR(15) so the
// full code is stored everywhere. Rows written BEFORE that migration can still
// hold the 10-character legacy prefix, so matching is always:
//
//   1. exact full code
//   2. the legacy 10-character prefix, but only when it is unambiguous
//
// Pure module on purpose (no Prisma import) so the regression suite can compile
// and exercise it directly.

/** Width of an item code column (tbl_itemmaster.ItemCode, CHAR(15)). */
export const ITEM_CODE_LENGTH = 15;

/** Width of the old CHAR(10) detail columns — legacy prefix length only. */
export const LEGACY_ITEM_CODE_LENGTH = 10;

/**
 * Trim a raw value to something a CHAR(15) item-code column can hold.
 * Never cuts a modern 15-character code, never returns whitespace padding.
 */
export function itemCode(value: unknown): string {
  return String(value ?? "").trim().slice(0, ITEM_CODE_LENGTH);
}

/** Case-insensitive comparison key for an item code. */
export function itemCodeKey(value: unknown): string {
  return itemCode(value).toUpperCase();
}

/**
 * The first 10 characters of a code — how a pre-migration row stored it.
 * Use this ONLY for matching legacy data, never for storing a new code.
 */
export function legacyItemCode(value: unknown): string {
  return itemCode(value).slice(0, LEGACY_ITEM_CODE_LENGTH);
}

/**
 * True when a STORED value is shorter than a full item code. That is either a
 * row written before the CHAR(15) migration, or an item whose own code is
 * genuinely short — both are handled by `createItemCodeIndex`.
 */
export function isLegacyItemCode(value: unknown): boolean {
  const code = itemCode(value);
  return code.length > 0 && code.length < ITEM_CODE_LENGTH;
}

export interface ItemCodeIndex<T> {
  /** Full code first, then the legacy prefix when it is unambiguous. */
  get(rawCode: unknown): T | undefined;
  /** Number of distinct full codes in the index. */
  size: number;
}

/**
 * Build a lookup that resolves both full item codes and legacy 10-character
 * prefixes to the same item.
 *
 * A legacy prefix is only registered while it points at ONE item: if two master
 * rows share their first 10 characters the prefix key is dropped (and `get`
 * refuses it) instead of naming an arbitrary — wrong — item.
 */
export function createItemCodeIndex<T>(
  rows: readonly T[],
  getCode: (row: T) => unknown,
): ItemCodeIndex<T> {
  const byCode = new Map<string, T>();
  const prefixOwners = new Map<string, number>();
  const byPrefix = new Map<string, T>();

  for (const row of rows) {
    const key = itemCodeKey(getCode(row));
    if (!key) continue;

    const isFirst = !byCode.has(key);
    if (isFirst) byCode.set(key, row);

    const prefix = key.slice(0, LEGACY_ITEM_CODE_LENGTH);
    if (prefix === key) continue; // code is already ≤ 10 chars: no prefix key
    if (isFirst) prefixOwners.set(prefix, (prefixOwners.get(prefix) ?? 0) + 1);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, row);
  }

  return {
    size: byCode.size,
    get(rawCode: unknown): T | undefined {
      const key = itemCodeKey(rawCode);
      if (!key) return undefined;

      const exact = byCode.get(key);
      if (exact !== undefined) return exact;

      // Legacy row: short value written before the CHAR(15) migration.
      if (key.length >= ITEM_CODE_LENGTH) return undefined;
      if ((prefixOwners.get(key) ?? 0) !== 1) return undefined;
      return byPrefix.get(key);
    },
  };
}

/**
 * SQL predicate: does this item-master row belong to this stored item code?
 *
 * `itemCodeColumn` is the master side (i.ItemCode), `storedCodeColumn` is the
 * code as stored on the detail row (d.ServiceItemID, b.ItemID, r.RawItemCode…).
 * Exact match first; a shorter stored value (legacy CHAR(10) row) is matched as
 * a prefix. RTRIM on both sides keeps this correct on PAD SPACE and NO PAD
 * collations alike, and the length guard stops an empty stored value from
 * matching every item.
 */
export function itemCodeJoinSql(
  itemCodeColumn: string,
  storedCodeColumn: string,
): string {
  const master = `RTRIM(${itemCodeColumn})`;
  const stored = `RTRIM(${storedCodeColumn})`;
  return (
    `(${master} = ${stored}` +
    ` OR (CHAR_LENGTH(${stored}) > 0` +
    ` AND CHAR_LENGTH(${stored}) < CHAR_LENGTH(${master})` +
    ` AND LEFT(${master}, CHAR_LENGTH(${stored})) = ${stored}))`
  );
}

/**
 * Scalar subquery that resolves ONE item-master row for a stored code.
 *
 * Used where a plain LEFT JOIN would multiply rows when several items share a
 * legacy prefix — e.g. the technician-capacity guard, where a duplicated row
 * turns into a false "technician is busy" rejection.
 */
export function itemCodeScalarSql(
  selectClause: string,
  storedCodeColumn: string,
  options: { locCodeColumn: string; tableAlias?: string; orderByExtra?: string } = {
    locCodeColumn: "d.LocCode",
  },
): string {
  const alias = options.tableAlias ?? "im";
  const order = options.orderByExtra
    ? `${options.orderByExtra}, `
    : `(RTRIM(${alias}.ItemCode) = RTRIM(${storedCodeColumn})) DESC, ` +
      `CHAR_LENGTH(RTRIM(${alias}.ItemCode)) ASC, `;
  return (
    `SELECT ${selectClause} FROM tbl_itemmaster ${alias}` +
    ` WHERE RTRIM(${alias}.LocCode) = RTRIM(${options.locCodeColumn})` +
    ` AND ${itemCodeJoinSql(`${alias}.ItemCode`, storedCodeColumn)}` +
    ` ORDER BY ${order}RTRIM(${alias}.ItemCode) LIMIT 1`
  );
}
