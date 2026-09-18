// src/lib/inventoryServer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared server-side helpers for the Purchase Order / GRN APIs.
//
// Everything that is true for BOTH documents lives here once:
//
//   · who is signed in          (the actor is ALWAYS taken from the signed
//                                session cookie, never from the request body)
//   · input validation          (numbers, dates, ids, item codes)
//   · "does this exist in the database?" checks — a location, a supplier and
//     an item are always resolved against the real table and the value the
//     DATABASE holds is what gets written, so a padded/legacy code in the
//     payload can never be stored as-is
//   · error → HTTP response     (400 validation / 401 session / 409 conflict /
//                                500 with the failing step named)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ADMIN_COOKIE, verifyAdminToken } from "./adminSession";
import { itemCode } from "./itemCode";
import { round2, safePrice, safeQty } from "./inventoryTotals";
import { grnedFlag, poFullyReceived, poReceiptSummary, poReceiptWords } from "./poReceiptState";
import { itemDetailExpiry, itemDetailQty } from "./itemDetailStock";

/** Anything that can run a query: the shared client or a transaction. */
export type Db = Prisma.TransactionClient | PrismaClient;

/* ── errors ──────────────────────────────────────────────────────────────── */

/**
 * A failure that has an HTTP status and a message the user can act on.
 * Anything else that escapes a route is reported as 500 with the failed step.
 */
export class InvError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status = 400, hint?: string) {
    super(message);
    this.name = "InvError";
    this.status = status;
    if (hint) this.hint = hint;
  }
}

/** Turn any thrown value into the JSON the screens show in a toast. */
export function invFail(err: unknown, tag: string): NextResponse {
  if (err instanceof InvError) {
    return NextResponse.json(
      { success: false, message: err.message, hint: err.hint },
      { status: err.status },
    );
  }
  console.error(`[${tag}] failed:`, err);
  const message = err instanceof Error ? err.message : String(err);

  /* A very specific, very easy mistake: the dev server that is running still
     holds a Prisma client generated BEFORE the PO / GRN models were added. Then
     `tx.tbl_POHeader` is undefined and the failure is a bare
     “Cannot read properties of undefined (reading 'create')”, which tells the
     user nothing at all. Say what to do instead. */
  if (
    err instanceof TypeError &&
    /reading '(create|createMany|update|updateMany|upsert|delete|deleteMany|findMany|findFirst|findUnique|count|aggregate)'/.test(message)
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "This running server's database client does not know the Purchase Order / GRN tables yet, so nothing was saved.",
        hint:
          "Stop the dev server, run `npx prisma generate`, then start it again (delete the .next folder if it still fails). The four tables were added to prisma/schema.prisma, and the client has to be regenerated before it can use them.",
      },
      { status: 503 },
    );
  }
  /* A column in the user's own table is stricter than the schema (for example a
     NOT NULL datetime where ours allows NULL). Name the column involved — but
     the writers already fill every date they know about, so this only fires for
     a shape we have not seen yet. */
  if (/cannot be null/i.test(message)) {
    const column = message.match(/Column '([^']+)'/)?.[1] ?? "";
    return NextResponse.json(
      {
        success: false,
        message:
          "Nothing was saved: your table will not accept an empty value in the " +
          `“${column}” column.`,
        hint:
          "In the project folder run: node scripts/add-po-grn-columns.mjs — and send this message along if the same error comes back.",
      },
      { status: 503 },
    );
  }

  /* 1062 — the item is already on the document. A table ported from the old
     desktop system often has a UNIQUE key on (LocCode, document no, ItemCode),
     which allows each item only once per PO / GRN. Say that, instead of
     “Duplicate entry … for key …”. */
  if (/Duplicate entry/i.test(message)) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Nothing was saved: that item is already on this document. Your table allows each item only once per document.",
        hint:
          "Change the quantity on the existing line instead of adding the item again. If two lines of the same item must be allowed, the unique key on the detail table has to be relaxed — node scripts/add-po-grn-columns.mjs prints the keys of your tables when you run it.",
      },
      { status: 409 },
    );
  }

  /* The tables exist but one of them is an older shape than the screens need
     (the very first version of scripts/add-po-grn-tables.sql did not have
     tbl_grnheader.PONO / tbl_grndetails.UpdItemPrice). MySQL says
     “Unknown column 'PONO' in 'SELECT'”, which is not something to hand to a
     shop owner — point at the one-line fix instead. */
  if (/Unknown column/i.test(message)) {
    const column = message.match(/Unknown column '([^']+)'/)?.[1] ?? "";
    return NextResponse.json(
      {
        success: false,
        message:
          "The Purchase Order / GRN tables in your database are missing a column, so nothing was saved." +
          (column ? ` (${column})` : ""),
        hint:
          "In the project folder run: node scripts/add-po-grn-columns.mjs — it adds the columns the screens need (and touches nothing else). It is safe to run more than once.",
      },
      { status: 503 },
    );
  }

  /* The four tables are not there at all yet. */
  if (
    /Table '.*(tbl_poheader|tbl_podetails|tbl_grnheader|tbl_grndetails)' doesn't exist/i.test(message) ||
    /P2021/.test(message)
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "The Purchase Order / GRN tables have not been created in your database yet.",
        hint:
          "In the project folder run: node scripts/add-po-grn-columns.mjs — it creates any of the four tables that are missing. (scripts/add-po-grn-tables.sql does the same thing in phpMyAdmin.)",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      message: "The request could not be completed.",
      hint: message.slice(0, 300),
    },
    { status: 500 },
  );
}

