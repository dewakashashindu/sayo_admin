"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AdminSidebar, { SIDEBAR_CSS } from "@/components/AdminSidebar";
import UserName from "@/components/UserName";
import { useMyAccess } from "@/lib/useMyAccess";
import { logoutAdmin } from "@/lib/logout";
import NoAccess from "@/components/NoAccess";
import AccessLoading from "@/components/AccessLoading";
import { REPORT_CSS } from "@/components/billing-reports/reportCss";
import ReportToolbar from "@/components/billing-reports/ReportToolbar";
import ReportCharts from "@/components/billing-reports/ReportCharts";
import { chartsFor, renderReport, searchBills, searchCredit } from "@/components/billing-reports/renderers";
import {
  CashierBreakdownPdfDocument,
  CashierSalesPdfDocument,
  CreditPdfDocument,
  fmtDMonY,
  HourlySalesPdfDocument,
  ItemIssuePdfDocument,
  ItemMovementPdfDocument,
  PaxPdfDocument,
  PaymentGridPdfDocument,
  PaymentSummaryPdfDocument,
  ReportPdfDocument,
  SalesCategoryPdfDocument,
  SalesDetailPdfDocument,
  SalesSummaryPdfDocument,
  TaxPdfDocument,
} from "@/components/billing-reports/pdfDocs";
import { isReportId, reportById } from "@/lib/billingReports/config";
import { presetRange, todayISO, yearStartISO } from "@/lib/billingReports/dates";
import type { CreditTxn, MockBill, MockLocation, MockPayMode } from "@/lib/billingReports/types";

