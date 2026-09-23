import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";
import { invActor, invFail, invChar, invId, InvError, keySql, keyVal } from '@/lib/inventoryServer';
import { stockAsItIsDelta } from '@/lib/stockAsItIs';
import { reduceBatchesFIFO } from '@/lib/itemDetailBatches';
import { insertStockTxn } from '@/lib/stockTxnWriter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ damNo: string }> };

// POST /api/inventory/damage/[damNo]/confirm?locCode=..
// Reduces stock FIFO-wise, writes the DM ledgers, then marks the note confirmed.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await invActor(req);
    const locCode = String(req.nextUrl.searchParams.get('locCode') ?? '').trim();
    if (!locCode) throw new InvError('locCode is required.', 400);
    const { damNo: rawNo } = await params;
    const damNo = invId(rawNo, 'Damage number', 10).trim();

    const result = await prisma.$transaction(async (tx) => {
      const head = await tx.$queryRaw<{ DamNo: string; Confirmed: string; NetTotal: number }[]>`
        SELECT RTRIM(DamNo) AS DamNo, UPPER(Confirmed) AS Confirmed, NetTotal
          FROM tbl_damageheder
         WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}
         FOR UPDATE`;
      if (!head.length) throw new InvError(`Damage note ${damNo} not found at ${locCode}.`, 404);
      if (head[0].Confirmed === 'Y') throw new InvError(`Damage note ${damNo} is already confirmed.`, 409);

      const lines = await tx.$queryRaw<{
        ItemCode: string; CostPrice: number; DmgQty: number;
      }[]>`
        SELECT RTRIM(ItemCode) AS ItemCode, CostPrice, DmgQty
          FROM tbl_damagedetails
         WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;
      if (!lines.length) throw new InvError(`Damage note ${damNo} has no lines.`, 400);

      const now = new Date();
      const sysSer = Number(damNo.replace(/\D/g, '')) || 0;
      let moved = 0;

      for (const l of lines) {
        const code = String(l.ItemCode).trim();
        const qty = Number(l.DmgQty || 0);
        if (!code || !(qty > 0)) continue;

        const res = await stockAsItIsDelta(tx, locCode, code, damNo, 'DM', -qty, sysSer, actor.userId, `Damage ${damNo}`);
        await reduceBatchesFIFO(tx, locCode, code, qty);
        try {
          await insertStockTxn(tx, {
            locCode, itemCode: code, txnType: 'DM', refNo: damNo, txnDate: now,
            qtyIn: 0, qtyOut: qty, balance: res.last,
            costPrice: Number(l.CostPrice) || 0,
            userId: actor.userId, remarks: `Damage ${damNo}`,
          });
        } catch {}
        moved++;
      }

      await tx.$executeRaw`
        UPDATE tbl_damageheder
           SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now}
         WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;

      return { damNo, locCode, netTotal: Number(head[0].NetTotal || 0), moved };
    }, { timeout: 30000 });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Damage ${result.damNo} confirmed — ${result.moved} line(s) posted, stock reduced.`,
    });
  } catch (err) {
    return invFail(err, 'POST /api/inventory/damage/[damNo]/confirm');
  }
}
