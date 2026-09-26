// src/components/reportPrintCore.tsx
// The single frame every inventory print renders with — the VB6 report style:
// letterhead (company) top-left, report title centered, meta (dates/user) top-right,
// context boxes, blue-bordered grid, totals band, remarks line. No signature rows —
// only the data that belongs to the screen being printed.
// Multi-page: the head + context boxes live in the table <thead> so the browser
// repeats them on every page; the footer bars repeat per page via position:fixed.

import React from "react";

export interface RepColumn {
  label: string;
  width?: string;
  align?: "l" | "c" | "r";
}

export interface RepMetaItem {
  key: string;
  value: string;
  strong?: boolean;
}

export interface RepBox {
  label: string;          // Supplier / From / To / Location
  code?: string;
  name?: string;
  addr?: string;
}

export interface ReportPrintCoreProps {
  title: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  meta: RepMetaItem[];
  boxes?: RepBox[];
  groupRow?: string;                 // the band inside the table (document number)
  columns: RepColumn[];
  rows: (string | number | null | undefined)[][];
  emptyText?: string;
  total?: { label: string; value: string; labelSpan?: number };
  sublines?: { key: string; value: string }[];   // Deli. Add / Remarks / GRN etc.
  footerRight?: string;              // the copy label (Original / Supplier Copy)
}

