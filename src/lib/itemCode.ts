
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
