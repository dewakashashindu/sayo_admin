import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";
import { postIssueConfirmation } from "@/lib/issuePosting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ inNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

// Confirming an Issue Note moves the stock: "IO" out of the From location and
// "II" into the To location; IssuedQTY grows on the requisition in the same
// From/To order; TakenForIssue = '1' once the whole requisition is issued.
export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/issue/note/[inNo]/confirm";
  try {
    const actor = await invActor(req);
    const { inNo: raw } = await ctx.params;
    const inNo = invId(raw, "Issue No", 10);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fromLoc = invId(body.fromLocCode, "From Location", 10);
    const toLoc = invId(body.toLoc, "To Location", 10);

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ Confirmed: string; IRNO: string; NetTotal: number; SysSerialNo: number; LineCnt: bigint | number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, RTRIM(h.IRNO) AS IRNO, h.NetTotal AS NetTotal, h.SysSerialNo AS SysSerialNo,
            (SELECT COUNT(*) FROM tbl_issuenotedetail d
              WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")} AND ${keySql("d.INNo")}=${keySql("h.INNO")}) AS LineCnt
          FROM tbl_issuenoteheder h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.INNO")}=${keyVal(inNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Issue Note ${inNo} was not found (${fromLoc} → ${toLoc}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") throw new InvError(`Issue Note ${inNo} is already confirmed.`, 409);
        if (Number(rows[0].LineCnt || 0) === 0) {
          throw new InvError(`Issue Note ${inNo} has no item lines, so it cannot be confirmed.`, 400);
        }
        const now = new Date();
        await tx.$executeRaw`
          UPDATE tbl_issuenoteheder
          SET Confirmed='Y', ConUserID=${invChar(actor.userId, 10)}, ConDatetime=${now}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)} AND ${keySql("INNO")}=${keyVal(inNo)} AND UPPER(Confirmed)<>'Y'
        `;
        const dl = await tx.$queryRaw<{ ItemCode: string; IssuedQty: number }[]>`
          SELECT RTRIM(d.ItemCode) AS ItemCode, d.INQty AS IssuedQty
          FROM tbl_issuenotedetail d
          WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.INNo")}=${keyVal(inNo)}
        `;
        const posting = await postIssueConfirmation(tx as any, {
          inNo, fromLoc, toLoc, irNo: trim(rows[0].IRNO),
          lines: dl.map((l) => ({ itemCode: trim(l.ItemCode), qty: Number(l.IssuedQty || 0) })),
          sysSerialId: Number(rows[0].SysSerialNo || 0), userId: actor.userId,
        });
        return { netTotal: Number(rows[0].NetTotal || 0), lines: Number(rows[0].LineCnt || 0), moved: posting.moved };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Issue Note ${inNo} confirmed (${fromLoc} → ${toLoc}) — ${result.lines} line(s), stock moved (${result.moved}), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: { inNo, fromLocCode: fromLoc, toLoc, confirmed: true },
      message: `Issue Note ${inNo} confirmed — stock moved (${result.moved} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
