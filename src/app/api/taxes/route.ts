import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { normaliseTaxRows, type TaxRow } from "@/lib/billingTaxes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(req: NextRequest) {
  const includeDisabled = ["1", "true", "yes"].includes(
    (new URL(req.url).searchParams.get("all") || "").trim().toLowerCase(),
  );

  /* The full read: every column the live table carries. */
  const fullQuery = (onlyEnabled: boolean) =>
    onlyEnabled
      ? prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT
            RTRIM(TaxCode)             AS TaxCode,
            RTRIM(TaxDescription)      AS TaxDescription,
            TaxPrecentage              AS TaxPrecentage,
            (Enable + 0)               AS Enable,
            ListingOrder               AS ListingOrder,
            (ServiceCharge + 0)        AS ServiceCharge,
            (ItemBasedTax + 0)         AS ItemBasedTax
          FROM tbl_taxes
          WHERE Enable = 1
          ORDER BY ListingOrder IS NULL, ListingOrder, TaxDescription
        `
      : prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT
            RTRIM(TaxCode)             AS TaxCode,
            RTRIM(TaxDescription)      AS TaxDescription,
            TaxPrecentage              AS TaxPrecentage,
            (Enable + 0)               AS Enable,
            ListingOrder               AS ListingOrder,
            (ServiceCharge + 0)        AS ServiceCharge,
            (ItemBasedTax + 0)         AS ItemBasedTax
          FROM tbl_taxes
          ORDER BY ListingOrder IS NULL, ListingOrder, TaxDescription
        `;

  /* Older copies of the database only have the four “core” columns — fall back
     to those instead of failing the whole bill. */
  const basicQuery = (onlyEnabled: boolean) =>
    onlyEnabled
      ? prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT
            RTRIM(TaxCode)        AS TaxCode,
            RTRIM(TaxDescription) AS TaxDescription,
            TaxPrecentage         AS TaxPrecentage,
            (Enable + 0)          AS Enable
          FROM tbl_taxes
          WHERE Enable = 1
          ORDER BY TaxDescription
        `
      : prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT
            RTRIM(TaxCode)        AS TaxCode,
            RTRIM(TaxDescription) AS TaxDescription,
            TaxPrecentage         AS TaxPrecentage,
            (Enable + 0)          AS Enable
          FROM tbl_taxes
          ORDER BY TaxDescription
        `;

  try {
    let rows: Record<string, unknown>[];
    try {
      rows = await fullQuery(!includeDisabled);
    } catch (err) {
      console.warn("[GET /api/taxes] falling back to the basic column set:", err);
      rows = await basicQuery(!includeDisabled);
    }

    /* normaliseTaxRows() trims the fixed-width columns, converts the BIT(1)
       flags and drops anything with Enable = 0. */
    const data: TaxRow[] = normaliseTaxRows(rows.map((row, index) => ({
      ...row,
      ListingOrder: row.ListingOrder ?? index,
    })));

    return NextResponse.json({ success: true, count: data.length, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load taxes";
    console.error("[GET /api/taxes]", err);
    return NextResponse.json(
      {
        success: false,
        error: message,
        hint: "Check that tbl_taxes exists and that TaxCode / TaxDescription / TaxPrecentage / Enable / ListingOrder / ServiceCharge / ItemBasedTax are readable.",
      },
      { status: 500 },
    );
  }
}
