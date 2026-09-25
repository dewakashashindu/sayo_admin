import { Prisma } from "@prisma/client";
import { stockAsItIsDelta } from "./stockAsItIs";
import { keySql, keyVal } from "./inventoryServer";
import { reduceBatchesFIFO, addBatch } from "./itemDetailBatches";
import { insertStockTxn } from "./stockTxnWriter";

export type Db = Prisma.TransactionClient | any;

export interface IssuePostingLine {
  itemCode: string;
  qty: number; // Issued QTY (> 0)
}

export interface IssuePostingResult {
  moved: number;         // how many lines moved stock
  takenFully: boolean;   // the requisition is now fully issued
}

/**
 * Stock posting for a confirmed Issue Note. Unlike the transfer chain the
 * requisition and the note keep the SAME From/To orientation (the stock
 * physically moves From -> To), so no location swap is applied here.
 *
 * Per line: "IO" (-qty) at FromLoc, "II" (+qty) at ToLoc, FIFO batches follow,
 * a stocktxn row each side, and IssuedQTY accumulates on tbl_issuereqdetail.
 * TakenForIssue flips to '1' once every requested unit has been issued.
 */
export async function postIssueConfirmation(
  db: Db,
  opts: {
    inNo: string;
    fromLoc: string;
    toLoc: string;
    irNo: string;
    lines: IssuePostingLine[];
    sysSerialId: number;
    userId: string;
    remarks?: string;
  },
): Promise<IssuePostingResult> {
  const inNo = String(opts.inNo ?? "").trim();
  const fromLoc = String(opts.fromLoc ?? "").trim();
  const toLoc = String(opts.toLoc ?? "").trim();
  const irNo = String(opts.irNo ?? "").trim();
  const userId = String(opts.userId ?? "0").trim() || "0";
  const sysId = Number(opts.sysSerialId ?? 0);
  const note = String(opts.remarks ?? `Issue Note ${inNo}`).slice(0, 200);

  let moved = 0;
  for (const line of opts.lines) {
    const code = String(line.itemCode ?? "").trim();
    const qty = Number(line.qty || 0);
    if (!code || !(qty > 0)) continue;

    // stock leaves the issuing location (IO) and lands at the receiving one (II)
    const outRes = await stockAsItIsDelta(db, fromLoc, code, inNo, "IO", -qty, sysId, userId, note);
    const inRes = await stockAsItIsDelta(db, toLoc, code, inNo, "II", qty, sysId, userId, note);
    await reduceBatchesFIFO(db, fromLoc, code, qty);
    await addBatch(db, toLoc, code, qty);
    try {
      const txnDate = new Date();
      await insertStockTxn(db, { locCode: fromLoc, itemCode: code, txnType: "IO", refNo: inNo, txnDate, qtyIn: 0, qtyOut: qty, balance: outRes.last, userId, remarks: note });
      await insertStockTxn(db, { locCode: toLoc, itemCode: code, txnType: "II", refNo: inNo, txnDate, qtyIn: qty, qtyOut: 0, balance: inRes.last, userId, remarks: note });
    } catch {}

    // accumulate IssuedQTY on the requisition — same From/To order as the note
    if (irNo) {
      await db.$executeRaw`
        UPDATE tbl_issuereqdetail
        SET IssuedQTY = IFNULL(IssuedQTY, 0) + ${qty}
        WHERE ${keySql("ItemCode")}=${keyVal(code)}
          AND ${keySql("IRNo")}=${keyVal(irNo)}
          AND ${keySql("FromLocCode")}=${keyVal(fromLoc)}
          AND ${keySql("ToLoc")}=${keyVal(toLoc)}
      `;
    }
    moved += 1;
  }

  // TakenForIssue = '1' only once EVERY requested unit has been issued
  let takenFully = false;
  if (irNo) {
    const done = await db.$executeRaw`
      UPDATE tbl_issuereqheder h
      SET h.TakenForIssue = '1'
      WHERE ${keySql("h.IRNO")}=${keyVal(irNo)}
        AND ${keySql("h.FromLocCode")}=${keyVal(fromLoc)}
        AND ${keySql("h.ToLoc")}=${keyVal(toLoc)}
        AND NOT EXISTS (
          SELECT 1 FROM tbl_issuereqdetail d
          WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")}
            AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")}
            AND ${keySql("d.IRNo")}=${keySql("h.IRNO")}
            AND IFNULL(d.IRQty, 0) <> IFNULL(d.IssuedQTY, 0)
        )
    `;
    takenFully = Number(done) > 0;
  }

  return { moved, takenFully };
}
