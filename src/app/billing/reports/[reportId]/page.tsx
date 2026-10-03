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
import { isReportId, reportById } from "@/lib/billingReports/config";
import { presetRange, todayISO, yearStartISO } from "@/lib/billingReports/dates";
import { filterBills, filterCredit } from "@/lib/billingReports/mock";

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [toast, setToast] = useState("");

  const reportId = String(params.reportId || "");
  const report = isReportId(reportId) ? reportById(reportId) : undefined;

  const from = searchParams.get("from") || presetRange("month").from || yearStartISO();
  const to = searchParams.get("to") || presetRange("month").to || todayISO();
  const loc = searchParams.get("loc") || "";
  const pmRaw = searchParams.get("pm") || "";
  const pm = report?.extraFilter === "payMode" ? pmRaw || "CASH" : pmRaw;

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("from", nextFrom);
      q.set("to", nextTo);
      router.replace(`/billing/reports/${reportId}?${q.toString()}`);
    },
    [router, reportId, searchParams],
  );

  useEffect(() => {
    setSearch("");
    setChartMode(false);
    setZoom(100);
  }, [reportId]);

  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(t);
  }, [reportId, from, to, loc, pm]);

  const bills = useMemo(() => {
    const raw = filterBills(from, to, loc, report?.extraFilter === "payMode" ? pm : "");
    return searchBills(raw, search, isReportId(reportId) ? reportId : "sales-summary");
  }, [from, to, loc, pm, search, report, reportId]);

  const credit = useMemo(() => {
    return searchCredit(filterCredit(from, to, loc), search);
  }, [from, to, loc, search]);

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

  function onPdf() {
    setPdfBusy(true);
    window.setTimeout(() => {
      setPdfBusy(false);
      showToast("PDF download will connect when reports use live bills.");
    }, 700);
  }

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
            <span style={{ fontSize: 12, color: "#64748b" }}><UserName /></span>
          </header>

          {!report ? (
            <div className="br-err" style={{ margin: 18 }}>Unknown report. Go back and pick one from Billing → Reports.</div>
          ) : (
            <>
              <ReportToolbar
                report={report}
                from={from}
                to={to}
                search={search}
                zoom={zoom}
                chartMode={chartMode}
                onSearch={setSearch}
                onDates={setRange}
                onZoom={setZoom}
                onToggleChart={() => setChartMode((v) => !v)}
                onPdf={onPdf}
                onShare={onShare}
                pdfBusy={pdfBusy}
              />
              <div style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
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
                  ) : chartMode ? (
                    charts.length ? (
                      <ReportCharts title={report.title} charts={charts} />
                    ) : (
                      <div className="br-empty">No chart points for this range.</div>
                    )
                  ) : (
                    renderReport(report.id, bills, credit)
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
