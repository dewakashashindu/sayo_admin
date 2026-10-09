/* rev 33 — report PDF documents (@react-pdf/renderer).
   Each report family gets its own structured PDF document (not a
   screenshot of the web page). Portrait A4 by default; the generic
   table + payment-grid documents use A4 landscape. */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { CreditTxn, MockBill } from "@/lib/billingReports/types";

/* ---------------- helpers ---------------- */

export function fmt2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO yyyy-mm-dd → DD/Mon/YYYY */
export function fmtDMonY(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!y || !d || mi < 0 || mi > 11) return iso;
  return `${d}/${MONTHS[mi]}/${y}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function groupBy<T>(rows: T[], key: (r: T) => string): { key: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r) || "—";
    const list = map.get(k) || [];
    list.push(r);
    map.set(k, list);
  }
  return [...map.entries()].map(([key, rows]) => ({ key, rows }));
}

export interface PdfMeta {
  title: string;
  printDate: string;
  printTime: string;
  from: string; // DD/Mon/YYYY
  to: string;
}

/* ---------------- shared styles ---------------- */

const S = StyleSheet.create({
  page: { padding: 26, fontSize: 8, fontFamily: "Helvetica", color: "#1a1a1a" },
  pageLand: { padding: 22, fontSize: 8, fontFamily: "Helvetica", color: "#1a1a1a" },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  infoRow: { flexDirection: "row", gap: 4, marginBottom: 1 },
  infoLbl: { width: 70, fontWeight: "bold" },
  range: { textAlign: "center", marginVertical: 6, marginBottom: 8 },
  locHead: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: "#173a45", color: "#ffffff",
    padding: "4 6", marginTop: 8, marginBottom: 4, fontWeight: "bold",
  },
  band: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: "#e8e8e8", padding: "3 6", marginTop: 5, fontWeight: "bold",
  },
  thead: {
    flexDirection: "row", backgroundColor: "#f0f0f0",
    padding: "3 4", fontWeight: "bold", borderBottom: "0.6 solid #888",
  },
  row: { flexDirection: "row", padding: "2.4 4", borderBottom: "0.4 solid #ccc" },
  zebra: { backgroundColor: "#fafafa" },
  num: { textAlign: "right" },
  bold: { fontWeight: "bold" },
  subRow: {
    flexDirection: "row", justifyContent: "space-between",
    padding: "2.4 4", fontWeight: "bold", backgroundColor: "#f2f2f2",
    borderTop: "0.6 solid #888",
  },
  grandRow: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 8, padding: "5 6", backgroundColor: "#1d7a34", color: "#ffffff",
    fontWeight: "bold", fontSize: 9,
  },
  box: { borderWidth: 0.6, borderColor: "#888", padding: "3 6", marginTop: 3, marginBottom: 4 },
  boxRow: { flexDirection: "row", justifyContent: "space-between" },
});

function Header({ meta }: { meta: PdfMeta }) {
  return (
    <>
      <Text style={S.title}>{meta.title}</Text>
      <View style={S.infoRow}><Text style={S.infoLbl}>Print Date :</Text><Text>{meta.printDate}</Text></View>
      <View style={S.infoRow}><Text style={S.infoLbl}>Print Time :</Text><Text>{meta.printTime}</Text></View>
      <Text style={S.range}>From {meta.from} To {meta.to}</Text>
    </>
  );
}

/* =========================================================
   SALES SUMMARY — location → date → bill rows
   ========================================================= */
export function SalesSummaryPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const locTotal = round2(loc.rows.reduce((s, b) => s + b.netTotal, 0));
          const dates = groupBy(loc.rows, (b) => b.date);
          return (
            <View key={loc.key} fixed={false}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(locTotal)}</Text>
              </View>
              <View style={S.thead}>
                <Text style={{ width: "14%" }}>Date</Text>
                <Text style={{ width: "18%" }}>Bill No</Text>
                <Text style={{ width: "14%" }}>Time</Text>
                <Text style={{ width: "24%" }}>Cashier</Text>
                <Text style={{ width: "30%", textAlign: "right" }}>Net Total</Text>
              </View>
              {dates.map((d) => (
                <View key={d.key}>
                  {d.rows.map((b, i) => (
                    <View key={b.billNo + i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                      <Text style={{ width: "14%" }}>{b.date}</Text>
                      <Text style={{ width: "18%" }}>{b.billNo}</Text>
                      <Text style={{ width: "14%" }}>{b.time24}</Text>
                      <Text style={{ width: "24%" }}>{b.cashierName}</Text>
                      <Text style={{ width: "30%", textAlign: "right" }}>{fmt2(b.netTotal)}</Text>
                    </View>
                  ))}
                  <View style={S.subRow}>
                    <Text>Daily Collection — {d.key}</Text>
                    <Text>{fmt2(round2(d.rows.reduce((s, b) => s + b.netTotal, 0)))}</Text>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
        <View style={S.grandRow}>
          <Text>Grand Total — {bills.length} bills</Text>
          <Text>{fmt2(grand)}</Text>
        </View>
      </Page>
    </Document>
  );
}

/* =========================================================
   SALES DETAIL — per-bill item rows + summary box
   ========================================================= */
export function SalesDetailPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const locTotal = round2(loc.rows.reduce((s, b) => s + b.netTotal, 0));
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(locTotal)}</Text>
              </View>
              {loc.rows.map((b) => (
                <View key={b.billNo} style={{ marginBottom: 6 }}>
                  <View style={S.band}>
                    <Text>Bill {b.billNo} — {b.date} {b.time24} — Cashier: {b.cashierName}</Text>
                    <Text>{fmt2(b.netTotal)}</Text>
                  </View>
                  <View style={S.thead}>
                    <Text style={{ width: "18%" }}>Item</Text>
                    <Text style={{ width: "34%" }}>Description</Text>
                    <Text style={{ width: "12%", textAlign: "right" }}>Qty</Text>
                    <Text style={{ width: "18%", textAlign: "right" }}>Price</Text>
                    <Text style={{ width: "18%", textAlign: "right" }}>Total</Text>
                  </View>
                  {b.items.map((it, i) => (
                    <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                      <Text style={{ width: "18%" }}>{it.itemId}</Text>
                      <Text style={{ width: "34%" }}>{it.name}</Text>
                      <Text style={{ width: "12%", textAlign: "right" }}>{it.qty}</Text>
                      <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(it.price)}</Text>
                      <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(it.total)}</Text>
                    </View>
                  ))}
                  <View style={S.box}>
                    <View style={S.boxRow}><Text>Gross</Text><Text>{fmt2(b.gross)}</Text></View>
                    <View style={S.boxRow}><Text>Discount ({b.disPre}%)</Text><Text>-{fmt2(b.disVal)}</Text></View>
                    <View style={S.boxRow}><Text>Service Charge</Text><Text>{fmt2(b.serviceCharge)}</Text></View>
                    <View style={S.boxRow}><Text>Other Service Charge</Text><Text>{fmt2(b.otherServiceCharge)}</Text></View>
                    <View style={S.boxRow}><Text>Tax</Text><Text>{fmt2(b.totalTax)}</Text></View>
                    <View style={[S.boxRow, { fontWeight: "bold" }]}><Text>Net Total</Text><Text>{fmt2(b.netTotal)}</Text></View>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
        <View style={S.grandRow}>
          <Text>Grand Total — {bills.length} bills</Text>
          <Text>{fmt2(grand)}</Text>
        </View>
      </Page>
    </Document>
  );
}

/* =========================================================
   SALES BY CATEGORY — summary / detail
   ========================================================= */
export function SalesCategoryPdfDocument({
  meta, bills, detail,
}: { meta: PdfMeta; bills: MockBill[]; detail?: boolean }) {
  const lines = bills.flatMap((b) => b.items.map((it) => ({ ...it, locCode: b.locCode, locName: b.locName, billNo: b.billNo, date: b.date, time: b.time24 })));
  const locs = groupBy(lines, (l) => l.locCode);
  const grand = round2(lines.reduce((s, l) => s + l.total, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const locTotal = round2(loc.rows.reduce((s, l) => s + l.total, 0));
          const cats = groupBy(loc.rows, (l) => l.catL1 || "UNCATEGORISED");
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(locTotal)}</Text>
              </View>
              {cats.map((c) => {
                const catTotal = round2(c.rows.reduce((s, l) => s + l.total, 0));
                const subs = groupBy(c.rows, (l) => l.catL2 || "");
                return (
                  <View key={c.key}>
                    <View style={S.band}><Text>{c.key}</Text><Text>{fmt2(catTotal)}</Text></View>
                    {subs.map((sub) => {
                      const items = groupBy(sub.rows, (l) => l.itemId);
                      return (
                        <View key={sub.key || "—"}>
                          {sub.key ? <Text style={{ fontWeight: "bold", marginTop: 3, marginLeft: 6 }}>{sub.key}</Text> : null}
                          {detail ? (
                            items.flatMap((it) =>
                              it.rows.map((r, i) => (
                                <View key={`${it.key}-${i}`} style={[S.row, i % 2 ? S.zebra : undefined]}>
                                  <Text style={{ width: "16%" }}>{r.billNo}</Text>
                                  <Text style={{ width: "30%" }}>{r.name}</Text>
                                  <Text style={{ width: "10%", textAlign: "right" }}>{r.qty}</Text>
                                  <Text style={{ width: "16%", textAlign: "right" }}>{fmt2(r.price)}</Text>
                                  <Text style={{ width: "12%" }}>{r.time}</Text>
                                  <Text style={{ width: "16%", textAlign: "right" }}>{fmt2(r.total)}</Text>
                                </View>
                              )),
                            )
                          ) : (
                            items.map((it) => (
                              <View key={it.key} style={S.row}>
                                <Text style={{ width: "20%" }}>{it.key}</Text>
                                <Text style={{ width: "52%" }}>{it.rows[0].name}</Text>
                                <Text style={{ width: "12%", textAlign: "right" }}>{round2(it.rows.reduce((s, r) => s + r.qty, 0))}</Text>
                                <Text style={{ width: "16%", textAlign: "right" }}>{fmt2(round2(it.rows.reduce((s, r) => s + r.total, 0)))}</Text>
                              </View>
                            ))
                          )}
                        </View>
                      );
                    })}
                    <View style={S.subRow}><Text>Category Total — {c.key}</Text><Text>{fmt2(catTotal)}</Text></View>
                  </View>
                );
              })}
            </View>
          );
        })}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   HOURLY SALES
   ========================================================= */
export function HourlySalesPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const hours = groupBy(loc.rows, (b) => b.time24.slice(0, 2) + ":00");
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(round2(loc.rows.reduce((s, b) => s + b.netTotal, 0)))}</Text>
              </View>
              <View style={S.thead}>
                <Text style={{ width: "40%" }}>Time Range</Text>
                <Text style={{ width: "30%", textAlign: "right" }}>No of Sales</Text>
                <Text style={{ width: "30%", textAlign: "right" }}>Sales Amount</Text>
              </View>
              {hours.map((h, i) => (
                <View key={h.key} style={[S.row, i % 2 ? S.zebra : undefined]}>
                  <Text style={{ width: "40%" }}>{h.key} — {String(Number(h.key.slice(0, 2)) + 1).padStart(2, "0")}:00</Text>
                  <Text style={{ width: "30%", textAlign: "right" }}>{h.rows.length}</Text>
                  <Text style={{ width: "30%", textAlign: "right" }}>{fmt2(round2(h.rows.reduce((s, b) => s + b.netTotal, 0)))}</Text>
                </View>
              ))}
            </View>
          );
        })}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   PAYMENT SUMMARY / PAY MODE WISE
   ========================================================= */
export function PaymentSummaryPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const pays = bills.flatMap((b) => b.payments.map((p) => ({ ...p, locCode: b.locCode, locName: b.locName, billNo: b.billNo, date: b.date, cashier: b.cashierName })));
  const locs = groupBy(pays, (p) => p.locCode);
  const grand = round2(pays.reduce((s, p) => s + p.amount, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const dates = groupBy(loc.rows, (p) => p.date);
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(round2(loc.rows.reduce((s, p) => s + p.amount, 0)))}</Text>
              </View>
              {dates.map((d) => (
                <View key={d.key}>
                  <View style={S.band}><Text>{d.key}</Text><Text>{fmt2(round2(d.rows.reduce((s, p) => s + p.amount, 0)))}</Text></View>
                  {d.rows.map((p, i) => (
                    <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                      <Text style={{ width: "18%" }}>{p.billNo}</Text>
                      <Text style={{ width: "26%" }}>{p.payDes}</Text>
                      <Text style={{ width: "26%" }}>{p.cashier}</Text>
                      <Text style={{ width: "14%" }}>{p.remarks}</Text>
                      <Text style={{ width: "16%", textAlign: "right" }}>{fmt2(p.amount)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        })}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   PAYMENT GRID (landscape) — bill × pay mode pivot
   ========================================================= */
export function PaymentGridPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const modes = [...new Set(bills.flatMap((b) => b.payments.map((p) => p.payDes)))].sort();
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  const colW = modes.length ? Math.min(14, Math.floor(70 / modes.length)) : 14;
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" orientation="landscape" style={S.pageLand}>
        <Header meta={meta} />
        <View style={S.thead}>
          <Text style={{ width: "16%" }}>Bill No</Text>
          <Text style={{ width: "12%" }}>Date</Text>
          {modes.map((m) => (
            <Text key={m} style={{ width: `${colW}%`, textAlign: "right" }}>{m}</Text>
          ))}
          <Text style={{ width: "16%", textAlign: "right" }}>Net Total</Text>
        </View>
        {bills.map((b, i) => (
          <View key={b.billNo + i} style={[S.row, i % 2 ? S.zebra : undefined]}>
            <Text style={{ width: "16%" }}>{b.billNo}</Text>
            <Text style={{ width: "12%" }}>{b.date}</Text>
            {modes.map((m) => {
              const amt = round2(b.payments.filter((p) => p.payDes === m).reduce((s, p) => s + p.amount, 0));
              return <Text key={m} style={{ width: `${colW}%`, textAlign: "right" }}>{amt ? fmt2(amt) : "—"}</Text>;
            })}
            <Text style={{ width: "16%", textAlign: "right" }}>{fmt2(b.netTotal)}</Text>
          </View>
        ))}
        <View style={S.grandRow}><Text>Grand Total — {bills.length} bills</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   CASHIER WISE SALES
   ========================================================= */
export function CashierSalesPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const cashiers = groupBy(loc.rows, (b) => b.cashierName);
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(round2(loc.rows.reduce((s, b) => s + b.netTotal, 0)))}</Text>
              </View>
              {cashiers.map((c) => (
                <View key={c.key}>
                  <View style={S.band}><Text>Cashier: {c.key}</Text><Text>{fmt2(round2(c.rows.reduce((s, b) => s + b.netTotal, 0)))}</Text></View>
                  {c.rows.map((b, i) => (
                    <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                      <Text style={{ width: "22%" }}>{b.billNo}</Text>
                      <Text style={{ width: "20%" }}>{b.date}</Text>
                      <Text style={{ width: "20%" }}>{b.time24}</Text>
                      <Text style={{ width: "38%", textAlign: "right" }}>{fmt2(b.netTotal)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        })}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   CASHIER PAYMENT BREAKDOWN
   ========================================================= */
export function CashierBreakdownPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const pays = bills.flatMap((b) => b.payments.map((p) => ({ ...p, locCode: b.locCode, locName: b.locName, billNo: b.billNo, date: b.date, time: b.time24, cashier: b.cashierName })));
  const locs = groupBy(pays, (p) => p.locCode);
  const grand = round2(pays.reduce((s, p) => s + p.amount, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const cashiers = groupBy(loc.rows, (p) => p.cashier);
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(round2(loc.rows.reduce((s, p) => s + p.amount, 0)))}</Text>
              </View>
              {cashiers.map((c) => {
                const modes = groupBy(c.rows, (p) => p.payDes);
                return (
                  <View key={c.key}>
                    <View style={S.band}><Text>Cashier: {c.key}</Text><Text>{fmt2(round2(c.rows.reduce((s, p) => s + p.amount, 0)))}</Text></View>
                    {modes.map((m) => (
                      <View key={m.key}>
                        {m.rows.map((p, i) => (
                          <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                            <Text style={{ width: "20%" }}>{p.billNo}</Text>
                            <Text style={{ width: "16%" }}>{p.date}</Text>
                            <Text style={{ width: "14%" }}>{p.time}</Text>
                            <Text style={{ width: "30%" }}>{m.key}</Text>
                            <Text style={{ width: "20%", textAlign: "right" }}>{fmt2(p.amount)}</Text>
                          </View>
                        ))}
                        <View style={S.subRow}><Text>{m.key} subtotal</Text><Text>{fmt2(round2(m.rows.reduce((s, p) => s + p.amount, 0)))}</Text></View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   ITEM ISSUE (+ by date)
   ========================================================= */
export function ItemIssuePdfDocument({ meta, bills, byDate }: { meta: PdfMeta; bills: MockBill[]; byDate?: boolean }) {
  const lines = bills.flatMap((b) => b.items.map((it) => ({ ...it, locCode: b.locCode, locName: b.locName, date: b.date, dept: it.catL1 || "UNKNOWN", unit: it.qty ? round2(it.total / it.qty) : it.price })));
  const locs = groupBy(lines, (l) => l.locCode);
  const grand = round2(lines.reduce((s, l) => s + l.total, 0));

  function deptTables(rows: typeof lines) {
    const depts = groupBy(rows, (r) => r.dept);
    return depts.map((d) => {
      const items = groupBy(d.rows, (r) => r.itemId);
      return (
        <View key={d.key}>
          <View style={S.band}><Text>{d.key}</Text><Text>{fmt2(round2(d.rows.reduce((s, r) => s + r.total, 0)))}</Text></View>
          <View style={S.thead}>
            <Text style={{ width: "18%" }}>Item Code</Text>
            <Text style={{ width: "34%" }}>Description</Text>
            <Text style={{ width: "12%", textAlign: "right" }}>Qty</Text>
            <Text style={{ width: "18%", textAlign: "right" }}>Value / Unit</Text>
            <Text style={{ width: "18%", textAlign: "right" }}>Total</Text>
          </View>
          {items.map((it) => (
            <View key={it.key} style={S.row}>
              <Text style={{ width: "18%" }}>{it.key}</Text>
              <Text style={{ width: "34%" }}>{it.rows[0].name}</Text>
              <Text style={{ width: "12%", textAlign: "right" }}>{round2(it.rows.reduce((s, r) => s + r.qty, 0))}</Text>
              <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(it.rows[0].unit)}</Text>
              <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(round2(it.rows.reduce((s, r) => s + r.total, 0)))}</Text>
            </View>
          ))}
        </View>
      );
    });
  }

  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const dates = groupBy(loc.rows, (r) => r.date);
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{fmt2(round2(loc.rows.reduce((s, r) => s + r.total, 0)))}</Text>
              </View>
              {byDate
                ? dates.map((d) => (
                  <View key={d.key}>
                    <View style={S.band}><Text>{d.key}</Text><Text>{fmt2(round2(d.rows.reduce((s, r) => s + r.total, 0)))}</Text></View>
                    {deptTables(d.rows)}
                  </View>
                ))
                : deptTables(loc.rows)}
            </View>
          );
        })}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   ITEM MOVEMENT — fast / slow / non sections
   ========================================================= */
export function ItemMovementPdfDocument({
  meta, bills, unusedItems,
}: { meta: PdfMeta; bills: MockBill[]; unusedItems: { itemId: string; name: string }[] }) {
  const soldMap = new Map<string, { itemId: string; name: string; locCode: string; locName: string; qty: number }>();
  for (const b of bills) {
    for (const it of b.items) {
      const k = `${b.locCode}|${it.itemId}`;
      const cur = soldMap.get(k) || { itemId: it.itemId, name: it.name, locCode: b.locCode, locName: b.locName, qty: 0 };
      cur.qty = round2(cur.qty + it.qty);
      soldMap.set(k, cur);
    }
  }
  const sold = [...soldMap.values()];
  const fast = sold.filter((s) => s.qty >= 10).sort((a, b) => b.qty - a.qty);
  const slow = sold.filter((s) => s.qty < 10).sort((a, b) => a.qty - b.qty);

  function section(title: string, rows: { itemId: string; name: string; locCode: string; qty: number }[]) {
    return (
      <View>
        <View style={S.band}><Text>{title}</Text><Text>{rows.length} items</Text></View>
        <View style={S.thead}>
          <Text style={{ width: "16%" }}>Location</Text>
          <Text style={{ width: "20%" }}>Item Code</Text>
          <Text style={{ width: "48%" }}>Description</Text>
          <Text style={{ width: "16%", textAlign: "right" }}>Qty Sold</Text>
        </View>
        {rows.map((r, i) => (
          <View key={`${r.locCode}-${r.itemId}`} style={[S.row, i % 2 ? S.zebra : undefined]}>
            <Text style={{ width: "16%" }}>{r.locCode}</Text>
            <Text style={{ width: "20%" }}>{r.itemId}</Text>
            <Text style={{ width: "48%" }}>{r.name}</Text>
            <Text style={{ width: "16%", textAlign: "right" }}>{r.qty}</Text>
          </View>
        ))}
        {!rows.length ? <Text style={{ padding: "4 6", color: "#666" }}>No items.</Text> : null}
      </View>
    );
  }

  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {section("Fast Moving Items (qty ≥ 10)", fast)}
        {section("Slow Moving Items (qty < 10)", slow)}
        {section("NON-Moving Items (no sales in range)", unusedItems.map((u) => ({ ...u, locCode: "—", qty: 0 })))}
      </Page>
    </Document>
  );
}

/* =========================================================
   GENERIC LANDSCAPE TABLE — transaction summary / service charge
   ========================================================= */
export interface GenericCol { header: string; width: number; num?: boolean; get: (b: MockBill) => string }
export function ReportPdfDocument({
  meta, bills, columns,
}: { meta: PdfMeta; bills: MockBill[]; columns: GenericCol[] }) {
  const totals = columns
    .map((c) => {
      const vals = bills.map((b) => Number(c.get(b)));
      const allNum = vals.every((v) => !Number.isNaN(v));
      return allNum && c.num ? round2(vals.reduce((s, v) => s + v, 0)) : null;
    });
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" orientation="landscape" style={S.pageLand}>
        <Text style={S.title}>{meta.title}</Text>
        <Text style={S.range}>From {meta.from} To {meta.to}</Text>
        <View style={S.thead}>
          {columns.map((c) => (
            <Text key={c.header} style={{ width: `${c.width}%`, textAlign: c.num ? "right" : "left" }}>{c.header}</Text>
          ))}
        </View>
        {bills.map((b, i) => (
          <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
            {columns.map((c) => (
              <Text key={c.header} style={{ width: `${c.width}%`, textAlign: c.num ? "right" : "left" }}>{c.get(b)}</Text>
            ))}
          </View>
        ))}
        <View style={S.subRow}>
          <Text>Totals</Text>
          <View style={{ flexDirection: "row" }}>
            {columns.map((c, i) => (
              <Text key={c.header} style={{ width: `${c.width * 4}px`, textAlign: "right" }}>
                {i === 0 ? "" : totals[i] !== null ? fmt2(totals[i] as number) : ""}
              </Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

/* =========================================================
   TAX REPORT
   ========================================================= */
export function TaxPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.totalTax, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => (
          <View key={loc.key}>
            <View style={S.locHead}>
              <Text>{loc.key} — {loc.rows[0].locName}</Text>
              <Text>{fmt2(round2(loc.rows.reduce((s, b) => s + b.totalTax, 0)))}</Text>
            </View>
            <View style={S.thead}>
              <Text style={{ width: "16%" }}>Date</Text>
              <Text style={{ width: "20%" }}>Bill No</Text>
              <Text style={{ width: "22%", textAlign: "right" }}>Gross</Text>
              <Text style={{ width: "22%", textAlign: "right" }}>Net Total</Text>
              <Text style={{ width: "20%", textAlign: "right" }}>Tax Amount</Text>
            </View>
            {loc.rows.map((b, i) => (
              <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                <Text style={{ width: "16%" }}>{b.date}</Text>
                <Text style={{ width: "20%" }}>{b.billNo}</Text>
                <Text style={{ width: "22%", textAlign: "right" }}>{fmt2(b.gross)}</Text>
                <Text style={{ width: "22%", textAlign: "right" }}>{fmt2(b.netTotal)}</Text>
                <Text style={{ width: "20%", textAlign: "right" }}>{fmt2(b.totalTax)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={S.grandRow}><Text>Grand Total Tax</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}

/* =========================================================
   PAX COUNT
   ========================================================= */
export function PaxPdfDocument({ meta, bills }: { meta: PdfMeta; bills: MockBill[] }) {
  const locs = groupBy(bills, (b) => b.locCode);
  const gPax = bills.reduce((s, b) => s + b.pax, 0);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        {locs.map((loc) => {
          const dates = groupBy(loc.rows, (b) => b.date);
          return (
            <View key={loc.key}>
              <View style={S.locHead}>
                <Text>{loc.key} — {loc.rows[0].locName}</Text>
                <Text>{loc.rows.reduce((s, b) => s + b.pax, 0)} pax</Text>
              </View>
              <Text style={{ fontWeight: "bold", marginTop: 4 }}>Average Numbers Of Pax Per (Summary)</Text>
              <View style={S.thead}>
                <Text style={{ width: "40%" }}>Date</Text>
                <Text style={{ width: "20%", textAlign: "right" }}>Total Pax</Text>
                <Text style={{ width: "20%", textAlign: "right" }}>Total Bills</Text>
                <Text style={{ width: "20%", textAlign: "right" }}>Avg Pax / Bill</Text>
              </View>
              {dates.map((d) => {
                const pax = d.rows.reduce((s, b) => s + b.pax, 0);
                return (
                  <View key={d.key} style={S.row}>
                    <Text style={{ width: "40%" }}>{d.key}</Text>
                    <Text style={{ width: "20%", textAlign: "right" }}>{pax}</Text>
                    <Text style={{ width: "20%", textAlign: "right" }}>{d.rows.length}</Text>
                    <Text style={{ width: "20%", textAlign: "right" }}>{(pax / d.rows.length).toFixed(2)}</Text>
                  </View>
                );
              })}
              <Text style={{ fontWeight: "bold", marginTop: 6 }}>Average Spending On Pax</Text>
              <View style={S.thead}>
                <Text style={{ width: "18%" }}>Date</Text>
                <Text style={{ width: "22%" }}>Bill No</Text>
                <Text style={{ width: "15%", textAlign: "right" }}>Total Pax</Text>
                <Text style={{ width: "25%", textAlign: "right" }}>Total Spending</Text>
                <Text style={{ width: "20%", textAlign: "right" }}>Avg Spending / Pax</Text>
              </View>
              {loc.rows.map((b, i) => (
                <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
                  <Text style={{ width: "18%" }}>{b.date}</Text>
                  <Text style={{ width: "22%" }}>{b.billNo}</Text>
                  <Text style={{ width: "15%", textAlign: "right" }}>{b.pax}</Text>
                  <Text style={{ width: "25%", textAlign: "right" }}>{fmt2(b.netTotal)}</Text>
                  <Text style={{ width: "20%", textAlign: "right" }}>{b.pax ? fmt2(round2(b.netTotal / b.pax)) : "0.00"}</Text>
                </View>
              ))}
            </View>
          );
        })}
        <View style={S.grandRow}>
          <Text>Grand Total — {gPax} pax · {bills.length} bills</Text>
          <Text>{fmt2(grand)}</Text>
        </View>
      </Page>
    </Document>
  );
}

/* =========================================================
   CREDIT REPORTS (rows appear once credit tables connect)
   ========================================================= */
export function CreditPdfDocument({ meta, credit }: { meta: PdfMeta; credit: CreditTxn[] }) {
  const grand = round2(credit.reduce((s, c) => s + c.tranAmt, 0));
  return (
    <Document title={meta.title} author="SAYO ADMIN">
      <Page size="A4" style={S.page}>
        <Header meta={meta} />
        <View style={S.thead}>
          <Text style={{ width: "14%" }}>Date</Text>
          <Text style={{ width: "16%" }}>Customer</Text>
          <Text style={{ width: "16%" }}>{credit.some((c) => c.type === "PAY") ? "Ref No" : "Bill No"}</Text>
          <Text style={{ width: "18%", textAlign: "right" }}>Bill Total</Text>
          <Text style={{ width: "18%", textAlign: "right" }}>Amount</Text>
          <Text style={{ width: "18%", textAlign: "right" }}>Balance</Text>
        </View>
        {credit.map((c, i) => (
          <View key={i} style={[S.row, i % 2 ? S.zebra : undefined]}>
            <Text style={{ width: "14%" }}>{c.date}</Text>
            <Text style={{ width: "16%" }}>{c.cusName}</Text>
            <Text style={{ width: "16%" }}>{c.refNo || c.billNo}</Text>
            <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(c.totalBill)}</Text>
            <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(c.tranAmt)}</Text>
            <Text style={{ width: "18%", textAlign: "right" }}>{fmt2(c.balance)}</Text>
          </View>
        ))}
        {!credit.length ? <Text style={{ padding: "8 4", color: "#666" }}>No credit transactions for this range.</Text> : null}
        <View style={S.grandRow}><Text>Grand Total</Text><Text>{fmt2(grand)}</Text></View>
      </Page>
    </Document>
  );
}
