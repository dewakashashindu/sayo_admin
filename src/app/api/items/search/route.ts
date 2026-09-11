// src/app/api/items/search/route.ts
// Lightweight item picker for the technician recipe editor ("add ingredient").
// GET /api/items/search?q=shampoo&locCode=LOC0000004&limit=20
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const locCode = (req.nextUrl.searchParams.get("locCode") || "").trim();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 20);
    const limit = Math.min(
      Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1),
      50,
    );

    if (!q) return NextResponse.json({ success: true, items: [] });

    const rows = await prisma.tbl_ItemMaster.findMany({
      where: {
        Enable: true,
        ...(locCode ? { LocCode: locCode } : {}),
        OR: [
          { ItemCode: { contains: q } },
          { ItemDes: { contains: q } },
          { ItemPrintDes: { contains: q } },
        ],
      },
      select: {
        LocCode: true,
        ItemCode: true,
        ItemDes: true,
        ItemPrintDes: true,
        MasterUnitID: true,
        Retailprice: true,
        ServiceItem: true,
      },
      // Stock items (ingredients) first, then services.
      orderBy: [{ ServiceItem: "asc" }, { ItemDes: "asc" }],
      take: limit,
    });

    return NextResponse.json({
      success: true,
      items: rows.map((r) => ({
        code: r.ItemCode.trim(),
        locCode: r.LocCode.trim(),
        des: (r.ItemPrintDes || "").trim() || r.ItemDes.trim(),
        masterUnitID: r.MasterUnitID.trim(),
        retailPrice: Number(r.Retailprice || 0),
        serviceItem: Boolean(r.ServiceItem),
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