/* ── tiny value helpers ──────────────────────────────────────────────────── */

export const invTrim = (value: unknown): string => String(value ?? "").trim();

/**
 * Pad a value for a fixed-width CHAR column. Only ever used on INSERT/UPDATE:
 * a padded literal never matches on a NO PAD collation, so reads must RTRIM.
 */
export const invChar = (value: unknown, length: number): string =>
  invTrim(value).slice(0, length).padEnd(length, " ");

/**
 * Free text for a VARCHAR column (batch numbers, remarks): trimmed, no
 * padding — a VARCHAR is not a CHAR, so `invChar` would leave visible blanks.
 */
export const invVarChar = (value: unknown, length: number): string =>
  invTrim(value).slice(0, length);

/**
 * Does this table have that column?
 *
 * Used for the one column that was added after the screens shipped
 * (`tbl_grndetails.BatchNo`): a database that has not been through
 * `node scripts/add-po-grn-columns.mjs` yet keeps saving receipts, and only a
 * receipt that actually carries a batch number is refused — with the one-line
 * fix in the message. Nothing is cached, so running the script is enough; no
 * restart of the app is needed.
 */
export async function hasTable(db: Db, table: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ${table}
       AND COLUMN_NAME = ${column}
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

/* ── the batch-wise stock table (tbl_itemdetail) ─────────────────────────── */

/**
 * Add a receipt into `tbl_itemdetail` — the per-expiry stock the Item Master
 * screen reads (`SUM(ItemQty)` per LocCode + ItemCode).
 *
 * WHY BOTH TABLES: the item master holds one balance per item, this one holds
 * one row per batch/expiry. Confirming a GRN moves the item balance AND this
 * row, from the same quantity, so the Item Master screen and the GRN screen can
 * never show two different numbers.
 *
 * The row is matched on (LocCode, ItemCode, ExpiryDate): the expiry stored on
 * the GRN line, or 1900-01-01 when the packet has none — the same “empty date”
 * the rest of the purchase tables use. A missing row is created.
 *
 * Returns false (and writes nothing) when the table is not on this database —
 * a receipt must never be refused because of a table that only feeds a screen.
 */
export async function addItemDetailStock(
  db: Db,
  locCode: string,
  itemCode: string,
  expDate: Date | null,
  received: number,
  free: number,
): Promise<boolean> {
  const qty = itemDetailQty(received, free);
  if (qty === 0) return false;
  if (!(await hasTable(db, "tbl_itemdetail"))) return false;

  const expiry = itemDetailExpiry(expDate);

  const updated = await db.$executeRaw`
    UPDATE tbl_itemdetail
    SET ItemQty = ItemQty + ${qty}
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)}
      AND ${keySql("ItemCode")} = ${keyVal(itemCode)}
      AND ${keySql("ExpiryDate")} = ${expiry}
  `;
  if (Number(updated) > 0) return true;

  await db.$executeRaw`
    INSERT INTO tbl_itemdetail (LocCode, ItemCode, ExpiryDate, ItemQty)
    VALUES (${invChar(locCode, 10)}, ${invChar(itemCode, 15)}, ${expiry}, ${qty})
  `;
  return true;
}

/* ── the purchase order's “the goods came” flag ──────────────────────────── */

export interface PoReceivedResult {
  /** 'Y' / 'N' — what was written into tbl_poheader.GRNed. */
  flag: string;
  /** “2 of 3 line(s) received — 1 still open”. */
  words: string;
}

/**
 * Stamp `tbl_poheader.GRNed` after a receipt is confirmed — exactly the mark the
 * old desktop GRN save left behind, so an old report that reads that column
 * agrees with the new screen.
 *
 * WHY ‘fully received’ and not ‘any receipt’:
 *   the old program set it the moment one receipt went in; this screen can
 *   receive an order in several parts, so the flag only says Y when every line
 *   has arrived in full. A part delivery leaves the order open — which is what
 *   `poReceiptWords()` then explains in the activity log.
 *
 * Returns null when nothing was written: no PO on this receipt, the order is
 * not in the table, or the column is not there yet (an older database).
 * Running `node scripts/add-po-grn-columns.mjs` adds it; until then this GRN
 * still confirms normally — nothing is refused because of a missing flag.
 */
export async function markPoReceived(
  db: Db,
  locCode: string,
  poNo: string,
): Promise<PoReceivedResult | null> {
  const po = String(poNo ?? "").trim();
  if (!po) return null;

  if (!(await hasColumn(db, "tbl_poheader", "GRNed"))) return null;

  const rows = await db.$queryRaw<{ POQty: number | null; GRNQty: number | null }[]>`
    SELECT POQty AS POQty, GRNQty AS GRNQty
      FROM tbl_podetails
     WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONo")} = ${keyVal(po)}
  `;
  if (rows.length === 0) return null;

  const lines = rows.map((r) => ({
    poQty: safeQty(r.POQty),
    grnQty: safeQty(r.GRNQty),
  }));
  const summary = poReceiptSummary(lines);
  const flag = grnedFlag(summary.fullyReceived);
  const words = poReceiptWords(summary);

  await db.$executeRaw`
    UPDATE tbl_poheader
    SET GRNed = ${flag}
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONO")} = ${keyVal(po)}
  `;

  return { flag, words };
}

/** The message to show when a batch number cannot be stored yet. */
export function batchColumnMissing(): InvError {
  return new InvError(
    "A batch number was typed, but this database has no BatchNo column on tbl_grndetails yet, " +
      "so the receipt was not saved. Run: node scripts/add-po-grn-columns.mjs — it adds that one " +
      "column (and touches nothing else). Until then you can save the line with the batch box empty.",
  );
}

/** "2026-09-16" or a full ISO string → Date. Empty → undefined (caller decides). */
/* ── empty dates ────────────────────────────────────────────────────────────
   tbl_poheader.ConDatetime / tbl_grnheader.ConDatetime / tbl_grndetails.ExpDate
   are nullable in the schema this project ships, but a database that was
   created from the original SQL-Server DDL (or by hand) often declares them
   NOT NULL — and then MySQL answers

       Code: `1048`. Message: `Column 'ConDatetime' cannot be null`

   and the whole save is rolled back. So an “empty” date is written as the
   legacy empty-date value 1900-01-01 (what the old desktop screens used for
   “no date”) and reads map it back to blank, which keeps the app working on
   BOTH table shapes.  Do not put NULL into these columns again. */
export const EMPTY_DATE = new Date(Date.UTC(1900, 0, 1, 0, 0, 0));

/** Is this the 1900-01-01 “no date” marker rather than a real date? */
export function isEmptyDate(value: unknown): boolean {
  if (!value) return true;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1900;
}

/** A date for a column that might not accept NULL. */
export function invDateOrEmpty(value: Date | null): Date {
  return value ?? EMPTY_DATE;
}

export function invDateField(value: unknown, field: string): Date {
  const raw = invTrim(value);
  if (!raw) throw new InvError(`${field} is required.`);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new InvError(`${field} is not a valid date (got “${raw}”).`);
  }
  return date;
}

