// src/lib/poRequirements.ts
// ─────────────────────────────────────────────────────────────────────────────
// The rules behind the "Current Stock Requirements" tab of the Purchase Order
// screen — kept here, out of the page, so the screen and the tests agree.
//
//   groupRequirementsSupplierWise()  one block per supplier, in supplier-name
//                                    order; inside a block the API order is
//                                    kept (worst shortage first)
//   supplierForSelection()           a purchase order is addressed to ONE
//                                    supplier: this answers "which one?" for
//                                    the items that were ticked — the code, an
//                                    empty string when the items carry no
//                                    supplier, or null when the ticks span more
//                                    than one supplier (then nothing is filled
//                                    in and the screen asks to narrow it)
//   requirementLines()               the ticked rows turned into order lines,
//                                    in the order they were selected, with the
//                                    suggested quantity and the master cost
//                                    price (OverallCost, otherwise RawCost —
//                                    the same rule as resolveItems())
//
// Nothing here reads the database or React: it is pure.
// ─────────────────────────────────────────────────────────────────────────────

export interface StockRequirement {
  itemCode: string;
  itemName: string;
  unitID: string;
  stockBalance: number;
  rol: number;
  roq: number;
  minQty: number;
  maxQty: number;
  shortage: number;
  suggestedQty: number;
  costPrice: number;
  supID: string;
  supName: string;
  enable: boolean;
}

export interface RequirementGroup {
  supID: string;
  supName: string;
  rows: StockRequirement[];
}

/** What a ticked requirement becomes on the order. */
export interface RequirementLine {
  itemCode: string;
  name: string;
  unitID: string;
  /** as the cost-price box holds it — blank when the master has no cost */
  costPrice: string;
  /** as the PO QTY box holds it */
  poQty: string;
}

export const NO_SUPPLIER_LABEL = "No supplier on the item master";

/** Supplier-wise blocks, sorted by the name that is shown. */
export function groupRequirementsSupplierWise(
  rows: StockRequirement[],
): RequirementGroup[] {
  const groups = new Map<string, RequirementGroup>();
  for (const row of rows) {
    const key = (row.supID || "").trim();
    const group = groups.get(key) ?? {
      supID: key,
      supName: (row.supName || "").trim() || key || NO_SUPPLIER_LABEL,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.supName.localeCompare(b.supName),
  );
}

/** The distinct suppliers the ticked items point at, in first-seen order. */
export function suppliersOf(rows: StockRequirement[]): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    const key = (row.supID || "").trim();
    if (!seen.includes(key)) seen.push(key);
  }
  return seen;
}

/**
 * The supplier a purchase order can fill in for this selection.
 *   · one supplier  → that code ("" when the items carry none)
 *   · several       → null, meaning: do not guess, ask for a narrower choice
 */
export function supplierForSelection(rows: StockRequirement[]): string | null {
  const suppliers = suppliersOf(rows);
  if (suppliers.length > 1) return null;
  return suppliers.length === 1 ? suppliers[0] : "";
}

/**
 * The ticked requirements as order lines — EXACTLY these rows, nothing else,
 * so what was selected is what the order shows.
 */
export function requirementLines(rows: StockRequirement[]): RequirementLine[] {
  return rows.map((row) => ({
    itemCode: row.itemCode,
    name: row.itemName,
    unitID: row.unitID,
    costPrice: Number(row.costPrice) > 0 ? String(row.costPrice) : "",
    poQty: String(row.suggestedQty),
  }));
}
