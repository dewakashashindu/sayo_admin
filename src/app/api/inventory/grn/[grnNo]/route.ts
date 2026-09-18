// src/app/api/inventory/grn/[grnNo]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/inventory/grn/:grnNo?locCode=…   → header + lines (+ item names)
// PUT    /api/inventory/grn/:grnNo              → replace a PENDING document
// DELETE /api/inventory/grn/:grnNo?locCode=…    → delete a PENDING document
//
// A CONFIRMED GRN can never be edited or deleted here: confirmation is the
// moment stock moved (tbl_itemmaster.StockBalance, tbl_stocktxn) and the
// purchase order was written back. Reversing that is a return to the supplier
// (SRN / Damage), not an edit — so the answer is 409 with that explanation.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
import { grnLineValue, grnTotals, overReceiptQty } from "@/lib/inventoryTotals";
import {
  batchColumnMissing,
  findLocation,
  findSupplier,
  hasColumn,
  invActor,
  invChar,
  invDateField,
  invFail,
  invId,
  invOptionalDate,
  isEmptyDate,
  invPrice,
  invVarChar,
  invQty,
  InvError,
  resolveItems,
  deleteGrnHeader,
  deleteGrnLines,
  insertGrnLine,
  updateGrnHeader,
  keySql,
  keyVal,
}from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ grnNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

interface RawGrnLine {
  itemCode?: unknown;
  unitID?: unknown;
  batchNo?: unknown;
  costPrice?: unknown;
  retailPrice?: unknown;
  grnQty?: unknown;
  freeQty?: unknown;
  expDate?: unknown;
  updItemPrice?: unknown;
}

