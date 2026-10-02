// src/app/inventory/reference/modes/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Inventory → Reference → Modes
//
// One screen, three tabs — Booking Types · Payment Modes · Payment Groups —
// laid out exactly like Unit Master: a list on the left, the record's form and
// its grid on the right, Clear / Print / Delete / Save underneath.
//
// The three legacy tables differ a lot (Payment Modes alone has ten flag
// columns), so the screen is driven by a small spec per tab instead of three
// hand-written forms. What a column is called in the legacy schema is what the
// screen shows, so nothing has to be translated when somebody checks phpMyAdmin.
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import UserName from "@/components/UserName";
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import NoAccess from '@/components/NoAccess';
import AccessLoading from '@/components/AccessLoading';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */

type Kind = 'bookingType' | 'paymentMode' | 'paymentGroup';

interface Row {
  code: string;
  des: string;
  enable: boolean;
  values: Record<string, string | number | boolean | null>;
}

interface Meta {
  table: string;
  primaryKey: string;
  missingColumns: string[];
  flagDialect: Record<string, { on: string; off: string }>;
  suggestedCode: string;
  groups: { code: string; des: string; enable: boolean }[];
}

interface FieldSpec {
  col: string;
  label: string;
  flag?: boolean;
  bit?: boolean;
  hint?: string;
}

interface TabSpec {
  kind: Kind;
  tab: string;              // button label
  title: string;            // "BOOKING TYPE DETAIL"
  listTitle: string;        // left panel heading
  newLabel: string;         // "+ New Booking Type"
  descCol: string;
  descLabel: string;
  descMax: number;
  sections: { title: string; fields: FieldSpec[] }[];
  group?: { col: string; label: string };
  gridCols: string[];       // extra columns shown in the grid (after code + description)
}

