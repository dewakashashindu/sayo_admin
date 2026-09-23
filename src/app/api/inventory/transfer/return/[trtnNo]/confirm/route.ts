import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";
import { postReturnConfirmation } from "@/lib/transferPosting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
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
        const rows = await tx.$queryRaw<{ Confirmed: string; NetTotal: number; TNNO: string; SysSerialNo: string; LineCnt: bigint | number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, h.NetTotal AS NetTotal, RTRIM(h.TNNO) AS TNNO, RTRIM(h.SysSerialNo) AS SysSerialNo,
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
                // location, TRTI into the receiving one; TranRtnQTY grows on the
        // transfer note (keyed by the NOTE's orientation — locs swapped);
        // TakenForTransferRtn=1 only once the whole note has been returned.
        const dl = await tx.$queryRaw<{ ItemCode: string; TranRtnQty: number }[]>`
          SELECT RTRIM(d.ItemCode) AS ItemCode, d.TranRtnQty AS TranRtnQty
          FROM tbl_transferreturndetail d
          WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TRtnNo")}=${keyVal(trtnNo)}
        `;
        const posting = await postReturnConfirmation(tx as any, {
          trtnNo, fromLoc, toLoc, tnNo: trim(rows[0].TNNO),
          lines: dl.map((l) => ({ itemCode: trim(l.ItemCode), qty: Number(l.TranRtnQty || 0) })),
          sysSerialId: Number(String(rows[0].SysSerialNo ?? "").replace(/\D/g, "")) || 0,
          userId: actor.userId,
        });
        return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0), moved: posting.moved };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Return ${trtnNo} confirmed (${fromLoc} → ${toLoc}) — ${result.lines} line(s), stock moved (${result.moved}), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: { trtnNo, fromLocCode: fromLoc, toLoc, confirmed: true },
      message: `Transfer Return ${trtnNo} confirmed — stock moved (${result.moved} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
