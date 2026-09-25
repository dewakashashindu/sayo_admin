
import type { Prisma, PrismaClient } from "@prisma/client";

/** Anything that can run a raw query: the shared client or a transaction. */
export type SerialClient = Prisma.TransactionClient | PrismaClient;

/** The series that are in use. Add new codes here as they are introduced. */
export const SERIAL_CODES = {
  /** Booking ID        -> BK0000001 */
  booking: "BK",
  /** Customer code     -> CUS0000001 */
  customer: "CUS",
  /** Bill / invoice no -> INV0000001 (Tbl_Serials row with SeriCode = "INV") */
  invoice: "INV",
  /** Purchase order no -> PO0000001 (fits tbl_poheader.PONO CHAR(10)) */
  purchaseOrder: "PO",
  /** Goods received note no -> GRN0000001 (fits tbl_grnheader.GRNNO varchar(15)) */
  goodsReceived: "GRN",
  /** Transfer requisition no -> TC000001 (fits tbl_transferreqheder.TRNO CHAR(10)) VB GetTxnNo(..., "TRQ") */
  transferReq: "TC",
  /** Transfer note no      -> TN000001 (fits tbl_transfernoteheader.TranNo VARCHAR(15)) */
  transferNote: "TN",
  /** Transfer return no    -> TR000001 (fits tbl_transferreturnheader.TRtnNo CHAR(10)) */
  transferReturn: "TR",
  /** Issue requisition no  -> IR000001 (fits tbl_issuereqheder.IRNO CHAR(10)) */
  issueReq: "IR",
  /** Issue note no         -> IN000001 (fits tbl_issuenoteheder.INNO VARCHAR(50)) */
  issueNote: "IN",
} as const;

export type SerialCodeName = keyof typeof SERIAL_CODES;

export const SERIAL_CODE_ALIASES: Record<string, string[]> = {
  BK: ["BK", "B", "BOOK", "BOOKING"],
  CUS: ["CUS", "C", "CUST", "CUSTOMER"],
  INV: ["INV", "I", "INVOICE", "BILL", "BILLNO"],
  PO: ["PO", "P", "PORDER", "PURCHASE"],
  GRN: ["GRN", "G", "GR", "GOODSREC"],
  TC: ["TC", "TRQ", "TR", "TRANSFERREQ", "TRANSFERREQUISITION"],
  TN: ["TN", "TRANSFERNOTE", "TRANSFER", "ISSUE"],
  TR: ["TR", "TRTN", "TRANSFERRETURN", "RETURN"],
  IR: ["IR", "IRN", "IREQ", "ISSUEREQ", "ISSUEREQUISITION"],
  IN: ["IN", "INN", "ISSUENOTE"],
};

/**
 * Which `SeriCode` to use for a series: the one the database actually holds
 * (alias aware), otherwise the canonical code, which is then created on first
 * use. Nothing is written here — this is a plain read.
 */
export async function resolveSerialCode(
  db: SerialClient,
  code: string,
): Promise<string> {
  const row = await resolveSerialRow(db, code);
  return row.code;
}

/** Digits to pad with: the counter the database holds decides (7 by default). */
function widthFromCounter(seriNo: string, fallback: number): number {
  const digits = String(seriNo ?? "").trim();
  const value = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(value) || value <= 0) return fallback;
  return digits.length >= 3 && digits.length <= 9 ? digits.length : fallback;
}

/**
 * The counter row this database uses for a series plus the number it holds.
 * Nothing is written here — this is a plain read.
 */
export async function resolveSerialRow(
  db: SerialClient,
  code: string,
): Promise<{ code: string; seriNo: string }> {
  const canonical = String(code ?? "")
    .trim()
    .toUpperCase();
  if (!canonical) return { code: canonical, seriNo: "" };

  const candidates = SERIAL_CODE_ALIASES[canonical] || [canonical];

  let rows: { SeriCode: string; SeriNo: string }[] = [];
  try {
    rows = await db.$queryRaw<{ SeriCode: string; SeriNo: string }[]>`
      SELECT RTRIM(SeriCode) AS SeriCode, TRIM(SeriNo) AS SeriNo
        FROM tbl_serials
    `;
  } catch {
    // No Tbl_Serials yet — the caller's normal path creates it.
    return { code: canonical, seriNo: "" };
  }

  const byCode = new Map<string, string>();
  rows.forEach((row) =>
    byCode.set(
      String(row.SeriCode ?? "").trim().toUpperCase(),
      String(row.SeriNo ?? "").trim(),
    ),
  );

  const found = candidates.filter((candidate) => byCode.has(candidate));
  if (found.length === 0) return { code: canonical, seriNo: "" };
  if (found.length === 1) {
    return { code: found[0], seriNo: byCode.get(found[0]) || "" };
  }

  /* More than one candidate exists (an old empty row next to the live one):
     the one that has already issued numbers wins — using the empty row would
     hand out bill numbers that are already in the tables. */
  const issued = found.filter(
    (candidate) => Number.parseInt(byCode.get(candidate) || "0", 10) > 0,
  );
  const chosen = issued[0] || found[0];
  return { code: chosen, seriNo: byCode.get(chosen) || "" };
}

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

export async function nextSerialTx(
  db: SerialClient,
  code: string,
  options: NextSerialOptions = {},
): Promise<string> {
  const requested = String(code ?? "")
    .trim()
    .toUpperCase();

  if (!requested) {
    throw new Error("nextSerialTx: a SeriCode is required.");
  }

  // Use the counter this database really holds ("I" for the invoice series,
  // "INV" when that is what is stored) — see SERIAL_CODE_ALIASES. The padding
  // follows that counter as well, so a legacy series with 6 digits keeps them.
  const resolved = await resolveSerialRow(db, requested);
  const seriCode = resolved.code;
  if (seriCode.length > CODE_WIDTH) {
    throw new Error(
      `nextSerialTx: SeriCode "${seriCode}" is longer than the char(10) column.`,
    );
  }

  const width =
    options.width && options.width > 0
      ? options.width
      : widthFromCounter(resolved.seriNo, DEFAULT_WIDTH);
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
  // Alias aware: "INV" finds the "I" row this database actually keeps.
  const seriCode = await resolveSerialCode(db, code);
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

export async function ensureSerialRow(
  db: SerialClient,
  code: string,
  startAt = 0,
  width = DEFAULT_WIDTH,
): Promise<void> {
  // Alias aware: seed the row this database uses for the series.
  const seriCode = await resolveSerialCode(db, code);
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
