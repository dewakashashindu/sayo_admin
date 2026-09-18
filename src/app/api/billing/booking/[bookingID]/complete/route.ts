// src/app/api/billing/booking/[bookingID]/complete/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// “Complete Payment” — the one place a bill is written.
//
// POST /api/billing/booking/:bookingID/complete
//   body: {
//     lines?:    [ { itemId, name, qty, price, costPrice } ],   // services + items
//     taxes?:    [ { code, label, percentage, stage, base, amount } ],
//     payments?: [ { method: 'cash'|'card'|'online'|'voucher',
//                    type?: 'Visa' | 'Gift Voucher' | …,
//                    amount: number, remark?: string } ],
//     gross?: number, discountPercent?: number, discountValue?: number,
//     netTotal?: number,           // what the screen shows — checked, not trusted
//     paidAmount?: number, payMethod?: string, remark?: string
//   }
//
// Writes, in ONE transaction:
//   • tbl_billheader  — the bill itself (Gross, DisPre, DisVal, ServiceCharge,
//     TotalTaxAmount, AdvAmount, NetTotal, CusID, CashierID, Rmks …)
//   • tbl_billdetail  — one row per item code (Qty, SalesPrice, TotalItmPrice,
//     CostPrice); lines that share an item code are merged, because
//     (LocCode, BillNo, ItemID) is the primary key
//   • tbl_billpaytxn  — one row per payment line with its own pay code
//     (TenderedAmt = money handed over, ActAmt = money applied to the bill, so
//     the difference is the change given back)
//   • tbl_billtaxes   — one row per tax that carries money, TaxCode straight
//     from tbl_taxes
// and stamps tbl_bookingheder.BillingTime, which is what makes the booking
// disappear from the Billing Dashboard.
//
// The bill number comes from Tbl_Serials exactly like the booking number does:
// the counter row with SeriCode = "INV" is incremented and the padded value
// becomes the bill no. — INV0000001, INV0000002, …
//
// Only allowed when the work is DONE and the booking is not billed yet.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
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
const prisma = globalForPrisma.prisma ?? new PrismaClient();
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

    /* ── who is billing (CashierID) — from the signed session, never the body ── */
    const session = await verifyAdminToken(
      req.cookies.get(ADMIN_COOKIE)?.value,
    );
    const cashierId = shortCode(session?.uid ?? "");

    /* ── the booking must exist, be DONE and not be billed yet ───────────── */
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
    if (trim(header.Status).toUpperCase() !== "DONE") {
      return NextResponse.json(
        {
          success: false,
          message: "Technician has not marked the work done yet",
        },
        { status: 409 },
      );
    }

    /* ── lines: services + items, cleaned and matched to the item master ─── */
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

    /* ── taxes: the breakdown the screen calculated from tbl_taxes ───────── */
    const taxLines = normaliseTaxLines(body.taxes);

    /* ── the header numbers, derived from the tax rows ───────────────────── */
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

    /* ── payments: one row each, right down to the change given back ─────── */
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

    /* ── write the bill: BillNo + the four tables + BillingTime ──────────── */
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
