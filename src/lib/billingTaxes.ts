// src/lib/billingTaxes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tax engine for the bill screen. Every rate comes from the `tbl_taxes` table —
// only the rows with `Enable = 1` are used, and the description + percentage are
// printed exactly as they are stored there.
//
// The salon's worksheet (same order the amounts are shown on the screen):
//
//   Gross ................. (A)
//   Discount .............. (B)
//   Gross After Discount ... (C) = [A - B]
//   Service Charge ......... (D) = [C * (x/100)]     ← rows with ServiceCharge = 1
//   VAT .................... (E) = [(C + D) * (y/100)]
//   NBT .................... (F) = [C + D + E] * (z/100)
//   SSCL ................... (G) = [C + D] * (p/100)
//   Net Total .............. (H) = [C + D + E + F + G]
//
// Which formula a row uses is decided by its kind, not by its position:
//   • `ServiceCharge = 1` — or, when that flag was never set, a row named
//     “Service Charge” / “Ser. Charge” / “SVC” or coded SC / SVC / SER — is the
//     service charge: charge stage, base C. A differently named row (“Service
//     Tax”, “City Levy”, …) is NOT treated as the service charge.
//   • description containing “VAT”       → base (C + D)
//   • description containing “NBT”       → base (C + D + E)   — VAT included
//   • description containing “SSCL”      → base (C + D)
//   • anything else still enabled        → base (C + D), added after the rest
// So an extra row in tbl_taxes — “Other VAT”, “Tax”, anything new — is picked up
// automatically without touching this file.
//
// `ItemBasedTax` is read and handed over to the UI untouched; it does not change
// the calculation here. Add a rule above if a future tax needs its own base.
// ─────────────────────────────────────────────────────────────────────────────

export type TaxStage = "charge" | "vat" | "nbt" | "sscl" | "other";

/** One row of `tbl_taxes` (fixed-width CHAR columns already trimmed). */
export interface TaxRow {
  /** TaxCode */
  code: string;
  /** TaxDescription — printed on the screen and the receipt as it is. */
  description: string;
  /** TaxPrecentage (sic — the column really is spelled that way). */
  percentage: number;
  /** ServiceCharge BIT(1) */
  serviceCharge: boolean;
  /** ItemBasedTax BIT(1) */
  itemBased: boolean;
  /** ListingOrder — null when the row has no explicit order. */
  listingOrder: number | null;
}

/** A computed tax, ready to render. */
export interface TaxLine {
  code: string;
  label: string;
  percentage: number;
  stage: TaxStage;
  /** The amount this percentage was applied to (audit trail). */
  base: number;
  amount: number;
}

export interface TaxBreakdown {
  /** (A) services + items, before discount. */
  gross: number;
  /** (B) */
  discount: number;
  /** (C) = A - B */
  grossAfterDiscount: number;
  /** (D) total of the service-charge stage rows. */
  serviceCharge: number;
  /** (C) + (D) — what VAT / SSCL / the other taxes are charged on. */
  base: number;
  /** Every enabled tax, in display order. */
  lines: TaxLine[];
  vat: number;
  nbt: number;
  sscl: number;
  other: number;
  /** (H) = C + D + E + F + G (+ any other enabled tax) */
  netTotal: number;
}

/** 2-decimal money, so no float dust ends up on a bill. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * MySQL hands BIT(1) columns back as a Buffer, a number, a boolean or a string
 * depending on the driver/query — accept all of them.
 */
export function bitValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== BigInt(0);
  if (value instanceof Uint8Array) {
    return Array.from(value).some((byte) => byte !== 0);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("data" in record) return bitValue(record.data);
    if ("value" in record) return bitValue(record.value);
    return false;
  }
  const text = String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "\\x01";
}

/** TaxCodes that can only mean the service charge row, flag or no flag. */
const SERVICE_CODES = [
  "sc",
  "svc",
  "ser",
  "srv",
  "schg",
  "schar",
  "serchg",
  "srvchg",
  "service",
  "servicecharge",
];

