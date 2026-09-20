// src/app/api/inventory/recon/load/route.ts
// GET /api/inventory/recon/load?locCode=LOC0000001&mainCat=&sub1=&sub2=&sub3=&sub4=
// Loads items that match the 4 category filters, for the STOCK RECONCILIATION NOTE.
// One row per tbl_itemmaster where Enable=1, filtered by Category1-4 exactly like
// the legacy screen (─ all ─ = no filter). Returns SystemQty = StockBalance and
// CostPrice = RawCost (falls back to OverallCost) — the same costing GRN uses.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { invFail, keySql, keyVal, invId } from '@/lib/inventoryServer';

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
    const locCodeRaw = trim(sp.get('locCode'));
    if (!locCodeRaw) return NextResponse.json({ success: false, message: 'Location is required' }, { status: 400 });
    const locCode = invId(locCodeRaw, 'Location', 10);
    // legacy param Main Cat — kept for backwards compat; new page sends only sub1-4
    const mainCat = trim(sp.get('mainCat'));
    const sub1 = trim(sp.get('sub1'));
    const sub2 = trim(sp.get('sub2'));
    const sub3 = trim(sp.get('sub3'));
    const sub4 = trim(sp.get('sub4'));

    const limit = Math.min(Math.max(Number(sp.get('limit') || 500) || 500, 1), 2000);

    const where: Prisma.Sql[] = [];
    where.push(Prisma.sql`${keySql('m.LocCode')} = ${keyVal(locCode)}`);
    where.push(Prisma.sql`COALESCE(CAST(m.Enable AS UNSIGNED),1)=1`);
    // ── category mapping ──
    // New layout (Main Cat removed): Sub cat1→Category1, Sub cat2→Category2, Sub cat3→Category3, Sub cat4→Category4
    // Legacy layout still works: Main Cat→Category1, Sub1→Category2, Sub2→Category3, Sub3→Category4
    const hasMainCat = sp.has('mainCat');
    if (hasMainCat) {
      // legacy client
      if (mainCat) where.push(Prisma.sql`${keySql('m.Category1')} = ${keyVal(mainCat)}`);
      if (sub1) where.push(Prisma.sql`${keySql('m.Category2')} = ${keyVal(sub1)}`);
      if (sub2) where.push(Prisma.sql`${keySql('m.Category3')} = ${keyVal(sub2)}`);
      if (sub3) where.push(Prisma.sql`${keySql('m.Category4')} = ${keyVal(sub3)}`);
      if (sub4 && !sub3) where.push(Prisma.sql`${keySql('m.Category4')} = ${keyVal(sub4)}`);
    } else {
      // new client — Main Cat gone
      if (sub1) where.push(Prisma.sql`${keySql('m.Category1')} = ${keyVal(sub1)}`);
      if (sub2) where.push(Prisma.sql`${keySql('m.Category2')} = ${keyVal(sub2)}`);
      if (sub3) where.push(Prisma.sql`${keySql('m.Category3')} = ${keyVal(sub3)}`);
      if (sub4) where.push(Prisma.sql`${keySql('m.Category4')} = ${keyVal(sub4)}`);
    }
    // q search optional
    const q = trim(sp.get('q'));
    if (q) where.push(Prisma.sql`(RTRIM(m.ItemCode) LIKE ${`%${q}%`} OR m.ItemDes LIKE ${`%${q}%`})`);

    const rows = await prisma.$queryRaw<
      { ItemCode: string; ItemDes: string; MasterUnitID: string; UnitDes: string | null; StockBalance: number | null; RawCost: number | null; OverallCost: number | null }[]
    >`
      SELECT
        RTRIM(m.ItemCode) AS ItemCode,
        COALESCE(RTRIM(m.ItemDes),'') AS ItemDes,
        RTRIM(m.MasterUnitID) AS MasterUnitID,
        um.UnitDes AS UnitDes,
        m.StockBalance AS StockBalance,
        m.RawCost AS RawCost,
        m.OverallCost AS OverallCost
      FROM tbl_itemmaster m
      LEFT JOIN tbl_unitmaster um ON ${keySql('um.MasterUnitID')} = ${keySql('m.MasterUnitID')}
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY m.ItemDes ASC, m.ItemCode ASC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        itemCode: trim(r.ItemCode),
        itemName: trim(r.ItemDes) || trim(r.ItemCode),
        unitID: trim(r.MasterUnitID),
        unitName: trim(r.UnitDes) || trim(r.MasterUnitID),
        systemQty: Number(r.StockBalance || 0),
        costPrice: Number(r.RawCost ?? r.OverallCost ?? 0),
      })),
      count: rows.length,
    });
  } catch (err) {
    return invFail(err, 'GET /api/inventory/recon/load');
  }
}
