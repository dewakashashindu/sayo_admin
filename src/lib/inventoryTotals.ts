// src/lib/inventoryTotals.ts
// ─────────────────────────────────────────────────────────────────────────────
// Purchase Order / GRN arithmetic, in one pure module.
//
// No Prisma, no React, no database — so `scripts/billing-tests.js` can check
// every rule with plain numbers (same idea as billingTaxes / billingPayments).
//
// The screen and the API BOTH use these functions. The API never takes a total
// from the browser: it re-adds the lines with `poNetTotal` / `grnTotals`, so a
// tampered payload cannot decide what a purchase order is worth.
// ─────────────────────────────────────────────────────────────────────────────

/** Money is stored in DOUBLE columns that the legacy app rounded to 2. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A quantity that is safe to store: finite, never negative. */
export function safeQty(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Legacy columns are DOUBLE; 3 decimals is more than any salon needs and
  // keeps 0.1 + 0.2 style noise out of the totals.
  return Math.round(n * 1000) / 1000;
}

/** A price that is safe to store: finite, never negative. */
export function safePrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

/** One PO line: CostPrice × POQty. */
export function poLineValue(unitCost: unknown, qty: unknown): number {
  return round2(safePrice(unitCost) * safeQty(qty));
}

/** PO Net Total = the sum of the line values. */
export function poNetTotal(
  lines: { costPrice?: unknown; poQty?: unknown }[],
): number {
  return round2(
    (lines ?? []).reduce(
      (sum, line) => sum + poLineValue(line.costPrice, line.poQty),
      0,
    ),
  );
}

/** One GRN line: CostPrice × (GRNQty + FreeQty) — free goods still carry cost. */
export function grnLineValue(
  unitCost: unknown,
  grnQty: unknown,
  freeQty: unknown,
): number {
  return round2(safePrice(unitCost) * (safeQty(grnQty) + safeQty(freeQty)));
}

export interface GrnTotals {
  gross: number;
  discount: number;
  adjustment: number;
  net: number;
}

/**
 * GRN footer: Gross Total − Discount + Adjustment = Net Total.
 * Discount and adjustment are entered values; both are rounded to 2 first so
 * the printed receipt and the stored header always agree.
 */
export function grnTotals(
  lines: { costPrice?: unknown; grnQty?: unknown; freeQty?: unknown }[],
  discount: unknown = 0,
  adjustment: unknown = 0,
): GrnTotals {
  const gross = round2(
    (lines ?? []).reduce(
      (sum, line) =>
        sum + grnLineValue(line.costPrice, line.grnQty, line.freeQty),
      0,
    ),
  );
  const dis = safePrice(discount);
  const adj = safePrice(adjustment);
  return { gross, discount: dis, adjustment: adj, net: round2(gross - dis + adj) };
}

/**
 * How much of a PO line is still to be received: POQty − already received.
 * Never negative — an over-received line shows 0 open, it does not show −3.
 */
export function openQty(poQty: unknown, alreadyReceived: unknown): number {
  return safeQty(safeQty(poQty) - safeQty(alreadyReceived));
}

/**
 * How much of this receipt goes PAST the ordered quantity.
 *   0    → the receipt fits (or the line has no PO behind it)
 *   > 0  → that many units are over-received and must be refused
 */
export function overReceiptQty(
  poQty: unknown,
  alreadyReceived: unknown,
  receivingNow: unknown,
): number {
  const allowed = safeQty(poQty) - safeQty(alreadyReceived);
  const now = safeQty(receivingNow);
  const over = round2(now - allowed);
  return over > 0 ? over : 0;
}

/** A PO line is finished when nothing is left open. */
export function isPoLineComplete(
  poQty: unknown,
  alreadyReceived: unknown,
): boolean {
  return openQty(poQty, alreadyReceived) <= 0;
}

/** A PO is complete when every line is complete. */
export function isPoComplete(
  lines: { poQty?: unknown; grnQty?: unknown }[],
): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.every((line) => isPoLineComplete(line.poQty, line.grnQty));
}

/**
 * "Current Stock Requirements" — the quantity to suggest on a new PO line.
 *
 *   StockBalance <= ROL and ROQ is set   → ROQ      (the reorder quantity)
 *   StockBalance <= ROL and no ROQ       → MaxQty − StockBalance
 *   StockBalance <= MinQty (ROL not set) → MaxQty − StockBalance, else MinQty
 *   anything else                        → 0 (not below the reorder level)
 *
 * Always a whole number ≥ 0 — you cannot order 0.4 of a bottle.
 */
export function suggestedOrderQty(item: {
  stockBalance?: unknown;
  rol?: unknown;
  roq?: unknown;
  minQty?: unknown;
  maxQty?: unknown;
}): number {
  const stock = safeQty(item.stockBalance);
  const rol = safeQty(item.rol);
  const roq = safeQty(item.roq);
  const minQty = safeQty(item.minQty);
  const maxQty = safeQty(item.maxQty);

  const belowRol = rol > 0 && stock <= rol;
  const belowMin = rol <= 0 && minQty > 0 && stock <= minQty;
  if (!belowRol && !belowMin) return 0;

  if (roq > 0) return Math.ceil(roq);
  if (maxQty > stock) return Math.ceil(maxQty - stock);
  if (belowMin && minQty > stock) return Math.ceil(minQty - stock);
  return 1; // below the level but no target quantity stored — order at least one
}

/** Shortage used to sort the requirements list (bigger = more urgent). */
export function shortageLevel(item: {
  stockBalance?: unknown;
  rol?: unknown;
  minQty?: unknown;
}): number {
  const stock = safeQty(item.stockBalance);
  const rol = safeQty(item.rol);
  const minQty = safeQty(item.minQty);
  const level = rol > 0 ? rol : minQty;
  if (level <= 0) return 0;
  return round2(level - stock);
}
