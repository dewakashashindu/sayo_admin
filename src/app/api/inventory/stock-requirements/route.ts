// src/app/api/inventory/stock-requirements/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/stock-requirements?locCode=…
//
// The third tab of the legacy Purchase Order screen — "Current Stock
// Requirements". Every stock item at this location that has fallen to (or
// below) its reorder level, with the quantity to order.
//
//   { success, data: [ { itemCode, itemName, unitID, stockBalance, rol, roq,
//                        minQty, maxQty, shortage, suggestedQty, costPrice,
//                        supID, supName } ] }
//
// Supplier-wise on the screen: the rows are returned in one list and the page
// groups them by supID — this route stays ordered shortage-first, so the worst
// shortage is at the top of each supplier block.
//
// costPrice is the same rule the PO screen uses when an item is picked by hand
// (src/lib/inventoryServer.ts, resolveItems): OverallCost when the master has
// one, otherwise RawCost. It lets the ticked items arrive on the order with a
// cost price already in the box, still editable.
//
// The suggested quantity comes from src/lib/inventoryTotals.ts
// (`suggestedOrderQty`) so the screen and the tests agree on the rule:
// ROQ when it is set, otherwise MaxQty − StockBalance, never below 1.
//
// Services (tbl_itemmaster.ServiceItem = 1) are excluded on purpose — a
// haircut is never reordered, and it never had stock to begin with.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { invFail, invId,
  keySql,
  keyVal,
}from "@/lib/inventoryServer";
import { shortageLevel, suggestedOrderQty } from "@/lib/inventoryTotals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  try {
    const locCode = invId(req.nextUrl.searchParams.get("locCode"), "Location", 10);
    const includeInactive = trim(req.nextUrl.searchParams.get("includeInactive")) === "1";
    // Which rows may be suggested: a disabled item is hidden unless asked for.
    // (An explicit Prisma.Sql fragment — an interpolation can only ever be one
    // value, never a piece of SQL.)
    const enableFilter = includeInactive
      ? Prisma.sql`1 = 1`
      : Prisma.sql`COALESCE(CAST(i.Enable AS UNSIGNED), 1) = 1`;

    const rows = await prisma.$queryRaw<
      {
        ItemCode: string;
        ItemDes: string | null;
        ItemPrintDes: string | null;
        MasterUnitID: string;
        StockBalance: number | null;
        ROL: number | null;
        ROQ: number | null;
        MinQty: number | null;
        MaxQty: number | null;
        RawCost: number | null;
        OverallCost: number | null;
        SupID: string;
        SupName: string | null;
        Enable: number | null;
      }[]
    >`
      SELECT
        RTRIM(i.ItemCode)        AS ItemCode,
        i.ItemDes                AS ItemDes,
        i.ItemPrintDes           AS ItemPrintDes,
        RTRIM(i.MasterUnitID)    AS MasterUnitID,
        i.StockBalance           AS StockBalance,
        i.ROL                    AS ROL,
        i.ROQ                    AS ROQ,
        i.MinQty                 AS MinQty,
        i.MaxQty                 AS MaxQty,
        i.RawCost                AS RawCost,
        i.OverallCost            AS OverallCost,
        RTRIM(i.SupID)           AS SupID,
        s.SupName                AS SupName,
        COALESCE(CAST(i.Enable AS UNSIGNED), 1) AS Enable
      FROM tbl_itemmaster i
      LEFT JOIN tbl_suppliermaster s ON ${keySql("s.SupID")} = ${keySql("i.SupID")}
      WHERE ${keySql("i.LocCode")} = ${keyVal(locCode)}
        AND COALESCE(CAST(i.ServiceItem AS UNSIGNED), 0) = 0
        AND ${enableFilter}
        AND (
          (i.ROL > 0 AND i.StockBalance <= i.ROL)
          OR (COALESCE(i.ROL, 0) <= 0 AND i.MinQty > 0 AND i.StockBalance <= i.MinQty)
        )
      ORDER BY (COALESCE(i.ROL, i.MinQty) - i.StockBalance) DESC, i.ItemDes ASC
      LIMIT 500
    `;

    const data = rows
      .map((r) => {
        const item = {
          stockBalance: Number(r.StockBalance || 0),
          rol: Number(r.ROL || 0),
          roq: Number(r.ROQ || 0),
          minQty: Number(r.MinQty || 0),
          maxQty: Number(r.MaxQty || 0),
        };
        return {
          itemCode: trim(r.ItemCode),
          itemName: trim(r.ItemPrintDes) || trim(r.ItemDes) || trim(r.ItemCode),
          unitID: trim(r.MasterUnitID),
          ...item,
          shortage: shortageLevel(item),
          suggestedQty: suggestedOrderQty(item),
          /* master cost — OverallCost when set, otherwise RawCost */
          costPrice: Number(r.OverallCost ?? 0) || Number(r.RawCost ?? 0) || 0,
          supID: trim(r.SupID),
          supName: trim(r.SupName),
          enable: Number(r.Enable ?? 1) === 1,
        };
      })
      .filter((r) => r.suggestedQty > 0);

    return NextResponse.json({ success: true, locCode, count: data.length, data });
  } catch (err) {
    return invFail(err, "GET /api/inventory/stock-requirements");
  }
}
