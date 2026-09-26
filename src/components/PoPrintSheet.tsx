// src/components/PoPrintSheet.tsx
// PURCHASE ORDER sheet. Renders the unified VB6-style frame (reportPrintCore) —
// props kept exactly as before so the PO page does not change.

import React from 'react';
import type { PoPrintRow } from '@/lib/poPrint';
import ReportPrintCore, { REPORT_PRINT_CSS, type RepColumn, type RepMetaItem } from './reportPrintCore';

export type { PoPrintRow };

export interface PoPrintSheetProps {
  copy: 'standard' | 'supplier';
  copyLabel: string;
  /** Cost Price / ItemValue / Total — all false on the supplier copy */
  cols: { costPrice: boolean; itemValue: boolean; total: boolean };
  colCount: number;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  branch: string;
  supplierCode: string;
  supplierName: string;
  supplierAddress: string;
  poNo: string;
  poDate: string;
  dueDate: string;
  printDate: string;
  printTime: string;
  user: string;
  rows: PoPrintRow[];
  total: string;
  deliAdd: string;
  remarks: string;
}

export default function PoPrintSheet(props: PoPrintSheetProps) {
  const meta: RepMetaItem[] = [
    { key: 'PO NO', value: props.poNo, strong: true },
    { key: 'PO Date', value: props.poDate },
    { key: 'Due Date', value: props.dueDate },
    { key: 'Print Date', value: props.printDate },
    { key: 'Print Time', value: props.printTime },
    { key: 'User', value: props.user },
  ];

  const columns: RepColumn[] = [
    { label: 'ItemCode', width: '80px' },
    { label: 'Item Description' },
    { label: 'Unit', width: '80px' },
    { label: 'Qty', width: '70px', align: 'r' },
    ...(props.cols.costPrice ? [{ label: 'Cost Price', width: '90px', align: 'r' as const }] : []),
    ...(props.cols.itemValue ? [{ label: 'ItemValue', width: '96px', align: 'r' as const }] : []),
  ];

  const rows = props.rows.map((row) => [
    row.itemCode, row.name === row.itemCode ? "" : row.name, row.unit, row.qty,
    ...(props.cols.costPrice ? [row.costPrice] : []),
    ...(props.cols.itemValue ? [row.itemValue] : []),
  ]);

  return (
    <ReportPrintCore
      title="Purchase Order"
      companyName={props.companyName}
      companyAddress={props.companyAddress}
      companyPhone={props.companyPhone}
      meta={meta}
      boxes={[{ label: 'Supplier', code: props.supplierCode, name: props.supplierName, addr: props.supplierAddress }]}
      groupRow={props.poNo}
      columns={columns}
      rows={rows}
      emptyText="No item lines on this order"
      total={props.cols.total ? { label: 'Total', value: props.total } : undefined}
      sublines={[
        { key: 'Deli. Add', value: props.deliAdd },
        { key: 'Remarks', value: props.remarks },
      ]}
      footerRight={props.copyLabel}
    />
  );
}

export const PO_PRINT_CSS = REPORT_PRINT_CSS;
