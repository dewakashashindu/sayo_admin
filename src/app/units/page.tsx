// app/admin/units/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES — matches DB tables exactly
───────────────────────────────────────── */
interface MasterUnit {
  MasterUnitID: string;
  UnitDes: string;
  Enable: boolean;
}

interface SubUnit {
  SubUnitID: string;
  SubUnitDes: string;
  Enable: boolean;
}

interface UnitConversion {
  MasterUnitID: string;
  SubUnitID: string;
  NoOfUnits: number;
  Enable: boolean;
}

type Section = 'master' | 'sub' | 'conversion';

/* ─────────────────────────────────────────
   API HELPERS — single consolidated route
───────────────────────────────────────── */
const API_BASE   = '/api/units';
const API_MASTER = `${API_BASE}?type=master`;
const API_SUB    = `${API_BASE}?type=sub`;
const API_CONV   = `${API_BASE}?type=conversion`;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const json = await res.json();
    return json;
  } catch {
    return { success: false, message: 'Network error — could not reach server' };
  }
}

/* ─────────────────────────────────────────
   PAGE CSS
───────────────────────────────────────── */
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width:32px; height:32px; border-radius:50%;
    border:3px solid rgba(30,58,64,0.15);
    border-top-color:#1e3a40;
    animation:spin 0.7s linear infinite;
  }

  ::-webkit-scrollbar       { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  .frm-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-input:focus     { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:read-only { background:#f3f6f6; color:#6b7280; cursor:default; }

  .frm-select {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 28px 0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;
    appearance:none; -webkit-appearance:none; outline:none; cursor:pointer;
    transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-select:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-select:disabled { background-color:#f3f6f6; color:#9ca3af; cursor:not-allowed; }

  .char-count { font-size:10.5px; color:#9ca3af; text-align:right; margin-top:2px; }
  .char-count.warn { color:#dc2626; font-weight:600; }

  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:9px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:14px; display:flex; flex-direction:column; gap:10px; }

  .frm-label {
    font-size:11px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.05em;
    margin-bottom:4px; display:block;
  }

  .chk-row {
    display:flex; align-items:center; gap:8px; cursor:pointer;
    padding:7px 10px; border-radius:8px; transition:background 0.12s; user-select:none;
  }
  .chk-row:hover { background:rgba(30,58,64,0.05); }
  .chk-box {
    width:17px; height:17px; border-radius:4px; border:2px solid #9ca3af;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:all 0.15s; background:#fff;
  }
  .chk-box.checked { background:#1e3a40; border-color:#1e3a40; }
  .chk-label { font-size:13px; font-weight:500; color:#374151; }

  .btn-save {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 24px; height:40px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25);
  }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); box-shadow:0 4px 14px rgba(30,58,64,0.35); }
  .btn-save:disabled { opacity:0.6; cursor:not-allowed; }

  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover:not(:disabled)  { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }
  .btn-new:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

  .btn-del {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-del:hover:not(:disabled) { background:#fee2e2; border-color:#f87171; transform:translateY(-1px); }
  .btn-del:disabled { opacity:0.6; cursor:not-allowed; }

  .btn-clear {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-clear:hover:not(:disabled) { background:#e5e7eb; transform:translateY(-1px); }
  .btn-clear:disabled { opacity:0.6; cursor:not-allowed; }

  .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-print:hover { background:#e0f2fe; transform:translateY(-1px); }

  .btn-retry {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 20px; height:38px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; margin-top:10px;
  }
  .btn-retry:hover { background:#162e34; }

  /* ── Segmented Switch ── */
  .seg-wrap { display:flex; gap:4px; background:#d6e2e2; padding:4px; border-radius:10px; }
  .seg-btn {
    flex:1; display:flex; align-items:center; justify-content:center; gap:6px;
    padding:8px 12px; border-radius:8px; border:none; background:transparent;
    font-family:'Inter',sans-serif; font-size:12.5px; font-weight:700; color:#4b5563;
    cursor:pointer; transition:all 0.18s; white-space:nowrap;
  }
  .seg-btn.active             { background:#1e3a40; color:#fff; box-shadow:0 2px 6px rgba(30,58,64,0.25); }
  .seg-btn:hover:not(.active) { background:rgba(255,255,255,0.5); color:#1e3a40; }

  .srv-list-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s; border:none;
    background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }

  .badge-active   { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-conv     { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:rgba(30,58,64,0.08);color:#1e3a40; }

  .grid-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .grid-table thead th {
    background:#d0e4e6; color:#1e3a40; font-weight:700; font-size:11.5px;
    padding:7px 10px; text-align:left; border-bottom:2px solid #b0cdd0;
    border-right:1px solid #c0d8da; white-space:nowrap;
    position:sticky; top:0; z-index:1; text-transform:uppercase; letter-spacing:0.04em;
  }
  .grid-table thead th:last-child { border-right:none; }
  .grid-table tbody tr { border-bottom:1px solid #e8f0f1; cursor:pointer; transition:background 0.1s; }
  .grid-table tbody tr:hover   { background:#f0f8f9; }
  .grid-table tbody tr.sel-row { background:#c6dfe2; }
  .grid-table tbody td { padding:7px 10px; color:#1f2937; border-right:1px solid #eef3f4; }
  .grid-table tbody td:last-child { border-right:none; }
  .grid-table tbody td.id-col  { color:#1565c0; font-weight:700; }
  .grid-table tbody td.num-col { color:#1e3a40; font-weight:700; text-align:right; }
  .row-arrow { color:#1e3a40; font-weight:900; font-size:12px; }

  .toast {
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:12px 20px; border-radius:10px; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:600; color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation:fadeUp 0.25s ease both; max-width:360px;
  }
  .toast-success { background:#15803d; }
  .toast-error   { background:#dc2626; }

  @media(max-width:767px) {
    .left-panel { display:none !important; }
    .main-body  { padding-bottom:72px !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IBell({ s=21 }: { s?: number })    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch({ s=15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({ s=13 }: { s?: number })  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IPlus({ s=16 }: { s?: number })   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function ITrash({ s=15 }: { s?: number })  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IPrint({ s=15 }: { s?: number })  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function ISave({ s=15 }: { s?: number })   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>; }
function IRefresh({ s=15 }: { s?: number }){ return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>; }
function ICheck({ s=11 }: { s?: number })  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function ITag({ s=13 }: { s?: number })    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }
function ILayers({ s=13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
function IArrows({ s=13 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>; }
function IAlertCircle({ s=32 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }

/* ─────────────────────────────────────────
   TOAST HOOK
───────────────────────────────────────── */
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}

/* ─────────────────────────────────────────
   REUSABLE COMPONENTS
───────────────────────────────────────── */
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="chk-row" onClick={() => onChange(!checked)} role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}>
      <div className={`chk-box ${checked ? 'checked' : ''}`}>{checked && <ICheck s={10} />}</div>
      <span className="chk-label">{label}</span>
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
      <div className="sect-hdr">
        {icon && <span style={{ color: 'rgba(255,255,255,0.7)' }}>{icon}</span>}
        <span className="sect-hdr-title">{title}</span>
      </div>
      <div className="sect-body">{children}</div>
    </div>
  );
}

function EnableBadge({ v }: { v: boolean }) {
  return <span className={v ? 'badge-active' : 'badge-inactive'}>{v ? 'Active' : 'Inactive'}</span>;
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function UnitsPage() {
  const router  = useRouter();
  const [navKey,  setNavKey]  = useState('units');
  const [section, setSection] = useState<Section>('master');
  const [search,  setSearch]  = useState('');
  const { toast, show: showToast } = useToast();

  const MAX_DES = 50;

  /* ══ MASTER UNIT state ══ */
  const [masters,    setMasters]    = useState<MasterUnit[]>([]);
  const [selMaster,  setSelMaster]  = useState<MasterUnit | null>(null);
  const [isNewM,     setIsNewM]     = useState(false);
  const [loadingM,   setLoadingM]   = useState(true);
  const [errorM,     setErrorM]     = useState<string | null>(null);
  const [savingM,    setSavingM]    = useState(false);
  const [deletingM,  setDeletingM]  = useState(false);
  const [fMasterID,  setFMasterID]  = useState('');
  const [fUnitDes,   setFUnitDes]   = useState('');
  const [fMEnable,   setFMEnable]   = useState(true);

  /* ══ SUB UNIT state ══ */
  const [subs,      setSubs]      = useState<SubUnit[]>([]);
  const [selSub,    setSelSub]    = useState<SubUnit | null>(null);
  const [isNewS,    setIsNewS]    = useState(false);
  const [loadingS,  setLoadingS]  = useState(true);
  const [errorS,    setErrorS]    = useState<string | null>(null);
  const [savingS,   setSavingS]   = useState(false);
  const [deletingS, setDeletingS] = useState(false);
  const [fSubID,    setFSubID]    = useState('');
  const [fSubDes,   setFSubDes]   = useState('');
  const [fSEnable,  setFSEnable]  = useState(true);

  /* ══ CONVERSION state ══ */
  const [convs,      setConvs]      = useState<UnitConversion[]>([]);
  const [selConv,    setSelConv]    = useState<UnitConversion | null>(null);
  const [isNewC,     setIsNewC]     = useState(false);
  const [loadingC,   setLoadingC]   = useState(true);
  const [errorC,     setErrorC]     = useState<string | null>(null);
  const [savingC,    setSavingC]    = useState(false);
  const [deletingC,  setDeletingC]  = useState(false);
  const [fCMasterID, setFCMasterID] = useState('');
  const [fCSubID,    setFCSubID]    = useState('');
  const [fCUnits,    setFCUnits]    = useState(0);
  const [fCEnable,   setFCEnable]   = useState(true);

  /* ── helpers ── */
  const masterDes = (id: string) => masters.find((m) => m.MasterUnitID === id)?.UnitDes ?? id;
  const subDes    = (id: string) => subs.find((s) => s.SubUnitID === id)?.SubUnitDes ?? id;

  /* ════════════════════════════════════════
     FETCH — real data on mount
  ════════════════════════════════════════ */
  const fetchMasters = useCallback(async () => {
    setLoadingM(true); setErrorM(null);
    const res = await apiFetch<MasterUnit[]>(API_MASTER);
    if (res.success && res.data) {
      setMasters(res.data);
      if (res.data.length > 0) loadMasterForm(res.data[0]);
    } else {
      setErrorM(res.message ?? 'Failed to load master units');
    }
    setLoadingM(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSubs = useCallback(async () => {
    setLoadingS(true); setErrorS(null);
    const res = await apiFetch<SubUnit[]>(API_SUB);
    if (res.success && res.data) {
      setSubs(res.data);
      if (res.data.length > 0) loadSubForm(res.data[0]);
    } else {
      setErrorS(res.message ?? 'Failed to load sub units');
    }
    setLoadingS(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConvs = useCallback(async () => {
    setLoadingC(true); setErrorC(null);
    const res = await apiFetch<UnitConversion[]>(API_CONV);
    if (res.success && res.data) {
      setConvs(res.data);
      if (res.data.length > 0) loadConvForm(res.data[0]);
    } else {
      setErrorC(res.message ?? 'Failed to load conversions');
    }
    setLoadingC(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchMasters();
    fetchSubs();
    fetchConvs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── filtered lists ── */
  const filteredMasters = useMemo(() =>
    masters.filter((m) =>
      m.UnitDes.toLowerCase().includes(search.toLowerCase()) ||
      m.MasterUnitID.toLowerCase().includes(search.toLowerCase())
    ), [masters, search]);

  const filteredSubs = useMemo(() =>
    subs.filter((s) =>
      s.SubUnitDes.toLowerCase().includes(search.toLowerCase()) ||
      s.SubUnitID.toLowerCase().includes(search.toLowerCase())
    ), [subs, search]);

  const filteredConvs = useMemo(() =>
    convs.filter((c) =>
      masterDes(c.MasterUnitID).toLowerCase().includes(search.toLowerCase()) ||
      subDes(c.SubUnitID).toLowerCase().includes(search.toLowerCase())
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convs, search, masters, subs]);

  /* ═══════════════════════════════════════
     MASTER UNIT HANDLERS
  ═══════════════════════════════════════ */
  function loadMasterForm(m: MasterUnit) {
    setSelMaster(m); setIsNewM(false);
    setFMasterID(m.MasterUnitID);
    setFUnitDes(m.UnitDes);
    setFMEnable(m.Enable);
  }
  function handleSelectMaster(m: MasterUnit) { loadMasterForm(m); }
  function handleNewMaster() {
    setFMasterID('(auto-generated)');
    setFUnitDes(''); setFMEnable(true);
    setSelMaster(null); setIsNewM(true);
  }
  async function handleSaveMaster() {
    const trimmed = fUnitDes.trim();
    if (!trimmed) { showToast('Unit Description is required', 'error'); return; }
    if (trimmed.length > MAX_DES) { showToast(`Description must be ≤ ${MAX_DES} characters`, 'error'); return; }

    setSavingM(true);
    try {
      if (isNewM) {
        const res = await apiFetch<MasterUnit>(API_MASTER, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitDes: trimmed, enable: fMEnable }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Save failed', 'error'); return; }
        setMasters((p) => [...p, res.data!].sort((a, b) => a.MasterUnitID.localeCompare(b.MasterUnitID)));
        loadMasterForm(res.data);
        showToast(`Master unit "${res.data.UnitDes}" created ✓`);
      } else {
        const res = await apiFetch<MasterUnit>(API_MASTER, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterUnitID: fMasterID, unitDes: trimmed, enable: fMEnable }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Update failed', 'error'); return; }
        setMasters((p) => p.map((m) => m.MasterUnitID === fMasterID ? res.data! : m));
        loadMasterForm(res.data);
        showToast(`Master unit "${res.data.UnitDes}" updated ✓`);
      }
    } finally {
      setSavingM(false);
    }
  }
  async function handleDeleteMaster() {
    if (!selMaster) { showToast('Select a row to delete', 'error'); return; }
    if (!confirm(`Delete "${selMaster.UnitDes}"?`)) return;

    setDeletingM(true);
    try {
      const res = await apiFetch(`${API_MASTER}&masterUnitID=${encodeURIComponent(selMaster.MasterUnitID)}`, { method: 'DELETE' });
      if (!res.success) { showToast(res.message ?? 'Delete failed', 'error'); return; }
      const remaining = masters.filter((m) => m.MasterUnitID !== selMaster.MasterUnitID);
      setMasters(remaining);
      if (remaining.length) { loadMasterForm(remaining[0]); }
      else { setSelMaster(null); setFMasterID(''); setFUnitDes(''); setFMEnable(true); setIsNewM(false); }
      showToast('Master unit deleted');
    } finally {
      setDeletingM(false);
    }
  }
  function handleClearMaster() {
    if (isNewM) { setFUnitDes(''); setFMEnable(true); }
    else if (selMaster) { setFUnitDes(selMaster.UnitDes); setFMEnable(selMaster.Enable); }
  }

  /* ═══════════════════════════════════════
     SUB UNIT HANDLERS
  ═══════════════════════════════════════ */
  function loadSubForm(s: SubUnit) {
    setSelSub(s); setIsNewS(false);
    setFSubID(s.SubUnitID); setFSubDes(s.SubUnitDes); setFSEnable(s.Enable);
  }
  function handleSelectSub(s: SubUnit) { loadSubForm(s); }
  function handleNewSub() {
    setFSubID('(auto-generated)');
    setFSubDes(''); setFSEnable(true);
    setSelSub(null); setIsNewS(true);
  }
  async function handleSaveSub() {
    const trimmed = fSubDes.trim();
    if (!trimmed) { showToast('Sub Unit Description is required', 'error'); return; }
    if (trimmed.length > MAX_DES) { showToast(`Description must be ≤ ${MAX_DES} characters`, 'error'); return; }

    setSavingS(true);
    try {
      if (isNewS) {
        const res = await apiFetch<SubUnit>(API_SUB, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subUnitDes: trimmed, enable: fSEnable }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Save failed', 'error'); return; }
        setSubs((p) => [...p, res.data!].sort((a, b) => a.SubUnitID.localeCompare(b.SubUnitID)));
        loadSubForm(res.data);
        showToast(`Sub unit "${res.data.SubUnitDes}" created ✓`);
      } else {
        const res = await apiFetch<SubUnit>(API_SUB, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subUnitID: fSubID, subUnitDes: trimmed, enable: fSEnable }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Update failed', 'error'); return; }
        setSubs((p) => p.map((s) => s.SubUnitID === fSubID ? res.data! : s));
        loadSubForm(res.data);
        showToast(`Sub unit "${res.data.SubUnitDes}" updated ✓`);
      }
    } finally {
      setSavingS(false);
    }
  }
  async function handleDeleteSub() {
    if (!selSub) { showToast('Select a row to delete', 'error'); return; }
    if (!confirm(`Delete "${selSub.SubUnitDes}"?`)) return;

    setDeletingS(true);
    try {
      const res = await apiFetch(`${API_SUB}&subUnitID=${encodeURIComponent(selSub.SubUnitID)}`, { method: 'DELETE' });
      if (!res.success) { showToast(res.message ?? 'Delete failed', 'error'); return; }
      const remaining = subs.filter((s) => s.SubUnitID !== selSub.SubUnitID);
      setSubs(remaining);
      if (remaining.length) { loadSubForm(remaining[0]); }
      else { setSelSub(null); setFSubID(''); setFSubDes(''); setFSEnable(true); setIsNewS(false); }
      showToast('Sub unit deleted');
    } finally {
      setDeletingS(false);
    }
  }
  function handleClearSub() {
    if (isNewS) { setFSubDes(''); setFSEnable(true); }
    else if (selSub) { setFSubDes(selSub.SubUnitDes); setFSEnable(selSub.Enable); }
  }

  /* ═══════════════════════════════════════
     CONVERSION HANDLERS
  ═══════════════════════════════════════ */
  function loadConvForm(c: UnitConversion) {
    setSelConv(c); setIsNewC(false);
    setFCMasterID(c.MasterUnitID); setFCSubID(c.SubUnitID);
    setFCUnits(c.NoOfUnits); setFCEnable(c.Enable);
  }
  function handleSelectConv(c: UnitConversion) { loadConvForm(c); }
  function handleNewConv() {
    setFCMasterID(masters[0]?.MasterUnitID ?? '');
    setFCSubID(subs[0]?.SubUnitID ?? '');
    setFCUnits(0); setFCEnable(true);
    setSelConv(null); setIsNewC(true);
  }
  async function handleSaveConv() {
    if (!fCMasterID || !fCSubID) { showToast('Master Unit and Sub Unit are required', 'error'); return; }
    if (fCUnits <= 0) { showToast('No. of Units must be greater than 0', 'error'); return; }

    setSavingC(true);
    try {
      if (isNewC) {
        const res = await apiFetch<UnitConversion>(API_CONV, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            masterUnitID: fCMasterID,
            subUnitID: fCSubID,
            noOfUnits: fCUnits,
            enable: fCEnable,
          }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Save failed', 'error'); return; }
        setConvs((p) => [...p, res.data!]);
        loadConvForm(res.data);
        showToast('Conversion created ✓');
      } else {
        const res = await apiFetch<UnitConversion>(API_CONV, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentMasterUnitID: selConv?.MasterUnitID,
            currentSubUnitID: selConv?.SubUnitID,
            masterUnitID: fCMasterID,
            subUnitID: fCSubID,
            noOfUnits: fCUnits,
            enable: fCEnable,
          }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Update failed', 'error'); return; }
        setConvs((p) => p.map((c) =>
          c.MasterUnitID === selConv?.MasterUnitID && c.SubUnitID === selConv?.SubUnitID ? res.data! : c
        ));
        loadConvForm(res.data);
        showToast('Conversion updated ✓');
      }
    } finally {
      setSavingC(false);
    }
  }
  async function handleDeleteConv() {
    if (!selConv) { showToast('Select a row to delete', 'error'); return; }
    if (!confirm(`Delete ${masterDes(selConv.MasterUnitID)} → ${subDes(selConv.SubUnitID)}?`)) return;

    setDeletingC(true);
    try {
      const res = await apiFetch(
        `${API_CONV}&masterUnitID=${encodeURIComponent(selConv.MasterUnitID)}&subUnitID=${encodeURIComponent(selConv.SubUnitID)}`,
        { method: 'DELETE' },
      );
      if (!res.success) { showToast(res.message ?? 'Delete failed', 'error'); return; }
      const remaining = convs.filter((c) => !(c.MasterUnitID === selConv.MasterUnitID && c.SubUnitID === selConv.SubUnitID));
      setConvs(remaining);
      if (remaining.length) { loadConvForm(remaining[0]); }
      else { setSelConv(null); setFCMasterID(''); setFCSubID(''); setFCUnits(0); setFCEnable(true); setIsNewC(false); }
      showToast('Conversion deleted');
    } finally {
      setDeletingC(false);
    }
  }
  function handleClearConv() {
    if (isNewC) {
      setFCMasterID(masters[0]?.MasterUnitID ?? ''); setFCSubID(subs[0]?.SubUnitID ?? '');
      setFCUnits(0); setFCEnable(true);
    } else if (selConv) {
      setFCMasterID(selConv.MasterUnitID); setFCSubID(selConv.SubUnitID);
      setFCUnits(selConv.NoOfUnits); setFCEnable(selConv.Enable);
    }
  }

  /* ── Navigation ── */
  function handleNavigate(key: string, path: string) { setNavKey(key); router.push(path); }
  function handleLogout() { router.push('/admin/login'); }

  function switchSection(next: Section) {
    if (next === section) return;
    setSection(next); setSearch('');
  }

  const HDR = '#dae6e6';

  /* ── Shared ActionBar ── */
  function ActionBar({
    onClear, onDelete, onSave, isNew, saving, deleting, canAct,
  }: {
    onClear: () => void; onDelete: () => void; onSave: () => void;
    isNew: boolean; saving: boolean; deleting: boolean; canAct: boolean;
  }) {
    return (
      <div style={{ background:'#dce8e8', borderTop:'1.5px solid rgba(30,58,64,0.12)', padding:'12px 16px', display:'flex', gap:10, flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
        <button className="btn-clear" onClick={onClear} disabled={saving || deleting || !canAct}><IRefresh s={14}/> Clear</button>
        <button className="btn-print" onClick={() => window.print()}><IPrint s={14}/> Print</button>
        <div style={{ flex:1 }}/>
        {!isNew && canAct && (
          <button className="btn-del" onClick={onDelete} disabled={saving || deleting}>
            <ITrash s={14}/> {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <button className="btn-save" onClick={onSave} disabled={saving || deleting || !canAct}>
          <ISave s={14}/> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  }

  /* ── Loading/Error state for left list ── */
  function ListState({ loading, error, onRetry, empty }: { loading: boolean; error: string | null; onRetry: () => void; empty: boolean }) {
    if (loading) {
      return <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div className="spinner" /></div>;
    }
    if (error) {
      return (
        <div style={{ textAlign:'center', padding:'2rem 1rem', color:'#9ca3af' }}>
          <IAlertCircle s={28} />
          <p style={{ fontSize:12, marginTop:8 }}>{error}</p>
          <button className="btn-retry" onClick={onRetry}><IRefresh s={13}/> Retry</button>
        </div>
      );
    }
    if (empty) {
      return <p style={{ textAlign:'center', color:'#9ca3af', fontSize:12, padding:'2rem 0' }}>No records found</p>;
    }
    return null;
  }

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.msg}
        </div>
      )}

      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#c2d4d4' }}>

        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>

          {/* HEADER */}
          <header style={{ background:HDR, height:56, flexShrink:0, display:'flex', alignItems:'center', padding:'0 18px', gap:12, borderBottom:'1px solid rgba(0,0,0,0.06)', zIndex:10 }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center', pointerEvents:'none', opacity:0.4 }}>
                <ISearch/>
              </span>
              <input
                style={{ border:'1.5px solid #c0cbcc', borderRadius:10, padding:'0 14px 0 38px', height:40, width:260, fontFamily:"'Inter',sans-serif", fontSize:14, color:'#1f2937', background:'#fff', outline:'none' }}
                placeholder={section==='master'?'Search master units…':section==='sub'?'Search sub units…':'Search conversions…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex:1 }}/>
            <button style={{ background:'none', border:'none', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', padding:4, borderRadius:8 }}><IBell/></button>
            <div style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
              <span style={{ fontSize:14, fontWeight:500, color:'#1f2937' }}>MR. SAYO</span>
              <IChevD/>
            </div>
            <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#5a8a92,#3a6a72)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', flexShrink:0 }}>S</div>
          </header>

          {/* SEGMENTED SWITCH */}
          <div style={{ padding:'12px 15px 0' }}>
            <div className="seg-wrap">
              <button className={`seg-btn ${section==='master'?'active':''}`} onClick={()=>switchSection('master')}><ITag s={14}/> Master Units</button>
              <button className={`seg-btn ${section==='sub'?'active':''}`} onClick={()=>switchSection('sub')}><ILayers s={14}/> Sub Units</button>
              <button className={`seg-btn ${section==='conversion'?'active':''}`} onClick={()=>switchSection('conversion')}><IArrows s={14}/> Unit Conversion</button>
            </div>
          </div>

          {/* BODY */}
          <div className="main-body" style={{ flex:1, overflow:'hidden', padding:'13px 15px', display:'flex', gap:13 }}>

            {/* ══════════════════════════════════
                MASTER UNIT
            ══════════════════════════════════ */}
            {section === 'master' && (
              <>
                <div className="left-panel" style={{ width:250, flexShrink:0, background:'#deeaea', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
                  <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid rgba(30,58,64,0.1)', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#1e3a40' }}>Master Units</span>
                      <span style={{ fontSize:11, color:'#6b7280', fontWeight:500 }}>{masters.length} total</span>
                    </div>
                    <button className="btn-new" style={{ width:'100%' }} onClick={handleNewMaster} disabled={loadingM}>
                      <IPlus s={14}/> New Master Unit
                    </button>
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                    <ListState loading={loadingM} error={errorM} onRetry={fetchMasters} empty={filteredMasters.length === 0} />
                    {!loadingM && !errorM && filteredMasters.map((m) => (
                      <button
                        key={m.MasterUnitID}
                        className={`srv-list-item ${selMaster?.MasterUnitID===m.MasterUnitID&&!isNewM?'active':''}`}
                        onClick={() => handleSelectMaster(m)}
                      >
                        <div style={{ width:36, height:36, borderRadius:9, background:m.Enable?'linear-gradient(135deg,#1e3a40,#2a5260)':'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff' }}>
                          <ITag s={16}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:'#1e3a40', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.UnitDes||'(no name)'}</p>
                          <p style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>{m.MasterUnitID}</p>
                          <EnableBadge v={m.Enable}/>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                  <div style={{ background:'#1e3a40', borderRadius:'12px 12px 0 0', padding:'14px 18px', flexShrink:0 }}>
                    <p style={{ color:'rgba(255,255,255,0.55)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                      {isNewM ? 'New Master Unit' : selMaster ? 'Edit Master Unit' : 'No Unit Selected'}
                    </p>
                    <p style={{ color:'#fff', fontSize:18, fontWeight:800, marginTop:2 }}>UNIT MASTER DETAIL</p>
                  </div>

                  <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:13, background:'#e8f0f1' }}>
                    {loadingM ? (
                      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', flex:1 }}><div className="spinner" /></div>
                    ) : !selMaster && !isNewM ? (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'#9ca3af' }}>
                        <ITag s={40} />
                        <p style={{ fontSize:13, marginTop:10 }}>Select a master unit, or create a new one</p>
                      </div>
                    ) : (
                      <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:13 }}>

                        <SectBox title="Unit Identification" icon={<ITag s={14}/>}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
                            <FieldRow label="Unit Code (MasterUnitID)" htmlFor="mu-id">
                              <input id="mu-id" className="frm-input" value={fMasterID} readOnly/>
                            </FieldRow>
                            <FieldRow label="Unit Description (UnitDes) *" htmlFor="mu-des">
                              <input id="mu-des" className="frm-input" value={fUnitDes} maxLength={MAX_DES}
                                onChange={(e)=>setFUnitDes(e.target.value)}
                                placeholder="e.g. KILOGRAM"/>
                            </FieldRow>
                          </div>
                          <span className={`char-count ${fUnitDes.length >= MAX_DES ? 'warn' : ''}`}>{fUnitDes.length} / {MAX_DES}</span>
                        </SectBox>

                        <SectBox title="Status">
                          <Checkbox checked={fMEnable} onChange={setFMEnable} label="Enable"/>
                        </SectBox>

                        <SectBox title="Master Unit Detail" icon={<ITag s={14}/>}>
                          <div style={{ overflowX:'auto', maxHeight:220, overflowY:'auto' }}>
                            <table className="grid-table">
                              <thead>
                                <tr>
                                  <th style={{ width:22 }}></th>
                                  <th>UnitID</th>
                                  <th>UnitDes</th>
                                  <th>Enable</th>
                                </tr>
                              </thead>
                              <tbody>
                                {masters.length === 0 && (
                                  <tr><td colSpan={4} style={{ textAlign:'center', color:'#9ca3af', padding:'18px 0' }}>No records</td></tr>
                                )}
                                {masters.map((m) => {
                                  const sel = selMaster?.MasterUnitID===m.MasterUnitID && !isNewM;
                                  return (
                                    <tr key={m.MasterUnitID} className={sel?'sel-row':''} onClick={()=>handleSelectMaster(m)}>
                                      <td><span className="row-arrow">{sel?'▶':''}</span></td>
                                      <td className="id-col">{m.MasterUnitID}</td>
                                      <td style={{ color:sel?'#1565c0':'#1f2937', fontWeight:sel?700:400 }}>{m.UnitDes}</td>
                                      <td><EnableBadge v={m.Enable}/></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </SectBox>

                        <SectBox title="Used In Conversions" icon={<IArrows s={14}/>}>
                          {convs.filter((c)=>c.MasterUnitID===fMasterID).length===0
                            ? <p style={{ fontSize:12, color:'#9ca3af' }}>No conversion mappings yet.</p>
                            : <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                                {convs.filter((c)=>c.MasterUnitID===fMasterID).map((c,i)=>(
                                  <span key={i} className="badge-conv">
                                    1 {masterDes(c.MasterUnitID)} = {c.NoOfUnits} {subDes(c.SubUnitID)}
                                  </span>
                                ))}
                              </div>
                          }
                        </SectBox>
                      </div>
                    )}
                  </div>

                  <ActionBar
                    onClear={handleClearMaster} onDelete={handleDeleteMaster} onSave={handleSaveMaster}
                    isNew={isNewM} saving={savingM} deleting={deletingM} canAct={!!selMaster || isNewM}
                  />
                </div>
              </>
            )}

            {/* ══════════════════════════════════
                SUB UNIT
            ══════════════════════════════════ */}
            {section === 'sub' && (
              <>
                <div className="left-panel" style={{ width:250, flexShrink:0, background:'#deeaea', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
                  <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid rgba(30,58,64,0.1)', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#1e3a40' }}>Sub Units</span>
                      <span style={{ fontSize:11, color:'#6b7280', fontWeight:500 }}>{subs.length} total</span>
                    </div>
                    <button className="btn-new" style={{ width:'100%' }} onClick={handleNewSub} disabled={loadingS}>
                      <IPlus s={14}/> New Sub Unit
                    </button>
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                    <ListState loading={loadingS} error={errorS} onRetry={fetchSubs} empty={filteredSubs.length === 0} />
                    {!loadingS && !errorS && filteredSubs.map((s) => (
                      <button
                        key={s.SubUnitID}
                        className={`srv-list-item ${selSub?.SubUnitID===s.SubUnitID&&!isNewS?'active':''}`}
                        onClick={() => handleSelectSub(s)}
                      >
                        <div style={{ width:36, height:36, borderRadius:9, background:s.Enable?'linear-gradient(135deg,#1e3a40,#2a5260)':'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff' }}>
                          <ILayers s={16}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:'#1e3a40', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.SubUnitDes||'(no name)'}</p>
                          <p style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>{s.SubUnitID}</p>
                          <EnableBadge v={s.Enable}/>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                  <div style={{ background:'#1e3a40', borderRadius:'12px 12px 0 0', padding:'14px 18px', flexShrink:0 }}>
                    <p style={{ color:'rgba(255,255,255,0.55)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                      {isNewS ? 'New Sub Unit' : selSub ? 'Edit Sub Unit' : 'No Unit Selected'}
                    </p>
                    <p style={{ color:'#fff', fontSize:18, fontWeight:800, marginTop:2 }}>SUB UNIT DETAIL</p>
                  </div>

                  <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:13, background:'#e8f0f1' }}>
                    {loadingS ? (
                      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', flex:1 }}><div className="spinner" /></div>
                    ) : !selSub && !isNewS ? (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'#9ca3af' }}>
                        <ILayers s={40} />
                        <p style={{ fontSize:13, marginTop:10 }}>Select a sub unit, or create a new one</p>
                      </div>
                    ) : (
                      <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:13 }}>

                        <SectBox title="Sub Unit Identification" icon={<ILayers s={14}/>}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
                            <FieldRow label="Sub Unit ID" htmlFor="su-id">
                              <input id="su-id" className="frm-input" value={fSubID} readOnly/>
                            </FieldRow>
                            <FieldRow label="Sub Unit Description (SubUnitDes) *" htmlFor="su-des">
                              <input id="su-des" className="frm-input" value={fSubDes} maxLength={MAX_DES}
                                onChange={(e)=>setFSubDes(e.target.value)}
                                placeholder="e.g. GRAM"/>
                            </FieldRow>
                          </div>
                          <span className={`char-count ${fSubDes.length >= MAX_DES ? 'warn' : ''}`}>{fSubDes.length} / {MAX_DES}</span>
                        </SectBox>

                        <SectBox title="Status">
                          <Checkbox checked={fSEnable} onChange={setFSEnable} label="Enable Sub Unit"/>
                        </SectBox>

                        <SectBox title="Sub Unit Detail" icon={<ILayers s={14}/>}>
                          <div style={{ overflowX:'auto', maxHeight:220, overflowY:'auto' }}>
                            <table className="grid-table">
                              <thead>
                                <tr>
                                  <th style={{ width:22 }}></th>
                                  <th>SubUnitID</th>
                                  <th>SubUnitDes</th>
                                  <th>Enable</th>
                                </tr>
                              </thead>
                              <tbody>
                                {subs.length === 0 && (
                                  <tr><td colSpan={4} style={{ textAlign:'center', color:'#9ca3af', padding:'18px 0' }}>No records</td></tr>
                                )}
                                {subs.map((s) => {
                                  const sel = selSub?.SubUnitID===s.SubUnitID && !isNewS;
                                  return (
                                    <tr key={s.SubUnitID} className={sel?'sel-row':''} onClick={()=>handleSelectSub(s)}>
                                      <td><span className="row-arrow">{sel?'▶':''}</span></td>
                                      <td className="id-col">{s.SubUnitID}</td>
                                      <td style={{ color:sel?'#1565c0':'#1f2937', fontWeight:sel?700:400 }}>{s.SubUnitDes}</td>
                                      <td><EnableBadge v={s.Enable}/></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </SectBox>

                        <SectBox title="Used In Conversions" icon={<IArrows s={14}/>}>
                          {convs.filter((c)=>c.SubUnitID===fSubID).length===0
                            ? <p style={{ fontSize:12, color:'#9ca3af' }}>No conversion mappings yet.</p>
                            : <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                                {convs.filter((c)=>c.SubUnitID===fSubID).map((c,i)=>(
                                  <span key={i} className="badge-conv">
                                    1 {masterDes(c.MasterUnitID)} = {c.NoOfUnits} {subDes(c.SubUnitID)}
                                  </span>
                                ))}
                              </div>
                          }
                        </SectBox>
                      </div>
                    )}
                  </div>

                  <ActionBar
                    onClear={handleClearSub} onDelete={handleDeleteSub} onSave={handleSaveSub}
                    isNew={isNewS} saving={savingS} deleting={deletingS} canAct={!!selSub || isNewS}
                  />
                </div>
              </>
            )}

            {/* ══════════════════════════════════
                UNIT CONVERSION
            ══════════════════════════════════ */}
            {section === 'conversion' && (
              <>
                <div className="left-panel" style={{ width:280, flexShrink:0, background:'#deeaea', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
                  <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid rgba(30,58,64,0.1)', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#1e3a40' }}>Unit Conversions</span>
                      <span style={{ fontSize:11, color:'#6b7280', fontWeight:500 }}>{convs.length} total</span>
                    </div>
                    <button className="btn-new" style={{ width:'100%' }} onClick={handleNewConv}
                      disabled={loadingC || masters.length===0 || subs.length===0}>
                      <IPlus s={14}/> New Conversion
                    </button>
                    {(masters.length===0||subs.length===0) && !loadingM && !loadingS && (
                      <p style={{ fontSize:10.5, color:'#dc2626', marginTop:6 }}>Add Master & Sub units first.</p>
                    )}
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                    <ListState loading={loadingC} error={errorC} onRetry={fetchConvs} empty={filteredConvs.length === 0} />
                    {!loadingC && !errorC && filteredConvs.map((c) => {
                      const sel = selConv?.MasterUnitID===c.MasterUnitID && selConv?.SubUnitID===c.SubUnitID && !isNewC;
                      return (
                        <button
                          key={`${c.MasterUnitID}-${c.SubUnitID}`}
                          className={`srv-list-item ${sel?'active':''}`}
                          onClick={() => handleSelectConv(c)}
                        >
                          <div style={{ width:36, height:36, borderRadius:9, background:c.Enable?'linear-gradient(135deg,#1e3a40,#2a5260)':'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff' }}>
                            <IArrows s={16}/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:700, color:'#1e3a40', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {masterDes(c.MasterUnitID)} → {subDes(c.SubUnitID)}
                            </p>
                            <p style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>1 = {c.NoOfUnits}</p>
                            <EnableBadge v={c.Enable}/>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                  <div style={{ background:'#1e3a40', borderRadius:'12px 12px 0 0', padding:'14px 18px', flexShrink:0 }}>
                    <p style={{ color:'rgba(255,255,255,0.55)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                      {isNewC ? 'New Unit Conversion' : selConv ? 'Edit Unit Conversion' : 'No Conversion Selected'}
                    </p>
                    <p style={{ color:'#fff', fontSize:18, fontWeight:800, marginTop:2 }}>UNIT CONVERSION DETAIL</p>
                  </div>

                  <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:13, background:'#e8f0f1' }}>
                    {(loadingC || loadingM || loadingS) ? (
                      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', flex:1 }}><div className="spinner" /></div>
                    ) : !selConv && !isNewC ? (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'#9ca3af' }}>
                        <IArrows s={40} />
                        <p style={{ fontSize:13, marginTop:10 }}>Select a conversion, or create a new one</p>
                      </div>
                    ) : (
                      <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:13 }}>

                        <SectBox title="Conversion Mapping" icon={<IArrows s={14}/>}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                            <FieldRow label="Master Unit (MasterUnitID)" htmlFor="cv-master">
                              <select id="cv-master" className="frm-select" value={fCMasterID}
                                onChange={(e)=>setFCMasterID(e.target.value)}>
                                <option value="">-- Select --</option>
                                {masters.map((m)=><option key={m.MasterUnitID} value={m.MasterUnitID}>{m.UnitDes}</option>)}
                              </select>
                            </FieldRow>
                            <FieldRow label="Sub Unit (SubUnitID)" htmlFor="cv-sub">
                              <select id="cv-sub" className="frm-select" value={fCSubID}
                                onChange={(e)=>setFCSubID(e.target.value)}>
                                <option value="">-- Select --</option>
                                {subs.map((s)=><option key={s.SubUnitID} value={s.SubUnitID}>{s.SubUnitDes}</option>)}
                              </select>
                            </FieldRow>
                          </div>
                          <FieldRow label="No. of Units (NoOfUnits)" htmlFor="cv-units">
                            <input id="cv-units" className="frm-input" type="number" min={0} step="0.01"
                              value={fCUnits===0?'':fCUnits}
                              onChange={(e)=>setFCUnits(Number(e.target.value))}
                              placeholder="e.g. 1000"/>
                          </FieldRow>
                        </SectBox>

                        <SectBox title="Status">
                          <Checkbox checked={fCEnable} onChange={setFCEnable} label="Enable"/>
                        </SectBox>

                        <SectBox title="Unit Conversion Detail" icon={<IArrows s={14}/>}>
                          <div style={{ overflowX:'auto', maxHeight:220, overflowY:'auto' }}>
                            <table className="grid-table">
                              <thead>
                                <tr>
                                  <th style={{ width:22 }}></th>
                                  <th>MasterUnitID</th>
                                  <th>UnitDes</th>
                                  <th>SubUnitID</th>
                                  <th>SubUnitDes</th>
                                  <th style={{ textAlign:'right' }}>Units</th>
                                </tr>
                              </thead>
                              <tbody>
                                {convs.length === 0 && (
                                  <tr><td colSpan={6} style={{ textAlign:'center', color:'#9ca3af', padding:'18px 0' }}>No records</td></tr>
                                )}
                                {convs.map((c) => {
                                  const sel = selConv?.MasterUnitID===c.MasterUnitID && selConv?.SubUnitID===c.SubUnitID && !isNewC;
                                  return (
                                    <tr key={`${c.MasterUnitID}-${c.SubUnitID}`} className={sel?'sel-row':''} onClick={()=>handleSelectConv(c)}>
                                      <td><span className="row-arrow">{sel?'▶':''}</span></td>
                                      <td className="id-col">{c.MasterUnitID}</td>
                                      <td style={{ color:sel?'#1565c0':'#1f2937', fontWeight:sel?700:400 }}>{masterDes(c.MasterUnitID)}</td>
                                      <td className="id-col">{c.SubUnitID}</td>
                                      <td style={{ color:sel?'#1565c0':'#1f2937', fontWeight:sel?700:400 }}>{subDes(c.SubUnitID)}</td>
                                      <td className="num-col">{c.NoOfUnits}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </SectBox>

                        <div style={{ background:'linear-gradient(135deg,#1e3a40,#2a5260)', borderRadius:12, padding:'18px' }}>
                          <p style={{ color:'rgba(255,255,255,0.6)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
                            Conversion Preview
                          </p>
                          <p style={{ color:'#fff', fontSize:20, fontWeight:800 }}>
                            1 {fCMasterID ? masterDes(fCMasterID) : '—'} = {fCUnits||0} {fCSubID ? subDes(fCSubID) : '—'}
                          </p>
                        </div>

                      </div>
                    )}
                  </div>

                  <ActionBar
                    onClear={handleClearConv} onDelete={handleDeleteConv} onSave={handleSaveConv}
                    isNew={isNewC} saving={savingC} deleting={deletingC} canAct={!!selConv || isNewC}
                  />
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}