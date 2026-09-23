
/** Anything closer than this counts as “the same quantity”. */
const EPSILON = 0.0001;

/** The letters the GRNed column carries, here and in the old program. */
export const GRNED_YES = "Y";
export const GRNED_NO = "N";

export interface PoReceiptLine {
  /** Ordered quantity on the PO line. */
  poQty: number;
  /** How much of it has been received so far (all confirmed GRNs). */
  grnQty: number;
}

function round3(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

/** How much of this line is still to come. Never negative. */
export function poLineOpenQty(line: PoReceiptLine): number {
  return round3(Math.max(0, (Number(line.poQty) || 0) - (Number(line.grnQty) || 0)));
}

/** True when this line has arrived in full. */
export function poLineReceived(line: PoReceiptLine): boolean {
  return poLineOpenQty(line) <= EPSILON;
}

/**
 * True when the order is received: it has at least one line and every one of
 * them has arrived. An order with no lines is NOT received — there is nothing
 * to receive, and calling that “done” would close an empty order.
 */
export function poFullyReceived(lines: PoReceiptLine[]): boolean {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  return lines.every(poLineReceived);
}

export interface PoReceiptSummary {
  /** Lines on the order. */
  lines: number;
  /** Lines that have arrived in full. */
  received: number;
  /** Lines still outstanding. */
  open: number;
  /** Every line has arrived. */
  fullyReceived: boolean;
}

export function poReceiptSummary(lines: PoReceiptLine[]): PoReceiptSummary {
  const list = Array.isArray(lines) ? lines : [];
  const received = list.filter(poLineReceived).length;
  return {
    lines: list.length,
    received,
    open: list.length - received,
    fullyReceived: poFullyReceived(list),
  };
}

/** The value to store in `tbl_poheader.GRNed`. */
export function grnedFlag(fullyReceived: boolean): string {
  return fullyReceived ? GRNED_YES : GRNED_NO;
}

/** “2 of 3 lines received” — for the activity log and the screen. */
export function poReceiptWords(summary: PoReceiptSummary): string {
  if (summary.lines === 0) return "no lines on the order";
  if (summary.fullyReceived) return `all ${summary.lines} line(s) received`;
  return `${summary.received} of ${summary.lines} line(s) received — ${summary.open} still open`;
}
