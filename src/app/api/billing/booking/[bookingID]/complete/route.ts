import { NextRequest, NextResponse } from "next/server";
import { locationGuard } from "@/lib/locationScope";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { normalisePaymentEntries } from "@/lib/billingPayments";
import { normaliseTaxLines } from "@/lib/billingTaxes";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/adminSession";
import {
  billSummaryProblems,
  buildBillSummary,
  mergeBillLines,
  normaliseBillLines,
  shortCode,
  type BillLineInput,
} from "@/lib/billingBill";
import {
  BILL_TX_OPTIONS,
  BillWriteError,
  applyItemMasterCosts,
  describeDbError,
  resolveLineCodes,
  writeBillTx,
} from "@/lib/billingBillWrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown, fallback = 0) => {
  const value = Number(v);
  return Number.isFinite(value) ? value : fallback;
};

interface HeaderRow {
  LocCode: string;
  CusCode: string;
  Status: string;
  BillingTime: Date | null;
  AdvBookingAmount: number | null;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    /* Flexible partial billing: the cashier may bill only a selected subset of
       the booking's DONE services. When `services` is present we bill just
       those rows (and stamp them billed) instead of requiring the whole
       booking to be DONE. */
    const partialServices = Array.isArray(body.services)
      ? (body.services as Array<Record<string, unknown>>).map((s) => ({
          serviceIndex: num(s.serviceIndex, -1),
          guessID: trim(s.guessID).toUpperCase() || "MAIN",
          itemCode: trim(s.itemCode),
        }))
      : [];
    const isPartial = partialServices.length > 0;

        const session = await verifyAdminToken(
      req.cookies.get(ADMIN_COOKIE)?.value,
    );
    const cashierId = shortCode(session?.uid ?? "");

        const headerRows = await prisma.$queryRaw<HeaderRow[]>`
      SELECT
        RTRIM(LocCode)             AS LocCode,
        RTRIM(CusCode)             AS CusCode,
        RTRIM(Status)              AS Status,
        BillingTime                AS BillingTime,
        AdvBookingAmount           AS AdvBookingAmount
      FROM tbl_bookingheder
      WHERE RTRIM(BookingID) = ${bookingID}
      LIMIT 1
    `;
    const header = headerRows[0];
    if (!header) {
      return NextResponse.json(
        { success: false, message: "Booking not found" },
        { status: 404 },
      );
    }
    const locCode = trim(header.LocCode);
    /* branch guard — the booking's location must be one this caller was given */
    {
      const stop = await locationGuard(req, locCode);
      if (stop) return stop;
    }


    // Legacy rows carry the 1900-01-01 zero date instead of NULL for "not billed".
    const billedAt = header.BillingTime
      ? new Date(header.BillingTime).getTime()
      : NaN;
    if (Number.isFinite(billedAt) && billedAt > Date.parse("1900-01-02T00:00:00Z")) {
      return NextResponse.json(
        {
          success: false,
          message: "This booking is already billed — open it from the Billing Dashboard list.",
        },
        { status: 409 },
      );
    }
    if (!isPartial && trim(header.Status).toUpperCase() !== "DONE") {
      return NextResponse.json(
        {
          success: false,
          message: "Technician has not marked the work done yet",
        },
        { status: 409 },
      );
    }

