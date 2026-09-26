// src/components/InventoryPrintSheet.tsx
// GRN / SRN / Damage / Recon document sheets. Renders the unified VB6-style
// frame (reportPrintCore) — props kept exactly as before so pages do not change.

import React from 'react';
import ReportPrintCore, { REPORT_PRINT_CSS, type RepColumn, type RepMetaItem } from './reportPrintCore';

export interface PrintRow {
  itemCode: string;
  name: string;
  unit: string;
  qty: string;
  costPrice?: string;
  itemValue?: string;
  extra?: string;
}

export interface InventoryPrintSheetProps {
  title: string;
  docNo: string;
  docDate: string;
  dueDate?: string;
  printDate: string;
  printTime: string;
  user: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  branch: string;
  partnerLabel: string; // "Supplier" or "Location"
  partnerCode: string;
  partnerName: string;
  partnerAddress: string;
  columns: { code: string; des: string; unit: string; qty: string; cost?: string; value?: string };
  rows: PrintRow[];
  totalLabel: string;
  total: string;
  deliAdd?: string;
  remarks?: string;
  copyLabel?: string;
}

export default function InventoryPrintSheet(p: InventoryPrintSheetProps) {
  const docNoKey = p.title.includes('Return') ? 'SRN NO'
    : p.title.includes('Damage') ? 'Damage No'
    : p.title.includes('Recon') ? 'Rec. No' : 'GRN NO';

  const meta: RepMetaItem[] = [
    { key: docNoKey, value: p.docNo, strong: true },
    { key: 'Date', value: p.docDate },
    ...(p.dueDate ? [{ key: 'Due Date', value: p.dueDate }] : []),
    { key: 'Print Date', value: p.printDate },
    { key: 'Print Time', value: p.printTime },
    { key: 'User', value: p.user },
  ];

  const columns: RepColumn[] = [
    { label: p.columns.code, width: '80px' },
    { label: p.columns.des },
    { label: p.columns.unit, width: '80px' },
    { label: p.columns.qty, width: '70px', align: 'r' },
    ...(p.columns.cost ? [{ label: p.columns.cost, width: '90px', align: 'r' as const }] : []),
    ...(p.columns.value ? [{ label: p.columns.value, width: '96px', align: 'r' as const }] : []),
  ];

  const rows = p.rows.map((r) => [
    r.itemCode, r.name === r.itemCode ? "" : r.name, r.unit, r.qty,
    ...(p.columns.cost ? [r.costPrice || ''] : []),
    ...(p.columns.value ? [r.itemValue || ''] : []),
  ]);

  return (
    <ReportPrintCore
      title={p.title}
      companyName={p.companyName}
      companyAddress={p.companyAddress}
      companyPhone={p.companyPhone}
      meta={meta}
      boxes={[{
        label: p.partnerLabel,
        code: p.partnerCode,
        name: p.partnerName,
        addr: p.partnerAddress,
      }]}
      groupRow={p.docNo}
      columns={columns}
      rows={rows}
      emptyText="No item lines"
      total={{ label: p.totalLabel, value: p.total }}
      sublines={[
        { key: 'Deli. Add', value: p.deliAdd ?? '' },
        { key: 'Remarks', value: p.remarks ?? '' },
      ]}
      footerRight={p.copyLabel || 'Original'}
    />
  );
}

export const INVENTORY_PRINT_CSS = REPORT_PRINT_CSS;
