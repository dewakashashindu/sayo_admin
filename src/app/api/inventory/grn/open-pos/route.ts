// src/app/api/inventory/grn/open-pos/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/grn/open-pos?locCode=…&supID=…
//
// The PO dropdown on the GRN screen: CONFIRMED purchase orders at this location
// that still have something to receive.
//
//   { success, data: [ { poNo, supID, supName, poDate, openLines, openValue } ] }
//
// Only confirmed orders appear (a pending order must be confirmed first — that
// is the whole point of the Confirmation button), and only those with at least
// one line whose POQty is still above what has been received.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { invFail, invId,
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

export async function GET(req: NextRequest) {
  try {
    const locCode = invId(req.nextUrl.searchParams.get("locCode"), "Location", 10);
    const supID = trim(req.nextUrl.searchParams.get("supID"));

    const where: Prisma.Sql[] = [
      Prisma.sql`AND ${keySql("h.LocCode")} = ${keyVal(locCode)}`,
      Prisma.sql`AND UPPER(h.Confirmed) = 'Y'`,
    ];
    if (supID) where.push(Prisma.sql`AND ${keySql("h.SupID")} = ${keyVal(supID)}`);
    const filters: Prisma.Sql = where.length ? Prisma.join(where, " ") : Prisma.empty;

    const rows = await prisma.$queryRaw<
      {
        PONO: string;
        SupID: string;
        SupName: string | null;
        PODate: Date;
        DueDate: Date;
        OpenLines: bigint | number;
        OpenValue: number | null;
      }[]
    >`
      SELECT
        RTRIM(h.PONO)   AS PONO,
        RTRIM(h.SupID)  AS SupID,
        s.SupName       AS SupName,
        h.PODate        AS PODate,
        h.DueDate       AS DueDate,
        SUM(CASE WHEN d.POQty > d.GRNQty THEN 1 ELSE 0 END) AS OpenLines,
        SUM(CASE WHEN d.POQty > d.GRNQty
                 THEN (d.POQty - d.GRNQty) * d.CostPrice ELSE 0 END) AS OpenValue
      FROM tbl_poheader h
      JOIN tbl_podetails d
        ON ${keySql("d.LocCode")} = ${keySql("h.LocCode")} AND ${keySql("d.PONo")} = ${keySql("h.PONO")}
      LEFT JOIN tbl_suppliermaster s ON ${keySql("s.SupID")} = ${keySql("h.SupID")}
      WHERE 1 = 1 ${filters}
      GROUP BY h.PONO, h.LocCode, h.PODate, h.DueDate, h.SupID, s.SupName
      HAVING SUM(CASE WHEN d.POQty > d.GRNQty THEN 1 ELSE 0 END) > 0
      ORDER BY h.PODate ASC, h.PONO ASC
      LIMIT 300
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        poNo: trim(r.PONO),
        supID: trim(r.SupID),
        supName: trim(r.SupName),
        poDate: r.PODate,
        dueDate: r.DueDate,
        openLines: Number(r.OpenLines || 0),
        openValue: Number(r.OpenValue || 0),
      })),
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/grn/open-pos");
  }
}
