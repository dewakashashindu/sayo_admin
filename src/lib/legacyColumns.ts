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

import { Prisma } from "@prisma/client";
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
  /* Only ever bind names that look like plain identifiers, and bind them one
     per placeholder with Prisma.join.
     Writing `.join(",")` here instead sends the whole comma-separated list as
     ONE bound value, so the query becomes `IN (?)` and matches nothing at all —
     which is how this function could report "no such column" on a database
     that plainly had it. */
  const wanted = candidates.filter((c) => SAFE.test(c)).map((c) => c.toLowerCase());
  if (wanted.length > 0) {
    try {
      const rows = await prisma.$queryRaw<{ COLUMN_NAME: string }[]>`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND LOWER(TABLE_NAME) = ${table.toLowerCase()}
          AND LOWER(COLUMN_NAME) IN (${Prisma.join(wanted)})
      `.catch((e) => {
        /* Never silent: a database that will not answer this question is a
           real problem, and swallowing it is what hid the bug above. */
        console.error(
          `[legacyColumns] could not read the columns of ${table} from ` +
            `information_schema — treating it as having none of them:`,
          e,
        );
        return [] as { COLUMN_NAME: string }[];
      });

      const present = new Set(rows.map((r) => String(r.COLUMN_NAME).toLowerCase()));
      value = candidates.find((c) => SAFE.test(c) && present.has(c.toLowerCase())) ?? null;
    } catch (e) {
      console.error(`[legacyColumns] could not check ${table} for ${candidates.join("/")}:`, e);
      value = null;
    }
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/** The real name of whichever of these tables this database actually has,
 *  matched without regard to case. On a Linux server MySQL treats table names
 *  as case sensitive, so asking for `tbl_thing` when the table was created as
 *  `Tbl_Thing` fails outright — which is how a whole screen can quietly come
 *  back empty. Returns null when none of them are there. */
export async function resolveTableName(candidates: string[]): Promise<string | null> {
  const safe = candidates.filter((c) => SAFE.test(c));
  if (safe.length === 0) return null;

  const key = `tables::${safe.map((c) => c.toLowerCase()).join("|")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: string | null = null;
  try {
    const rows = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
      SELECT TABLE_NAME
        FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND LOWER(TABLE_NAME) IN (${Prisma.join(safe.map((c) => c.toLowerCase()))})
    `.catch((e) => {
      console.error("[legacyColumns] could not list the tables from information_schema:", e);
      return [] as { TABLE_NAME: string }[];
    });

    /* Return the spelling the database actually uses — not the one we guessed
       — because that is the only one a case-sensitive server will accept. */
    const byLower = new Map(rows.map((r) => [String(r.TABLE_NAME).toLowerCase(), String(r.TABLE_NAME)]));
    value = safe.reduce<string | null>(
      (found, candidate) => found ?? byLower.get(candidate.toLowerCase()) ?? null,
      null,
    );
  } catch (e) {
    console.error(`[legacyColumns] could not look for ${safe.join("/")}:`, e);
    value = null;
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drop the remembered answer, so the next call really asks the database. */
export function forgetLegacyColumn(table: string, candidates: string[]): void {
  cache.delete(`${table.toLowerCase()}::${candidates.map((c) => c.toLowerCase()).join("|")}`);
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
