// GET /api/inventory/supplier-return/:srnNo?locCode=  — header + lines for Open
// DELETE /api/inventory/supplier-return/:srnNo?locCode= — delete pending only
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";
import { invFail, keySql, keyVal, invId } from '@/lib/inventoryServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
const trim = (v: unknown) => String(v ?? '').trim();
type Ctx = { params: Promise<{ srnNo: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { srnNo: raw } = await ctx.params;
    const locCode = invId(req.nextUrl.searchParams.get('locCode'), 'Location', 10);
    const srnNo = invId(raw, 'SRN number', 15);
    const head = await prisma.$queryRaw<{ SRNNO: string; LocCode: string; SRNDate: Date; SupID: string; SupName: string | null; SupInvNo: string | null; NetTotal: number; Confirmed: string; Remarks: string | null; SRNTYPE: string; UserID: string; UserName: string | null }[]>`
      SELECT RTRIM(h.SRNNO) AS SRNNO, RTRIM(h.LocCode) AS LocCode, h.SRNDate AS SRNDate, RTRIM(h.SupID) AS SupID, s.SupName AS SupName, h.SupInvNo AS SupInvNo, h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.SRNTYPE) AS SRNTYPE, RTRIM(h.UserID) AS UserID, u.UserName AS UserName
      FROM tbl_srnheader h LEFT JOIN tbl_suppliermaster s ON ${keySql('s.SupID')}=${keySql('h.SupID')} LEFT JOIN tbl_userdetails u ON ${keySql('u.UserId')}=${keySql('h.UserID')}
      WHERE ${keySql('h.LocCode')}=${keyVal(locCode)} AND ${keySql('h.SRNNO')}=${keyVal(srnNo)} LIMIT 1`;
    if (!head.length) return NextResponse.json({ success: false, message: `SRN ${srnNo} not found` }, { status: 404 });
    const lines = await prisma.$queryRaw<{ ItemCode: string; ItemDes: string | null; UnitID: string; UnitDes: string | null; CostPrice: number; SRNQty: number; ItemValue: number; GRNQty: number }[]>`
      SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes,
             RTRIM(d.UnitID) AS UnitID, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keySql('d.UnitID')} LIMIT 1) AS UnitDes,
             d.CostPrice AS CostPrice, d.SRNQty AS SRNQty, d.ItemValue AS ItemValue, d.GRNQty AS GRNQty
      FROM tbl_srndetails d
      WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.SRNNo')}=${keyVal(srnNo)} ORDER BY d.ItemCode`;
    return NextResponse.json({
      success: true,
      data: {
        header: { srnNo: trim(head[0].SRNNO), locCode: trim(head[0].LocCode), srnDate: head[0].SRNDate, supID: trim(head[0].SupID), supName: trim(head[0].SupName), supInvNo: trim(head[0].SupInvNo), netTotal: Number(head[0].NetTotal || 0), confirmed: trim(head[0].Confirmed) === 'Y', remarks: trim(head[0].Remarks), srnType: trim(head[0].SRNTYPE), userId: trim(head[0].UserID), userName: trim(head[0].UserName) },
        lines: lines.map((r) => ({ itemCode: trim(r.ItemCode), itemName: trim(r.ItemDes) || trim(r.ItemCode), unitID: trim(r.UnitID), unitName: trim(r.UnitDes) || trim(r.UnitID), costPrice: Number(r.CostPrice || 0), grnQty: Number(r.GRNQty || 0), returnQty: Number(r.SRNQty || 0), itemValue: Number(r.ItemValue || 0) })),
      },
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/supplier-return/[srnNo]');
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { srnNo: raw } = await ctx.params;
    const locCode = invId(req.nextUrl.searchParams.get('locCode'), 'Location', 10);
    const srnNo = invId(raw, 'SRN number', 15);
    const head = await prisma.$queryRaw<{ Confirmed: string }[]>`SELECT UPPER(Confirmed) AS Confirmed FROM tbl_srnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNO')}=${keyVal(srnNo)} LIMIT 1`;
    if (!head.length) return NextResponse.json({ success: false, message: `SRN ${srnNo} not found` }, { status: 404 });
    if (head[0].Confirmed === 'Y') return NextResponse.json({ success: false, message: 'Confirmed returns cannot be deleted' }, { status: 409 });
    await prisma.$executeRaw`DELETE FROM tbl_srndetails WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNo')}=${keyVal(srnNo)}`;
    await prisma.$executeRaw`DELETE FROM tbl_srnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNO')}=${keyVal(srnNo)}`;
    return NextResponse.json({ success: true, message: `SRN ${srnNo} deleted` });
  } catch (err) {
    return invFail(err, 'DELETE /api/inventory/supplier-return/[srnNo]');
  }
}
