
export type PayMethod = "cash" | "card" | "online" | "voucher";

/**
 * Payment methods offered on the bill with the sub-types each one carries.
 * Edit these lists to add a card brand, wallet or voucher kind.
 */
export const PAY_METHODS: { key: PayMethod; label: string; types: string[] }[] = [
  { key: "cash", label: "Cash", types: [] },
  {
    key: "card",
    label: "Card",
    types: ["Visa", "Master", "Amex", "Debit Card", "Other"],
  },
  {
    key: "online",
    label: "Online",
    types: ["Bank Transfer", "Wallet", "Payment Gateway", "Other"],
  },
  {
    key: "voucher",
    label: "Voucher",
    types: ["Gift Voucher", "Promo Voucher", "Loyalty Voucher", "Other"],
  },
];

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Cash",
  card: "Card",
  online: "Online",
  voucher: "Voucher",
};

/** One line of a split payment. */
export interface PaymentLine {
  id: number;
  method: PayMethod;
  /** Sub-type: Visa / Master … (card), Gift Voucher … (voucher). */
  type: string;
  /** Text so the input box can be cleared while typing. */
  amount: string;
  /** Optional note for this payment only. */
  remark: string;
}

/** The stored/serialised shape sent to the API. */
export interface PaymentEntry {
  method: PayMethod;
  type: string;
  amount: number;
  remark: string;
}

export function methodTypes(method: PayMethod): string[] {
  return PAY_METHODS.find((m) => m.key === method)?.types ?? [];
}

export function isPayMethod(value: unknown): value is PayMethod {
  return PAY_METHODS.some((m) => m.key === String(value ?? "").trim().toLowerCase());
}

/** Human label used on the receipt: "Card · Visa". */
export function paymentLabel(payment: { method: PayMethod; type: string }): string {
  return payment.type
    ? `${METHOD_LABEL[payment.method]} · ${payment.type}`
    : METHOD_LABEL[payment.method];
}

/** Sum of every line that has an amount. */
export function paymentsTotal(
  payments: readonly { amount: string | number }[],
): number {
  return payments.reduce((sum, p) => {
    const value = Number(p.amount);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export interface PaymentSummary {
  paidAmount: number;
  /** paidAmount − netTotal (negative = still owed). */
  balance: number;
  /** How much is still owed (never negative). */
  remaining: number;
  isFullyPaid: boolean;
  isOverpaid: boolean;
  /** How many lines have an amount. */
  lineCount: number;
}

export function summarisePayments(
  payments: readonly { amount: string | number }[],
  netTotal: number,
): PaymentSummary {
  const usable = payments.filter((p) => Number(p.amount) > 0);
  const paidAmount = paymentsTotal(usable);
  const total = Number.isFinite(netTotal) ? netTotal : 0;
  const balance = paidAmount - total;
  return {
    paidAmount,
    balance,
    remaining: Math.max(0, -balance),
    isFullyPaid: paidAmount > 0 && balance >= 0,
    isOverpaid: balance > 0,
    lineCount: usable.length,
  };
}

export function lineAmountCap(
  method: PayMethod,
  netTotal: number,
  othersTotal: number,
): number {
  if (method === "cash") return Number.POSITIVE_INFINITY;
  const total = Number.isFinite(netTotal) ? netTotal : 0;
  const others = Number.isFinite(othersTotal) ? othersTotal : 0;
  return Math.max(0, Math.round((total - others) * 100) / 100);
}

/** The same cap, applied to a typed amount. `capped` drives the little note. */
export function applyLineCap(
  method: PayMethod,
  amount: number,
  netTotal: number,
  othersTotal: number,
): { amount: number; cap: number; capped: boolean } {
  const cap = lineAmountCap(method, netTotal, othersTotal);
  const value = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (value <= cap) return { amount: value, cap, capped: false };
  return { amount: cap, cap, capped: true };
}

/**
 * Clean up payment lines coming from a request body: drop empty lines, force a
 * known method, keep the amount finite and positive.
 */
export function normalisePaymentEntries(input: unknown): PaymentEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const methodRaw = String(row.method ?? "").trim().toLowerCase();
      const amount = Number(row.amount);
      return {
        method: (isPayMethod(methodRaw) ? methodRaw : "cash") as PayMethod,
        type: String(row.type ?? "").trim(),
        amount: Number.isFinite(amount) ? amount : 0,
        remark: String(row.remark ?? "").trim(),
      };
    })
    .filter((entry) => entry.amount > 0);
}