async function lockHeader(tx: Prisma.TransactionClient, locCode: string, grnNo: string) {
  const rows = await tx.$queryRaw<
    { GRNNO: string; PONO: string; Confirmed: string; NetTotal: number; GRNTYPE: string }[]
  >`
    SELECT RTRIM(GRNNO) AS GRNNO, RTRIM(PONO) AS PONO, UPPER(GRNTYPE) AS GRNTYPE,
           UPPER(Confirmed) AS Confirmed, NetTotal
    FROM tbl_grnheader
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("GRNNO")} = ${keyVal(grnNo)}
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new InvError(`GRN ${grnNo} was not found at this location.`, 404);
  }
  return rows[0];
}

/** Shared by PUT: validate the body and build the line rows. */
async function buildLines(
  tx: Prisma.TransactionClient,
  locCode: string,
  poNo: string,
  rawLines: RawGrnLine[],
) {
  if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

  const items = await resolveItems(tx, locCode, rawLines.map((l) => itemCode(l.itemCode)));
  const missing = rawLines
    .map((l) => invId(l.itemCode, "Item code", 50))
    .filter((code) => !items.has(itemCode(code)));
  if (missing.length) {
    throw new InvError(
      `These item codes are not in the item master for this location: ${missing.join(", ")}.`,
    );
  }

  if (poNo) {
    const poLines = await tx.$queryRaw<{ ItemCode: string; POQty: number; GRNQty: number }[]>`
      SELECT RTRIM(d.ItemCode) AS ItemCode, d.POQty AS POQty, d.GRNQty AS GRNQty
      FROM tbl_podetails d
      WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.PONo")} = ${keyVal(poNo)}
    `;
    const onPo = new Map(poLines.map((l) => [itemCode(l.ItemCode), l]));
    for (const raw of rawLines) {
      const code = itemCode(raw.itemCode);
      if (!onPo.has(code)) {
        throw new InvError(
          `“${items.get(code)?.des ?? code}” is not a line of purchase order ${poNo}.`,
        );
      }
      const line = onPo.get(code)!;
      const over = overReceiptQty(line.POQty, line.GRNQty, raw.grnQty);
      if (over > 0) {
        throw new InvError(
          `Receiving ${Number(raw.grnQty || 0)} of “${items.get(code)?.des ?? code}” goes ${over} past what ${poNo} still has open.`,
          409,
        );
      }
    }
  }

  return rawLines.map((raw, index) => {
    const code = itemCode(raw.itemCode);
    const item = items.get(code)!;
    const grnQty = invQty(raw.grnQty, `GRN quantity of ${item.des}`, { allowZero: true });
    const freeQty = invQty(raw.freeQty ?? 0, `Free quantity of ${item.des}`, { allowZero: true });
    if (grnQty === 0 && freeQty === 0) {
      throw new InvError(`Give a GRN quantity or a free quantity for “${item.des}”.`);
    }
    const costPrice =
      trim(raw.costPrice) === "" ? item.costPrice : invPrice(raw.costPrice, `Cost price of ${item.des}`);
    const retailPrice =
      trim(raw.retailPrice) === "" ? item.retailPrice : invPrice(raw.retailPrice, `Retail price of ${item.des}`);
    return {
      lineNo: index + 1,
      itemCode: item.code,
      batchNo: invVarChar(raw.batchNo ?? "", 50),
      unitID: invId(raw.unitID || item.unitID || "", `Unit of ${item.des}`, 15),
      costPrice,
      retailPrice,
      grnQty,
      freeQty,
      itemValue: grnLineValue(costPrice, grnQty, freeQty),
      expDate: invOptionalDate(raw.expDate, `Expiry date of ${item.des}`),
      updItemPrice: raw.updItemPrice === true || trim(raw.updItemPrice) === "1",
    };
  });
}

/* ── GET ─────────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { grnNo } = await ctx.params;
    const locCode = invId(req.nextUrl.searchParams.get("locCode"), "Location", 10);

    const head = await prisma.$queryRaw<
      {
        GRNNO: string;
        LocCode: string;
        GRNDate: Date;
        SupID: string;
        SupName: string | null;
        SupInvNo: string | null;
        PONO: string;
        GRNTYPE: string;
        GrossTotal: number;
        DisVal: number;
        Adjestment: number;
        NetTotal: number;
        Confirmed: string;
        Remarks: string | null;
        UserID: string;
      }[]
    >`
      SELECT RTRIM(h.GRNNO) AS GRNNO, RTRIM(h.LocCode) AS LocCode, h.GRNDate AS GRNDate,
             RTRIM(h.SupID) AS SupID, s.SupName AS SupName, h.SupInvNo AS SupInvNo,
             RTRIM(h.PONO) AS PONO, UPPER(h.GRNTYPE) AS GRNTYPE,
             h.GrossTotal AS GrossTotal, h.DisVal AS DisVal, h.Adjestment AS Adjestment,
             h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed,
             h.Remarks AS Remarks, RTRIM(h.UserID) AS UserID
      FROM tbl_grnheader h
      LEFT JOIN tbl_suppliermaster s ON ${keySql("s.SupID")} = ${keySql("h.SupID")}
      WHERE ${keySql("h.LocCode")} = ${keyVal(locCode)} AND ${keySql("h.GRNNO")} = ${keyVal(grnNo)}
      LIMIT 1
    `;
    if (head.length === 0) {
      throw new InvError(`GRN ${grnNo} was not found at this location.`, 404);
    }

    /* BatchNo is read only where the column exists — a receipt saved before
       scripts/add-po-grn-columns.mjs was run must still open. */
    const batchColumn = await hasColumn(prisma, "tbl_grndetails", "BatchNo");

    interface GrnDetailRow {
      LineNo: number;
      ItemCode: string;
      ItemDes: string | null;
      ItemPrintDes: string | null;
      UnitID: string;
      BatchNo?: string | null;
      CostPrice: number;
      RetailPrice: number;
      GRNQty: number;
      FreeQty: number;
      ItemValue: number;
      ExpDate: Date | null;
      UpdItemPrice: number | boolean | null;
      StockBalance: number | null;
    }

    const lines = batchColumn
      ? await prisma.$queryRaw<GrnDetailRow[]>`
          SELECT d.LineNo, RTRIM(d.ItemCode) AS ItemCode, i.ItemDes, i.ItemPrintDes,
                 RTRIM(d.UnitID) AS UnitID, d.BatchNo AS BatchNo, d.CostPrice, d.RetailPrice,
                 d.GRNQty, d.FreeQty, d.ItemValue, d.ExpDate, d.UpdItemPrice, i.StockBalance
          FROM tbl_grndetails d
          LEFT JOIN tbl_itemmaster i
            ON ${keySql("i.LocCode")} = ${keySql("d.LocCode")} AND ${keySql("i.ItemCode")} = ${keySql("d.ItemCode")}
          WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.GRNNo")} = ${keyVal(grnNo)}
          ORDER BY d.LineNo ASC
        `
      : await prisma.$queryRaw<GrnDetailRow[]>`
          SELECT d.LineNo, RTRIM(d.ItemCode) AS ItemCode, i.ItemDes, i.ItemPrintDes,
                 RTRIM(d.UnitID) AS UnitID, d.CostPrice, d.RetailPrice,
                 d.GRNQty, d.FreeQty, d.ItemValue, d.ExpDate, d.UpdItemPrice, i.StockBalance
          FROM tbl_grndetails d
          LEFT JOIN tbl_itemmaster i
            ON ${keySql("i.LocCode")} = ${keySql("d.LocCode")} AND ${keySql("i.ItemCode")} = ${keySql("d.ItemCode")}
          WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.GRNNo")} = ${keyVal(grnNo)}
          ORDER BY d.LineNo ASC
        `;

    const h = head[0];
    return NextResponse.json({
      success: true,
      data: {
        grnNo: trim(h.GRNNO),
        locCode: trim(h.LocCode),
        grnDate: h.GRNDate,
        supID: trim(h.SupID),
        supName: trim(h.SupName),
        supInvNo: trim(h.SupInvNo),
        poNo: trim(h.PONO),
        grnType: trim(h.GRNTYPE) || "GR",
        grossTotal: Number(h.GrossTotal || 0),
        discount: Number(h.DisVal || 0),
        adjustment: Number(h.Adjestment || 0),
        netTotal: Number(h.NetTotal || 0),
        confirmed: trim(h.Confirmed) === "Y",
        remarks: trim(h.Remarks),
        userID: trim(h.UserID),
        lines: lines.map((r) => ({
          lineNo: Number(r.LineNo || 0),
          itemCode: trim(r.ItemCode),
          itemName: trim(r.ItemPrintDes) || trim(r.ItemDes) || trim(r.ItemCode),
          unitID: trim(r.UnitID),
          batchNo: batchColumn ? trim(r.BatchNo) : "",
          costPrice: Number(r.CostPrice || 0),
          retailPrice: Number(r.RetailPrice || 0),
          grnQty: Number(r.GRNQty || 0),
          freeQty: Number(r.FreeQty || 0),
          itemValue: Number(r.ItemValue || 0),
          /* a blank expiry is stored as the legacy empty date 1900-01-01
             (see EMPTY_DATE) because some tables declare the column NOT NULL —
             report it as blank, never as a date in 1900. */
          expDate: isEmptyDate(r.ExpDate) ? null : r.ExpDate,
          // (isEmptyDate is imported with the other field helpers)
          updItemPrice: r.UpdItemPrice === true || Number(r.UpdItemPrice || 0) === 1,
          stockBalance: Number(r.StockBalance || 0),
        })),
      },
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/grn/[grnNo]");
  }
}

/* ── PUT ─────────────────────────────────────────────────────────────────── */

export async function PUT(req: NextRequest, ctx: Ctx) {
  const tag = "PUT /api/inventory/grn/[grnNo]";
  try {
    const actor = await invActor(req);
    const { grnNo } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;

    const locCodeRaw = invId(body.locCode, "Location", 10);
    const supInvNo = trim(body.supInvNo).slice(0, 20);
    const grnDate = invDateField(body.grnDate, "GRN date");
    const remarks = trim(body.remarks).slice(0, 400);
    const discount = invPrice(body.discount, "Discount");
    const adjustment = invPrice(body.adjustment, "Adjustment");
    const rawLines = Array.isArray(body.lines) ? (body.lines as RawGrnLine[]) : [];

    const result = await prisma.$transaction(async (tx) => {
      const locCode = await findLocation(tx, locCodeRaw);
      if (!locCode) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);

      const header = await lockHeader(tx, locCode, invId(grnNo, "GRN number", 15));
      if (trim(header.Confirmed) === "Y") {
        throw new InvError(
          `GRN ${grnNo} is already confirmed — its stock has moved, so it can no longer be edited. Record a return (SRN) instead.`,
          409,
        );
      }

      const poNo = trim(header.PONO);
      let supID = "";
      if (poNo) {
        const po = await tx.$queryRaw<{ SupID: string }[]>`
          SELECT RTRIM(SupID) AS SupID FROM tbl_poheader
          WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONO")} = ${keyVal(poNo)} LIMIT 1
        `;
        supID = trim(po[0]?.SupID);
      } else {
        supID = (await findSupplier(tx, invId(body.supID, "Supplier", 10))) ?? "";
        if (!supID) throw new InvError(`Unknown supplier “${trim(body.supID)}”.`, 400);
      }

      const lines = await buildLines(tx, locCode, poNo, rawLines);
      /* See the create route: a batch number needs tbl_grndetails.BatchNo, and
         a database without it still saves receipts that carry no batch. */
      const batchColumn = await hasColumn(tx, "tbl_grndetails", "BatchNo");
      if (!batchColumn && lines.some((l) => l.batchNo !== "")) {
        throw batchColumnMissing();
      }
      const totals = grnTotals(lines, discount, adjustment);

      await updateGrnHeader(tx, {
        locCode,
        grnNo,
        poNo,
        grnDate,
        supID,
        supInvNo,
        grossTotal: totals.gross,
        discount: totals.discount,
        adjustment: totals.adjustment,
        netTotal: totals.net,
        actorId: actor.userId,
        remarks,
        grnType: "",
        confirmed: false,
      });

      await deleteGrnLines(tx, locCode, grnNo);
      for (const line of lines) {
        await insertGrnLine(tx, locCode, grnNo, { ...line, poNo }, batchColumn);
      }

      return { locCode, netTotal: totals.net, lineCount: lines.length };
    }, { timeout: 20000 });

    await logActivity(
      actor.name,
      "inventory",
      `GRN ${grnNo} updated at ${result.locCode} — ${result.lineCount} line(s), net ${result.netTotal.toFixed(2)}`,
    );

    return NextResponse.json({
      success: true,
      data: { grnNo, locCode: result.locCode, netTotal: result.netTotal },
      message: `GRN ${grnNo} saved.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

/* ── DELETE ──────────────────────────────────────────────────────────────── */

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const tag = "DELETE /api/inventory/grn/[grnNo]";
  try {
    const actor = await invActor(req);
    const { grnNo } = await ctx.params;
    const locCodeRaw = invId(req.nextUrl.searchParams.get("locCode"), "Location", 10);

    const result = await prisma.$transaction(async (tx) => {
      const locCode = await findLocation(tx, locCodeRaw);
      if (!locCode) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);

      const header = await lockHeader(tx, locCode, invId(grnNo, "GRN number", 15));
      if (trim(header.Confirmed) === "Y") {
        throw new InvError(
          `GRN ${grnNo} is confirmed — its stock has moved, so it cannot be deleted. Record a return (SRN) instead.`,
          409,
        );
      }

      await deleteGrnLines(tx, locCode, grnNo);
      await deleteGrnHeader(tx, locCode, grnNo);

      return { locCode };
    }, { timeout: 20000 });

    await logActivity(actor.name, "inventory", `GRN ${grnNo} deleted at ${result.locCode}`);

    return NextResponse.json({ success: true, message: `GRN ${grnNo} deleted.` });
  } catch (err) {
    return invFail(err, tag);
  }
}
