// src/components/MasterPrintSheet.tsx
// Master-list prints (Location / Category / Item / Unit / Supplier masters).
// Same unified VB6 frame as the document prints, but masters have no copy
// concept — the footer stays at "Page 1 of 1" only.

import React from "react";
import { poPrintClock } from "@/lib/poPrint";
import ReportPrintCore, { REPORT_PRINT_CSS, type RepColumn, type RepMetaItem } from "./reportPrintCore";

export interface MasterPrintSheetProps {
  title: string;
  companyName?: string;    // defaults to SAYO BEAUTY
  user?: string;           // defaults to Admin
  columns: RepColumn[];
  rows: (string | number | null | undefined)[][];
  emptyText?: string;
}

export default function MasterPrintSheet(p: MasterPrintSheetProps) {
  const clock = poPrintClock(new Date());
  const meta: RepMetaItem[] = [
    { key: "Print Date", value: clock.date },
    { key: "Print Time", value: clock.time },
    { key: "User", value: p.user || "Admin" },
    { key: "Records", value: String(p.rows.length) },
  ];
  return (
    <div className="master-print-root" aria-hidden="true">
      <ReportPrintCore
        title={p.title}
        companyName={(p.companyName || "SAYO BEAUTY").trim()}
        meta={meta}
        columns={p.columns}
        rows={p.rows}
        emptyText={p.emptyText ?? "No records"}
      />
    </div>
  );
}

export const MASTER_PRINT_CSS = `
  ${REPORT_PRINT_CSS}
  /* the master report is the only thing visible when printing this screen */
  .master-print-root { display:none; }
  @media print {
    html, body { overflow:visible !important; height:auto !important; }
    body * { visibility:hidden !important; }
    .master-print-root, .master-print-root * { visibility:visible !important; }
    .master-print-root { display:block !important; position:absolute; inset:0 0 auto 0; }
  }
`;
