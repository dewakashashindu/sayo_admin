'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface Supplier {
  id: number;
  supID: string;
  supName: string;
  suppAdd1: string;
  contactNO: string;
  emails: string;
  web: string;
  debtAmount: number;
  createUser: string;
  createDatetime: string;
  remarks: string;
  enable: boolean;
}

function emptySupplier(id: number): Supplier {
  return {
    id,
    supID: '',
    supName: '',
    suppAdd1: '',
    contactNO: '',
    emails: '',
    web: '',
    debtAmount: 0,
    createUser: 'ADMIN',
    createDatetime: new Date().toISOString().slice(0, 10),
    remarks: '',
    enable: true,
  };
}

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    display:inline-block; width:14px; height:14px;
    border:2px solid rgba(255,255,255,0.35);
    border-top-color:#fff; border-radius:50%;
    animation:spin 0.65s linear infinite; flex-shrink:0;
  }
  .spinner.dark { border-color:rgba(30,58,64,0.2); border-top-color:#1e3a40; }

  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(16px);} to{opacity:1;transform:translateX(-50%) translateY(0);} }
  .toast {
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    background:#1e3a40; color:#fff; padding:11px 26px; border-radius:10px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600;
    z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.28);
    animation:toastIn 0.22s ease; white-space:nowrap;
  }
  .toast.err { background:#dc2626; }

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
  .frm-input.readonly-style { background:#f3f6f6; color:#6b7280; cursor:default; }

  .frm-textarea {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:9px 11px; min-height:64px; resize:vertical;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-textarea:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:8px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr-title { color:#fff; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:12px 14px; display:flex; flex-direction:column; gap:10px; }

  .frm-label {
    font-size:11px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.05em;
    margin-bottom:3px; display:block;
  }

  .chk-row {
    display:inline-flex; align-items:center; gap:8px; cursor:pointer;
    padding:6px 10px; border-radius:8px; transition:background 0.12s; user-select:none;
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
    padding:0 24px; height:38px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25);
  }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); }
  .btn-save:disabled { opacity:0.65; cursor:not-allowed; }

  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:38px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }

  .btn-del {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:38px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-del:hover:not(:disabled) { background:#fee2e2; border-color:#f87171; transform:translateY(-1px); }
  .btn-del:disabled { opacity:0.55; cursor:not-allowed; }

  .btn-clear {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:38px; border-radius:9px;
    background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-clear:hover { background:#e5e7eb; transform:translateY(-1px); }

  .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:38px; border-radius:9px;
    background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-print:hover { background:#e0f2fe; transform:translateY(-1px); }

  .srv-list-item {
    display:flex; align-items:flex-start; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s; border:none;
    background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.12); }

  .badge-active   { display:inline-flex;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-debt     { display:inline-flex;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:600;background:rgba(220,38,38,0.08);color:#dc2626; }

  .debt-warning {
    padding:10px 12px; background:#fef2f2; border:1.5px solid #fecaca;
    border-radius:8px; display:flex; align-items:center; gap:8px;
  }

  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
  .grid-id { display:grid; grid-template-columns:160px 1fr 1fr; gap:10px; }

  @media(max-width:900px) {
    .grid-3 { grid-template-columns:1fr 1fr; }
    .grid-id { grid-template-columns:1fr 1fr; }
  }
  @media(max-width:600px) {
    .grid-2,.grid-3,.grid-id { grid-template-columns:1fr; }
    .left-panel { display:none !important; }
  }

  /* highlight search match */
  .hl { background:#fef08a; border-radius:2px; }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const IBell    = ({ s=21 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const ISearch  = ({ s=15 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IChevD   = ({ s=13 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IPlus    = ({ s=16 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ITrash   = ({ s=15 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IPrint   = ({ s=15 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const ISave    = ({ s=15 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IRefresh = ({ s=15 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>;
const ICheck   = ({ s=11 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const ITruck   = ({ s=18 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const IMapPin  = ({ s=12 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IDollar  = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const IUser    = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IPhone   = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.11 11 19.79 19.79 0 0 1 1 2.18 2 2 0 0 1 2.18 0h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const IGlobe   = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const IMail    = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
const INote    = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const ITag     = ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const ICalendar= ({ s=14 }: {s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div
      className="chk-row"
      onClick={() => onChange(!checked)}
      role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
    >
      <div className={`chk-box ${checked ? 'checked' : ''}`}>
        {checked && <ICheck s={10} />}
      </div>
      <span className="chk-label">{label}</span>
    </div>
  );
}

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label className="frm-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function SectBox({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sect-box">
      <div className="sect-hdr">
        {icon && <span style={{ color: 'rgba(255,255,255,0.7)', display:'flex', alignItems:'center' }}>{icon}</span>}
        <span className="sect-hdr-title">{title}</span>
      </div>
      <div className="sect-body">{children}</div>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, err = false) => {
    if (ref.current) clearTimeout(ref.current);
    setToast({ msg, err });
    ref.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return { toast, show };
}

/* highlight matched text */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/* focus next focusable sibling */
function focusNext(current: HTMLElement) {
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>(
      'input:not([readonly]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
    )
  ).filter(el => !el.closest('.srv-list-item') && !el.closest('header'));

  const idx = focusable.indexOf(current);
  if (idx !== -1 && idx < focusable.length - 1) {
    focusable[idx + 1].focus();
  }
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function SupplierMasterPage() {
  const router = useRouter();

  const [navKey,   setNavKey]   = useState('suppliers');
  const [search,   setSearch]   = useState('');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [current,   setCurrent]   = useState<Supplier>(emptySupplier(0));
  const [isNew,     setIsNew]     = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const nextIdRef = useRef(1);
  const { toast, show: showToast } = useToast();
  const rightPanelRef = useRef<HTMLDivElement>(null);

  /* ── Load ── */
  const loadSuppliers = useCallback(async (selectSupID?: string) => {
    setLoading(true);
    try {
      const res  = await fetch('/api/suppliers');
      const json = await res.json() as { success: boolean; data: Supplier[] };
      if (!json.success) throw new Error('Load failed');
      const list = json.data.map((s, i) => ({ ...s, id: i + 1 }));
      setSuppliers(list);
      nextIdRef.current = list.length + 1;
      if (list.length > 0) {
        const target = selectSupID
          ? list.find(s => s.supID === selectSupID) ?? list[0]
          : list[0];
        setCurrent({ ...target });
        setIsNew(false);
      } else {
        setCurrent(emptySupplier(1));
        setIsNew(true);
      }
    } catch {
      showToast('Failed to load suppliers', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  /* ── Ctrl+S ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  /* ── Filtered list ── */
  const filtered = useMemo(() =>
    suppliers.filter(s => {
      const q = search.toLowerCase();
      return (
        s.supID.toLowerCase().includes(q)    ||
        s.supName.toLowerCase().includes(q)  ||
        s.contactNO.toLowerCase().includes(q)||
        s.emails.toLowerCase().includes(q)   ||
        s.suppAdd1.toLowerCase().includes(q) ||
        s.web.toLowerCase().includes(q)
      );
    }), [suppliers, search]);

  const originalSupplier = useMemo(() => {
    if (isNew) return null;
    return suppliers.find(s => s.id === current.id) ?? null;
  }, [suppliers, current.id, isNew]);

  const isDirty = useMemo(() => {
    if (isNew) return (
      current.supName.trim()   !== '' ||
      current.suppAdd1.trim()  !== '' ||
      current.contactNO.trim() !== '' ||
      current.emails.trim()    !== '' ||
      current.web.trim()       !== '' ||
      current.debtAmount       !== 0  ||
      current.remarks.trim()   !== ''
    );
    if (!originalSupplier) return false;
    return JSON.stringify(current) !== JSON.stringify(originalSupplier);
  }, [current, originalSupplier, isNew]);

  function confirmDiscard(msg: string) {
    if (!isDirty) return true;
    return confirm(msg);
  }

  function upd<K extends keyof Supplier>(key: K, val: Supplier[K]) {
    setCurrent(p => ({ ...p, [key]: val }));
  }

  /* Enter → next field */
  function onEnterNext(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusNext(e.currentTarget);
    }
  }

  function handleNew() {
    if (!confirmDiscard('Discard unsaved changes and create a new supplier?')) return;
    const id = nextIdRef.current++;
    setCurrent(emptySupplier(id));
    setIsNew(true);
    setTimeout(() => {
      document.getElementById('sup-id')?.focus();
    }, 80);
  }

  function handleSelect(s: Supplier) {
    if (current.id === s.id && !isNew) return;
    if (!confirmDiscard('Discard unsaved changes and switch supplier?')) return;
    setCurrent({ ...s });
    setIsNew(false);
    setTimeout(() => rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  async function handleSave() {
    if (!current.supName.trim()) { showToast('Supplier Name is required', true); return; }
    if (isNew && !current.supID.trim()) { showToast('Supplier ID is required', true); return; }

    setSaving(true);
    try {
      const payload = {
        supID:      current.supID.trim().toUpperCase(),
        supName:    current.supName.trim(),
        suppAdd1:   current.suppAdd1.trim()  || '',
        contactNO:  current.contactNO.trim() || '',
        emails:     current.emails.trim()    || '',
        web:        current.web.trim()       || '',
        debtAmount: current.debtAmount,
        createUser: current.createUser || 'ADMIN',
        remarks:    current.remarks.trim()   || '',
        enable:     current.enable,
      };
      const res = isNew
        ? await fetch('/api/suppliers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        : await fetch(`/api/suppliers/${encodeURIComponent(current.supID)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const json = await res.json() as { success: boolean; message?: string };
      if (!json.success) throw new Error(json.message ?? 'Save failed');
      showToast(isNew ? 'Supplier created ✓' : 'Saved successfully ✓');
      setIsNew(false);
      await loadSuppliers(current.supID.trim().toUpperCase());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!current.supID || isNew) return;
    if (!confirm(`Delete supplier "${current.supName}" (${current.supID})?\nThis cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res  = await fetch(`/api/suppliers/${encodeURIComponent(current.supID)}`, { method:'DELETE' });
      const json = await res.json() as { success: boolean; message?: string };
      if (!json.success) throw new Error(json.message ?? 'Delete failed');
      showToast('Deleted successfully');
      await loadSuppliers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setDeleting(false);
    }
  }

  function handleClear() {
    if (isNew) { setCurrent(emptySupplier(current.id)); }
    else {
      const orig = suppliers.find(s => s.id === current.id);
      if (orig) setCurrent({ ...orig });
    }
  }

  function handleNavigate(key: string, path: string) {
    if (!confirmDiscard('Leave page without saving?')) return;
    setNavKey(key); router.push(path);
  }
  function handleLogout() {
    if (!confirmDiscard('Leave without saving?')) return;
    router.push('/admin/login');
  }

  const busy = saving || deleting;
  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background: PAGE }}>
        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>

          {/* ── HEADER ── */}
          <header style={{ background: HDR, height:56, flexShrink:0, display:'flex', alignItems:'center', padding:'0 18px', gap:12, borderBottom:'1px solid rgba(0,0,0,0.06)', zIndex:10 }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center', pointerEvents:'none', opacity:0.4 }}>
                <ISearch />
              </span>
              <input
                aria-label="Search suppliers"
                style={{ border:'1.5px solid #c0cbcc', borderRadius:10, padding:'0 14px 0 38px', height:40, width:270, fontFamily:"'Inter',sans-serif", fontSize:14, color:'#1f2937', background:'#fff', outline:'none' }}
                placeholder="Search by ID, name, contact, address…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex:1 }} />
            <span style={{ fontSize:12, color:'#6b7280', fontWeight:500 }}>
              {!loading && `${filtered.length} / ${suppliers.length} suppliers`}
            </span>
            <button style={{ background:'none', border:'none', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', padding:4, borderRadius:8 }} aria-label="Notifications">
              <IBell />
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
              <span style={{ fontSize:14, fontWeight:500, color:'#1f2937' }}>MR. SAYO</span>
              <IChevD />
            </div>
            <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#5a8a92,#3a6a72)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', flexShrink:0 }}>
              S
            </div>
          </header>

          {/* ── BODY ── */}
          <div style={{ flex:1, overflow:'hidden', padding:'12px 14px', display:'flex', gap:12 }}>

            {/* LEFT PANEL */}
            <div className="left-panel" style={{ width:262, flexShrink:0, background:'#deeaea', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
              <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid rgba(30,58,64,0.1)', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#1e3a40' }}>Suppliers</span>
                  <span style={{ fontSize:11, color:'#6b7280', fontWeight:500 }}>
                    {loading ? '…' : `${suppliers.length} total`}
                  </span>
                </div>
                <button className="btn-new" style={{ width:'100%' }} onClick={handleNew} disabled={busy}>
                  <IPlus s={14} /> New Supplier
                </button>
              </div>

              <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                {loading && (
                  <div style={{ display:'flex', justifyContent:'center', padding:'2rem 0' }}>
                    <span className="spinner dark" />
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <p style={{ textAlign:'center', color:'#9ca3af', fontSize:12, padding:'2rem 0' }}>
                    {search ? 'No results found' : 'No suppliers yet'}
                  </p>
                )}
                {!loading && filtered.map(s => (
                  <button
                    key={s.id}
                    className={`srv-list-item ${current.id === s.id && !isNew ? 'active' : ''}`}
                    onClick={() => handleSelect(s)}
                  >
                    <div style={{ width:38, height:38, borderRadius:9, background: s.enable ? 'linear-gradient(135deg,#1e3a40,#2a5260)' : '#d1d5db', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', marginTop:1 }}>
                      <ITruck s={17} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'#1e3a40', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        <Highlight text={s.supName || '(no name)'} query={search} />
                      </p>
                      <p style={{ fontSize:11, color:'#6b7280', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        <Highlight text={s.supID} query={search} />
                        {s.contactNO && <> · <Highlight text={s.contactNO} query={search} /></>}
                      </p>
                      {s.suppAdd1 && (
                        <p style={{ fontSize:11, color:'#9ca3af', marginTop:1, display:'flex', alignItems:'center', gap:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          <IMapPin s={10} />
                          <Highlight text={s.suppAdd1} query={search} />
                        </p>
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4, flexWrap:'wrap' }}>
                        <span className={s.enable ? 'badge-active' : 'badge-inactive'}>
                          {s.enable ? 'Active' : 'Inactive'}
                        </span>
                        {s.debtAmount > 0 && (
                          <span className="badge-debt">
                            Debt: {s.debtAmount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden', borderRadius:12, boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>

              {/* title bar */}
              <div style={{ background:'#1e3a40', borderRadius:'12px 12px 0 0', padding:'12px 18px', flexShrink:0 }}>
                <p style={{ color:'rgba(255,255,255,0.5)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                  {isNew ? 'New Supplier' : `Editing: ${current.supID}`}
                  {isDirty && '  •  Unsaved changes'}
                </p>
                <p style={{ color:'#fff', fontSize:17, fontWeight:800, marginTop:2 }}>
                  SUPPLIER MASTER DETAIL
                </p>
                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:11, marginTop:3 }}>
                  Press <kbd style={{ background:'rgba(255,255,255,0.15)', borderRadius:4, padding:'1px 5px', fontFamily:'monospace' }}>Enter</kbd> to move between fields &nbsp;·&nbsp;
                  <kbd style={{ background:'rgba(255,255,255,0.15)', borderRadius:4, padding:'1px 5px', fontFamily:'monospace' }}>Ctrl+S</kbd> to save
                </p>
              </div>

              {/* scrollable form */}
              <div
                ref={rightPanelRef}
                style={{ flex:1, overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:12, background:'#e8f0f1' }}
              >
                {loading ? (
                  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', flex:1 }}>
                    <span className="spinner dark" style={{ width:28, height:28 }} />
                  </div>
                ) : (
                  <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:12 }}>

                    {/* ── SECTION 1: Identification ── */}
                    <SectBox title="Supplier Identification" icon={<ITag s={13} />}>
                      <div className="grid-id">
                        <FieldRow label="Supplier ID *" htmlFor="sup-id">
                          {isNew ? (
                            <input
                              id="sup-id"
                              className="frm-input"
                              value={current.supID}
                              onChange={e => upd('supID', e.target.value.toUpperCase())}
                              onKeyDown={onEnterNext}
                              placeholder="e.g. SUP005"
                              maxLength={10}
                              autoFocus
                            />
                          ) : (
                            <input id="sup-id" className="frm-input" value={current.supID} readOnly tabIndex={-1} />
                          )}
                        </FieldRow>
                        <FieldRow label="Supplier Name *" htmlFor="sup-name">
                          <input
                            id="sup-name"
                            className="frm-input"
                            value={current.supName}
                            onChange={e => upd('supName', e.target.value)}
                            onKeyDown={onEnterNext}
                            placeholder="e.g. ABC Distributors"
                            maxLength={200}
                          />
                        </FieldRow>
                        <FieldRow label="Status" htmlFor="sup-status">
                          <div style={{ display:'flex', alignItems:'center', height:36 }}>
                            <Checkbox checked={current.enable} onChange={v => upd('enable', v)} label={current.enable ? 'Active' : 'Inactive'} />
                          </div>
                        </FieldRow>
                      </div>

                      <FieldRow label="Address" htmlFor="sup-addr">
                        <input
                          id="sup-addr"
                          className="frm-input"
                          value={current.suppAdd1}
                          onChange={e => upd('suppAdd1', e.target.value)}
                          onKeyDown={onEnterNext}
                          placeholder="Street, City, Region"
                          maxLength={200}
                        />
                      </FieldRow>
                    </SectBox>

                    {/* ── SECTION 2: Contact ── */}
                    <SectBox title="Contact Information" icon={<IPhone s={13} />}>
                      <div className="grid-3">
                        <FieldRow label="Contact Number" htmlFor="sup-contact">
                          <input
                            id="sup-contact"
                            className="frm-input"
                            value={current.contactNO}
                            onChange={e => upd('contactNO', e.target.value)}
                            onKeyDown={onEnterNext}
                            placeholder="011-2345678"
                            maxLength={100}
                          />
                        </FieldRow>
                        <FieldRow label="Email" htmlFor="sup-email">
                          <input
                            id="sup-email"
                            className="frm-input"
                            type="email"
                            value={current.emails}
                            onChange={e => upd('emails', e.target.value)}
                            onKeyDown={onEnterNext}
                            placeholder="supplier@example.com"
                            maxLength={100}
                          />
                        </FieldRow>
                        <FieldRow label="Website" htmlFor="sup-web">
                          <input
                            id="sup-web"
                            className="frm-input"
                            value={current.web}
                            onChange={e => upd('web', e.target.value)}
                            onKeyDown={onEnterNext}
                            placeholder="www.example.com"
                            maxLength={50}
                          />
                        </FieldRow>
                      </div>

                      {/* Quick contact preview */}
                      {(current.contactNO || current.emails || current.web) && (
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingTop:4 }}>
                          {current.contactNO && (
                            <a href={`tel:${current.contactNO}`} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:'#1e3a40', fontWeight:600, textDecoration:'none', background:'rgba(30,58,64,0.07)', borderRadius:6, padding:'4px 10px' }}>
                              <IPhone s={12} /> {current.contactNO}
                            </a>
                          )}
                          {current.emails && (
                            <a href={`mailto:${current.emails}`} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:'#1e3a40', fontWeight:600, textDecoration:'none', background:'rgba(30,58,64,0.07)', borderRadius:6, padding:'4px 10px' }}>
                              <IMail s={12} /> {current.emails}
                            </a>
                          )}
                          {current.web && (
                            <a href={current.web.startsWith('http') ? current.web : `https://${current.web}`} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:'#1e3a40', fontWeight:600, textDecoration:'none', background:'rgba(30,58,64,0.07)', borderRadius:6, padding:'4px 10px' }}>
                              <IGlobe s={12} /> {current.web}
                            </a>
                          )}
                        </div>
                      )}
                    </SectBox>

                    {/* ── SECTION 3: Financial ── */}
                    <SectBox title="Financial" icon={<IDollar s={13} />}>
                      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:10, alignItems:'end' }}>
                        <FieldRow label="Debt / Outstanding Amount (LKR)" htmlFor="sup-debt">
                          <input
                            id="sup-debt"
                            className="frm-input"
                            type="number"
                            value={current.debtAmount}
                            onChange={e => upd('debtAmount', Number(e.target.value))}
                            onKeyDown={onEnterNext}
                            min={0}
                          />
                        </FieldRow>

                        {/* summary pill */}
                        <div style={{ height:36, display:'flex', alignItems:'center' }}>
                          <div style={{
                            display:'inline-flex', alignItems:'center', gap:8,
                            background: current.debtAmount > 0 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#15803d,#166534)',
                            borderRadius:10, padding:'6px 16px', color:'#fff',
                          }}>
                            <IDollar s={14} />
                            <span style={{ fontSize:15, fontWeight:800 }}>
                              LKR {current.debtAmount.toLocaleString()}
                            </span>
                            <span style={{ fontSize:11, opacity:0.75, fontWeight:500 }}>
                              {current.debtAmount > 0 ? 'Outstanding' : 'Cleared'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {current.debtAmount > 0 && (
                        <div className="debt-warning">
                          <span style={{ fontSize:16 }}>⚠</span>
                          <p style={{ fontSize:12, color:'#b91c1c', fontWeight:600 }}>
                            Outstanding debt of <strong>LKR {current.debtAmount.toLocaleString()}</strong> recorded for this supplier.
                          </p>
                        </div>
                      )}
                    </SectBox>

                    {/* ── SECTION 4: Remarks ── */}
                    <SectBox title="Remarks & Notes" icon={<INote s={13} />}>
                      <textarea
                        className="frm-textarea"
                        aria-label="Remarks"
                        value={current.remarks}
                        onChange={e => upd('remarks', e.target.value)}
                        placeholder="Additional notes about this supplier…"
                        maxLength={260}
                      />
                      <p style={{ fontSize:11, color:'#9ca3af', textAlign:'right' }}>
                        {current.remarks.length}/260
                      </p>
                    </SectBox>

                    {/* ── SECTION 5: Audit ── */}
                    <SectBox title="Audit Information" icon={<ICalendar s={13} />}>
                      <div className="grid-2">
                        <FieldRow label="Created By" htmlFor="sup-createuser">
                          <div style={{ position:'relative' }}>
                            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', opacity:0.4, display:'flex', alignItems:'center' }}><IUser s={13} /></span>
                            <input id="sup-createuser" className="frm-input" style={{ paddingLeft:30 }} value={current.createUser} readOnly tabIndex={-1} />
                          </div>
                        </FieldRow>
                        <FieldRow label="Created Date" htmlFor="sup-createdate">
                          <div style={{ position:'relative' }}>
                            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', opacity:0.4, display:'flex', alignItems:'center' }}><ICalendar s={13} /></span>
                            <input id="sup-createdate" className="frm-input" style={{ paddingLeft:30 }} value={current.createDatetime} readOnly tabIndex={-1} />
                          </div>
                        </FieldRow>
                      </div>
                      <p style={{ fontSize:11, color:'#9ca3af' }}>
                        * Audit fields are automatically maintained on Save.
                      </p>
                    </SectBox>

                  </div>
                )}
              </div>

              {/* ── FOOTER ── */}
              <div style={{ background:'#dce8e8', borderTop:'1.5px solid rgba(30,58,64,0.12)', padding:'10px 14px', display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
                <button className="btn-clear" onClick={handleClear} disabled={busy}>
                  <IRefresh s={13} /> Clear
                </button>
                <button className="btn-print" onClick={() => window.print()} disabled={busy}>
                  <IPrint s={13} /> Print
                </button>
                <div style={{ flex:1 }} />
                {isDirty && (
                  <span style={{ fontSize:11, color:'#dc6b2f', fontWeight:600 }}>● Unsaved changes</span>
                )}
                {!isNew && (
                  <button className="btn-del" onClick={handleDelete} disabled={busy}>
                    {deleting
                      ? <><span className="spinner" style={{ borderTopColor:'#dc2626', borderColor:'rgba(220,38,38,0.2)' }} /> Deleting…</>
                      : <><ITrash s={13} /> Delete</>}
                  </button>
                )}
                <button className="btn-save" onClick={handleSave} disabled={busy}>
                  {saving
                    ? <><span className="spinner" /> Saving…</>
                    : <><ISave s={13} /> Save  <span style={{ fontSize:11, opacity:0.65 }}>(Ctrl+S)</span></>}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}