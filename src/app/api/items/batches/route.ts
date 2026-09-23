import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { readBatches } from "@/lib/itemDetailBatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const NO_EXPIRY_YEAR = 1900;

// GET /api/items/batches?locCode=LOC0000001&itemCode=ITM0000000001278
// Batch-wise (expiry-wise) stock of one item at one location — the Item Master
// "Stock ▸ batches" popup reads this.
export async function GET(req: NextRequest) {
  try {
    const locCode = (req.nextUrl.searchParams.get("locCode") ?? "").trim();
    const itemCode = (req.nextUrl.searchParams.get("itemCode") ?? "").trim();
    if (!locCode || !itemCode) {
      return NextResponse.json({ success: false, message: "locCode and itemCode are required." }, { status: 400 });
    }

    const batches = await readBatches(prisma, locCode, itemCode);
    const rows = batches.map((b) => ({
      expiry: b.expiry.getUTCFullYear() > NO_EXPIRY_YEAR ? b.expiry.toISOString().slice(0, 10) : null,
      qty: b.qty,
    }));
    const total = Math.round(rows.reduce((s, r) => s + r.qty, 0) * 1000) / 1000;

    let stockBalance: number | null = null;
    const master = await prisma.$queryRaw<{ sb: number | null }[]>`
      SELECT StockBalance AS sb FROM tbl_itemmaster
      WHERE RTRIM(LocCode) = ${locCode} AND RTRIM(ItemCode) = ${itemCode}
      LIMIT 1`;
    if (master.length) stockBalance = Number(master[0].sb);

    return NextResponse.json({
      success: true,
      data: {
        locCode,
        itemCode,
        batches: rows,
        batchTotal: total,
        stockBalance,
      },
    });
  } catch (err) {
    console.error("GET /api/items/batches error:", err);
    return NextResponse.json({ success: false, message: "Could not load the batch-wise stock." }, { status: 500 });
  }
}
