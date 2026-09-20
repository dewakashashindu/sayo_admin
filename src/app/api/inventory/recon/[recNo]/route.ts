// src/app/api/inventory/recon/[recNo]/route.ts
// GET /api/inventory/recon/:recNo?locCode=LOC0000001
// Returns header + lines for the Open action in Find.
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { invFail, keySql, keyVal, invId } from '@/lib/inventoryServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? '').trim();
type Ctx = { params: Promise<{ recNo: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { recNo: raw } = await ctx.params;
    const locCode = invId(req.nextUrl.searchParams.get('locCode'), 'Location', 10);
    const recNo = invId(raw, 'Recon number', 10);
    const head = await prisma.$queryRaw<{ RecNo: string; LocCode: string; RecDate: Date; UserId: string; UserName: string | null; Remarks: string; NetValue: number; Confirmed: string }[]>`
      SELECT RTRIM(h.RecNo) AS RecNo, RTRIM(h.LocCode) AS LocCode, h.RecDate AS RecDate, RTRIM(h.UserId) AS UserId,
             COALESCE(u.UserName, RTRIM(h.UserId)) AS UserName, h.Remarks AS Remarks, h.NetValue AS NetValue, UPPER(h.Confirmed) AS Confirmed
      FROM tbl_reconcilheder h LEFT JOIN tbl_userdetails u ON ${keySql('u.UserId')}=${keySql('h.UserId')}
      WHERE ${keySql('h.LocCode')}=${keyVal(locCode)} AND ${keySql('h.RecNo')}=${keyVal(recNo)} LIMIT 1`;
    if (!head.length) return NextResponse.json({ success: false, message: `Recon ${recNo} not found` }, { status: 404 });
    const rows = await prisma.$queryRaw<{ ItemCode: string; ItemDes: string | null; UnitId: string; UnitDes: string | null; CostPrice: number; SysQty: number; RecQty: number; RecItemValue: number }[]>`
      SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes,
             RTRIM(d.UnitId) AS UnitId, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keySql('d.UnitId')} LIMIT 1) AS UnitDes,
             d.CostPrice AS CostPrice, d.SysQty AS SysQty, d.RecQty AS RecQty, d.RecItemValue AS RecItemValue
      FROM tbl_reconcildetails d
      WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.RecNo')}=${keyVal(recNo)}
      ORDER BY d.ItemCode`;
    return NextResponse.json({
      success: true,
      data: {
        header: {
          recNo: trim(head[0].RecNo),
          locCode: trim(head[0].LocCode),
          recDate: head[0].RecDate,
          userId: trim(head[0].UserId),
          userName: trim(head[0].UserName),
          remarks: trim(head[0].Remarks),
          netValue: Number(head[0].NetValue || 0),
          confirmed: trim(head[0].Confirmed) === 'Y',
        },
        lines: rows.map((r) => ({
          itemCode: trim(r.ItemCode),
          itemName: trim(r.ItemDes) || trim(r.ItemCode),
          unitID: trim(r.UnitId),
          unitName: trim(r.UnitDes) || trim(r.UnitId),
          systemQty: Number(r.SysQty || 0),
          phyQty: Number(r.RecQty || 0),
          costPrice: Number(r.CostPrice || 0),
          itemValue: Number(r.RecItemValue || 0),
        })),
      },
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/recon/[recNo]');
  }
}
