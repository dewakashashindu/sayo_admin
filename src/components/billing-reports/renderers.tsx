"use client";

import { Fragment, useState } from "react";
import type { ChartSpec, CreditTxn, MockBill, ReportId } from "@/lib/billingReports/types";
import { fmtDMY } from "@/lib/billingReports/dates";
import { matches, money, moneyPlain, qty, round2 } from "@/lib/billingReports/format";
import { groupBy } from "@/lib/billingReports/group";
import { HOUR_SLOTS, MOCK_UNUSED_ITEMS, slotForTime } from "@/lib/billingReports/mock";

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="br-empty">
      <p style={{ fontWeight: 700 }}>{text}</p>
      {hint && <p style={{ marginTop: 6, color: "#94a3b8" }}>{hint}</p>}
    </div>
  );
}

function LocBar({ code, name, right, purple }: { code: string; name: string; right: string; purple?: boolean }) {
  return (
    <div className={`br-loc ${purple ? "purple" : ""}`}>
      <span>{code} — {name}</span>
      <span>{right}</span>
    </div>
  );
}

function Grand({ left, right, navy }: { left: string; right: string; navy?: boolean }) {
  return (
    <div className={`br-grand ${navy ? "navy" : ""}`}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/* ───────── Sales Details ───────── */
function SalesDetails({ bills }: { bills: MockBill[] }) {
  if (!bills.length) {
    return <Empty text="No bill details found for the selected date range." hint="Try changing the date range or clearing the search." />;
  }
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {locs.map(({ key, rows }) => {
        const locNet = round2(rows.reduce((s, b) => s + b.netTotal, 0));
        const dates = groupBy(rows, (b) => b.date);
        return (
          <div key={key} className="br-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#1e3a40,#3d5c63)", color: "#fff", padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
              <b>{rows[0].locName}</b>
              <span>{rows.length} bills · {money(locNet)}</span>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              {dates.map((d) => {
                const dayNet = round2(d.rows.reduce((s, b) => s + b.netTotal, 0));
                return (
                  <div key={d.key}>
                    <div className="br-dateband">
                      <span>{fmtDMY(d.key)}</span>
                      <span>{money(dayNet)}</span>
                    </div>
                    {d.rows.map((b) => (
                      <div key={b.billNo} style={{ marginTop: 8, padding: "8px 4px", borderBottom: "1px solid #eef2f6" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                          <b style={{ fontSize: 13 }}>{b.billNo}</b>
                          <span className="br-pill">Cashier {b.cashierName}</span>
                          <span className="br-pill">Pax {b.pax}</span>
                          {b.items[0] && <span className="br-pill">Tech {b.items[0].techName}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <table className="br-table" style={{ flex: 1, minWidth: 240 }}>
                            <thead>
                              <tr><th>Service / Item</th><th className="num">Qty</th><th className="num">Sales Price</th><th className="num">Tot Item Price</th></tr>
                            </thead>
                            <tbody>
                              {b.items.map((it) => (
                                <tr key={it.itemId + it.name}>
                                  <td>{it.name}</td>
                                  <td className="num">{qty(it.qty)}</td>
                                  <td className="num">{moneyPlain(it.price)}</td>
                                  <td className="num">{moneyPlain(it.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ width: 250, background: "#f8fafc", borderRadius: 10, padding: 10, fontSize: 12 }}>
                            {[
                              ["Gross", b.gross],
                              [b.disPre ? `Discount (${b.disPre} %)` : "Discount", b.disVal],
                              ["Gross After Dis.", b.gross - b.disVal],
                              ["Service Charge", b.serviceCharge],
                              ["Other Service Charge", b.otherServiceCharge],
                              ["Tax", b.totalTax],
                              ["Advance", b.advAmount],
                              ["Net Total", b.netTotal],
                            ].map(([k, v]) => (
                              <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: k === "Net Total" ? 800 : 500 }}>
                                <span>{k}</span><span>{moneyPlain(Number(v))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
                <span>{rows.length} bills · net total {money(locNet)}</span>
                <span className="br-live"><i /> Live data</span>
              </div>
            </div>
          </div>
        );
      })}
      <Grand navy left={`Grand Total — ${bills.length} bills`} right={money(grand)} />
    </div>
  );
}

/* ───────── Category ───────── */
function CategorySummary({ bills }: { bills: MockBill[] }) {
  const lines = bills.flatMap((b) => b.items.map((it) => ({ ...it, locCode: b.locCode, locName: b.locName })));
  if (!lines.length) return <Empty text="No category sales found for this range." />;
  const locs = groupBy(lines, (l) => l.locCode);
  const grand = round2(lines.reduce((s, l) => s + l.total, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: "#64748b" }}>
        <span>Item Categories</span><span>SalesTotal</span>
      </div>
      {locs.map(({ key, rows }) => {
        const locTot = round2(rows.reduce((s, r) => s + r.total, 0));
        const cats = groupBy(rows, (r) => r.catL1 || "UNKNOWN");
        return (
          <div key={key}>
            <LocBar code={key} name={rows[0].locName} right={money(locTot)} />
            {cats.map((c) => {
              const cTot = round2(c.rows.reduce((s, r) => s + r.total, 0));
              return (
                <div key={c.key} style={{ marginTop: 8 }}>
                  <div className="br-catband"><span>{c.key}</span><span>{moneyPlain(cTot)}</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 150px", gap: 8, padding: "6px 10px" }}>
                    {c.rows.map((r, i) => (
                      <div key={r.itemId + i} style={{ display: "contents", fontSize: 12 }}>
                        <span style={{ color: "#64748b" }}>{r.catL2 || "—"}</span>
                        <span>{r.name}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{moneyPlain(r.total)}</span>
                      </div>
                    ))}
                    <div style={{ display: "contents", fontWeight: 800 }}>
                      <span /><span>Category total</span>
                      <span style={{ textAlign: "right" }}>{moneyPlain(cTot)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ textAlign: "right", fontWeight: 800, fontSize: 14, borderBottom: "3px double #1e3a40", paddingBottom: 6 }}>
        Grand Total {money(grand)}
      </div>
    </div>
  );
}

function CategoryDetail({ bills }: { bills: MockBill[] }) {
  const rows = bills.flatMap((b) =>
    b.items.map((it) => ({
      ...it, billNo: b.billNo, date: b.date, time: b.time, locCode: b.locCode, locName: b.locName, tech: it.techName,
    })),
  );
  if (!rows.length) return <Empty text="No category sales found for this range." />;
  const locs = groupBy(rows, (r) => r.locCode);
  const grand = round2(rows.reduce((s, r) => s + r.total, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows: locRows }) => {
        const cats = groupBy(locRows, (r) => r.catL1 || "UNKNOWN");
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar code={key} name={locRows[0].locName} right={money(round2(locRows.reduce((s, r) => s + r.total, 0)))} />
            <table className="br-table">
              <thead>
                <tr>
                  <th>BillNO</th><th>Item</th><th className="num">SaleTotal</th><th>Technician</th><th>TxnTime</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => {
                  const subs = groupBy(c.rows, (r) => r.catL2 || "—");
                  const cTot = round2(c.rows.reduce((s, r) => s + r.total, 0));
                  return (
                    <Fragment key={c.key}>
                      <tr><td colSpan={5} style={{ background: "#dbeafe", fontWeight: 800, textTransform: "uppercase" }}>{c.key} · {moneyPlain(cTot)}</td></tr>
                      {subs.map((s) => (
                        <Fragment key={c.key + s.key}>
                          <tr>
                            <td colSpan={5} style={{ background: "#eff6ff", fontWeight: 700 }}>{s.key} · Sub Total {moneyPlain(round2(s.rows.reduce((a, r) => a + r.total, 0)))}</td>
                          </tr>
                          {s.rows.map((r, i) => (
                            <tr key={r.billNo + r.itemId + i}>
                              <td>{r.billNo}</td>
                              <td>{r.name}</td>
                              <td className="num">{moneyPlain(r.total)}</td>
                              <td>{r.tech}</td>
                              <td>{fmtDMY(r.date)} {r.time}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      <tr className="tot"><td colSpan={2}>Main Category Total</td><td className="num">{moneyPlain(cTot)}</td><td colSpan={2} /></tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

/* ───────── Hourly ───────── */
function HourlySales({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No sales found in the defined time slots for this range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  let allCount = 0;
  let allAmt = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const slots = HOUR_SLOTS.map((s) => {
          const inSlot = rows.filter((b) => slotForTime(b.time24) === s.label);
          return { label: s.label, count: inSlot.length, amount: round2(inSlot.reduce((a, b) => a + b.netTotal, 0)) };
        }).filter((s) => s.count || s.amount);
        const locAmt = round2(slots.reduce((s, r) => s + r.amount, 0));
        const locCnt = slots.reduce((s, r) => s + r.count, 0);
        allCount += locCnt;
        allAmt += locAmt;
        const peak = slots.reduce((p, s) => (s.amount > (p?.amount ?? -1) ? s : p), slots[0]);
        return (
          <div key={key}>
            <LocBar code={key} name={rows[0].locName} right={`${money(locAmt)}${peak ? ` · PEAK ${peak.label}` : ""}`} />
            <table className="br-table">
              <thead><tr><th>Time Range</th><th className="num">No. of Sales</th><th className="num">Sales Amount</th></tr></thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.label}><td>{s.label}</td><td className="num">{s.count}</td><td className="num">{moneyPlain(s.amount)}</td></tr>
                ))}
                <tr className="tot"><td>Location Total</td><td className="num">{locCnt}</td><td className="num">{moneyPlain(locAmt)}</td></tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={`${allCount} bills · ${money(allAmt)}`} />
    </div>
  );
}

/* ───────── Sales summary ───────── */
function SalesSummary({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No bills found for the selected date range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const locTot = round2(rows.reduce((s, b) => s + b.netTotal, 0));
        const dates = groupBy(rows, (b) => b.date);
        return (
          <div key={key}>
            <LocBar purple code={key} name={rows[0].locName} right={money(locTot)} />
            {dates.map((d) => {
              const day = round2(d.rows.reduce((s, b) => s + b.netTotal, 0));
              return (
                <div key={d.key} style={{ marginTop: 8 }}>
                  <div className="br-loc" style={{ background: "linear-gradient(135deg,#0f172a,#1e3a40)" }}>
                    <span>{fmtDMY(d.key)}</span>
                    <span className="br-pill" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>{d.rows.length} bill(s)</span>
                  </div>
                  <table className="br-table">
                    <thead>
                      <tr>
                        <th style={{ width: "18%" }}>BillNo</th>
                        <th className="num" style={{ width: "14%" }}>NetTotal</th>
                        <th>Technician</th>
                        <th>TxnTime</th>
                        <th>Cashier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((b) => (
                        <tr key={b.billNo}>
                          <td>{b.billNo}</td>
                          <td className="num">{moneyPlain(b.netTotal)}</td>
                          <td>{[...new Set(b.items.map((i) => i.techName))].join(", ")}</td>
                          <td>{b.time}</td>
                          <td>{b.cashierName}</td>
                        </tr>
                      ))}
                      <tr className="tot"><td>Daily Collection</td><td className="num">{moneyPlain(day)}</td><td colSpan={3} /></tr>
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px", fontSize: 12, color: "#64748b" }}>
                    <span>{d.rows.length} rows · {money(day)}</span>
                    <span className="br-live"><i /> Live data</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      <Grand navy left="Grand Total" right={money(grand)} />
    </div>
  );
}

/* ───────── Payments ───────── */
function PaymentSummary({ bills }: { bills: MockBill[] }) {
  const rows = bills.flatMap((b) => b.payments.map((p) => ({ ...p, bill: b })));
  if (!rows.length) return <Empty text="No payment records found for this range." />;
  const locs = groupBy(rows, (r) => r.bill.locCode);
  const grand = round2(rows.reduce((s, r) => s + r.amount, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows: locRows }) => {
        const dates = groupBy(locRows, (r) => r.bill.date);
        const locTot = round2(locRows.reduce((s, r) => s + r.amount, 0));
        return (
          <div key={key}>
            <LocBar code={key} name={locRows[0].bill.locName} right={money(locTot)} />
            {dates.map((d) => {
              const billsG = groupBy(d.rows, (r) => r.bill.billNo);
              const dayTot = round2(d.rows.reduce((s, r) => s + r.amount, 0));
              return (
                <div key={d.key} style={{ marginTop: 8 }}>
                  <div className="br-dateband"><span>{fmtDMY(d.key)}</span><span>Daily Total {moneyPlain(dayTot)}</span></div>
                  <table className="br-table">
                    <thead>
                      <tr><th>BillNo</th><th>Payment Description</th><th className="num">Amount</th><th>Remarks</th><th>Cashier Name</th></tr>
                    </thead>
                    <tbody>
                      {billsG.map((bg) =>
                        bg.rows.map((r, i) => (
                          <tr key={bg.key + i}>
                            <td>{i === 0 ? bg.key : ""}</td>
                            <td>{r.payDes}</td>
                            <td className="num">{moneyPlain(r.amount)}</td>
                            <td>{i === 0 ? r.remarks : ""}</td>
                            <td>{i === 0 ? r.bill.cashierName : ""}</td>
                          </tr>
                        )).concat(
                          <tr key={bg.key + "t"} className="tot">
                            <td colSpan={2}>Bill Total</td>
                            <td className="num">{moneyPlain(round2(bg.rows.reduce((s, r) => s + r.amount, 0)))}</td>
                            <td colSpan={2} />
                          </tr>,
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

function PayModeGrid({ bills }: { bills: MockBill[] }) {
  const modes = [...new Set(bills.flatMap((b) => b.payments.map((p) => p.payDes)))];
  if (!bills.length) return <Empty text="No payment records found for this range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.payments.reduce((a, p) => a + p.amount, 0), 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const modeTot: Record<string, number> = {};
        modes.forEach((m) => { modeTot[m] = 0; });
        let locTot = 0;
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar code={key} name={rows[0].locName} right="" />
            <table className="br-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  {modes.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const by: Record<string, number> = {};
                  b.payments.forEach((p) => { by[p.payDes] = (by[p.payDes] || 0) + p.amount; });
                  const tot = round2(b.payments.reduce((s, p) => s + p.amount, 0));
                  locTot += tot;
                  modes.forEach((m) => { modeTot[m] = round2((modeTot[m] || 0) + (by[m] || 0)); });
                  return (
                    <tr key={b.billNo}>
                      <td>{b.billNo}</td>
                      {modes.map((m) => <td key={m} className="num">{by[m] ? moneyPlain(by[m]) : ""}</td>)}
                      <td className="num">{moneyPlain(tot)}</td>
                    </tr>
                  );
                })}
                <tr className="tot">
                  <td>Total</td>
                  {modes.map((m) => <td key={m} className="num">{moneyPlain(modeTot[m] || 0)}</td>)}
                  <td className="num">{moneyPlain(locTot)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

/* ───────── Cashier ───────── */
function CashierSales({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No cashier collections for this range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  const grand = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const cashiers = groupBy(rows, (b) => b.cashierId);
        return (
          <div key={key}>
            <LocBar code={key} name={rows[0].locName} right={money(round2(rows.reduce((s, b) => s + b.netTotal, 0)))} />
            {cashiers.map((c) => {
              const tot = round2(c.rows.reduce((s, b) => s + b.netTotal, 0));
              return (
                <div key={c.key} style={{ marginTop: 8 }}>
                  <div className="br-catband"><span>CASHIER — {c.rows[0].cashierName} ({c.key})</span><span>{money(tot)}</span></div>
                  <table className="br-table">
                    <thead><tr><th>BillNo</th><th className="num">Total Value</th><th>Txn Date-Time</th></tr></thead>
                    <tbody>
                      {c.rows.map((b) => (
                        <tr key={b.billNo}>
                          <td>{b.billNo}</td>
                          <td className="num">{moneyPlain(b.netTotal)}</td>
                          <td>{fmtDMY(b.date)} {b.time}</td>
                        </tr>
                      ))}
                      <tr className="tot"><td>Cashier Collection</td><td className="num">{moneyPlain(tot)}</td><td /></tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

function PaymentBreakdown({ bills }: { bills: MockBill[] }) {
  const rows = bills.flatMap((b) => b.payments.map((p) => ({ ...p, bill: b })));
  if (!rows.length) return <Empty text="No cashier payments for this range." />;
  const locs = groupBy(rows, (r) => r.bill.locCode);
  const grand = round2(rows.reduce((s, r) => s + r.amount, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows: locRows }) => {
        const cashiers = groupBy(locRows, (r) => r.bill.cashierId);
        return (
          <div key={key}>
            <LocBar code={key} name={locRows[0].bill.locName} right={money(round2(locRows.reduce((s, r) => s + r.amount, 0)))} />
            {cashiers.map((c) => {
              const modes = groupBy(c.rows, (r) => r.payDes);
              const cTot = round2(c.rows.reduce((s, r) => s + r.amount, 0));
              return (
                <div key={c.key} style={{ marginTop: 8 }}>
                  <div className="br-catband"><span>CASHIER — {c.rows[0].bill.cashierName}</span><span>{money(cTot)}</span></div>
                  <table className="br-table">
                    <thead><tr><th>Date-Time</th><th>Payment Mode</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {modes.map((m) => (
                        <Fragment key={m.key}>
                          {m.rows.map((r, i) => (
                            <tr key={c.key + m.key + i}>
                              <td>{fmtDMY(r.bill.date)} {r.bill.time}</td>
                              <td>{r.payDes}</td>
                              <td className="num">{moneyPlain(r.amount)}</td>
                            </tr>
                          ))}
                          <tr className="tot">
                            <td colSpan={2}>{m.key} sub total</td>
                            <td className="num">{moneyPlain(round2(m.rows.reduce((s, r) => s + r.amount, 0)))}</td>
                          </tr>
                        </Fragment>
                      ))}
                      <tr className="tot"><td colSpan={2}>Cashier Total</td><td className="num">{moneyPlain(cTot)}</td></tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

function CashierGrid({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No payment records found for this range." />;
  const groups = groupBy(bills, (b) => `${b.locCode}|${b.cashierId}`);
  const modes = [...new Set(bills.flatMap((b) => b.payments.map((p) => p.payDes)))];
  const grand = round2(bills.reduce((s, b) => s + b.payments.reduce((a, p) => a + p.amount, 0), 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {groups.map(({ key, rows }) => {
        const [loc, cash] = key.split("|");
        const modeTot: Record<string, number> = {};
        let tot = 0;
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar code={loc} name={`${rows[0].locName} · ${rows[0].cashierName} (${cash})`} right="" />
            <table className="br-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  {modes.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const by: Record<string, number> = {};
                  b.payments.forEach((p) => { by[p.payDes] = (by[p.payDes] || 0) + p.amount; });
                  const bt = round2(b.payments.reduce((s, p) => s + p.amount, 0));
                  tot += bt;
                  modes.forEach((m) => { modeTot[m] = round2((modeTot[m] || 0) + (by[m] || 0)); });
                  return (
                    <tr key={b.billNo}>
                      <td>{b.billNo}</td>
                      {modes.map((m) => <td key={m} className="num">{by[m] ? moneyPlain(by[m]) : ""}</td>)}
                      <td className="num">{moneyPlain(bt)}</td>
                    </tr>
                  );
                })}
                <tr className="tot">
                  <td>Total</td>
                  {modes.map((m) => <td key={m} className="num">{moneyPlain(modeTot[m] || 0)}</td>)}
                  <td className="num">{moneyPlain(tot)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

/* ───────── Tax / SC / Pax ───────── */
function ServiceCharge({ bills }: { bills: MockBill[] }) {
  const rows = bills.flatMap((b) => {
    const techs = [...new Map(b.items.map((i) => [i.techId, i])).values()];
    const share = techs.length || 1;
    return techs.map((t) => ({
      techId: t.techId,
      techName: t.techName,
      locCode: b.locCode,
      locName: b.locName,
      date: b.date,
      bills: 1,
      pax: b.pax,
      grand: round2(b.netTotal / share),
      sc: round2(b.serviceCharge / share),
    }));
  });
  if (!rows.length) return <Empty text="No records found for this range." />;
  const techs = groupBy(rows, (r) => r.techId);
  const grandSc = round2(rows.reduce((s, r) => s + r.sc, 0));
  const grandCol = round2(rows.reduce((s, r) => s + r.grand, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {techs.map(({ key, rows: tRows }) => {
        const locs = groupBy(tRows, (r) => r.locCode);
        const tCol = round2(tRows.reduce((s, r) => s + r.grand, 0));
        return (
          <div key={key}>
            <LocBar code={key} name={tRows[0].techName} right={money(tCol)} />
            {locs.map((l) => {
              const dates = groupBy(l.rows, (r) => r.date);
              return (
                <div key={l.key} style={{ marginTop: 8 }}>
                  <div className="br-dateband"><span>{l.rows[0].locName}</span></div>
                  <table className="br-table">
                    <thead><tr><th>Date</th><th className="num">Bills</th><th className="num">Pax</th><th className="num">Grand Collection</th><th className="num">Service Chrg</th></tr></thead>
                    <tbody>
                      {dates.map((d) => (
                        <tr key={d.key}>
                          <td>{fmtDMY(d.key)}</td>
                          <td className="num">{d.rows.length}</td>
                          <td className="num">{d.rows.reduce((s, r) => s + r.pax, 0)}</td>
                          <td className="num">{moneyPlain(round2(d.rows.reduce((s, r) => s + r.grand, 0)))}</td>
                          <td className="num">{moneyPlain(round2(d.rows.reduce((s, r) => s + r.sc, 0)))}</td>
                        </tr>
                      ))}
                      <tr className="tot">
                        <td colSpan={3}>Total Technician Collection</td>
                        <td className="num">{moneyPlain(round2(l.rows.reduce((s, r) => s + r.grand, 0)))}</td>
                        <td className="num">{moneyPlain(round2(l.rows.reduce((s, r) => s + r.sc, 0)))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
      <Grand left="Locationwise Collection (all technicians)" right={`${money(grandCol)} · SC ${money(grandSc)}`} />
    </div>
  );
}

function TaxReport({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No tax records found for this range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  const grandTax = round2(bills.reduce((s, b) => s + b.totalTax, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const locTax = round2(rows.reduce((s, b) => s + b.totalTax, 0));
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar code={key} name={rows[0].locName} right={money(locTax)} />
            <table className="br-table">
              <thead>
                <tr>
                  <th>Bill No</th><th>Date</th><th className="num">Sales W/O Tax</th>
                  <th className="num">VAT</th><th className="num">Other tax</th><th className="num">Tax Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const vat = b.taxes.find((t) => t.taxCode === "VAT")?.amount ?? 0;
                  const other = round2(b.totalTax - vat);
                  return (
                    <tr key={b.billNo}>
                      <td>{b.billNo}</td>
                      <td>{fmtDMY(b.date)}</td>
                      <td className="num">{moneyPlain(b.gross - b.disVal)}</td>
                      <td className="num">{moneyPlain(vat)}</td>
                      <td className="num">{moneyPlain(other)}</td>
                      <td className="num">{moneyPlain(b.totalTax)}</td>
                    </tr>
                  );
                })}
                <tr className="tot">
                  <td colSpan={5}>Locationwise Total</td>
                  <td className="num">{moneyPlain(locTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left="Locationwise Total (all locations)" right={money(grandTax)} />
    </div>
  );
}

function PaxCount({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No pax records found for this range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  const gPax = bills.reduce((s, b) => s + b.pax, 0);
  const gSpend = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const dates = groupBy(rows, (b) => b.date);
        const pax = rows.reduce((s, b) => s + b.pax, 0);
        const spend = round2(rows.reduce((s, b) => s + b.netTotal, 0));
        return (
          <div key={key}>
            <LocBar code={key} name={rows[0].locName} right={`${pax} pax`} />
            <p style={{ fontSize: 12, fontWeight: 800, margin: "10px 0 6px", color: "#1e3a40" }}>Average Numbers Of Pax Per (Summary)</p>
            <table className="br-table">
              <thead><tr><th>Date</th><th className="num">Total Pax</th><th className="num">Total Bills</th><th className="num">Average Pax Per Bill</th></tr></thead>
              <tbody>
                {dates.map((d) => {
                  const dp = d.rows.reduce((s, b) => s + b.pax, 0);
                  return (
                    <tr key={d.key}>
                      <td>{fmtDMY(d.key)}</td>
                      <td className="num">{dp}</td>
                      <td className="num">{d.rows.length}</td>
                      <td className="num">{(dp / d.rows.length).toFixed(2)}</td>
                    </tr>
                  );
                })}
                <tr className="tot">
                  <td>Total</td>
                  <td className="num">{pax}</td>
                  <td className="num">{rows.length}</td>
                  <td className="num">{(pax / rows.length).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 6px", color: "#1e3a40" }}>Average Spending On Pax</p>
            <table className="br-table">
              <thead><tr><th>Date</th><th>Bill No</th><th className="num">Total Pax</th><th className="num">Total Spending</th><th className="num">Average Spending On Pax</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.billNo}>
                    <td>{fmtDMY(b.date)}</td>
                    <td>{b.billNo}</td>
                    <td className="num">{b.pax}</td>
                    <td className="num">{moneyPlain(b.netTotal)}</td>
                    <td className="num">{moneyPlain(b.pax ? b.netTotal / b.pax : 0)}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td colSpan={2}>Total</td>
                  <td className="num">{pax}</td>
                  <td className="num">{moneyPlain(spend)}</td>
                  <td className="num">{moneyPlain(pax ? spend / pax : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left={`Grand Total — ${gPax} pax · ${bills.length} bills`} right={money(gSpend)} />
    </div>
  );
}

/* ───────── Credit ───────── */
function CreditHistory({ rows }: { rows: CreditTxn[] }) {
  if (!rows.length) return <Empty text="No credit transactions for this range." />;
  const locs = groupBy(rows, (r) => r.locCode);
  const grand = round2(rows.reduce((s, r) => s + r.tranAmt, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows: locRows }) => {
        const cus = groupBy(locRows, (r) => r.cusId);
        return (
          <div key={key}>
            <LocBar code={key} name={locRows[0].locName} right={money(round2(locRows.reduce((s, r) => s + r.tranAmt, 0)))} />
            {cus.map((c) => {
              const tot = round2(c.rows.reduce((s, r) => s + r.tranAmt, 0));
              return (
                <div key={c.key} style={{ marginTop: 8, overflowX: "auto" }}>
                  <div className="br-catband"><span>{c.key} · {c.rows[0].cusName}</span><span>{money(tot)}</span></div>
                  <table className="br-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>Bill No</th><th>Ref No</th><th className="num">Total Bill</th>
                        <th className="num">Tran Amt</th><th className="num">Balance</th><th>Remark</th><th>User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((r) => (
                        <tr key={r.refNo}>
                          <td>{fmtDMY(r.date)}</td>
                          <td>{r.billNo}</td>
                          <td>{r.refNo}</td>
                          <td className="num">{moneyPlain(r.totalBill)}</td>
                          <td className="num">{moneyPlain(r.tranAmt)}</td>
                          <td className="num">{moneyPlain(r.balance)}</td>
                          <td>{r.remark}</td>
                          <td>{r.user}</td>
                        </tr>
                      ))}
                      <tr className="tot"><td colSpan={4}>Customer total</td><td className="num">{moneyPlain(tot)}</td><td colSpan={3} /></tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

function PayHistory({ rows }: { rows: CreditTxn[] }) {
  const pays = rows.filter((r) => r.type === "PAY");
  if (!pays.length) return <Empty text="No credit payment history for this range." />;
  const cus = groupBy(pays, (r) => `${r.locCode}|${r.cusId}`);
  const grand = round2(pays.reduce((s, r) => s + (r.paidAmt ?? Math.abs(r.tranAmt)), 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="br-catband"><span>CREDIT PAYMENT HISTORY</span><span /></div>
      {cus.map(({ key, rows: cRows }) => {
        const paid = round2(cRows.reduce((s, r) => s + (r.paidAmt ?? Math.abs(r.tranAmt)), 0));
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar
              code={cRows[0].locCode}
              name={`${cRows[0].cusId} — ${cRows[0].locName} · ${cRows[0].cusName}`}
              right={`Paid : ${money(paid)}`}
            />
            <table className="br-table">
              <thead>
                <tr>
                  <th>Bill NO</th><th>Paid Date</th><th>Invoice No</th><th>Invoice Date</th>
                  <th className="num">Paid Amt</th><th className="num">Balance Before Pay</th>
                  <th className="num">Balance After Pay</th><th>Settlement</th><th>Sold Date</th>
                </tr>
              </thead>
              <tbody>
                {cRows.map((r) => (
                  <tr key={r.refNo}>
                    <td>{r.billNo}</td>
                    <td>{fmtDMY(r.date)}</td>
                    <td>{r.invoiceNo || "—"}</td>
                    <td>{r.invoiceDate ? fmtDMY(r.invoiceDate) : "—"}</td>
                    <td className="num" style={{ color: "#15803d", fontWeight: 800 }}>{moneyPlain(r.paidAmt ?? Math.abs(r.tranAmt))}</td>
                    <td className="num">{moneyPlain(r.balBefore ?? 0)}</td>
                    <td className="num">{moneyPlain(r.balAfter ?? 0)}</td>
                    <td>{r.settlement || "—"}</td>
                    <td>{r.soldDate ? fmtDMY(r.soldDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={`PAID ${money(grand)}`} />
    </div>
  );
}

function AccountDetail({ rows }: { rows: CreditTxn[] }) {
  if (!rows.length) return <Empty text="No credit settlement details for this range." />;
  const cus = groupBy(rows, (r) => `${r.locCode}|${r.cusId}`);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="br-catband"><span>CREDIT SETTLEMENT DETAILS</span><span /></div>
      {cus.map(({ key, rows: cRows }) => {
        const last = [...cRows].sort((a, b) => a.date.localeCompare(b.date) || a.refNo.localeCompare(b.refNo)).at(-1);
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar
              code={cRows[0].cusId}
              name={`${cRows[0].locCode} · ${cRows[0].cusName}`}
              right={`Balance : ${money(last?.balance ?? 0)}`}
            />
            <table className="br-table">
              <thead>
                <tr>
                  <th>BILL NO</th><th>TRN TYPE</th><th>TRN DATE</th>
                  <th className="num">PREV AMT</th><th className="num">TRN AMT</th><th className="num">BAL AMT</th>
                </tr>
              </thead>
              <tbody>
                {cRows.map((r) => {
                  const bg = r.type === "INV" ? "#dcfce7" : r.type === "PAY" ? "#dbeafe" : "#fef9c3";
                  return (
                    <tr key={r.refNo}>
                      <td style={{ background: bg }}>{r.billNo}</td>
                      <td style={{ background: bg }}>{r.type}</td>
                      <td style={{ background: bg }}>{fmtDMY(r.date)}</td>
                      <td className="num" style={{ background: bg }}>{moneyPlain(r.prevAmt ?? 0)}</td>
                      <td className="num" style={{ background: bg }}>{moneyPlain(r.tranAmt)}</td>
                      <td className="num" style={{ background: bg }}>{moneyPlain(r.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ───────── Item issue / movement / txn ───────── */
function issueLines(bills: MockBill[]) {
  return bills.flatMap((b) =>
    b.items.map((it) => ({
      ...it,
      locCode: b.locCode,
      locName: b.locName,
      date: b.date,
      dept: it.catL1 || "UNKNOWN",
      unit: it.qty ? round2(it.total / it.qty) : it.price,
      weight: it.catL1 === "Retail" ? 0.12 : 0,
    })),
  );
}

function ItemIssue({ bills, byDate }: { bills: MockBill[]; byDate: boolean }) {
  const lines = issueLines(bills);
  if (!lines.length) return <Empty text="No menu item issues for this range." />;
  const locs = groupBy(lines, (l) => l.locCode);
  const grand = round2(lines.reduce((s, l) => s + l.total, 0));

  function table(rows: typeof lines) {
    const depts = groupBy(rows, (r) => r.dept);
    return depts.map((d) => {
      const items = groupBy(d.rows, (r) => r.itemId);
      const dTot = round2(d.rows.reduce((s, r) => s + r.total, 0));
      return (
        <div key={d.key} style={{ marginTop: 8 }}>
          <div className="br-catband"><span>{d.key}:</span><span>{money(dTot)}</span></div>
          <table className="br-table">
            <thead>
              <tr>
                <th>Item Code</th><th>Description</th><th className="num">Qty</th>
                <th className="num">Weight / 1</th><th className="num">Value / Unit</th>
                <th className="num">Last Price</th><th className="num">Total (Value)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const qtySum = round2(it.rows.reduce((s, r) => s + r.qty, 0));
                const tot = round2(it.rows.reduce((s, r) => s + r.total, 0));
                const last = it.rows[it.rows.length - 1];
                return (
                  <tr key={it.key}>
                    <td>{last.itemId}</td>
                    <td>{last.name}</td>
                    <td className="num">{qty(qtySum)}</td>
                    <td className="num">{last.weight.toFixed(4)}</td>
                    <td className="num">{moneyPlain(last.unit)}</td>
                    <td className="num">{moneyPlain(last.price)}</td>
                    <td className="num">{moneyPlain(tot)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const locTot = round2(rows.reduce((s, r) => s + r.total, 0));
        const dates = groupBy(rows, (r) => r.date);
        return (
          <div key={key}>
            <LocBar code={key} name={rows[0].locName} right={money(locTot)} />
            {byDate
              ? dates.map((d) => (
                <div key={d.key} style={{ marginTop: 8 }}>
                  <div className="br-dateband">
                    <span>{fmtDMY(d.key)}</span>
                    <span>{money(round2(d.rows.reduce((s, r) => s + r.total, 0)))}</span>
                  </div>
                  {table(d.rows)}
                </div>
              ))
              : table(rows)}
          </div>
        );
      })}
      <Grand left="Grand Total (all locations)" right={money(grand)} />
    </div>
  );
}

function ItemMovement({ bills }: { bills: MockBill[] }) {
  const [mode, setMode] = useState<"fast" | "slow" | "non">("fast");
  const [threshold, setThreshold] = useState(10);
  const sold = groupBy(issueLines(bills), (l) => `${l.locCode}|${l.itemId}`).map((g) => ({
    locCode: g.rows[0].locCode,
    locName: g.rows[0].locName,
    itemId: g.rows[0].itemId,
    name: g.rows[0].name,
    qty: round2(g.rows.reduce((s, r) => s + r.qty, 0)),
  }));
  const locs = groupBy(sold, (r) => r.locCode);

  const ranked = locs.map((l) => {
    if (mode === "non") {
      const soldIds = new Set(l.rows.map((r) => r.itemId));
      const unused = MOCK_UNUSED_ITEMS.filter((u) => !soldIds.has(u.itemId)).map((u) => ({
        locCode: l.key, locName: l.rows[0]?.locName || l.key, itemId: u.itemId, name: u.name, qty: 0,
      }));
      return { key: l.key, name: l.rows[0]?.locName || l.key, rows: unused };
    }
    const sorted = [...l.rows].sort((a, b) => (mode === "fast" ? b.qty - a.qty : a.qty - b.qty));
    return { key: l.key, name: l.rows[0].locName, rows: sorted.slice(0, Math.max(1, threshold)) };
  });

  const title = mode === "fast" ? "Fast Moving Items" : mode === "slow" ? "Slow Moving Items" : "NON-Moving Items";
  const flat = ranked.flatMap((l) => l.rows);
  if (!flat.length) return (
    <div>
      <MoveControls mode={mode} setMode={setMode} threshold={threshold} setThreshold={setThreshold} title={title} />
      <Empty text={`No ${title.toLowerCase()} found for this range.`} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <MoveControls mode={mode} setMode={setMode} threshold={threshold} setThreshold={setThreshold} title={title} />
      {ranked.map((l) => (
        <div key={l.key}>
          <LocBar code={l.key} name={l.name} right={`${l.rows.length} items`} />
          <table className="br-table">
            <thead>
              <tr>
                <th>Item Code</th><th>Menu Item Description</th>
                {mode !== "non" && <th className="num">Qty</th>}
              </tr>
            </thead>
            <tbody>
              {l.rows.map((r) => (
                <tr key={r.itemId}>
                  <td>{r.itemId}</td>
                  <td>{r.name}</td>
                  {mode !== "non" && <td className="num">{r.qty.toLocaleString("en-US")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function MoveControls({
  mode, setMode, threshold, setThreshold, title,
}: {
  mode: "fast" | "slow" | "non";
  setMode: (m: "fast" | "slow" | "non") => void;
  threshold: number;
  setThreshold: (n: number) => void;
  title: string;
}) {
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {(["fast", "slow", "non"] as const).map((m) => (
          <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#14532d" }}>
            <input type="radio" name="move" checked={mode === m} onChange={() => setMode(m)} />
            {m === "fast" ? "Fast Moving" : m === "slow" ? "Slow Moving" : "Non Moving"}
          </label>
        ))}
        {mode !== "non" && (
          <label style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#475569" }}>
            Threshold
            <input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))}
              style={{ marginLeft: 6, width: 64, height: 32, border: "1.5px solid #c8d6d8", borderRadius: 8, padding: "0 8px" }}
            />
          </label>
        )}
      </div>
      <div className="br-catband">
        <span>{title}</span>
        {mode !== "non" && <span>Top {threshold} per location</span>}
      </div>
    </>
  );
}

function TransactionSummary({ bills }: { bills: MockBill[] }) {
  if (!bills.length) return <Empty text="No transaction records found for this range." />;
  const locs = groupBy(bills, (b) => b.locCode);
  const gBills = bills.length;
  const gPax = bills.reduce((s, b) => s + b.pax, 0);
  const gVol = round2(bills.reduce((s, b) => s + b.netTotal, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {locs.map(({ key, rows }) => {
        const dates = groupBy(rows, (b) => b.date);
        const locVol = round2(rows.reduce((s, b) => s + b.netTotal, 0));
        const locPax = rows.reduce((s, b) => s + b.pax, 0);
        return (
          <div key={key} style={{ overflowX: "auto" }}>
            <LocBar code={key} name={rows[0].locName} right={money(locVol)} />
            <table className="br-table">
              <thead>
                <tr>
                  <th>Txn Date</th>
                  <th className="num">Bills</th>
                  <th className="num">Pax</th>
                  <th className="num">Spending / Bill</th>
                  <th className="num">Spending / Pax</th>
                  <th className="num">Avg Pax / Bill</th>
                  <th className="num">Service Charge</th>
                  <th className="num">Tax</th>
                  <th className="num">Sales Volume</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => {
                  const n = d.rows.length;
                  const pax = d.rows.reduce((s, b) => s + b.pax, 0);
                  const vol = round2(d.rows.reduce((s, b) => s + b.netTotal, 0));
                  const sc = round2(d.rows.reduce((s, b) => s + b.serviceCharge, 0));
                  const tax = round2(d.rows.reduce((s, b) => s + b.totalTax, 0));
                  return (
                    <tr key={d.key}>
                      <td>{fmtDMY(d.key)}</td>
                      <td className="num">{n}</td>
                      <td className="num">{pax}</td>
                      <td className="num">{moneyPlain(n ? vol / n : 0)}</td>
                      <td className="num">{moneyPlain(pax ? vol / pax : 0)}</td>
                      <td className="num">{(n ? pax / n : 0).toFixed(2)}</td>
                      <td className="num">{moneyPlain(sc)}</td>
                      <td className="num">{moneyPlain(tax)}</td>
                      <td className="num">{moneyPlain(vol)}</td>
                    </tr>
                  );
                })}
                <tr className="tot">
                  <td>Total</td>
                  <td className="num">{rows.length}</td>
                  <td className="num">{locPax}</td>
                  <td className="num">{moneyPlain(rows.length ? locVol / rows.length : 0)}</td>
                  <td className="num">{moneyPlain(locPax ? locVol / locPax : 0)}</td>
                  <td className="num">{(rows.length ? locPax / rows.length : 0).toFixed(2)}</td>
                  <td className="num">{moneyPlain(round2(rows.reduce((s, b) => s + b.serviceCharge, 0)))}</td>
                  <td className="num">{moneyPlain(round2(rows.reduce((s, b) => s + b.totalTax, 0)))}</td>
                  <td className="num">{moneyPlain(locVol)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <Grand left={`Grand Total (all locations) — ${gBills} bills · ${gPax} pax`} right={money(gVol)} />
    </div>
  );
}

/* ───────── search + dispatch ───────── */
export function searchBills(bills: MockBill[], q: string, id: ReportId): MockBill[] {
  if (!q) return bills;
  return bills.filter((b) => {
    const techs = b.items.map((i) => i.techName).join(" ");
    const items = b.items.map((i) => `${i.name} ${i.catL1} ${i.catL2}`).join(" ");
    const pays = b.payments.map((p) => `${p.payDes} ${p.remarks}`).join(" ");
    const blob = `${b.billNo} ${b.locCode} ${b.locName} ${b.cashierName} ${b.cashierId} ${b.cusName} ${techs} ${items} ${pays} ${b.netTotal} ${b.time} ${b.date}`;
    if (id === "hourly-sales") return matches(blob + HOUR_SLOTS.map((s) => s.label).join(" "), q) || matches(slotForTime(b.time24), q);
    return matches(blob, q);
  });
}

export function searchCredit(rows: CreditTxn[], q: string): CreditTxn[] {
  if (!q) return rows;
  return rows.filter((r) =>
    matches(`${r.cusId} ${r.cusName} ${r.billNo} ${r.refNo} ${r.remark} ${r.user} ${r.invoiceNo || ""} ${r.type} ${r.locCode}`, q),
  );
}

export function renderReport(id: ReportId, bills: MockBill[], credit: CreditTxn[]) {
  switch (id) {
    case "sales-details": return <SalesDetails bills={bills} />;
    case "sales-category-summary": return <CategorySummary bills={bills} />;
    case "sales-category-detail": return <CategoryDetail bills={bills} />;
    case "hourly-sales": return <HourlySales bills={bills} />;
    case "sales-summary": return <SalesSummary bills={bills} />;
    case "payment-summary":
    case "payment-summary-wise": return <PaymentSummary bills={bills} />;
    case "payment-bill-paymode-grid": return <PayModeGrid bills={bills} />;
    case "cashier-collection": return <CashierSales bills={bills} />;
    case "cashier-payment-breakdown": return <PaymentBreakdown bills={bills} />;
    case "cashier-breakdown-grid": return <CashierGrid bills={bills} />;
    case "service-charge": return <ServiceCharge bills={bills} />;
    case "tax-vat": return <TaxReport bills={bills} />;
    case "pax-count": return <PaxCount bills={bills} />;
    case "credit-history": return <CreditHistory rows={credit} />;
    case "credit-pay-history": return <PayHistory rows={credit} />;
    case "credit-account-detail": return <AccountDetail rows={credit} />;
    case "menu-item-issue": return <ItemIssue bills={bills} byDate={false} />;
    case "menu-item-issue-date": return <ItemIssue bills={bills} byDate />;
    case "item-movement": return <ItemMovement bills={bills} />;
    case "transaction-summary": return <TransactionSummary bills={bills} />;
    default: return <Empty text="Unknown report." />;
  }
}

export function chartsFor(id: ReportId, bills: MockBill[], credit: CreditTxn[]): ChartSpec[] {
  const byDate = groupBy(bills, (b) => b.date);
  const daily = byDate.map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, b) => s + b.netTotal, 0)) }));
  const locNet = groupBy(bills, (b) => b.locCode).map((g) => ({
    label: g.rows[0].locName, value: round2(g.rows.reduce((s, b) => s + b.netTotal, 0)),
  }));
  const paySplit = groupBy(bills.flatMap((b) => b.payments), (p) => p.payDes).map((g) => ({
    label: g.key, value: round2(g.rows.reduce((s, r) => s + r.amount, 0)),
  }));
  const items = bills.flatMap((b) => b.items);
  const topItems = groupBy(items, (i) => i.name)
    .map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + r.total, 0)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const cats = groupBy(items, (i) => i.catL1).map((g) => ({
    label: g.key, value: round2(g.rows.reduce((s, r) => s + r.total, 0)),
  }));

  switch (id) {
    case "sales-details":
      return [
        { type: "bars", title: "Daily Net Total", series: [{ name: "Net", points: daily }] },
        { type: "hbars", title: "Top 10 Items", series: [{ name: "Sales", points: topItems }] },
        { type: "hbars", title: "Location-wise Net Total", series: [{ name: "Net", points: locNet }] },
      ];
    case "sales-category-summary":
      return [
        { type: "pie", title: "Category Share", series: [{ name: "Cat", points: cats }] },
        { type: "hbars", title: "Top Categories", series: [{ name: "Cat", points: [...cats].sort((a, b) => b.value - a.value) }] },
        { type: "hbars", title: "Location-wise Sales", series: [{ name: "Net", points: locNet }] },
      ];
    case "sales-category-detail":
      return [
        { type: "bars", title: "Daily Category Sales", series: [{ name: "Sales", points: daily }] },
        { type: "pie", title: "Category Share", series: [{ name: "Cat", points: cats }] },
        { type: "hbars", title: "Location-wise Sales", series: [{ name: "Net", points: locNet }] },
      ];
    case "hourly-sales": {
      const hours = HOUR_SLOTS.map((s) => {
        const inS = bills.filter((b) => slotForTime(b.time24) === s.label);
        return { label: s.label.slice(0, 5), value: round2(inS.reduce((a, b) => a + b.netTotal, 0)), count: inS.length };
      });
      return [
        { type: "bars", title: "Sales Value by Hour", series: [{ name: "Sales", points: hours }] },
        { type: "bars", title: "Bills by Hour", series: [{ name: "Bills", points: hours.map((h) => ({ label: h.label, value: h.count })) }] },
        { type: "hbars", title: "Location-wise Sales", series: [{ name: "Net", points: locNet }] },
      ];
    }
    case "sales-summary":
      return [
        { type: "bars", title: "Daily Collection", series: [{ name: "Net", points: daily }] },
        { type: "bars", title: "Bills Per Day", series: [{ name: "Bills", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: d.rows.length })) }] },
        { type: "pie", title: "Pay Mode Split", series: [{ name: "Pay", points: paySplit }] },
        { type: "hbars", title: "Location-wise Collection", series: [{ name: "Net", points: locNet }] },
      ];
    case "payment-summary":
    case "payment-summary-wise":
      return [
        { type: "pie", title: "Payment Mode Split", series: [{ name: "Pay", points: paySplit }] },
        { type: "bars", title: "Daily Collections", series: [{ name: "Pay", points: daily }] },
        { type: "hbars", title: "Location-wise Collections", series: [{ name: "Pay", points: locNet }] },
      ];
    case "payment-bill-paymode-grid":
    case "cashier-breakdown-grid":
      return [
        { type: "pie", title: "Pay Mode Totals", series: [{ name: "Pay", points: paySplit }] },
        { type: "hbars", title: "Top 10 Bills", series: [{ name: "Bill", points: [...bills].sort((a, b) => b.netTotal - a.netTotal).slice(0, 10).map((b) => ({ label: b.billNo, value: b.netTotal })) }] },
        { type: "hbars", title: "Location-wise Totals", series: [{ name: "Net", points: locNet }] },
      ];
    case "cashier-collection": {
      const cashiers = groupBy(bills, (b) => b.cashierName).map((g) => ({
        label: g.key, value: round2(g.rows.reduce((s, b) => s + b.netTotal, 0)),
      }));
      return [
        { type: "hbars", title: "Cashier-wise collection", series: [{ name: "Net", points: cashiers }] },
        { type: "bars", title: "Daily collection", series: [{ name: "Net", points: daily }] },
        { type: "hbars", title: "Location-wise collections", series: [{ name: "Net", points: locNet }] },
      ];
    }
    case "cashier-payment-breakdown":
      return [
        { type: "pie", title: "Payment Mode Split", series: [{ name: "Pay", points: paySplit }] },
        { type: "hbars", title: "Location-wise Payments", series: [{ name: "Pay", points: locNet }] },
      ];
    case "service-charge": {
      const techRows = bills.flatMap((b) => {
        const names = [...new Set(b.items.map((i) => i.techName))];
        const n = names.length || 1;
        return names.map((name) => ({ name, sc: b.serviceCharge / n }));
      });
      const techs = groupBy(techRows, (x) => x.name).map((t) => ({
        label: t.key,
        value: round2(t.rows.reduce((s, r) => s + r.sc, 0)),
      }));
      return [
        { type: "hbars", title: "Technician-wise Service Charge", series: [{ name: "SC", points: techs }] },
        { type: "bars", title: "Daily Service Charge", series: [{ name: "SC", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, b) => s + b.serviceCharge, 0)) })) }] },
        { type: "hbars", title: "Location-wise", series: [{ name: "SC", points: groupBy(bills, (b) => b.locName).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, b) => s + b.serviceCharge, 0)) })) }] },
      ];
    }
    case "tax-vat":
      return [
        { type: "bars", title: "Tax Per Day", series: [{ name: "Tax", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, b) => s + b.totalTax, 0)) })) }] },
        { type: "pie", title: "Tax Component Split", series: [{ name: "Tax", points: groupBy(bills.flatMap((b) => b.taxes), (t) => t.label).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, t) => s + t.amount, 0)) })) }] },
        { type: "hbars", title: "Location-wise Tax", series: [{ name: "Tax", points: groupBy(bills, (b) => b.locName).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, b) => s + b.totalTax, 0)) })) }] },
      ];
    case "pax-count":
      return [
        { type: "bars", title: "Total Pax vs Bills Per Day", series: [
          { name: "Pax", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: d.rows.reduce((s, b) => s + b.pax, 0) })) },
          { name: "Bills", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: d.rows.length })) },
        ] },
        { type: "bars", title: "Average Spending On Pax Per Day", series: [{ name: "Avg", points: byDate.map((d) => {
          const p = d.rows.reduce((s, b) => s + b.pax, 0);
          const n = d.rows.reduce((s, b) => s + b.netTotal, 0);
          return { label: fmtDMY(d.key), value: round2(p ? n / p : 0) };
        }) }] },
        { type: "hbars", title: "Location-wise Pax", series: [{ name: "Pax", points: groupBy(bills, (b) => b.locName).map((g) => ({ label: g.key, value: g.rows.reduce((s, b) => s + b.pax, 0) })) }] },
      ];
    case "credit-history":
      return [
        { type: "bars", title: "Credit Transactions Per Day", series: [{ name: "Amt", points: groupBy(credit, (r) => r.date).map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, r) => s + r.tranAmt, 0)) })) }] },
        { type: "hbars", title: "Location-wise Credit Activity", series: [{ name: "Amt", points: groupBy(credit, (r) => r.locName).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + r.tranAmt, 0)) })) }] },
      ];
    case "credit-pay-history": {
      const pays = credit.filter((r) => r.type === "PAY");
      return [
        { type: "bars", title: "Payments Received Per Day", series: [{ name: "Paid", points: groupBy(pays, (r) => r.date).map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, r) => s + (r.paidAmt ?? 0), 0)) })) }] },
        { type: "hbars", title: "Customer-wise Payments", series: [{ name: "Paid", points: groupBy(pays, (r) => r.cusName).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + (r.paidAmt ?? 0), 0)) })) }] },
        { type: "hbars", title: "Location-wise Payments", series: [{ name: "Paid", points: groupBy(pays, (r) => r.locName).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + (r.paidAmt ?? 0), 0)) })) }] },
      ];
    }
    case "credit-account-detail":
      return [
        { type: "hbars", title: "Transaction Amount by Type", series: [{ name: "Amt", points: groupBy(credit, (r) => r.type).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + Math.abs(r.tranAmt), 0)) })) }] },
        { type: "bars", title: "Transaction Amount Per Day", series: [{ name: "Amt", points: groupBy(credit, (r) => r.date).map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, r) => s + Math.abs(r.tranAmt), 0)) })) }] },
        { type: "hbars", title: "Customer Outstanding Balance", series: [{ name: "Bal", points: groupBy(credit, (r) => r.cusName).map((g) => {
          const last = [...g.rows].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
          return { label: g.key, value: last?.balance ?? 0 };
        }) }] },
      ];
    case "menu-item-issue":
    case "menu-item-issue-date": {
      const issued = issueLines(bills);
      const depts = groupBy(issued, (r) => r.dept).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + r.total, 0)) }));
      const top = groupBy(issued, (r) => r.name).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + r.total, 0)) })).sort((a, b) => b.value - a.value).slice(0, 10);
      return [
        { type: "pie", title: "Issue Value by Department", series: [{ name: "Dept", points: depts }] },
        { type: "hbars", title: "Top Issued Items", series: [{ name: "Item", points: top }] },
        { type: "bars", title: "Issue Value Per Day", series: [{ name: "Issue", points: groupBy(issued, (r) => r.date).map((d) => ({ label: fmtDMY(d.key), value: round2(d.rows.reduce((s, r) => s + r.total, 0)) })) }] },
        { type: "hbars", title: "Location-wise Issues", series: [{ name: "Loc", points: locNet }] },
      ];
    }
    case "item-movement": {
      const mv = groupBy(issueLines(bills), (r) => r.name).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + r.qty, 0)) })).sort((a, b) => b.value - a.value).slice(0, 10);
      return [
        { type: "hbars", title: "Fastest Moving Items (qty)", series: [{ name: "Qty", points: mv }] },
        { type: "hbars", title: "Location-wise Moved Qty", series: [{ name: "Qty", points: groupBy(issueLines(bills), (r) => r.locName).map((g) => ({ label: g.key, value: round2(g.rows.reduce((s, r) => s + r.qty, 0)) })) }] },
      ];
    }
    case "transaction-summary":
      return [
        { type: "bars", title: "Pax Per Day", series: [
          { name: "Pax", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: d.rows.reduce((s, b) => s + b.pax, 0) })) },
          { name: "Bills", points: byDate.map((d) => ({ label: fmtDMY(d.key), value: d.rows.length })) },
        ] },
        { type: "bars", title: "Sales Volume Per Day", series: [{ name: "Volume", points: daily }] },
        { type: "hbars", title: "Location-wise Sales Volume", series: [{ name: "Vol", points: locNet }] },
      ];
    default:
      return [];
  }
}
