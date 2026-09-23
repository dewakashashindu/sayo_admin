// src/app/api/inventory/recon/[recNo]/confirm/route.ts
// POST /api/inventory/recon/:recNo/confirm  body:{ locCode }
// Mirrors VB6 Stocks.StockAsItIs — for every applicable line of the saved
// recon, writes Tbl_TxnMovement and sets tbl_itemmaster.StockBalance = RecQty.
// Only the system qty changes; nothing else (no price, no category).
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";
import { invActor, invFail, invId, InvError, keySql, keyVal, invChar } from '@/lib/inventoryServer';
import { stockAsItIs } from '@/lib/stockAsItIs';
import { insertStockTxn } from '@/lib/stockTxnWriter';
import { adjustBatchesToTotal } from '@/lib/itemDetailBatches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ recNo: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = 'POST /api/inventory/recon/[recNo]/confirm';
  try {
    const actor = await invActor(req);
    const { recNo: raw } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const locCode = invId(body.locCode, 'Location', 10);
    const recNo = invId(raw, 'Recon number', 10).trim();

    const result = await prisma.$transaction(async (tx) => {
      const head = await tx.$queryRaw<{ RecNo: string; Confirmed: string; NetValue: number }[]>`
        SELECT RTRIM(RecNo) AS RecNo, UPPER(Confirmed) AS Confirmed, NetValue FROM tbl_reconcilheder
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('RecNo')}=${keyVal(recNo)} FOR UPDATE`;
      if (!head.length) throw new InvError(`Recon ${recNo} not found at ${locCode}.`, 404);
      if (head[0].Confirmed === 'Y') throw new InvError(`Recon ${recNo} is already confirmed.`, 409);

      const lines = await tx.$queryRaw<{ ItemCode: string; SysQty: number; RecQty: number; CostPrice: number; RecItemValue: number }[]>`
        SELECT RTRIM(ItemCode) AS ItemCode, SysQty, RecQty, CostPrice, RecItemValue FROM tbl_reconcildetails
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('RecNo')}=${keyVal(recNo)}`;

      if (!lines.length) throw new InvError(`Recon ${recNo} has no lines.`, 400);

      const now = new Date();
      const sysSer = Number(recNo.replace(/\D/g, '')) || 0;

      for (const l of lines) {
        const code = String(l.ItemCode).trim();
        const preQty = Number(l.SysQty || 0);
        const lastQty = Number(l.RecQty || 0);
        const addDeduct = lastQty >= preQty ? '+' : '-';

        // lock item row
        const item = await tx.$queryRaw<{ StockBalance: number }[]>`SELECT StockBalance FROM tbl_itemmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(code)} FOR UPDATE`;
        if (!item.length) throw new InvError(`Item ${code} not found in item master for ${locCode}.`, 409);

        await stockAsItIs(tx, { locCode, rowItemCode: code, txnNo: recNo, txnType: 'RC', txnQty: lastQty, sysSerialId: sysSer, userId: actor.userId, remarks: 'Stock Reconciliation', addDeduct, txnDate: now, txnDateTimeManual: now });
        try { await adjustBatchesToTotal(tx, locCode, code, lastQty); } catch {}
        try {
          await insertStockTxn(tx, {
            locCode, itemCode: code, txnType: 'RC', refNo: recNo, txnDate: now,
            qtyIn: addDeduct === '+' ? Math.abs(lastQty - preQty) : 0,
            qtyOut: addDeduct === '-' ? Math.abs(lastQty - preQty) : 0,
            balance: lastQty, costPrice: Number(l.CostPrice) || 0,
            userId: actor.userId, remarks: 'Stock Reconciliation',
          });
        } catch {}
      }

      await tx.$executeRaw`UPDATE tbl_reconcilheder SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now} WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('RecNo')}=${keyVal(recNo)}`;

      return { recNo, locCode, netValue: Number(head[0].NetValue || 0), lines: lines.length };
    }, { timeout: 30000 });

    return NextResponse.json({ success: true, data: result, message: `Recon ${result.recNo} confirmed — ${result.lines} line(s) adjusted, stock updated.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
