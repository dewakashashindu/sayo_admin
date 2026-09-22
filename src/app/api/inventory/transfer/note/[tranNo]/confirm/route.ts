// src/app/api/inventory/transfer/note/[tranNo]/confirm/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/inventory/transfer/note/:tranNo/confirm   body: { fromLocCode, toLoc }
//
// Confirming a transfer note: the note becomes final (no edit, no delete) and
// the requisition it came from is marked TakenForTransfer so it is not issued
// twice — the same thing the "save with confirm" path of POST .../note does.
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
        const rows = await tx.$queryRaw<{ Confirmed: string; TReqNO: string; NetTotal: number; LineCnt: bigint | number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, RTRIM(h.TReqNO) AS TReqNO, h.NetTotal AS NetTotal,
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
        const tReq = trim(rows[0].TReqNO);
        if (tReq) {
          // the requisition is consumed now — do not offer it for another note
          await tx.$executeRaw`
            UPDATE tbl_transferreqheder SET TakenForTransfer='Y'
            WHERE ${keySql("TRNO")}=${keyVal(tReq)} AND ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)}
          `;
        }
        return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0) };
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Note ${tranNo} confirmed (${fromLoc} → ${toLoc}) — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: { tranNo, fromLocCode: fromLoc, toLoc, confirmed: true },
      message: `Transfer Note ${tranNo} confirmed.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
