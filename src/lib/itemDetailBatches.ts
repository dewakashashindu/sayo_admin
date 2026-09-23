import { Prisma, PrismaClient } from "@prisma/client";
import { keySql, keyVal } from "./inventoryServer";
import { itemDetailExpiry, itemDetailExpiryLabel } from "./itemDetailStock";

export type Db = Prisma.TransactionClient | PrismaClient;

const NO_EXPIRY_YEAR = 1900;

async function tableExists(db: Db, name: string): Promise<boolean> {
  try {
    const r = await db.$queryRaw<{ n: number | bigint }[]>`
      SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`;
    return Number(r[0]?.n || 0) > 0;
  } catch {
    return false;
  }
}

function round3(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

export interface BatchRow {
  expiry: Date;
  qty: number;
}

/**
 * The batches of one item at one location, in the order stock should leave:
 * real expiry dates first (nearest expiry first), the no-expiry bucket last.
 * Callers run this inside a transaction; rows are locked FOR UPDATE.
 */
export async function readBatches(
  db: Db,
  locCode: string,
  itemCode: string,
  forUpdate = false,
): Promise<BatchRow[]> {
  const loc = String(locCode ?? "").trim();
  const code = String(itemCode ?? "").trim();
  if (!loc || !code) return [];
  if (!(await tableExists(db, "tbl_itemdetail"))) return [];
  const rows = await db.$queryRawUnsafe<{ ExpiryDate: Date; ItemQty: number }[]>(
    `SELECT ExpiryDate, ItemQty
       FROM tbl_itemdetail
      WHERE RTRIM(LocCode) = ?
        AND RTRIM(ItemCode) = ?
      ORDER BY CASE WHEN YEAR(ExpiryDate) <= ${NO_EXPIRY_YEAR} THEN 1 ELSE 0 END,
               ExpiryDate ASC
      ${forUpdate ? "FOR UPDATE" : ""}`,
    loc,
    code,
  );
  return rows.map((r) => ({ expiry: itemDetailExpiry(r.ExpiryDate), qty: round3(r.ItemQty) }));
}

/** Update one batch row to a new quantity. */
async function writeBatch(db: Db, locCode: string, itemCode: string, expiry: Date, qty: number): Promise<void> {
  await db.$executeRaw`
    UPDATE tbl_itemdetail
       SET ItemQty = ${qty}
     WHERE ${keySql("LocCode")} = ${keyVal(locCode)}
       AND ${keySql("ItemCode")} = ${keyVal(itemCode)}
       AND ${keySql("ExpiryDate")} = ${expiry}
  `;
}

/** Insert-or-add into a batch bucket. */
async function upsertBatchQty(db: Db, locCode: string, itemCode: string, expiry: Date, qty: number): Promise<void> {
  const changed = await db.$executeRaw`
    UPDATE tbl_itemdetail
       SET ItemQty = ItemQty + ${qty}
     WHERE ${keySql("LocCode")} = ${keyVal(locCode)}
       AND ${keySql("ItemCode")} = ${keyVal(itemCode)}
       AND ${keySql("ExpiryDate")} = ${expiry}
  `;
  if (Number(changed) === 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO tbl_itemdetail (LocCode, ItemCode, ExpiryDate, ItemQty)
       VALUES (?, ?, ?, ?)`,
      String(locCode).padEnd(10, " "),
      String(itemCode).padEnd(15, " "),
      itemDetailExpiry(expiry),
      qty,
    );
  }
}

/**
 * Take qty OUT of the batches, first-in-first-out by expiry date.
 * If the batches hold less than what is leaving, the shortage stays on the
 * last batch used (negative), so SUM(tbl_itemdetail.ItemQty) keeps matching
 * tbl_itemmaster.StockBalance instead of silently clipping.
 * Returns log words like "−5 from 2027-01-31".
 */
export async function reduceBatchesFIFO(
  db: Db,
  locCode: string,
  itemCode: string,
  qty: number,
): Promise<string[]> {
  const amount = round3(qty);
  if (!(amount > 0)) return [];
  if (!(await tableExists(db, "tbl_itemdetail"))) return [];

  const rows = await readBatches(db, locCode, itemCode, true);
  const words: string[] = [];
  let remain = amount;

  for (const row of rows) {
    if (remain <= 0) break;
    if (row.qty <= 0) continue;
    const take = round3(Math.min(row.qty, remain));
    await writeBatch(db, locCode, itemCode, row.expiry, round3(row.qty - take));
    remain = round3(remain - take);
    words.push(`−${take} from ${itemDetailExpiryLabel(row.expiry)}`);
  }

  if (remain > 0) {
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      await writeBatch(db, locCode, itemCode, last.expiry, round3(last.qty - remain));
    } else {
      await upsertBatchQty(db, locCode, itemCode, itemDetailExpiry(null), -remain);
    }
    words.push(`−${remain} from ${itemDetailExpiryLabel(rows[rows.length - 1]?.expiry ?? null)} (shortage)`);
  }
  return words;
}

/**
 * Put qty INTO a batch: the exact expiry bucket when one is supplied,
 * otherwise the bucket with the latest real expiry date, otherwise the
 * no-expiry bucket. Returns log words like "+5 into 2027-01-31".
 */
export async function addBatch(
  db: Db,
  locCode: string,
  itemCode: string,
  qty: number,
  expiry?: Date | string | null,
): Promise<string[]> {
  const amount = round3(qty);
  if (!(amount !== 0)) return [];
  if (!(await tableExists(db, "tbl_itemdetail"))) return [];

  let target = expiry ? itemDetailExpiry(expiry) : null;
  if (!target) {
    const rows = await readBatches(db, locCode, itemCode, true);
    const real = rows.filter((r) => r.expiry.getUTCFullYear() > NO_EXPIRY_YEAR);
    target = real.length ? real[real.length - 1].expiry : rows[0]?.expiry ?? itemDetailExpiry(null);
  }
  await upsertBatchQty(db, locCode, itemCode, target, amount);
  return [`${amount < 0 ? "" : "+"}${amount} into ${itemDetailExpiryLabel(target)}`];
}

/**
 * Force the batches to add up to the given total (the stock-recon flow):
 * too much in the batches comes out FIFO, too little goes into the latest
 * batch. Returns the log words of what changed, [] when already matching.
 */
export async function adjustBatchesToTotal(
  db: Db,
  locCode: string,
  itemCode: string,
  targetTotal: number,
): Promise<string[]> {
  if (!(await tableExists(db, "tbl_itemdetail"))) return [];
  const sumRows = await db.$queryRawUnsafe<{ s: number | null }[]>(
    `SELECT SUM(ItemQty) AS s FROM tbl_itemdetail WHERE RTRIM(LocCode) = ? AND RTRIM(ItemCode) = ?`,
    String(locCode).trim(),
    String(itemCode).trim(),
  );
  const current = round3(sumRows[0]?.s ?? 0);
  const diff = round3(Number(targetTotal || 0) - current);
  if (Math.abs(diff) < 1e-9) return [];
  return diff < 0 ? reduceBatchesFIFO(db, locCode, itemCode, -diff) : addBatch(db, locCode, itemCode, diff);
}