/**
 * A tax row as this module may receive it: either the normalised `TaxRow` or a
 * raw `tbl_taxes` row straight out of SQL. `taxStage()` accepts both so the
 * classification can never depend on which one the caller had.
 */
export interface TaxLikeRow {
  code?: string | null;
  description?: string | null;
  serviceCharge?: unknown;
  TaxCode?: string | null;
  TaxDescription?: string | null;
  ServiceCharge?: unknown;
}

/** Which formula this tax row uses. See the header comment. */
export function taxStage(row: TaxLikeRow): TaxStage {
  const description = String(
    row.description ?? row.TaxDescription ?? "",
  ).toLowerCase();
  const code = String(row.code ?? row.TaxCode ?? "")
    .trim()
    .toLowerCase();
  const serviceCharge = bitValue(row.ServiceCharge ?? row.serviceCharge);
  if (description.includes("sscl") || description.includes("social security")) {
    return "sscl";
  }
  if (description.includes("nbt") || code.startsWith("nbt")) return "nbt";
  /* “Ser. Charge”, “Ser Charge”, “SERCHG” … */
  if (/^ser\b/.test(description) || /\bchg\b/.test(description)) return "charge";
  /* The service charge row is the one the salon flagged with the
     `ServiceCharge` BIT(1) column, or — on a row where that flag was never
     set — the one named “Service Charge” / “Ser Charge” / “SVC” or coded
     SC / SVC / SER. */
  if (
    serviceCharge ||
    /service\s*(charge|chg)/.test(description) ||
    /\bchg\b/.test(description) ||
    /\bsvc\b/.test(description) ||
    SERVICE_CODES.includes(code.replace(/[^a-z]/g, ""))
  ) {
    return "charge";
  }
  if (description.includes("vat") || code.startsWith("vat")) return "vat";
  return "other";
}

const STAGE_ORDER: Record<TaxStage, number> = {
  charge: 0,
  vat: 1,
  nbt: 2,
  sscl: 3,
  other: 4,
};

/**
 * Display order: `ListingOrder` wins when the salon has set it, otherwise the
 * natural worksheet order — Service Charge → VAT → NBT → SSCL → anything else.
 */
export function orderTaxRows(rows: readonly TaxRow[]): TaxRow[] {
  return [...rows].sort((a, b) => {
    const aOrder = a.listingOrder;
    const bOrder = b.listingOrder;
    if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if ((aOrder === null) !== (bOrder === null)) return aOrder === null ? 1 : -1;
    const byStage = STAGE_ORDER[taxStage(a)] - STAGE_ORDER[taxStage(b)];
    if (byStage !== 0) return byStage;
    return a.description.localeCompare(b.description);
  });
}

/**
 * Raw `tbl_taxes` rows (straight from SQL) → usable tax rows.
 * Rows with `Enable = 0` are dropped here, so nothing disabled can ever leak
 * into a bill.
 */
export function normaliseTaxRows(input: unknown): TaxRow[] {
  if (!Array.isArray(input)) return [];
  const rows: TaxRow[] = [];
  for (const entry of input) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const code = String(row.TaxCode ?? row.code ?? "").trim();
    const description = String(
      row.TaxDescription ?? row.description ?? "",
    ).trim();
    const percentage = Number(row.TaxPrecentage ?? row.percentage ?? 0);
    if (!code && !description) continue;
    if (row.Enable !== undefined && !bitValue(row.Enable)) continue;
    const orderRaw = row.ListingOrder ?? row.listingOrder;
    const listingOrder =
      orderRaw === null || orderRaw === undefined || orderRaw === ""
        ? null
        : Number(orderRaw);
    rows.push({
      code: code || description,
      description: description || code,
      percentage: Number.isFinite(percentage) ? percentage : 0,
      serviceCharge: bitValue(row.ServiceCharge ?? row.serviceCharge),
      itemBased: bitValue(row.ItemBasedTax ?? row.itemBased),
      listingOrder:
        listingOrder !== null && Number.isFinite(listingOrder)
          ? listingOrder
          : null,
    });
  }
  return orderTaxRows(rows);
}