export default function BillingReportPage() {
  const router = useRouter();
  const params = useParams<{ reportId: string }>();
  const searchParams = useSearchParams();
  const { loaded, enforce, has } = useMyAccess();
  const [navKey, setNavKey] = useState("billing-reports");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(100);
  const [chartMode, setChartMode] = useState(false);
  const [loading, setLoading] = useState(true);
  /* rev 33: print stamp fixed at page mount (same as the legacy reports). */
  const [printedAt] = useState(() => new Date());
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [rawBills, setRawBills] = useState<MockBill[]>([]);
  const [rawCredit, setRawCredit] = useState<CreditTxn[]>([]);
  const [unusedItems, setUnusedItems] = useState<{ itemId: string; name: string }[]>([]);
  const [locations, setLocations] = useState<MockLocation[]>([]);
  const [payModes, setPayModes] = useState<MockPayMode[]>([]);

  const reportId = String(params.reportId || "");
  const report = isReportId(reportId) ? reportById(reportId) : undefined;

  const from = searchParams.get("from") || presetRange("month").from || yearStartISO();
  const to = searchParams.get("to") || presetRange("month").to || todayISO();
  const loc = searchParams.get("loc") || "";
  const pm = searchParams.get("pm") || "";

  const patchQuery = useCallback(
    (patch: Record<string, string>) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      router.replace(`/billing/reports/${reportId}?${q.toString()}`);
    },
    [router, reportId, searchParams],
  );

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => patchQuery({ from: nextFrom, to: nextTo }),
    [patchQuery],
  );

  useEffect(() => {
    setSearch("");
    setChartMode(false);
    setZoom(100);
  }, [reportId]);

  useEffect(() => {
    if (!report) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    const q = new URLSearchParams({ reportId, from, to });
    if (loc) q.set("loc", loc);
    if (pm) q.set("pm", pm);
    void fetch(`/api/billing/reports?${q.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({ success: false, error: "Bad response" }));
        if (cancelled) return;
        if (!r.ok || !j.success) {
          setErr(j.error || "Failed to load report");
          setRawBills([]);
          setRawCredit([]);
          setUnusedItems([]);
          return;
        }
        setRawBills(Array.isArray(j.bills) ? j.bills : []);
        setRawCredit(Array.isArray(j.credit) ? j.credit : []);
        setUnusedItems(Array.isArray(j.unusedItems) ? j.unusedItems : []);
        if (Array.isArray(j.locations)) setLocations(j.locations);
        if (Array.isArray(j.payModes)) setPayModes(j.payModes);
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Failed to load report");
          setRawBills([]);
          setRawCredit([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [report, reportId, from, to, loc, pm]);

  const bills = useMemo(() => {
    return searchBills(rawBills, search, isReportId(reportId) ? reportId : "sales-summary");
  }, [rawBills, search, reportId]);

  const credit = useMemo(() => searchCredit(rawCredit, search), [rawCredit, search]);

  const charts = useMemo(() => {
    if (!report) return [];
    return chartsFor(report.id, bills, credit).filter((c) =>
      c.series.some((s) => s.points.some((p) => p.value)),
    );
  }, [report, bills, credit]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }

  /* rev 33: the PDF document is built from the SAME filtered data the
     screen shows (search + location + pay-mode filters already applied). */
  const pdfDocument = useMemo(() => {
    if (!report || loading || err) return undefined;
    const meta = {
      title: report.title,
      printDate: fmtDMonY(printedAt.toISOString().slice(0, 10)),
      printTime: printedAt.toTimeString().slice(0, 5),
      from: fmtDMonY(from),
      to: fmtDMonY(to),
    };
    switch (report.id) {
      case "sales-summary":
        return <SalesSummaryPdfDocument meta={meta} bills={bills} />;
      case "sales-details":
        return <SalesDetailPdfDocument meta={meta} bills={bills} />;
      case "sales-category-summary":
        return <SalesCategoryPdfDocument meta={meta} bills={bills} />;
      case "sales-category-detail":
        return <SalesCategoryPdfDocument meta={meta} bills={bills} detail />;
      case "hourly-sales":
        return <HourlySalesPdfDocument meta={meta} bills={bills} />;
      case "payment-summary":
      case "payment-summary-wise":
        return <PaymentSummaryPdfDocument meta={meta} bills={bills} />;
      case "payment-bill-paymode-grid":
      case "cashier-breakdown-grid":
        return <PaymentGridPdfDocument meta={meta} bills={bills} />;
      case "cashier-collection":
        return <CashierSalesPdfDocument meta={meta} bills={bills} />;
      case "cashier-payment-breakdown":
        return <CashierBreakdownPdfDocument meta={meta} bills={bills} />;
      case "menu-item-issue":
        return <ItemIssuePdfDocument meta={meta} bills={bills} />;
      case "menu-item-issue-date":
        return <ItemIssuePdfDocument meta={meta} bills={bills} byDate />;
      case "item-movement":
        return <ItemMovementPdfDocument meta={meta} bills={bills} unusedItems={unusedItems} />;
      case "transaction-summary":
        return (
          <ReportPdfDocument
            meta={meta}
            bills={bills}
            columns={[
              { header: "Date", width: 14, get: (b) => b.date },
              { header: "Bill No", width: 16, get: (b) => b.billNo },
              { header: "Cashier", width: 20, get: (b) => b.cashierName },
              { header: "Pax", width: 8, num: true, get: (b) => String(b.pax) },
              { header: "Net Total", width: 16, num: true, get: (b) => b.netTotal.toFixed(2) },
            ]}
          />
        );
      case "service-charge":
        return (
          <ReportPdfDocument
            meta={meta}
            bills={bills}
            columns={[
              { header: "Date", width: 14, get: (b) => b.date },
              { header: "Bill No", width: 16, get: (b) => b.billNo },
              { header: "Cashier", width: 20, get: (b) => b.cashierName },
              { header: "Service Charge", width: 16, num: true, get: (b) => b.serviceCharge.toFixed(2) },
              { header: "Other SC", width: 14, num: true, get: (b) => b.otherServiceCharge.toFixed(2) },
              { header: "Net Total", width: 16, num: true, get: (b) => b.netTotal.toFixed(2) },
            ]}
          />
        );
      case "tax-vat":
        return <TaxPdfDocument meta={meta} bills={bills} />;
      case "pax-count":
        return <PaxPdfDocument meta={meta} bills={bills} />;
      case "credit-history":
      case "credit-pay-history":
      case "credit-account-detail":
        return <CreditPdfDocument meta={meta} credit={credit} />;
      default:
        return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, loading, err, bills, credit, unusedItems, from, to, printedAt]);

  const pdfFileName = useMemo(() => {
    const mode = report?.id === "item-movement" ? "-all" : "";
    return `${report?.id ?? "report"}${mode}-${from}_to_${to}.pdf`;
  }, [report, from, to]);

  function onShare(kind: "wa" | "email" | "device" | "copy") {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = report?.title || "Report";
    const range = `${from} to ${to}`;
    if (kind === "copy") {
      void navigator.clipboard?.writeText(url)
        .then(() => showToast("Link copied"))
        .catch(() => showToast("Copy failed"));
      return;
    }
    if (kind === "wa") {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${range}\n${url}`)}`, "_blank");
      return;
    }
    if (kind === "email") {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${range}\n${url}\n\n(PDF downloaded — attach it to this email)`)}`;
      return;
    }
    showToast("Direct share not supported — use WhatsApp or Email");
  }

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !(has("BILLGRP", "ACCESS") && has("BILLREP", "ACCESS"))) {
    return <NoAccess screen="Billing Reports" />;
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{REPORT_CSS}</style>
      {toast && <div className="br-toast">{toast}</div>}
      <div className="br-root" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#c2d4d4" }}>
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => { setNavKey(key); router.push(path); }}
          onLogout={() => { void logoutAdmin().finally(() => router.push("/admin-login")); }}
        />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden", background: "#fff" }}>
          <header
            style={{
              display: "flex", alignItems: "center", height: 48, flexShrink: 0, gap: 10,
              padding: "0 16px", borderBottom: "1px solid #e2e8f0", background: "#dae6e6",
            }}
          >
            <div style={{ flex: 1 }} />
            <span className="hdr-name" style={{ fontSize: 12, color: "#64748b" }}><UserName /></span>
          </header>

          {!report ? (
            <div className="br-err" style={{ margin: 18 }}>Unknown report. Go back and pick one from Billing → Reports.</div>
          ) : (
            <>
              <ReportToolbar
                report={report}
                from={from}
                to={to}
                loc={loc}
                pm={pm}
                locations={locations}
                payModes={payModes}
                search={search}
                zoom={zoom}
                chartMode={chartMode}
                onSearch={setSearch}
                onDates={setRange}
                onLoc={(next) => patchQuery({ loc: next })}
                onPm={(next) => patchQuery({ pm: next })}
                onZoom={setZoom}
                onToggleChart={() => setChartMode((v) => !v)}
                pdfDocument={pdfDocument}
                pdfFileName={pdfFileName}
                onShare={onShare}
              />
              <div className="main-body" style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
                <div
                  id="report-zoom-area"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    width: `${10000 / zoom}%`,
                    padding: 16,
                  }}
                >
                  {loading ? (
                    <div className="br-load">
                      <div className="br-spin" />
                      <p style={{ fontWeight: 700 }}>Loading Report Data...</p>
                    </div>
                  ) : err ? (
                    <div className="br-err">{err}</div>
                  ) : chartMode ? (
                    charts.length ? (
                      <ReportCharts title={report.title} charts={charts} />
                    ) : (
                      <div className="br-empty">No chart points for this range.</div>
                    )
                  ) : (
                    renderReport(report.id, bills, credit, unusedItems)
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
