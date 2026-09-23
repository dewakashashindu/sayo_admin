
import { money } from "./billingTaxes";
import { itemCode } from "./itemCode";
import { METHOD_LABEL, type PayMethod, type PaymentEntry } from "./billingPayments";
import type { TaxLine } from "./billingTaxes";

/**
 * Width of the CHAR(10) code columns (PayCode, TaxCode, CusID, CashierID).
 * Item codes are NOT part of this: they are CHAR(15) — use `itemCode()`.
 */
export const SHORT_CODE_LENGTH = 10;

/** CHAR(10) column that holds an amount, e.g. tbl_billtaxes.TaxAmount. */
export const AMOUNT_TEXT_LENGTH = 10;

export interface BillLineInput {
  /** Item master / service item code. Empty when the cashier typed free text. */
  itemId: string;
  /** Only used to resolve a missing code against the item master. */
  name: string;
  qty: number;
  price: number;
  costPrice: number;
}

/** One ready-to-insert tbl_billdetail row. */
export interface BillDetailRow {
  itemId: string;
  qty: number;
  salesPrice: number;
  totalItemPrice: number;
  costPrice: number;
}

/**
 * Trim a code down to what a CHAR(10) column can hold — payment, tax, customer
 * and cashier codes. Item codes must use `itemCode()` instead.
 */
export function shortCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .substring(0, SHORT_CODE_LENGTH);
}

/** Raw request lines → cleaned numbers. Lines without any amount are dropped. */
export function normaliseBillLines(input: unknown): BillLineInput[] {
  if (!Array.isArray(input)) return [];
  const lines: BillLineInput[] = [];
  for (const entry of input) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const qty = Number(row.qty ?? row.Qty ?? 1);
    const price = Number(row.price ?? row.price ?? row.SalesPrice ?? 0);
    const costPrice = Number(row.costPrice ?? row.CostPrice ?? 0);
    // Item codes are CHAR(15) — never cut them down to a CHAR(10) length.
    const itemId = itemCode(row.itemId ?? row.itemCode ?? row.ItemID);
    const name = String(row.name ?? row.description ?? "").trim();
    if (!itemId && !name) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(price)) continue;
    lines.push({
      itemId,
      name,
      qty,
      price: money(Math.max(0, price)),
      costPrice: Number.isFinite(costPrice) ? money(Math.max(0, costPrice)) : 0,
    });
  }
  return lines;
}

/**
 * Merge to one row per `ItemID`, because that is the primary key of
 * `tbl_billdetail`. Quantities and money are added up; the price becomes the
 * weighted average so `SalesPrice × Qty` still matches `TotalItmPrice`.
 */
export function mergeBillLines(lines: readonly BillLineInput[]): BillDetailRow[] {
  const byItem = new Map<string, BillDetailRow & { costTotal: number }>();
  for (const line of lines) {
    const key = itemCode(line.itemId);
    if (!key) continue;
    const total = money(line.qty * line.price);
    const existing = byItem.get(key);
    if (!existing) {
      byItem.set(key, {
        itemId: key,
        qty: line.qty,
        salesPrice: line.price,
        totalItemPrice: total,
        costPrice: line.costPrice,
        costTotal: money(line.qty * line.costPrice),
      });
      continue;
    }
    existing.qty += line.qty;
    existing.totalItemPrice = money(existing.totalItemPrice + total);
    existing.costTotal = money(existing.costTotal + line.qty * line.costPrice);
    existing.salesPrice = existing.qty > 0
      ? money(existing.totalItemPrice / existing.qty)
      : line.price;
    existing.costPrice = existing.qty > 0
      ? money(existing.costTotal / existing.qty)
      : line.costPrice;
  }
  return Array.from(byItem.values()).map(({ costTotal: _costTotal, ...row }) => row);
}

/**
 * Lines that still have no item code. They are the ones that cannot be written
 * to tbl_billdetail (ItemID is part of its primary key) — the route reports
 * them back so the cashier is told instead of the line vanishing silently.
 */
export function linesWithoutCode(lines: readonly BillLineInput[]): BillLineInput[] {
  return lines.filter((line) => !itemCode(line.itemId));
}

/** Pay code per payment method — kept short, the column is CHAR(10). */
const METHOD_PAY_CODE: Record<PayMethod, string> = {
  cash: "CASH",
  card: "CARD",
  online: "ONLINE",
  voucher: "VOUCHER",
};

/** Sub-types map onto their own pay code so a report can still tell them apart. */
const TYPE_PAY_CODE: Record<string, string> = {
  // card
  visa: "VISA",
  master: "MASTER",
  mastercard: "MASTER",
  amex: "AMEX",
  "debit card": "DEBIT",
  debit: "DEBIT",
  // online
  "bank transfer": "BANK",
  bank: "BANK",
  wallet: "WALLET",
  "payment gateway": "GATEWAY",
  gateway: "GATEWAY",
  // voucher
  "gift voucher": "GIFT",
  gift: "GIFT",
  "promo voucher": "PROMO",
  promo: "PROMO",
  "loyalty voucher": "LOYALTY",
  loyalty: "LOYALTY",
};

/** `cash` + `` → CASH; `card` + `Visa` → VISA; `card` + `Other` → CARD. */
export function payCodeBase(method: PayMethod, type: string): string {
  const key = String(type ?? "").trim().toLowerCase();
  const mapped = TYPE_PAY_CODE[key];
  if (mapped && mapped.length <= SHORT_CODE_LENGTH) return mapped;
  return METHOD_PAY_CODE[method] ?? "CASH";
}

