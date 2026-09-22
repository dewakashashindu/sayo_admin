// src/app/api/inventory/transfer/return/[trtnNo]/confirm/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/inventory/transfer/return/:trtnNo/confirm   body: { fromLocCode, toLoc }
//
// Confirming a transfer return makes it final — no edit, no delete afterwards
// (the same rule as the purchase order and the other two transfer documents).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ trtnNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/transfer/return/[trtnNo]/confirm";
  try {
    const actor = await invActor(req);
    const { trtnNo: raw } = await ctx.params;
    const trtnNo = invId(raw, "Transfer Return No", 10);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fromLoc = invId(body.fromLocCode, "From Location", 10);
    const toLoc = invId(body.toLoc, "To Location", 10);

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ Confirmed: string; NetTotal: number; LineCnt: bigint | number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, h.NetTotal AS NetTotal,
            (SELECT COUNT(*) FROM tbl_transferreturndetail d
              WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")} AND ${keySql("d.TRtnNo")}=${keySql("h.TRtnNo")}) AS LineCnt
          FROM tbl_transferreturnheader h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.TRtnNo")}=${keyVal(trtnNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Transfer Return ${trtnNo} was not found (${fromLoc} → ${toLoc}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") throw new InvError(`Transfer Return ${trtnNo} is already confirmed.`, 409);
        if (Number(rows[0].LineCnt || 0) === 0) {
          throw new InvError(`Transfer Return ${trtnNo} has no item lines, so it cannot be confirmed.`, 400);
        }
        const now = new Date();
        await tx.$executeRaw`
          UPDATE tbl_transferreturnheader
          SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)} AND ${keySql("TRtnNo")}=${keyVal(trtnNo)} AND UPPER(Confirmed)<>'Y'
        `;
        return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0) };
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Return ${trtnNo} confirmed (${fromLoc} → ${toLoc}) — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: { trtnNo, fromLocCode: fromLoc, toLoc, confirmed: true },
      message: `Transfer Return ${trtnNo} confirmed.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
