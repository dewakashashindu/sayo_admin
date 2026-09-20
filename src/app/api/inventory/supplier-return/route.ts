// src/app/api/inventory/supplier-return/route.ts
// GET  /api/inventory/supplier-return?status=confirmed|pending|all&q=&locCode=&limit=300
// POST /api/inventory/supplier-return  body:{ locCode, grnNo, srnDate, supInvNo, remarks, lines:[{itemCode,unitID,costPrice,grnQty,returnQty}], confirm? }
// Implements cumulative returns: each SRN reduces tbl_grndetails.RETQTY/RETVAL/RETYN
// and on Confirmation deducts StockBalance and writes Tbl_TxnMovement — one Txn per SRN.
// Uses raw SQL so stale Prisma client still works.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { invActor, invFail, invId, InvError, keySql, keyVal, invChar, invDateField } from '@/lib/inventoryServer';
import { nextSerialTx } from '@/lib/serials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? '').trim();

// ── GET list ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = trim(sp.get('status')).toLowerCase();
    const q = trim(sp.get('q'));
    const locCode = trim(sp.get('locCode'));
    const limit = Math.min(Math.max(Number(sp.get('limit') || 300) || 300, 1), 500);
    const where: Prisma.Sql[] = [];
    if (locCode) where.push(Prisma.sql`AND ${keySql('h.LocCode')}=${keyVal(locCode)}`);
    if (status === 'confirmed') where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if (status === 'pending') where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if (q)
      where.push(Prisma.sql`AND (RTRIM(h.SRNNO) LIKE ${`%${q}%`} OR RTRIM(h.LocCode) LIKE ${`%${q}%`} OR s.SupName LIKE ${`%${q}%`} OR RTRIM(h.SupID) LIKE ${`%${q}%`})`);
    const rows = await prisma.$queryRaw<{ SRNNO: string; LocCode: string; SRNDate: Date; SupID: string; SupName: string | null; SupInvNo: string | null; TxnDate: Date | null; NetTotal: number; Confirmed: string; SRNTYPE: string; Remarks: string | null }[]>`
      SELECT RTRIM(h.SRNNO) AS SRNNO, RTRIM(h.LocCode) AS LocCode, h.SRNDate AS SRNDate,
             RTRIM(h.SupID) AS SupID, s.SupName AS SupName, h.SupInvNo AS SupInvNo,
             h.TxnDate AS TxnDate, h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed,
             RTRIM(h.SRNTYPE) AS SRNTYPE, h.Remarks AS Remarks
      FROM tbl_srnheader h LEFT JOIN tbl_suppliermaster s ON ${keySql('s.SupID')}=${keySql('h.SupID')}
      WHERE 1=1 ${where.length ? Prisma.join(where, ' ') : Prisma.empty}
      ORDER BY h.SRNDate DESC, h.SRNNO DESC
      LIMIT ${limit}`;
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        srnNo: trim(r.SRNNO),
        locCode: trim(r.LocCode),
        srnDate: r.SRNDate,
        supID: trim(r.SupID),
        supName: trim(r.SupName),
        supInvNo: trim(r.SupInvNo),
        txndate: r.TxnDate,
        netTotal: Number(r.NetTotal || 0),
        confirmed: trim(r.Confirmed) === 'Y',
        srnType: trim(r.SRNTYPE) || 'SR',
        remarks: trim(r.Remarks),
      })),
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/supplier-return');
  }
}

