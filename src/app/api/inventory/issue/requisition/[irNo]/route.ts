// GET    /api/inventory/issue/requisition/:irNo?fromLoc=&toLoc=  — load one requisition with lines
// PUT    /api/inventory/issue/requisition/:irNo?fromLoc=&toLoc=  — replace a PENDING requisition
// DELETE /api/inventory/issue/requisition/:irNo?fromLoc=&toLoc=  — delete a PENDING requisition
// A confirmed requisition is final, and one an issue note already took
// (TakenForIssue='1' / IssuedQTY>0) is read-only.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
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
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ irNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { irNo: raw } = await ctx.params;
    const irNo = invId(raw, "IR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromLocQ = String(sp.get("fromLoc") ?? "").trim();
    const toLocQ = String(sp.get("toLoc") ?? "").trim();

    let head = (await prisma.$queryRaw<{ FromLocCode: string; ToLoc: string; IRNO: string; IRDate: Date; IRDueDate: Date; NetTotal: number; UserID: string; Remarks: string; Confirmed: string; TxnDate: Date; SysSerialNo: number }[]>`
      SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(IRNO) AS IRNO, IRDate, IRDueDate, NetTotal, RTRIM(UserID) AS UserID, Remarks, UPPER(Confirmed) AS Confirmed, TxnDate, SysSerialNo
      FROM tbl_issuereqheder
      WHERE ${keySql("IRNO")}=${keyVal(irNo)}
      ${fromLocQ ? Prisma.sql`AND ${keySql("FromLocCode")}=${keyVal(fromLocQ)}` : Prisma.empty}
      ${toLocQ ? Prisma.sql`AND ${keySql("ToLoc")}=${keyVal(toLocQ)}` : Prisma.empty}
      LIMIT 1
    `)[0];

    if (!head && (fromLocQ || toLocQ)) {
      head = (await prisma.$queryRaw<{ FromLocCode: string; ToLoc: string; IRNO: string; IRDate: Date; IRDueDate: Date; NetTotal: number; UserID: string; Remarks: string; Confirmed: string }[]>`
        SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(IRNO) AS IRNO, IRDate, IRDueDate, NetTotal, RTRIM(UserID) AS UserID, Remarks, UPPER(Confirmed) AS Confirmed
        FROM tbl_issuereqheder WHERE ${keySql("IRNO")}=${keyVal(irNo)} LIMIT 1
      `)[0] as any;
    }
    if (!head) return NextResponse.json({ success: false, message: `Requisition ${irNo} not found` }, { status: 404 });

    const lines = await prisma.$queryRaw<{ ItemCode: string; ItemDes: string | null; UnitID: string; UnitDes: string | null; CostPrice: number; IRQty: number; ItemValue: number; DirectPOConfNo: string; IssuedQTY: number }[]>`
      SELECT
        RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql("um.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.IRQty AS IRQty, d.ItemValue AS ItemValue, RTRIM(d.DirectPOConfNo) AS DirectPOConfNo, d.IssuedQTY AS IssuedQTY
      FROM tbl_issuereqdetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(String(head.FromLocCode).trim())} AND ${keySql("d.ToLoc")}=${keyVal(String(head.ToLoc).trim())} AND ${keySql("d.IRNo")}=${keyVal(irNo)}
      ORDER BY d.ItemCode
    `;

    return NextResponse.json({
      success: true,
      data: {
        header: {
          irNo: String(head.IRNO).trim(),
          fromLocCode: String(head.FromLocCode).trim(),
          toLoc: String(head.ToLoc).trim(),
          irDate: head.IRDate,
          irDueDate: head.IRDueDate,
          netTotal: Number(head.NetTotal || 0),
          userId: String(head.UserID || "").trim(),
          remarks: String(head.Remarks || "").trim(),
          confirmed: String(head.Confirmed || "N").trim() === 'Y',
        },
        lines: lines.map(l => ({
          itemCode: String(l.ItemCode).trim(),
          itemName: String(l.ItemDes || l.ItemCode).trim(),
          unitID: String(l.UnitID || "").trim(),
          unitDes: String(l.UnitDes || l.UnitID || "").trim(),
          costPrice: Number(l.CostPrice || 0),
          irQty: Number(l.IRQty || 0),
          itemValue: Number(l.ItemValue || 0),
          directPOConfNo: String(l.DirectPOConfNo || "").trim(),
          issuedQty: Number(l.IssuedQTY || 0),
        }))
      }
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/issue/requisition/[irNo]");
  }
}

/** Lock the header and prove it is still a working draft (pending, not taken, nothing issued yet). */
async function lockPendingHead(tx: Prisma.TransactionClient, fromLoc: string, toLoc: string, irNo: string) {
  const rows = await tx.$queryRaw<{ IRNO: string; Confirmed: string; Taken: string; Issued: number }[]>`
    SELECT RTRIM(h.IRNO) AS IRNO, UPPER(h.Confirmed) AS Confirmed, UPPER(h.TakenForIssue) AS Taken,
      (SELECT IFNULL(SUM(d.IssuedQTY),0) FROM tbl_issuereqdetail d
        WHERE ${keySql("d.FromLocCode")}=${keySql("h.FromLocCode")} AND ${keySql("d.ToLoc")}=${keySql("h.ToLoc")} AND ${keySql("d.IRNo")}=${keySql("h.IRNO")}) AS Issued
    FROM tbl_issuereqheder h
    WHERE ${keySql("h.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("h.ToLoc")}=${keyVal(toLoc)} AND ${keySql("h.IRNO")}=${keyVal(irNo)}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new InvError(`Requisition ${irNo} was not found (${fromLoc} → ${toLoc}).`, 404);
  if (trim(rows[0].Confirmed) === "Y") {
    throw new InvError(`Requisition ${irNo} is confirmed — it can no longer be edited or deleted.`, 409);
  }
  if (trim(rows[0].Taken) === "Y" || trim(rows[0].Taken) === "1") {
    throw new InvError(`An issue note was already made from ${irNo} — the requisition is read-only now.`, 409);
  }
  if (Number(rows[0].Issued || 0) > 0) {
    throw new InvError(`Items were already issued against ${irNo} — the requisition is read-only now.`, 409);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/issue/requisition/[irNo]";
  try {
    const actor = await invActor(req);
    const { irNo: raw } = await ctx.params;
    const irNo = invId(raw, "IR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    const body = (await req.json()) as Record<string, unknown>;
    const irDate = invDateField(body.irDate ?? body.IRDate, "IR Date");
    const irDueDate = invDateField(body.irDueDate ?? body.IRDueDate ?? irDate, "IR Due Date");
    const remarks = trim(body.remarks).slice(0, 500);
    const rawLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

    const result = await prisma.$transaction(
      async (tx) => {
        await lockPendingHead(tx, fromRaw, toRaw, irNo);

        const fromLoc = await findLocation(tx, fromRaw);
        if (!fromLoc) throw new InvError(`Unknown From location “${fromRaw}”.`, 400);
        const toLoc = await findLocation(tx, toRaw);
        if (!toLoc) throw new InvError(`Unknown To location “${toRaw}”.`, 400);

        const items = await resolveItems(tx, fromLoc, rawLines.map((l) => itemCode(l.itemCode)));
        const lines = rawLines.map((line) => {
          const code = itemCode(line.itemCode);
          const it = items.get(code);
          if (!it) throw new InvError(`Item ${code} not in ${fromLoc}`, 400);
          const qty = invQty(line.irQty, `IR QTY of ${it.des}`);
          const cost = trim(line.costPrice) === "" ? it.costPrice : invPrice(line.costPrice, `Cost price of ${it.des}`);
          return {
            itemCode: it.code,
            unitID: invId(line.unitID || it.unitID || "", `Unit of ${it.des}`, 10),
            costPrice: cost,
            irQty: qty,
            itemValue: Number(cost) * Number(qty),
          };
        });
        const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);

        await tx.$executeRaw`
          UPDATE tbl_issuereqheder
          SET IRDate=${irDate}, IRDueDate=${irDueDate}, Remarks=${remarks}, NetTotal=${netTotal}
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("IRNO")}=${keyVal(irNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_issuereqdetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("IRNo")}=${keyVal(irNo)}
        `;
        for (const l of lines) {
          await tx.$executeRaw`
            INSERT INTO tbl_issuereqdetail
              (FromLocCode, ToLoc, IRNo, ItemCode, UnitID, CostPrice, IRQty, ItemValue, DirectPOConfNo, IssuedQTY)
            VALUES
              (${invChar(fromLoc, 10)}, ${invChar(toLoc, 10)}, ${invChar(irNo, 50)}, ${invChar(l.itemCode, 20)}, ${invChar(l.unitID, 10)},
               ${l.costPrice}, ${l.irQty}, ${l.itemValue}, ${invChar(irNo, 20)}, 0)
          `;
        }
        return { irNo, fromLoc: fromRaw, toLoc: toRaw, netTotal, lines: lines.length };
      },
      { timeout: 30000 },
    );

    await logActivity(actor.name, "inventory", `Issue Requisition ${irNo} updated — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`);
    return NextResponse.json({
      success: true,
      data: result,
      message: `Issue Requisition ${irNo} updated (${result.lines} line(s)).`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/issue/requisition/[irNo]";
  try {
    const actor = await invActor(req);
    const { irNo: raw } = await ctx.params;
    const irNo = invId(raw, "IR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromRaw = invId(sp.get("fromLoc"), "From Location", 10);
    const toRaw = invId(sp.get("toLoc"), "To Location", 10);

    await prisma.$transaction(
      async (tx) => {
        await lockPendingHead(tx, fromRaw, toRaw, irNo);
        await tx.$executeRaw`
          DELETE FROM tbl_issuereqdetail
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("IRNo")}=${keyVal(irNo)}
        `;
        await tx.$executeRaw`
          DELETE FROM tbl_issuereqheder
          WHERE ${keySql("FromLocCode")}=${keyVal(fromRaw)} AND ${keySql("ToLoc")}=${keyVal(toRaw)} AND ${keySql("IRNO")}=${keyVal(irNo)}
        `;
      },
      { timeout: 20000 },
    );

    await logActivity(actor.name, "inventory", `Issue Requisition ${irNo} deleted (${fromRaw} → ${toRaw})`);
    return NextResponse.json({ success: true, message: `Issue Requisition ${irNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
