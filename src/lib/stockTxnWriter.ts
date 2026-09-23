import { invChar } from "./inventoryServer";
import type { Db } from "./itemDetailBatches";

export interface StockTxnLine {
  locCode: string;
  itemCode: string;
  txnType: string;   // GR / SR / DM / RC / TO / TI / TRTO / TRTI
  refNo: string;
  txnDate: Date;
  qtyIn: number;
  qtyOut: number;
  balance: number;   // balance after the move, at this location
  costPrice?: number;
  userId?: string;
  remarks?: string;
}

/**
 * One tbl_stocktxn ledger row — the same shape the GRN and SRN confirms
 * write. Mirrors a stock move recorded through stockAsItIs/stockAsItIsDelta.
 */
export async function insertStockTxn(db: Db, line: StockTxnLine): Promise<void> {
  await db.$executeRaw`
    INSERT INTO tbl_stocktxn
      (LocCode, ItemCode, TxnType, RefNo, TxnDate, QtyIn, QtyOut, Balance, CostPrice, UserID, Remarks)
    VALUES
      (${invChar(line.locCode, 10)}, ${invChar(line.itemCode, 15)},
       ${String(line.txnType).slice(0, 10)}, ${String(line.refNo).slice(0, 20)},
       ${line.txnDate}, ${Number(line.qtyIn) || 0}, ${Number(line.qtyOut) || 0},
       ${Number(line.balance) || 0}, ${Number(line.costPrice) || 0},
       ${invChar(line.userId ?? "0", 10)}, ${String(line.remarks ?? "").slice(0, 200)})
  `;
}