export function invOptionalDate(value: unknown, field: string): Date | null {
  const raw = invTrim(value);
  if (!raw) return null;
  return invDateField(raw, field);
}

/** A quantity: finite, ≥ 0, rounded like the legacy DOUBLE columns. */
export function invQty(value: unknown, field: string, opts: { allowZero?: boolean } = {}): number {
  const raw = invTrim(value);
  if (!raw) throw new InvError(`${field} is required.`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new InvError(`${field} must be a number of 0 or more (got “${raw}”).`);
  }
  if (!opts.allowZero && n === 0) throw new InvError(`${field} must be greater than zero.`);
  return safeQty(n);
}

/** A money value: finite, ≥ 0, 2 decimals. */
export function invPrice(value: unknown, field: string): number {
  const raw = invTrim(value);
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new InvError(`${field} must be a number of 0 or more (got “${raw}”).`);
  }
  return safePrice(round2(n));
}

/** An identifier (LocCode / SupID / PO no / GRN no): trimmed and upper-cased. */
export function invId(value: unknown, field: string, max: number): string {
  const raw = invTrim(value).toUpperCase();
  if (!raw) throw new InvError(`${field} is required.`);
  if (raw.length > max) {
    throw new InvError(`${field} cannot be longer than ${max} characters (got “${raw}”).`);
  }
  return raw;
}

