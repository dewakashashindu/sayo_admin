import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";
import { invActor, invFail, invChar, invId, InvError, keySql, keyVal } from '@/lib/inventoryServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ damNo: string }> };

interface DamageLineInput {
  itemCode: string;
  unitID: string;
  costPrice: number;
  damageQty: number;
}

async function loadHeader(locCode: string, damNo: string) {
  const rows = await prisma.$queryRaw<{
    LocCode: string; DamNo: string; NetTotal: number; UserId: string;
    Remarks: string; TxnDate: Date; Confirmed: string;
  }[]>`
    SELECT RTRIM(LocCode) AS LocCode, RTRIM(DamNo) AS DamNo, NetTotal,
           RTRIM(UserId) AS UserId, Remarks, TxnDate, UPPER(Confirmed) AS Confirmed
      FROM tbl_damageheder
     WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}
     LIMIT 1`;
  return rows[0] ?? null;
}

// GET /api/inventory/damage/[damNo]?locCode=..
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { damNo: rawNo } = await params;
    const damNo = invId(rawNo, 'Damage number', 10).trim();
    const locCode = String(req.nextUrl.searchParams.get('locCode') ?? '').trim();
    if (!locCode) throw new InvError('locCode is required.', 400);

    const head = await loadHeader(locCode, damNo);
    if (!head) throw new InvError(`Damage note ${damNo} not found at ${locCode}.`, 404);

    const lines = await prisma.$queryRaw<{
      ItemCode: string; ItemDes: string | null; UnitId: string;
      CostPrice: number; DmgQty: number; ItemValue: number;
    }[]>`
      SELECT RTRIM(d.ItemCode) AS ItemCode,
             (SELECT ItemDes FROM tbl_itemmaster im
               WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')}
               LIMIT 1) AS ItemDes,
             RTRIM(d.UnitId) AS UnitId, d.CostPrice, d.DmgQty, d.ItemValue
        FROM tbl_damagedetails d
       WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.DamNo')}=${keyVal(damNo)}
       ORDER BY d.ItemCode`;

    return NextResponse.json({
      success: true,
      data: {
        locCode,
        damNo,
        txnDate: head.TxnDate ? new Date(head.TxnDate).toISOString().slice(0, 10) : '',
        remarks: head.Remarks ?? '',
        userName: head.UserId ?? '',
        netTotal: Number(head.NetTotal) || 0,
        confirmed: head.Confirmed === 'Y',
        lines: lines.map((l) => ({
          itemCode: String(l.ItemCode ?? '').trim(),
          itemName: String(l.ItemDes ?? '').trim(),
          unitID: String(l.UnitId ?? '').trim(),
          costPrice: Number(l.CostPrice) || 0,
          damageQty: Number(l.DmgQty) || 0,
          itemValue: Number(l.ItemValue) || 0,
        })),
      },
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/damage/[damNo]');
  }
}

// PUT — edit a still-pending damage note.
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await invActor(req);
    const { damNo: rawNo } = await params;
    const damNo = invId(rawNo, 'Damage number', 10).trim();
    const body = (await req.json()) as {
      locCode?: string; remarks?: string; txnDate?: string; lines?: DamageLineInput[];
    };
    const locCode = String(body.locCode ?? '').trim();
    if (!locCode) throw new InvError('Location is required.', 400);

    const lines = (Array.isArray(body.lines) ? body.lines : [])
      .map((l) => ({
        itemCode: String(l.itemCode ?? '').trim().toUpperCase(),
        unitID: String(l.unitID ?? '').trim(),
        costPrice: Number(l.costPrice) || 0,
        damageQty: Number(l.damageQty) || 0,
      }))
      .filter((l) => l.itemCode);
    if (!lines.length) throw new InvError('Add at least one item line.', 400);
    if (lines.some((l) => !(l.damageQty > 0))) throw new InvError('Every line needs a damage quantity above zero.', 400);

    const remarks = String(body.remarks ?? '').slice(0, 400);
    const txnDate = body.txnDate && !Number.isNaN(Date.parse(body.txnDate)) ? new Date(body.txnDate) : new Date();
    const netTotal = lines.reduce((s, l) => s + l.costPrice * l.damageQty, 0);

    await prisma.$transaction(async (tx) => {
      const headRows = await tx.$queryRaw<{ Confirmed: string }[]>`
        SELECT UPPER(Confirmed) AS Confirmed FROM tbl_damageheder
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}
        FOR UPDATE`;
      if (!headRows.length) throw new InvError(`Damage note ${damNo} not found at ${locCode}.`, 404);
      if (headRows[0].Confirmed === 'Y') throw new InvError(`Damage note ${damNo} is already confirmed — it cannot be edited.`, 409);

      await tx.$executeRaw`
        UPDATE tbl_damageheder
        SET NetTotal=${netTotal}, Remarks=${remarks}, TxnDate=${txnDate}
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;

      await tx.$executeRaw`
        DELETE FROM tbl_damagedetails
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;

      for (const l of lines) {
        await tx.$executeRaw`
          INSERT INTO tbl_damagedetails
            (LocCode, DamNo, ItemCode, UnitId, CostPrice, DmgQty, ItemValue, DmgConfNo)
          VALUES
            (${invChar(locCode, 10)}, ${invChar(damNo, 10)}, ${invChar(l.itemCode, 15)},
             ${invChar(l.unitID, 10)}, ${l.costPrice}, ${l.damageQty},
             ${Math.round(l.costPrice * l.damageQty * 100) / 100}, ${invChar('', 10)})`;
      }
    });

    return NextResponse.json({ success: true, message: `Damage note ${damNo} updated.` });
  } catch (err) {
    return invFail(err, 'PUT /api/inventory/damage/[damNo]');
  }
}

// DELETE — only while still pending.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { damNo: rawNo } = await params;
    const damNo = invId(rawNo, 'Damage number', 10).trim();
    const locCode = String(_req.nextUrl.searchParams.get('locCode') ?? '').trim();
    if (!locCode) throw new InvError('locCode is required.', 400);

    await prisma.$transaction(async (tx) => {
      const headRows = await tx.$queryRaw<{ Confirmed: string }[]>`
        SELECT UPPER(Confirmed) AS Confirmed FROM tbl_damageheder
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}
        FOR UPDATE`;
      if (!headRows.length) throw new InvError(`Damage note ${damNo} not found at ${locCode}.`, 404);
      if (headRows[0].Confirmed === 'Y') throw new InvError(`Confirmed damage note ${damNo} cannot be deleted.`, 409);

      await tx.$executeRaw`
        DELETE FROM tbl_damagedetails
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;
      await tx.$executeRaw`
        DELETE FROM tbl_damageheder
        WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;
    });

    return NextResponse.json({ success: true, message: `Damage note ${damNo} deleted.` });
  } catch (err) {
    return invFail(err, 'DELETE /api/inventory/damage/[damNo]');
  }
}
