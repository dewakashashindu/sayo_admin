// src/app/api/inventory/transfer/return/[trtnNo]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/inventory/transfer/return/:trtnNo?fromLoc=&toLoc=  → header + lines
// PUT    /api/inventory/transfer/return/:trtnNo?fromLoc=&toLoc=  → replace a PENDING return
// DELETE /api/inventory/transfer/return/:trtnNo?fromLoc=&toLoc=  → delete a PENDING return
//
// Same key and the same pending/confirmed rules as the transfer note
// (mirrors the purchase-order route).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
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
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ trtnNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

/* ── GET — one return with its lines ─────────────────────────────────────── */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { trtnNo: raw } = await ctx.params;
    const trtnNo = invId(raw, "Transfer Return No", 10);
    const sp = req.nextUrl.searchParams;
    const fromQ = trim(sp.get("fromLoc"));
    const toQ = trim(sp.get("toLoc"));

    let head = (await prisma.$queryRaw<
      { FromLocCode: string; FromLocDes: string | null; ToLoc: string; ToLocDes: string | null; TRtnNo: string; TRtnDate: Date; TNNO: string; TNDate: Date | null; NetTotal: number; Confirmed: string; Remarks: string | null; UserID: string }[]
    >`
      SELECT RTRIM(h.FromLocCode) AS FromLocCode,
        (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
        RTRIM(h.ToLoc) AS ToLoc,
        (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
        RTRIM(h.TRtnNo) AS TRtnNo, h.TRtnDate AS TRtnDate, RTRIM(h.TNNO) AS TNNO,
        (SELECT n.TraDate FROM tbl_transfernoteheader n WHERE ${keySql("n.TranNo")}=${keySql("h.TNNO")} LIMIT 1) AS TNDate,
        h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
      FROM tbl_transferreturnheader h
      WHERE ${keySql("h.TRtnNo")}=${keyVal(trtnNo)}
      ${fromQ ? Prisma.sql`AND ${keySql("h.FromLocCode")}=${keyVal(fromQ)}` : Prisma.empty}
      ${toQ ? Prisma.sql`AND ${keySql("h.ToLoc")}=${keyVal(toQ)}` : Prisma.empty}
      LIMIT 1
    `)[0];

    if (!head && (fromQ || toQ)) {
      head = (await prisma.$queryRaw<
        { FromLocCode: string; FromLocDes: string | null; ToLoc: string; ToLocDes: string | null; TRtnNo: string; TRtnDate: Date; TNNO: string; TNDate: Date | null; NetTotal: number; Confirmed: string; Remarks: string | null; UserID: string }[]
      >`
        SELECT RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          RTRIM(h.TRtnNo) AS TRtnNo, h.TRtnDate AS TRtnDate, RTRIM(h.TNNO) AS TNNO,
          (SELECT n.TraDate FROM tbl_transfernoteheader n WHERE ${keySql("n.TranNo")}=${keySql("h.TNNO")} LIMIT 1) AS TNDate,
          h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
        FROM tbl_transferreturnheader h WHERE ${keySql("h.TRtnNo")}=${keyVal(trtnNo)} LIMIT 1
      `)[0];
    }
    if (!head) return NextResponse.json({ success: false, message: `Transfer Return ${trtnNo} not found` }, { status: 404 });

    const fromLoc = trim(head.FromLocCode);
    const toLoc = trim(head.ToLoc);
    const lines = await prisma.$queryRaw<
      { ItemCode: string; ItemDes: string | null; UnitID: string; UnitDes: string | null; CostPrice: number; TNQty: number; TranRtnQty: number; ItemValue: number }[]
    >`
      SELECT RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql("um.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.TNQty AS TNQty, d.TranRtnQty AS TranRtnQty, d.ItemValue AS ItemValue
      FROM tbl_transferreturndetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TRtnNo")}=${keyVal(trtnNo)}
      ORDER BY d.ItemCode
    `;

    return NextResponse.json({
      success: true,
      data: {
        header: {
          trtnNo,
          fromLocCode: fromLoc,
          fromLocDes: trim(head.FromLocDes),
          toLoc,
          toLocDes: trim(head.ToLocDes),
          trtnDate: head.TRtnDate,
          tnNo: trim(head.TNNO),
          tnDate: head.TNDate,
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
          tnQty: Number(l.TNQty || 0),
          retQty: Number(l.TranRtnQty || 0),
          itemValue: Number(l.ItemValue || 0),
        })),
      },
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/transfer/return/[trtnNo]");
  }
}

