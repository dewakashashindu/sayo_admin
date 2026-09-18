// src/app/api/inventory/po/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/inventory/po        ?locCode=…&status=confirmed|pending&q=…
// POST /api/inventory/po        body: {
//          locCode, supID, poDate, dueDate, deliAdd, remarks, confirm,
//          lines: [{ itemCode, unitID, costPrice, poQty }] }
//
// READING      the list is a raw query that RTRIMs every CHAR column (a padded
//              literal never matches a NO PAD collation) and joins the supplier
//              name so the screen shows who the order is for.
// WRITING      one transaction: resolve the location, the supplier and every
//              item against the real tables, take the next PO number from
//              Tbl_Serials, then write header + lines.
//
// MONEY        ItemValue and NetTotal are calculated HERE with the pure
//              functions in src/lib/inventoryTotals.ts — the browser's totals
//              are never stored. The cost price itself is an entered value (a
//              PO records what the supplier quoted), but an empty cost falls
//              back to tbl_itemmaster so a line can never be worth 0 by accident.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
import { poLineValue, poNetTotal } from "@/lib/inventoryTotals";
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
  insertPoHeader,
  insertPoLine,
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

interface RawPoLine {
  itemCode?: unknown;
  unitID?: unknown;
  costPrice?: unknown;
  poQty?: unknown;
}

