'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UserName from '@/components/UserName';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import NoAccess from '@/components/NoAccess';
import AccessLoading from '@/components/AccessLoading';

interface StaffRow {
  UserId: string;
  UserName: string;
  GroupId: string;
  Enable: boolean;
  WorkingLocID: string;
}
interface HoursRow {
  LocCode?: string;
  TxnDate: string;
  StartTime: string;
  ClosingTime: string;
  Open: boolean;
  ClosingRemarks: string;
}
interface SchedRow {
  LocCode?: string;
  TxnDate: string;
  StaffID: string;
  StartTime: string;
  ClosingTime: string;
  Offday: boolean;
  LeaveOn: boolean;
  Remarks: string;
}
interface LocOpt { LocCode: string; LocDes: string; }
interface Bundle {
  staff: StaffRow[];
  schedules: SchedRow[];
  hours: HoursRow[];
  locations?: LocOpt[];
  locCode?: string;
}

const API = '/api/administration/schedules';
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
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
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
function weekendsInMonth(ym: string): string[] {
  const n = daysInMonth(ym);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const day = new Date(`${iso}T00:00:00`).getDay();
    if (day === 0 || day === 6) out.push(iso);
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
  .spinner { width:32px; height:32px; border-radius:50%; border:3px solid rgba(30,58,64,0.15); border-top-color:#1e3a40; animation:spin 0.7s linear infinite; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  .frm-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 11px; height:36px; font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none;
  }
  .frm-input:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:disabled { background:#f3f6f6; color:#6b7280; }
  .frm-textarea {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:9px 11px; min-height:64px; resize:vertical;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937; background:#fff; outline:none; line-height:1.5;
  }
  .frm-label { font-size:11px; font-weight:700; color:#4b5563; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; display:block; }
  .char-count { font-size:10.5px; color:#9ca3af; text-align:right; margin-top:2px; }
  .char-count.warn { color:#dc2626; font-weight:600; }
  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr { background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%); padding:9px 14px; display:flex; align-items:center; gap:8px; }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:14px; display:flex; flex-direction:column; gap:10px; }
  .chk-row { display:flex; align-items:center; gap:8px; cursor:pointer; padding:7px 10px; border-radius:8px; user-select:none; }
  .chk-row:hover { background:rgba(30,58,64,0.05); }
  .chk-box { width:17px; height:17px; border-radius:4px; border:2px solid #9ca3af; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:#fff; }
  .chk-box.checked { background:#1e3a40; border-color:#1e3a40; }
  .chk-label { font-size:13px; font-weight:500; color:#374151; }

  .btn-save, .btn-new, .btn-clear, .btn-del, .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 16px; height:40px; border-radius:9px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.18s;
  }
  .btn-save { background:#1e3a40; color:#fff; border:none; box-shadow:0 2px 8px rgba(30,58,64,0.25); }
  .btn-save:hover:not(:disabled) { background:#162e34; }
  .btn-new { background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none; }
  .btn-clear { background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da; }
  .btn-del { background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5; }
  .btn-print { background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; }
  button:disabled { opacity:0.6; cursor:not-allowed; }

  .srv-list-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; border:none; background:transparent; width:100%;
    text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }
  .srv-list-item .mini-chk {
    width:16px; height:16px; border-radius:4px; border:2px solid #9ca3af; flex-shrink:0; background:#fff;
    display:flex; align-items:center; justify-content:center;
  }
  .srv-list-item.active .mini-chk { background:#1e3a40; border-color:#1e3a40; color:#fff; }

  .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
  .cal-dow { text-align:center; font-size:10px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#5b7377; padding:4px 0; }
  .cal-dow.wknd { background:#ede9fe; color:#6d28d9; border-radius:8px; }
  .cal-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  .cal-actions .btn-new, .cal-actions .btn-clear { height:36px; padding:0 14px; }
  .cal-day {
    border:1.5px solid transparent; background:#f7fbfb; border-radius:10px; min-height:74px;
    padding:8px 8px 6px; text-align:left; cursor:pointer; font-family:'Inter',sans-serif;
    display:flex; flex-direction:column; gap:4px; user-select:none;
  }
  .cal-day:hover { box-shadow:0 2px 8px rgba(30,58,64,0.12); }
  .cal-day.empty { background:transparent; cursor:default; }
  .cal-day.empty.wknd { background:#f3eefc; }
  .cal-day.wknd:not(.selected):not(.work):not(.off):not(.leave):not(.shop-closed) { background:#efe7f8; }
  .cal-day.today { box-shadow:inset 0 0 0 1.5px #1e3a40; }
  .cal-day.selected { border-color:#1e3a40; background:#1e3a40; }
  .cal-day.selected .cal-num, .cal-day.selected .cal-meta { color:#fff; }
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
  .cal-day.work { background:#dcfce7; }
  .cal-day.off { background:#fef3c7; }
  .cal-day.leave { background:#ede9fe; }
  .cal-day.shop-closed { background:#fee2e2; cursor:not-allowed; opacity:0.85; }
  .cal-day.shop-closed:hover { box-shadow:none; }
  .cal-rmk { font-size:10px; font-weight:600; color:#b45309; line-height:1.2; max-height:2.4em; overflow:hidden; }
  .cal-day.selected .cal-rmk { color:#fde68a; }
  .loc-select {
    border:1.5px solid #c0cbcc; border-radius:10px; height:40px; padding:0 12px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#1e3a40; background:#fff;
  }
  .cal-num { font-size:13px; font-weight:700; color:#1e3a40; }
  .cal-meta { font-size:10.5px; font-weight:600; color:#4b5563; line-height:1.25; }

  .badge-active { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-off { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e; }
  .badge-leave { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#ede9fe;color:#6d28d9; }
  .badge-none { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#f3f4f6;color:#6b7280; }

  .toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 20px; border-radius:10px; font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#fff; box-shadow:0 4px 20px rgba(0,0,0,0.2); animation:fadeUp 0.25s ease both; max-width:360px; }
  .toast-success { background:#15803d; }
  .toast-error { background:#dc2626; }
  @media(max-width:767px) { .left-panel { display:none !important; } }
`;

function IBell({ s = 21 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function ISearch({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
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
function ITrash({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function ICheck({ s = 11 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IUser({ s = 16 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
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

function SchedulesPageContent() {
  const access = useMyAccess();
  const canSave = !access.enforce || access.has('ADSCH', 'SAVE');
  const canDelete = !access.enforce || access.has('ADSCH', 'DELETE');
  const router = useRouter();
  const [navKey, setNavKey] = useState('admin-schedules');
  const { toast, show: showToast } = useToast();

  const today = todayISO();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState('');
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [selStaff, setSelStaff] = useState<StaffRow[]>([]);
  const [locCode, setLocCode] = useState('');
  const [locations, setLocations] = useState<LocOpt[]>([]);
  const [schedules, setSchedules] = useState<SchedRow[]>([]);
  const [hours, setHours] = useState<HoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [fOff, setFOff] = useState(false);
  const [fLeave, setFLeave] = useState(false);
  const [fStart, setFStart] = useState('09:00');
  const [fClose, setFClose] = useState('18:00');
  const [fRemarks, setFRemarks] = useState('');

  const selIds = useMemo(() => new Set(selStaff.map((s) => s.UserId)), [selStaff]);
  const mine = useMemo(
    () => schedules.filter((r) => selIds.has(r.StaffID)),
    [schedules, selIds],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, SchedRow[]>();
    mine.forEach((r) => {
      const list = m.get(r.TxnDate) ?? [];
      list.push(r);
      m.set(r.TxnDate, list);
    });
    return m;
  }, [mine]);
  function shopOpen(iso: string): boolean {
    return hoursByDate.get(iso)?.Open === true;
  }
  const hoursByDate = useMemo(() => {
    const m = new Map<string, HoursRow>();
    hours.forEach((r) => m.set(r.TxnDate, r));
    return m;
  }, [hours]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => s.UserName.toLowerCase().includes(q) || s.UserId.toLowerCase().includes(q));
  }, [staff, search]);

  const loadForm = useCallback((iso: string, list: SchedRow[], shop: HoursRow[]) => {
    const found = list.find((r) => r.TxnDate === iso);
    const h = shop.find((r) => r.TxnDate === iso);
    setFOff(found?.Offday ?? false);
    setFLeave(found?.LeaveOn ?? false);
    setFStart(found?.StartTime || h?.StartTime || '09:00');
    setFClose(found?.ClosingTime || h?.ClosingTime || '18:00');
    setFRemarks(found?.Remarks || '');
  }, []);

  const fetchMonth = useCallback(async (month: string) => {
    setLoading(true);
    setLoadError(null);
    const last = String(daysInMonth(month)).padStart(2, '0');
    const locQ = locCode ? `&locCode=${encodeURIComponent(locCode)}` : '';
    const res = await apiFetch<Bundle>(`${API}?from=${month}-01&to=${month}-${last}${locQ}`);
    if (res.success && res.data) {
      setStaff(res.data.staff);
      setSchedules(res.data.schedules);
      setHours(res.data.hours);
      const locs = res.data.locations ?? [];
      setLocations(locs);
      const nextLoc = res.data.locCode || locCode || access.workLoc || locs[0]?.LocCode || '';
      if (nextLoc && nextLoc !== locCode) setLocCode(nextLoc);
      setSelStaff((prev) => {
        const keep = prev.filter((p) => res.data!.staff.some((s) => s.UserId === p.UserId));
        if (keep.length) return keep;
        return res.data!.staff[0] ? [res.data!.staff[0]] : [];
      });
    } else {
      setLoadError(res.message ?? 'Failed to load staff schedules');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMonth(ym); }, [ym, locCode]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectDay(iso: string, e?: React.MouseEvent) {
    if (!shopOpen(iso)) {
      showToast('This location is closed (or hours are not set) — staff cannot be scheduled', 'error');
      return;
    }
    if (e?.shiftKey && anchor) {
      const range = datesBetween(anchor, iso).filter((d) => shopOpen(d));
      setPicked((prev) => mergeDates(prev, range));
      setAnchor(iso);
      return;
    }
    setPicked((prev) => {
      if (prev.includes(iso)) return prev.filter((d) => d !== iso);
      if (prev.length === 0) loadForm(iso, mine, hours);
      return mergeDates(prev, [iso]);
    });
    setAnchor(iso);
  }

  function dropDate(iso: string) {
    setPicked((prev) => prev.filter((d) => d !== iso));
  }

  function handleSelectStaff(s: StaffRow) {
    setSelStaff((prev) => {
      const on = prev.some((p) => p.UserId === s.UserId);
      const next = on ? prev.filter((p) => p.UserId !== s.UserId) : [...prev, s];
      const their = schedules.filter((r) => next.some((p) => p.UserId === r.StaffID));
      loadForm(picked[0] ?? '', their, hours);
      return next;
    });
  }

  function handleClear() {
    const focus = picked[0];
    if (focus) loadForm(focus, mine, hours);
  }

  function selectWeekdays() {
    const days = weekdaysInMonth(ym).filter((d) => shopOpen(d));
    if (!days.length) { showToast('No open weekdays this month at this location', 'error'); return; }
    setPicked((prev) => mergeDates(prev, days));
    setAnchor(days[0] ?? anchor);
  }

  function selectWeekends() {
    const days = weekendsInMonth(ym).filter((d) => shopOpen(d));
    if (!days.length) { showToast('No open weekends this month at this location', 'error'); return; }
    setPicked((prev) => mergeDates(prev, days));
    setAnchor(days[0] ?? anchor);
  }

  function useSalonHours() {
    const h = hoursByDate.get(picked[0] ?? '');
    if (!h) { showToast('No salon hours set for this day', 'error'); return; }
    setFOff(false);
    setFLeave(false);
    setFStart(h.StartTime);
    setFClose(h.ClosingTime);
    if (!h.Open) setFOff(true);
  }

  async function saveDates(dates: string[], label: string) {
    if (!canSave) { showToast('You do not have permission to save', 'error'); return; }
    if (!locCode) { showToast('Select a location first', 'error'); return; }
    if (!selStaff.length) { showToast('Select at least one staff member', 'error'); return; }
    if (!dates.length) { showToast('Select at least one day on the calendar', 'error'); return; }
    if (dates.length > 100) { showToast('Select at most 100 days at a time', 'error'); return; }
    setSaving(true);
    try {
      const res = await apiFetch<SchedRow | SchedRow[]>(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locCode,
          staffIds: selStaff.map((s) => s.UserId),
          dates,
          startTime: fStart,
          closingTime: fClose,
          offday: fOff,
          leaveOn: fLeave,
          remarks: fRemarks,
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
    const who = selStaff.length === 1 ? selStaff[0].UserName : `${selStaff.length} staff`;
    const n = picked.length;
    await saveDates(picked, n === 1
      ? `Schedule saved for ${who} · ${longDate(picked[0])} ✓`
      : `Schedule saved for ${who} on ${n} days ✓`);
  }

  async function handleDelete() {
    if (!canDelete) { showToast('You do not have permission to delete', 'error'); return; }
    if (!selStaff.length) return;
    const existing = picked.filter((d) => byDate.has(d));
    if (!existing.length) { showToast('Nothing to delete on the selected days', 'error'); return; }
    const who = selStaff.length === 1 ? selStaff[0].UserName : `${selStaff.length} staff`;
    if (!confirm(`Remove ${who}'s schedule on ${existing.length} day${existing.length > 1 ? 's' : ''} at this location?`)) return;
    setDeleting(true);
    try {
      const res = await apiFetch(
        `${API}?locCode=${encodeURIComponent(locCode)}&staffIds=${encodeURIComponent(selStaff.map((s) => s.UserId).join(','))}&dates=${encodeURIComponent(existing.join(','))}`,
        { method: 'DELETE' },
      );
      if (!res.success) { showToast(res.message ?? 'Delete failed', 'error'); return; }
      await fetchMonth(ym);
      showToast(existing.length === 1 ? 'Schedule removed' : `Removed ${existing.length} days`);
    } finally {
      setDeleting(false);
    }
  }

  function handleNavigate(key: string, path: string) { setNavKey(key); router.push(path); }
  function handleLogout() { router.push('/admin-login'); }

  const HDR = '#dae6e6';
  const offset = mondayOffset(ym);
  const nDays = daysInMonth(ym);
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDays }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7 !== 0) cells.push(null);

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const selectedRows = byDate.get(picked[0] ?? '') ?? [];
  const selected = selectedRows[0];
  const shop = hoursByDate.get(picked[0] ?? '');
  const away = fOff || fLeave;
  const hasExisting = picked.some((d) => byDate.has(d));

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', opacity: 0.4 }}><ISearch /></span>
              <input
                style={{ border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 38px', height: 40, width: 240, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937', background: '#fff', outline: 'none' }}
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="loc-select"
              value={locCode}
              onChange={(e) => { setLocCode(e.target.value); setPicked([]); setAnchor(''); }}
              aria-label="Location"
            >
              {locations.length === 0 && <option value="">No locations</option>}
              {locations.map((l) => (
                <option key={l.LocCode} value={l.LocCode}>{l.LocDes || l.LocCode}</option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-clear" style={{ padding: 0, width: 36 }} onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month"><IChevL /></button>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1e3a40', minWidth: 160, textAlign: 'center' }}>{monthLabel(ym)}</span>
              <button className="btn-clear" style={{ padding: 0, width: 36 }} onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month"><IChevR /></button>
              <button className="btn-print" style={{ height: 36, padding: '0 12px' }} onClick={() => {
                if (ym === today.slice(0, 7)) handleSelectDay(today);
                else { setPicked((p) => mergeDates(p, [today])); setAnchor(today); setYm(today.slice(0, 7)); }
              }}>Today</button>
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', padding: 4 }}><IBell /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}><UserName /></span>
              <IChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {access.initial || 'S'}
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
            <div className="left-panel" style={{ width: 240, flexShrink: 0, background: '#deeaea', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(30,58,64,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>Staff</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{staff.length}</span>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {loading && staff.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div className="spinner" /></div>
                ) : filteredStaff.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '2rem 0' }}>
                    {search ? 'No matching staff' : 'No staff assigned to this location'}
                  </p>
                ) : filteredStaff.map((s) => (
                  <button
                    key={s.UserId}
                    className={`srv-list-item ${selIds.has(s.UserId) ? 'active' : ''}`}
                    onClick={() => handleSelectStaff(s)}
                  >
                    <span className="mini-chk">{selIds.has(s.UserId) ? <ICheck s={10} /> : null}</span>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: s.Enable ? 'linear-gradient(135deg,#1e3a40,#2a5260)' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                      <IUser s={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.UserName || s.UserId}
                      </p>
                      <p style={{ fontSize: 11, color: '#6b7280' }}>{s.UserId}</p>
                    </div>
                    <span className={s.Enable ? 'badge-active' : 'badge-inactive'}>{s.Enable ? 'On' : 'Off'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#e8f0f1', borderRadius: 12 }}>
              <div style={{ background: '#1e3a40', borderRadius: '12px 12px 0 0', padding: '14px 18px', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {selStaff.length === 0 ? 'No staff selected' : selStaff.length === 1 ? selStaff[0].UserName : `${selStaff.length} staff selected`}
                </p>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 2 }}>STAFF SCHEDULE</p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                {!selStaff.length ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', paddingTop: 48, fontSize: 13 }}>Select staff to edit this location’s month</p>
                ) : loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
                ) : (
                  <div className="cal-grid">
                    {DOW.map((d, i) => <div key={d} className={`cal-dow${i >= 5 ? ' wknd' : ''}`}>{d}</div>)}
                    {cells.map((iso, i) => {
                      const wknd = i % 7 >= 5;
                      if (!iso) return <div key={`e${i}`} className={`cal-day empty${wknd ? ' wknd' : ''}`} />;
                      const rowsFor = byDate.get(iso) ?? [];
                      const row = rowsFor[0];
                      const open = shopOpen(iso);
                      const closed = !open;
                      const kind = !open ? 'shop-closed' : row?.LeaveOn ? 'leave' : row?.Offday ? 'off' : row ? 'work' : '';
                      const isPicked = pickedSet.has(iso);
                      const cls = ['cal-day', wknd ? 'wknd' : '', iso === today ? 'today' : '', isPicked ? 'selected' : '', !isPicked ? kind : ''].filter(Boolean).join(' ');
                      const shopRow = hoursByDate.get(iso);
                      const meta = !open
                        ? (shopRow ? 'Closed' : 'Not set')
                        : row?.LeaveOn ? 'Leave' : row?.Offday ? 'Off' : row ? `${row.StartTime}–${row.ClosingTime}` : '—';
                      return (
                        <button key={iso} className={cls} onClick={(e) => handleSelectDay(iso, e)} disabled={closed}>
                          <span className="cal-num">{Number(iso.slice(8))}</span>
                          <span className="cal-meta">{meta}</span>
                          {closed && shopRow?.ClosingRemarks ? <span className="cal-rmk">{shopRow.ClosingRemarks}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selStaff.length > 0 && !loading && (
                  <>
                    <div className="cal-actions">
                      {canSave && (
                        <button className="btn-new" onClick={selectWeekdays} disabled={saving || deleting || !selStaff.length}>
                          Select weekdays this month
                        </button>
                      )}
                      {canSave && (
                        <button className="btn-new" onClick={selectWeekends} disabled={saving || deleting || !selStaff.length}>
                          Select weekends this month
                        </button>
                      )}
                      <button className="btn-clear" onClick={() => setPicked([])} disabled={saving || deleting || picked.length === 0}>
                        Clear selection
                      </button>
                      <button className="btn-clear" onClick={handleClear} disabled={saving || deleting}>
                        <IRefresh s={14} /> Reset
                      </button>
                    </div>
                    <p className="cal-hint">Closed / unset days cannot be selected · Click open days · Shift-click a range · Save once for selected staff</p>
                  </>
                )}
              </div>
            </div>

            <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#deeaea', borderRadius: 12 }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(30,58,64,0.1)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#5b7377', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {picked.length <= 1 ? 'Selected day' : `${picked.length} days selected`}
                </p>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a40', marginTop: 4 }}>
                  {picked.length === 0 ? 'None' : picked.length === 1 ? longDate(picked[0]) : 'Same shift for every selected day'}
                </p>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {picked.length !== 1 && <span className="badge-none">{picked.length} days</span>}
                  {picked.length === 1 && !selected && <span className="badge-none">Not set</span>}
                  {picked.length === 1 && selected?.LeaveOn && <span className="badge-leave">Leave</span>}
                  {picked.length === 1 && selected?.Offday && <span className="badge-off">Off day</span>}
                  {picked.length === 1 && selected && !selected.Offday && !selected.LeaveOn && <span className="badge-active">{selected.StartTime}–{selected.ClosingTime}</span>}
                  {picked.length === 1 && shop && !shop.Open && <span className="badge-inactive">Salon closed</span>}
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
                  <div className="sect-hdr"><span className="sect-hdr-title">Shift</span></div>
                  <div className="sect-body">
                    <Checkbox checked={fOff} onChange={setFOff} label="Off day" />
                    <Checkbox checked={fLeave} onChange={setFLeave} label="Leave on" />
                    <div>
                      <label className="frm-label" htmlFor="ss-start">Start</label>
                      <input id="ss-start" type="time" className="frm-input" value={fStart} onChange={(e) => setFStart(e.target.value)} disabled={away} />
                    </div>
                    <div>
                      <label className="frm-label" htmlFor="ss-close">Closing</label>
                      <input id="ss-close" type="time" className="frm-input" value={fClose} onChange={(e) => setFClose(e.target.value)} disabled={away} />
                    </div>
                    <div>
                      <label className="frm-label" htmlFor="ss-rmk">Remarks</label>
                      <textarea id="ss-rmk" className="frm-textarea" maxLength={MAX_RMK} value={fRemarks} onChange={(e) => setFRemarks(e.target.value)} placeholder="Notes…" />
                      <div className={`char-count ${fRemarks.length >= MAX_RMK ? 'warn' : ''}`}>{fRemarks.length} / {MAX_RMK}</div>
                    </div>
                    <button className="btn-clear" style={{ height: 34 }} onClick={useSalonHours} disabled={!shop}>
                      Use salon hours{shop ? ` (${shop.Open ? `${shop.StartTime}–${shop.ClosingTime}` : 'closed'})` : ''}
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ background: '#dce8e8', borderTop: '1.5px solid rgba(30,58,64,0.12)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {canSave && (
                  <button className="btn-save" onClick={handleSave} disabled={saving || deleting || !selStaff.length || picked.length === 0}>
                    <ISave /> {saving ? 'Saving…' : picked.length > 1 ? `Save ${picked.length} days` : 'Save day'}
                  </button>
                )}
                {canDelete && (
                  <button className="btn-del" onClick={handleDelete} disabled={saving || deleting || !selStaff.length || !hasExisting}>
                    <ITrash s={14} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function StaffSchedulesPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4' }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !(has('ADMINGRP', 'ACCESS') && has('ADSCH', 'ACCESS'))) {
    return <NoAccess screen="Staff Schedules" />;
  }
  return <SchedulesPageContent />;
}
