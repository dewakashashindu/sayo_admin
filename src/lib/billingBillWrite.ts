// src/lib/billingBillWrite.ts
// ─────────────────────────────────────────────────────────────────────────────
// The one place the four bill tables are written. Server-only (it needs the
// Prisma client), used by
//
//   POST /api/billing/booking/[bookingID]/complete   → the real thing
//   GET  /api/billing/diagnose/bill                  → a DRY RUN that performs
//                                                      every statement and then
//                                                      rolls the whole thing
//                                                      back, so the exact
//                                                      database error can be
//                                                      read without writing a
//                                                      single row
//
// Keeping both on the same code path means the dry run cannot drift away from
// the real write: if the dry run passes, the real one passes.
//
// Every step is labelled. When something fails the caller gets the step name
// (`header`, `detail`, `paytxn`, `taxes`, `booking`) plus the real database
// message and a hint for the usual causes — the bill screen shows that instead
// of a generic “could not be saved”.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma, PrismaClient } from "@prisma/client";
import { nextSerialTx, SERIAL_CODES } from "./serials";
import type { PaymentEntry } from "./billingPayments";
import type { TaxLine } from "./billingTaxes";
import {
  allocatePayments,
  billTaxRows,
  buildBillSummary,
  linesWithoutCode,
  mergeBillLines,
  shortCode,
  type BillDetailRow,
  type BillLineInput,
  type BillPaymentRow,
  type BillSummary,
  type BillTaxRow,
} from "./billingBill";
import { createItemCodeIndex, itemCode, legacyItemCode } from "./itemCode";

/** Anything that can run raw queries — the shared client or a transaction. */
export type SqlClient = Prisma.TransactionClient | PrismaClient;

/* ─────────────────────────────────────────────────────────────────────────
   ERRORS
   ───────────────────────────────────────────────────────────────────────── */

/** A failure with the step it happened on, so the screen can say where. */
export class BillWriteError extends Error {
  readonly stage: string;
  readonly cause: unknown;

  constructor(stage: string, cause: unknown) {
    super(
      cause instanceof Error ? cause.message : String(cause ?? "unknown error"),
    );
    this.name = "BillWriteError";
    this.stage = stage;
    this.cause = cause;
  }
}

/** Run one labelled step; anything thrown is tagged with the step name. */
async function at<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw new BillWriteError(stage, err);
  }
}

/** MySQL / Prisma error numbers that the salon can actually act on. */
const DB_HINTS: Record<string, string> = {
  "1146": "A bill table is missing on this database (tbl_billheader / tbl_billdetail / tbl_billpaytxn / tbl_billtaxes).",
  "1054": "One of the bill tables has different columns than expected. Send the table structure of tbl_billheader so the code can be aligned.",
  "1062":
    "Duplicate key — the Tbl_Serials counter for the invoice series (SeriCode “INV”, or whatever this database calls it, for example “I”) is behind the bill numbers already stored. Raise it to the last BillNo in tbl_billheader.",
  "1406": "A value is longer than its column allows. An item code is CHAR(15): if the detail columns are still CHAR(10), run scripts/migrate-itemcode-char15.sql (the remark column is VARCHAR(200)).",
  "1452": "A foreign key rejected the row — a reference in the bill points at a row that does not exist.",
  "1292": "A value has the wrong type for its column (usually a date/time column).",
  "1364": "A NOT NULL column was left out of the INSERT — the live table has a column the code does not know about.",
  "1044": "The database user has no rights on these tables (access denied).",
  "1142": "The database user is not allowed to INSERT/UPDATE on this table.",
  "1205": "The database was locked too long — try again in a moment.",
};

export interface DbErrorReport {
  message: string;
  hint: string;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const parts = [record.message, record.code, record.meta]
      .map((part) => (part === undefined || part === null ? "" : String(typeof part === "object" ? JSON.stringify(part) : part)))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
  }
  return String(err ?? "");
}

/** Turn a Prisma/MySQL error into something the cashier can act on. */
export function describeDbError(err: unknown): DbErrorReport {
  const raw = errorText(err);
  const codeMatch = raw.match(/`?code`?:\s*'([A-Z0-9]+)'/) || raw.match(/"code":\s*"([A-Z0-9]+)"/);
  const numberMatch = raw.match(/\((\d{4,5})\)/) || raw.match(/errno[:\s]+(\d{4,5})/i);
  const key = numberMatch?.[1] ?? codeMatch?.[1] ?? "";

  let hint = DB_HINTS[key] ?? "";
  if (!hint && /P2028|Transaction already closed|Transaction API error/i.test(raw)) {
    hint =
      "The database transaction took too long (the bill was rolled back — nothing was written). Try again; if it keeps happening the database connection is slow.";
  }
  if (!hint && /Can't reach database server|ECONNREFUSED|ETIMEDOUT/i.test(raw)) {
    hint = "The application cannot reach the MySQL server.";
  }
  if (!hint && /Serial "INV"/.test(raw)) {
    hint =
      "The Tbl_Serials counter for the invoice series is full or missing (its SeriCode is “INV” in a new install, “I” in older databases — both are accepted).";
  }
  return { message: raw.split("\n").filter(Boolean).slice(0, 3).join(" · "), hint };
}

