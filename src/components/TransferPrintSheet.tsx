// src/components/TransferPrintSheet.tsx
// Transfer / Issue document sheets. Renders the unified VB6-style frame
// (reportPrintCore) — props kept exactly as before so the pages do not change.
// Used for Transfer Requisition/Note/Return and Issue Requisition/Issue Note.

import React from "react";
import type { PoPrintRow } from "@/lib/poPrint";
import ReportPrintCore, { REPORT_PRINT_CSS, type RepColumn, type RepMetaItem } from "./reportPrintCore";

export interface TransferPrintSheetProps {
  title: string;
  copy: "standard" | "supplier";
  copyLabel: string;
  cols: { costPrice: boolean; itemValue: boolean; total: boolean };
  colCount: number;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  branch: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  docNo: string;
  docDate: string;
  dueDate?: string;
  issueRef?: string;
  printDate: string;
  printTime: string;
  user: string;
  rows: PoPrintRow[];
  total: string;
  remarks: string;
}

export default function TransferPrintSheet(p: TransferPrintSheetProps) {
  const docNoKey = p.title.includes("Requisition")
    ? p.title.includes("Issue") ? "Issue Req No" : "TR No"
    : p.title.includes("Return") ? "Rtn No"
    : p.title.includes("Issue") ? "Issue No" : "Trn No";

  const meta: RepMetaItem[] = [
    { key: docNoKey, value: p.docNo, strong: true },
    { key: "Date", value: p.docDate },
    ...(p.dueDate ? [{ key: "Due Date", value: p.dueDate }] : []),
    ...(p.issueRef ? [{ key: "Ref", value: p.issueRef }] : []),
    { key: "Print Date", value: p.printDate },
    { key: "Print Time", value: p.printTime },
    { key: "User", value: p.user },
  ];

  const columns: RepColumn[] = [
    { label: "Item Code", width: "80px" },
    { label: "Description" },
    { label: "Unit", width: "80px" },
    { label: "Qty", width: "70px", align: "r" },
    ...(p.cols.costPrice ? [{ label: "Cost Price", width: "90px", align: "r" as const }] : []),
    ...(p.cols.itemValue ? [{ label: "Item Value", width: "96px", align: "r" as const }] : []),
  ];

  const rows = p.rows.map((r) => [
    r.itemCode, r.name === r.itemCode ? "" : r.name, r.unit, r.qty,
    ...(p.cols.costPrice ? [r.costPrice] : []),
    ...(p.cols.itemValue ? [r.itemValue] : []),
  ]);

  return (
    <ReportPrintCore
      title={p.title}
      companyName={p.companyName}
      companyAddress={p.companyAddress}
      companyPhone={p.companyPhone}
      meta={meta}
      boxes={[
        { label: "From", code: p.fromCode, name: p.fromName },
        { label: "To", code: p.toCode, name: p.toName },
      ]}
      groupRow={p.docNo}
      columns={columns}
      rows={rows}
      emptyText="No item lines"
      total={p.cols.total ? { label: "Net Total", value: p.total } : undefined}
      sublines={p.remarks ? [{ key: "Remarks", value: p.remarks }] : []}
      footerRight={p.copyLabel}
    />
  );
}

export const TRANSFER_PRINT_CSS = REPORT_PRINT_CSS;
