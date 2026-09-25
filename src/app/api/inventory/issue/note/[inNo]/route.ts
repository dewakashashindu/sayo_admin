// GET    /api/inventory/issue/note/:inNo?fromLoc=&toLoc=   — load one issue note with lines
// PUT    /api/inventory/issue/note/:inNo?fromLoc=&toLoc=   — replace a PENDING issue note
// DELETE /api/inventory/issue/note/:inNo?fromLoc=&toLoc=   — delete a PENDING issue note
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import {
  findLocation,
  invActor,
  invChar,
  invDateField,
  invFail,
  invId,
  invPrice,
  invQty,
  InvError,
  resolveItems,
  keySql,
  keyVal,
} from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ inNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

/** One line the way tbl_issuenotedetail holds it (value = cost × issued qty). */
function buildLines(
  items: Awaited<ReturnType<typeof resolveItems>>,
  fromLoc: string,
  rawLines: any[],
) {
  return rawLines.map((l: any) => {
    const code = String(l.itemCode || "").trim().toUpperCase();
    const it = items.get(code);
    if (!it) throw new InvError(`Item ${code} not in ${fromLoc}`, 400);
    const irQty = invQty(l.irQty ?? l.IRQty, `IR QTY of ${it.des}`);
    const issuedQty = invQty(l.issuedQty ?? l.IssuedQty ?? irQty, `Issued QTY of ${it.des}`);
    const cost = trim(l.costPrice) === "" ? it.costPrice : invPrice(l.costPrice, `Cost ${it.des}`);
    return {
      itemCode: it.code,
      unitID: invId(l.unitID || it.unitID, "Unit", 10),
      costPrice: cost,
      irQty,
      issuedQty,
      itemValue: cost * issuedQty,
    };
  });
}

interface NoteHead {
  FromLocCode: string; FromLocDes: string | null; ToLoc: string; ToLocDes: string | null;
  INNO: string; INDate: Date; IRDate: Date | null; IRDueDate: Date | null; IRNO: string;
  NetTotal: number; Confirmed: string; Remarks: string | null; UserID: string;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { inNo: raw } = await ctx.params;
    const inNo = invId(raw, "Issue No", 10);
    const sp = req.nextUrl.searchParams;
    const fromQ = trim(sp.get("fromLoc"));
    const toQ = trim(sp.get("toLoc"));

    let head = (await prisma.$queryRaw<NoteHead[]>`
      SELECT RTRIM(h.FromLocCode) AS FromLocCode,
        (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
        RTRIM(h.ToLoc) AS ToLoc,
        (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
        RTRIM(h.INNO) AS INNO, h.INDate AS INDate,
        (SELECT rh.IRDate FROM tbl_issuereqheder rh WHERE ${keySql("rh.IRNO")}=${keySql("h.IRNO")} AND ${keySql("rh.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("rh.ToLoc")}=${keySql("h.ToLoc")} LIMIT 1) AS IRDate,
        (SELECT rh.IRDueDate FROM tbl_issuereqheder rh WHERE ${keySql("rh.IRNO")}=${keySql("h.IRNO")} AND ${keySql("rh.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("rh.ToLoc")}=${keySql("h.ToLoc")} LIMIT 1) AS IRDueDate,
        RTRIM(h.IRNO) AS IRNO,
        h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
      FROM tbl_issuenoteheder h
      WHERE ${keySql("h.INNO")}=${keyVal(inNo)}
      ${fromQ ? Prisma.sql`AND ${keySql("h.FromLocCode")}=${keyVal(fromQ)}` : Prisma.empty}
      ${toQ ? Prisma.sql`AND ${keySql("h.ToLoc")}=${keyVal(toQ)}` : Prisma.empty}
      LIMIT 1
    `)[0];

