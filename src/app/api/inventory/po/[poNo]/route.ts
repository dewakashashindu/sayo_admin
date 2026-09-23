import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
import { openQty, poLineValue, poNetTotal } from "@/lib/inventoryTotals";
import {
  findLocation,
  findSupplier,
  invActor,
  invChar,
  invDateField,
  invFail,
  invId,
  invPrice,
  invQty,
  InvError,
  resolveItems,
  deletePoHeader,
  deletePoLines,
  insertPoLine,
  updatePoHeader,
  keySql,
  keyVal,
}from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ poNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

interface RawPoLine {
  itemCode?: unknown;
  unitID?: unknown;
  costPrice?: unknown;
  poQty?: unknown;
}

/** Lock the header row and return it, or throw the right error. */
async function lockHeader(tx: Prisma.TransactionClient, locCode: string, poNo: string) {
  const rows = await tx.$queryRaw<
    { PONO: string; SupID: string; Confirmed: string; NetTotal: number }[]
  >`
    SELECT RTRIM(PONO) AS PONO, RTRIM(SupID) AS SupID,
           UPPER(Confirmed) AS Confirmed, NetTotal
    FROM tbl_poheader
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONO")} = ${keyVal(poNo)}
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new InvError(`Purchase order ${poNo} was not found at this location.`, 404);
  }
  return rows[0];
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { poNo } = await ctx.params;
    const locCode = invId(req.nextUrl.searchParams.get("locCode"), "Location", 10);

    const rows = await prisma.$queryRaw<
      {
        PONO: string;
        LocCode: string;
        SupID: string;
        SupName: string | null;
        PODate: Date;
        DueDate: Date;
        NetTotal: number;
        Confirmed: string;
        Remarks: string | null;
        DeliAdd: string | null;
        UserID: string;
      }[]
    >`
      SELECT RTRIM(h.PONO) AS PONO, RTRIM(h.LocCode) AS LocCode, RTRIM(h.SupID) AS SupID,
             s.SupName AS SupName, h.PODate AS PODate, h.DueDate AS DueDate,
             h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed,
             h.Remarks AS Remarks, h.DeliAdd AS DeliAdd, RTRIM(h.UserID) AS UserID
      FROM tbl_poheader h
      LEFT JOIN tbl_suppliermaster s ON ${keySql("s.SupID")} = ${keySql("h.SupID")}
      WHERE ${keySql("h.LocCode")} = ${keyVal(locCode)} AND ${keySql("h.PONO")} = ${keyVal(poNo)}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InvError(`Purchase order ${poNo} was not found at this location.`, 404);
    }

    const lineRows = await prisma.$queryRaw<
      {
        LineNo: number;
        ItemCode: string;
        ItemDes: string | null;
        ItemPrintDes: string | null;
        UnitID: string;
        CostPrice: number;
        POQty: number;
        ItemValue: number;
        GRNQty: number;
        GRNNOs: string | null;
        Retailprice: number | null;
      }[]
    >`
      SELECT d.LineNo, RTRIM(d.ItemCode) AS ItemCode, i.ItemDes, i.ItemPrintDes,
             RTRIM(d.UnitID) AS UnitID, d.CostPrice, d.POQty, d.ItemValue,
             d.GRNQty, d.GRNNOs, i.Retailprice
      FROM tbl_podetails d
      LEFT JOIN tbl_itemmaster i
        ON ${keySql("i.LocCode")} = ${keySql("d.LocCode")} AND ${keySql("i.ItemCode")} = ${keySql("d.ItemCode")}
      WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.PONo")} = ${keyVal(poNo)}
      ORDER BY d.LineNo ASC
    `;

    const h = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        poNo: trim(h.PONO),
        locCode: trim(h.LocCode),
        supID: trim(h.SupID),
        supName: trim(h.SupName),
        poDate: h.PODate,
        dueDate: h.DueDate,
        netTotal: Number(h.NetTotal || 0),
        confirmed: trim(h.Confirmed) === "Y",
        remarks: trim(h.Remarks),
        deliAdd: trim(h.DeliAdd),
        userID: trim(h.UserID),
        lines: lineRows.map((r) => ({
          lineNo: Number(r.LineNo || 0),
          itemCode: trim(r.ItemCode),
          itemName: trim(r.ItemPrintDes) || trim(r.ItemDes) || trim(r.ItemCode),
          unitID: trim(r.UnitID),
          costPrice: Number(r.CostPrice || 0),
          poQty: Number(r.POQty || 0),
          itemValue: Number(r.ItemValue || 0),
          receivedQty: Number(r.GRNQty || 0),
          openQty: openQty(r.POQty, r.GRNQty),
          grnNos: trim(r.GRNNOs),
          retailPrice: Number(r.Retailprice || 0),
        })),
      },
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/po/[poNo]");
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/po/[poNo]";
  try {
    const actor = await invActor(req);
    const { poNo } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;

    const locCodeRaw = invId(body.locCode, "Location", 10);
    const supIDRaw = invId(body.supID, "Supplier", 10);
    const poDate = invDateField(body.poDate, "PO date");
    const dueDate = invDateField(body.dueDate ?? body.poDate, "PO due date");
    const deliAdd = trim(body.deliAdd).slice(0, 100);
    const remarks = trim(body.remarks).slice(0, 1500);
    const rawLines = Array.isArray(body.lines) ? (body.lines as RawPoLine[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

    const result = await prisma.$transaction(async (tx) => {
      const locCode = await findLocation(tx, locCodeRaw);
      if (!locCode) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);
      const supID = await findSupplier(tx, supIDRaw);
      if (!supID) throw new InvError(`Unknown supplier “${supIDRaw}”.`, 400);

      const header = await lockHeader(tx, locCode, invId(poNo, "PO number", 10));
      if (trim(header.Confirmed) === "Y") {
        throw new InvError(
          `Purchase order ${poNo} is already confirmed — a confirmed order can no longer be changed. Raise a new order instead.`,
          409,
        );
      }

      const received = await tx.$queryRaw<{ n: bigint | number }[]>`
        SELECT COUNT(*) AS n FROM tbl_podetails d
        WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.PONo")} = ${keyVal(poNo)} AND d.GRNQty > 0
      `;
      if (Number(received[0]?.n || 0) > 0) {
        throw new InvError(
          `Goods have already been received against ${poNo}, so the order can no longer be edited.`,
          409,
        );
      }

      const items = await resolveItems(tx, locCode, rawLines.map((l) => itemCode(l.itemCode)));
      const missing = rawLines
        .map((l) => invId(l.itemCode, "Item code", 50))
        .filter((code) => !items.has(itemCode(code)));
      if (missing.length) {
        throw new InvError(
          `These item codes are not in the item master for this location: ${missing.join(", ")}.`,
        );
      }

      const lines = rawLines.map((line, index) => {
        const item = items.get(itemCode(line.itemCode))!;
        const qty = invQty(line.poQty, `Quantity of ${item.des}`);
        const cost = trim(line.costPrice) === "" ? item.costPrice : invPrice(line.costPrice, `Cost price of ${item.des}`);
        return {
          lineNo: index + 1,
          itemCode: item.code,
          unitID: invId(line.unitID || item.unitID || "", `Unit of ${item.des}`, 10),
          costPrice: cost,
          poQty: qty,
          itemValue: poLineValue(cost, qty),
        };
      });
      const netTotal = poNetTotal(lines);

      await updatePoHeader(tx, {
        locCode,
        poNo,
        poDate,
        dueDate,
        supID,
        netTotal,
        actorId: actor.userId,
        remarks,
        deliAdd,
        confirmed: false,
      });

      await deletePoLines(tx, locCode, poNo);
      for (const line of lines) {
        await insertPoLine(tx, locCode, poNo, line);
      }

      return { locCode, netTotal, lineCount: lines.length };
    }, { timeout: 20000 });

    await logActivity(
      actor.name,
      "inventory",
      `Purchase order ${poNo} updated at ${result.locCode} — ${result.lineCount} line(s), net ${result.netTotal.toFixed(2)}`,
    );

    return NextResponse.json({
      success: true,
      data: { poNo, locCode: result.locCode, netTotal: result.netTotal },
      message: `Purchase order ${poNo} saved.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/po/[poNo]";
  try {
    const actor = await invActor(req);
    const { poNo } = await ctx.params;
    const locCodeRaw = invId(req.nextUrl.searchParams.get("locCode"), "Location", 10);

    const result = await prisma.$transaction(async (tx) => {
      const locCode = await findLocation(tx, locCodeRaw);
      if (!locCode) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);

      const header = await lockHeader(tx, locCode, invId(poNo, "PO number", 10));
      if (trim(header.Confirmed) === "Y") {
        throw new InvError(
          `Purchase order ${poNo} is confirmed, so it cannot be deleted.`,
          409,
        );
      }

      const used = await tx.$queryRaw<{ n: bigint | number }[]>`
        SELECT COUNT(*) AS n FROM tbl_grndetails g
        WHERE ${keySql("g.LocCode")} = ${keyVal(locCode)} AND ${keySql("g.PONO")} = ${keyVal(poNo)}
      `;
      if (Number(used[0]?.n || 0) > 0) {
        throw new InvError(
          `A GRN is already recorded against ${poNo}, so the order cannot be deleted.`,
          409,
        );
      }

      await deletePoLines(tx, locCode, poNo);
      await deletePoHeader(tx, locCode, poNo);

      return { locCode };
    }, { timeout: 20000 });

    await logActivity(actor.name, "inventory", `Purchase order ${poNo} deleted at ${result.locCode}`);

    return NextResponse.json({ success: true, message: `Purchase order ${poNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
