// app/admin/locations/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES  — matches Tbl_LocationMaster exactly
───────────────────────────────────────── */
interface LocationMaster {
  LocCode: string;   // CHAR(10) PK
  LocDes:  string;   // VARCHAR(50)
  Address: string;   // VARCHAR(300)
  Enable:  boolean;  // TINYINT(1)
}

/* ─────────────────────────────────────────
   API HELPERS
───────────────────────────────────────── */
const API = '/api/locations';

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

  .frm-textarea {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:9px 11px; min-height:80px; resize:vertical;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s; line-height:1.5;
  }
  .frm-textarea:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

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
    text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; display:block;
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
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); }
  .btn-save:disabled { opacity:0.6; cursor:not-allowed; }

  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover:not(:disabled) { transform:translateY(-1px); }
  .btn-new:disabled { opacity:0.6; cursor:not-allowed; }

  .btn-del {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-del:hover:not(:disabled) { background:#fee2e2; transform:translateY(-1px); }
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

  .srv-list-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s; border:none;
    background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }

  .badge-active   { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }

  .toast {
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:12px 20px; border-radius:10px; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:600; color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation:fadeUp 0.25s ease both; max-width:340px;
  }
  .toast-success { background:#15803d; }
  .toast-error   { background:#dc2626; }

  @media(max-width:767px) { .left-panel { display:none !important; } }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IBell({ s=21 }: { s?: number })     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch({ s=15 }: { s?: number })  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({ s=13 }: { s?: number })   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IPlus({ s=16 }: { s?: number })    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function ITrash({ s=15 }: { s?: number })   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IPrint({ s=15 }: { s?: number })   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function ISave({ s=15 }: { s?: number })    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>; }
function IRefresh({ s=15 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>; }
function ICheck({ s=11 }: { s?: number })   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function IMapPin({ s=13 }: { s?: number })  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
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
   SMALL COMPONENTS
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

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function LocationsPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState('locations');
  const [search, setSearch] = useState('');
  const { toast, show: showToast } = useToast();

  /* ── data state ── */
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [selLoc,    setSelLoc]    = useState<LocationMaster | null>(null);
  const [isNew,     setIsNew]     = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  /* ── form fields (mirrors Tbl_LocationMaster columns) ── */
  const [fLocCode, setFLocCode] = useState('');
  const [fLocDes,  setFLocDes]  = useState('');
  const [fAddress, setFAddress] = useState('');
  const [fEnable,  setFEnable]  = useState(true);

  const MAX_DES  = 50;
  const MAX_ADDR = 300;

  /* ── filtered list (client-side quick filter; server search also available) ── */
  const filtered = useMemo(() =>
    locations.filter((l) =>
      l.LocCode.toLowerCase().includes(search.toLowerCase()) ||
      l.LocDes.toLowerCase().includes(search.toLowerCase())  ||
      l.Address.toLowerCase().includes(search.toLowerCase())
    ), [locations, search]);

  /* ════════════════════════════════════════
     FETCH — real data from DB via API
  ════════════════════════════════════════ */
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await apiFetch<LocationMaster[]>(API);
    if (res.success && res.data) {
      setLocations(res.data);
      if (res.data.length > 0) {
        loadForm(res.data[0]);
      } else {
        setSelLoc(null);
        setIsNew(false);
      }
    } else {
      setLoadError(res.message ?? 'Failed to load locations');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  /* ── load form from a record ── */
  function loadForm(l: LocationMaster) {
    setFLocCode(l.LocCode);
    setFLocDes(l.LocDes);
    setFAddress(l.Address.trim() === '' ? '' : l.Address);
    setFEnable(l.Enable);
    setSelLoc(l);
    setIsNew(false);
  }

  /* ── SELECT ── */
  function handleSelect(l: LocationMaster) { loadForm(l); }

  /* ── NEW ── */
  function handleNew() {
    setFLocCode('(auto-generated)');
    setFLocDes('');
    setFAddress('');
    setFEnable(true);
    setSelLoc(null);
    setIsNew(true);
  }

  /* ── SAVE ── */
  async function handleSave() {
    const trimmedDes = fLocDes.trim();
    if (!trimmedDes) { showToast('Location Description is required', 'error'); return; }
    if (trimmedDes.length > MAX_DES) { showToast(`Description must be ≤ ${MAX_DES} characters`, 'error'); return; }
    if (fAddress.length > MAX_ADDR) { showToast(`Address must be ≤ ${MAX_ADDR} characters`, 'error'); return; }

    setSaving(true);
    try {
      if (isNew) {
        const res = await apiFetch<LocationMaster>(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locDes:  trimmedDes,
            address: fAddress.trim(),
            enable:  fEnable,
          }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Save failed', 'error'); return; }
        setLocations((p) => [...p, res.data!].sort((a, b) => a.LocCode.localeCompare(b.LocCode)));
        loadForm(res.data);
        showToast(`Location "${res.data.LocDes}" created ✓`);
      } else {
        const res = await apiFetch<LocationMaster>(API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locCode: fLocCode,
            locDes:  trimmedDes,
            address: fAddress.trim(),
            enable:  fEnable,
          }),
        });
        if (!res.success || !res.data) { showToast(res.message ?? 'Update failed', 'error'); return; }
        setLocations((p) => p.map((l) => l.LocCode === fLocCode ? res.data! : l));
        loadForm(res.data);
        showToast(`Location "${res.data.LocDes}" updated ✓`);
      }
    } finally {
      setSaving(false);
    }
  }

  /* ── DELETE ── */
  async function handleDelete() {
    if (!selLoc) { showToast('Select a location to delete', 'error'); return; }
    if (!confirm(`Delete location "${selLoc.LocDes}" (${selLoc.LocCode})?\nThis cannot be undone.`)) return;

    setDeleting(true);
    try {
      const res = await apiFetch(`${API}?locCode=${encodeURIComponent(selLoc.LocCode)}`, { method: 'DELETE' });
      if (!res.success) { showToast(res.message ?? 'Delete failed', 'error'); return; }
      const remaining = locations.filter((l) => l.LocCode !== selLoc.LocCode);
      setLocations(remaining);
      if (remaining.length) { loadForm(remaining[0]); }
      else { handleNew(); }
      showToast('Location deleted');
    } finally {
      setDeleting(false);
    }
  }

  /* ── CLEAR ── */
  function handleClear() {
    if (isNew) {
      setFLocDes(''); setFAddress(''); setFEnable(true);
    } else if (selLoc) {
      loadForm(selLoc);
    }
  }

  /* ── navigation ── */
  function handleNavigate(key: string, path: string) { setNavKey(key); router.push(path); }
  function handleLogout() { router.push('/admin/login'); }

  const HDR = '#dae6e6';

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

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>

        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* HEADER */}
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: 0.4 }}>
                <ISearch />
              </span>
              <input
                style={{ border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 38px', height: 40, width: 260, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937', background: '#fff', outline: 'none' }}
                placeholder="Search locations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}>
              <IBell />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>MR. SAYO</span>
              <IChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>S</div>
          </header>

          {/* GLOBAL LOAD ERROR */}
          {loadError && !loading && (
            <div style={{ background: '#fee2e2', borderBottom: '1px solid #fca5a5', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <IAlertCircle s={16} />
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{loadError}</span>
              <button onClick={fetchLocations} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}

          {/* BODY */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', gap: 13 }}>

            {/* ── LEFT PANEL ── */}
            <div className="left-panel" style={{ width: 260, flexShrink: 0, background: '#deeaea', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(30,58,64,0.1)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>Locations</span>
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{locations.length} total</span>
                </div>
                <button className="btn-new" style={{ width: '100%' }} onClick={handleNew} disabled={loading}>
                  <IPlus s={14} /> New Location
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                    <div className="spinner" />
                  </div>
                ) : loadError ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9ca3af' }}>
                    <IAlertCircle s={28} />
                    <p style={{ fontSize: 12, marginTop: 8 }}>Could not load locations</p>
                    <button className="btn-retry" onClick={fetchLocations}><IRefresh s={13} /> Retry</button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '2rem 0' }}>
                    {search ? 'No locations found' : 'No locations yet — click "New Location"'}
                  </p>
                ) : (
                  filtered.map((l) => (
                    <button
                      key={l.LocCode}
                      className={`srv-list-item ${selLoc?.LocCode === l.LocCode && !isNew ? 'active' : ''}`}
                      onClick={() => handleSelect(l)}
                    >
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: l.Enable ? 'linear-gradient(135deg,#1e3a40,#2a5260)' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                        <IMapPin s={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l.LocDes || '(no name)'}
                        </p>
                        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{l.LocCode}</p>
                        <span className={l.Enable ? 'badge-active' : 'badge-inactive'} style={{ marginTop: 3 }}>
                          {l.Enable ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL — FORM ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              <div style={{ background: '#1e3a40', borderRadius: '12px 12px 0 0', padding: '14px 18px', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {isNew ? 'New Location' : selLoc ? 'Edit Location' : 'No Location Selected'}
                </p>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 2 }}>LOCATION DETAIL</p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 13, background: '#e8f0f1' }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <div className="spinner" />
                  </div>
                ) : !selLoc && !isNew ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af' }}>
                    <IMapPin s={40} />
                    <p style={{ fontSize: 13, marginTop: 10 }}>Select a location from the list, or create a new one</p>
                  </div>
                ) : (
                  <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

                    <SectBox title="Location Details" icon={<IMapPin s={14} />}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                        <FieldRow label="Location Code (LocCode)" htmlFor="lc-code">
                          <input id="lc-code" className="frm-input" value={fLocCode} readOnly />
                        </FieldRow>
                        <FieldRow label="Location Description (LocDes) *" htmlFor="lc-des">
                          <input
                            id="lc-des"
                            className="frm-input"
                            value={fLocDes}
                            maxLength={MAX_DES}
                            onChange={(e) => setFLocDes(e.target.value)}
                            placeholder="e.g. HEAD OFFICE"
                          />
                        </FieldRow>
                      </div>
                      <span className={`char-count ${fLocDes.length >= MAX_DES ? 'warn' : ''}`}>
                        {fLocDes.length} / {MAX_DES}
                      </span>

                      <FieldRow label="Address" htmlFor="lc-addr">
                        <textarea
                          id="lc-addr"
                          className="frm-textarea"
                          value={fAddress}
                          maxLength={MAX_ADDR}
                          onChange={(e) => setFAddress(e.target.value)}
                          placeholder="Full address…"
                        />
                      </FieldRow>
                      <span className={`char-count ${fAddress.length >= MAX_ADDR ? 'warn' : ''}`}>
                        {fAddress.length} / {MAX_ADDR}
                      </span>
                    </SectBox>

                    <SectBox title="Status">
                      <Checkbox checked={fEnable} onChange={setFEnable} label="Enable" />
                    </SectBox>

                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div style={{ background: '#dce8e8', borderTop: '1.5px solid rgba(30,58,64,0.12)', padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-clear" onClick={handleClear} disabled={saving || deleting || (!selLoc && !isNew)}>
                  <IRefresh s={14} /> Clear
                </button>
                <button className="btn-print" onClick={() => window.print()}>
                  <IPrint s={14} /> Print
                </button>
                <div style={{ flex: 1 }} />
                {!isNew && selLoc && (
                  <button className="btn-del" onClick={handleDelete} disabled={saving || deleting}>
                    <ITrash s={14} /> {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
                <button className="btn-save" onClick={handleSave} disabled={saving || deleting || (!selLoc && !isNew)}>
                  <ISave s={14} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}