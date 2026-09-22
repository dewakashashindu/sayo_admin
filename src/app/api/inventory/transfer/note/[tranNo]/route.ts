// src/app/api/inventory/transfer/note/[tranNo]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/inventory/transfer/note/:tranNo?fromLoc=&toLoc=  → header + lines
// PUT    /api/inventory/transfer/note/:tranNo?fromLoc=&toLoc=  → replace a PENDING note
// DELETE /api/inventory/transfer/note/:tranNo?fromLoc=&toLoc=  → delete a PENDING note
//
// A transfer note's key is (FromLocCode, ToLoc, TranNo) — like the PO key
// (LocCode, PONO) — so PUT/DELETE must say which pair the number belongs to.
// GET falls back to the first note carrying the number (the "load lines from a
// requisition / note" pickers on the screens only know the number).
//
// WHAT MAY BE CHANGED — mirroring the purchase-order rules:
//   pending   → yes, everything except the number and the locations
//   confirmed → no (409). A confirmed note is a ledger document.
//   returned  → no (409): a transfer return already points at this note.
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

type Ctx = { params: Promise<{ tranNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

/** One line the way tbl_transfernotedetail holds it (value = cost × transferred qty). */
function buildLines(
  items: Awaited<ReturnType<typeof resolveItems>>,
  fromLoc: string,
  rawLines: any[],
) {
  return rawLines.map((l: any) => {
    const code = String(l.itemCode || "").trim().toUpperCase();
    const it = items.get(code);
    if (!it) throw new InvError(`Item ${code} not in ${fromLoc}`, 400);
    const trQty = invQty(l.trQty ?? l.TRQty, `TR QTY of ${it.des}`);
    const tranQty = invQty(l.tranQty ?? l.TranQty ?? trQty, `Transferred QTY of ${it.des}`);
    const cost = trim(l.costPrice) === "" ? it.costPrice : invPrice(l.costPrice, `Cost ${it.des}`);
    return {
      itemCode: it.code,
      unitID: invId(l.unitID || it.unitID, "Unit", 10),
      costPrice: cost,
      trQty,
      tranQty,
      itemValue: cost * tranQty,
    };
  });
}

/* ── GET — one note with its lines ───────────────────────────────────────── */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { tranNo: raw } = await ctx.params;
    const tranNo = invId(raw, "Transfer No", 15);
    const sp = req.nextUrl.searchParams;
    const fromQ = trim(sp.get("fromLoc"));
    const toQ = trim(sp.get("toLoc"));

    let head = (await prisma.$queryRaw<
      { FromLocCode: string; FromLocDes: string | null; ToLoc: string; ToLocDes: string | null; TranNo: string; TraDate: Date; TReqNO: string; NetTotal: number; Confirmed: string; Remarks: string | null; UserID: string }[]
    >`
      SELECT RTRIM(h.FromLocCode) AS FromLocCode,
        (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
        RTRIM(h.ToLoc) AS ToLoc,
        (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
        RTRIM(h.TranNo) AS TranNo, h.TraDate AS TraDate, RTRIM(h.TReqNO) AS TReqNO,
        h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
      FROM tbl_transfernoteheader h
      WHERE ${keySql("h.TranNo")}=${keyVal(tranNo)}
      ${fromQ ? Prisma.sql`AND ${keySql("h.FromLocCode")}=${keyVal(fromQ)}` : Prisma.empty}
      ${toQ ? Prisma.sql`AND ${keySql("h.ToLoc")}=${keyVal(toQ)}` : Prisma.empty}
      LIMIT 1
    `)[0];

    if (!head && (fromQ || toQ)) {
      // the picker on the Return screen only knows the number — find it anywhere
      head = (await prisma.$queryRaw<
        { FromLocCode: string; FromLocDes: string | null; ToLoc: string; ToLocDes: string | null; TranNo: string; TraDate: Date; TReqNO: string; NetTotal: number; Confirmed: string; Remarks: string | null; UserID: string }[]
      >`
        SELECT RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          RTRIM(h.TranNo) AS TranNo, h.TraDate AS TraDate, RTRIM(h.TReqNO) AS TReqNO,
          h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
        FROM tbl_transfernoteheader h WHERE ${keySql("h.TranNo")}=${keyVal(tranNo)} LIMIT 1
      `)[0];
    }
    if (!head) return NextResponse.json({ success: false, message: `Transfer Note ${tranNo} not found` }, { status: 404 });

    const fromLoc = trim(head.FromLocCode);
    const toLoc = trim(head.ToLoc);
    const lines = await prisma.$queryRaw<
      { ItemCode: string; ItemDes: string | null; UnitID: string; UnitDes: string | null; CostPrice: number; TRQty: number; TranQty: number; ItemValue: number }[]
    >`
      SELECT RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql("um.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.TRQTy AS TRQty, d.TranQty AS TranQty, d.ItemValue AS ItemValue
      FROM tbl_transfernotedetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TranNo")}=${keyVal(tranNo)}
      ORDER BY d.ItemCode
    `;

    return NextResponse.json({
      success: true,
      data: {
        header: {
          tranNo,
          fromLocCode: fromLoc,
          fromLocDes: trim(head.FromLocDes),
          toLoc,
          toLocDes: trim(head.ToLocDes),
          traDate: head.TraDate,
          tReqNo: trim(head.TReqNO),
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
          trQty: Number(l.TRQty || 0),
          tranQty: Number(l.TranQty || 0),
          itemValue: Number(l.ItemValue || 0),
        })),
      },
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/transfer/note/[tranNo]");
  }
}

