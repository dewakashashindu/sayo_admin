import { Prisma } from "@prisma/client";
import { stockAsItIsDelta } from "./stockAsItIs";
import { keySql, keyVal } from "./inventoryServer";
import { reduceBatchesFIFO, addBatch } from "./itemDetailBatches";
import { insertStockTxn } from "./stockTxnWriter";

export type Db = Prisma.TransactionClient | any;

export interface PostingLine {
  itemCode: string;
  qty: number; // Transferred / Returned QTY (> 0)
}

export interface PostingResult {
  moved: number;         // how many lines moved stock
  takenFully: boolean;   // the source document is now fully consumed
}

export async function postNoteConfirmation(
  db: Db,
  opts: {
    tranNo: string;
    fromLoc: string;
    toLoc: string;
    tReqNo: string;
    lines: PostingLine[];
    sysSerialId: number;
    userId: string;
    remarks?: string;
  },
): Promise<PostingResult> {
  const tranNo = String(opts.tranNo ?? "").trim();
  const fromLoc = String(opts.fromLoc ?? "").trim();
  const toLoc = String(opts.toLoc ?? "").trim();
  const tReqNo = String(opts.tReqNo ?? "").trim();
  const userId = String(opts.userId ?? "0").trim() || "0";
  const sysId = Number(opts.sysSerialId ?? 0);
  const note = String(opts.remarks ?? `Transfer Note ${tranNo}`).slice(0, 200);

  let moved = 0;
  for (const line of opts.lines) {
    const code = String(line.itemCode ?? "").trim();
    const qty = Number(line.qty || 0);
    if (!code || !(qty > 0)) continue; // VB: If CDbl(Transferred QTY) > 0 Then

    // 2. stock leaves the issuing location (TO) and lands at the receiving one (TI)
    const outRes = await stockAsItIsDelta(db, fromLoc, code, tranNo, "TO", -qty, sysId, userId, note);
    const inRes = await stockAsItIsDelta(db, toLoc, code, tranNo, "TI", qty, sysId, userId, note);
    await reduceBatchesFIFO(db, fromLoc, code, qty);
    await addBatch(db, toLoc, code, qty);
    try {
      const txnDate = new Date();
      await insertStockTxn(db, { locCode: fromLoc, itemCode: code, txnType: "TO", refNo: tranNo, txnDate, qtyIn: 0, qtyOut: qty, balance: outRes.last, userId, remarks: note });
      await insertStockTxn(db, { locCode: toLoc, itemCode: code, txnType: "TI", refNo: tranNo, txnDate, qtyIn: qty, qtyOut: 0, balance: inRes.last, userId, remarks: note });
    } catch {}

    // 1. accumulate IssuedQTY on the requisition, in the requisition's own key order
    if (tReqNo) {
      await db.$executeRaw`
        UPDATE tbl_transferreqdetail
        SET IssuedQTY = IFNULL(IssuedQTY, 0) + ${qty}
        WHERE ${keySql("ItemCode")}=${keyVal(code)}
          AND ${keySql("TRNo")}=${keyVal(tReqNo)}
          AND ${keySql("FromLocCode")}=${keyVal(toLoc)}
          AND ${keySql("ToLoc")}=${keyVal(fromLoc)}
      `;
    }
    moved += 1;
  }

  // 3. TakenForTransfer = '1' only once EVERY requested unit has been issued
  let takenFully = false;
  if (tReqNo) {
    const done = await db.$executeRaw`
      UPDATE tbl_transferreqheder h
      SET h.TakenForTransfer = '1'
      WHERE ${keySql("h.TRNO")}=${keyVal(tReqNo)}
        AND ${keySql("h.FromLocCode")}=${keyVal(toLoc)}
        AND ${keySql("h.ToLoc")}=${keyVal(fromLoc)}
        AND NOT EXISTS (
          SELECT 1 FROM tbl_transferreqdetail d
          WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")}
            AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")}
            AND ${keySql("d.TRNo")}=${keySql("h.TRNO")}
            AND IFNULL(d.TRQty, 0) <> IFNULL(d.IssuedQTY, 0)
        )
    `;
    takenFully = Number(done) > 0;
  }

  return { moved, takenFully };
}

export async function postReturnConfirmation(
  db: Db,
  opts: {
    trtnNo: string;
    fromLoc: string;
    toLoc: string;
    tnNo: string;
    lines: PostingLine[];
    sysSerialId: number;
    userId: string;
    remarks?: string;
  },
): Promise<PostingResult> {
  const trtnNo = String(opts.trtnNo ?? "").trim();
  const fromLoc = String(opts.fromLoc ?? "").trim(); // goods leave here (note's To)
  const toLoc = String(opts.toLoc ?? "").trim();     // and land back here (note's From)
  const tnNo = String(opts.tnNo ?? "").trim();
  const userId = String(opts.userId ?? "0").trim() || "0";
  const sysId = Number(opts.sysSerialId ?? 0);
  const note = String(opts.remarks ?? `Transfer Return ${trtnNo}`).slice(0, 200);

  let moved = 0;
  for (const line of opts.lines) {
    const code = String(line.itemCode ?? "").trim();
    const qty = Number(line.qty || 0);
    if (!code || !(qty > 0)) continue; // VB: If CDbl(Returned QTY) > 0 Then

    const rOutRes = await stockAsItIsDelta(db, fromLoc, code, trtnNo, "TRTO", -qty, sysId, userId, note);
    const rInRes = await stockAsItIsDelta(db, toLoc, code, trtnNo, "TRTI", qty, sysId, userId, note);
    await reduceBatchesFIFO(db, fromLoc, code, qty);
    await addBatch(db, toLoc, code, qty);
    try {
      const txnDate = new Date();
      await insertStockTxn(db, { locCode: fromLoc, itemCode: code, txnType: "TRTO", refNo: trtnNo, txnDate, qtyIn: 0, qtyOut: qty, balance: rOutRes.last, userId, remarks: note });
      await insertStockTxn(db, { locCode: toLoc, itemCode: code, txnType: "TRTI", refNo: trtnNo, txnDate, qtyIn: qty, qtyOut: 0, balance: rInRes.last, userId, remarks: note });
    } catch {}

    if (tnNo) {
      await db.$executeRaw`
        UPDATE tbl_transfernotedetail
        SET TranRtnQTY = IFNULL(TranRtnQTY, 0) + ${qty}
        WHERE ${keySql("ItemCode")}=${keyVal(code)}
          AND ${keySql("TranNo")}=${keyVal(tnNo)}
          AND ${keySql("FromLocCode")}=${keyVal(toLoc)}
          AND ${keySql("ToLoc")}=${keyVal(fromLoc)}
      `;
    }
    moved += 1;
  }

  // TakenForTransferRtn = 1 once EVERY transferred unit has been returned
  let takenFully = false;
  if (tnNo) {
    const done = await db.$executeRaw`
      UPDATE tbl_transfernoteheader h
      SET h.TakenForTransferRtn = 1
      WHERE ${keySql("h.TranNo")}=${keyVal(tnNo)}
        AND ${keySql("h.FromLocCode")}=${keyVal(toLoc)}
        AND ${keySql("h.ToLoc")}=${keyVal(fromLoc)}
        AND NOT EXISTS (
          SELECT 1 FROM tbl_transfernotedetail d
          WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")}
            AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")}
            AND ${keySql("d.TranNo")}=${keySql("h.TranNo")}
            AND IFNULL(d.TranQty, 0) <> IFNULL(d.TranRtnQTY, 0)
        )
    `;
    takenFully = Number(done) > 0;
  }

  return { moved, takenFully };
}
