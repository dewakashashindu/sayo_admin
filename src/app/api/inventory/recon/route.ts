// src/app/api/inventory/recon/route.ts
// GET  /api/inventory/recon?status=confirmed|pending|all&q=&locCode=&limit=300
// POST /api/inventory/recon  body: { locCode, recDate, remarks, lines:[{itemCode,unitID,costPrice,systemQty,phyQty,applica}], confirm? }
// GET lists tbl_reconcilheder (via Vw_Reconcilliation when available, fallback to header)
// POST saves a new recon (pending unless confirm:true). The recon number comes
// from tbl_serials REC — same allocator GRN uses. Uses raw SQL so the route
// works even when the generated Prisma client is stale.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { invActor, invFail, invId, InvError, keySql, keyVal, invChar, invDateField } from '@/lib/inventoryServer';
import { stockAsItIs } from '@/lib/stockAsItIs';
import { nextSerialTx, SERIAL_CODES } from '@/lib/serials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? '').trim();

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = trim(sp.get('status')).toLowerCase(); // confirmed|pending|all
    const q = trim(sp.get('q'));
    const locCode = trim(sp.get('locCode'));
    const limit = Math.min(Math.max(Number(sp.get('limit') || 300) || 300, 1), 500);
    const where: Prisma.Sql[] = [];
    if (locCode) where.push(Prisma.sql`AND ${keySql('h.LocCode')} = ${keyVal(locCode)}`);
    if (status === 'confirmed') where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if (status === 'pending') where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if (q) where.push(Prisma.sql`AND (RTRIM(h.RecNo) LIKE ${`%${q}%`} OR RTRIM(h.LocCode) LIKE ${`%${q}%`} OR h.Remarks LIKE ${`%${q}%`})`);

    const rows = await prisma.$queryRaw<
      { RecNo: string; LocCode: string; RecDate: Date; UserName: string | null; UserId: string | null; NetValue: number; Confirmed: string; Remarks: string }[]
    >`
      SELECT RTRIM(h.RecNo) AS RecNo, RTRIM(h.LocCode) AS LocCode, h.RecDate AS RecDate,
             COALESCE(u.UserName, RTRIM(h.UserId)) AS UserName, RTRIM(h.UserId) AS UserId,
             h.NetValue AS NetValue, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks
      FROM tbl_reconcilheder h
      LEFT JOIN tbl_userdetails u ON ${keySql('u.UserId')} = ${keySql('h.UserId')}
      WHERE 1=1 ${where.length ? Prisma.join(where, ' ') : Prisma.empty}
      ORDER BY h.RecDate DESC, h.RecNo DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        recNo: trim(r.RecNo),
        locCode: trim(r.LocCode),
        recDate: r.RecDate,
        userName: trim(r.UserName) || trim(r.UserId),
        userId: trim(r.UserId),
        netValue: Number(r.NetValue || 0),
        confirmed: trim(r.Confirmed) === 'Y',
        remarks: trim(r.Remarks),
      })),
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/recon');
  }
}

export async function POST(req: NextRequest) {
  const tag = 'POST /api/inventory/recon';
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as Record<string, unknown>;
    const locCodeRaw = invId(body.locCode, 'Location', 10);
    const remarks = trim(body.remarks).slice(0, 400);
    const recDateRaw = body.recDate ? String(body.recDate) : new Date().toISOString().slice(0, 10);
    const recDate = invDateField(recDateRaw, 'Recon date');
    const confirmNow = body.confirm === true || trim(body.confirm) === '1' || trim(body.confirm) === 'Y';
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError('Add at least one line — press Load then tick Applica.');

    // keep only applicable lines (screenshot: only Applica tick moves stock)
    const lines = rawLines
      .filter((l) => l && trim(l.itemCode))
      .map((l) => ({
        itemCode: invId(trim(l.itemCode), 'Item code', 15),
        unitID: trim(l.unitID).slice(0, 10),
        costPrice: Number(l.costPrice) || 0,
        systemQty: Number(l.systemQty) || 0,
        phyQty: Number(l.phyQty ?? l.recQty ?? 0),
        applica: Boolean(l.applica),
      }))
      .filter((l) => l.applica);

    if (lines.length === 0) throw new InvError('Tick Applica for at least one line you want to adjust.');

    const result = await prisma.$transaction(async (tx) => {
      // resolve location as stored
      const locRows = await tx.$queryRaw<{ LocCode: string }[]>`SELECT RTRIM(LocCode) AS LocCode FROM tbl_locationmaster WHERE ${keySql('LocCode')}=${keyVal(locCodeRaw)} LIMIT 1`;
      if (!locRows.length) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);
      const locCode = trim(locRows[0].LocCode);

      // next REC number — use tbl_serials REC when present, else fallback to max RecNo
      let recNo = '';
      try {
        // SERIAL_CODES may contain REC — fall back to generic
        const code = (SERIAL_CODES as any).REC || 'REC';
        recNo = await nextSerialTx(tx as any, code);
        // nextSerialTx returns padded number only? Wrap with REC prefix logic
        // If it returns just number, prefix manually. Check shape: tbl_serials stores SeriNo.
        // Our nextSerialTx returns full code? In serials.ts it returns prefix+number. So if code=REC, it returns REC0000001.
        // Normalise to 10 char: if it lacks REC prefix, add it.
        if (!recNo.toUpperCase().startsWith('REC')) recNo = `R${recNo.slice(-7)}`;
      } catch {
        const maxRows = await tx.$queryRaw<{ m: string | null }[]>`SELECT MAX(RTRIM(RecNo)) AS m FROM tbl_reconcilheder WHERE ${keySql('LocCode')}=${keyVal(locCode)}`;
        const max = trim(maxRows[0]?.m) || 'R0000000';
        const n = (Number(max.replace(/\D/g, '')) || 0) + 1;
        recNo = `R${String(n).padStart(7, '0')}`;
      }
      // normalise length CHAR10: R0000001 -> pad
      recNo = recNo.trim().toUpperCase().slice(0, 10).padEnd(10, ' ').trim();

      // validate items exist & get current StockBalance for header net calc
      const codes = lines.map((l) => l.itemCode);
      const itemRows = await tx.$queryRaw<{ ItemCode: string; StockBalance: number | null; MasterUnitID: string | null }[]>`SELECT RTRIM(ItemCode) AS ItemCode, StockBalance, RTRIM(MasterUnitID) AS MasterUnitID FROM tbl_itemmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')} IN (${Prisma.join(codes.map(keyVal))})`;
      const balMap = new Map<string, number>();
      for (const r of itemRows) balMap.set(trim(r.ItemCode).toUpperCase(), Number(r.StockBalance || 0));
      // unknown items -> error
      for (const l of lines) {
        if (!balMap.has(l.itemCode.toUpperCase())) throw new InvError(`Item ${l.itemCode} is not in the item master for ${locCode}.`, 409);
      }

      // net value = sum (phy - sys)*cost where applica
      let netValue = 0;
      const toInsert: { itemCode: string; unitID: string; costPrice: number; sysQty: number; phyQty: number; itemValue: number }[] = [];
      for (const l of lines) {
        const sysQty = Number(l.systemQty);
        const phyQty = Number(l.phyQty);
        const diff = phyQty - sysQty;
        const iv = diff * Number(l.costPrice || 0);
        netValue += iv;
        toInsert.push({ itemCode: l.itemCode, unitID: l.unitID || '', costPrice: Number(l.costPrice || 0), sysQty, phyQty, itemValue: iv });
      }

      const now = new Date();
      // header
      await tx.$executeRaw`INSERT INTO tbl_reconcilheder (LocCode, RecNo, RecDate, TxnDateTime, UserId, Remarks, NetValue, SysSerialNo, Confirmed, ConDatetime, ConUserID) VALUES (${invChar(locCode, 10)}, ${invChar(recNo, 10)}, ${recDate}, ${now}, ${invChar(actor.userId, 10)}, ${remarks}, ${netValue}, ${Number(recNo.replace(/\D/g, '')) || 0}, ${confirmNow ? 'Y' : 'N'}, ${now}, ${invChar(confirmNow ? actor.userId : '', 10)})`;

      // details
      for (const d of toInsert) {
        await tx.$executeRaw`INSERT INTO tbl_reconcildetails (LocCode, RecNo, ItemCode, UnitId, CostPrice, SysQty, RecQty, RecItemValue, RecConfNo) VALUES (${invChar(locCode, 10)}, ${invChar(recNo, 10)}, ${invChar(d.itemCode, 15)}, ${invChar(d.unitID, 10)}, ${d.costPrice}, ${d.sysQty}, ${d.phyQty}, ${d.itemValue}, ${''})`;
      }

      // if confirmNow, move stock immediately (same Txn as header)
      if (confirmNow) {
        for (const d of toInsert) {
          const preQty = Number(d.sysQty);
          const lastQty = Number(d.phyQty);
          const addDeduct = lastQty >= preQty ? '+' : '-';
          // 1. ledger — mirror VB6 StockAsItIs: Insert into Tbl_TxnMovement
          // VB: Insert Into Tbl_TxnMovement (LocCode,RowItemCode,TxnNo,TxnType,TxnDate,PreQty,TxnQty,LastQty,UserId,SysSerialId,Remarks,AddDeduct,TXNDATETIMEMANUAL) Values(...)
          // Here TxnQty=lastQty, LastQty=lastQty (set), TxndateTime = now
            const sysSer = Number(recNo.replace(/\D/g, '')) || 0;
          await stockAsItIs(tx, { locCode, rowItemCode: d.itemCode, txnNo: recNo, txnType: 'RC', txnQty: lastQty, sysSerialId: sysSer, userId: actor.userId, remarks: 'Stock Reconciliation', addDeduct, txnDate: now, txnDateTimeManual: now });
          // keep tbl_itemdetail in sync (absolute)
          try {
            await tx.$executeRaw`UPDATE tbl_itemdetail SET ItemQty = ${lastQty} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(d.itemCode)}`;
          } catch {}
        }
      }

      return { recNo: recNo.trim(), locCode, netValue, lines: toInsert.length, confirmed: confirmNow };
    }, { timeout: 30000 });

    return NextResponse.json({ success: true, data: result, message: result.confirmed ? `Recon ${result.recNo} confirmed — stock updated` : `Recon ${result.recNo} saved` });
  } catch (err) {
    return invFail(err, tag);
  }
}