/* ── PUT — replace a PENDING note (number and locations stay) ────────────── */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/transfer/note/[tranNo]";
  try {
    const actor = await invActor(req);
    const { tranNo: raw } = await ctx.params;
    const tranNo = invId(raw, "Transfer No", 15);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    const body = (await req.json()) as Record<string, unknown>;
    const tReqRaw = trim(body.tReqNo ?? body.TReqNO);
    const traDate = invDateField(body.traDate ?? body.TraDate, "Tra Date");
    const remarks = trim(body.remarks).slice(0, 400);
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one line.");

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ TranNo: string; Confirmed: string; TakenRtn: number }[]>`
          SELECT RTRIM(h.TranNo) AS TranNo, UPPER(h.Confirmed) AS Confirmed, h.TakenForTransferRtn AS TakenRtn
          FROM tbl_transfernoteheader h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("h.ToLoc")}=${keyVal(toRaw)} AND ${keySql("h.TranNo")}=${keyVal(tranNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Transfer Note ${tranNo} was not found (${fromRaw} → ${toRaw}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") {
          throw new InvError(`Transfer Note ${tranNo} is confirmed — it can no longer be edited.`, 409);
        }
        if (Number(rows[0].TakenRtn || 0) === 1) {
          throw new InvError(`A transfer return was already made from ${tranNo} — the note can no longer be edited.`, 409);
        }

        const fromLoc = await findLocation(tx, fromRaw);
        if (!fromLoc) throw new InvError(`Unknown From ${fromRaw}`, 400);
        const toLoc = await findLocation(tx, toRaw);
        if (!toLoc) throw new InvError(`Unknown To ${toRaw}`, 400);
        if (tReqRaw) {
          const rq = await tx.$queryRaw<{ TRNO: string }[]>`SELECT RTRIM(TRNO) AS TRNO FROM tbl_transferreqheder WHERE ${keySql("TRNO")}=${keyVal(tReqRaw)} LIMIT 1`;
          if (!rq.length) throw new InvError(`Requisition ${tReqRaw} not found.`, 404);
        }

        const items = await resolveItems(tx, fromLoc, rawLines.map((l) => String(l.itemCode || "").trim()));
        const lines = buildLines(items, fromLoc, rawLines);
        const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);

        await tx.$executeRaw`
          UPDATE tbl_transfernoteheader
          SET TraDate=${traDate}, Remarks=${remarks}, TReqNO=${invChar(tReqRaw, 10)},
              GrossTotal=${netTotal}, NetTotal=${netTotal}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TranNo")}=${keyVal(tranNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_transfernotedetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TranNo")}=${keyVal(tranNo)}
        `;
        for (const l of lines) {
          await tx.$executeRaw`
            INSERT INTO tbl_transfernotedetail
              (FromLocCode,ToLoc,TranNo,ItemCode,UnitID,CostPrice,TRQTy,TranQty,ItemValue,TranConfNo,NewItem,TranRtnQTY)
            VALUES
              (${invChar(fromLoc, 10)},${invChar(toLoc, 10)},${invChar(tranNo, 15)},${invChar(l.itemCode, 20)},${invChar(l.unitID, 15)},
               ${l.costPrice},${l.trQty},${l.tranQty},${l.itemValue},${invChar(tranNo, 15)},"",0)
          `;
        }
        return { tranNo, fromLoc, toLoc, netTotal, lines: lines.length };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Note ${tranNo} updated — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: result,
      message: `Transfer Note ${tranNo} updated (${result.lines} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

/* ── DELETE — only while PENDING (mirrors the purchase order) ────────────── */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/transfer/note/[tranNo]";
  try {
    const actor = await invActor(req);
    const { tranNo: raw } = await ctx.params;
    const tranNo = invId(raw, "Transfer No", 15);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ Confirmed: string; TakenRtn: number }[]>`
          SELECT UPPER(h.Confirmed) AS Confirmed, h.TakenForTransferRtn AS TakenRtn
          FROM tbl_transfernoteheader h
          WHERE ${keySql("h.FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("h.ToLoc")}=${keyVal(toRaw)} AND ${keySql("h.TranNo")}=${keyVal(tranNo)}
          FOR UPDATE
        `;
        if (rows.length === 0) throw new InvError(`Transfer Note ${tranNo} was not found (${fromRaw} → ${toRaw}).`, 404);
        if (trim(rows[0].Confirmed) === "Y") {
          throw new InvError(`Transfer Note ${tranNo} is confirmed — it cannot be deleted.`, 409);
        }
        if (Number(rows[0].TakenRtn || 0) === 1) {
          throw new InvError(`A transfer return was already made from ${tranNo} — the note cannot be deleted.`, 409);
        }
        await tx.$executeRaw`
          DELETE FROM tbl_transfernotedetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TranNo")}=${keyVal(tranNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_transfernoteheader
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TranNo")}=${keyVal(tranNo)}
        `;
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Note ${tranNo} deleted (${fromRaw} → ${toRaw})`);
    return NextResponse.json({ success: true, message: `Transfer Note ${tranNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