// ── POST save (optionally confirm) ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const tag = 'POST /api/inventory/supplier-return';
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as Record<string, unknown>;
    const locCodeRaw = invId(body.locCode, 'Location', 10);
    const grnNoRaw = invId(body.grnNo, 'GRN number', 15);
    const supInvNo = trim(body.supInvNo).slice(0, 20);
    const remarks = trim(body.remarks).slice(0, 400);
    const srnDate = body.srnDate ? invDateField(body.srnDate, 'SRN date') : new Date();
    const confirmNow = body.confirm === true || trim(body.confirm) === '1' || trim(body.confirm) === 'Y' || String(body.confirmed) === 'Y';
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError('Add at least one return line.');
    // normalise lines
    const lines = rawLines
      .filter((l) => l && trim(l.itemCode))
      .map((l) => ({
        itemCode: invId(trim(l.itemCode), 'Item code', 20),
        unitID: trim(l.unitID).slice(0, 15),
        costPrice: Number(l.costPrice) || 0,
        grnQty: Number(l.grnQty) || 0,
        returnQty: Number(l.returnQty ?? l.srnQty ?? 0),
      }))
      .filter((l) => l.returnQty > 0);
    if (lines.length === 0) throw new InvError('Enter at least one Return Qty > 0.');
    for (const l of lines) if (l.costPrice < 0) throw new InvError(`Cost price of ${l.itemCode} cannot be negative.`);

    const result = await prisma.$transaction(async (tx) => {
      // loc
      const locRows = await tx.$queryRaw<{ LocCode: string }[]>`SELECT RTRIM(LocCode) AS LocCode FROM tbl_locationmaster WHERE ${keySql('LocCode')}=${keyVal(locCodeRaw)} LIMIT 1`;
      if (!locRows.length) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);
      const locCode = trim(locRows[0].LocCode);
      // grn header — must exist and be confirmed
      const grnRows = await tx.$queryRaw<{ GRNNO: string; SupID: string; Confirmed: string }[]>`SELECT RTRIM(GRNNO) AS GRNNO, RTRIM(SupID) AS SupID, UPPER(Confirmed) AS Confirmed FROM tbl_grnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('GRNNO')}=${keyVal(grnNoRaw)} LIMIT 1`;
      if (!grnRows.length) throw new InvError(`GRN ${grnNoRaw} not found at ${locCode}.`, 404);
      if (trim(grnRows[0].Confirmed) !== 'Y') throw new InvError(`GRN ${grnNoRaw} is not yet confirmed — confirm the receipt first.`, 409);
      const grnSupID = trim(grnRows[0].SupID);
      // for each line, lock grn detail and check remaining
      const netPerLine: { itemCode: string; unitID: string; costPrice: number; returnQty: number; itemValue: number; grnQty: number; remaining: number }[] = [];
      let netTotal = 0;
      for (const l of lines) {
        const det = await tx.$queryRaw<{ GRNQty: number; RETQTY: number | null; RETVAL: number | null; UnitID: string | null }[]>`SELECT GRNQty, RETQTY, RETVAL, RTRIM(UnitID) AS UnitID FROM tbl_grndetails WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('GRNNo')}=${keyVal(grnNoRaw)} AND ${keySql('ItemCode')}=${keyVal(l.itemCode)} FOR UPDATE`;
        if (!det.length) throw new InvError(`Item ${l.itemCode} is not on GRN ${grnNoRaw}.`, 409);
        const grnQty = Number(det[0].GRNQty || 0);
        const retQty = Number(det[0].RETQTY || 0);
        const remaining = grnQty - retQty;
        // allow floating tolerance
        if (l.returnQty - remaining > 1e-6) throw new InvError(`Return qty ${l.returnQty} of ${l.itemCode} exceeds what is left on GRN ${grnNoRaw} (${remaining} of ${grnQty} — already returned ${retQty}).`, 409);
        const itemValue = (Number(l.costPrice) || 0) * l.returnQty;
        netTotal += itemValue;
        netPerLine.push({ itemCode: l.itemCode, unitID: l.unitID || trim(det[0].UnitID) || '', costPrice: Number(l.costPrice) || 0, returnQty: l.returnQty, itemValue, grnQty, remaining });
      }

      // next SRN number
      let srnNo = '';
      try {
        srnNo = await nextSerialTx(tx as any, 'SRN');
        if (!srnNo.toUpperCase().startsWith('SRN')) {
          // fallback when alias is 'SR' etc
          if (srnNo.toUpperCase().startsWith('SR')) { /* keep */ } else srnNo = `SRN${srnNo.replace(/\D/g, '').slice(-7)}`;
        }
      } catch {
        const maxRows = await tx.$queryRaw<{ m: string | null }[]>`SELECT MAX(RTRIM(SRNNO)) AS m FROM tbl_srnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)}`;
        const max = trim(maxRows[0]?.m) || 'SRN0000000';
        const n = (Number(max.replace(/\D/g, '')) || 0) + 1;
        srnNo = `SRN${String(n).padStart(7, '0')}`;
      }
      srnNo = srnNo.trim().toUpperCase().slice(0, 15);
      const sysSer = Number(srnNo.replace(/\D/g, '')) || 0;
      const now = new Date();

      // header
      await tx.$executeRaw`INSERT INTO tbl_srnheader (LocCode, SRNNO, SRNDate, SupID, SupInvNo, NetTotal, UserID, Remarks, TxnDate, SysSerialNo, Confirmed, ConUserID, ConDatetime, SRNTYPE) VALUES (${invChar(locCode, 10)}, ${invChar(srnNo, 15)}, ${srnDate}, ${invChar(grnSupID, 10)}, ${supInvNo}, ${netTotal}, ${invChar(actor.userId, 10)}, ${remarks}, ${now}, ${sysSer}, ${confirmNow ? 'Y' : 'N'}, ${invChar(confirmNow ? actor.userId : '', 10)}, ${now}, ${invChar('SR', 2)})`;

      // details
      for (const d of netPerLine) {
        await tx.$executeRaw`INSERT INTO tbl_srndetails (LocCode, SRNNo, ItemCode, UnitID, CostPrice, SRNQty, ItemValue, DirectSRNConfNo, GRNQty) VALUES (${invChar(locCode, 10)}, ${invChar(srnNo, 15)}, ${invChar(d.itemCode, 20)}, ${invChar(d.unitID, 15)}, ${d.costPrice}, ${d.returnQty}, ${d.itemValue}, ${''}, ${d.grnQty})`;
      }

      // confirm => update grn RET* + stock
      if (confirmNow) {
        for (const d of netPerLine) {
          // grn return tracking — cumulative, multiple SRNs allowed
          await tx.$executeRaw`UPDATE tbl_grndetails SET RETQTY = COALESCE(RETQTY,0)+${d.returnQty}, RETVAL = COALESCE(RETVAL,0)+${d.itemValue}, RETYN = 1 WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('GRNNo')}=${keyVal(grnNoRaw)} AND ${keySql('ItemCode')}=${keyVal(d.itemCode)}`;
          // stock deduct
          const itemRows = await tx.$queryRaw<{ StockBalance: number | null; ServiceItem: number | null }[]>`SELECT StockBalance, COALESCE(CAST(ServiceItem AS UNSIGNED),0) AS ServiceItem FROM tbl_itemmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(d.itemCode)} FOR UPDATE`;
          if (!itemRows.length) throw new InvError(`Item ${d.itemCode} not in item master for ${locCode}.`, 409);
          const isService = Number(itemRows[0].ServiceItem) === 1;
          if (!isService) {
            const oldBal = Number(itemRows[0].StockBalance || 0);
            const newBal = oldBal - d.returnQty;
            await tx.$executeRaw`UPDATE tbl_itemmaster SET StockBalance=${newBal} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(d.itemCode)}`;
            try { await tx.$executeRaw`UPDATE tbl_itemdetail SET ItemQty = ItemQty - ${d.returnQty} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(d.itemCode)}`; } catch {}
            await tx.$executeRaw`INSERT INTO tbl_txnmovement (LocCode, RowItemCode, TxnNo, TxnType, TxnDate, TxndateTime, PreQty, TxnQty, LastQty, UserId, SysSerialId, Remarks, AddDeduct, TXNDATETIMEMANUAL, SourceItemCode) VALUES (${invChar(locCode, 15)}, ${invChar(d.itemCode, 20)}, ${invChar(srnNo, 20)}, ${'SR'}, ${now}, ${now}, ${oldBal}, ${d.returnQty}, ${newBal}, ${invChar(actor.userId, 20)}, ${sysSer}, ${`Supplier Return ${srnNo} vs ${grnNoRaw}`.slice(0, 200)}, ${'-'}, ${now}, ${'0'})`;
            // also tbl_stocktxn if used by reports (optional)
            try { await tx.$executeRaw`INSERT INTO tbl_stocktxn (LocCode, ItemCode, TxnType, RefNo, TxnDate, QtyIn, QtyOut, Balance, CostPrice, UserID, Remarks) VALUES (${invChar(locCode, 10)}, ${invChar(d.itemCode, 15)}, ${'SR'}, ${srnNo.slice(0, 20)}, ${now}, 0, ${d.returnQty}, ${newBal}, ${d.costPrice}, ${invChar(actor.userId, 10)}, ${`Return to supplier ${srnNo}`.slice(0, 200)})`; } catch {}
          }
        }
      }

      return { srnNo, locCode, grnNo: grnNoRaw, netTotal, lines: netPerLine.length, confirmed: confirmNow };
    }, { timeout: 30000 });

    return NextResponse.json({ success: true, data: result, message: result.confirmed ? `SRN ${result.srnNo} confirmed — stock reduced and GRN updated` : `SRN ${result.srnNo} saved` });
  } catch (err) {
    return invFail(err, tag);
  }
}