/* ── PUT — replace a PENDING return ──────────────────────────────────────── */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/transfer/return/[trtnNo]";
  try {
    const actor = await invActor(req);
    const { trtnNo: raw } = await ctx.params;
    const trtnNo = invId(raw, "Transfer Return No", 10);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    const body = (await req.json()) as Record<string, unknown>;
    const tnRaw = invId(body.tnNo ?? body.TNNO, "Transfer Note No", 10);
    const trRtnDate = invDateField(body.trRtnDate ?? body.TRtnDate, "Return Date");
    const remarks = trim(body.remarks).slice(0, 1000);
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one line.");

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ TRtnNo: string; Confirmed: string }[]>`
          SELECT RTRIM(h.TRtnNo) AS TRtnNo, UPPER(h.Confirmed) AS Confirmed
          FROM tbl_transferreturnheader h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("h.ToLoc")}=${keyVal(toRaw)} AND ${keySql("h.TRtnNo")}=${keyVal(trtnNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Transfer Return ${trtnNo} was not found (${fromRaw} → ${toRaw}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") {
          throw new InvError(`Transfer Return ${trtnNo} is confirmed — it can no longer be edited.`, 409);
        }

        const fromLoc = await findLocation(tx, fromRaw);
        if (!fromLoc) throw new InvError(`Unknown From ${fromRaw}`, 400);
        const toLoc = await findLocation(tx, toRaw);
        if (!toLoc) throw new InvError(`Unknown To ${toRaw}`, 400);
        const tnRows = await tx.$queryRaw<{ TranNo: string }[]>`SELECT RTRIM(TranNo) AS TranNo FROM tbl_transfernoteheader WHERE ${keySql("TranNo")}=${keyVal(tnRaw)} LIMIT 1`;
        if (!tnRows.length) throw new InvError(`Transfer Note ${tnRaw} not found.`, 404);

        const items = await resolveItems(tx, fromLoc, rawLines.map((l) => String(l.itemCode || "").trim()));
        const lines = rawLines.map((l: any) => {
          const code = String(l.itemCode || "").trim().toUpperCase();
          const it = items.get(code);
          if (!it) throw new InvError(`Item ${code} not in ${fromLoc}`, 400);
          const tnQty = invQty(l.tnQty ?? l.TNQty, `TN QTY of ${it.des}`);
          const rtnQty = invQty(l.tranRtnQty ?? l.TranRtnQty ?? 0, `Returned QTY of ${it.des}`, { allowZero: true });
          const cost = trim(l.costPrice) === "" ? it.costPrice : invPrice(l.costPrice, `Cost ${it.des}`);
          return { itemCode: it.code, unitID: invId(l.unitID || it.unitID, "Unit", 10), costPrice: cost, tnQty, rtnQty, itemValue: cost * rtnQty };
        });
        const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);

        await tx.$executeRaw`
          UPDATE tbl_transferreturnheader
          SET TRtnDate=${trRtnDate}, Remarks=${remarks}, TNNO=${invChar(tnRaw, 10)}, NetTotal=${netTotal}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRtnNo")}=${keyVal(trtnNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_transferreturndetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRtnNo")}=${keyVal(trtnNo)}
        `;
        for (const l of lines) {
          await tx.$executeRaw`
            INSERT INTO tbl_transferreturndetail
              (FromLocCode,ToLoc,TRtnNo,ItemCode,UnitID,CostPrice,TNQty,TranRtnQty,ItemValue,TranConfNo)
            VALUES
              (${invChar(fromLoc, 10)},${invChar(toLoc, 10)},${invChar(trtnNo, 10)},${invChar(l.itemCode, 10)},${invChar(l.unitID, 10)},
               ${l.costPrice},${l.tnQty},${l.rtnQty},${l.itemValue},${invChar(trtnNo, 10)})
          `;
        }
        return { trtnNo, fromLoc, toLoc, netTotal, lines: lines.length };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Return ${trtnNo} updated — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: result,
      message: `Transfer Return ${trtnNo} updated (${result.lines} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

/* ── DELETE — only while PENDING ─────────────────────────────────────────── */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/transfer/return/[trtnNo]";
  try {
    const actor = await invActor(req);
    const { trtnNo: raw } = await ctx.params;
    const trtnNo = invId(raw, "Transfer Return No", 10);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ Confirmed: string }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed
          FROM tbl_transferreturnheader h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("h.ToLoc")}=${keyVal(toRaw)} AND ${keySql("h.TRtnNo")}=${keyVal(trtnNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Transfer Return ${trtnNo} was not found (${fromRaw} → ${toRaw}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") {
          throw new InvError(`Transfer Return ${trtnNo} is confirmed — it cannot be deleted.`, 409);
        }
        await tx.$executeRaw`
          DELETE FROM tbl_transferreturndetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRtnNo")}=${keyVal(trtnNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_transferreturnheader
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRtnNo")}=${keyVal(trtnNo)}
        `;
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Return ${trtnNo} deleted (${fromRaw} → ${toRaw})`);
    return NextResponse.json({ success: true, message: `Transfer Return ${trtnNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
