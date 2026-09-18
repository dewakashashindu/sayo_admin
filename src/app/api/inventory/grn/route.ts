// src/app/api/inventory/grn/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/inventory/grn      ?locCode=…&status=confirmed|pending&type=gr|dg&q=…
// POST /api/inventory/grn      body: {
//          locCode, poNo?, supID?, supInvNo, grnDate, remarks, discount,
//          adjustment, confirm,
//          lines: [{ itemCode, unitID, batchNo, costPrice, retailPrice, grnQty,
//                    freeQty, expDate, updItemPrice }] }
//
// A GRN is either
//   GR  — against a CONFIRMED purchase order (PONO filled, GRNTYPE 'GR'), or
//   DG  — a DIRECT GRN with no order behind it (PONO empty, GRNTYPE 'DG').
//
// WHAT THIS ROUTE DOES NOT DO
// Stock is NOT moved here. A saved-but-not-confirmed GRN is a document; the
// stock, the ledger row, the PO write-back and the item-master price all happen
// in POST /api/inventory/grn/:grnNo/confirm — one transaction, once.
//
// OVER-RECEIPT is checked at save (so the user hears about it immediately) and
// again at confirm, which is the authoritative check.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
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
  invPrice,
  invVarChar,
  invQty,
  InvError,
  resolveItems,
  insertGrnHeader,
  insertGrnLine,
  keySql,
  keyVal,
}from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

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

