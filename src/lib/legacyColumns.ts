// src/lib/legacyColumns.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which name does THIS database use for that column?
//
// The legacy tables were hand-made over the years, so the same column can be
// spelled two ways in two shops: tbl_bookingtypes has `BookingTypeID` in the
// live database but `BooikingTypeID` in the repo's Prisma model (an old typo
// that travelled into the code), Tbl_PaymentModes is `tbl_paymentmodes` on a
// MySQL box that folds case and a different beast on Windows.
//
// Asking information_schema once and remembering the answer for a minute means
// a raw SQL statement can be written against whatever this database actually
// has, instead of throwing “Unknown column” on somebody else's machine.
//
// The resolved name always comes from the database itself and is checked
// against a strict identifier pattern before it is ever put into SQL.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

interface CacheEntry {
  at: number;
  value: string | null;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

const SAFE = /^[A-Za-z0-9_]+$/;

/**
 * First candidate column that really exists on `table`, in the order given.
 * Returns null when the table (or all of the candidates) is missing — never
 * throws, so a caller can fall back to a sensible default.
 */
export async function resolveLegacyColumn(
  table: string,
  candidates: string[],
): Promise<string | null> {
  const key = `${table.toLowerCase()}::${candidates.map((c) => c.toLowerCase()).join("|")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: string | null = null;
  try {
    const rows = await prisma.$queryRaw<{ COLUMN_NAME: string }[]>`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = ${table.toLowerCase()}
        AND LOWER(COLUMN_NAME) IN (${candidates.map((c) => c.toLowerCase()).join(",")})
    `.catch(() => [] as { COLUMN_NAME: string }[]);

    const present = new Set(rows.map((r) => String(r.COLUMN_NAME).toLowerCase()));
    value = candidates.find((c) => SAFE.test(c) && present.has(c.toLowerCase())) ?? null;
  } catch {
    value = null;
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/** “tbl_bookingtypes” → the name this database stores it under (or the input). */
export async function resolveLegacyTable(table: string): Promise<string> {
  const key = `table::${table.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && hit.value) return hit.value;

  try {
    const rows = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = ${table.toLowerCase()}
      LIMIT 1
    `;
    const found = rows[0]?.TABLE_NAME ? String(rows[0].TABLE_NAME) : null;
    cache.set(key, { at: Date.now(), value: found });
    return found ?? table;
  } catch {
    return table;
  }
}