/* ─────────────────────────────────────────────────────────────────────────
   PREPARE (reads, outside the transaction)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Give free-text lines an item code: an exact name match in the item master is
 * enough. Lines that stay codeless cannot be stored in tbl_billdetail (ItemID
 * is part of its primary key) and are reported back instead.
 */
export async function resolveLineCodes(
  db: SqlClient,
  locCode: string,
  lines: BillLineInput[],
): Promise<BillLineInput[]> {
  const resolved = lines.map((line) => ({ ...line }));
  const names = Array.from(
    new Set(
      resolved
        .filter((line) => !itemCode(line.itemId) && line.name)
        .map((line) => line.name),
    ),
  );
  if (names.length === 0) return resolved;

  const matches = await db.$queryRaw<
    { ItemCode: string; ItemDes: string; ItemPrintDes: string | null }[]
  >`
    SELECT
      RTRIM(ItemCode)     AS ItemCode,
      RTRIM(ItemDes)      AS ItemDes,
      RTRIM(ItemPrintDes) AS ItemPrintDes
    FROM tbl_itemmaster
    WHERE RTRIM(LocCode) = ${locCode}
      AND (
        RTRIM(ItemDes) IN (${Prisma.join(names)})
        OR RTRIM(ItemPrintDes) IN (${Prisma.join(names)})
      )
  `;

  const codeByName = new Map<string, string>();
  matches.forEach((match) => {
    [match.ItemDes, match.ItemPrintDes].forEach((description) => {
      const key = String(description ?? "").trim().toLowerCase();
      if (key && !codeByName.has(key)) codeByName.set(key, String(match.ItemCode).trim());
    });
  });

  resolved.forEach((line) => {
    if (itemCode(line.itemId) || !line.name) return;
    const code = codeByName.get(line.name.toLowerCase());
    if (code) line.itemId = itemCode(code);
  });
  return resolved;
}

/**
 * Fill in the missing cost prices from the item master (nothing for services —
 * `ServiceItem = 1`; a service carries no material cost). Never fatal: a bill
 * must not fail over a cost price.
 */
/** Only the two fields this step touches — it works on any line shape. */
export interface CostedLine {
  itemId: string;
  costPrice: number;
}

