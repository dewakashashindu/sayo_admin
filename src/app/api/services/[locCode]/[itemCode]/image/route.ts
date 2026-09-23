// src/app/api/services/[locCode]/[itemCode]/image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { newRobustPrisma } from "@/lib/prismaRobust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof newRobustPrisma> | undefined;
};

const prisma = globalForPrisma.prisma ?? newRobustPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// GET /api/services/[locCode]/[itemCode]/image — the picture of one item,
// loaded on demand so the items list stays light.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locCode: string; itemCode: string }> },
) {
  try {
    const { locCode, itemCode } = await params;
    const row = await prisma.tbl_ItemMaster.findFirst({
      where: {
        LocCode: locCode.trim(),
        ItemCode: itemCode.trim().toUpperCase(),
      },
      select: { ItemPic: true },
    });

    const pic = row?.ItemPic;
    const image =
      pic && pic.length > 0
        ? `data:image/jpeg;base64,${Buffer.from(pic).toString("base64")}`
        : null;

    return NextResponse.json({ success: true, image });
  } catch (err) {
    console.error("GET item image error:", err);
    return NextResponse.json({ success: false, image: null }, { status: 500 });
  }
}
