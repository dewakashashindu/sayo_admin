'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UserName from '@/components/UserName';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import NoAccess from '@/components/NoAccess';
import AccessLoading from '@/components/AccessLoading';

interface HoursRow {
  TxnDate: string;
  StartTime: string;
  ClosingTime: string;
  Open: boolean;
  ClosingRemarks: string;
}

const API = '/api/administration/hours';
const MAX_RMK = 200;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const json = await res.json();
    return { ...json, message: json.message ?? json.error };
  } catch {
    return { success: false, message: 'Network error — could not reach server' };
  }
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function shiftMonth(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + delta;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(ym: string): number {
  return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
}

function mondayOffset(ym: string): number {
  const dow = new Date(`${ym}-01T00:00:00`).getDay();
  return (dow + 6) % 7;
}

function weekdaysInMonth(ym: string): string[] {
  const n = daysInMonth(ym);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const day = new Date(`${iso}T00:00:00`).getDay();
    if (day >= 1 && day <= 5) out.push(iso);
  }
  return out;
}

function datesBetween(a: string, b: string): string[] {
  const [from, to] = a < b ? [a, b] : [b, a];
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out;
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function mergeDates(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width:32px; height:32px; border-radius:50%;
    border:3px solid rgba(30,58,64,0.15); border-top-color:#1e3a40;
    animation:spin 0.7s linear infinite;
  }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  .frm-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-input:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:disabled { background:#f3f6f6; color:#6b7280; }
  .frm-textarea {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:9px 11px; min-height:72px; resize:vertical;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; line-height:1.5;
  }
  .frm-textarea:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .char-count { font-size:10.5px; color:#9ca3af; text-align:right; margin-top:2px; }
  .char-count.warn { color:#dc2626; font-weight:600; }
  .frm-label {
    font-size:11px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; display:block;
  }
  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:9px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:14px; display:flex; flex-direction:column; gap:10px; }

  .chk-row {
    display:flex; align-items:center; gap:8px; cursor:pointer;
    padding:7px 10px; border-radius:8px; user-select:none;
  }
  .chk-row:hover { background:rgba(30,58,64,0.05); }
  .chk-box {
    width:17px; height:17px; border-radius:4px; border:2px solid #9ca3af;
    display:flex; align-items:center; justify-content:center; flex-shrink:0; background:#fff;
  }
  .chk-box.checked { background:#1e3a40; border-color:#1e3a40; }
  .chk-label { font-size:13px; font-weight:500; color:#374151; }

  .btn-save, .btn-new, .btn-clear, .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-save { background:#1e3a40; color:#fff; border:none; box-shadow:0 2px 8px rgba(30,58,64,0.25); }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); }
  .btn-new { background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none; }
  .btn-clear { background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da; }
  .btn-clear:hover:not(:disabled) { background:#e5e7eb; }
  .btn-print { background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; }
  button:disabled { opacity:0.6; cursor:not-allowed; }

  .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
  .cal-dow { text-align:center; font-size:10px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#5b7377; padding:4px 0; }
  .cal-day {
    border:none; background:#f7fbfb; border-radius:10px; min-height:78px;
    padding:8px 8px 6px; text-align:left; cursor:pointer; font-family:'Inter',sans-serif;
    display:flex; flex-direction:column; gap:4px; transition:transform 0.12s, box-shadow 0.12s;
    border:1.5px solid transparent; user-select:none;
  }
  .cal-day:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(30,58,64,0.12); }
  .cal-day.empty { background:transparent; cursor:default; min-height:78px; }
  .cal-day.today { box-shadow:inset 0 0 0 1.5px #1e3a40; }
  .cal-day.selected { border-color:#1e3a40; background:#1e3a40; }
  .cal-day.selected .cal-num, .cal-day.selected .cal-meta { color:#fff; }
  .cal-day.open { background:#dcfce7; }
  .cal-day.closed { background:#fee2e2; }
  .cal-hint { font-size:11.5px; color:#5b7377; margin-top:10px; }
  .date-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; max-height:92px; overflow:auto; }
  .date-chip {
    display:inline-flex; align-items:center; gap:4px;
    background:#fff; border:1px solid #c5d4d6; border-radius:99px;
    padding:2px 8px 2px 10px; font-size:11px; font-weight:700; color:#1e3a40;
  }
  .date-chip button {
    border:none; background:transparent; cursor:pointer; color:#6b7280;
    font-size:13px; line-height:1; padding:0 0 0 2px; font-weight:700;
  }
  .cal-num { font-size:13px; font-weight:700; color:#1e3a40; }
  .cal-meta { font-size:10.5px; font-weight:600; color:#4b5563; line-height:1.25; }

  .badge-open { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-closed { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-none { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#f3f4f6;color:#6b7280; }

  .toast {
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:12px 20px; border-radius:10px; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:600; color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation:fadeUp 0.25s ease both; max-width:360px;
  }
  .toast-success { background:#15803d; }
  .toast-error { background:#dc2626; }

  @media(max-width:900px) { .hours-editor { width:100% !important; } }
`;

function IBell({ s = 21 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IChevD({ s = 13 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function IChevL({ s = 16 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
}
function IChevR({ s = 16 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
function ISave({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
}
function IRefresh({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>;
}
function ICheck({ s = 11 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IClock({ s = 14 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IAlertCircle({ s = 16 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="chk-row" onClick={() => onChange(!checked)} role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}>
      <div className={`chk-box ${checked ? 'checked' : ''}`}>{checked && <ICheck s={10} />}</div>
      <span className="chk-label">{label}</span>
    </div>
  );
}

function HoursPageContent() {
  const access = useMyAccess();
  const canSave = !access.enforce || access.has('ADHRS', 'SAVE');
  const router = useRouter();
  const [navKey, setNavKey] = useState('admin-hours');
  const { toast, show: showToast } = useToast();

  const today = todayISO();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState('');
  const [rows, setRows] = useState<HoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fOpen, setFOpen] = useState(true);
  const [fStart, setFStart] = useState('09:00');
  const [fClose, setFClose] = useState('18:00');
  const [fRemarks, setFRemarks] = useState('');

  const byDate = useMemo(() => {
    const m = new Map<string, HoursRow>();
    rows.forEach((r) => m.set(r.TxnDate, r));
    return m;
  }, [rows]);

  const loadForm = useCallback((iso: string, list: HoursRow[]) => {
    const found = list.find((r) => r.TxnDate === iso);
    setFOpen(found ? found.Open : true);
    setFStart(found?.StartTime || '09:00');
    setFClose(found?.ClosingTime || '18:00');
    setFRemarks(found?.ClosingRemarks || '');
  }, []);

  const fetchMonth = useCallback(async (month: string) => {
    setLoading(true);
    setLoadError(null);
    const last = String(daysInMonth(month)).padStart(2, '0');
    const res = await apiFetch<HoursRow[]>(`${API}?from=${month}-01&to=${month}-${last}`);
    if (res.success && res.data) {
      setRows(res.data);
    } else {
      setLoadError(res.message ?? 'Failed to load operational hours');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMonth(ym); }, [ym]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(iso: string, e?: React.MouseEvent) {
    if (e?.shiftKey && anchor) {
      setPicked((prev) => mergeDates(prev, datesBetween(anchor, iso)));
      setAnchor(iso);
      return;
    }
    setPicked((prev) => {
      if (prev.includes(iso)) return prev.filter((d) => d !== iso);
      if (prev.length === 0) loadForm(iso, rows);
      return mergeDates(prev, [iso]);
    });
    setAnchor(iso);
  }

  function dropDate(iso: string) {
    setPicked((prev) => prev.filter((d) => d !== iso));
  }

  function handleClear() {
    const focus = picked[0];
    if (focus) loadForm(focus, rows);
  }

  function selectWeekdays() {
    const days = weekdaysInMonth(ym);
    setPicked((prev) => mergeDates(prev, days));
    setAnchor(days[0] ?? anchor);
  }

  async function saveDates(dates: string[], label: string) {
    if (!canSave) { showToast('You do not have permission to save', 'error'); return; }
    if (!dates.length) { showToast('Select at least one day on the calendar', 'error'); return; }
    if (dates.length > 100) { showToast('Select at most 100 days at a time', 'error'); return; }
    setSaving(true);
    try {
      const res = await apiFetch<HoursRow | HoursRow[]>(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates,
          startTime: fStart,
          closingTime: fClose,
          open: fOpen,
          closingRemarks: fRemarks,
        }),
      });
      if (!res.success) { showToast(res.message ?? 'Save failed', 'error'); return; }
      await fetchMonth(ym);
      showToast(label);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const n = picked.length;
    const when = fOpen ? `${fStart}–${fClose}` : 'Closed';
    await saveDates(picked, n === 1
      ? `Hours saved for ${longDate(picked[0])} ✓`
      : `${when} saved on ${n} days ✓`);
  }

  function handleNavigate(key: string, path: string) { setNavKey(key); router.push(path); }
  function handleLogout() { router.push('/admin-login'); }

  const HDR = '#dae6e6';
  const offset = mondayOffset(ym);
  const nDays = daysInMonth(ym);
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDays }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7 !== 0) cells.push(null);

  const primary = picked[0] ?? today;
  const selected = byDate.get(primary);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-clear" style={{ padding: 0, width: 36 }} onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month"><IChevL /></button>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1e3a40', minWidth: 160, textAlign: 'center' }}>{monthLabel(ym)}</span>
              <button className="btn-clear" style={{ padding: 0, width: 36 }} onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month"><IChevR /></button>
              <button className="btn-print" style={{ height: 36, padding: '0 12px' }} onClick={() => {
                if (ym === today.slice(0, 7)) handleSelect(today);
                else { setPicked((p) => mergeDates(p, [today])); setAnchor(today); setYm(today.slice(0, 7)); }
              }}>Today</button>
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}>
              <IBell />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}><UserName /></span>
              <IChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {(access.initial || 'S')}
            </div>
          </header>

          {loadError && !loading && (
            <div style={{ background: '#fee2e2', borderBottom: '1px solid #fca5a5', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <IAlertCircle />
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{loadError}</span>
              <button onClick={() => fetchMonth(ym)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', gap: 13 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#e8f0f1', borderRadius: 12 }}>
              <div style={{ background: '#1e3a40', borderRadius: '12px 12px 0 0', padding: '14px 18px', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Salon calendar</p>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 2 }}>OPERATIONAL HOURS</p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
                ) : (
                  <div className="cal-grid">
                    {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
                    {cells.map((iso, i) => {
                      if (!iso) return <div key={`e${i}`} className="cal-day empty" />;
                      const row = byDate.get(iso);
                      const isPicked = pickedSet.has(iso);
                      const cls = [
                        'cal-day',
                        iso === today ? 'today' : '',
                        isPicked ? 'selected' : '',
                        !isPicked && row?.Open ? 'open' : '',
                        !isPicked && row && !row.Open ? 'closed' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <button key={iso} className={cls} onClick={(e) => handleSelect(iso, e)}>
                          <span className="cal-num">{Number(iso.slice(8))}</span>
                          <span className="cal-meta">
                            {!row ? '—' : row.Open ? `${row.StartTime}–${row.ClosingTime}` : 'Closed'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="cal-hint">Click days to select · Shift-click a range · then Save once for all</p>
              </div>
            </div>

            <div className="hours-editor" style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#deeaea', borderRadius: 12 }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(30,58,64,0.1)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#5b7377', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {picked.length <= 1 ? 'Selected day' : `${picked.length} days selected`}
                </p>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a40', marginTop: 4 }}>
                  {picked.length === 0 ? 'None' : picked.length === 1 ? longDate(picked[0]) : 'Same hours for every selected day'}
                </p>
                <div style={{ marginTop: 8 }}>
                  {picked.length !== 1 ? <span className="badge-none">{picked.length} days</span> : selected ? (selected.Open ? <span className="badge-open">Open</span> : <span className="badge-closed">Closed</span>) : <span className="badge-none">Not set</span>}
                </div>
                {picked.length > 1 && (
                  <div className="date-chips">
                    {picked.map((d) => (
                      <span key={d} className="date-chip">
                        {shortDate(d)}
                        <button type="button" onClick={() => dropDate(d)} aria-label={`Remove ${d}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="sect-box">
                  <div className="sect-hdr">
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}><IClock /></span>
                    <span className="sect-hdr-title">Hours</span>
                  </div>
                  <div className="sect-body">
                    <Checkbox checked={fOpen} onChange={setFOpen} label="Open this day" />
                    <div>
                      <label className="frm-label" htmlFor="oh-start">Start</label>
                      <input id="oh-start" type="time" className="frm-input" value={fStart} onChange={(e) => setFStart(e.target.value)} disabled={!fOpen} />
                    </div>
                    <div>
                      <label className="frm-label" htmlFor="oh-close">Closing</label>
                      <input id="oh-close" type="time" className="frm-input" value={fClose} onChange={(e) => setFClose(e.target.value)} disabled={!fOpen} />
                    </div>
                    <div>
                      <label className="frm-label" htmlFor="oh-rmk">Closing remarks</label>
                      <textarea id="oh-rmk" className="frm-textarea" maxLength={MAX_RMK} value={fRemarks} onChange={(e) => setFRemarks(e.target.value)} placeholder="Holiday, staff outing…" />
                      <div className={`char-count ${fRemarks.length >= MAX_RMK ? 'warn' : ''}`}>{fRemarks.length} / {MAX_RMK}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ background: '#dce8e8', borderTop: '1.5px solid rgba(30,58,64,0.12)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {canSave && (
                  <button className="btn-save" onClick={handleSave} disabled={saving || loading || picked.length === 0}>
                    <ISave /> {saving ? 'Saving…' : picked.length > 1 ? `Save ${picked.length} days` : 'Save day'}
                  </button>
                )}
                {canSave && (
                  <button className="btn-new" onClick={selectWeekdays} disabled={saving || loading}>
                    Select weekdays this month
                  </button>
                )}
                <button className="btn-clear" onClick={() => setPicked([])} disabled={saving || picked.length === 0}>
                  Clear selection
                </button>
                <button className="btn-clear" onClick={handleClear} disabled={saving}>
                  <IRefresh s={14} /> Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function OperationalHoursPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4' }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !(has('ADMINGRP', 'ACCESS') && has('ADHRS', 'ACCESS'))) {
    return <NoAccess screen="Operational Hours" />;
  }
  return <HoursPageContent />;
}
