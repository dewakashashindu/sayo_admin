
/** Raw tbl_bookingservicedetail row (item + technician names already joined). */
export interface BillServiceRow {
  GuessID: string;
  ServiceItemID: string;
  Qty: string | number | null;
  ItemPrice: number | null;
  TechID: string | null;
  ItemDes: string | null;
  ItemPrintDes: string | null;
  TechName: string | null;
}

/** One grouped, read-only service line. */
export interface GroupedBookingService {
  key: string;
  guessID: string;
  itemCode: string;
  name: string;
  qty: number;
  price: number;
  mainTech: string;
  supporters: string[];
  /** Every guest that booked this service. */
  guessIDs: string[];
  /** Distinct guests — drives the "× N guests" hint. */
  guestCount: number;
}

const trim = (v: unknown) => String(v ?? "").trim();

export function groupBookingServices(
  rows: BillServiceRow[],
  supportersByItem: Map<string, string[]> = new Map(),
  fallbackSupporters: string[] = [],
): GroupedBookingService[] {
  const uniqueItemCodes = Array.from(
    new Set(rows.map((row) => trim(row.ServiceItemID).toUpperCase())),
  ).filter(Boolean);

  const services: GroupedBookingService[] = [];
  /** Quantity booked per (line key + guest) — one number per guest, not per row. */
  const qtyByLineGuest = new Map<string, number>();

  rows.forEach((row, index) => {
    const itemCode = trim(row.ServiceItemID);
    const techID = trim(row.TechID);
    const qtyRaw = Number(trim(row.Qty));
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    const price = Number(row.ItemPrice ?? 0) || 0;
    const mainTech =
      trim(row.TechName) || (techID && techID !== "0" ? techID : "Unassigned");
    const guessID = trim(row.GuessID) || "MAIN";

    const supporters =
      supportersByItem.get(itemCode.toUpperCase()) ||
      // Fallback: supporter rows written against a differently padded service
      // id still belong to this booking (it only has one service).
      (uniqueItemCodes.length === 1 ? fallbackSupporters : []);

    const lineKey = `${itemCode.toUpperCase()}|${price}|${mainTech.toUpperCase()}`;
    const guestKey = `${lineKey}|${guessID.toUpperCase()}`;
    const existing = services.find(
      (line) => `${line.itemCode.toUpperCase()}|${line.price}|${line.mainTech.toUpperCase()}` === lineKey,
    );

    if (existing) {
      const previousQty = qtyByLineGuest.get(guestKey) ?? 0;
      if (qty > previousQty) {
        existing.qty += qty - previousQty;
        qtyByLineGuest.set(guestKey, qty);
      }
      if (!existing.guessIDs.includes(guessID)) existing.guessIDs.push(guessID);
      existing.guestCount = existing.guessIDs.length;
      supporters.forEach((name) => {
        if (name && !existing.supporters.includes(name)) {
          existing.supporters.push(name);
        }
      });
      return;
    }

    qtyByLineGuest.set(guestKey, qty);
    services.push({
      key: `${guessID}|${itemCode}|${index}`,
      guessID,
      itemCode,
      name: trim(row.ItemPrintDes) || trim(row.ItemDes) || itemCode || "Service",
      qty,
      price,
      mainTech,
      supporters: Array.from(new Set(supporters.filter(Boolean))),
      guessIDs: [guessID],
      guestCount: 1,
    });
  });

  return services;
}
