// GET    /api/inventory/transfer/requisition/:trNo?fromLoc=&toLoc=  — load one requisition with lines (actual DB)
// PUT    /api/inventory/transfer/requisition/:trNo?fromLoc=&toLoc=  — replace a PENDING requisition
// DELETE /api/inventory/transfer/requisition/:trNo?fromLoc=&toLoc=  — delete a PENDING requisition
// Mirrors the purchase-order route: a confirmed requisition is final, and a
// requisition a transfer note already took (TakenForTransfer='Y') is read-only.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
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

type Ctx = { params: Promise<{ trNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { trNo: raw } = await ctx.params;
    const trNo = invId(raw, "TR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromLocQ = String(sp.get("fromLoc") ?? "").trim();
    const toLocQ = String(sp.get("toLoc") ?? "").trim();

    // Find header — if from/to not given, find any
    const headerWhere: string[] = [];
    // Use raw SQL with keySql
    const headers = await prisma.$queryRaw<{ FromLocCode: string; ToLoc: string; TRNO: string; TRDate: Date; TRDueDate: Date; NetTotal: number; UserID: string; Remarks: string; Confirmed: string; TxnDate: Date; SysSerialNo: number }[]>`
      SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(TRNO) AS TRNO, TRDate, TRDueDate, NetTotal, RTRIM(UserID) AS UserID, Remarks, UPPER(Confirmed) AS Confirmed, TxnDate, SysSerialNo
      FROM tbl_transferreqheder
      WHERE ${keySql("TRNO")}=${keyVal(trNo)}
      ${fromLocQ ? Prisma.sql`AND ${keySql("FromLocCode")}=${keyVal(fromLocQ)}` : Prisma.empty}
      ${toLocQ ? Prisma.sql`AND ${keySql("ToLoc")}=${keyVal(toLocQ)}` : Prisma.empty}
      LIMIT 1
    ` as any;

    // fallback if no header with that filter, try without from/to
    let head = headers[0];
    if (!head) {
      const fallback = await prisma.$queryRaw<{ FromLocCode: string; ToLoc: string; TRNO: string; TRDate: Date; TRDueDate: Date; NetTotal: number; UserID: string; Remarks: string; Confirmed: string }[]>`
        SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(TRNO) AS TRNO, TRDate, TRDueDate, NetTotal, RTRIM(UserID) AS UserID, Remarks, UPPER(Confirmed) AS Confirmed
        FROM tbl_transferreqheder WHERE ${keySql("TRNO")}=${keyVal(trNo)} LIMIT 1
      `;
      head = fallback[0] as any;
    }
    if (!head) return NextResponse.json({ success:false, message:`Requisition ${trNo} not found` }, {status:404});

    const lines = await prisma.$queryRaw<{ ItemCode: string; ItemDes: string|null; UnitID: string; UnitDes: string|null; CostPrice: number; TRQty: number; ItemValue: number; TransferConfNo: string; IssuedQTY: number }[]>`
      SELECT
        RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql("um.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.TRQty AS TRQty, d.ItemValue AS ItemValue, RTRIM(d.TransferConfNo) AS TransferConfNo, d.IssuedQTY AS IssuedQTY
      FROM tbl_transferreqdetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(String(head.FromLocCode).trim())} AND ${keySql("d.ToLoc")}=${keyVal(String(head.ToLoc).trim())} AND ${keySql("d.TRNo")}=${keyVal(trNo)}
      ORDER BY d.ItemCode
    `;

    return NextResponse.json({
      success: true,
      data: {
        header: {
          trNo: String(head.TRNO).trim(),
          fromLocCode: String(head.FromLocCode).trim(),
          toLoc: String(head.ToLoc).trim(),
          trDate: head.TRDate,
          trDueDate: head.TRDueDate,
          netTotal: Number(head.NetTotal||0),
          userId: String(head.UserID||"").trim(),
          remarks: String(head.Remarks||"").trim(),
          confirmed: String(head.Confirmed||"N").trim()==='Y',
        },
        lines: lines.map(l=>({
          itemCode: String(l.ItemCode).trim(),
          itemName: String(l.ItemDes||l.ItemCode).trim(),
          unitID: String(l.UnitID||"").trim(),
          unitDes: String(l.UnitDes||l.UnitID||"").trim(),
          costPrice: Number(l.CostPrice||0),
          trQty: Number(l.TRQty||0),
          itemValue: Number(l.ItemValue||0),
          transferConfNo: String(l.TransferConfNo||"").trim(),
          issuedQty: Number(l.IssuedQTY||0),
        }))
      }
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/transfer/requisition/[trNo]");
  }
}

/** Lock the header and prove it is still a working draft (pending, not taken). */
async function lockPendingHead(tx: Prisma.TransactionClient, fromLoc: string, toLoc: string, trNo: string) {
  const rows = await tx.$queryRaw<{ TRNO: string; Confirmed: string; Taken: string }[]>`
    SELECT RTRIM(h.TRNO) AS TRNO, UPPER(h.Confirmed) AS Confirmed, UPPER(h.TakenForTransfer) AS Taken
    FROM tbl_transferreqheder h
    WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.TRNO")}=${keyVal(trNo)}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new InvError(`Requisition ${trNo} was not found (${fromLoc} → ${toLoc}).`, 404);
  if (trim(rows[0].Confirmed) === "Y") {
    throw new InvError(`Requisition ${trNo} is confirmed — it can no longer be edited or deleted.`, 409);
  }
  if (trim(rows[0].Taken) === "Y") {
    throw new InvError(`A transfer note was already made from ${trNo} — the requisition is read-only now.`, 409);
  }
}

/* ── PUT — replace a PENDING requisition (number and locations stay) ─────── */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/transfer/requisition/[trNo]";
  try {
    const actor = await invActor(req);
    const { trNo: raw } = await ctx.params;
    const trNo = invId(raw, "TR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    const body = (await req.json()) as Record<string, unknown>;
    const trDate = invDateField(body.trDate ?? body.TRDate, "TR Date");
    const trDueDate = invDateField(body.trDueDate ?? body.TRDueDate ?? trDate, "TR Due Date");
    const remarks = trim(body.remarks).slice(0, 500);
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

    const result = await prisma.$transaction(
      async (tx) => {
        await lockPendingHead(tx, fromRaw, toRaw, trNo);

        const fromLoc = await findLocation(tx, fromRaw);
        if (!fromLoc) throw new InvError(`Unknown From location “${fromRaw}”.`, 400);

        const items = await resolveItems(tx, fromLoc, rawLines.map((l) => itemCode(l.itemCode)));
        const lines = rawLines.map((line) => {
          const code = itemCode(line.itemCode);
          const it = items.get(code);
          if (!it) throw new InvError(`Item ${code} not in ${fromLoc}`, 400);
          const qty = invQty(line.trQty, `TR QTY of ${it.des}`);
          const cost = trim(line.costPrice) === "" ? it.costPrice : invPrice(line.costPrice, `Cost price of ${it.des}`);
          return {
            itemCode: it.code,
            unitID: invId(line.unitID || it.unitID || "", `Unit of ${it.des}`, 10),
            costPrice: cost,
            trQty: qty,
            itemValue: Number(cost) * Number(qty),
          };
        });
        const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);

        await tx.$executeRaw`
          UPDATE tbl_transferreqheder
          SET TRDate=${trDate}, TRDueDate=${trDueDate}, Remarks=${remarks}, NetTotal=${netTotal}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRNO")}=${keyVal(trNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_transferreqdetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRNo")}=${keyVal(trNo)}
        `;
        for (const l of lines) {
          await tx.$executeRaw`
            INSERT INTO tbl_transferreqdetail
              (FromLocCode, ToLoc, TRNo, ItemCode, UnitID, CostPrice, TRQty, ItemValue, TransferConfNo, IssuedQTY)
            VALUES
              (${invChar(fromLoc, 10)}, ${invChar(toRaw, 10)}, ${invChar(trNo, 50)}, ${invChar(l.itemCode, 20)}, ${invChar(l.unitID, 10)},
               ${l.costPrice}, ${l.trQty}, ${l.itemValue}, ${invChar(trNo, 20)}, 0)
          `;
        }
        return { trNo, fromLoc: fromRaw, toLoc: toRaw, netTotal, lines: lines.length };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Requisition ${trNo} updated — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: result,
      message: `Transfer Requisition ${trNo} updated (${result.lines} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

/* ── DELETE — only while PENDING and not yet taken by a transfer note ─────── */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/transfer/requisition/[trNo]";
  try {
    const actor = await invActor(req);
    const { trNo: raw } = await ctx.params;
    const trNo = invId(raw, "TR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    await prisma.$transaction(
      async (tx) => {
        await lockPendingHead(tx, fromRaw, toRaw, trNo);
        await tx.$executeRaw`
          DELETE FROM tbl_transferreqdetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRNo")}=${keyVal(trNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_transferreqheder
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("TRNO")}=${keyVal(trNo)}
        `;
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Transfer Requisition ${trNo} deleted (${fromRaw} → ${toRaw})`);
    return NextResponse.json({ success: true, message: `Transfer Requisition ${trNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
