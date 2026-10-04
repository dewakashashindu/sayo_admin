import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { minutesFromValue, timeLabelFromValue } from "@/lib/legacyTime";
import { round2 } from "./format";
import type { CreditTxn, MockBill, MockItemLine, MockLocation, MockPayMode } from "./types";
import type { ReportId } from "./types";

const trim = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const CREDIT_IDS = new Set<ReportId>([
  "credit-history",
  "credit-pay-history",
  "credit-account-detail",
]);
const ISSUE_IDS = new Set<ReportId>(["menu-item-issue", "menu-item-issue-date"]);

export interface LiveUnusedItem {
  itemId: string;
  name: string;
  catL1: string;
}

export interface LiveReportData {
  bills: MockBill[];
  credit: CreditTxn[];
  unusedItems: LiveUnusedItem[];
  locations: MockLocation[];
  payModes: MockPayMode[];
}

async function safe<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error(`[billing/reports] ${label}`, e);
    return fallback;
  }
}

async function inChunks<T>(
  ids: string[],
  size: number,
  run: (part: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    if (!part.length) continue;
    out.push(...(await run(part)));
  }
  return out;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateOnly(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = new Date(value as never);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function time24(value: unknown): string {
  const mins = minutesFromValue(value);
  if (mins === null) return "00:00";
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

function time12(value: unknown): string {
  const label = timeLabelFromValue(value);
  return label ? label.replace(/\s+/g, "") : "12:00AM";
}

function allowedSet(codes: string[]): Set<string> {
  return new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean));
}

function locOk(code: string, allowed: Set<string>, unlimited: boolean) {
  if (unlimited) return true;
  return allowed.has(code.trim().toUpperCase());
}

export async function loadPayModes(): Promise<MockPayMode[]> {
  return safe(
    "vw_paymentmodes",
    async () => {
      const rows = await prisma.$queryRaw<{ PayCode: string; PayDes: string }[]>`
        SELECT RTRIM(PayCode) AS PayCode, RTRIM(PayDes) AS PayDes
          FROM vw_paymentmodes
         WHERE Enable = 1 OR Enable = '1' OR UPPER(RTRIM(Enable)) = 'Y'
         ORDER BY PayDes, PayCode
      `;
      const seen = new Set<string>();
      const out: MockPayMode[] = [];
      for (const r of rows) {
        const payCode = trim(r.PayCode);
        if (!payCode || seen.has(payCode.toUpperCase())) continue;
        seen.add(payCode.toUpperCase());
        out.push({ payCode, payDes: trim(r.PayDes) || payCode });
      }
      return out;
    },
    [],
  );
}

export async function loadReportLocations(
  allowed: Set<string>,
  unlimited: boolean,
): Promise<MockLocation[]> {
  return safe(
    "report locations",
    async () => {
      const fromBook = await safe(
        "vw_bookingheader locations",
        () =>
          prisma.$queryRaw<{ LocCode: string; LocDes: string }[]>`
            SELECT RTRIM(LocCode) AS LocCode, RTRIM(IFNULL(LocDes, '')) AS LocDes
              FROM vw_bookingheader
             WHERE RTRIM(IFNULL(LocCode, '')) <> ''
             GROUP BY RTRIM(LocCode), RTRIM(IFNULL(LocDes, ''))
          `,
        [],
      );
      const fromIssue = await safe(
        "vw_issuenotedetail locations",
        () =>
          prisma.$queryRaw<{ LocCode: string; LocDes: string }[]>`
            SELECT RTRIM(FromLocCode) AS LocCode, RTRIM(IFNULL(LocDes, '')) AS LocDes
              FROM vw_issuenotedetail
             WHERE RTRIM(IFNULL(FromLocCode, '')) <> ''
             GROUP BY RTRIM(FromLocCode), RTRIM(IFNULL(LocDes, ''))
          `,
        [],
      );
      const seen = new Set<string>();
      const out: MockLocation[] = [];
      for (const r of [...fromBook, ...fromIssue]) {
        const locCode = trim(r.LocCode);
        if (!locCode || seen.has(locCode.toUpperCase())) continue;
        if (!locOk(locCode, allowed, unlimited)) continue;
        seen.add(locCode.toUpperCase());
        out.push({ locCode, locName: trim(r.LocDes) || locCode });
      }
      out.sort((a, b) => a.locName.localeCompare(b.locName) || a.locCode.localeCompare(b.locCode));
      return out;
    },
    [],
  );
}

interface HeaderRow {
  BookingID: string;
  LocCode: string;
  LocDes: string | null;
  CusCode: string | null;
  CusName: string | null;
  BookingDate: string | null;
  Status: string | null;
  AdvBookingPayMode: string | null;
  AdvBookingAmount: unknown;
  UserID: string | null;
  UserName: string | null;
  TxnDateTime: string | null;
  Pax: unknown;
  BillingTime: string | null;
}

interface LineRow {
  BookingID: string;
  LocCode: string;
  ServiceItemID: string | null;
  ItemDes: string | null;
  Qty: unknown;
  ItemPrice: unknown;
  TechID: string | null;
  UserName: string | null;
}

interface ItemCatRow {
  LocCode: string;
  ItemCode: string;
  ItemDes: string | null;
  Cat1Des: string | null;
  Cat2Des: string | null;
  ServiceItem: unknown;
}

interface CommRow {
  LocCode: string;
  BillNo: string;
  SplitedAmount: unknown;
  UserName: string | null;
  ItemDes: string | null;
  TechID: string | null;
  ItemID: string | null;
}

interface IssueRow {
  FromLocCode: string;
  LocDes: string | null;
  DocNo: string;
  DocDate: string | null;
  ItemCode: string | null;
  ItemDes: string | null;
  Qty: unknown;
  CostPrice: unknown;
  ItemValue: unknown;
  NetTotal: unknown;
  UserID: string | null;
  UserName: string | null;
}

function matchPay(
  raw: string,
  modes: MockPayMode[],
): { payCode: string; payDes: string } {
  const t = raw.trim();
  if (!t) return { payCode: "UNKNOWN", payDes: "Unknown" };
  const up = t.toUpperCase();
  const hit = modes.find(
    (m) => m.payCode.toUpperCase() === up || m.payDes.toUpperCase() === up,
  );
  if (hit) return hit;
  return { payCode: t, payDes: t };
}

function buildBill(
  h: HeaderRow,
  lines: LineRow[],
  cats: Map<string, ItemCatRow>,
  modes: MockPayMode[],
  sc: number,
): MockBill {
  const locCode = trim(h.LocCode);
  const items: MockItemLine[] = lines.map((ln) => {
    const itemId = trim(ln.ServiceItemID) || "—";
    const cat = cats.get(`${locCode.toUpperCase()}::${itemId.toUpperCase()}`)
      || cats.get(itemId.toUpperCase());
    const qtyRaw = num(ln.Qty);
    const qty = qtyRaw === 0 ? 1 : qtyRaw;
    const price = num(ln.ItemPrice);
    const name = trim(ln.ItemDes) || trim(cat?.ItemDes) || itemId;
    const catL1 = trim(cat?.Cat1Des) || (Number(cat?.ServiceItem) === 0 ? "Retail" : "Service");
    const catL2 = trim(cat?.Cat2Des) || "";
    return {
      itemId,
      name,
      catL1,
      catL2,
      qty,
      price,
      total: round2(qty * price),
      techId: trim(ln.TechID),
      techName: trim(ln.UserName) || trim(ln.TechID) || "—",
    };
  });
  const gross = round2(items.reduce((s, i) => s + i.total, 0));
  const pay = matchPay(trim(h.AdvBookingPayMode), modes);
  const billedAt = h.BillingTime || h.TxnDateTime || h.BookingDate;
  return {
    locCode,
    locName: trim(h.LocDes) || locCode,
    billNo: trim(h.BookingID),
    date: dateOnly(billedAt) || dateOnly(h.BookingDate),
    time: time12(billedAt),
    time24: time24(billedAt),
    cashierId: trim(h.UserID),
    cashierName: trim(h.UserName) || trim(h.UserID) || "—",
    cusId: trim(h.CusCode),
    cusName: trim(h.CusName) || trim(h.CusCode) || "Walk-in",
    pax: Math.max(1, Math.round(num(h.Pax)) || 1),
    gross,
    disPre: 0,
    disVal: 0,
    serviceCharge: round2(sc),
    otherServiceCharge: 0,
    totalTax: 0,
    advAmount: round2(num(h.AdvBookingAmount)),
    netTotal: gross,
    items,
    payments: [{ payCode: pay.payCode, payDes: pay.payDes, amount: gross, remarks: "" }],
    taxes: [],
  };
}

async function loadBilledHeaders(from: string, to: string): Promise<HeaderRow[]> {
  return safe(
    "vw_bookingheader",
    () =>
      prisma.$queryRaw<HeaderRow[]>`
        SELECT
          RTRIM(h.BookingID) AS BookingID,
          RTRIM(h.LocCode) AS LocCode,
          RTRIM(IFNULL(h.LocDes, '')) AS LocDes,
          RTRIM(IFNULL(h.CusCode, '')) AS CusCode,
          RTRIM(IFNULL(h.CusName, '')) AS CusName,
          DATE_FORMAT(h.BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
          RTRIM(IFNULL(h.Status, '')) AS Status,
          RTRIM(IFNULL(h.AdvBookingPayMode, '')) AS AdvBookingPayMode,
          h.AdvBookingAmount AS AdvBookingAmount,
          RTRIM(IFNULL(h.UserID, '')) AS UserID,
          RTRIM(IFNULL(h.UserName, '')) AS UserName,
          DATE_FORMAT(h.TxnDateTime, '%Y-%m-%d %H:%i:%s') AS TxnDateTime,
          h.Pax AS Pax,
          DATE_FORMAT(h.BillingTime, '%Y-%m-%d %H:%i:%s') AS BillingTime
        FROM vw_bookingheader h
        WHERE h.BillingTime IS NOT NULL
          AND h.BillingTime > '1900-01-01 00:00:00'
          AND DATE(h.BillingTime) BETWEEN ${from} AND ${to}
          AND UPPER(RTRIM(IFNULL(h.Status, ''))) <> 'CANCELLED'
        ORDER BY h.BillingTime DESC
        LIMIT 3000
      `,
    [],
  );
}

async function loadServiceLines(bookingIDs: string[]): Promise<LineRow[]> {
  if (!bookingIDs.length) return [];
  const fromService = await safe(
    "vw_bookingservicedetail",
    () =>
      inChunks(bookingIDs, 400, (part) =>
        prisma.$queryRaw<LineRow[]>`
          SELECT
            RTRIM(d.BookingID) AS BookingID,
            RTRIM(d.LocCode) AS LocCode,
            RTRIM(IFNULL(d.ServiceItemID, '')) AS ServiceItemID,
            RTRIM(IFNULL(d.ItemDes, '')) AS ItemDes,
            d.Qty AS Qty,
            d.ItemPrice AS ItemPrice,
            RTRIM(IFNULL(d.TechID, '')) AS TechID,
            RTRIM(IFNULL(d.UserName, '')) AS UserName
          FROM vw_bookingservicedetail d
          WHERE RTRIM(d.BookingID) IN (${Prisma.join(part)})
        `,
      ),
    [],
  );
  const have = new Set(fromService.map((r) => trim(r.BookingID).toUpperCase()));
  const missing = bookingIDs.filter((id) => !have.has(id.toUpperCase()));
  if (!missing.length) return fromService;
  const fromDetail = await safe(
    "vw_bookingdetail",
    () =>
      inChunks(missing, 400, (part) =>
        prisma.$queryRaw<LineRow[]>`
          SELECT
            RTRIM(d.BookingID) AS BookingID,
            RTRIM(d.LocCode) AS LocCode,
            RTRIM(IFNULL(d.ServiceItemID, '')) AS ServiceItemID,
            RTRIM(IFNULL(d.ItemDes, '')) AS ItemDes,
            d.Qty AS Qty,
            d.ItemPrice AS ItemPrice,
            RTRIM(IFNULL(d.TechID, '')) AS TechID,
            RTRIM(IFNULL(d.Technician, '')) AS UserName
          FROM vw_bookingdetail d
          WHERE RTRIM(d.BookingID) IN (${Prisma.join(part)})
        `,
      ),
    [],
  );
  return fromService.concat(fromDetail);
}

async function loadItemCats(keys: { loc: string; item: string }[]): Promise<Map<string, ItemCatRow>> {
  const map = new Map<string, ItemCatRow>();
  const items = [...new Set(keys.map((k) => k.item).filter(Boolean))];
  if (!items.length) return map;
  const rows = await safe(
    "vw_itemmaster",
    () =>
      inChunks(items, 400, (part) =>
        prisma.$queryRaw<ItemCatRow[]>`
          SELECT
            RTRIM(LocCode) AS LocCode,
            RTRIM(ItemCode) AS ItemCode,
            RTRIM(IFNULL(ItemDes, '')) AS ItemDes,
            RTRIM(IFNULL(Cat1Des, '')) AS Cat1Des,
            RTRIM(IFNULL(Cat2Des, '')) AS Cat2Des,
            ServiceItem AS ServiceItem
          FROM vw_itemmaster
          WHERE RTRIM(ItemCode) IN (${Prisma.join(part)})
        `,
      ),
    [],
  );
  for (const r of rows) {
    const loc = trim(r.LocCode).toUpperCase();
    const item = trim(r.ItemCode).toUpperCase();
    map.set(`${loc}::${item}`, r);
    if (!map.has(item)) map.set(item, r);
  }
  return map;
}

async function loadCommissions(billNos: string[]): Promise<CommRow[]> {
  if (!billNos.length) return [];
  return safe(
    "vw_billtechcommissions",
    () =>
      inChunks(billNos, 400, (part) =>
        prisma.$queryRaw<CommRow[]>`
          SELECT
            RTRIM(LocCode) AS LocCode,
            RTRIM(BillNo) AS BillNo,
            SplitedAmount AS SplitedAmount,
            RTRIM(IFNULL(UserName, '')) AS UserName,
            RTRIM(IFNULL(ItemDes, '')) AS ItemDes,
            RTRIM(IFNULL(TechID, '')) AS TechID,
            RTRIM(IFNULL(ItemID, '')) AS ItemID
          FROM vw_billtechcommissions
          WHERE RTRIM(BillNo) IN (${Prisma.join(part)})
        `,
      ),
    [],
  );
}

async function loadIssueNotes(from: string, to: string): Promise<IssueRow[]> {
  return safe(
    "vw_issuenotedetail",
    () =>
      prisma.$queryRaw<IssueRow[]>`
        SELECT
          RTRIM(FromLocCode) AS FromLocCode,
          RTRIM(IFNULL(LocDes, '')) AS LocDes,
          RTRIM(INNO) AS DocNo,
          DATE_FORMAT(INDate, '%Y-%m-%d %H:%i:%s') AS DocDate,
          RTRIM(IFNULL(ItemCode, '')) AS ItemCode,
          RTRIM(IFNULL(RowItmDes, '')) AS ItemDes,
          INQty AS Qty,
          CostPrice AS CostPrice,
          ItemValue AS ItemValue,
          NetTotal AS NetTotal,
          RTRIM(IFNULL(UserID, '')) AS UserID,
          RTRIM(IFNULL(UserName, '')) AS UserName
        FROM vw_issuenotedetail
        WHERE DATE(INDate) BETWEEN ${from} AND ${to}
        LIMIT 4000
      `,
    [],
  );
}

async function loadIssueReqs(from: string, to: string): Promise<IssueRow[]> {
  return safe(
    "vw_issuereqdetail",
    () =>
      prisma.$queryRaw<IssueRow[]>`
        SELECT
          RTRIM(FromLocCode) AS FromLocCode,
          RTRIM(IFNULL(LocDes, '')) AS LocDes,
          RTRIM(IRNO) AS DocNo,
          DATE_FORMAT(IRDate, '%Y-%m-%d %H:%i:%s') AS DocDate,
          RTRIM(IFNULL(ItemCode, '')) AS ItemCode,
          RTRIM(IFNULL(RowItmDes, '')) AS ItemDes,
          IFNULL(IssuedQTY, IRQty) AS Qty,
          CostPrice AS CostPrice,
          ItemValue AS ItemValue,
          NetTotal AS NetTotal,
          RTRIM(IFNULL(UserID, '')) AS UserID,
          RTRIM(IFNULL(UserName, '')) AS UserName
        FROM vw_issuereqdetail
        WHERE DATE(IRDate) BETWEEN ${from} AND ${to}
        LIMIT 4000
      `,
    [],
  );
}

function issueBills(rows: IssueRow[], cats: Map<string, ItemCatRow>): MockBill[] {
  const groups = new Map<string, IssueRow[]>();
  for (const r of rows) {
    const key = `${trim(r.FromLocCode)}::${trim(r.DocNo)}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  const bills: MockBill[] = [];
  for (const list of groups.values()) {
    const h = list[0];
    const locCode = trim(h.FromLocCode);
    const items: MockItemLine[] = list.map((ln) => {
      const itemId = trim(ln.ItemCode) || "—";
      const cat = cats.get(`${locCode.toUpperCase()}::${itemId.toUpperCase()}`)
        || cats.get(itemId.toUpperCase());
      const qty = num(ln.Qty);
      const total = num(ln.ItemValue) || round2(qty * num(ln.CostPrice));
      const price = qty ? round2(total / qty) : num(ln.CostPrice);
      return {
        itemId,
        name: trim(ln.ItemDes) || trim(cat?.ItemDes) || itemId,
        catL1: trim(cat?.Cat1Des) || "Stock",
        catL2: trim(cat?.Cat2Des) || "",
        qty,
        price,
        total: round2(total),
        techId: "",
        techName: trim(h.UserName) || "—",
      };
    });
    const gross = round2(items.reduce((s, i) => s + i.total, 0) || num(h.NetTotal));
    bills.push({
      locCode,
      locName: trim(h.LocDes) || locCode,
      billNo: trim(h.DocNo),
      date: dateOnly(h.DocDate),
      time: time12(h.DocDate),
      time24: time24(h.DocDate),
      cashierId: trim(h.UserID),
      cashierName: trim(h.UserName) || "—",
      cusId: "",
      cusName: "Issue",
      pax: 1,
      gross,
      disPre: 0,
      disVal: 0,
      serviceCharge: 0,
      otherServiceCharge: 0,
      totalTax: 0,
      advAmount: 0,
      netTotal: gross,
      items,
      payments: [],
      taxes: [],
    });
  }
  return bills;
}

async function loadUnused(soldIds: Set<string>): Promise<LiveUnusedItem[]> {
  const rows = await safe(
    "vw_itemmaster unused",
    () =>
      prisma.$queryRaw<{ ItemCode: string; ItemDes: string | null; Cat1Des: string | null }[]>`
        SELECT RTRIM(ItemCode) AS ItemCode,
               RTRIM(IFNULL(ItemDes, '')) AS ItemDes,
               RTRIM(IFNULL(Cat1Des, '')) AS Cat1Des
          FROM vw_itemmaster
         WHERE Enable = 1 OR Enable = '1' OR UPPER(RTRIM(Enable)) = 'Y'
         LIMIT 3000
      `,
    [],
  );
  const seen = new Set<string>();
  const out: LiveUnusedItem[] = [];
  for (const r of rows) {
    const itemId = trim(r.ItemCode);
    if (!itemId || seen.has(itemId.toUpperCase())) continue;
    seen.add(itemId.toUpperCase());
    if (soldIds.has(itemId.toUpperCase())) continue;
    out.push({
      itemId,
      name: trim(r.ItemDes) || itemId,
      catL1: trim(r.Cat1Des) || "Service",
    });
    if (out.length >= 200) break;
  }
  return out;
}

export async function loadLiveReport(opts: {
  reportId: ReportId;
  from: string;
  to: string;
  loc: string;
  pm: string;
  allowed: Set<string>;
  unlimited: boolean;
}): Promise<LiveReportData> {
  const [locations, payModes] = await Promise.all([
    loadReportLocations(opts.allowed, opts.unlimited),
    loadPayModes(),
  ]);

  const empty: LiveReportData = {
    bills: [],
    credit: [],
    unusedItems: [],
    locations,
    payModes,
  };

  if (CREDIT_IDS.has(opts.reportId)) return empty;

  const locFilter = trim(opts.loc);
  const pmFilter = trim(opts.pm);
  const allow = allowedSet([...opts.allowed]);

  if (ISSUE_IDS.has(opts.reportId)) {
    const [notes, reqs] = await Promise.all([
      loadIssueNotes(opts.from, opts.to),
      loadIssueReqs(opts.from, opts.to),
    ]);
    const rows = notes.concat(reqs).filter((r) => {
      const code = trim(r.FromLocCode);
      if (!locOk(code, allow, opts.unlimited)) return false;
      if (locFilter && code.toUpperCase() !== locFilter.toUpperCase()) return false;
      return true;
    });
    const catKeys = rows.map((r) => ({ loc: trim(r.FromLocCode), item: trim(r.ItemCode) }));
    const cats = await loadItemCats(catKeys);
    return { ...empty, bills: issueBills(rows, cats) };
  }

  const headers = (await loadBilledHeaders(opts.from, opts.to)).filter((h) => {
    const code = trim(h.LocCode);
    if (!locOk(code, allow, opts.unlimited)) return false;
    if (locFilter && code.toUpperCase() !== locFilter.toUpperCase()) return false;
    return true;
  });
  if (!headers.length) {
    const unused = opts.reportId === "item-movement" ? await loadUnused(new Set()) : [];
    return { ...empty, unusedItems: unused };
  }

  const bookingIDs = [...new Set(headers.map((h) => trim(h.BookingID)).filter(Boolean))];
  const [lines, comms] = await Promise.all([
    loadServiceLines(bookingIDs),
    loadCommissions(bookingIDs),
  ]);

  const lineMap = new Map<string, LineRow[]>();
  for (const ln of lines) {
    const k = `${trim(ln.LocCode).toUpperCase()}::${trim(ln.BookingID).toUpperCase()}`;
    const list = lineMap.get(k) || [];
    list.push(ln);
    lineMap.set(k, list);
  }
  const scMap = new Map<string, number>();
  for (const c of comms) {
    const k = `${trim(c.LocCode).toUpperCase()}::${trim(c.BillNo).toUpperCase()}`;
    scMap.set(k, round2((scMap.get(k) || 0) + num(c.SplitedAmount)));
  }

  const catKeys: { loc: string; item: string }[] = [];
  for (const ln of lines) catKeys.push({ loc: trim(ln.LocCode), item: trim(ln.ServiceItemID) });
  const cats = await loadItemCats(catKeys);

  let bills = headers.map((h) => {
    const k = `${trim(h.LocCode).toUpperCase()}::${trim(h.BookingID).toUpperCase()}`;
    return buildBill(h, lineMap.get(k) || [], cats, payModes, scMap.get(k) || 0);
  });

  if (pmFilter) {
    bills = bills
      .map((b) => {
        const payments = b.payments.filter(
          (p) =>
            p.payCode.toUpperCase() === pmFilter.toUpperCase() ||
            p.payDes.toUpperCase() === pmFilter.toUpperCase(),
        );
        if (!payments.length) return null;
        const amount = round2(payments.reduce((s, p) => s + p.amount, 0));
        return { ...b, payments, netTotal: amount };
      })
      .filter((b): b is MockBill => b !== null);
  }

  let unusedItems: LiveUnusedItem[] = [];
  if (opts.reportId === "item-movement") {
    const sold = new Set<string>();
    for (const b of bills) for (const it of b.items) sold.add(it.itemId.toUpperCase());
    unusedItems = await loadUnused(sold);
  }

  return { ...empty, bills, unusedItems };
}