const TABS: TabSpec[] = [
  {
    kind: 'bookingType',
    tab: 'Booking Types',
    title: 'BOOKING TYPE DETAIL',
    listTitle: 'Booking Types',
    newLabel: 'New Booking Type',
    descCol: 'BookingTypeDes',
    descLabel: 'Booking Type (BookingTypeDes)',
    descMax: 50,
    sections: [{ title: 'Status', fields: [{ col: 'Enabel', label: 'Enable (Enabel)', bit: true }] }],
    gridCols: ['Enabel'],
  },
  {
    kind: 'paymentMode',
    tab: 'Payment Modes',
    title: 'PAYMENT MODE DETAIL',
    listTitle: 'Payment Modes',
    newLabel: 'New Payment Mode',
    descCol: 'PayDes',
    descLabel: 'Payment Mode (PayDes)',
    descMax: 50,
    sections: [
      {
        title: 'What kind of money is this',
        fields: [
          { col: 'ZeroVal', label: 'Zero Value', flag: true, hint: 'no money changes hands' },
          { col: 'Cash', label: 'Cash', flag: true },
          { col: 'CreditCard', label: 'Credit Card', flag: true },
          { col: 'CREDIT', label: 'Credit (on account)', flag: true },
          { col: 'AdvPay', label: 'Advance Payment', flag: true },
          { col: 'COMPLEMENTRY', label: 'Complementary', flag: true },
          { col: 'Voucher', label: 'Voucher', bit: true },
        ],
      },
      {
        title: 'How it lands in the sales figures',
        fields: [
          { col: 'DoNotShowInSales', label: 'Do Not Show In Sales', flag: true },
          { col: 'ADDDIDUCTTOSALES', label: 'Add / Deduct To Sales', flag: true },
          { col: 'OneOff', label: 'One Off', flag: true },
          { col: 'Other', label: 'Other', bit: true },
        ],
      },
      {
        title: 'At the counter',
        fields: [
          { col: 'RmksNeed', label: 'Remarks Needed', flag: true },
          { col: 'Enable', label: 'Enable', bit: true },
        ],
      },
    ],
    group: { col: 'PayGroupID', label: 'Payment Group (PayGroupID)' },
    gridCols: ['Cash', 'CreditCard', 'CREDIT', 'AdvPay', 'ZeroVal', 'DoNotShowInSales', 'Enable'],
  },
  {
    kind: 'paymentGroup',
    tab: 'Payment Groups',
    title: 'PAYMENT GROUP DETAIL',
    listTitle: 'Payment Groups',
    newLabel: 'New Payment Group',
    descCol: 'PayGroup',
    descLabel: 'Payment Group (PayGroup)',
    descMax: 50,
    sections: [{ title: 'Status', fields: [{ col: 'Enable', label: 'Enable', bit: true }] }],
    gridCols: ['Enable'],
  },
];

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width:32px; height:32px; border-radius:50%; border:3px solid rgba(30,58,64,0.15); border-top-color:#1e3a40; animation:spin 0.7s linear infinite; }

  ::-webkit-scrollbar       { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  .frm-input { width:100%; border:1.5px solid #d1d9da; border-radius:8px; padding:0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937; background:#fff; outline:none;
    transition:border-color 0.15s,box-shadow 0.15s; }
  .frm-input:focus     { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:read-only { background:#f3f6f6; color:#6b7280; cursor:default; }

  .frm-select { width:100%; border:1.5px solid #d1d9da; border-radius:8px; padding:0 28px 0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937; background:#fff; outline:none; cursor:pointer;
    appearance:none; -webkit-appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 8px center; transition:border-color 0.15s,box-shadow 0.15s; }
  .frm-select:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

  .char-count { font-size:10.5px; color:#9ca3af; text-align:right; margin-top:2px; }
  .char-count.warn { color:#dc2626; font-weight:600; }

  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr { background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%); padding:9px 14px; display:flex; align-items:center; gap:8px; }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:14px; display:flex; flex-direction:column; gap:10px; }
  .frm-label { font-size:11px; font-weight:700; color:#4b5563; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; display:block; }

  .chk-row { display:flex; align-items:center; gap:8px; cursor:pointer; padding:6px 10px; border-radius:8px; transition:background 0.12s; user-select:none; }
  .chk-row:hover { background:rgba(30,58,64,0.05); }
  .chk-box { width:17px; height:17px; border-radius:4px; border:2px solid #9ca3af; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.15s; background:#fff; }
  .chk-box.checked { background:#1e3a40; border-color:#1e3a40; }
  .chk-label { font-size:13px; font-weight:500; color:#374151; }
  .chk-col { font-size:10.5px; color:#9ca3af; font-family:ui-monospace,monospace; }
  .chk-hint { font-size:10.5px; color:#6b7280; margin-left:4px; }

  .btn-save { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 24px; height:40px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none; font-family:'Inter',sans-serif; font-size:13px; font-weight:700; cursor:pointer;
    transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25); }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); }
  .btn-save:disabled { opacity:0.6; cursor:not-allowed; }
  .btn-new { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none; font-family:'Inter',sans-serif; font-size:13px;
    font-weight:700; cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2); }
  .btn-new:hover:not(:disabled)  { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }
  .btn-new:disabled { opacity:0.5; cursor:not-allowed; }
  .btn-del { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 18px; height:40px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5; font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; }
  .btn-del:hover:not(:disabled) { background:#fee2e2; border-color:#f87171; transform:translateY(-1px); }
  .btn-del:disabled { opacity:0.6; cursor:not-allowed; }
  .btn-clear { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 18px; height:40px; border-radius:9px;
    background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da; font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; }
  .btn-clear:hover:not(:disabled) { background:#e5e7eb; transform:translateY(-1px); }
  .btn-clear:disabled { opacity:0.6; cursor:not-allowed; }
  .btn-print { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 18px; height:40px; border-radius:9px;
    background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; }
  .btn-print:hover { background:#e0f2fe; transform:translateY(-1px); }
  .btn-retry { display:flex; align-items:center; justify-content:center; gap:7px; padding:0 20px; height:38px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none; font-family:'Inter',sans-serif; font-size:13px; font-weight:700; cursor:pointer; margin-top:10px; }

  .seg-wrap { display:flex; gap:4px; background:#d6e2e2; padding:4px; border-radius:10px; }
  .seg-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:8px 12px; border-radius:8px;
    border:none; background:transparent; font-family:'Inter',sans-serif; font-size:12.5px; font-weight:700; color:#4b5563;
    cursor:pointer; transition:all 0.18s; white-space:nowrap; }
  .seg-btn.active { background:#1e3a40; color:#fff; box-shadow:0 2px 6px rgba(30,58,64,0.25); }
  .seg-btn:hover:not(.active) { background:rgba(255,255,255,0.5); color:#1e3a40; }

  .srv-list-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; cursor:pointer;
    transition:background 0.12s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }

  .badge-active   { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-on       { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:rgba(30,58,64,0.08);color:#1e3a40; }
  .badge-off      { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:#f3f4f6;color:#9ca3af; }

  .grid-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .grid-table thead th { background:#d0e4e6; color:#1e3a40; font-weight:700; font-size:11.5px; padding:7px 10px; text-align:left;
    border-bottom:2px solid #b0cdd0; border-right:1px solid #c0d8da; white-space:nowrap; position:sticky; top:0; z-index:1;
    text-transform:uppercase; letter-spacing:0.04em; }
  .grid-table thead th:last-child { border-right:none; }
  .grid-table tbody tr { border-bottom:1px solid #e8f0f1; cursor:pointer; transition:background 0.1s; }
  .grid-table tbody tr:hover   { background:#f0f8f9; }
  .grid-table tbody tr.sel-row { background:#c6dfe2; }
  .grid-table tbody td { padding:7px 10px; color:#1f2937; border-right:1px solid #eef3f4; white-space:nowrap; }
  .grid-table tbody td:last-child { border-right:none; }
  .grid-table tbody td.id-col { color:#1565c0; font-weight:700; }
  .row-arrow { color:#1e3a40; font-weight:900; font-size:12px; }

  .toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 20px; border-radius:10px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#fff; box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation:fadeUp 0.25s ease both; max-width:420px; }
  .toast-success { background:#15803d; }
  .toast-error   { background:#dc2626; }
  .warn-strip { background:#fffbeb; border:1.5px solid #fde68a; color:#92400e; border-radius:10px; padding:9px 12px; font-size:12px; }

  @media(max-width:767px) {
    .left-panel { display:none !important; }
    .main-body  { padding-bottom:72px !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IBell({ s = 21 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch({ s = 15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({ s = 13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IPlus({ s = 16 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function ITrash({ s = 15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IPrint({ s = 15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function ISave({ s = 15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>; }
function IRefresh({ s = 15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>; }
function ICheck({ s = 11 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function ITag({ s = 13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }
function ISliders({ s = 13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>; }
function IWallet({ s = 13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>; }
function IGrid({ s = 13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function IAlertCircle({ s = 32 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }

const TAB_ICON: Record<Kind, React.ReactNode> = {
  bookingType: <ITag s={14} />,
  paymentMode: <IWallet s={14} />,
  paymentGroup: <IGrid s={14} />,
};

/* ─────────────────────────────────────────
   SMALL BUILDING BLOCKS
───────────────────────────────────────── */
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);
  return { toast, show };
}

function Checkbox({ checked, onChange, label, col, hint, locked }: { checked: boolean; onChange: (v: boolean) => void; label: string; col?: string; hint?: string; locked?: boolean }) {
  return (
    <div className="chk-row" style={locked ? { cursor: 'default' } : undefined}
      onClick={() => { if (!locked) onChange(!checked); }} role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={(e) => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChange(!checked); } }}>
      <div className={`chk-box ${checked ? 'checked' : ''}`} style={locked ? { opacity: 0.75 } : undefined}>{checked && <ICheck s={10} />}</div>
      <span className="chk-label">{label}</span>
      {col && <span className="chk-col">{col}</span>}
      {hint && <span className="chk-hint">— {hint}</span>}
    </div>
  );
}

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="frm-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function SectBox({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sect-box">
      <div className="sect-hdr"><span style={{ display: 'flex', color: '#fff', opacity: 0.9 }}>{icon ?? <ISliders s={14} />}</span><span className="sect-hdr-title">{title}</span></div>
      <div className="sect-body">{children}</div>
    </div>
  );
}

function EnableBadge({ v }: { v: boolean }) {
  return <span className={v ? 'badge-active' : 'badge-inactive'}>{v ? 'ENABLED' : 'DISABLED'}</span>;
}
function FlagBadge({ v }: { v: boolean | null | undefined }) {
  return <span className={v ? 'badge-on' : 'badge-off'}>{v ? 'YES' : 'NO'}</span>;
}

/* ─────────────────────────────────────────
   API
───────────────────────────────────────── */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; meta?: Meta; message?: string }> {
  try {
    const res = await fetch(url, options);
    const json = await res.json();
    return json;
  } catch {
    return { success: false, message: 'Network error — could not reach the server' };
  }
}

/* ═════════════════════════════════════════
   PAGE
═════════════════════════════════════════ */
function ModesPageContent() {
  const router = useRouter();
  const [navKey, setNavKey] = useState('inv-modes');
  const [tab, setTab] = useState<Kind>('bookingType');

  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Row | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formDes, setFormDes] = useState('');
  const [formValues, setFormValues] = useState<Record<string, boolean | string>>({});
  const [busy, setBusy] = useState(false);

  const { toast, show } = useToast();
  const access = useMyAccess();
  const canSave = !access.enforce || access.has('MODES', 'SAVE');
  const canDelete = !access.enforce || access.has('MODES', 'DELETE');
  const canClear = !access.enforce || access.has('MODES', 'CLEAR');
  const canPrint = !access.enforce || access.has('MODES', 'PRINT');

  const spec = useMemo(() => TABS.find((t) => t.kind === tab)!, [tab]);

  /* ── load a tab ─────────────────────────────────────────────────── */
  const load = useCallback(async (kind: Kind) => {
    setLoading(true);
    setLoadError(null);
    const res = await apiFetch<Row[]>(`/api/reference/modes?type=${kind}`, { cache: 'no-store' });
    if (!res.success || !Array.isArray(res.data)) {
      setRows([]);
      setLoadError(res.message ?? 'Could not read the records');
      setLoading(false);
      return;
    }
    setRows(res.data);
    setMeta(res.meta ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(tab); }, [tab, load]);

  /* ── form helpers ───────────────────────────────────────────────── */
  function blankForm(kind: Kind, nextMeta: Meta | null) {
    const s = TABS.find((t) => t.kind === kind)!;
    const values: Record<string, boolean | string> = {};
    for (const section of s.sections) {
      for (const f of section.fields) {
        /* mirrors the legacy table's own defaults: Enable = 1, the rest = 0 */
        values[f.col] = f.bit ? /^enable|enabel$/i.test(f.col) : false;
      }
    }
    if (s.group) values[s.group.col] = '0';
    setFormCode(nextMeta?.suggestedCode ?? '');
    setFormDes('');
    setFormValues(values);
    setSel(null);
    setIsNew(true);
  }

  function openRow(row: Row) {
    const values: Record<string, boolean | string> = {};
    for (const section of spec.sections) {
      for (const f of section.fields) {
        values[f.col] = f.bit ? row.values[f.col] === true : row.values[f.col] === true;
      }
    }
    if (spec.group) {
      const v = row.values[spec.group.col];
      values[spec.group.col] = v === null || v === undefined || v === '' ? '0' : String(v);
    }
    setSel(row);
    setIsNew(false);
    setFormCode(row.code);
    setFormDes(row.des);
    setFormValues(values);
  }

  function handleNew() {
    void (async () => {
      const res = await apiFetch<Row[]>(`/api/reference/modes?type=${tab}`, { cache: 'no-store' });
      blankForm(tab, res.success ? res.meta ?? meta : meta);
    })();
  }

  function handleClear() {
    if (isNew) blankForm(tab, meta);
    else if (sel) openRow(sel);
  }

  async function handleSave() {
    if (!formDes.trim()) { show(`${spec.descLabel} is required`, 'error'); return; }
    if (isNew && !formCode.trim()) { show('The code is required', 'error'); return; }

    setBusy(true);
    try {
      const values: Record<string, unknown> = { [spec.descCol]: formDes.trim() };
      for (const section of spec.sections) {
        for (const f of section.fields) values[f.col] = formValues[f.col] ?? false;
      }
      if (spec.group) values[spec.group.col] = formValues[spec.group.col] ?? '';

      const url = isNew
        ? `/api/reference/modes?type=${tab}`
        : `/api/reference/modes?type=${tab}&code=${encodeURIComponent(sel?.code ?? '')}`;
      const res = await apiFetch<{ rows: Row[] }>(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formCode.trim(), values }),
      });
      if (!res.success || !res.data) { show(res.message ?? 'Save failed', 'error'); return; }
      setRows(res.data.rows);
      if (isNew) {
        show(`${spec.tab.replace(/s$/, '')} "${formDes.trim()}" created ✓`);
        blankForm(tab, meta);   // ready for the next entry
      } else {
        const fresh = res.data.rows.find((r) => r.code === sel?.code) ?? null;
        if (fresh) openRow(fresh);
        show(`"${formDes.trim()}" saved ✓`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (isNew || !sel) { show('Select a record to delete', 'error'); return; }
    const what = spec.tab.replace(/s$/, '').toLowerCase();
    if (!confirm(`Delete ${what} "${sel.des}" (${sel.code})?`)) return;

    setBusy(true);
    try {
      let res = await apiFetch<{ rows: Row[] }>(
        `/api/reference/modes?type=${tab}&code=${encodeURIComponent(sel.code)}`,
        { method: 'DELETE' },
      );
      if (!res.success && /force=1/.test(res.message ?? '')) {
        if (!confirm(`${res.message}\n\nDelete it anyway?`)) { setBusy(false); return; }
        res = await apiFetch<{ rows: Row[] }>(
          `/api/reference/modes?type=${tab}&code=${encodeURIComponent(sel.code)}&force=1`,
          { method: 'DELETE' },
        );
      }
      if (!res.success || !res.data) { show(res.message ?? 'Delete failed', 'error'); return; }
      setRows(res.data.rows);
      blankForm(tab, meta);
      show('Record deleted');
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.code.toLowerCase().includes(q) || r.des.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const groups = meta?.groups ?? [];
  const groupCol = spec.group?.col ?? '';
  const groupDes = (code: string) => groups.find((g) => g.code === code)?.des ?? '';

  /* ── ActionBar ──────────────────────────────────────────────────── */
  const ActionBar = () => (
    !canClear && !canPrint && !canSave && !(!isNew && sel && canDelete) ? null :
    <div style={{ background: '#dce8e8', borderTop: '1.5px solid rgba(30,58,64,0.12)', padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
      {canClear && (
        <button className="btn-clear" onClick={handleClear} disabled={busy || (!isNew && !sel)}>
          <IRefresh s={14} /> Clear
        </button>
      )}
      {canPrint && (
        <button className="btn-print" onClick={() => window.print()} disabled={busy}>
          <IPrint s={14} /> Print
        </button>
      )}
      <div style={{ flex: 1 }} />
      {!isNew && sel && canDelete && (
        <button className="btn-del" onClick={() => void handleDelete()} disabled={busy}>
          <ITrash s={14} /> {busy ? 'Deleting…' : 'Delete'}
        </button>
      )}
      {canSave && (
        <button className="btn-save" onClick={() => void handleSave()} disabled={busy || (!isNew && !sel)}>
          <ISave s={14} /> {busy ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );

  /* ── the record grid (same table on every tab) ──────────────────── */
  const Grid = () => (
    <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
      <table className="grid-table">
        <thead>
          <tr>
            <th style={{ width: 22 }} />
            <th>{meta?.primaryKey ?? 'Code'}</th>
            <th>{spec.descCol}</th>
            {spec.group && <th>{spec.group.col}</th>}
            {spec.gridCols.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={3 + (spec.group ? 1 : 0) + spec.gridCols.length} style={{ textAlign: 'center', color: '#9ca3af', padding: '18px 0' }}>No records</td></tr>
          )}
          {rows.map((r) => {
            const active = sel?.code === r.code && !isNew;
            return (
              <tr key={r.code} className={active ? 'sel-row' : ''} onClick={() => openRow(r)}>
                <td><span className="row-arrow">{active ? '▶' : ''}</span></td>
                <td className="id-col">{r.code}</td>
                <td style={{ color: active ? '#1565c0' : '#1f2937', fontWeight: active ? 700 : 400 }}>{r.des}</td>
                {spec.group && (
                  <td style={{ color: '#6b7280' }}>
                    {(() => {
                      const g = String(r.values[groupCol] ?? '');
                      if (!g || g === '0') return '—';
                      const des = groupDes(g);
                      return des ? `${g} · ${des}` : g;
                    })()}
                  </td>
                )}
                {spec.gridCols.map((c) => (
                  <td key={c}>
                    {c === 'Enable' || c === 'Enabel'
                      ? <EnableBadge v={r.enable} />
                      : <FlagBadge v={r.values[c] === true} />}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const HDR = '#dae6e6';

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
        <AdminSidebar active={navKey} onNav={(key, path) => { setNavKey(key); router.push(path); }} onLogout={() => router.push('/admin-login')} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* HEADER */}
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: 0.4 }}>
                <ISearch />
              </span>
              <input
                style={{ border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 38px', height: 40, width: 260, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937', background: '#fff', outline: 'none' }}
                placeholder={`Search ${spec.listTitle.toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Inventory → Reference → Modes</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}><IBell /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}><UserName /></span>
              <IChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>S</div>
          </header>

          {/* TABS */}
          <div style={{ padding: '12px 15px 0' }}>
            <div className="seg-wrap">
              {TABS.map((t) => (
                <button key={t.kind} className={`seg-btn ${tab === t.kind ? 'active' : ''}`}
                  onClick={() => { setTab(t.kind); setSearch(''); setSel(null); setIsNew(false); }}>
                  {TAB_ICON[t.kind]} {t.tab}
                </button>
              ))}
            </div>
          </div>

          {/* BODY */}
          <div className="main-body" style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', gap: 13 }}>

            {/* LEFT LIST */}
            <div className="left-panel" style={{ width: 250, flexShrink: 0, background: '#deeaea', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(30,58,64,0.1)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>{spec.listTitle}</span>
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{rows.length} total</span>
                </div>
                {canSave && (
                  <button className="btn-new" style={{ width: '100%' }} onClick={handleNew} disabled={loading || busy}>
                    <IPlus s={14} /> {spec.newLabel}
                  </button>
                )}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {loading && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div className="spinner" /></div>}
                {!loading && loadError && (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9ca3af' }}>
                    <IAlertCircle s={28} />
                    <p style={{ fontSize: 12, marginTop: 8 }}>{loadError}</p>
                    <button className="btn-retry" onClick={() => void load(tab)}><IRefresh s={13} /> Retry</button>
                  </div>
                )}
                {!loading && !loadError && filtered.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '2rem 0' }}>
                    {rows.length === 0 ? 'No records yet' : 'No match'}
                  </p>
                )}
                {!loading && !loadError && filtered.map((r) => (
                  <button key={r.code} className={`srv-list-item ${sel?.code === r.code && !isNew ? 'active' : ''}`} onClick={() => openRow(r)}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: r.enable ? 'linear-gradient(135deg,#1e3a40,#2a5260)' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                      {TAB_ICON[tab]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.des || '(no name)'}</p>
                      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{r.code}</p>
                      <EnableBadge v={r.enable} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ background: '#1e3a40', borderRadius: '12px 12px 0 0', padding: '14px 18px', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {isNew ? `New ${spec.tab.replace(/s$/, '').toLowerCase()}` : sel ? `Edit ${spec.tab.replace(/s$/, '').toLowerCase()}` : 'No record selected'}
                </p>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 2 }}>{spec.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, marginTop: 3 }}>
                  {isNew
                    ? 'Type a name and Save — the code is filled in for you (you may change it before saving).'
                    : sel ? `Editing ${sel.code} in ${meta?.table ?? 'the table'}` : 'Pick a record on the left, or press the New button.'}
                </p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 13, background: '#e8f0f1' }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}><div className="spinner" /></div>
                ) : !sel && !isNew ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af' }}>
                    <ITag s={40} />
                    <p style={{ fontSize: 13, marginTop: 10 }}>Select a record, or create a new one</p>
                  </div>
                ) : (
                  <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

                    {meta?.missingColumns && meta.missingColumns.length > 0 && (
                      <div className="warn-strip">
                        This database&apos;s <b>{meta.table}</b> has no {meta.missingColumns.join(', ')} column(s) —
                        those ticks are hidden and left untouched on save.
                      </div>
                    )}

                    <SectBox title="Identification" icon={<ITag s={14} />}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                        <FieldRow label={`Code (${meta?.primaryKey ?? 'code'})`} htmlFor="mode-code">
                          <input id="mode-code" className="frm-input" value={formCode} readOnly={!isNew}
                            maxLength={10} onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                            placeholder={isNew ? 'Enter code' : ''} />
                        </FieldRow>
                        <FieldRow label={`${spec.descLabel} *`} htmlFor="mode-des">
                          <input id="mode-des" className="frm-input" value={formDes} maxLength={spec.descMax} readOnly={!canSave}
                            onChange={(e) => setFormDes(e.target.value)}
                            placeholder={spec.kind === 'paymentMode' ? 'e.g. CASH' : spec.kind === 'paymentGroup' ? 'e.g. CARD PAYMENTS' : 'e.g. WALK-IN'} />
                        </FieldRow>
                      </div>
                      <span className={`char-count ${formDes.length >= spec.descMax ? 'warn' : ''}`}>{formDes.length} / {spec.descMax}</span>
                      {isNew && (
                        <p style={{ fontSize: 11, color: '#6b7280' }}>
                          {formCode ? `Will be saved as ${formCode}` : 'The code is generated automatically'} — the code never changes afterwards.
                        </p>
                      )}
                    </SectBox>

                    {spec.group && (
                      <SectBox title="Grouping" icon={<IGrid s={14} />}>
                        <FieldRow label={spec.group.label} htmlFor="mode-group">
                          <select id="mode-group" className="frm-select" disabled={!canSave}
                            value={String(formValues[groupCol] ?? '0')}
                            onChange={(e) => setFormValues((p) => ({ ...p, [groupCol]: e.target.value }))}>
                            <option value="0">0 — not grouped</option>
                            {groups.map((g) => (
                              <option key={g.code} value={g.code}>{g.code} — {g.des}{g.enable ? '' : ' (disabled)'}</option>
                            ))}
                          </select>
                        </FieldRow>
                        {String(formValues[groupCol] ?? '0') !== '0' && (
                          <p style={{ fontSize: 11, color: '#6b7280' }}>
                            Group: <b>{groupDes(String(formValues[groupCol])) || '(no name)'}</b>
                          </p>
                        )}
                      </SectBox>
                    )}

                    {spec.sections.map((section) => (
                      <SectBox key={section.title} title={section.title}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {section.fields.map((f) => (
                            <Checkbox
                              key={f.col}
                              label={f.label}
                              col={f.col}
                              hint={f.hint}
                              checked={formValues[f.col] === true}
                              locked={!canSave}
                              onChange={(v) => setFormValues((p) => ({ ...p, [f.col]: v }))}
                            />
                          ))}
                        </div>
                      </SectBox>
                    ))}

                    <SectBox title={`All ${spec.listTitle}`} icon={<IGrid s={14} />}>
                      <Grid />
                    </SectBox>
                  </div>
                )}
              </div>

              <ActionBar />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ModesPage() {
  const access = useMyAccess();
  if (!access.loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4' }}>
        <AccessLoading />
      </div>
    );
  }
  if (access.enforce && !(access.has('INV', 'ACCESS') && access.has('INVREF', 'ACCESS') && access.has('MODES', 'ACCESS'))) {
    return <NoAccess screen="Modes" />;
  }
  return <ModesPageContent />;
}