/* ── GET — list ──────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const locCode = trim(sp.get("locCode"));
    const status = trim(sp.get("status")).toLowerCase();
    const type = trim(sp.get("type")).toLowerCase();
    const q = trim(sp.get("q"));
    const limit = Math.min(Math.max(Number(sp.get("limit") || 300) || 300, 1), 500);

    const where: Prisma.Sql[] = [];
    // Prisma.join([]) throws — with no filters the list is simply empty SQL.
    const filters = (): Prisma.Sql => (where.length ? Prisma.join(where, " ") : Prisma.empty);
    if (locCode) where.push(Prisma.sql`AND ${keySql("h.LocCode")} = ${keyVal(locCode)}`);
    if (status === "confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed) = 'Y'`);
    if (status === "pending") where.push(Prisma.sql`AND UPPER(h.Confirmed) <> 'Y'`);
    if (type === "gr") where.push(Prisma.sql`AND UPPER(h.GRNTYPE) = 'GR'`);
    if (type === "dg") where.push(Prisma.sql`AND UPPER(h.GRNTYPE) = 'DG'`);
    if (q) {
      where.push(Prisma.sql`AND (${keySql("h.GRNNO")} LIKE ${`%${q}%`}
                              OR h.SupInvNo LIKE ${`%${q}%`}
                              OR s.SupName LIKE ${`%${q}%`}
                              OR ${keySql("h.PONO")} LIKE ${`%${q}%`})`);
    }

    const rows = await prisma.$queryRaw<
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
        UserID: string;
        LineCount: bigint | number;
      }[]
    >`
      SELECT
        RTRIM(h.GRNNO)              AS GRNNO,
        RTRIM(h.LocCode)            AS LocCode,
        h.GRNDate                   AS GRNDate,
        RTRIM(h.SupID)              AS SupID,
        s.SupName                   AS SupName,
        h.SupInvNo                  AS SupInvNo,
        RTRIM(h.PONO)               AS PONO,
        UPPER(h.GRNTYPE)     AS GRNTYPE,
        h.GrossTotal                AS GrossTotal,
        h.DisVal                    AS DisVal,
        h.Adjestment                AS Adjestment,
        h.NetTotal                  AS NetTotal,
        UPPER(h.Confirmed)   AS Confirmed,
        RTRIM(h.UserID)             AS UserID,
        (SELECT COUNT(*) FROM tbl_grndetails d
          WHERE ${keySql("d.LocCode")} = ${keySql("h.LocCode")} AND ${keySql("d.GRNNo")} = ${keySql("h.GRNNO")}) AS LineCount
      FROM tbl_grnheader h
      LEFT JOIN tbl_suppliermaster s ON ${keySql("s.SupID")} = ${keySql("h.SupID")}
      WHERE 1 = 1 ${filters()}
      ORDER BY h.GRNDate DESC, h.GRNNO DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        grnNo: trim(r.GRNNO),
        locCode: trim(r.LocCode),
        grnDate: r.GRNDate,
        supID: trim(r.SupID),
        supName: trim(r.SupName),
        supInvNo: trim(r.SupInvNo),
        poNo: trim(r.PONO),
        grnType: trim(r.GRNTYPE) || "GR",
        grossTotal: Number(r.GrossTotal || 0),
        discount: Number(r.DisVal || 0),
        adjustment: Number(r.Adjestment || 0),
        netTotal: Number(r.NetTotal || 0),
        confirmed: trim(r.Confirmed) === "Y",
        userID: trim(r.UserID),
        lineCount: Number(r.LineCount || 0),
      })),
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/grn");
  }
}

/* ── POST — save ─────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const tag = "POST /api/inventory/grn";
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as Record<string, unknown>;

    const locCodeRaw = invId(body.locCode, "Location", 10);
    const poNoRaw = trim(body.poNo);
    const supInvNo = trim(body.supInvNo).slice(0, 20);
    const grnDate = invDateField(body.grnDate ?? new Date().toISOString().slice(0, 10), "GRN date");
    const remarks = trim(body.remarks).slice(0, 400);
    const discount = invPrice(body.discount, "Discount");
    const adjustment = invPrice(body.adjustment, "Adjustment");
    const confirmNow = body.confirm === true || trim(body.confirm) === "1" || body.confirm === "Y";

    const rawLines = Array.isArray(body.lines) ? (body.lines as RawGrnLine[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

    const saved = await prisma.$transaction(async (tx) => {
      const locCode = await findLocation(tx, locCodeRaw);
      if (!locCode) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);

      /* ── the purchase order behind the receipt (optional) ── */
      let poNo = "";
      let supID = "";
      if (poNoRaw) {
        poNo = invId(poNoRaw, "PO number", 10);
        const po = await tx.$queryRaw<
          { PONO: string; SupID: string; Confirmed: string }[]
        >`
          SELECT RTRIM(PONO) AS PONO, RTRIM(SupID) AS SupID, UPPER(Confirmed) AS Confirmed
          FROM tbl_poheader
          WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONO")} = ${keyVal(poNo)}
          LIMIT 1
        `;
        if (po.length === 0) {
          throw new InvError(`Purchase order ${poNo} was not found at this location.`, 404);
        }
        if (trim(po[0].Confirmed) !== "Y") {
          throw new InvError(
            `Purchase order ${poNo} is still pending confirmation — confirm the order before receiving goods against it.`,
            409,
          );
        }
        supID = trim(po[0].SupID);
      } else {
        supID = (await findSupplier(tx, invId(body.supID, "Supplier", 10))) ?? "";
        if (!supID) throw new InvError(`Unknown supplier “${trim(body.supID)}”.`, 400);
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

      /* Lines of a PO-backed GRN must belong to that order. */
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
            const item = items.get(code);
            throw new InvError(
              `“${item?.des ?? code}” is not a line of purchase order ${poNo}. Remove it or receive it on a direct GRN.`,
            );
          }
        }
        /* Over-receipt — the same rule the confirm step enforces. */
        for (const raw of rawLines) {
          const code = itemCode(raw.itemCode);
          const line = onPo.get(code)!;
          const receiving = Number(raw.grnQty || 0);
          const over = overReceiptQty(line.POQty, line.GRNQty, receiving);
          if (over > 0) {
            const item = items.get(code);
            throw new InvError(
              `Receiving ${receiving} of “${item?.des ?? code}” goes ${over} past what ${poNo} still has open (${(Number(line.POQty) - Number(line.GRNQty)).toFixed(3)} left).`,
              409,
            );
          }
        }
      }

      /* ── the lines being stored ── */
      const lines = rawLines.map((raw, index) => {
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
          unitID: invId(raw.unitID || item.unitID || "", `Unit of ${item.des}`, 15),
          batchNo: invVarChar(raw.batchNo ?? "", 50),
          costPrice,
          retailPrice,
          grnQty,
          freeQty,
          itemValue: grnLineValue(costPrice, grnQty, freeQty),
          expDate: invOptionalDate(raw.expDate, `Expiry date of ${item.des}`),
          updItemPrice: raw.updItemPrice === true || trim(raw.updItemPrice) === "1",
          serviceItem: item.serviceItem,
        };
      });

      /* Batch numbers need tbl_grndetails.BatchNo. On a database that has not
         had scripts/add-po-grn-columns.mjs run on it yet, a receipt WITHOUT
         batch numbers still saves — only a typed batch number is refused, and
         the message says exactly which one-liner adds the column. */
      const batchColumn = await hasColumn(tx, "tbl_grndetails", "BatchNo");
      if (!batchColumn && lines.some((l) => l.batchNo !== "")) {
        throw batchColumnMissing();
      }

      const totals = grnTotals(lines, discount, adjustment);
      const grnNo = await nextSerialTx(tx, SERIAL_CODES.goodsReceived);
      const grnType = poNo ? "GR" : "DG";

      await insertGrnHeader(tx, {
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
        grnType,
        confirmed: confirmNow,
      });

      for (const line of lines) {
        await insertGrnLine(tx, locCode, grnNo, { ...line, poNo }, batchColumn);
      }

      return { grnNo, locCode, poNo, grnType, netTotal: totals.net, lineCount: lines.length };
    }, { timeout: 20000 });

    await logActivity(
      actor.name,
      "inventory",
      `GRN ${saved.grnNo} saved at ${saved.locCode}${saved.poNo ? ` against ${saved.poNo}` : " (direct)"} — ${saved.lineCount} line(s), net ${saved.netTotal.toFixed(2)}`,
    );

    return NextResponse.json({
      success: true,
      data: {
        grnNo: saved.grnNo,
        locCode: saved.locCode,
        poNo: saved.poNo,
        grnType: saved.grnType,
        netTotal: saved.netTotal,
        lineCount: saved.lineCount,
      },
      message: `GRN ${saved.grnNo} saved. Stock moves when you press Confirmation.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
