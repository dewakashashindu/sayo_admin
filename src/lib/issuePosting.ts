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
 * SENDER side — runs the moment an Issue Note is SAVED: the stock leaves the
 * issuing location immediately ("IO"), FIFO batches shrink there, the ledger
 * rows are written, and IssuedQTY accumulates on the requisition. The receiver
 * does NOT get the stock yet — that only happens in postIssueIn (receiver's
 * receipt confirmation).
 */
export async function postIssueOut(
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

    // stock physically leaves the issuing location now
    const outRes = await stockAsItIsDelta(db, fromLoc, code, inNo, "IO", -qty, sysId, userId, note);
    await reduceBatchesFIFO(db, fromLoc, code, qty);
    try {
      await insertStockTxn(db, { locCode: fromLoc, itemCode: code, txnType: "IO", refNo: inNo, txnDate: new Date(), qtyIn: 0, qtyOut: qty, balance: outRes.last, userId, remarks: note });
    } catch {}

    // the requisition has now been issued this much (delivery still pending)
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

/**
 * UNDO of postIssueOut — runs when an unconfirmed (not yet received) Issue Note
 * is deleted: the issued quantity goes back to the sender, the requisition's
 * IssuedQTY shrinks again, and TakenForIssue re-opens.
 */
export async function postIssueOutReversal(
  db: Db,
  opts: {
    inNo: string;
    fromLoc: string;
    toLoc: string;
    irNo: string;
    lines: IssuePostingLine[];
    sysSerialId: number;
    userId: string;
  },
): Promise<{ moved: number }> {
  const inNo = String(opts.inNo ?? "").trim();
  const fromLoc = String(opts.fromLoc ?? "").trim();
  const toLoc = String(opts.toLoc ?? "").trim();
  const irNo = String(opts.irNo ?? "").trim();
  const userId = String(opts.userId ?? "0").trim() || "0";
  const sysId = Number(opts.sysSerialId ?? 0);
  const note = `Issue Note ${inNo} deleted - stock given back`.slice(0, 200);

  let moved = 0;
  for (const line of opts.lines) {
    const code = String(line.itemCode ?? "").trim();
    const qty = Number(line.qty || 0);
    if (!code || !(qty > 0)) continue;

    const backRes = await stockAsItIsDelta(db, fromLoc, code, inNo, "IO", qty, sysId, userId, note);
    await addBatch(db, fromLoc, code, qty);
    try {
      await insertStockTxn(db, { locCode: fromLoc, itemCode: code, txnType: "IO", refNo: inNo, txnDate: new Date(), qtyIn: qty, qtyOut: 0, balance: backRes.last, userId, remarks: note });
    } catch {}

    if (irNo) {
      await db.$executeRaw`
        UPDATE tbl_issuereqdetail
        SET IssuedQTY = GREATEST(IFNULL(IssuedQTY, 0) - ${qty}, 0)
        WHERE ${keySql("ItemCode")}=${keyVal(code)}
          AND ${keySql("IRNo")}=${keyVal(irNo)}
          AND ${keySql("FromLocCode")}=${keyVal(fromLoc)}
          AND ${keySql("ToLoc")}=${keyVal(toLoc)}
      `;
    }
    moved += 1;
  }

  if (irNo) {
    await db.$executeRaw`
      UPDATE tbl_issuereqheder h
      SET h.TakenForIssue = '0'
      WHERE ${keySql("h.IRNO")}=${keyVal(irNo)}
        AND ${keySql("h.FromLocCode")}=${keyVal(fromLoc)}
        AND ${keySql("h.ToLoc")}=${keyVal(toLoc)}
        AND EXISTS (
          SELECT 1 FROM tbl_issuereqdetail d
          WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")}
            AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")}
            AND ${keySql("d.IRNo")}=${keySql("h.IRNO")}
            AND IFNULL(d.IRQty, 0) <> IFNULL(d.IssuedQTY, 0)
        )
    `;
  }
  return { moved };
}

/**
 * RECEIVER side — runs when the receiving location CONFIRMS the Issue Note:
 * the stock lands there ("II"), a batch row is added, and the ledger is
 * written. The sender's stock already left when the note was saved, so only
 * this in-leg happens here.
 */
export async function postIssueIn(
  db: Db,
  opts: {
    inNo: string;
    fromLoc: string;
    toLoc: string;
    lines: IssuePostingLine[];
    sysSerialId: number;
    userId: string;
    remarks?: string;
  },
): Promise<{ moved: number }> {
  const inNo = String(opts.inNo ?? "").trim();
  const toLoc = String(opts.toLoc ?? "").trim();
  const userId = String(opts.userId ?? "0").trim() || "0";
  const sysId = Number(opts.sysSerialId ?? 0);
  const note = String(opts.remarks ?? `Issue Note ${inNo} received`).slice(0, 200);

  let moved = 0;
  for (const line of opts.lines) {
    const code = String(line.itemCode ?? "").trim();
    const qty = Number(line.qty || 0);
    if (!code || !(qty > 0)) continue;

    const inRes = await stockAsItIsDelta(db, toLoc, code, inNo, "II", qty, sysId, userId, note);
    await addBatch(db, toLoc, code, qty);
    try {
      await insertStockTxn(db, { locCode: toLoc, itemCode: code, txnType: "II", refNo: inNo, txnDate: new Date(), qtyIn: qty, qtyOut: 0, balance: inRes.last, userId, remarks: note });
    } catch {}
    moved += 1;
  }
  return { moved };
}
