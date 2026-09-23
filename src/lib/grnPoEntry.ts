
/** One line of a purchase order, as `GET /api/inventory/po/:poNo` returns it. */
export interface PoOpenForGrn {
  itemCode: string;
  itemName: string;
  unitID: string;
  costPrice: number | string;
  retailPrice: number | string;
  poQty: number;
  receivedQty: number;
  openQty: number;
}

/** The values the entry row is filled with — the page adds `key` to them. */
export interface GrnEntryFields {
  itemCode: string;
  itemName: string;
  unitID: string;
  batchNo: string;
  costPrice: string;
  retailPrice: string;
  grnQty: string;
  freeQty: string;
  expDate: string;
  updItemPrice: boolean;
  stockBalance: number;
  poQty: number;
  alreadyReceived: number;
}

/** Prices come in as numbers and go into `<input>`s, so they become text. */
const asText = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
};

export function poEntryFields(line: PoOpenForGrn): GrnEntryFields {
  const open = Number(line.openQty) || 0;
  return {
    itemCode: String(line.itemCode ?? ""),
    itemName: String(line.itemName ?? ""),
    unitID: String(line.unitID ?? ""),
    batchNo: "",
    costPrice: asText(line.costPrice),
    retailPrice: asText(line.retailPrice),
    grnQty: open > 0 ? String(open) : "",
    freeQty: "",
    expDate: "",
    updItemPrice: false,
    stockBalance: 0,
    poQty: Number(line.poQty) || 0,
    alreadyReceived: Number(line.receivedQty) || 0,
  };
}

/** The strip above the grid: how much of the order has been added so far. */
export function poEntryProgress(
  total: number,
  left: number,
): { added: number; left: number; done: boolean; text: string } {
  const all = Math.max(0, Math.trunc(Number(total) || 0));
  const remaining = Math.min(all, Math.max(0, Math.trunc(Number(left) || 0)));
  const added = all - remaining;
  const text =
    all === 0
      ? "this order has no lines still open"
      : remaining === 0
        ? `all ${all} open line(s) added — press Save when the rest of the note is filled in`
        : `${added} of ${all} line(s) added · ${remaining} left to add`;
  return { added, left: remaining, done: remaining === 0, text };
}

/**
 * Add — the entry line joins the grid and leaves the queue.
 * A key that is not in the queue changes nothing (double Enter cannot add the
 * same line twice).
 */
export function queueAccept<T extends { key: string }>(
  lines: T[],
  queue: T[],
  key: string,
): { lines: T[]; queue: T[] } {
  const entry = queue.find((q) => q.key === key);
  if (!entry) return { lines, queue };
  return { lines: [...lines, entry], queue: queue.filter((q) => q.key !== key) };
}

/** Skip — the first line waits its turn at the back of the queue. */
export function queueSkipFirst<T extends { key: string }>(queue: T[]): T[] {
  if (queue.length < 2) return queue;
  return [...queue.slice(1), queue[0]];
}

/** Taking a line out of the grid puts it back in front of the queue. */
export function queueRequeue<T extends { key: string }>(queue: T[], line: T): T[] {
  if (queue.some((q) => q.key === line.key)) return queue;
  return [line, ...queue];
}

/** Drop a queue row that is no longer on the purchase order. */
export function queueRemove<T extends { key: string }>(queue: T[], key: string): T[] {
  return queue.filter((q) => q.key !== key);
}