/* ── the signed-in user ──────────────────────────────────────────────────── */

export interface InvActor {
  /** UserId — stored in the CHAR(10) UserID / ConUserID columns. */
  userId: string;
  /** Display name — written to the activity log. */
  name: string;
}

/**
 * Reads the admin session cookie. Throws 401 when there is none, so a route
 * only has to call this once at the top. The middleware already blocks
 * unauthenticated API calls; this is the second lock (and it gives the actor).
 */
export async function invActor(req: NextRequest): Promise<InvActor> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const payload = token ? await verifyAdminToken(token) : null;
  if (!payload) throw new InvError("Your session has expired — please sign in again.", 401);
  return {
    userId: invTrim(payload.uid) || "0",
    name: invTrim(payload.name) || invTrim(payload.log) || "admin",
  };
}

/* ── comparing CHAR columns that come from two different worlds ─────────────

   The legacy OEM tables and the PO / GRN tables this project creates do not
   have to share a collation. When two columns (or a column and a bound value)
   with DIFFERENT collations meet in one comparison, MySQL and MariaDB refuse
   the query outright:

       ERROR 1267: Illegal mix of collations (utf8mb4_uca1400_ai_ci,IMPLICIT)
                                  and (utf8mb4_unicode_ci,IMPLICIT) for '='

   Neither "collate one side" nor "cast to the other side's collation" is enough
   when the CHARACTER SETS may differ too (a legacy latin1 table next to a
   utf8mb4 one). So every key comparison in the inventory SQL goes through these
   two helpers: the column and the value are both converted to utf8mb4 and given
   ONE explicit collation, which takes precedence over anything the operands
   bring with them. utf8mb4_general_ci also pads the comparison, so a CHAR(10)
   value compares equal to the trimmed string in a bound parameter.

   Use them ONLY in WHERE / JOIN / HAVING predicates — never in a SELECT list
   (they would change the returned value).
   ─────────────────────────────────────────────────────────────────────────── */

/** A stored key column (LocCode, SupID, ItemCode, PONO, GRNNO …) to compare. */
export function keySql(column: string): Prisma.Sql {
  return Prisma.raw(`CONVERT(${column} USING utf8mb4) COLLATE utf8mb4_general_ci`);
}

/** The bound value to compare that column with. */
export function keyVal(value: unknown): Prisma.Sql {
  return Prisma.sql`CONVERT(${value} USING utf8mb4) COLLATE utf8mb4_general_ci`;
}

/* ── “does it exist in the database?” ────────────────────────────────────── */

/** The location code as the DATABASE stores it, or null when it is unknown. */
export async function findLocation(db: Db, locCode: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ LocCode: string }[]>`
    SELECT RTRIM(LocCode) AS LocCode
    FROM tbl_locationmaster
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)}
    LIMIT 1
  `;
  return rows.length ? String(rows[0].LocCode).trim() : null;
}

/** The supplier id as the DATABASE stores it, or null when it is unknown. */
export async function findSupplier(db: Db, supID: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ SupID: string }[]>`
    SELECT RTRIM(SupID) AS SupID
    FROM tbl_suppliermaster
    WHERE ${keySql("SupID")} = ${keyVal(supID)}
    LIMIT 1
  `;
  return rows.length ? String(rows[0].SupID).trim() : null;
}

