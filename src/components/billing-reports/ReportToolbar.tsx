"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MockLocation, MockPayMode, ReportDef } from "@/lib/billingReports/types";
import { DatePreset, matchPreset, presetRange } from "@/lib/billingReports/dates";

/* rev 33: client-only import so SSR never touches the browser PDF APIs. */
const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false },
) as unknown as React.ComponentType<{
  document: unknown;
  fileName: string;
  className?: string;
  style?: React.CSSProperties;
  children: (arg: { loading: boolean }) => React.ReactNode;
}>;

/* rev 34: pdfkit 0.20 browser builds need the base-14 fonts registered
   before any PDF renders ("Standard font Helvetica is not registered").
   Runs once, client-side, before the download link is mounted. */
let stdFontsPromise: Promise<void> | null = null;
function ensureStdFonts(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  stdFontsPromise ??= (async () => {
    const [pk, hel, helB, helI, helBI, tRom, tB, tI, tBI, c, cB, cI, cBI] =
      await Promise.all([
        import("pdfkit"),
        import("pdfkit/standard-fonts/Helvetica"),
        import("pdfkit/standard-fonts/HelveticaBold"),
        import("pdfkit/standard-fonts/HelveticaOblique"),
        import("pdfkit/standard-fonts/HelveticaBoldOblique"),
        import("pdfkit/standard-fonts/TimesRoman"),
        import("pdfkit/standard-fonts/TimesBold"),
        import("pdfkit/standard-fonts/TimesItalic"),
        import("pdfkit/standard-fonts/TimesBoldItalic"),
        import("pdfkit/standard-fonts/Courier"),
        import("pdfkit/standard-fonts/CourierBold"),
        import("pdfkit/standard-fonts/CourierOblique"),
        import("pdfkit/standard-fonts/CourierBoldOblique"),
      ]);
    (pk as unknown as { registerStdFonts: (...fonts: unknown[]) => void })
      .registerStdFonts(
        hel.default, helB.default, helI.default, helBI.default,
        tRom.default, tB.default, tI.default, tBI.default,
        c.default, cB.default, cI.default, cBI.default,
      );
  })();
  return stdFontsPromise;
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "year", label: "This Year" },
  { id: "last30", label: "Last 30 Days" },
];

export default function ReportToolbar({
  report,
  from,
  to,
  loc,
  pm,
  locations,
  payModes,
  search,
  zoom,
  chartMode,
  onSearch,
  onDates,
  onLoc,
  onPm,
  onZoom,
  onToggleChart,
  pdfDocument,
  pdfFileName,
  onShare,
}: {
  report: ReportDef;
  from: string;
  to: string;
  loc: string;
  pm: string;
  locations: MockLocation[];
  payModes: MockPayMode[];
  search: string;
  zoom: number;
  chartMode: boolean;
  onSearch: (q: string) => void;
  onDates: (from: string, to: string) => void;
  onLoc: (loc: string) => void;
  onPm: (pm: string) => void;
  onZoom: (z: number) => void;
  onToggleChart: () => void;
  pdfDocument?: React.ReactNode;
  pdfFileName?: string;
  onShare: (kind: "wa" | "email" | "device" | "copy") => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const active = matchPreset(from, to);

  useEffect(() => {
    let cancelled = false;
    void ensureStdFonts()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="br-toolbar">
      <div className="br-t-row">
        <div className="br-ico-sq">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="br-title">{report.title}</div>
          {report.subtitle && <div className="br-sub">{report.subtitle}</div>}
        </div>
        <div style={{ flex: 1 }} />
        {pdfDocument && pdfFileName && fontsReady ? (
          <PDFDownloadLink
            document={pdfDocument}
            fileName={pdfFileName}
            className="br-pdf"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "linear-gradient(180deg,#1d7a34,#145a26)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", textDecoration: "none",
            }}
          >
            {({ loading }) =>
              loading ? (
                "Preparing PDF..."
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download PDF
                </>
              )
            }
          </PDFDownloadLink>
        ) : null}
      </div>

      <div className="br-t-row">
        <div style={{ position: "relative", flex: "1 1 210px", maxWidth: 300, minWidth: 180 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            className="br-search"
            placeholder={report.searchPlaceholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <select className="br-filter" value={loc} onChange={(e) => onLoc(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.locCode} value={l.locCode}>{l.locCode} — {l.locName}</option>
          ))}
        </select>
        {report.extraFilter === "payMode" && (
          <select className="br-filter" value={pm} onChange={(e) => onPm(e.target.value)} aria-label="Pay mode">
            <option value="">All pay modes</option>
            {payModes.map((m) => (
              <option key={m.payCode} value={m.payCode}>{m.payCode} — {m.payDes}</option>
            ))}
          </select>
        )}
        <div className="br-dates">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input type="date" value={from} onChange={(e) => onDates(e.target.value, to)} aria-label="From" />
          <span style={{ fontSize: 12, color: "#94a3b8" }}>to</span>
          <input type="date" value={to} onChange={(e) => onDates(from, e.target.value)} aria-label="To" />
        </div>

        <div className="br-zoom">
          <button type="button" onClick={() => onZoom(Math.max(70, zoom - 10))} aria-label="Zoom out">−</button>
          <span>{zoom}%</span>
          <button type="button" onClick={() => onZoom(Math.min(150, zoom + 10))} aria-label="Zoom in">+</button>
        </div>

        {report.hasCharts && (
          <button
            className={`br-iconbtn ${chartMode ? "active" : ""}`}
            type="button"
            title={chartMode ? "Table view" : "Chart view"}
            onClick={onToggleChart}
          >
            {chartMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
              </svg>
            )}
          </button>
        )}

        <div ref={wrap} style={{ position: "relative" }}>
          <button className="br-iconbtn" type="button" title="Share" onClick={() => setShareOpen((v) => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          {shareOpen && (
            <div className="br-share">
              <button type="button" onClick={() => { onShare("wa"); setShareOpen(false); }}>
                <span className="tile" style={{ background: "#dcfce7", color: "#15803d" }}>W</span> Share via WhatsApp
              </button>
              <button type="button" onClick={() => { onShare("email"); setShareOpen(false); }}>
                <span className="tile" style={{ background: "#dbeafe", color: "#1d4ed8" }}>@</span> Share via Email
              </button>
              <button type="button" onClick={() => { onShare("device"); setShareOpen(false); }}>
                <span className="tile" style={{ background: "#f1f5f9", color: "#334155" }}>↑</span> Share (device) with PDF
              </button>
              <button type="button" onClick={() => { onShare("copy"); setShareOpen(false); }}>
                <span className="tile" style={{ background: "#fef3c7", color: "#b45309" }}>⧉</span> Copy link
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="br-t-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`br-chip ${active === p.id ? "active" : ""}`}
            onClick={() => {
              const r = presetRange(p.id);
              onDates(r.from, r.to);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
