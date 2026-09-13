// src/lib/serials.ts
//
// Central serial-number allocator backed by Tbl_Serials.
//
// WHY THIS EXISTS
// ---------------
// Booking IDs and customer codes used to be calculated inside the API code by
// scanning the transaction tables (MAX(existing BK%) + 1). That is slow, it
// re-uses numbers once old rows are cleaned up, and the "empty branch" case
// needed a separate lock row to stay race-safe.
//
// Now the number lives in the database, in Tbl_Serials:
//
//     SeriCode = "BK"    SeriNo = "0000007"    SeriDate = 2026-09-12
//
// and creating a record does:
//     1. read SeriNo for the code        -> 7
//     2. add one                         -> 8
//     3. use "BK" + "0000008" as the ID  -> "BK0000008"
//     4. write "0000008" back, SeriDate = today
//
// HOW IT STAYS RACE-SAFE
// ----------------------
// One single UPDATE does steps 1, 2 and 4: it adds one to SeriNo and only
// touches the counter row for that series. InnoDB takes an exclusive lock on
// the row for the UPDATE, so if two bookings are saved at the very same moment
// the second one waits at that lock until the first commits, then reads the
// number the first one just wrote. Read and write can never interleave.
//
// Do NOT add a "SELECT ... FOR UPDATE" or an "INSERT IGNORE" in front of it.
// An earlier version of this file did exactly that and deadlocked under load:
// INSERT IGNORE takes a shared lock, the following FOR UPDATE needs an
// exclusive one, and two transactions end up each holding the lock the other
// is waiting for. One statement, one lock — that is the whole design.
//
// GAPS IN THE SEQUENCE ARE NORMAL AND EXPECTED. If a transaction fails after
// the number was taken (conflict, validation error, network drop), that number
// is skipped. Accounting systems require gap-free numbers; booking and
// customer codes do not. Do not "fix" this by decrementing the counter.

import type { Prisma, PrismaClient } from "@prisma/client";

/** Anything that can run a raw query: the shared client or a transaction. */
export type SerialClient = Prisma.TransactionClient | PrismaClient;

/** The series that are in use. Add new codes here as they are introduced. */
export const SERIAL_CODES = {
  /** Booking ID        -> BK0000001 */
  booking: "BK",
  /** Customer code     -> CUS0000001 */
  customer: "CUS",
} as const;

export type SerialCodeName = keyof typeof SERIAL_CODES;

/** Digits in the numeric part. 7 gives BK0000001 … BK9999999. */
const DEFAULT_WIDTH = 7;

/** SeriCode is char(10), so MySQL blank-pads it. Compare with a padded key. */
const CODE_WIDTH = 10;

export interface NextSerialOptions {
  /** Override the numeric width for this series (default 7). */
  width?: number;
  /**
   * Value the counter starts from when the row does not exist yet
   * (default 0, so the first issued number is 1).
   * Use this to seed a new series above the values already in a table.
   */
  startAt?: number;
}

