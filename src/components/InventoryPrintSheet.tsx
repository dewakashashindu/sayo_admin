// src/components/InventoryPrintSheet.tsx
// Generic print sheet that looks exactly like PoPrintSheet (PURCHASE ORDER)
// but title and columns are parametrised for SRN / Damage / Recon.
// Reuses the same PO_PRINT_CSS layout so the paper looks “galapenna”.
import React from 'react';

export interface PrintRow {
  itemCode: string;
  name: string;
  unit: string;
  qty: string;
  costPrice?: string;
  itemValue?: string;
  extra?: string; // phy/system etc
}

export interface InventoryPrintSheetProps {
  title: string; // e.g. "Supplier Return Note" / "Damage Note" / "Stock Reconciliation Note"
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
  const colCount = 4 + (p.columns.cost ? 1 : 0) + (p.columns.value ? 1 : 0);
  return (
    <div className="print-sheet">
      <div className="ps-frame">
        <div className="ps-head">
          <div className="ps-head-left">
            <div className="ps-company">{p.companyName}</div>
            {p.companyAddress && <div className="ps-company-addr">{p.companyAddress}</div>}
            {p.companyPhone && <div className="ps-company-addr">{p.companyPhone}</div>}
          </div>
          <div className="ps-title">{p.title}</div>
          <div className="ps-head-right">
            <div className="ps-kv"><span className="ps-k">{p.title.includes('Return') ? 'SRN NO' : p.title.includes('Damage') ? 'Damage No' : p.title.includes('Recon') ? 'Rec. No' : 'No'}</span><span className="ps-c">:</span><span className="ps-v ps-strong">{p.docNo}</span></div>
            <div className="ps-kv"><span className="ps-k">Date</span><span className="ps-c">:</span><span className="ps-v">{p.docDate}</span></div>
            {p.dueDate && <div className="ps-kv"><span className="ps-k">Due Date</span><span className="ps-c">:</span><span className="ps-v">{p.dueDate}</span></div>}
            <div className="ps-kv ps-gap"><span className="ps-k" /><span className="ps-c" /><span className="ps-v" /></div>
            <div className="ps-kv"><span className="ps-k">Print Date</span><span className="ps-c">:</span><span className="ps-v">{p.printDate}</span></div>
            <div className="ps-kv"><span className="ps-k">Print Time</span><span className="ps-c">:</span><span className="ps-v">{p.printTime}</span></div>
            <div className="ps-kv"><span className="ps-k">User</span><span className="ps-c">:</span><span className="ps-v">{p.user}</span></div>
          </div>
        </div>
        <div className="ps-supplier">
          <div className="ps-sup-label">{p.partnerLabel}</div>
          <div className="ps-sup-line">
            <span className="ps-sup-code">{p.partnerCode}</span>
            <span className="ps-sup-name">{p.partnerName}</span>
          </div>
          <div className="ps-sup-addr">{p.partnerAddress || '\u00a0'}</div>
        </div>
        <table className="ps-table">
          <thead>
            <tr>
              <th className="ps-c-code">{p.columns.code}</th>
              <th className="ps-c-des">{p.columns.des}</th>
              <th className="ps-c-unit">{p.columns.unit}</th>
              <th className="ps-c-qty">{p.columns.qty}</th>
              {p.columns.cost && <th className="ps-c-cost">{p.columns.cost}</th>}
              {p.columns.value && <th className="ps-c-value">{p.columns.value}</th>}
            </tr>
          </thead>
          <tbody>
            <tr className="ps-group"><td colSpan={colCount}>{p.docNo}</td></tr>
            {p.rows.map((r, i) => (
              <tr key={`${r.itemCode}|${i}`}>
                <td className="ps-c-code">{r.itemCode}</td>
                <td>{r.name}</td>
                <td>{r.unit}</td>
                <td className="ps-c-qty num">{r.qty}</td>
                {p.columns.cost && <td className="ps-c-cost num">{r.costPrice || ''}</td>}
                {p.columns.value && <td className="ps-c-value num">{r.itemValue || ''}</td>}
              </tr>
            ))}
            {p.rows.length === 0 && <tr><td colSpan={colCount} className="ps-empty">No item lines</td></tr>}
            <tr className="ps-total"><td colSpan={colCount - 1}>{p.totalLabel}</td><td className="num">{p.total}</td></tr>
          </tbody>
        </table>
        {p.deliAdd && <div className="ps-deli"><span className="ps-deli-k">Deli. Add</span><span className="ps-deli-v">{p.deliAdd}</span></div>}
        {p.remarks && <div className="ps-deli"><span className="ps-deli-k">Remarks</span><span className="ps-deli-v">{p.remarks}</span></div>}
        <div className="ps-grow" />
        <div className="ps-foot"><span>{p.companyName}{p.branch && p.branch !== p.companyName ? ` — ${p.branch}` : ''}</span><span>Page 1 of 1</span><span>{p.copyLabel || 'Original'}</span></div>
      </div>
    </div>
  );
}

