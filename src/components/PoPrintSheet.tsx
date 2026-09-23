import React from 'react';
import type { PoPrintRow } from '@/lib/poPrint';

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
  const {
    copy, copyLabel, cols, colCount, companyName, companyAddress, companyPhone,
    branch, supplierCode, supplierName, supplierAddress, poNo, poDate, dueDate,
    printDate, printTime, user, rows, total, deliAdd, remarks,
  } = props;

  return (
    <div className={`print-sheet copy-${copy}`}>
      <div className="ps-frame">
        {}
        <div className="ps-head">
          <div className="ps-head-left">
            <div className="ps-company">{companyName}</div>
            {companyAddress && <div className="ps-company-addr">{companyAddress}</div>}
            {companyPhone && <div className="ps-company-addr">{companyPhone}</div>}
          </div>
          <div className="ps-title">Purchase Order</div>
          <div className="ps-head-right">
            <div className="ps-kv"><span className="ps-k">PO NO</span><span className="ps-c">:</span><span className="ps-v ps-strong">{poNo}</span></div>
            <div className="ps-kv"><span className="ps-k">PO Date</span><span className="ps-c">:</span><span className="ps-v">{poDate}</span></div>
            <div className="ps-kv"><span className="ps-k">Due Date</span><span className="ps-c">:</span><span className="ps-v">{dueDate}</span></div>
            <div className="ps-kv ps-gap"><span className="ps-k" /><span className="ps-c" /><span className="ps-v" /></div>
            <div className="ps-kv"><span className="ps-k">Print Date</span><span className="ps-c">:</span><span className="ps-v">{printDate}</span></div>
            <div className="ps-kv"><span className="ps-k">Print Time</span><span className="ps-c">:</span><span className="ps-v">{printTime}</span></div>
            <div className="ps-kv"><span className="ps-k">User</span><span className="ps-c">:</span><span className="ps-v">{user}</span></div>
          </div>
        </div>

        {}
        <div className="ps-supplier">
          <div className="ps-sup-label">Supplier</div>
          <div className="ps-sup-line">
            <span className="ps-sup-code">{supplierCode}</span>
            <span className="ps-sup-name">{supplierName}</span>
          </div>
          <div className="ps-sup-addr">{supplierAddress || '\u00a0'}</div>
        </div>

        {}
        <table className="ps-table">
          <thead>
            <tr>
              <th className="ps-c-code">ItemCode</th>
              <th className="ps-c-des">RowItmDes</th>
              <th className="ps-c-unit">Unit</th>
              <th className="ps-c-qty">Qty</th>
              {cols.costPrice && <th className="ps-c-cost">Cost Price</th>}
              {cols.itemValue && <th className="ps-c-value">ItemValue</th>}
            </tr>
          </thead>
          <tbody>
            <tr className="ps-group">
              <td colSpan={colCount}>{poNo}</td>
            </tr>
            {rows.map((row, i) => (
              <tr key={`${row.itemCode}|${i}`}>
                <td className="ps-c-code">{row.itemCode}</td>
                <td>{row.name}</td>
                <td>{row.unit}</td>
                <td className="ps-c-qty num">{row.qty}</td>
                {cols.costPrice && <td className="ps-c-cost num">{row.costPrice}</td>}
                {cols.itemValue && <td className="ps-c-value num">{row.itemValue}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="ps-empty">No item lines on this order</td></tr>
            )}
            {cols.total && (
              <tr className="ps-total">
                <td colSpan={colCount - 1}>Total</td>
                <td className="num">{total}</td>
              </tr>
            )}
          </tbody>
        </table>

        {}
        <div className="ps-deli">
          <span className="ps-deli-k">Deli. Add</span>
          <span className="ps-deli-v">{deliAdd || '\u00a0'}</span>
        </div>
        {remarks && (
          <div className="ps-deli">
            <span className="ps-deli-k">Remarks</span>
            <span className="ps-deli-v">{remarks}</span>
          </div>
        )}

        {/* pushes the footer to the foot of the sheet — no matter how many
            lines the order has, and with no absolute positioning to disagree
            about between a browser and a headless renderer */}
        <div className="ps-grow" />

        <div className="ps-foot">
          <span>{companyName}{branch && branch !== companyName ? ` — ${branch}` : ''}</span>
          <span>Page 1 of 1</span>
          <span>{copyLabel}</span>
        </div>
      </div>
    </div>
  );
}

export const PO_PRINT_CSS = `
  /* On screen the sheet stays hidden — paper is the only place it appears. */
  .print-sheet { display:none; font-family:'Segoe UI', Arial, sans-serif; color:#000; }
  /* The frame is a column and the footer is pushed to its foot with margin-top:auto
     (not position:absolute): a browser and a headless renderer then agree on where
     the footer sits, and the frame never spills onto a second sheet of paper —
     250mm + padding + border stays inside an A4 page's printable height. */
  .print-sheet .ps-frame {
    border:1.5px solid #000; padding:8mm; min-height:250mm;
    display:flex; flex-direction:column;
  }
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
  .print-sheet .ps-foot {
    padding-top:12px; display:flex; justify-content:space-between;
    font-size:9px; color:#000;
  }

  @media print {
    .print-sheet { display:block !important; }
    /* WITH NO PAGE MARGIN THE BROWSER HAS NOWHERE TO PUT ITS OWN HEADER AND
       FOOTER, so nothing outside this sheet reaches the paper: no “9/17/26,
       11:27 AM”, no page title across the top, no “192.168.1.100:3000/… 1/1”
       at the foot. Those are the browser's own print header and footer (the
       print dialog's “Headers and footers” option), not anything this page
       draws — and the margins they are drawn in are the only lever a page has
       over them. The sheet keeps its own 10mm breathing space instead
       (padding below), which also stays clear of the printer's non-printable
       edge. */
    @page { size:A4 portrait; margin:0; }
    .print-sheet { padding:10mm; }
  }
`;