    if (!head && (fromQ || toQ)) {
      head = (await prisma.$queryRaw<NoteHead[]>`
        SELECT RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          RTRIM(h.INNO) AS INNO, h.INDate AS INDate,
        (SELECT rh.IRDate FROM tbl_issuereqheder rh WHERE ${keySql("rh.IRNO")}=${keySql("h.IRNO")} AND ${keySql("rh.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("rh.ToLoc")}=${keySql("h.ToLoc")} LIMIT 1) AS IRDate,
        (SELECT rh.IRDueDate FROM tbl_issuereqheder rh WHERE ${keySql("rh.IRNO")}=${keySql("h.IRNO")} AND ${keySql("rh.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("rh.ToLoc")}=${keySql("h.ToLoc")} LIMIT 1) AS IRDueDate,
        RTRIM(h.IRNO) AS IRNO,
          h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
        FROM tbl_issuenoteheder h WHERE ${keySql("h.INNO")}=${keyVal(inNo)} LIMIT 1
      `)[0];
    }
    if (!head) return NextResponse.json({ success: false, message: `Issue Note ${inNo} not found` }, { status: 404 });

    const fromLoc = trim(head.FromLocCode);
    const toLoc = trim(head.ToLoc);
    const lines = await prisma.$queryRaw<
      { ItemCode: string; ItemDes: string | null; UnitID: string; UnitDes: string | null; CostPrice: number; IRQty: number; IssuedQty: number; ItemValue: number }[]
    >`
      SELECT RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql("um.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.IRQty AS IRQty, d.INQty AS IssuedQty, d.ItemValue AS ItemValue
      FROM tbl_issuenotedetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.INNo")}=${keyVal(inNo)}
      ORDER BY d.ItemCode
    `;