    /* For a partial bill, every selected row must actually be Done, not
       cancelled, and not already billed — otherwise we would bill work that
       was never finished or bill the same service twice. */
    if (isPartial) {
      const stamp = (v: Date | null) =>
        v !== null && new Date(v).getTime() > Date.parse("1900-01-02T00:00:00Z");
      /* CheckInTime lives on tbl_bookingtxndetail, NOT on the service-detail
         table — it must not be selected here. ServiceBilledTime is read in a
         separate safe query because it only exists after the rev-10 migration. */
      const rows = await prisma.$queryRaw<
        { ScheduleIndex: number; GuessID: string; ServiceItemID: string; ServiceDoneTime: Date | null; ServiceCancelledDate: Date | null }[]
      >`
        SELECT ScheduleIndex, RTRIM(GuessID) GuessID, RTRIM(ServiceItemID) ServiceItemID,
               ServiceDoneTime, ServiceCancelledDate
        FROM tbl_bookingservicedetail
        WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
      `;
      const billedSet = new Set<number>();
      try {
        const billedRows = await prisma.$queryRaw<
          { ScheduleIndex: number; ServiceBilledTime: Date | null }[]
        >`
          SELECT ScheduleIndex, ServiceBilledTime
          FROM tbl_bookingservicedetail
          WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
        `;
        for (const b of billedRows) {
          if (stamp(b.ServiceBilledTime)) billedSet.add(b.ScheduleIndex ?? -1);
        }
      } catch {
        /* Billed columns absent — nothing is billed yet. */
      }
      for (const want of partialServices) {
        const row = rows.find(
          (r) =>
            (r.ScheduleIndex ?? -1) === want.serviceIndex &&
            (trim(r.GuessID).toUpperCase() || "MAIN") === want.guessID,
        );
        const ok =
          row &&
          stamp(row.ServiceDoneTime) &&
          !stamp(row.ServiceCancelledDate) &&
          !billedSet.has(row.ScheduleIndex ?? -1);
        if (!ok) {
          return NextResponse.json(
            {
              success: false,
              message:
                "A selected service is not in a billable state (it must be Done, not cancelled, and not already billed).",
            },
            { status: 409 },
          );
        }
      }
    }

        const preparedLines = await resolveLineCodes(
      prisma,
      locCode,
      normaliseBillLines(body.lines),
    );
    const mappedLines: BillLineInput[] = mergeBillLines(preparedLines).map((row) => ({
      itemId: row.itemId,
      name: "",
      qty: row.qty,
      price: row.salesPrice,
      costPrice: row.costPrice,
    }));
    await applyItemMasterCosts(prisma, locCode, mappedLines);

        const taxLines = normaliseTaxLines(body.taxes);

        const bill = buildBillSummary(
      taxLines,
      num(body.gross, 0),
      num(body.discountPercent, 0),
      num(body.discountValue, 0),
      num(header.AdvBookingAmount, 0),
    );
    const problems = billSummaryProblems(bill, num(body.netTotal, NaN));
    if (problems.length > 0) {
      return NextResponse.json(
        { success: false, message: problems[0], problems, stage: "validation" },
        { status: 400 },
      );
    }