export async function applyItemMasterCosts<T extends CostedLine>(
  db: SqlClient,
  locCode: string,
  rows: T[],
): Promise<T[]> {
  const need = rows.filter((row) => row.costPrice <= 0 && row.itemId);
  if (need.length === 0) return rows;

  try {
    const codes = Array.from(new Set(need.map((row) => itemCode(row.itemId))));
    // A bill row written before the CHAR(15) migration can still hold the old
    // 10-character prefix, so the lookup accepts the full code and the legacy
    // prefix alike. Never a bare LEFT(ItemCode, 10): that used to pick the
    // wrong item's cost whenever two codes shared their first 10 characters.
    const legacyCodes = Array.from(
      new Set(codes.map((code) => legacyItemCode(code)).filter(Boolean)),
    );
    const itemRows = await db.$queryRaw<
      { ItemCode: string; ServiceItem: number; OverallCost: number; RawCost: number }[]
    >`
      SELECT
        RTRIM(ItemCode)          AS ItemCode,
        (ServiceItem + 0)        AS ServiceItem,
        COALESCE(OverallCost, 0) AS OverallCost,
        COALESCE(RawCost, 0)     AS RawCost
      FROM tbl_itemmaster
      WHERE RTRIM(LocCode) = ${locCode}
        AND (
          RTRIM(ItemCode) IN (${Prisma.join(codes.length ? codes : [""])})
          OR LEFT(RTRIM(ItemCode), 10) IN (${Prisma.join(legacyCodes.length ? legacyCodes : [""])})
        )
    `;
    const costIndex = createItemCodeIndex(
      itemRows
        .filter((row) => Number(row.ServiceItem) === 0)
        .map((row) => ({
          code: String(row.ItemCode ?? ""),
          cost:
            Number(row.OverallCost) > 0
              ? Number(row.OverallCost)
              : Number(row.RawCost),
        }))
        .filter((entry) => entry.code && entry.cost > 0),
      (entry) => entry.code,
    );
    const costByCode = new Map<string, number>();
    need.forEach((row) => {
      const match = costIndex.get(row.itemId);
      if (match) costByCode.set(itemCode(row.itemId), match.cost);
    });
    rows.forEach((row) => {
      if (row.costPrice > 0) return;
      const cost = costByCode.get(row.itemId) ?? 0;
      if (cost > 0) row.costPrice = cost;
    });
  } catch (err) {
    console.warn("[billing-bill] cost lookup skipped:", err);
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────────
   WRITE (inside the transaction)
   ───────────────────────────────────────────────────────────────────────── */

export interface BillWriteRequest {
  locCode: string;
  bookingID: string;
  /** Services + items, codes already resolved. */
  lines: BillLineInput[];
  taxes: TaxLine[];
  payments: PaymentEntry[];
  gross: number;
  discountPercent: number;
  discountValue: number;
  advAmount: number;
  cusCode: string;
  cashierId: string;
  remark: string;
}

export interface BillWriteResult {
  billNo: string;
  summary: BillSummary;
  detailRows: BillDetailRow[];
  taxRows: BillTaxRow[];
  paymentRows: BillPaymentRow[];
  unmappedLines: { name: string; qty: number; price: number }[];
}

/**
 * Everything, in the caller's transaction:
 *   serial (BillNo) → tbl_billheader → tbl_billdetail → tbl_billpaytxn →
 *   tbl_billtaxes → tbl_bookingheder.BillingTime
 */
export async function writeBillTx(
  tx: Prisma.TransactionClient,
  req: BillWriteRequest,
): Promise<BillWriteResult> {
  const locCode = req.locCode;
  const cusCode = shortCode(req.cusCode) || " ";
  const cashierId = shortCode(req.cashierId) || " ";
  const remark = String(req.remark ?? "").trim().substring(0, 200) || " ";

  const summary = buildBillSummary(
    req.taxes,
    req.gross,
    req.discountPercent,
    req.discountValue,
    req.advAmount,
  );
  const detailRows = mergeBillLines(req.lines);
  const unmappedLines = linesWithoutCode(req.lines).map((line) => ({
    name: line.name || "(no name)",
    qty: line.qty,
    price: line.price,
  }));
  const taxRows = billTaxRows(req.taxes);
  const paymentRows = allocatePayments(req.payments, summary.netTotal);

  /* 1. Bill number — Tbl_Serials “INV” + 1, exactly like the BK series. */
  const billNo = await at("bill number (Tbl_Serials INV)", () =>
    nextSerialTx(tx, SERIAL_CODES.invoice),
  );

  /* 2. tbl_billheader */
  await at("tbl_billheader", () =>
    tx.$executeRaw`
      INSERT INTO tbl_billheader (
        LocCode, BillNo, Txndate, Gross, DisPre, DisVal, ServiceCharge,
        OtherServiceCharge, TotalTaxAmount, AdvAmount, NetTotal, CusID,
        TxnTime, ReferalCusID, RewardPoints, CashierID, Rmks
      ) VALUES (
        ${locCode}, ${billNo}, NOW(), ${summary.gross}, ${summary.discountPercent},
        ${summary.discountValue}, ${summary.serviceCharge}, ${summary.otherServiceCharge},
        ${summary.totalTaxAmount}, ${summary.advAmount}, ${summary.netTotal}, ${cusCode},
        NOW(), ${" "}, ${0}, ${cashierId}, ${remark}
      )
    `,
  );

  /* 3. tbl_billdetail — one row per item code */
  if (detailRows.length > 0) {
    await at("tbl_billdetail", () =>
      tx.$executeRaw`
        INSERT INTO tbl_billdetail (
          LocCode, BillNo, ItemID, Qty, SalesPrice, TotalItmPrice, CostPrice
        ) VALUES ${Prisma.join(
          detailRows.map(
            (row) => Prisma.sql`(
              ${locCode}, ${billNo}, ${row.itemId}, ${row.qty},
              ${row.salesPrice}, ${row.totalItemPrice}, ${row.costPrice}
            )`,
          ),
        )}
      `,
    );
  }

  /* 4. tbl_billpaytxn — one row per payment line, its own pay code */
  await at("tbl_billpaytxn", () =>
    tx.$executeRaw`
      INSERT INTO tbl_billpaytxn (
        LocCode, BillNo, PayCode, TenderedAmt, ActAmt, Rmks
      ) VALUES ${Prisma.join(
        paymentRows.map(
          (row) => Prisma.sql`(
            ${locCode}, ${billNo}, ${row.payCode}, ${row.tenderedAmount},
            ${row.actAmount}, ${row.remark || " "}
          )`,
        ),
      )}
    `,
  );

  /* 5. tbl_billtaxes — one row per tax that carries money */
  if (taxRows.length > 0) {
    await at("tbl_billtaxes", () =>
      tx.$executeRaw`
        INSERT INTO tbl_billtaxes (
          LocCode, BillNo, TaxCode, TaxAmount
        ) VALUES ${Prisma.join(
          taxRows.map(
            (row) => Prisma.sql`(
              ${locCode}, ${billNo}, ${row.taxCode}, ${row.taxAmountText}
            )`,
          ),
        )}
      `,
    );
  }

  /* 6. The booking is billed from now on → leaves the Billing Dashboard. */
  await at("tbl_bookingheder.BillingTime", () =>
    tx.$executeRaw`
      UPDATE tbl_bookingheder
      SET BillingTime = NOW()
      WHERE RTRIM(LocCode) = ${locCode}
        AND RTRIM(BookingID) = ${req.bookingID}
    `,
  );

  return { billNo, summary, detailRows, taxRows, paymentRows, unmappedLines };
}

/** Transaction options that survive a slow shared-hosting database. */
export const BILL_TX_OPTIONS = { maxWait: 10000, timeout: 20000 } as const;