/* ── GET — list ──────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const locCode = trim(sp.get("locCode"));
    const status = trim(sp.get("status")).toLowerCase();
    const q = trim(sp.get("q"));
    const limit = Math.min(Math.max(Number(sp.get("limit") || 300) || 300, 1), 500);

    const where: Prisma.Sql[] = [];
    // Prisma.join([]) throws — with no filters the list is simply empty SQL.
    const filters = (): Prisma.Sql => (where.length ? Prisma.join(where, " ") : Prisma.empty);
    if (locCode) where.push(Prisma.sql`AND ${keySql("h.LocCode")} = ${keyVal(locCode)}`);
    if (status === "confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed) = 'Y'`);
    if (status === "pending") where.push(Prisma.sql`AND UPPER(h.Confirmed) <> 'Y'`);
    if (q) where.push(Prisma.sql`AND (${keySql("h.PONO")} LIKE ${`%${q}%`} OR s.SupName LIKE ${`%${q}%`})`);

    const rows = await prisma.$queryRaw<
      {
        PONO: string;
        LocCode: string;
        LocDes: string | null;
        PODate: Date;
        DueDate: Date;
        SupID: string;
        SupName: string | null;
        NetTotal: number;
        Confirmed: string;
        UserID: string;
        Remarks: string | null;
        LineCount: bigint | number;
        Received: number;
      }[]
    >`
      SELECT
        RTRIM(h.PONO)                 AS PONO,
        RTRIM(h.LocCode)              AS LocCode,
        l.LocDes                      AS LocDes,
        h.PODate                      AS PODate,
        h.DueDate                     AS DueDate,
        RTRIM(h.SupID)                AS SupID,
        s.SupName                     AS SupName,
        h.NetTotal                    AS NetTotal,
        UPPER(h.Confirmed)     AS Confirmed,
        RTRIM(h.UserID)               AS UserID,
        h.Remarks                     AS Remarks,
        (SELECT COUNT(*) FROM tbl_podetails d
          WHERE ${keySql("d.LocCode")} = ${keySql("h.LocCode")} AND ${keySql("d.PONo")} = ${keySql("h.PONO")}) AS LineCount,
        (SELECT COUNT(*) FROM tbl_podetails d
          WHERE ${keySql("d.LocCode")} = ${keySql("h.LocCode")} AND ${keySql("d.PONo")} = ${keySql("h.PONO")} AND d.GRNQty > 0) AS Received
      FROM tbl_poheader h
      LEFT JOIN tbl_suppliermaster s ON ${keySql("s.SupID")} = ${keySql("h.SupID")}
      LEFT JOIN tbl_locationmaster l ON ${keySql("l.LocCode")} = ${keySql("h.LocCode")}
      WHERE 1 = 1 ${filters()}
      ORDER BY h.PODate DESC, h.PONO DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        poNo: trim(r.PONO),
        locCode: trim(r.LocCode),
        locDes: trim(r.LocDes),
        poDate: r.PODate,
        dueDate: r.DueDate,
        supID: trim(r.SupID),
        supName: trim(r.SupName),
        netTotal: Number(r.NetTotal || 0),
        confirmed: trim(r.Confirmed) === "Y",
        userID: trim(r.UserID),
        remarks: trim(r.Remarks),
        lineCount: Number(r.LineCount || 0),
        received: Number(r.Received || 0) > 0,
      })),
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/po");
  }
}

/* ── POST — create ───────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const tag = "POST /api/inventory/po";
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as Record<string, unknown>;

    const locCodeRaw = invId(body.locCode, "Location", 10);
    const supIDRaw = invId(body.supID, "Supplier", 10);
    const poDate = invDateField(body.poDate ?? new Date().toISOString().slice(0, 10), "PO date");
    const dueDate = invDateField(body.dueDate ?? poDate, "PO due date");
    const deliAdd = trim(body.deliAdd).slice(0, 100);
    const remarks = trim(body.remarks).slice(0, 1500);
    const confirmNow = body.confirm === true || trim(body.confirm) === "1" || body.confirm === "Y";

    const rawLines = Array.isArray(body.lines) ? (body.lines as RawPoLine[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

    const result = await prisma.$transaction(async (tx) => {
      /* Everything is resolved against the database first: the codes that are
         stored are the ones the tables hold, not the ones the browser sent. */
      const locCode = await findLocation(tx, locCodeRaw);
      if (!locCode) throw new InvError(`Unknown location “${locCodeRaw}”.`, 400);
      const supID = await findSupplier(tx, supIDRaw);
      if (!supID) throw new InvError(`Unknown supplier “${supIDRaw}”.`, 400);

      const items = await resolveItems(
        tx,
        locCode,
        rawLines.map((l) => itemCode(l.itemCode)),
      );
      const missing = rawLines
        .map((l) => invId(l.itemCode, "Item code", 50))
        .filter((code) => !items.has(itemCode(code)));
      if (missing.length) {
        throw new InvError(
          `These item codes are not in the item master for this location: ${missing.join(", ")}.`,
        );
      }

      const lines = rawLines.map((line, index) => {
        const code = itemCode(line.itemCode);
        const item = items.get(code)!;
        const qty = invQty(line.poQty, `Quantity of ${item.des}`);
        // An entered cost price wins (that is the supplier's quote); when it is
        // empty the item-master cost is used, never 0 by accident.
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
      const poNo = await nextSerialTx(tx, SERIAL_CODES.purchaseOrder);

      await insertPoHeader(tx, {
        locCode,
        poNo,
        poDate,
        dueDate,
        supID,
        netTotal,
        actorId: actor.userId,
        remarks,
        deliAdd,
        confirmed: confirmNow,
      });

      for (const line of lines) {
        await insertPoLine(tx, locCode, poNo, line);
      }

      return { poNo, locCode, supID, netTotal, confirmNow, lineCount: lines.length };
    }, { timeout: 20000 });

    await logActivity(
      actor.name,
      "inventory",
      `Purchase order ${result.poNo} saved for ${result.locCode} — ${result.lineCount} line(s), net ${result.netTotal.toFixed(2)}${result.confirmNow ? " (confirmed)" : " (pending)"}`,
    );

    return NextResponse.json({
      success: true,
      data: {
        poNo: result.poNo,
        locCode: result.locCode,
        supID: result.supID,
        netTotal: result.netTotal,
        confirmed: result.confirmNow,
        lineCount: result.lineCount,
      },
      message: `Purchase order ${result.poNo} saved${result.confirmNow ? " and confirmed" : ""}.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
