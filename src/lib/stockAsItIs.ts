// src/lib/stockAsItIs.ts
// ─────────────────────────────────────────────────────────────────────────────
// VB6 frmStocks.StockAsItIs — galapenna widiyata MySQL
// Public Function StockAsItIs(strLocCode As String, strItmCode As String, strTxnNo As String, strTxnType As String, dblTxnQty As Double, dblSysSerNo As Double) As Boolean
//   rsItemDet.Open "Select * from Vu_RowItemMaster Where LocCode = '" & Trim(strLocCode) & "' And RowItemCode = '" & strItmCode & "' "
//   Insert Into Tbl_TxnMovement (LocCode,RowItemCode,TxnNo,TxnType,TxnDate,PreQty,TxnQty,LastQty,UserId,SysSerialId,Remarks,AddDeduct,TXNDATETIMEMANUAL)Values(strLocCode, strItmCode, strTxnNo, strTxnType, dtCurDate, rsItemDet![StkBal], dblTxnQty, dblTxnQty, strUserId, dblSysSerNo, '', '', dtCurdateTime)
//   Update Tbl_RowItems Set StkBal = dblTxnQty Where LocCode = Trim(strLocCode) And RowItemCode = Trim(strItmCode)
// See image-1.png
// In MySQL: Vu_RowItemMaster → tbl_itemmaster (StockBalance = StkBal), Tbl_RowItems → tbl_itemmaster
// All 5 docs use this same ledger: PO (no stock), GRN (+), SRN (-), Damage (-), Recon (set). AddDeduct '+' when LastQty>PreQty else '-'.
import { Prisma } from '@prisma/client';
import { InvError, keySql, keyVal, invChar } from './inventoryServer';

export type Db = Prisma.TransactionClient | any;

export interface StockAsItIsArgs {
  locCode: string;
  rowItemCode: string; // ItemCode
  txnNo: string;
  txnType: string; // GR, DG, SR, DM, RC, PO, etc
  txnQty: number; // dblTxnQty — the ABSOLUTE new StkBal (not delta). For GRN: old+in, for SRN: old-out, for Recon: phyQty
  sysSerialId: number; // dblSysSerNo — SysSerialNo from header
  userId: string;
  remarks?: string;
  addDeduct?: string; // '+'/'-' — auto if not given (LastQty>PreQty ? '+' : '-')
  txnDate?: Date; // dtCurDate — default now
  txnDateTimeManual?: Date; // dtCurdateTime — default now
}

/**
 * Mirrors VB StockAsItIs — returns true on success.
 * Throws InvError "Invalid Item [...)" when item not in Vu_RowItemMaster for loc.
 * Writes one Tbl_TxnMovement row and sets tbl_itemmaster.StockBalance = txnQty in ONE call (caller must be inside transaction).
 */
export async function stockAsItIs(db: Db, args: StockAsItIsArgs): Promise<boolean> {
  const loc = String(args.locCode ?? '').trim();
  const code = String(args.rowItemCode ?? '').trim();
  const txnNo = String(args.txnNo ?? '').trim();
  const txnType = String(args.txnType ?? '').trim();
  if (!loc || !code || !txnNo || !txnType) throw new InvError('StockAsItIs: LocCode/RowItemCode/TxnNo/TxnType required');
  const txnQty = Number(args.txnQty);
  if (!Number.isFinite(txnQty)) throw new InvError(`StockAsItIs: txnQty is not a number for ${code}`);

  // Vu_RowItemMaster — in MySQL this is tbl_itemmaster (one row per Loc+Item, StkBal = StockBalance)
  // Use FOR UPDATE so second caller locks same item.
  const rows = await db.$queryRaw<{ StkBal: number | null }[]>`SELECT StockBalance AS StkBal FROM tbl_itemmaster WHERE ${keySql('LocCode')}=${keyVal(loc)} AND ${keySql('ItemCode')}=${keyVal(code)} FOR UPDATE`;
  if (rows.length === 0) {
    // VB: MsgBox "Invalid Item ['" & strItmCode & "') For The Location Of ('" & strLocCode & "')."
    throw new InvError(`Invalid Item ['${code}') For The Location Of ('${loc}').`, 409);
  }
  const preQty = Number(rows[0].StkBal ?? 0);
  const lastQty = txnQty;
  const txnDate = args.txnDate ?? new Date();
  const manual = args.txnDateTimeManual ?? new Date();
  const addDeduct = args.addDeduct ?? (lastQty > preQty ? '+' : lastQty < preQty ? '-' : '+');
  const remarks = String(args.remarks ?? '').slice(0, 200);
  const userId = String(args.userId ?? '0').trim() || '0';
  const sysId = Number(args.sysSerialId ?? 0);

  // VB Trap: On Error GoTo Trap → if Err.Number=354354 Resume SackTrap else MsgBox "Stock Adjestment Process." + Error
  try {
    await db.$executeRaw`INSERT INTO tbl_txnmovement (LocCode, RowItemCode, TxnNo, TxnType, TxnDate, TxndateTime, PreQty, TxnQty, LastQty, UserId, SysSerialId, Remarks, AddDeduct, TXNDATETIMEMANUAL, SourceItemCode) VALUES (${invChar(loc,15)}, ${invChar(code,20)}, ${invChar(txnNo,20)}, ${invChar(txnType,100)}, ${txnDate}, ${new Date()}, ${preQty}, ${txnQty}, ${lastQty}, ${invChar(userId,20)}, ${sysId}, ${remarks}, ${addDeduct}, ${manual}, ${'0'})`;
    await db.$executeRaw`UPDATE tbl_itemmaster SET StockBalance = ${lastQty} WHERE ${keySql('LocCode')}=${keyVal(loc)} AND ${keySql('ItemCode')}=${keyVal(code)}`;
  } catch (e: any) {
    const msg = String(e?.message || e);
    // galapena VB: Err.Number 354354 is user-cancel / already handled via SackTrap → treat as ok (return false)
    if (msg.includes('354354')) return false;
    throw new InvError(`Stock Adjestment Process. ${msg}`, 500);
  }

  return true;
}

/** Helper for GRN/Damage where stock moves by delta: new = old + delta */
export async function stockAsItIsDelta(db: Db, locCode: string, rowItemCode: string, txnNo: string, txnType: string, deltaQty: number, sysSerialId: number, userId: string, remarks?: string): Promise<{ pre: number; last: number }> {
  const loc = String(locCode).trim();
  const code = String(rowItemCode).trim();
  const rows = await db.$queryRaw<{ StkBal: number | null }[]>`SELECT StockBalance AS StkBal FROM tbl_itemmaster WHERE ${keySql('LocCode')}=${keyVal(loc)} AND ${keySql('ItemCode')}=${keyVal(code)} FOR UPDATE`;
  if (rows.length === 0) throw new InvError(`Invalid Item ['${code}') For The Location Of ('${loc}').`, 409);
  const pre = Number(rows[0].StkBal ?? 0);
  const last = pre + Number(deltaQty || 0);
  await stockAsItIs(db, { locCode: loc, rowItemCode: code, txnNo, txnType, txnQty: last, sysSerialId, userId, remarks, addDeduct: deltaQty >= 0 ? '+' : '-' });
  return { pre, last };
}
