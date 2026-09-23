import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import {
  BILL_TX_OPTIONS,
  BillWriteError,
  applyItemMasterCosts,
  describeDbError,
  resolveLineCodes,
  writeBillTx,
} from "@/lib/billingBillWrite";
import { normaliseBillLines, type BillLineInput } from "@/lib/billingBill";
import { normalisePaymentEntries } from "@/lib/billingPayments";
import { normaliseTaxLines } from "@/lib/billingTaxes";
import { diagnosticsEnabled, diagnosticsDisabledResponse } from "@/lib/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown, fallback = 0) => {
  const value = Number(v);
  return Number.isFinite(value) ? value : fallback;
};

const BILL_TABLES = [
  "tbl_billheader",
  "tbl_billdetail",
  "tbl_billpaytxn",
  "tbl_billtaxes",
] as const;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

/** A sentinel used to roll the dry run back on purpose. */
class DryRunRollback extends Error {}

export async function GET(req: NextRequest) {
  // Switch the diagnostic off for normal salon use: ENABLE_DIAGNOSTICS=false.
  if (!diagnosticsEnabled()) return diagnosticsDisabledResponse();

  const url = new URL(req.url);
  const bookingID = trim(url.searchParams.get("bookingID"));
  const dryRun = ["1", "true", "yes"].includes(
    (url.searchParams.get("dryRun") || "").trim().toLowerCase(),
  );

  if (!bookingID) {
    return NextResponse.json(
      { success: false, error: "Add ?bookingID=… to the URL." },
      { status: 400 },
    );
  }

  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, hint?: string) =>
    checks.push({ name, ok, detail, hint });

  try {
        const headers = await prisma.$queryRaw<
      {
        LocCode: string;
        CusCode: string;
        Status: string;
        BillingTime: Date | null;
        AdvBookingAmount: number | null;
      }[]
    >`
      SELECT
        RTRIM(LocCode)   AS LocCode,
        RTRIM(CusCode)   AS CusCode,
        RTRIM(Status)    AS Status,
        BillingTime      AS BillingTime,
        AdvBookingAmount AS AdvBookingAmount
      FROM tbl_bookingheder
      WHERE RTRIM(BookingID) = ${bookingID}
      LIMIT 1
    `;
    const header = headers[0];
    if (!header) {
      add("booking exists", false, `No booking ${bookingID} in tbl_bookingheder.`);
      return NextResponse.json({ success: false, bookingID, checks });
    }
    const locCode = trim(header.LocCode);
    const billedAt = header.BillingTime ? new Date(header.BillingTime).getTime() : NaN;
    const isBilled =
      Number.isFinite(billedAt) && billedAt > Date.parse("1900-01-02T00:00:00Z");
    const status = trim(header.Status).toUpperCase();

    add("booking exists", true, `${bookingID} at ${locCode}, customer ${trim(header.CusCode)}`);
    add("status is DONE", status === "DONE", `Status = ${status}`);
    add(
      "not billed yet",
      !isBilled,
      isBilled ? `Already billed at ${String(header.BillingTime)}` : "BillingTime is empty",
      isBilled ? "This booking is already billed — pick it from the Billing Dashboard list." : undefined,
    );

        const serialRows = await prisma.$queryRaw<
      { SeriCode: string; SeriNo: string; SeriDate: Date | null }[]
    >`
      SELECT RTRIM(SeriCode) AS SeriCode, TRIM(SeriNo) AS SeriNo, SeriDate
      FROM tbl_serials
      WHERE RTRIM(SeriCode) = 'INV'
      LIMIT 1
    `;
    const serial = serialRows[0];
    add(
      "Tbl_Serials has the INV counter",
      Boolean(serial),
      serial ? `SeriNo = ${trim(serial.SeriNo)} (next bill no. INV…${Number(trim(serial.SeriNo)) + 1})` : "No row with SeriCode = INV",
      serial ? undefined : "Run scripts/add-serials-table.sql — it seeds the INV row without touching a counter that already exists.",
    );

        const columnRows = await prisma.$queryRaw<
      { TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string }[]
    >`
      SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${Prisma.join([...BILL_TABLES])})
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
    const columnsByTable = new Map<string, string[]>();
    columnRows.forEach((row) => {
      const list = columnsByTable.get(row.TABLE_NAME) ?? [];
      list.push(`${row.COLUMN_NAME}:${row.COLUMN_TYPE}`);
      columnsByTable.set(row.TABLE_NAME, list);
    });
    BILL_TABLES.forEach((table) => {
      const columns = columnsByTable.get(table);
      add(
        `${table} exists`,
        Boolean(columns?.length),
        columns?.length ? columns.join(", ") : "table not found",
        columns?.length ? undefined : "This table is missing from the database.",
      );
    });

        let dryRunResult: Record<string, unknown> | null = null;
    if (dryRun) {
      /* Lines can be handed over as JSON (?lines=[{…}]) so the dry run can use
         the same numbers the screen has. Without them the run only exercises
         the header, the payments and the taxes. */
      const linesParam = trim(url.searchParams.get("lines"));
      const bodyLines = linesParam
        ? normaliseBillLines(JSON.parse(linesParam))
        : [];
      const lines: BillLineInput[] = bodyLines.length > 0
        ? await resolveLineCodes(prisma, locCode, bodyLines)
        : [];
      if (lines.length > 0) await applyItemMasterCosts(prisma, locCode, lines);

      const taxes = normaliseTaxLines(
        url.searchParams.get("taxes")
          ? JSON.parse(trim(url.searchParams.get("taxes")))
          : [],
      );
      const payments = normalisePaymentEntries(
        url.searchParams.get("payments")
          ? JSON.parse(trim(url.searchParams.get("payments")))
          : [{ method: "cash", amount: Math.max(0, num(url.searchParams.get("netTotal"), 1)) }],
      );

      try {
        await prisma.$transaction(
          async (tx) => {
            dryRunResult = null;
            const result = await writeBillTx(tx, {
              locCode,
              bookingID,
              lines,
              taxes,
              payments,
              gross: num(url.searchParams.get("gross"), 0),
              discountPercent: num(url.searchParams.get("discountPercent"), 0),
              discountValue: num(url.searchParams.get("discountValue"), 0),
              advAmount: num(header.AdvBookingAmount, 0),
              cusCode: trim(header.CusCode),
              cashierId: "DIAGNOSE",
              remark: "dry run",
            });
            dryRunResult = {
              billNo: result.billNo,
              summary: result.summary,
              detailRows: result.detailRows,
              paymentRows: result.paymentRows,
              taxRows: result.taxRows,
              unmappedLines: result.unmappedLines,
            };
            // Undo everything on purpose: this endpoint must never write a bill.
            throw new DryRunRollback("rollback on purpose");
          },
          BILL_TX_OPTIONS,
        );
        add("dry run committed", false, "The dry run did not roll back — do not use this endpoint again.");
      } catch (err) {
        if (err instanceof DryRunRollback) {
          add(
            "dry run (rolled back)",
            true,
            "BillNo + tbl_billheader + tbl_billdetail + tbl_billpaytxn + tbl_billtaxes + BillingTime all succeeded, then everything was rolled back. Nothing was written.",
          );
        } else {
          const stage = err instanceof BillWriteError ? err.stage : "transaction";
          const cause = err instanceof BillWriteError ? err.cause : err;
          const report = describeDbError(cause);
          add(`dry run failed at “${stage}”`, false, report.message, report.hint);
        }
      }
    }

    const failed = checks.filter((check) => !check.ok);
    return NextResponse.json({
      success: failed.length === 0,
      bookingID,
      locCode,
      dryRun,
      summary: {
        passed: checks.length - failed.length,
        failed: failed.length,
        verdict: failed.length === 0
          ? dryRun
            ? "The bill can be written — every step passed."
            : "The booking is ready to bill."
          : `Blocked by: ${failed.map((check) => check.name).join(", ")}`,
      },
      checks,
      dryRunResult,
    });
  } catch (err) {
    const report = describeDbError(err);
    return NextResponse.json(
      {
        success: false,
        bookingID,
        checks,
        error: report.message,
        hint: report.hint,
      },
      { status: 500 },
    );
  }
}
