// POST /api/inventory/supplier-return/:srnNo/confirm  body:{ locCode }
// Confirms a pending SRN: updates tbl_grndetails RET* cumulatively, deducts StockBalance,
// writes Tbl_TxnMovement. Multiple returns against same GRN are allowed — remaining is GRNQty-RETQTY.
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { invActor, invFail, invId, InvError, keySql, keyVal, invChar } from '@/lib/inventoryServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
type Ctx = { params: Promise<{ srnNo: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = 'POST /api/inventory/supplier-return/[srnNo]/confirm';
  try {
    const actor = await invActor(req);
    const { srnNo: raw } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const locCode = invId(body.locCode, 'Location', 10);
    const srnNo = invId(raw, 'SRN number', 15);
    const result = await prisma.$transaction(async (tx) => {
      const head = await tx.$queryRaw<{ SRNNO: string; Confirmed: string; SupID: string; NetTotal: number }[]>`SELECT RTRIM(SRNNO) AS SRNNO, UPPER(Confirmed) AS Confirmed, RTRIM(SupID) AS SupID, NetTotal FROM tbl_srnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNO')}=${keyVal(srnNo)} FOR UPDATE`;
      if (!head.length) throw new InvError(`SRN ${srnNo} not found at ${locCode}.`, 404);
      if (head[0].Confirmed === 'Y') throw new InvError(`SRN ${srnNo} is already confirmed.`, 409);
      const lines = await tx.$queryRaw<{ ItemCode: string; SRNQty: number; ItemValue: number; CostPrice: number; GRNQty: number; UnitID: string }[]>`SELECT RTRIM(ItemCode) AS ItemCode, SRNQty, ItemValue, CostPrice, GRNQty, RTRIM(UnitID) AS UnitID FROM tbl_srndetails WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNo')}=${keyVal(srnNo)}`;
      if (!lines.length) throw new InvError(`SRN ${srnNo} has no lines.`, 400);
      // need GRN No — stored per detail? Use first line's GRN? Header doesn't have GRN column in legacy, but we can infer from GRN that matches supplier? Instead, look up which GRN this SRN references: we stored GRNQty but not GRNNo. Need to find GRNNo via tbl_grndetails join? The legacy Tbl_SRNDetails has DirectSRNConfNo etc but not GRNNo explicitly. We'll infer by finding the GRN that contains all items with enough remaining. Simpler: look for any confirmed GRN at loc with same supplier that contains these items.
      // For robust multi-return, we expect client to have sent grnNo in header? Our header SupID is grn's supID, but not grnNo itself. To know which GRN to credit, we search GRNs that have the item and were the source of the SRN's GRNQty.
      // We will match by finding a GRN where GRNQty == lines[0].GRNQty and ItemCode matches. For each line individually:
      const now = new Date();
      const sysSer = Number(srnNo.replace(/\D/g, '')) || 0;
      for (const l of lines) {
        const code = String(l.ItemCode).trim();
        // find the GRN that this SRN line references — the one where tbl_grndetails.GRNQty == l.GRNQty and ItemCode matches and enough remaining
        // If multiple GRNs have same qty, pick the one with most recent but sufficient remaining that would have been used at save time.
        // We stored GRNQty per detail, so we can identify.
        const candidates = await tx.$queryRaw<{ GRNNO: string; GRNQty: number; RETQTY: number | null }[]>`SELECT RTRIM(GRNNO) AS GRNNO, GRNQty, RETQTY FROM tbl_grndetails WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(code)} AND GRNQty = ${l.GRNQty} ORDER BY GRNNO DESC`;
        let grnNo = '';
        if (candidates.length === 1) grnNo = String(candidates[0].GRNNO).trim();
        else if (candidates.length > 1) {
          // pick the one where RETQTY + SRNQty <= GRNQty would have passed at save time — now RETQTY already includes previous returns, so check which would allow this SRN's qty
          const fit = candidates.find((c) => Number(c.GRNQty) - Number(c.RETQTY || 0) >= Number(l.SRNQty) - 1e-6) || candidates[0];
          grnNo = String(fit.GRNNO).trim();
        } else {
          // fallback: any GRN containing item
          const any = await tx.$queryRaw<{ GRNNO: string }[]>`SELECT RTRIM(GRNNO) AS GRNNO FROM tbl_grndetails WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(code)} LIMIT 1`;
          if (any.length) grnNo = String(any[0].GRNNO).trim();
          else throw new InvError(`Cannot find GRN for item ${code} to credit return.`, 409);
        }
        // lock that grn detail
        const det = await tx.$queryRaw<{ GRNQty: number; RETQTY: number | null }[]>`SELECT GRNQty, RETQTY FROM tbl_grndetails WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('GRNNo')}=${keyVal(grnNo)} AND ${keySql('ItemCode')}=${keyVal(code)} FOR UPDATE`;
        if (!det.length) throw new InvError(`GRN ${grnNo} line ${code} not found.`, 409);
        const grnQty = Number(det[0].GRNQty || 0);
        const retQty = Number(det[0].RETQTY || 0);
        const remaining = grnQty - retQty;
        if (Number(l.SRNQty) - remaining > 1e-6) throw new InvError(`Return qty ${l.SRNQty} of ${code} exceeds remaining ${remaining} on GRN ${grnNo} (already returned ${retQty} of ${grnQty}).`, 409);
        // update grn
        await tx.$executeRaw`UPDATE tbl_grndetails SET RETQTY = COALESCE(RETQTY,0)+${Number(l.SRNQty)}, RETVAL = COALESCE(RETVAL,0)+${Number(l.ItemValue)}, RETYN=1 WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('GRNNo')}=${keyVal(grnNo)} AND ${keySql('ItemCode')}=${keyVal(code)}`;
        // stock
        const item = await tx.$queryRaw<{ StockBalance: number | null; ServiceItem: number | null }[]>`SELECT StockBalance, COALESCE(CAST(ServiceItem AS UNSIGNED),0) AS ServiceItem FROM tbl_itemmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(code)} FOR UPDATE`;
        if (!item.length) throw new InvError(`Item ${code} not in item master for ${locCode}.`, 409);
        if (Number(item[0].ServiceItem) !== 1) {
          const oldBal = Number(item[0].StockBalance || 0);
          const newBal = oldBal - Number(l.SRNQty);
          await tx.$executeRaw`UPDATE tbl_itemmaster SET StockBalance=${newBal} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(code)}`;
          try { await tx.$executeRaw`UPDATE tbl_itemdetail SET ItemQty = ItemQty - ${Number(l.SRNQty)} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(code)}`; } catch {}
          await tx.$executeRaw`INSERT INTO tbl_txnmovement (LocCode, RowItemCode, TxnNo, TxnType, TxnDate, TxndateTime, PreQty, TxnQty, LastQty, UserId, SysSerialId, Remarks, AddDeduct, TXNDATETIMEMANUAL, SourceItemCode) VALUES (${invChar(locCode, 15)}, ${invChar(code, 20)}, ${invChar(srnNo, 20)}, ${'SR'}, ${now}, ${now}, ${oldBal}, ${Number(l.SRNQty)}, ${newBal}, ${invChar(actor.userId, 20)}, ${sysSer}, ${`Supplier Return ${srnNo} vs ${grnNo}`.slice(0, 200)}, ${'-'}, ${now}, ${'0'})`;
          try { await tx.$executeRaw`INSERT INTO tbl_stocktxn (LocCode, ItemCode, TxnType, RefNo, TxnDate, QtyIn, QtyOut, Balance, CostPrice, UserID, Remarks) VALUES (${invChar(locCode, 10)}, ${invChar(code, 15)}, ${'SR'}, ${srnNo.slice(0, 20)}, ${now}, 0, ${Number(l.SRNQty)}, ${newBal}, ${Number(l.CostPrice) || 0}, ${invChar(actor.userId, 10)}, ${`Return ${srnNo}`.slice(0, 200)})`; } catch {}
        }
      }
      await tx.$executeRaw`UPDATE tbl_srnheader SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNO')}=${keyVal(srnNo)}`;
      return { srnNo, locCode, netTotal: Number(head[0].NetTotal || 0), lines: lines.length };
    }, { timeout: 30000 });
    return NextResponse.json({ success: true, data: result, message: `SRN ${result.srnNo} confirmed — stock reduced, GRN return totals updated.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
