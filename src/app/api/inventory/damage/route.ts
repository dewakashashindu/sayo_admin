import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";
import {
  invActor, invFail, invChar, keySql, keyVal,
} from '@/lib/inventoryServer';
import { nextSerialTx } from '@/lib/serials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

interface DamageLineInput {
  itemCode: string;
  unitID: string;
  costPrice: number;
  damageQty: number;
}

// GET /api/inventory/damage?status=all|confirmed|pending&q=
export async function GET(req: NextRequest) {
  try {
    const status = (req.nextUrl.searchParams.get('status') ?? 'all').trim().toLowerCase();
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

    const where: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (status === 'confirmed') where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if (status === 'pending') where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if (q) {
      const like = `%${q}%`;
      where.push(Prisma.sql`AND (RTRIM(h.DamNo) LIKE ${like} OR lm.LocDes LIKE ${like})`);
    }

    const rows = await prisma.$queryRaw<{
      LocCode: string; LocDes: string | null; DamNo: string; TxnDate: Date;
      UserName: string | null; NetTotal: number; Confirmed: string;
    }[]>`
      SELECT
        RTRIM(h.LocCode)           AS LocCode,
        lm.LocDes                  AS LocDes,
        RTRIM(h.DamNo)             AS DamNo,
        h.TxnDate                  AS TxnDate,
        RTRIM(h.UserId)            AS UserName,
        h.NetTotal                 AS NetTotal,
        UPPER(h.Confirmed)         AS Confirmed
      FROM tbl_damageheder h
      LEFT JOIN tbl_locationmaster lm ON ${keySql('lm.LocCode')}=${keySql('h.LocCode')}
      WHERE ${Prisma.join(where, ' ', 'AND ')}
      ORDER BY h.TxnDate DESC, h.DamNo DESC
      LIMIT 300
    `;

    return NextResponse.json({ success: true,
      data: rows.map((r) => ({
        locCode: String(r.LocCode ?? '').trim(),
        locDes: String(r.LocDes ?? r.LocCode ?? '').trim(),
        damNo: String(r.DamNo ?? '').trim(),
        txnDate: r.TxnDate ? new Date(r.TxnDate).toISOString().slice(0, 10) : '',
        userName: String(r.UserName ?? '').trim(),
        netTotal: Number(r.NetTotal) || 0,
        confirmed: String(r.Confirmed ?? 'N') === 'Y',
      })),
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/damage');
  }
}

// POST /api/inventory/damage — create a pending (draft) damage note.
export async function POST(req: NextRequest) {
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as {
      locCode?: string;
      remarks?: string;
      txnDate?: string;
      lines?: DamageLineInput[];
    };

    const locCode = String(body.locCode ?? '').trim();
    if (!locCode) return invFail(new Error('Location is required.'), 'POST /api/inventory/damage');

    const lines = (Array.isArray(body.lines) ? body.lines : [])
      .map((l) => ({
        itemCode: String(l.itemCode ?? '').trim().toUpperCase(),
        unitID: String(l.unitID ?? '').trim(),
        costPrice: Number(l.costPrice) || 0,
        damageQty: Number(l.damageQty) || 0,
      }))
      .filter((l) => l.itemCode);

    if (!lines.length) return invFail(new Error('Add at least one item line.'), 'POST /api/inventory/damage');
    if (lines.length > 200) return invFail(new Error('Too many lines (max 200).'), 'POST /api/inventory/damage');
    if (lines.some((l) => !(l.damageQty > 0))) return invFail(new Error('Every line needs a damage quantity above zero.'), 'POST /api/inventory/damage');
    if (lines.some((l) => l.costPrice < 0)) return invFail(new Error('Cost price cannot be negative.'), 'POST /api/inventory/damage');

    const remarks = String(body.remarks ?? '').slice(0, 400);
    const txnDate = body.txnDate && !Number.isNaN(Date.parse(body.txnDate)) ? new Date(body.txnDate) : new Date();
    const netTotal = lines.reduce((s, l) => s + l.costPrice * l.damageQty, 0);

    const result = await prisma.$transaction(async (tx) => {
      const damNo = await nextSerialTx(tx as never, 'DAM');
      const sysSerial = Number(damNo.replace(/\D/g, '')) || 0;
      const now = new Date();

      for (const l of lines) {
        const item = await tx.$queryRaw<{ n: number }[]>`
          SELECT 1 AS n FROM tbl_itemmaster
          WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('ItemCode')}=${keyVal(l.itemCode)}
          LIMIT 1`;
        if (!item.length) throw new Error(`Item ${l.itemCode} does not exist at ${locCode}.`);
      }

      await tx.$executeRaw`
        INSERT INTO tbl_damageheder
          (LocCode, DamNo, NetTotal, UserId, Remarks, TxnDate, TxndateTime, SysSerialNo, Confirmed, ConUserID, ConDatetime)
        VALUES
          (${invChar(locCode, 10)}, ${invChar(damNo, 10)}, ${netTotal}, ${invChar(actor.userId, 10)},
           ${remarks}, ${txnDate}, ${now}, ${sysSerial}, ${'N'}, ${invChar('', 10)}, ${new Date('1900-01-01')})
      `;

      for (const l of lines) {
        await tx.$executeRaw`
          INSERT INTO tbl_damagedetails
            (LocCode, DamNo, ItemCode, UnitId, CostPrice, DmgQty, ItemValue, DmgConfNo)
          VALUES
            (${invChar(locCode, 10)}, ${invChar(damNo, 10)}, ${invChar(l.itemCode, 15)},
             ${invChar(l.unitID, 10)}, ${l.costPrice}, ${l.damageQty},
             ${Math.round(l.costPrice * l.damageQty * 100) / 100}, ${invChar('', 10)})
        `;
      }

      return { damNo, netTotal };
    });

    return NextResponse.json({ success: true, data: result, message: `Damage note ${result.damNo} saved (pending).` });
  } catch (err) {
    return invFail(err, 'POST /api/inventory/damage');
  }
}
