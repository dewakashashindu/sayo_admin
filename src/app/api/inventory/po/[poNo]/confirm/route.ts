import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError,
  confirmPoHeader,
  keySql,
  keyVal,
}from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ poNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/po/[poNo]/confirm";
  try {
    const actor = await invActor(req);
    const { poNo: poNoRaw } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const locCode = invId(body.locCode, "Location", 10);
    const poNo = invId(poNoRaw, "PO number", 10);

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { PONO: string; Confirmed: string; NetTotal: number; LineCnt: bigint | number }[]
      >`
        SELECT RTRIM(h.PONO) AS PONO, UPPER(h.Confirmed) AS Confirmed, h.NetTotal AS NetTotal,
               (SELECT COUNT(*) FROM tbl_podetails d
                 WHERE ${keySql("d.LocCode")} = ${keySql("h.LocCode")} AND ${keySql("d.PONo")} = ${keySql("h.PONO")}) AS LineCnt
        FROM tbl_poheader h
        WHERE ${keySql("h.LocCode")} = ${keyVal(locCode)} AND ${keySql("h.PONO")} = ${keyVal(poNo)}
        FOR UPDATE
      `;
      if (rows.length === 0) {
        throw new InvError(`Purchase order ${poNo} was not found at this location.`, 404);
      }
      if (trim(rows[0].Confirmed) === "Y") {
        throw new InvError(`Purchase order ${poNo} is already confirmed.`, 409);
      }
      if (Number(rows[0].LineCnt || 0) === 0) {
        throw new InvError(`Purchase order ${poNo} has no item lines, so it cannot be confirmed.`, 400);
      }

      await confirmPoHeader(tx, locCode, poNo, actor.userId);

      return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0) };
    }, { timeout: 20000 });

    await logActivity(
      actor.name,
      "inventory",
      `Purchase order ${poNo} confirmed at ${locCode} — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`,
    );

    return NextResponse.json({
      success: true,
      data: { poNo, locCode, confirmed: true },
      message: `Purchase order ${poNo} confirmed.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