    return NextResponse.json({
      success: true,
      data: {
        header: {
          inNo,
          fromLocCode: fromLoc,
          fromLocDes: trim(head.FromLocDes),
          toLoc,
          toLocDes: trim(head.ToLocDes),
          inDate: head.INDate,
          irDate: head.IRDate,
          irDueDate: head.IRDueDate,
          irNo: trim(head.IRNO),
          netTotal: Number(head.NetTotal || 0),
          confirmed: trim(head.Confirmed) === "Y",
          remarks: trim(head.Remarks),
          userId: trim(head.UserID),
        },
        lines: lines.map((l) => ({
          itemCode: trim(l.ItemCode),
          itemName: trim(l.ItemDes || l.ItemCode),
          unitID: trim(l.UnitID),
          unitDes: trim(l.UnitDes || l.UnitID),
          costPrice: Number(l.CostPrice || 0),
          irQty: Number(l.IRQty || 0),
          issuedQty: Number(l.IssuedQty || 0),
          itemValue: Number(l.ItemValue || 0),
        })),
      },
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/issue/note/[inNo]");
  }
}

/** Lock the header and prove it is still a working draft (pending, nothing confirmed). */
async function lockPendingHead(tx: Prisma.TransactionClient, fromLoc: string, toLoc: string, inNo: string) {
  const rows = await tx.$queryRaw<{ INNO: string; Confirmed: string }[]>`
    SELECT RTRIM(h.INNO) AS INNO, UPPER(h.Confirmed) AS Confirmed
    FROM tbl_issuenoteheder h
    WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.INNO")}=${keyVal(inNo)}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new InvError(`Issue Note ${inNo} was not found (${fromLoc} → ${toLoc}).`, 404);
  if (trim(rows[0].Confirmed) === "Y") {
    throw new InvError(`Issue Note ${inNo} is confirmed — it can no longer be edited or deleted.`, 409);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/issue/note/[inNo]";
  try {
    const actor = await invActor(req);
    const { inNo: raw } = await ctx.params;
    const inNo = invId(raw, "Issue No", 10);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    const body = (await req.json()) as Record<string, unknown>;
    const irRaw = trim(body.irNo ?? body.IRNO);
    const inDate = invDateField(body.inDate ?? body.INDate, "IN Date");
    const remarks = trim(body.remarks).slice(0, 500);
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one line.");

    const result = await prisma.$transaction(
      async (tx) => {
        await lockPendingHead(tx, fromRaw, toRaw, inNo);

        const fromLoc = await findLocation(tx, fromRaw);
        if (!fromLoc) throw new InvError(`Unknown From ${fromRaw}`, 400);
        const toLoc = await findLocation(tx, toRaw);
        if (!toLoc) throw new InvError(`Unknown To ${toRaw}`, 400);

        if (irRaw) {
          const rq = await tx.$queryRaw<{ IRNO: string; Confirmed: string }[]>`
            SELECT RTRIM(IRNO) AS IRNO, UPPER(Confirmed) AS Confirmed
            FROM tbl_issuereqheder
            WHERE ${keySql("IRNO")}=${keyVal(irRaw)} AND ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)}
            LIMIT 1`;
          if (!rq.length) throw new InvError(`Requisition ${irRaw} not found for ${fromLoc} → ${toLoc}.`, 404);
          if (trim(rq[0].Confirmed) !== "Y") throw new InvError(`Requisition ${irRaw} is not confirmed yet.`, 409);
        }

        const items = await resolveItems(tx, fromLoc, rawLines.map((l) => String(l.itemCode || "").trim()));
        const lines = buildLines(items, fromLoc, rawLines);

        // never issue more than the requisition still owes
        if (irRaw) {
          for (const l of lines) {
            const owed = await tx.$queryRaw<{ Remaining: number }[]>`
              SELECT IFNULL(d.IRQty,0) - IFNULL(d.IssuedQTY,0) AS Remaining
              FROM tbl_issuereqdetail d
              WHERE ${keySql("d.IRNo")}=${keyVal(irRaw)} AND ${keySql("d.ItemCode")}=${keyVal(l.itemCode)}
                AND ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)}
              LIMIT 1`;
            if (owed.length && l.issuedQty > Number(owed[0].Remaining || 0) + 1e-9) {
              throw new InvError(`Issued QTY of ${l.itemCode} (${l.issuedQty}) is more than the requisition still owes (${Number(owed[0].Remaining || 0)}).`, 400);
            }
          }
        }

        const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);

        await tx.$executeRaw`
          UPDATE tbl_issuenoteheder
          SET INDate=${inDate}, Remarks=${remarks}, IRNO=${invChar(irRaw, 10)},
              NetTotal=${netTotal}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("INNO")}=${keyVal(inNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_issuenotedetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("INNo")}=${keyVal(inNo)}
        `;
        for (const l of lines) {
          await tx.$executeRaw`
            INSERT INTO tbl_issuenotedetail
              (FromLocCode,ToLoc,INNo,ItemCode,UnitID,CostPrice,IRQty,INQty,ItemValue,DirectPOConfNo,NewItem)
            VALUES
              (${invChar(fromLoc, 10)},${invChar(toLoc, 10)},${invChar(inNo, 10)},${invChar(l.itemCode, 10)},${invChar(l.unitID, 10)},
               ${l.costPrice},${l.irQty},${l.issuedQty},${l.itemValue},${invChar(inNo, 10)},"")
          `;
        }
        return { inNo, fromLoc, toLoc, netTotal, lines: lines.length };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Issue Note ${inNo} updated — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: result,
      message: `Issue Note ${inNo} updated (${result.lines} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/issue/note/[inNo]";
  try {
    const actor = await invActor(req);
    const { inNo: raw } = await ctx.params;
    const inNo = invId(raw, "Issue No", 10);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    await prisma.$transaction(
      async (tx) => {
        await lockPendingHead(tx, fromRaw, toRaw, inNo);
        await tx.$executeRaw`
          DELETE FROM tbl_issuenotedetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("INNo")}=${keyVal(inNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_issuenoteheder
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("INNO")}=${keyVal(inNo)}
        `;
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Issue Note ${inNo} deleted (${fromRaw} → ${toRaw})`);
    return NextResponse.json({ success: true, message: `Issue Note ${inNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
