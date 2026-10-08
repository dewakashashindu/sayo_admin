// src/app/api/items/search/route.ts
// Lightweight item picker for the technician recipe editor ("add ingredient").
// GET /api/items/search?q=shampoo&locCode=LOC0000004&limit=20
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const locCode = (req.nextUrl.searchParams.get("locCode") || "").trim();
    /* Optional category scope (rev 26): when the workstation has a recipe row
       selected, only items sharing its category chain are returned. Levels
       that are empty are simply not filtered on. */
    const c1 = (req.nextUrl.searchParams.get("c1") || "").trim();
    const c2 = (req.nextUrl.searchParams.get("c2") || "").trim();
    const c3 = (req.nextUrl.searchParams.get("c3") || "").trim();
    const c4 = (req.nextUrl.searchParams.get("c4") || "").trim();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 20);
    const limit = Math.min(
      Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1),
      50,
    );

    if (!q) return NextResponse.json({ success: true, items: [] });

    /* Item code AND item name must work the same way. The code match covers
       the full CHAR(15) code and the legacy 10-character prefix, so typing
       either style finds the item. Branch-first: try the booking's branch,
       then widen to all branches when nothing matched there. */
    type Row = {
      LocCode: string; ItemCode: string; ItemDes: string; ItemPrintDes: string;
      MasterUnitID: string; Retailprice: number | null; ServiceItem: number | null;
      RawCost: number | null; OverallCost: number | null;
      Category1: string; Category2: string; Category3: string; Category4: string;
    };
    const run = (loc: string | null) =>
      prisma.$queryRaw<Row[]>`
        SELECT RTRIM(LocCode) AS LocCode, RTRIM(ItemCode) AS ItemCode,
               RTRIM(ItemDes) AS ItemDes, RTRIM(ItemPrintDes) AS ItemPrintDes,
               RTRIM(MasterUnitID) AS MasterUnitID, Retailprice, ServiceItem,
               RawCost, OverallCost,
               RTRIM(Category1) AS Category1, RTRIM(Category2) AS Category2,
               RTRIM(Category3) AS Category3, RTRIM(Category4) AS Category4
        FROM tbl_itemmaster
        WHERE Enable = 1
          AND ServiceItem = 0
          AND (
            ItemCode LIKE ${'%' + q + '%'}
            OR LEFT(ItemCode, 10) LIKE ${'%' + q + '%'}
            OR ItemDes LIKE ${'%' + q + '%'}
            OR ItemPrintDes LIKE ${'%' + q + '%'}
          )
          ${loc ? Prisma.sql`AND RTRIM(LocCode) = ${loc}` : Prisma.sql``}
          ${c1 ? Prisma.sql`AND RTRIM(Category1) = ${c1}` : Prisma.sql``}
          ${c2 ? Prisma.sql`AND RTRIM(Category2) = ${c2}` : Prisma.sql``}
          ${c3 ? Prisma.sql`AND RTRIM(Category3) = ${c3}` : Prisma.sql``}
          ${c4 ? Prisma.sql`AND RTRIM(Category4) = ${c4}` : Prisma.sql``}
        ORDER BY ItemDes ASC
        LIMIT ${limit}
      `;
    let rows: Row[] = locCode ? await run(locCode) : [];
    if (rows.length === 0) rows = await run(null);

    return NextResponse.json({
      success: true,
      items: rows.map((r) => ({
        code: r.ItemCode.trim(),
        locCode: r.LocCode.trim(),
        des: (r.ItemPrintDes || "").trim() || r.ItemDes.trim(),
        masterUnitID: r.MasterUnitID.trim(),
        retailPrice: Number(r.Retailprice || 0),
        costPrice: Number(r.OverallCost || r.RawCost || 0),
        serviceItem: Boolean(r.ServiceItem),
        category1: String(r.Category1 || "").trim(),
        category2: String(r.Category2 || "").trim(),
        category3: String(r.Category3 || "").trim(),
        category4: String(r.Category4 || "").trim(),
      })),
    });
  } catch (err) {
    console.error("GET /api/items/search error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to search items" },
      { status: 500 },
    );
  }
}