        const payments = normalisePaymentEntries(body.payments);
    if (payments.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Add at least one payment line before completing the bill.",
          stage: "validation",
        },
        { status: 400 },
      );
    }

    const remark = trim(body.remark).substring(0, 200);

        let written;
    try {
      written = await prisma.$transaction(
        (tx) =>
          writeBillTx(tx, {
            locCode,
            bookingID,
            lines: mappedLines,
            taxes: taxLines,
            payments,
            gross: num(body.gross, 0),
            discountPercent: num(body.discountPercent, 0),
            discountValue: num(body.discountValue, 0),
            advAmount: num(header.AdvBookingAmount, 0),
            cusCode: trim(header.CusCode),
            cashierId,
            remark,
            /* rev 29: pax + per-line technician commission split. The
               UN-merged lines carry the technician names. */
            pax: num(body.pax, 0),
            commissionLines: preparedLines,
          }),
        BILL_TX_OPTIONS,
      );
    } catch (err) {
      /* Nothing was written (the transaction rolled back). Say exactly which
         step failed and why, instead of a generic message. */
      const stage = err instanceof BillWriteError ? err.stage : "transaction";
      const cause = err instanceof BillWriteError ? err.cause : err;
      const report = describeDbError(cause);
      console.error(`[billing-complete] failed at ${stage}:`, cause);
      return NextResponse.json(
        {
          success: false,
          stage,
          message: `The bill was not saved — the step “${stage}” failed.`,
          detail: report.message,
          hint: report.hint,
        },
        { status: 500 },
      );
    }

    const { billNo, summary, detailRows, taxRows, paymentRows } = written;

    /* Partial bill: stamp the selected rows as billed, then decide whether the
       booking stays open (more billable services remain) or closes as DONE. */
    if (isPartial) {
      try {
        for (const want of partialServices) {
          await prisma.$executeRaw`
            UPDATE tbl_bookingservicedetail
            SET ServiceBilledTime = NOW(), ServiceBillNo = ${billNo}
            WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
              AND ScheduleIndex = ${want.serviceIndex}
              AND (UPPER(RTRIM(GuessID)) = ${want.guessID}
                   OR (${want.guessID} = 'MAIN' AND RTRIM(GuessID) = ''))
          `;
        }
        const remaining = await prisma.$queryRaw<{ n: number | bigint }[]>`
          SELECT COUNT(*) AS n FROM tbl_bookingservicedetail
          WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
            AND ServiceDoneTime > '1900-01-01 00:00:00'
            AND (ServiceBilledTime IS NULL OR ServiceBilledTime <= '1900-01-01 00:00:00')
            AND (ServiceCancelledDate IS NULL OR ServiceCancelledDate <= '1900-01-01 00:00:00')
        `;
        const left = Number(remaining[0]?.n ?? 0);
        if (left > 0) {
          /* Keep the booking on the To-bill list for the remaining services. */
          await prisma.$executeRaw`
            UPDATE tbl_bookingheder SET BillingTime = NULL
            WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
          `;
        } else {
          await prisma.$executeRaw`
            UPDATE tbl_bookingheder SET Status = 'DONE', BillingTime = NOW()
            WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
          `;
        }
      } catch {
        /* Pre-migration: billed columns absent. Fall back to the count the
           dashboard sent so a partial bill still keeps the booking open for
           its remaining done services instead of vanishing from To-bill. */
        const left = num(body.remainingAfter, 0);
        try {
          if (left > 0) {
            await prisma.$executeRaw`
              UPDATE tbl_bookingheder SET BillingTime = NULL
              WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
            `;
          } else {
            await prisma.$executeRaw`
              UPDATE tbl_bookingheder SET Status = 'DONE', BillingTime = NOW()
              WHERE RTRIM(BookingID) = ${bookingID} AND RTRIM(LocCode) = ${locCode}
            `;
          }
        } catch {
          /* leave header as written by the bill transaction */
        }
      }
    }

    const paidAmount = paymentRows.reduce((sum, row) => sum + row.tenderedAmount, 0);
    const change = paymentRows.reduce((sum, row) => sum + row.change, 0);

    return NextResponse.json({
      success: true,
      bookingID,
      locCode,
      billNo,
      billedAt: new Date().toISOString(),
      /* What was written, echoed back so the receipt can be reprinted. */
      bill: summary,
      detailRows,
      unmappedLines: written.unmappedLines,
      taxes: taxRows,
      taxTotal: summary.totalTaxAmount,
      payments: paymentRows.map((row) => ({
        payCode: row.payCode,
        method: row.method,
        type: row.type,
        label: row.label,
        amount: row.tenderedAmount,
        actAmount: row.actAmount,
        change: row.change,
        remark: row.remark,
      })),
      payMethod:
        trim(body.payMethod) ||
        payments.map((payment) => payment.method).join("+") ||
        "cash",
      paidAmount,
      netTotal: summary.netTotal,
      balance: paidAmount - summary.netTotal,
      change,
      remark,
    });
  } catch (err) {
    /* Anything outside the write (booking lookup, item master, …). The real
       reason goes back to the screen so it does not have to be guessed. */
    const report = describeDbError(err);
    console.error("[billing-complete] POST failed:", err);
    return NextResponse.json(
      {
        success: false,
        stage: "preparation",
        message: "The bill was not saved.",
        detail: report.message,
        hint: report.hint,
      },
      { status: 500 },
    );
  }
}