export default function ReportPrintCore(p: ReportPrintCoreProps) {
  const cols = p.columns.length;
  const boxes = p.boxes ?? [];
  const sublines = (p.sublines ?? []).filter((sl) => sl.value);
  return (
    <div className="print-sheet">
      <div className="rp-frame">
        <table className="rp-tbl">
          <thead>
            {/* report head — repeats on every printed page (browser repeats <thead>) */}
            <tr className="rp-pagehead">
              <td colSpan={cols}>
                <div className="rp-head">
                  <div className="rp-lh">
                    <div className="rp-company">{(p.companyName || "SAYO BEAUTY").trim()}</div>
                    {p.companyAddress && <div className="rp-lh-line">{p.companyAddress}</div>}
                    {p.companyPhone && <div className="rp-lh-line">{p.companyPhone}</div>}
                  </div>
                  <div className="rp-title">{p.title}</div>
                  <div className="rp-meta">
                    {p.meta.map((m, i) => (
                      <div className="rp-kv" key={i}>
                        <span className="rp-k">{m.key}</span>
                        <span className="rp-c">:</span>
                        <span className={`rp-v${m.strong ? " rp-strong" : ""}`}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </td>
            </tr>
            {boxes.length > 0 && (
              <tr className="rp-pagectx">
                <td colSpan={cols}>
                  <div className={`rp-ctx${boxes.length === 1 ? " rp-ctx-one" : ""}`}>
                    {boxes.map((b, i) => (
                      <div className="rp-box" key={i}>
                        <div className="rp-box-label">{b.label}</div>
                        <div className="rp-box-line">
                          {b.code && <span className="rp-box-code">{b.code}</span>}
                          {b.name && <span className="rp-box-name">{b.name}</span>}
                        </div>
                        {b.addr && <div className="rp-box-addr">{b.addr}</div>}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}
            <tr>
              {p.columns.map((c, i) => (
                <th key={i} style={c.width ? { width: c.width } : undefined}
                    className={c.align === "r" ? "rp-num" : c.align === "c" ? "rp-ctr" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.groupRow && <tr className="rp-group"><td colSpan={cols}>{p.groupRow}</td></tr>}
            {p.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}
                      className={p.columns[j]?.align === "r" ? "rp-num" : p.columns[j]?.align === "c" ? "rp-ctr" : undefined}>
                    {cell ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {p.rows.length === 0 && (
              <tr><td colSpan={cols} className="rp-empty">{p.emptyText ?? "No item lines"}</td></tr>
            )}
            {p.total && (
              <tr className="rp-total">
                <td colSpan={p.total.labelSpan ?? cols - 1}>{p.total.label}</td>
                <td className="rp-num">{p.total.value}</td>
              </tr>
            )}
          </tbody>
        </table>

        {sublines.length > 0 && (
          <div className="rp-subs">
            {sublines.map((sl, i) => (
              <div className="rp-sub" key={i}>
                <span className="rp-sub-k">{sl.key}</span>
                <span className="rp-sub-v">{sl.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rp-foot">
          <span />
          <span>Page 1 of 1</span>
          <span>{p.footerRight || ""}</span>
        </div>
      </div>
    </div>
  );
}

export const REPORT_PRINT_CSS = `
  .print-sheet { display:none; font-family:Arial, Helvetica, sans-serif; color:#000; }
  /* browsers silently strip backgrounds on print unless the exact flag is set —
     without it the blue headers / zebra rows / boxes fall back to white */
  .print-sheet, .print-sheet * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  .print-sheet .rp-frame { border:2px solid #000; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
  .print-sheet .rp-head {
    display:grid; grid-template-columns:1fr auto 1fr; align-items:start; gap:10px;
    padding:6px 8px 6px; border-bottom:2px solid #000;
  }
  .print-sheet .rp-company { font-size:15px; font-weight:800; letter-spacing:0.02em; }
  .print-sheet .rp-lh-line { font-size:10px; margin-top:2px; }
  .print-sheet .rp-title { text-align:center; font-size:17px; font-weight:800; letter-spacing:0.04em; padding-top:10px; }
  .print-sheet .rp-meta { justify-self:end; min-width:205px; }
  .print-sheet .rp-kv { display:grid; grid-template-columns:84px 10px auto; font-size:11px; line-height:1.6; }
  .print-sheet .rp-k { font-weight:700; }
  .print-sheet .rp-strong { font-weight:800; }

  .print-sheet .rp-ctx {
    display:grid; grid-template-columns:1fr 1fr; gap:10px;
    padding:7px 10px; border-bottom:2px solid #000; background:#f2f6f6;
  }
  .print-sheet .rp-ctx-one { grid-template-columns:56% 1fr; }
  .print-sheet .rp-box-label { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#234a52; }
  .print-sheet .rp-box-line { display:flex; gap:10px; font-size:11px; margin-top:4px; }
  .print-sheet .rp-box-code { font-weight:800; }
  .print-sheet .rp-box-name { font-weight:600; }
  .print-sheet .rp-box-addr { font-size:10px; margin-top:3px; }

  .print-sheet .rp-tbl { width:100%; border-collapse:collapse; font-size:11px; }
  .print-sheet .rp-tbl thead { display:table-header-group; }
  .print-sheet .rp-tbl td { border:1px solid #000; padding:4px 7px; font-size:11px; vertical-align:top; }
  /* the letterhead / context rows inside <thead> span the full width — no grid cell borders */
  .print-sheet .rp-tbl tr.rp-pagehead > td, .print-sheet .rp-tbl tr.rp-pagectx > td { border:0; padding:0; }
  .print-sheet .rp-tbl th { background:#bdd6ea; border:1px solid #000; padding:5px 7px; font-size:11px; font-weight:800; text-align:left; }
  .print-sheet .rp-tbl td.rp-num, .print-sheet .rp-tbl th.rp-num { text-align:right; }
  .print-sheet .rp-tbl td.rp-ctr, .print-sheet .rp-tbl th.rp-ctr { text-align:center; }
  .print-sheet .rp-tbl tbody tr:nth-child(even) td { background:#f7fafa; }
  .print-sheet .rp-tbl tbody tr { break-inside:avoid; }
  .print-sheet .rp-tbl tr.rp-group td { background:#dce9f7; font-weight:700; }
  .print-sheet .rp-tbl tr.rp-total td { background:#bdd6ea; font-weight:800; border-top:2px solid #000; }
  .print-sheet .rp-tbl td.rp-empty { text-align:center; padding:10px; color:#555; }

  .print-sheet .rp-subs { break-inside:avoid; }
  .print-sheet .rp-sub { display:flex; gap:8px; font-size:11px; margin-top:8px; padding:0 8px; }
  .print-sheet .rp-sub-k { width:70px; font-weight:700; }
  .print-sheet .rp-sub-v { flex:1; }
  .print-sheet .rp-foot {
    display:flex; justify-content:space-between; padding:8px 8px 5px;
    border-top:2px solid #000; font-size:10px; background:#fff;
  }

  @media print {
    /* margin 0 suppresses the browser’s own printed header/footer
       (the URL on the left and the date / page title on the right) */
    @page { size:A4 portrait; margin:0; }
    .print-sheet {
      display:block !important;
      box-decoration-break:clone; -webkit-box-decoration-break:clone;
      padding:10mm;
    }
    /* the footer bar repeats at the bottom of every printed page */
    .print-sheet .rp-foot { position:fixed; left:10mm; right:10mm; bottom:7mm; }
  }
`;
