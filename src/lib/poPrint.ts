
export type PoPrintCopy = "standard" | "supplier";

export interface PoPrintCopyChoice {
  id: PoPrintCopy;
  label: string;
  /** shown under the button in the "which copy?" dialog */
  hint: string;
}

export const PO_PRINT_COPY_CHOICES: PoPrintCopyChoice[] = [
  {
    id: "standard",
    label: "Standard Copy",
    hint: "Item code · item name · unit · qty · cost price · item value · Total — the salon's copy",
  },
  {
    id: "supplier",
    label: "Supplier Copy",
    hint: "Item code · item name · unit · qty — no cost price, no value, no total",
  },
];

/** The title printed on the sheet. */
export function poPrintCopyLabel(copy: PoPrintCopy): string {
  return copy === "supplier" ? "Supplier Copy" : "Standard Copy";
}

export interface PoPrintColumns {
  /** the Cost Price column */
  costPrice: boolean;
  /** the per-line ItemValue column */
  itemValue: boolean;
  /** the Total row */
  total: boolean;
}

/**
 * Which value columns a copy carries. The supplier copy carries none of them,
 * so nothing on that sheet says what the items cost.
 */
export function poPrintValueColumns(copy: PoPrintCopy): PoPrintColumns {
  const shown = copy === "standard";
  return { costPrice: shown, itemValue: shown, total: shown };
}

/** How many columns the sheet has — used for the group row and the total row. */
export function poPrintColumnCount(copy: PoPrintCopy): number {
  const cols = poPrintValueColumns(copy);
  return 4 + (cols.costPrice ? 1 : 0) + (cols.itemValue ? 1 : 0);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * A stored date as the sheet prints it: 10-Aug-2026.
 * Understands "2026-08-10", "2026-08-10T00:00:00.000Z" and a Date — and leaves
 * anything it cannot read exactly as it came in, rather than printing "Invalid Date".
 */
export function poPrintDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return `${iso[3]}-${MONTHS[month - 1]}-${iso[1]}`;
  }
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(text)) return text; // already printed shape
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return `${pad2(parsed.getUTCDate())}-${MONTHS[parsed.getUTCMonth()]}-${parsed.getUTCFullYear()}`;
}

/**
 * The moment of printing, as the sheet prints it:
 *   { date: "16-Sep-2026", time: "10:07:22 pm" }
 * The wall clock of the machine that prints — that is what "Print Time" means.
 */
export function poPrintClock(at: Date): { date: string; time: string } {
  const hours24 = at.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return {
    date: `${pad2(at.getDate())}-${MONTHS[at.getMonth()]}-${at.getFullYear()}`,
    time: `${pad2(hours12)}:${pad2(at.getMinutes())}:${pad2(at.getSeconds())} ${hours24 < 12 ? "am" : "pm"}`,
  };
}

/** Money as the legacy sheet printed it: 16,850.00 */
export function poPrintMoney(value: unknown): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A quantity on the sheet: two decimals, like the legacy Qty column. */
export function poPrintQty(value: unknown): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface PoPrintLine {
  itemCode: string;
  name: string;
  unitID: string;
  /** what the sheet prints in the Unit column — the unit NAME */
  unitName?: string;
  costPrice: number;
  poQty: number;
}

/**
 * A row of the printed table, already formatted: every value is a string ready
 * to be put on the sheet (or drawn into the PDF that is emailed).
 */
export interface PoPrintRow {
  itemCode: string;
  name: string;
  unit: string;
  qty: string;
  costPrice: string;
  itemValue: string;
}

/**
 * The rows of the printed table. The Unit column prints the unit NAME when the
 * screen knows it (the stored value is still the code — see LookupUnit).
 */
export function poPrintRows(lines: PoPrintLine[]): PoPrintRow[] {
  return lines.map((line) => ({
    itemCode: String(line.itemCode ?? "").trim(),
    name: String(line.name ?? "").trim(),
    unit: String(line.unitName || line.unitID || "").trim(),
    qty: poPrintQty(line.poQty),
    costPrice: poPrintMoney(line.costPrice),
    itemValue: poPrintMoney(Number(line.costPrice || 0) * Number(line.poQty || 0)),
  }));
}

/** The Total the sheet prints: the sum of the printed ItemValue column. */
export function poPrintTotal(lines: PoPrintLine[]): string {
  return poPrintMoney(
    lines.reduce((sum, line) => sum + Number(line.costPrice || 0) * Number(line.poQty || 0), 0),
  );
}