/**
 * The whole worksheet, computed from the enabled tax rows.
 * Amounts are rounded to 2 decimals per line and the net total is the sum of
 * those rounded lines, so the printed bill always adds up.
 */
export function computeTaxes(
  rows: readonly TaxRow[],
  gross: number,
  discount: number,
): TaxBreakdown {
  const A = money(Math.max(0, Number(gross) || 0));
  const B = money(Math.max(0, Number(discount) || 0));
  const C = money(Math.max(0, A - B));

  const ordered = orderTaxRows(rows);
  const stages = ordered.map(taxStage);
  const amounts = ordered.map(() => 0);

  // (D) Service charge — base C
  let D = 0;
  ordered.forEach((row, index) => {
    if (stages[index] !== "charge") return;
    amounts[index] = money((C * row.percentage) / 100);
    D = money(D + amounts[index]);
  });
  const base = money(C + D);

  // (E) VAT — base (C + D)
  let E = 0;
  ordered.forEach((row, index) => {
    if (stages[index] !== "vat") return;
    amounts[index] = money((base * row.percentage) / 100);
    E = money(E + amounts[index]);
  });

  // (F) NBT — base (C + D + E)
  const nbtBase = money(base + E);
  let F = 0;
  ordered.forEach((row, index) => {
    if (stages[index] !== "nbt") return;
    amounts[index] = money((nbtBase * row.percentage) / 100);
    F = money(F + amounts[index]);
  });

  // (G) SSCL — base (C + D)
  let G = 0;
  ordered.forEach((row, index) => {
    if (stages[index] !== "sscl") return;
    amounts[index] = money((base * row.percentage) / 100);
    G = money(G + amounts[index]);
  });

  // Any other enabled tax — base (C + D)
  let O = 0;
  ordered.forEach((row, index) => {
    if (stages[index] !== "other") return;
    amounts[index] = money((base * row.percentage) / 100);
    O = money(O + amounts[index]);
  });

  const netTotal = money(base + E + F + G + O);

  const lines: TaxLine[] = ordered.map((row, index) => ({
    code: row.code,
    label: row.description,
    percentage: row.percentage,
    stage: stages[index],
    base:
      stages[index] === "charge"
        ? C
        : stages[index] === "nbt"
          ? nbtBase
          : base,
    amount: amounts[index],
  }));

  return {
    gross: A,
    discount: B,
    grossAfterDiscount: C,
    serviceCharge: D,
    base,
    lines,
    vat: E,
    nbt: F,
    sscl: G,
    other: O,
    netTotal,
  };
}

/** `18` → “18%”, `2.5` → “2.5%” (no trailing `.00`). */
export function percentLabel(percentage: number): string {
  const value = Number(percentage) || 0;
  const text = Number.isInteger(value)
    ? String(value)
    : String(money(value)).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}

/** “VAT (18%)” — the way a tax is named on the screen, the receipt and the API. */
export function taxLineLabel(line: Pick<TaxLine, "label" | "percentage">): string {
  return `${line.label} (${percentLabel(line.percentage)})`;
}

/**
 * Clean up tax lines coming back in a request body (the `/complete` route
 * echoes them for the future `tbl_billtaxes` insert).
 */
export function normaliseTaxLines(input: unknown): TaxLine[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const percentage = Number(row.percentage);
      const amount = Number(row.amount);
      const base = Number(row.base);
      return {
        code: String(row.code ?? "").trim(),
        label: String(row.label ?? row.code ?? "").trim(),
        percentage: Number.isFinite(percentage) ? percentage : 0,
        stage: (["charge", "vat", "nbt", "sscl", "other"] as TaxStage[]).includes(
          String(row.stage) as TaxStage,
        )
          ? (String(row.stage) as TaxStage)
          : "other",
        base: Number.isFinite(base) ? base : 0,
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter((line) => line.code || line.label);
}