export interface ResolvedItem {
  /** Full CHAR(15) code exactly as stored in tbl_itemmaster. */
  code: string;
  des: string;
  unitID: string;
  costPrice: number;
  retailPrice: number;
  serviceItem: boolean;
  stockBalance: number;
}

/**
 * Resolve the item codes of a document against tbl_itemmaster.
 *
 * The code the browser sends is only a LOOKUP KEY. What gets stored is
 * `item.code` — the value the database holds — so a 10-character legacy code
 * or a padded one can never end up in a new PO/GRN line.
 *
 * Unknown codes are reported together, so the user fixes one list instead of
 * being sent back one line at a time.
 */
export async function resolveItems(
  db: Db,
  locCode: string,
  codes: string[],
): Promise<Map<string, ResolvedItem>> {
  const wanted = Array.from(new Set(codes.map((c) => itemCode(c)).filter(Boolean)));
  const out = new Map<string, ResolvedItem>();
  if (wanted.length === 0) return out;

  const rows = await db.$queryRaw<
    {
      ItemCode: string;
      ItemDes: string;
      ItemPrintDes: string | null;
      MasterUnitID: string;
      RawCost: number | null;
      OverallCost: number | null;
      Retailprice: number | null;
      ServiceItem: number | null;
      StockBalance: number | null;
    }[]
  >`
    SELECT
      RTRIM(i.ItemCode) AS ItemCode,
      i.ItemDes AS ItemDes,
      i.ItemPrintDes AS ItemPrintDes,
      RTRIM(i.MasterUnitID) AS MasterUnitID,
      i.RawCost AS RawCost,
      i.OverallCost AS OverallCost,
      i.Retailprice AS Retailprice,
      i.ServiceItem AS ServiceItem,
      i.StockBalance AS StockBalance
    FROM tbl_itemmaster i
    WHERE ${keySql("i.LocCode")} = ${keyVal(locCode)}
      AND ${keySql("i.ItemCode")} IN (${Prisma.join(wanted.map(keyVal))})
  `;

  for (const row of rows) {
    const code = itemCode(row.ItemCode);
    out.set(code, {
      code,
      des: invTrim(row.ItemPrintDes) || invTrim(row.ItemDes) || code,
      unitID: invTrim(row.MasterUnitID),
      costPrice: safePrice(Number(row.OverallCost ?? 0) || Number(row.RawCost ?? 0) || 0),
      retailPrice: safePrice(Number(row.Retailprice ?? 0)),
      serviceItem: Number(row.ServiceItem ?? 0) === 1,
      stockBalance: safeQty(Number(row.StockBalance ?? 0)),
    });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Purchase Order / GRN writes — ALL RAW SQL
   -----------------------------------------------------------------------------
   These four tables are written with `$executeRaw`, not with generated model
   methods (`tx.tbl_POHeader.create(...)`).

   WHY: the Prisma client inside node_modules is only as new as the last
   `prisma generate`. A dev server that was started before the models were added
   — or a deployment where generate was skipped — then has `tx.tbl_POHeader ===
   undefined` and the save dies with

       TypeError: Cannot read properties of undefined (reading 'create')

   which tells the person at the keyboard nothing. Raw SQL only needs the TABLE
   to exist in MySQL, so the screens keep working whatever state the generated
   client is in. (The models stay in prisma/schema.prisma for documentation and
   for `prisma format` / `validate`.)
   ──────────────────────────────────────────────────────────────────────────── */

export interface PoHeaderWrite {
  locCode: string;
  poNo: string;
  poDate: Date;
  dueDate: Date;
  supID: string;
  netTotal: number;
  actorId: string;
  remarks: string;
  deliAdd: string;
  confirmed: boolean;
}

export interface PoLineWrite {
  lineNo: number;
  itemCode: string;
  unitID: string;
  costPrice: number;
  poQty: number;
  itemValue: number;
}

export interface GrnHeaderWrite {
  locCode: string;
  grnNo: string;
  /** The purchase order behind the receipt — '' for a direct GRN. */
  poNo: string;
  grnDate: Date;
  supID: string;
  supInvNo: string;
  grossTotal: number;
  discount: number;
  adjustment: number;
  netTotal: number;
  actorId: string;
  remarks: string;
  grnType: string;
  confirmed: boolean;
}

export interface GrnLineWrite {
  lineNo: number;
  itemCode: string;
  unitID: string;
  /* The batch number written on the packet. Optional in the database: a
     database created before this column existed keeps saving receipts, it just
     cannot store a batch number (the screens say so instead of losing it). */
  batchNo?: string;
  costPrice: number;
  retailPrice: number;
  grnQty: number;
  freeQty: number;
  itemValue: number;
  expDate: Date | null;
  poNo: string;
  updItemPrice: boolean;
}

/* ── purchase order ──────────────────────────────────────────────────────── */

export async function insertPoHeader(db: Db, header: PoHeaderWrite): Promise<void> {
  /* ConDatetime gets a real timestamp even while the order is still pending:
     in a legacy table the column is NOT NULL, and NULL here fails the whole
     insert with 1048. Confirmation overwrites it with the confirming time. */
  const now = new Date();
  await db.$executeRaw`
    INSERT INTO tbl_poheader
      (LocCode, PONO, PODate, DueDate, SupID, NetTotal, UserID, Remarks, DeliAdd,
       TxnDate, SysSerialNo, ConUserID, Confirmed, ConDatetime)
    VALUES
      (${invChar(header.locCode, 10)}, ${invChar(header.poNo, 10)}, ${header.poDate},
       ${invDateOrEmpty(header.dueDate)}, ${invChar(header.supID, 10)}, ${header.netTotal},
       ${invChar(header.actorId, 10)}, ${header.remarks}, ${header.deliAdd},
       ${now}, ${invChar(header.poNo.replace(/\D/g, ""), 10)},
       ${invChar(header.confirmed ? header.actorId : "0", 10)},
       ${header.confirmed ? "Y" : "N"},
       ${now})
  `;
}

export async function updatePoHeader(db: Db, header: PoHeaderWrite): Promise<void> {
  await db.$executeRaw`
    UPDATE tbl_poheader
    SET PODate = ${header.poDate}, DueDate = ${header.dueDate},
        SupID = ${invChar(header.supID, 10)}, NetTotal = ${header.netTotal},
        Remarks = ${header.remarks}, DeliAdd = ${header.deliAdd}
    WHERE ${keySql("LocCode")} = ${keyVal(header.locCode)} AND ${keySql("PONO")} = ${keyVal(header.poNo)}
  `;
}

export async function confirmPoHeader(
  db: Db,
  locCode: string,
  poNo: string,
  actorId: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE tbl_poheader
    SET Confirmed = 'Y', ConUserID = ${invChar(actorId, 10)}, ConDatetime = ${new Date()}
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONO")} = ${keyVal(poNo)}
  `;
}

export async function insertPoLine(
  db: Db,
  locCode: string,
  poNo: string,
  line: PoLineWrite,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO tbl_podetails
      (LocCode, PONo, LineNo, ItemCode, UnitID, CostPrice, POQty, ItemValue,
       DirectPOConfNo, GRNQty, GRNNOs)
    VALUES
      (${invChar(locCode, 10)}, ${invChar(poNo, 10)}, ${line.lineNo},
       ${invChar(line.itemCode, 15)}, ${invChar(line.unitID, 10)},
       ${line.costPrice}, ${line.poQty}, ${line.itemValue}, ${invChar("", 10)}, 0, '')
  `;
}

export async function deletePoLines(db: Db, locCode: string, poNo: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM tbl_podetails
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONo")} = ${keyVal(poNo)}
  `;
}

export async function deletePoHeader(db: Db, locCode: string, poNo: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM tbl_poheader
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONO")} = ${keyVal(poNo)}
  `;
}

/* ── goods received note ─────────────────────────────────────────────────── */

export async function insertGrnHeader(db: Db, header: GrnHeaderWrite): Promise<void> {
  await db.$executeRaw`
    INSERT INTO tbl_grnheader
      (LocCode, GRNNO, GRNDate, SupID, SupInvNo, GrossTotal, DisVal, Adjestment,
       NetTotal, UserID, Remarks, TxnDate, SysSerialNo, Confirmed, ConUserID,
       ConDatetime, GRNTYPE, PONO)
    VALUES
      (${invChar(header.locCode, 10)}, ${invChar(header.grnNo, 15)}, ${invDateOrEmpty(header.grnDate)},
       ${invChar(header.supID, 10)}, ${header.supInvNo}, ${header.grossTotal},
       ${header.discount}, ${header.adjustment}, ${header.netTotal},
       ${invChar(header.actorId, 10)}, ${header.remarks}, ${new Date()},
       ${Number(String(header.grnNo).replace(/\D/g, "")) || 0},
       ${header.confirmed ? "Y" : "N"},
       ${invChar(header.confirmed ? header.actorId : "0", 10)},
       ${new Date()},
       ${invChar(header.grnType, 2)}, ${invChar(header.poNo, 10)})
  `;
}

export async function updateGrnHeader(db: Db, header: GrnHeaderWrite): Promise<void> {
  await db.$executeRaw`
    UPDATE tbl_grnheader
    SET GRNDate = ${header.grnDate}, SupID = ${invChar(header.supID, 10)},
        SupInvNo = ${header.supInvNo}, GrossTotal = ${header.grossTotal},
        DisVal = ${header.discount}, Adjestment = ${header.adjustment},
        NetTotal = ${header.netTotal}, Remarks = ${header.remarks}
    WHERE ${keySql("LocCode")} = ${keyVal(header.locCode)} AND ${keySql("GRNNO")} = ${keyVal(header.grnNo)}
  `;
}

export async function confirmGrnHeader(
  db: Db,
  locCode: string,
  grnNo: string,
  actorId: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE tbl_grnheader
    SET Confirmed = 'Y', ConUserID = ${invChar(actorId, 10)}, ConDatetime = ${new Date()}
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("GRNNO")} = ${keyVal(grnNo)}
  `;
}

export async function insertGrnLine(
  db: Db,
  locCode: string,
  grnNo: string,
  line: GrnLineWrite,
  withBatchNo = true,
): Promise<void> {
  if (!withBatchNo) {
    /* An older database without tbl_grndetails.BatchNo. Nothing is lost: the
       caller refuses to save a batch number in that case, and rows without one
       cannot tell the difference. */
    await db.$executeRaw`
      INSERT INTO tbl_grndetails
        (LocCode, GRNNo, LineNo, ItemCode, UnitID, CostPrice, RetailPrice, GRNQty,
         FreeQty, ItemValue, ExpDate, DirectGRNConfNo, RETYN, RETQTY, RETVAL,
         PONO, UpdItemPrice)
      VALUES
        (${invChar(locCode, 10)}, ${invChar(grnNo, 15)}, ${line.lineNo},
         ${invChar(line.itemCode, 15)}, ${invChar(line.unitID, 15)},
         ${line.costPrice}, ${line.retailPrice}, ${line.grnQty}, ${line.freeQty},
         ${line.itemValue}, ${invDateOrEmpty(line.expDate)}, ${""}, 0, 0, 0,
         ${invChar(line.poNo, 10)}, ${line.updItemPrice ? 1 : 0})
    `;
    return;
  }
  await db.$executeRaw`
    INSERT INTO tbl_grndetails
      (LocCode, GRNNo, LineNo, ItemCode, UnitID, BatchNo, CostPrice, RetailPrice,
       GRNQty, FreeQty, ItemValue, ExpDate, DirectGRNConfNo, RETYN, RETQTY, RETVAL,
       PONO, UpdItemPrice)
    VALUES
      (${invChar(locCode, 10)}, ${invChar(grnNo, 15)}, ${line.lineNo},
       ${invChar(line.itemCode, 15)}, ${invChar(line.unitID, 15)},
       ${invVarChar(line.batchNo ?? "", 50)},
       ${line.costPrice}, ${line.retailPrice}, ${line.grnQty}, ${line.freeQty},
       ${line.itemValue}, ${invDateOrEmpty(line.expDate)}, ${""}, 0, 0, 0,
       ${invChar(line.poNo, 10)}, ${line.updItemPrice ? 1 : 0})
  `;
}

export async function deleteGrnLines(db: Db, locCode: string, grnNo: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM tbl_grndetails
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("GRNNo")} = ${keyVal(grnNo)}
  `;
}

export async function deleteGrnHeader(db: Db, locCode: string, grnNo: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM tbl_grnheader
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("GRNNO")} = ${keyVal(grnNo)}
  `;
}