function padSerial(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * Claim the next number in a series and return the finished code.
 *
 * Call it inside the same transaction that writes the record whenever there is
 * one, so a rolled-back write gives the number back. Passing the plain
 * PrismaClient is allowed too — the increment is atomic on its own.
 *
 * @example
 *   const bookingID = await nextSerialTx(tx, SERIAL_CODES.booking);
 *   // -> "BK0000042"   (and Tbl_Serials.SeriNo for "BK" is now "0000042")
 */
export async function nextSerialTx(
  db: SerialClient,
  code: string,
  options: NextSerialOptions = {},
): Promise<string> {
  const seriCode = String(code ?? "")
    .trim()
    .toUpperCase();

  if (!seriCode) {
    throw new Error("nextSerialTx: a SeriCode is required.");
  }
  if (seriCode.length > CODE_WIDTH) {
    throw new Error(
      `nextSerialTx: SeriCode "${seriCode}" is longer than the char(10) column.`,
    );
  }

  const width = options.width && options.width > 0 ? options.width : DEFAULT_WIDTH;
  const startAt = Number.isSafeInteger(options.startAt) ? (options.startAt as number) : 0;
  const maxValue = 10 ** width - 1;

  if (startAt < 0 || startAt > maxValue) {
    throw new Error(
      `nextSerialTx: startAt ${startAt} is outside the range of a ${width}-digit series.`,
    );
  }

  // char(10) stores "BK" as "BK        " — match it exactly so the lookup uses
  // the primary key and locks exactly one row.
  const seriKey = seriCode.padEnd(CODE_WIDTH, " ");

  // The counter row is normally seeded by scripts/add-serials-table.sql. The
  // loop only matters the first time a brand-new series is used: create it,
  // then take the first number from it.
  for (let attempt = 0; attempt < 3; attempt++) {
    // ── Read + add one + write back, in a single statement ─────────────────
    //   · the UPDATE takes an exclusive lock on the counter row, so concurrent
    //     callers queue behind it instead of racing;
    //   · "SeriNo < maxValue" stops the series from overflowing — without it
    //     LPAD would silently chop 10000000 back down to 1000000;
    //   · SeriDate is stamped with the day the number was issued.
    const affected = await db.$executeRaw`
      UPDATE tbl_serials
         SET SeriNo   = LPAD(CAST((CAST(TRIM(SeriNo) AS UNSIGNED) + 1) AS CHAR), ${width}, '0'),
             SeriDate = CURDATE()
       WHERE SeriCode = ${seriKey}
         AND CAST(TRIM(SeriNo) AS UNSIGNED) < ${maxValue}
    `;

    if (affected === 1) {
      // We hold the exclusive lock on this row until the transaction commits,
      // so nobody can change the number between the UPDATE and this read.
      const rows = await db.$queryRaw<{ SeriNo: string }[]>`
        SELECT TRIM(SeriNo) AS SeriNo
          FROM tbl_serials
         WHERE SeriCode = ${seriKey}
         LIMIT 1
      `;

      const seriNo = String(rows[0]?.SeriNo ?? "").trim();
      const value = Number.parseInt(seriNo, 10);

      if (!Number.isSafeInteger(value)) {
        throw new Error(
          `Serial counter "${seriCode}" holds a value that is not a number: "${seriNo}".`,
        );
      }

      return `${seriCode}${padSerial(value, width)}`;
    }

    // ── Nothing was updated: either the series is full, or it is new ────────
    const existing = await db.$queryRaw<{ SeriNo: string }[]>`
      SELECT TRIM(SeriNo) AS SeriNo
        FROM tbl_serials
       WHERE SeriCode = ${seriKey}
       LIMIT 1
    `;

    if (existing.length > 0) {
      throw new Error(
        `Serial "${seriCode}" is exhausted — it already reached ${padSerial(maxValue, width)}.`,
      );
    }

    // First use of this series. INSERT IGNORE keeps the (rare) race harmless:
    // whichever caller gets there first creates the row, the other simply
    // loops round and takes the next number from it.
    await db.$executeRaw`
      INSERT IGNORE INTO tbl_serials (SeriCode, SeriNo, SeriDate)
      VALUES (${seriKey}, ${padSerial(startAt, width)}, CURDATE())
    `;
  }

  throw new Error(
    `Could not claim a number from the "${seriCode}" series. ` +
      `Check that Tbl_Serials exists and run scripts/add-serials-table.sql to seed it.`,
  );
}

/**
 * Read a counter without changing it. Useful for diagnostics and for seeding a
 * new series from the values already in a table.
 */
export async function peekSerial(
  db: SerialClient,
  code: string,
): Promise<{
  seriCode: string;
  seriNo: string;
  value: number;
  seriDate: Date | null;
} | null> {
  const seriCode = String(code ?? "")
    .trim()
    .toUpperCase();
  const seriKey = seriCode.padEnd(CODE_WIDTH, " ");

  const rows = await db.$queryRaw<{ SeriNo: string; SeriDate: Date | null }[]>`
    SELECT TRIM(SeriNo) AS SeriNo, SeriDate
      FROM tbl_serials
     WHERE SeriCode = ${seriKey}
     LIMIT 1
  `;

  if (rows.length === 0) return null;

  return {
    seriCode,
    seriNo: String(rows[0].SeriNo ?? "").trim(),
    value: Number.parseInt(String(rows[0].SeriNo ?? ""), 10) || 0,
    seriDate: rows[0].SeriDate ?? null,
  };
}

/**
 * Create a counter row if it is missing, or raise it when the table it counts
 * already contains higher numbers. Safe to run at any time.
 *
 * Used by the seed/backfill script so a series added to a database that
 * already holds data starts above the highest existing code.
 */
export async function ensureSerialRow(
  db: SerialClient,
  code: string,
  startAt = 0,
  width = DEFAULT_WIDTH,
): Promise<void> {
  const seriCode = String(code ?? "")
    .trim()
    .toUpperCase();
  const seriKey = seriCode.padEnd(CODE_WIDTH, " ");
  const seed = padSerial(startAt, width);

  await db.$executeRaw`
    INSERT IGNORE INTO tbl_serials (SeriCode, SeriNo, SeriDate)
    VALUES (${seriKey}, ${seed}, NULL)
  `;

  // Only ever move the counter forward — never lower a value already in use.
  await db.$executeRaw`
    UPDATE tbl_serials
       SET SeriNo = ${seed}
     WHERE SeriCode = ${seriKey}
       AND CAST(TRIM(SeriNo) AS UNSIGNED) < ${startAt}
  `;
}
