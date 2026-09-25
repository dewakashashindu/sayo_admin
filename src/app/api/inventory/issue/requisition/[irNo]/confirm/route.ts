import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ irNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

// Confirming an Issue Requisition only flips the flag — stock moves later,
// when an Issue Note made from it is confirmed.
export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/issue/requisition/[irNo]/confirm";
  try {
    const actor = await invActor(req);
    const { irNo: raw } = await ctx.params;
    const irNo = invId(raw, "IR No", 50);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fromLoc = invId(body.fromLocCode, "From Location", 10);
    const toLoc = invId(body.toLoc, "To Location", 10);

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ Confirmed: string; NetTotal: number; LineCnt: bigint | number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, h.NetTotal AS NetTotal,
            (SELECT COUNT(*) FROM tbl_issuereqdetail d
              WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")} AND ${keySql("d.IRNo")}=${keySql("h.IRNO")}) AS LineCnt
          FROM tbl_issuereqheder h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.IRNO")}=${keyVal(irNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Requisition ${irNo} was not found (${fromLoc} → ${toLoc}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") throw new InvError(`Requisition ${irNo} is already confirmed.`, 409);
        if (Number(rows[0].LineCnt || 0) === 0) {
          throw new InvError(`Requisition ${irNo} has no item lines, so it cannot be confirmed.`, 400);
        }
        const now = new Date();
        await tx.$executeRaw`
          UPDATE tbl_issuereqheder
          SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)} AND ${keySql("IRNO")}=${keyVal(irNo)} AND UPPER(Confirmed)<>'Y'
        `;
        return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0) };
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Issue Requisition ${irNo} confirmed (${fromLoc} → ${toLoc}) — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: { irNo, fromLocCode: fromLoc, toLoc, confirmed: true },
      message: `Issue Requisition ${irNo} confirmed.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
