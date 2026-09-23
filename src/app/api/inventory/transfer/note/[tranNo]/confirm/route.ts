import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";
import { postNoteConfirmation } from "@/lib/transferPosting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ tranNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/transfer/note/[tranNo]/confirm";
  try {
    const actor = await invActor(req);
    const { tranNo: raw } = await ctx.params;
    const tranNo = invId(raw, "Transfer No", 15);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fromLoc = invId(body.fromLocCode, "From Location", 10);
    const toLoc = invId(body.toLoc, "To Location", 10);

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ Confirmed: string; TReqNO: string; NetTotal: number; SysSerialNo: number; LineCnt: bigint | number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, RTRIM(h.TReqNO) AS TReqNO, h.NetTotal AS NetTotal, h.SysSerialNo AS SysSerialNo,
            (SELECT COUNT(*) FROM tbl_transfernotedetail d
              WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")} AND ${keySql("d.TranNo")}=${keySql("h.TranNo")}) AS LineCnt
          FROM tbl_transfernoteheader h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.TranNo")}=${keyVal(tranNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Transfer Note ${tranNo} was not found (${fromLoc} → ${toLoc}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") throw new InvError(`Transfer Note ${tranNo} is already confirmed.`, 409);
        if (Number(rows[0].LineCnt || 0) === 0) {
          throw new InvError(`Transfer Note ${tranNo} has no item lines, so it cannot be confirmed.`, 400);
        }
        const now = new Date();
        await tx.$executeRaw`
          UPDATE tbl_transfernoteheader
          SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)} AND ${keySql("TranNo")}=${keyVal(tranNo)} AND UPPER(Confirmed)<>'Y'
        `;
                // From location, in (TI) at the To location; IssuedQTY grows on the
        // requisition (keyed by the REQUISITION's orientation — locs swapped);
        // TakenForTransfer='1' only once the whole requisition is issued.
        const dl = await tx.$queryRaw<{ ItemCode: string; TranQty: number }[]>`
          SELECT RTRIM(d.ItemCode) AS ItemCode, d.TranQty AS TranQty
          FROM tbl_transfernotedetail d
          WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TranNo")}=${keyVal(tranNo)}
        `;
        const posting = await postNoteConfirmation(tx as any, {
          tranNo, fromLoc, toLoc, tReqNo: trim(rows[0].TReqNO),
          lines: dl.map((l) => ({ itemCode: trim(l.ItemCode), qty: Number(l.TranQty || 0) })),
          sysSerialId: Number(rows[0].SysSerialNo || 0), userId: actor.userId,
        });
        return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0), moved: posting.moved };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Note ${tranNo} confirmed (${fromLoc} → ${toLoc}) — ${result.lines} line(s), stock moved (${result.moved}), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: { tranNo, fromLocCode: fromLoc, toLoc, confirmed: true },
      message: `Transfer Note ${tranNo} confirmed — stock moved (${result.moved} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