export const INVENTORY_PRINT_CSS = `
  .print-sheet { display:none; font-family:'Segoe UI', Arial, sans-serif; color:#000; }
  .print-sheet .ps-frame { border:1.5px solid #000; padding:8mm; min-height:250mm; display:flex; flex-direction:column; }
  .print-sheet .ps-head { display:grid; grid-template-columns:1fr auto 1fr; align-items:start; gap:10px; }
  .print-sheet .ps-company { font-size:13px; font-weight:800; letter-spacing:0.06em; }
  .print-sheet .ps-company-addr { font-size:9.5px; color:#444; margin-top:3px; }
  .print-sheet .ps-title { font-size:14px; font-weight:700; text-align:center; padding-top:2px; }
  .print-sheet .ps-head-right { justify-self:end; min-width:210px; }
  .print-sheet .ps-kv { display:grid; grid-template-columns:78px 10px 116px; font-size:10.5px; line-height:1.75; }
  .print-sheet .ps-k { font-weight:600; }
  .print-sheet .ps-v { text-align:right; }
  .print-sheet .ps-strong { font-weight:700; }
  .print-sheet .ps-gap { height:8px; }
  .print-sheet .ps-supplier { background:#eaf7ee; width:56%; margin-top:22px; margin-bottom:14px; padding:8px 6px; }
  .print-sheet .ps-sup-label { font-size:10.5px; margin-left:5px; }
  .print-sheet .ps-sup-line { display:flex; gap:38px; font-size:10.5px; margin-top:6px; }
  .print-sheet .ps-sup-code { font-weight:600; margin-left:11px; }
  .print-sheet .ps-sup-addr { font-size:10.5px; margin-top:12px; margin-left:11px; }
  .print-sheet .ps-table { width:100%; border-collapse:collapse; font-size:10.5px; }
  .print-sheet .ps-table th { background:#f7eacc; text-align:left; font-weight:700; padding:4px 2px; border:none; color:#000; }
  .print-sheet .ps-table td { padding:3px 2px; vertical-align:top; }
  .print-sheet .ps-table td.num, .print-sheet .ps-table th.num { text-align:right; }
  .print-sheet .ps-table th.ps-c-qty, .print-sheet .ps-table th.ps-c-cost, .print-sheet .ps-table th.ps-c-value { text-align:right; }
  .print-sheet .ps-table .ps-c-code { width:70px; }
  .print-sheet .ps-table .ps-c-unit { width:105px; }
  .print-sheet .ps-table .ps-c-qty { width:70px; }
  .print-sheet .ps-table .ps-c-cost { width:82px; }
  .print-sheet .ps-table .ps-c-value { width:92px; }
  .print-sheet tr.ps-group td { background:#f7eacc; font-weight:700; padding:3px 2px; }
  .print-sheet tr.ps-total td { background:#baddf7; font-weight:700; padding:3px 2px; }
  .print-sheet td.ps-empty { color:#555; padding:8px 2px; }
  .print-sheet .ps-deli { display:flex; gap:8px; font-size:10.5px; margin-top:16px; }
  .print-sheet .ps-deli-k { width:60px; }
  .print-sheet .ps-grow { flex:1 1 auto; min-height:0; }
  .print-sheet .ps-foot { padding-top:12px; display:flex; justify-content:space-between; font-size:9px; color:#000; }
  @media print { .print-sheet { display:block !important; } @page { size:A4 portrait; margin:0; } .print-sheet { padding:10mm; } }
`;