export interface BillPaymentRow {
  payCode: string;
  method: PayMethod;
  type: string;
  /** Money handed over for this line. */
  tenderedAmount: number;
  /** Money that actually went against the bill (the rest is change). */
  actAmount: number;
  /** Change handed back on this line. */
  change: number;
  remark: string;
  /** “Card · Visa” — for the response/receipt, from the shared label builder. */
  label: string;
}

/** Text kept in Rmks (VARCHAR(200)): the remark plus the sub-type when it has one. */
export function paymentRemark(type: string, remark: string): string {
  const cleanType = String(type ?? "").trim();
  const cleanRemark = String(remark ?? "").trim();
  const parts = [cleanType, cleanRemark].filter(Boolean);
  return parts.join(" · ").substring(0, 200);
}

export function allocatePayments(
  payments: readonly PaymentEntry[],
  netTotal: number,
): BillPaymentRow[] {
  const used = new Map<string, number>();
  const rows: BillPaymentRow[] = [];
  let remaining = money(Math.max(0, Number(netTotal) || 0));

  for (const payment of payments) {
    const tendered = money(Number(payment.amount) || 0);
    if (tendered <= 0) continue;

    const base = payCodeBase(payment.method, payment.type);
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    // CARD, CARD2, CARD3 … never longer than the CHAR(10) column.
    const payCode = seen === 1
      ? base
      : shortCode(`${base}${seen}`.substring(0, SHORT_CODE_LENGTH));

    const act = money(Math.min(tendered, Math.max(remaining, 0)));
    remaining = money(remaining - act);

    rows.push({
      payCode,
      method: payment.method,
      type: String(payment.type ?? "").trim(),
      tenderedAmount: tendered,
      actAmount: act,
      change: money(tendered - act),
      remark: paymentRemark(payment.type, payment.remark),
      label: [METHOD_LABEL[payment.method], String(payment.type ?? "").trim()]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return rows;
}

export interface BillTaxRow {
  taxCode: string;
  taxDescription: string;
  percentage: number;
  /** Amount as TEXT — tbl_billtaxes.TaxAmount is a CHAR(10) column. */
  taxAmountText: string;
  amount: number;
}

/**
 * `tbl_billtaxes.TaxAmount` is a CHAR(10) column (a legacy quirk), so the
 * number is written as text: `1782.00`. Amounts too long for the column fall
 * back to whole rupees rather than being cut in half.
 */
export function taxAmountText(amount: number): string {
  const value = money(Number(amount) || 0);
  const withDecimals = value.toFixed(2);
  if (withDecimals.length <= AMOUNT_TEXT_LENGTH) return withDecimals;
  const rounded = String(Math.round(value));
  return rounded.substring(0, AMOUNT_TEXT_LENGTH);
}

/**
 * One row per tax that actually carries money. The TaxCode comes from
 * tbl_taxes, so tbl_billtaxes lines up with that table.
 */
export function billTaxRows(lines: readonly TaxLine[]): BillTaxRow[] {
  return lines
    .filter((line) => money(line.amount) > 0)
    .map((line) => ({
      taxCode: shortCode(line.code || line.label),
      taxDescription: line.label,
      percentage: Number(line.percentage) || 0,
      taxAmountText: taxAmountText(line.amount),
      amount: money(line.amount),
    }));
}

export interface BillHeaderInput {
  gross: number;
  discountPercent: number;
  discountValue: number;
  serviceCharge: number;
  otherServiceCharge: number;
  totalTaxAmount: number;
  advAmount: number;
  netTotal: number;
  customerCode: string;
  referralCode: string;
  rewardPoints: number;
  cashierId: string;
  remarks: string;
}

export interface BillSummary {
  gross: number;
  discountPercent: number;
  discountValue: number;
  grossAfterDiscount: number;
  serviceCharge: number;
  otherServiceCharge: number;
  totalTaxAmount: number;
  advAmount: number;
  netTotal: number;
}

export function buildBillSummary(
  lines: readonly TaxLine[],
  gross: number,
  discountPercent: number,
  discountValue: number,
  advAmount = 0,
): BillSummary {
  const grossValue = money(Math.max(0, Number(gross) || 0));
  const discount = money(Math.min(Math.max(0, Number(discountValue) || 0), grossValue));
  const serviceCharge = money(
    lines
      .filter((line) => line.stage === "charge")
      .reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
  );
  const otherTaxes = money(
    lines
      .filter((line) => line.stage !== "charge")
      .reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
  );
  const grossAfterDiscount = money(grossValue - discount);

  return {
    gross: grossValue,
    discountPercent: Number.isFinite(Number(discountPercent))
      ? Number(discountPercent)
      : 0,
    discountValue: discount,
    grossAfterDiscount,
    serviceCharge,
    /* The old packing / delivery charges are gone from the bill screen, so
       OtherServiceCharge keeps its 0 until such a charge comes back. */
    otherServiceCharge: 0,
    totalTaxAmount: otherTaxes,
    advAmount: money(Math.max(0, Number(advAmount) || 0)),
    netTotal: money(grossAfterDiscount + serviceCharge + otherTaxes),
  };
}

/** Problems worth refusing the bill for, instead of writing wrong money. */
export function billSummaryProblems(
  summary: BillSummary,
  clientNetTotal: number,
): string[] {
  const problems: string[] = [];
  const expected = money(summary.netTotal);
  if (Number.isFinite(clientNetTotal) && Math.abs(money(clientNetTotal) - expected) > 0.05) {
    problems.push(
      `The screen total (${money(clientNetTotal).toFixed(2)}) does not match the tax breakdown (${expected.toFixed(2)}). Reload the bill and try again.`,
    );
  }
  if (summary.gross <= 0) {
    problems.push("The bill has no amount on it — add the services or items first.");
  }
  return problems;
}
