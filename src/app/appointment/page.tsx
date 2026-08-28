// src/app/appointment/page.tsx
'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface Appointment {
  id: string;
  bookingID: string;
  locCode: string;
  cusCode: string;
  clientName: string;
  clientPhone: string;
  providerName: string;
  techID: string;
  serviceName: string;
  serviceNames: string[];
  date: string;
  timeSlot: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'ongoing';
  mode: 'pre_booked' | 'without_confirmation';
  location: string;
  duration: number;
  price: number;
  gender: string;
  notes?: string;
  guests: string[];
  detailCount: number;
  txnDateTime: string;
}

interface Stats {
  total: number;
  confirmed: number;
  cancelled: number;
  pending: number;
  ongoing: number;
}

interface ToastMsg {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function todayISO() { return new Date().toISOString().split('T')[0]; }

function fmtDateNav(iso: string) {
  const d  = new Date(iso + 'T00:00');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${mo} / ${String(d.getDate()).padStart(2,'0')} / ${d.getFullYear()}`;
}
function fmtDateLong(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function shiftDate(iso: string, days: number) {
  const d = new Date(iso + 'T00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function isoFromYMD(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function parseSlotToMinutes(slot: string): number {
  if (!slot) return 0;
  const parts = slot.trim().split(' ');
  if (parts.length < 2) return 0;
  const [time, ap] = parts;
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr); const m = Number(mStr || 0);
  if (ap?.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (ap?.toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}
function minutesToSlotLabel(mins: number): string {
  let h = Math.floor(mins / 60) % 24;
  const m  = ((mins % 60) + 60) % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  let h12  = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
}
function computePeriod(d: string): 'today' | 'tomorrow' | 'dayafter' | '' {
  const t = todayISO();
  if (d === t)               return 'today';
  if (d === shiftDate(t, 1)) return 'tomorrow';
  if (d === shiftDate(t, 2)) return 'dayafter';
  return '';
}
function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TIME_SLOTS   = ['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM'];
const SLOT_MINUTES = 30;

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp   { from{opacity:0;transform:translateY(5px);}  to{opacity:1;transform:none;} }
  @keyframes slideUp  { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:none;} }
  @keyframes popIn    { from{opacity:0;transform:scale(0.95) translateY(-6px);} to{opacity:1;transform:scale(1) translateY(0);} }
  @keyframes scaleIn  { from{opacity:0;transform:scale(0.92);} to{opacity:1;transform:scale(1);} }
  @keyframes spin     { to{transform:rotate(360deg);} }
  @keyframes shimmer  { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
  @keyframes livePulseBlue { 0%{box-shadow:0 0 0 0 rgba(59,130,246,0.5);} 70%{box-shadow:0 0 0 7px rgba(59,130,246,0);} 100%{box-shadow:0 0 0 0 rgba(59,130,246,0);} }
  @keyframes dropSuccess   { 0%{box-shadow:0 0 0 0 rgba(34,197,94,0.7);} 60%{box-shadow:0 0 0 10px rgba(34,197,94,0);} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0);} }

  .fade-up  { animation:fadeUp  0.2s ease both; }
  .slide-up { animation:slideUp 0.25s ease both; }
  .pop-in   { animation:popIn   0.18s cubic-bezier(.34,1.56,.64,1) both; }
  .scale-in { animation:scaleIn 0.2s cubic-bezier(.34,1.56,.64,1) both; }
  .drop-success { animation:dropSuccess 0.6s ease-out; }

  .skeleton { background:linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; border-radius:8px; }

  ::-webkit-scrollbar       { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.2); border-radius:4px; }

  /* ── Schedule Table ── */
  .sch-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
  .sch-tbl thead th {
    font-family:'Inter',sans-serif; font-size:12px; font-weight:600; color:#374151;
    padding:10px 10px; text-align:left; background:#dce8e8;
    white-space:nowrap; border-bottom:1px solid rgba(30,58,64,0.1);
    position:sticky; top:0; z-index:2;
  }
  .sch-tbl thead th:first-child { width:76px; }
  .sch-tbl tbody tr:nth-child(odd)  td { background:#e2ecec; }
  .sch-tbl tbody tr:nth-child(even) td { background:#d8e4e4; }
  .sch-tbl td {
    padding:0 8px; height:52px;
    font-family:'Inter',sans-serif; font-size:12px; vertical-align:middle;
    border-bottom:1px solid rgba(0,0,0,0.03); transition:background 0.1s;
  }
  .sch-tbl td.occ-cell { vertical-align:top; padding:4px 6px; }

  .drop-valid   { background:rgba(34,197,94,0.18)  !important; outline:2px dashed rgba(34,197,94,0.6); outline-offset:-2px; }
  .drop-invalid { background:rgba(239,68,68,0.15)  !important; outline:2px dashed rgba(239,68,68,0.5); outline-offset:-2px; }
  .drop-hover-v { background:rgba(34,197,94,0.32)  !important; outline:2px dashed rgba(34,197,94,0.7); outline-offset:-2px; }
  .drop-hover-i { background:rgba(239,68,68,0.28)  !important; outline:2px dashed rgba(239,68,68,0.6); outline-offset:-2px; cursor:not-allowed; }

  /* ── Pills ── */
  .appt-pill {
    display:flex; flex-direction:column; gap:1px; border-radius:7px; padding:6px 8px;
    font-size:11px; font-weight:600; width:100%; height:100%;
    overflow:hidden; cursor:grab;
    transition:opacity 0.15s, transform 0.15s, box-shadow 0.15s;
    border:none; font-family:'Inter',sans-serif; text-align:left;
    user-select:none; -webkit-user-select:none;
  }
  .appt-pill:active         { cursor:grabbing; }
  .appt-pill:hover          { transform:scale(1.02); box-shadow:0 4px 14px rgba(0,0,0,0.15); }
  .appt-pill.dragging       { opacity:0.35; }
  .appt-pill.locked-pill    { cursor:not-allowed; }
  .appt-pill.locked-pill:hover { transform:none; box-shadow:none; }
  .appt-pill .ap-service    { font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:3px; }
  .appt-pill .ap-time       { font-size:10px; font-weight:600; opacity:0.85; white-space:nowrap; }
  .appt-pill .ap-client     { font-size:10px; font-weight:500; opacity:0.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-pill .ap-meta       { display:flex; gap:4px; flex-wrap:wrap; margin-top:1px; }
  .pill-confirmed { background:rgba(34,197,94,0.13);  color:#15803d; border:1px solid rgba(34,197,94,0.25); }
  .pill-pending   { background:rgba(245,158,11,0.13); color:#b45309; border:1px solid rgba(245,158,11,0.25); }
  .pill-cancelled { background:rgba(239,68,68,0.1);   color:#b91c1c; border:1px solid rgba(239,68,68,0.22); }
  .pill-ongoing   { background:rgba(59,130,246,0.13); color:#1d4ed8; border:1px solid rgba(59,130,246,0.3); animation:livePulseBlue 2s infinite; }
  .live-dot-blue  { width:6px; height:6px; border-radius:50%; background:#2563eb; display:inline-block; flex-shrink:0; }

  /* ── Badges ── */
  .badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:99px;
    font-size:10px; font-weight:700; font-family:'Inter',sans-serif;
    text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap;
  }
  .mini-badge {
    display:inline-flex; align-items:center; padding:1.5px 5px; border-radius:99px;
    font-size:9px; font-weight:700; font-family:'Inter',sans-serif;
    text-transform:uppercase; letter-spacing:0.03em; white-space:nowrap;
  }
  .b-ok  { background:rgba(34,197,94,0.12);  color:#15803d; }
  .b-pnd { background:rgba(245,158,11,0.12); color:#b45309; }
  .b-can { background:rgba(239,68,68,0.1);   color:#b91c1c; }
  .b-ong { background:rgba(59,130,246,0.1);  color:#1d4ed8; }
  .b-wlk { background:rgba(56,178,172,0.1);  color:#0f766e; }
  .b-pre { background:rgba(30,58,64,0.08);   color:#1e3a40; }

  /* ── Filters ── */
  .f-sel {
    appearance:none; -webkit-appearance:none;
    border-radius:8px; border:1px solid rgba(0,0,0,0.1);
    padding:7px 28px 7px 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:12px; color:#374151;
    background:#d8e4e4 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;
    cursor:pointer; outline:none; min-width:110px;
  }
  .f-sel:focus { outline:2px solid #1e3a40; outline-offset:1px; }

  .srch {
    border:1.5px solid #c0cbcc; border-radius:10px;
    padding:0 14px 0 38px; height:40px; width:260px;
    font-family:'Inter',sans-serif; font-size:14px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s;
  }
  .srch:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .srch::placeholder { color:rgba(0,0,0,0.35); }

  .nav-arr { background:none; border:none; cursor:pointer; color:#1e3a40; display:flex; align-items:center; padding:5px 6px; border-radius:7px; transition:background 0.15s; }
  .nav-arr:hover { background:rgba(0,0,0,0.07); }

  .date-trigger { display:flex; align-items:center; gap:6px; background:none; border:none; cursor:pointer; font-family:'Inter',sans-serif; font-size:15px; font-weight:600; color:#1f2937; padding:4px 8px; border-radius:8px; transition:background 0.15s; white-space:nowrap; }
  .date-trigger:hover { background:rgba(30,58,64,0.08); }

  .view-btn { padding:4px 13px; border-radius:6px; border:none; font-family:'Inter',sans-serif; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; background:transparent; color:#6b7280; }
  .view-btn.active { background:#fff; color:#1e3a40; box-shadow:0 1px 4px rgba(0,0,0,0.12); }

  /* ── Calendar ── */
  .cal-popup { position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); background:#fff; border-radius:14px; padding:14px; box-shadow:0 8px 32px rgba(0,0,0,0.18); border:1px solid rgba(30,58,64,0.1); z-index:500; min-width:270px; }
  .cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .cal-nav { width:28px; height:28px; border-radius:7px; border:none; background:transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#374151; transition:background 0.15s; }
  .cal-nav:hover { background:rgba(30,58,64,0.08); }
  .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
  .cal-daylbl { text-align:center; font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; padding:4px 0 6px; }
  .cal-day { text-align:center; padding:5px 2px; border-radius:7px; font-size:12px; font-weight:500; color:#374151; cursor:pointer; transition:background 0.12s; border:none; background:transparent; font-family:'Inter',sans-serif; }
  .cal-day:hover:not(:disabled) { background:rgba(30,58,64,0.08); }
  .cal-day.selected    { background:#1e3a40 !important; color:#fff !important; font-weight:700; }
  .cal-day.today       { color:#1e3a40; font-weight:700; box-shadow:inset 0 0 0 1.5px #1e3a40; }
  .cal-day.other-month { color:#c4cdd4; }
  .cal-month-title { font-size:14px; font-weight:700; color:#1f2937; cursor:pointer; padding:3px 7px; border-radius:6px; transition:background 0.12s; font-family:'Inter',sans-serif; border:none; background:transparent; }
  .cal-month-title:hover { background:rgba(30,58,64,0.07); }
  .month-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:4px; }
  .month-item { text-align:center; padding:7px 4px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; transition:background 0.12s; border:none; background:transparent; font-family:'Inter',sans-serif; color:#374151; }
  .month-item:hover { background:rgba(30,58,64,0.08); }
  .month-item.sel-mo { background:#1e3a40; color:#fff; font-weight:700; }
  .year-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-top:4px; }
  .year-item { text-align:center; padding:7px 2px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; transition:background 0.12s; border:none; background:transparent; font-family:'Inter',sans-serif; color:#374151; }
  .year-item:hover { background:rgba(30,58,64,0.08); }
  .year-item.sel-yr { background:#1e3a40; color:#fff; font-weight:700; }

  /* ── Modal ── */
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:flex-end; justify-content:center; backdrop-filter:blur(5px); }
  .modal-box { background:#fff; border-radius:20px 20px 0 0; width:100%; max-width:560px; max-height:93vh; overflow-y:auto; box-shadow:0 -8px 40px rgba(0,0,0,0.2); font-family:'Inter',sans-serif; }
  @media(min-width:700px) { .modal-bg { align-items:center; padding:16px; } .modal-box { border-radius:18px; } }

  .modal-action-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .btn-modal-cancel    { display:flex; align-items:center; justify-content:center; gap:8px; padding:13px 12px; border-radius:12px; background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5; font-family:'Inter',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.18s; }
  .btn-modal-cancel:hover { background:#fee2e2; transform:translateY(-1px); }
  .btn-modal-confirm   { display:flex; align-items:center; justify-content:center; gap:8px; padding:13px 12px; border-radius:12px; background:#1e3a40; color:#fff; border:1.5px solid #1e3a40; font-family:'Inter',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.18s; }
  .btn-modal-confirm:hover { background:#162e34; transform:translateY(-1px); }
  .btn-modal-checkin   { display:flex; align-items:center; justify-content:center; gap:8px; padding:13px 12px; border-radius:12px; background:#1e3a40; color:#fff; border:1.5px solid #1e3a40; font-family:'Inter',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.18s; }
  .btn-modal-checkin:hover { background:#162e34; transform:translateY(-1px); }
  .btn-modal-reschedule { display:flex; align-items:center; justify-content:center; gap:8px; padding:13px 12px; border-radius:12px; background:#fffbeb; color:#b45309; border:1.5px solid #fcd34d; font-family:'Inter',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.18s; width:100%; }
  .btn-modal-reschedule:hover { background:#fef3c7; transform:translateY(-1px); }
  .btn-modal-bill { display:flex; align-items:center; justify-content:center; gap:8px; padding:13px 12px; border-radius:12px; background:#2563eb; color:#fff; border:1.5px solid #2563eb; font-family:'Inter',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.18s; width:100%; }
  .btn-modal-bill:hover { background:#1d4ed8; transform:translateY(-1px); }

  /* ── Toast ── */
  .toast { background:#1e3a40; color:#fff; border-radius:12px; padding:12px 22px; font-family:'Inter',sans-serif; font-size:13px; font-weight:600; box-shadow:0 4px 20px rgba(0,0,0,0.25); z-index:99999; display:flex; align-items:center; gap:9px; white-space:nowrap; animation:slideUp 0.25s ease both; }
  .toast.success { background:#15803d; }
  .toast.error   { background:#b91c1c; }

  /* ── Card ── */
  .appt-card { background:#fff; border-radius:12px; border:1px solid #c8d6d8; padding:13px; display:flex; flex-direction:column; gap:9px; cursor:pointer; transition:box-shadow 0.18s, transform 0.15s; }
  .appt-card:hover { box-shadow:0 4px 16px rgba(0,0,0,0.1); transform:translateY(-1px); }

  /* ── Refresh btn ── */
  .refresh-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; border:1.5px solid rgba(30,58,64,0.2); background:rgba(30,58,64,0.05); color:#1e3a40; font-family:'Inter',sans-serif; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; }
  .refresh-btn:hover { background:rgba(30,58,64,0.1); }
  .refresh-btn.spinning svg { animation:spin 0.8s linear infinite; }

  /* ── Empty state ── */
  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:60px 20px; color:#9ca3af; }
  .empty-ico { width:56px; height:56px; border-radius:50%; background:rgba(30,58,64,0.08); display:flex; align-items:center; justify-content:center; }

  /* ── Notification / Profile dropdowns ── */
  .notif-dropdown, .profile-dropdown { position:absolute; top:calc(100% + 10px); right:0; background:#fff; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,0.18); border:1px solid rgba(30,58,64,0.1); z-index:600; overflow:hidden; }
  .notif-dropdown { width:300px; max-width:88vw; }
  .notif-item { display:flex; gap:8px; padding:10px 14px; border-bottom:1px solid #f3f4f6; cursor:default; transition:background 0.12s; }
  .notif-item:hover { background:#f8fafb; }
  .notif-dot { position:absolute; top:1px; right:1px; min-width:15px; height:15px; padding:0 3px; border-radius:99px; background:#ef4444; border:2px solid #dae6e6; color:#fff; font-size:9px; font-weight:800; display:flex; align-items:center; justify-content:center; font-family:'Inter',sans-serif; }
  .profile-dropdown { width:170px; padding:6px; display:flex; flex-direction:column; }
  .profile-item { text-align:left; padding:9px 12px; border-radius:8px; border:none; background:none; font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#374151; cursor:pointer; transition:background 0.12s; }
  .profile-item:hover { background:#f3f4f6; }

  @media(max-width:900px) { .stats-flex { flex-direction:column !important; } }
  @media(max-width:767px) { .main-body { padding-bottom:72px !important; } .hdr-name { display:none !important; } }
  @media(max-width:640px) {
    .toolbar-row  { flex-direction:column; align-items:flex-start !important; }
    .filters-row  { flex-direction:column; align-items:stretch !important; }
    .filters-row .f-sel { width:100% !important; }
    .filters-row > div:last-child { margin-left:0 !important; width:100%; justify-content:space-between; }
  }
  @media(max-width:480px) { .srch { width:100% !important; } .srch-wrap { flex:1 !important; } }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const Ico = {
  Bell:     ()=><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Search:   ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ChevD:    ({s=13}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevL:    ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevR:    ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  X:        ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Clock:    ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Loc:      ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  CalSm:    ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Appt:     ({s=24}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/></svg>,
  Check:    ({s=24}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Pending:  ({s=24}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Cancel:   ({s=24}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  Live:     ({s=24}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>,
  Refresh:  ({s=15,spin=false}:{s?:number,spin?:boolean})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={spin?{animation:'spin 0.8s linear infinite'}:{}}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>,
  CheckCircle: ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  XCircle:  ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  Login:    ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
  Receipt:  ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  Inbox:    ()=><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  Plus:     ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  Users:    ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Lock:     ({s=10}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Reschedule: ({s=18}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 8 8 8"/></svg>,
};

/* ─────────────────────────────────────────
   BADGES
───────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const lo = status.toLowerCase();
  if (lo === 'confirmed') return <span className="badge b-ok"  style={{background:'#dcfce7',color:'#15803d'}}><span style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',display:'inline-block'}}/> Confirmed</span>;
  if (lo === 'cancelled') return <span className="badge b-can" style={{background:'#fee2e2',color:'#dc2626'}}><span style={{width:6,height:6,borderRadius:'50%',background:'#ef4444',display:'inline-block'}}/> Cancelled</span>;
  if (lo === 'ongoing')   return <span className="badge b-ong" style={{background:'#dbeafe',color:'#1d4ed8'}}><span className="live-dot-blue"/> Ongoing</span>;
  return <span className="badge b-pnd" style={{background:'#fef3c7',color:'#b45309'}}><span style={{width:6,height:6,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}/> Pending</span>;
}
function ModeBadge({ mode }: { mode: string }) {
  return mode === 'without_confirmation'
    ? <span className="badge b-wlk">Walk-in</span>
    : <span className="badge b-pre">Pre-booked</span>;
}
function MiniModeBadge({ mode }: { mode: string }) {
  return mode === 'without_confirmation'
    ? <span className="mini-badge b-wlk">WI</span>
    : <span className="mini-badge b-pre">PB</span>;
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,display:'flex',flexDirection:'column',gap:8,alignItems:'center',pointerEvents:'none'}}>
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✕ ' : 'ℹ '}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   NOTIFICATION PANEL  (NEW)
───────────────────────────────────────── */
function NotificationPanel({ appts }: { appts: Appointment[] }) {
  const recent = useMemo(() => {
    return [...appts]
      .sort((a,b) => new Date(b.txnDateTime).getTime() - new Date(a.txnDateTime).getTime())
      .slice(0, 8);
  }, [appts]);

  function dotColor(status: string) {
    if (status === 'cancelled') return '#ef4444';
    if (status === 'confirmed') return '#22c55e';
    if (status === 'ongoing')   return '#3b82f6';
    return '#f59e0b';
  }

  return (
    <div className="notif-dropdown pop-in">
      <div style={{padding:'12px 14px',borderBottom:'1px solid #eee',fontWeight:700,fontSize:13,color:'#1e3a40',fontFamily:"'Inter',sans-serif"}}>
        Notifications
      </div>
      <div style={{maxHeight:340,overflowY:'auto'}}>
        {recent.length === 0 ? (
          <div style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12,fontFamily:"'Inter',sans-serif"}}>
            No recent activity
          </div>
        ) : recent.map(a => (
          <div key={a.bookingID} className="notif-item">
            <span style={{width:8,height:8,borderRadius:'50%',background:dotColor(a.status),flexShrink:0,marginTop:5}}/>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:12,fontWeight:600,color:'#1f2937',fontFamily:"'Inter',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {a.clientName} · {a.serviceName.split(',')[0]}
              </p>
              <p style={{fontSize:11,color:'#9ca3af',fontFamily:"'Inter',sans-serif",marginTop:1}}>
                {fmtRelTime(a.txnDateTime)} · {a.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   PROFILE MENU  (NEW)
───────────────────────────────────────── */
function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="profile-dropdown pop-in">
      <button className="profile-item">Profile</button>
      <button className="profile-item">Settings</button>
      <div style={{height:1,background:'#eee',margin:'4px 2px'}}/>
      <button className="profile-item" style={{color:'#dc2626'}} onClick={onLogout}>Logout</button>
    </div>
  );
}

/* ─────────────────────────────────────────
   CALENDAR POPUP
───────────────────────────────────────── */
type CalView = 'day' | 'month' | 'year';
function CalendarPopup({ value, onChange, onClose }: {
  value: string; onChange: (iso: string) => void; onClose: () => void;
}) {
  const sel    = new Date(value + 'T00:00');
  const todayD = new Date(todayISO() + 'T00:00');
  const [view,     setView]     = useState<CalView>('day');
  const [calYear,  setCalYear]  = useState(sel.getFullYear());
  const [calMonth, setCalMonth] = useState(sel.getMonth());
  const [yearBase, setYearBase] = useState(Math.floor(sel.getFullYear() / 16) * 16);
  const selDay = sel.getDate(), selMonth = sel.getMonth(), selYear = sel.getFullYear();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays    = new Date(calYear, calMonth, 0).getDate();
  const cells: { d:number; m:number; y:number; cur:boolean }[] = [];
  for (let i = 0; i < firstDow; i++) {
    const pm = calMonth===0?11:calMonth-1, py = calMonth===0?calYear-1:calYear;
    cells.push({ d: prevDays-firstDow+1+i, m:pm, y:py, cur:false });
  }
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d:i, m:calMonth, y:calYear, cur:true });
  for (let i = 1; i <= 42-cells.length; i++) {
    const nm = calMonth===11?0:calMonth+1, ny = calMonth===11?calYear+1:calYear;
    cells.push({ d:i, m:nm, y:ny, cur:false });
  }
  return (
    <div className="cal-popup pop-in">
      <div className="cal-header">
        <button className="cal-nav" onClick={() => {
          if (view==='day')   { calMonth===0?(setCalMonth(11),setCalYear(y=>y-1)):setCalMonth(m=>m-1); }
          if (view==='month') { setCalYear(y=>y-1); }
          if (view==='year')  { setYearBase(b=>b-16); }
        }}><Ico.ChevL s={14}/></button>
        <button className="cal-month-title" onClick={() => {
          if (view==='day') setView('month'); else if (view==='month') setView('year'); else setView('day');
        }}>
          {view==='day'   && `${MONTHS[calMonth]} ${calYear}`}
          {view==='month' && calYear}
          {view==='year'  && `${yearBase}–${yearBase+15}`}
        </button>
        <button className="cal-nav" onClick={() => {
          if (view==='day')   { calMonth===11?(setCalMonth(0),setCalYear(y=>y+1)):setCalMonth(m=>m+1); }
          if (view==='month') { setCalYear(y=>y+1); }
          if (view==='year')  { setYearBase(b=>b+16); }
        }}><Ico.ChevR s={14}/></button>
      </div>
      {view==='day' && (<>
        <div className="cal-grid">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="cal-daylbl">{d}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((c,i) => {
            const isToday = c.d===todayD.getDate()&&c.m===todayD.getMonth()&&c.y===todayD.getFullYear();
            const isSel   = c.d===selDay&&c.m===selMonth&&c.y===selYear;
            return (
              <button key={i} className={`cal-day${!c.cur?' other-month':''}${isSel?' selected':''}${isToday&&!isSel?' today':''}`}
                onClick={() => { onChange(isoFromYMD(c.y,c.m,c.d)); onClose(); }}>
                {c.d}
              </button>
            );
          })}
        </div>
      </>)}
      {view==='month' && (
        <div className="month-grid">
          {MONTHS_SHORT.map((mo,i) => (
            <button key={mo} className={`month-item${i===selMonth&&calYear===selYear?' sel-mo':''}`}
              onClick={() => { setCalMonth(i); setView('day'); }}>
              {mo}
            </button>
          ))}
        </div>
      )}
      {view==='year' && (
        <div className="year-grid">
          {Array.from({length:16},(_,i)=>yearBase+i).map(yr => (
            <button key={yr} className={`year-item${yr===selYear?' sel-yr':''}`}
              onClick={() => { setCalYear(yr); setView('month'); }}>
              {yr}
            </button>
          ))}
        </div>
      )}
      <div style={{textAlign:'center',marginTop:10}}>
        <button onClick={() => { onChange(todayISO()); onClose(); }}
          style={{fontSize:11,fontWeight:600,color:'#1e3a40',background:'rgba(30,58,64,0.07)',border:'none',borderRadius:6,padding:'4px 14px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
          Today
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   DATE NAV
───────────────────────────────────────── */
function DateNav({ date, onChange }: { date:string; onChange:(d:string)=>void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{position:'relative',display:'flex',alignItems:'center',gap:2}}>
      <button className="nav-arr" onClick={() => onChange(shiftDate(date,-1))}><Ico.ChevL/></button>
      <button className="date-trigger" onClick={() => setOpen(o=>!o)}>
        <Ico.CalSm/><span>{fmtDateNav(date)}</span><Ico.ChevD s={11}/>
      </button>
      <button className="nav-arr" onClick={() => onChange(shiftDate(date,1))}><Ico.ChevR/></button>
      {open && <CalendarPopup value={date} onChange={d=>{onChange(d);setOpen(false);}} onClose={()=>setOpen(false)}/>}
    </div>
  );
}

/* ─────────────────────────────────────────
   MODAL HEADER
───────────────────────────────────────── */
function ModalHeader({ title, sub, onClose }: { title:string; sub:string; onClose:()=>void }) {
  return (
    <>
      <div style={{display:'flex',justifyContent:'center',padding:'12px 0 0'}}>
        <div style={{width:40,height:4,borderRadius:99,background:'#e5e7eb'}}/>
      </div>
      <div style={{background:'#1e3a40',padding:'16px 20px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
        <div>
          <p style={{color:'rgba(255,255,255,0.55)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{sub}</p>
          <p style={{color:'#fff',fontSize:18,fontWeight:800,marginTop:3}}>{title}</p>
        </div>
        <button onClick={onClose}
          style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:'50%',width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff'}}>
          <Ico.X/>
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   INFO BOX
───────────────────────────────────────── */
function InfoBox({ label, value }: { label:string; value:string }) {
  return (
    <div style={{background:'#f8fafb',border:'1px solid #e5eaeb',borderRadius:10,padding:'9px 12px'}}>
      <p style={{fontSize:10,color:'#9ca3af',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</p>
      <p style={{fontSize:13,fontWeight:700,color:'#1e3a40',marginTop:3,wordBreak:'break-word'}}>{value || '—'}</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   DETAIL MODAL  (UPDATED — Reschedule buttons added)
───────────────────────────────────────── */
function DetailModal({ appt, onClose, onStatusChange, onGoToBill, onReschedule }: {
  appt: Appointment;
  onClose: () => void;
  onStatusChange: (id:string, locCode:string, s:Appointment['status']) => void;
  onGoToBill: (appt:Appointment) => void;
  onReschedule: (appt:Appointment) => void;
}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box slide-up" onClick={e => e.stopPropagation()} style={{maxWidth:540}}>
        <ModalHeader title={`Booking ${appt.bookingID}`} sub="Appointment Detail" onClose={onClose}/>
        <div style={{padding:'18px 20px 28px',display:'flex',flexDirection:'column',gap:14}}>

          {/* Badges */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <StatusBadge status={appt.status}/>
            <ModeBadge   mode={appt.mode}/>
            {appt.gender && <span className="badge b-pre" style={{background:'#f3f4f6',color:'#374151'}}>{appt.gender.toUpperCase()}</span>}
            <span className="badge b-pre" style={{background:'#f3f4f6',color:'#374151'}}>{appt.location}</span>
            {appt.guests.length > 1 && (
              <span className="badge b-wlk"><Ico.Users/>{appt.guests.length} guests</span>
            )}
          </div>

          {/* Services list */}
          {appt.serviceNames.length > 1 && (
            <div style={{background:'#f0f8f9',border:'1px solid #c8dce0',borderRadius:10,padding:'10px 14px'}}>
              <p style={{fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>Services</p>
              {appt.serviceNames.map((s,i) => (
                <p key={i} style={{fontSize:13,color:'#1e3a40',fontWeight:600,marginBottom:2}}>• {s}</p>
              ))}
            </div>
          )}

          {/* Info grid */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <InfoBox label="Client"      value={appt.clientName}/>
            <InfoBox label="Contact"     value={appt.clientPhone}/>
            <InfoBox label="Date"        value={fmtDateLong(appt.date)}/>
            <InfoBox label="Time"        value={appt.timeSlot}/>
            <InfoBox label="Provider"    value={appt.providerName}/>
            <InfoBox label="Service"     value={appt.serviceName}/>
            <InfoBox label="Duration"    value={`${appt.duration} mins`}/>
            <InfoBox label="Total Price" value={`LKR ${appt.price.toLocaleString()}`}/>
            <InfoBox label="Booked At"   value={fmtRelTime(appt.txnDateTime)}/>
          </div>

          {/* Notes */}
          {appt.notes && appt.notes.trim() && (
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#92400e',lineHeight:1.6}}>
              <strong>Notes:</strong> {appt.notes}
            </div>
          )}

          {/* Actions ── Pending → Cancel / Confirm / Reschedule */}
          {appt.status === 'pending' && (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div className="modal-action-row">
                <button className="btn-modal-cancel"  onClick={() => { onStatusChange(appt.bookingID, appt.locCode, 'cancelled'); onClose(); }}>
                  <Ico.XCircle s={18}/> Cancel
                </button>
                <button className="btn-modal-confirm" onClick={() => { onStatusChange(appt.bookingID, appt.locCode, 'confirmed'); onClose(); }}>
                  <Ico.CheckCircle s={18}/> Confirm
                </button>
              </div>
              <button className="btn-modal-reschedule" onClick={() => { onReschedule(appt); onClose(); }}>
                <Ico.Reschedule s={18}/> Reschedule
              </button>
            </div>
          )}

          {/* Actions ── Confirmed → Cancel / Check In / Reschedule */}
          {appt.status === 'confirmed' && (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div className="modal-action-row">
                <button className="btn-modal-cancel"  onClick={() => { onStatusChange(appt.bookingID, appt.locCode, 'cancelled'); onClose(); }}>
                  <Ico.XCircle s={18}/> Cancel
                </button>
                <button className="btn-modal-checkin" onClick={() => { onStatusChange(appt.bookingID, appt.locCode, 'ongoing'); onClose(); }}>
                  <Ico.Login s={18}/> Check In
                </button>
              </div>
              <button className="btn-modal-reschedule" onClick={() => { onReschedule(appt); onClose(); }}>
                <Ico.Reschedule s={18}/> Reschedule
              </button>
            </div>
          )}

          {/* Actions ── Ongoing → Go to Bill */}
          {appt.status === 'ongoing' && (
            <button className="btn-modal-bill" onClick={() => { onGoToBill(appt); onClose(); }}>
              <Ico.Receipt s={18}/> Go to Bill
            </button>
          )}

          {/* Actions ── Cancelled → Reschedule only */}
          {appt.status === 'cancelled' && (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 14px',fontSize:13,color:'#991b1b',textAlign:'center',fontWeight:600}}>
                This booking has been cancelled.
              </div>
              <button className="btn-modal-reschedule" onClick={() => { onReschedule(appt); onClose(); }}>
                <Ico.Reschedule s={18}/> Reschedule
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   SCHEDULE GRID  (UPDATED — Drag & Drop + Free-slot click)
───────────────────────────────────────── */
function ScheduleGrid({ dayAppts, providers, onPillClick, onReschedule, onSlotClick, showToast }: {
  dayAppts: Appointment[];
  providers: string[];
  onPillClick: (a:Appointment) => void;
  onReschedule: (appt:Appointment, newProvider:string, newTimeSlot:string) => void;
  onSlotClick: (provider:string, slotIdx:number) => void;
  showToast: (text:string, type?:'success'|'error'|'info') => void;
}) {
  // Build occupancy map: provider → slotIdx → appointment
  const occupancy = useMemo(() => {
    const occ: Record<string, Record<number, { appt:Appointment; span:number; isStart:boolean }>> = {};
    providers.forEach(p => { occ[p] = {}; });

    dayAppts.forEach(a => {
      const startIdx = TIME_SLOTS.indexOf(a.timeSlot);
      if (startIdx === -1) return;
      const span = Math.max(1, Math.ceil(a.duration / SLOT_MINUTES));
      const safeProv = providers.includes(a.providerName) ? a.providerName : (providers[0] || "");
      if (!safeProv) return;
      for (let i = 0; i < span && startIdx + i < TIME_SLOTS.length; i++) {
        if (!occ[safeProv]) occ[safeProv] = {};
        if (!occ[safeProv][startIdx + i]) {
          occ[safeProv][startIdx + i] = { appt: a, span, isStart: i === 0 };
        }
      }
    });
    return occ;
  }, [dayAppts, providers]);

  /* ── Drag & Drop state ── */
  const [dragApptId, setDragApptId] = useState<string | null>(null);
  const [dragSpan,   setDragSpan]   = useState(1);
  const [hoverCell,  setHoverCell]  = useState<{provider:string; idx:number} | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);

  const draggedAppt = dayAppts.find(a => a.bookingID === dragApptId) || null;

  function isRangeFree(provider: string, startIdx: number, span: number, excludeId: string) {
    if (startIdx + span > TIME_SLOTS.length) return false;
    for (let i = 0; i < span; i++) {
      const cell = occupancy[provider]?.[startIdx + i];
      if (cell && cell.appt.bookingID !== excludeId) return false;
    }
    return true;
  }

  function handleDragStart(e: React.DragEvent, appt: Appointment) {
    if (appt.status === 'ongoing') { e.preventDefault(); return; }
    setDragApptId(appt.bookingID);
    setDragSpan(Math.max(1, Math.ceil(appt.duration / SLOT_MINUTES)));
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', appt.bookingID); } catch {}
  }
  function handleDragEnd() {
    setDragApptId(null);
    setHoverCell(null);
  }
  function handleFreeDrop(e: React.DragEvent, provider: string, idx: number) {
    e.preventDefault();
    if (!draggedAppt) return;
    const valid = isRangeFree(provider, idx, dragSpan, draggedAppt.bookingID);
    if (!valid) {
      showToast('Cannot drop here — slot occupied', 'error');
      setDragApptId(null); setHoverCell(null);
      return;
    }
    const newSlotLabel = TIME_SLOTS[idx];
    onReschedule(draggedAppt, provider, newSlotLabel);
    const key = `${provider}-${idx}`;
    setSuccessKey(key);
    setTimeout(() => setSuccessKey(null), 650);
    setDragApptId(null);
    setHoverCell(null);
  }

  if (providers.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-ico"><Ico.Inbox/></div>
        <p style={{fontSize:14,fontWeight:600,color:'#6b7280'}}>No appointments for this date</p>
        <p style={{fontSize:12,color:'#9ca3af'}}>Bookings you create will appear here</p>
      </div>
    );
  }

  return (
    <div style={{overflowX:'auto',overflowY:'auto',flex:1,WebkitOverflowScrolling:'touch'}}>
      <table className="sch-tbl" style={{minWidth: providers.length * 150 + 76}}>
        <thead>
          <tr>
            <th>Time</th>
            {providers.map(p => (
              <th key={p}>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:10,flexShrink:0}}>
                    {p.charAt(0)}
                  </div>
                  {p}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIME_SLOTS.map((slot, rowIdx) => {
            const [time, ampm] = slot.split(' ');
            return (
              <tr key={slot}>
                <td>
                  <span style={{display:'block',fontSize:12,fontWeight:600,color:'#374151'}}>{time}</span>
                  {ampm && <span style={{display:'block',fontSize:9,color:'#9ca3af'}}>{ampm}</span>}
                </td>
                {providers.map(p => {
                  const cell = occupancy[p]?.[rowIdx];

                  /* ── Occupied cell (pill start) ── */
                  if (cell && cell.isStart) {
                    const a = cell.appt;
                    const locked = a.status === 'ongoing';
                    const pillCls = `appt-pill pill-${a.status}${dragApptId===a.bookingID ? ' dragging' : ''}${locked ? ' locked-pill' : ''}`;
                    const endLabel = minutesToSlotLabel(parseSlotToMinutes(a.timeSlot) + a.duration);
                    const isHoverInvalid = !!(hoverCell && hoverCell.provider===p && hoverCell.idx===rowIdx && dragApptId && a.bookingID!==dragApptId);
                    return (
                      <td key={p} rowSpan={cell.span} className="occ-cell"
                        style={isHoverInvalid ? {background:'rgba(239,68,68,0.15)',outline:'2px dashed rgba(239,68,68,0.5)',outlineOffset:'-2px',cursor:'not-allowed'} : undefined}
                        onDragOver={(e) => { if (dragApptId) { e.preventDefault(); setHoverCell({provider:p, idx:rowIdx}); } }}
                        onDragLeave={() => setHoverCell(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragApptId && a.bookingID !== dragApptId) {
                            showToast('Cannot drop — slot already occupied', 'error');
                          }
                          setDragApptId(null); setHoverCell(null);
                        }}
                      >
                        <button
                          className={pillCls}
                          draggable={!locked}
                          onDragStart={(e) => handleDragStart(e, a)}
                          onDragEnd={handleDragEnd}
                          onClick={() => { if (!dragApptId) onPillClick(a); }}
                          title={locked ? 'Ongoing appointments are locked' : 'Drag to reschedule · Click for details'}
                        >
                          <span className="ap-service">
                            {a.status === 'ongoing' && <span className="live-dot-blue"/>}
                            {locked && <Ico.Lock s={10}/>}
                            {a.serviceName.split(',')[0]}
                          </span>
                          <span className="ap-time">{a.timeSlot} – {endLabel}</span>
                          <span className="ap-client">{a.clientName}</span>
                          <span className="ap-meta">
                            <MiniModeBadge mode={a.mode}/>
                            <span className="mini-badge" style={{background:'rgba(0,0,0,0.06)',color:'inherit'}}>
                              LKR {a.price.toLocaleString()}
                            </span>
                          </span>
                        </button>
                      </td>
                    );
                  }
                  if (cell && !cell.isStart) return null;

                  /* ── Free cell (drop target + click-to-create) ── */
                  const key = `${p}-${rowIdx}`;
                  const isHover = !!(hoverCell && hoverCell.provider===p && hoverCell.idx===rowIdx);
                  const valid = draggedAppt ? isRangeFree(p, rowIdx, dragSpan, draggedAppt.bookingID) : true;
                  let cls = '';
                  if (dragApptId) cls = isHover ? (valid ? 'drop-hover-v' : 'drop-hover-i') : '';
                  if (successKey === key) cls += ' drop-success';
                  return (
                    <td key={p} className={cls}
                      onDragOver={(e) => { if (dragApptId) { e.preventDefault(); setHoverCell({provider:p, idx:rowIdx}); } }}
                      onDragLeave={() => setHoverCell(null)}
                      onDrop={(e) => handleFreeDrop(e, p, rowIdx)}
                      onClick={() => { if (!dragApptId) onSlotClick(p, rowIdx); }}
                      style={{cursor: dragApptId ? 'default' : 'pointer'}}
                      title={dragApptId ? undefined : 'Click to book this slot'}
                    >
                      <div style={{width:'100%',height:'100%',minHeight:36}}/>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────
   APPT CARD (list view)
───────────────────────────────────────── */
function ApptCard({ appt, onClick }: { appt:Appointment; onClick:()=>void }) {
  const endLabel = minutesToSlotLabel(parseSlotToMinutes(appt.timeSlot) + appt.duration);
  return (
    <div className="appt-card" onClick={onClick}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:14,fontWeight:700,color:'#1e3a40',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{appt.serviceName}</p>
          <p style={{fontSize:12,color:'#6b7280',marginTop:1}}>{appt.providerName}</p>
          <p style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{appt.clientName} · {appt.clientPhone}</p>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
          <StatusBadge status={appt.status}/>
          <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>LKR {appt.price.toLocaleString()}</span>
        </div>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{display:'flex',alignItems:'center',gap:3,fontSize:12,color:'#374151',fontWeight:600}}>
          <Ico.Clock/>{appt.timeSlot} – {endLabel}
        </span>
        <span style={{display:'flex',alignItems:'center',gap:3,fontSize:12,color:'#6b7280'}}>
          <Ico.Loc/>{appt.location}
        </span>
        <ModeBadge mode={appt.mode}/>
        {appt.guests.length > 1 && (
          <span style={{fontSize:11,color:'#6b7280',display:'flex',alignItems:'center',gap:3}}>
            <Ico.Users/>{appt.guests.length} guests
          </span>
        )}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:11,color:'#9ca3af'}}>Booking: {appt.bookingID}</span>
        <span style={{fontSize:11,color:'#9ca3af'}}>{fmtRelTime(appt.txnDateTime)}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   STATS CARDS  (UPDATED — Ongoing card pulses)
───────────────────────────────────────── */
function StatsRow({ stats, onNewAppt }: { stats:Stats; onNewAppt:()=>void }) {
  const cards = [
    { label:'Total',     value:stats.total,     icon:<Ico.Appt/>,    bg:'linear-gradient(135deg,#daeef0,#cce3e8)', border:'1px solid rgba(30,58,64,0.18)', iconColor:'#4a7a82' },
    { label:'Confirmed', value:stats.confirmed, icon:<Ico.Check/>,   bg:'linear-gradient(135deg,#dcfce7,#bbf7d0)', border:'1px solid rgba(34,197,94,0.3)',  iconColor:'#15803d' },
    { label:'Ongoing',   value:stats.ongoing,   icon:<Ico.Live/>,    bg:'linear-gradient(135deg,#dbeafe,#bfdbfe)', border:'1px solid rgba(59,130,246,0.35)',iconColor:'#1d4ed8', dot:'#2563eb', pulse:true },
    { label:'Pending',   value:stats.pending,   icon:<Ico.Pending/>, bg:'linear-gradient(135deg,#fef9c3,#fde68a)', border:'1px solid rgba(245,158,11,0.35)',iconColor:'#b45309' },
    { label:'Cancelled', value:stats.cancelled, icon:<Ico.Cancel/>,  bg:'linear-gradient(135deg,#fee2e2,#fecaca)', border:'1px solid rgba(239,68,68,0.3)',  iconColor:'#b91c1c' },
  ] as const;

  return (
    <div className="stats-flex" style={{display:'flex',gap:10,alignItems:'stretch',flexWrap:'wrap'}}>
      <div style={{display:'flex',gap:9,flex:'1 1 440px',minWidth:0,flexWrap:'wrap'}}>
        {cards.map(c => {
          const shouldPulse = 'pulse' in c && c.pulse && c.value > 0;
          return (
            <div key={c.label} style={{
              flex:'1 1 0',minWidth:90,borderRadius:12,padding:'13px 13px',minHeight:80,
              display:'flex',alignItems:'flex-start',justifyContent:'space-between',
              background:c.bg,border:c.border,boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
              animation: shouldPulse ? 'livePulseBlue 2s infinite' : undefined,
            }}>
              <div>
                <p style={{fontSize:10,color:'#374151',fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                  {'dot' in c && c.dot && <span style={{width:5,height:5,borderRadius:'50%',background:c.dot,display:'inline-block'}}/>}
                  {c.label}
                </p>
                <p style={{fontSize:26,fontWeight:800,color:'#1f2937',lineHeight:1.2,marginTop:4}}>{String(c.value).padStart(2,'0')}</p>
              </div>
              <div style={{color:c.iconColor,opacity:0.8}}>{c.icon}</div>
            </div>
          );
        })}
      </div>
      <button onClick={onNewAppt}
        style={{minWidth:140,minHeight:80,background:'linear-gradient(135deg,#1e3a40,#2a5260)',border:'none',borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:5,cursor:'pointer',fontFamily:"'Inter',sans-serif",boxShadow:'0 2px 10px rgba(30,58,64,0.3)',transition:'all 0.18s'}}
        onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 4px 16px rgba(30,58,64,0.4)';}}
        onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 2px 10px rgba(30,58,64,0.3)';}}>
        <Ico.Plus/>
        <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>New Booking</span>
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   PERIOD BUTTONS
───────────────────────────────────────── */
function PeriodButtons({ period, onPick }: {
  period: 'today'|'tomorrow'|'dayafter'|'';
  onPick: (key:'today'|'tomorrow'|'dayafter', days:number) => void;
}) {
  return (
    <div style={{background:'#ccd8d8',borderRadius:9,padding:'3px 4px',display:'flex',gap:2,flexShrink:0}}>
      {([['today','Today',0],['tomorrow','Tomorrow',1],['dayafter','Day After',2]] as const).map(([key,label,days]) => {
        const active = period === key;
        return (
          <button key={key} onClick={() => onPick(key, days)}
            style={{padding:'5px 12px',borderRadius:7,border:'none',fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:active?700:500,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',background:active?'#1e3a40':'transparent',color:active?'#fff':'#4b5563',boxShadow:active?'0 1px 4px rgba(30,58,64,0.35)':'none'}}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function AppointmentsPage() {
  const router = useRouter();
  const [navKey,   setNavKey]   = useState('calendar');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [date,     setDate]     = useState(todayISO);
  const [period,   setPeriod]   = useState<'today'|'tomorrow'|'dayafter'|''>('today');
  const [search,   setSearch]   = useState('');
  const [appts,    setAppts]    = useState<Appointment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [toasts,   setToasts]   = useState<ToastMsg[]>([]);

  const toastCounter  = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [filterLoc,     setFilterLoc]     = useState('ALL');
  const [filterMode,    setFilterMode]    = useState('ALL');
  const [filterService, setFilterService] = useState('ALL');   // NEW

  /* ── Notification / Profile dropdown state (NEW) ── */
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef   = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Toast ── */
  const showToast = useCallback((text:string, type:'success'|'error'|'info'='info') => {
    const id = ++toastCounter.current;
    setToasts(p => [...p, {id,text,type}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2800);
  }, []);

  /* ── Fetch appointments ── */
  const fetchAppts = useCallback(async (d: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ date: d });
      if (filterLoc !== 'ALL') params.set('locCode', filterLoc);
      const res  = await fetch(`/api/appointments?${params}`);
      const json = await res.json();
      if (json.success) {
        setAppts(json.data);
        setLastFetch(new Date());
      } else {
        showToast('Failed to load appointments', 'error');
      }
    } catch {
      showToast('Network error — could not load appointments', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterLoc, showToast]);

  /* ── Initial load + date/filter change ── */
  useEffect(() => {
    fetchAppts(date);
  }, [date, filterLoc]);

  /* ── Auto-refresh every 60s ── */
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchAppts(date, true);
    }, 60000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [date, fetchAppts]);

  /* ── Status change (optimistic + API) ── */
  const handleStatusChange = useCallback(async (
    bookingID: string, locCode: string, status: Appointment['status']
  ) => {
    setAppts(prev => prev.map(a => a.bookingID === bookingID ? {...a, status} : a));

    const labels: Record<string, string> = {
      confirmed: 'Appointment confirmed',
      cancelled: 'Appointment cancelled',
      ongoing:   'Client checked in',
    };
    showToast(labels[status] || 'Status updated', status === 'cancelled' ? 'error' : 'success');

    try {
      const res  = await fetch('/api/appointments', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingID, locCode, status }),
      });
      const json = await res.json();
      if (!json.success) {
        fetchAppts(date, true);
        showToast('Failed to update status', 'error');
      }
    } catch {
      fetchAppts(date, true);
      showToast('Network error — status not saved', 'error');
    }
  }, [date, fetchAppts, showToast]);

  /* ── Drag & Drop reschedule (NEW) ── */
  const handleDragReschedule = useCallback(async (
    appt: Appointment, newProvider: string, newTimeSlot: string
  ) => {
    setAppts(prev => prev.map(a => a.bookingID === appt.bookingID
      ? {...a, providerName:newProvider, techID:newProvider, timeSlot:newTimeSlot}
      : a
    ));
    showToast(`Rescheduled to ${newTimeSlot} · ${newProvider}`, 'success');

    try {
      const res = await fetch('/api/appointments', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          bookingID: appt.bookingID,
          locCode:   appt.locCode,
          date:      appt.date,
          timeSlot:  newTimeSlot,
          techID:    newProvider,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        fetchAppts(date, true);
        showToast('Failed to save reschedule', 'error');
      }
    } catch {
      fetchAppts(date, true);
      showToast('Network error — reschedule not saved', 'error');
    }
  }, [date, fetchAppts, showToast]);

  /* ── Free slot click → new appointment form pre-filled (NEW) ── */
  const handleSlotClick = useCallback((provider: string, slotIdx: number) => {
    const params = new URLSearchParams({
      date,
      timeSlot: TIME_SLOTS[slotIdx],
      providerName: provider,
    });
    router.push(`/appointmentform?${params.toString()}`);
  }, [date, router]);

  /* ── Reschedule flow: navigate to form w/ existing data (NEW) ── */
  const handleRescheduleNav = useCallback((appt: Appointment) => {
    const params = new URLSearchParams({
      reschedule:   'true',
      bookingID:    appt.bookingID,
      locCode:      appt.locCode,
      clientName:   appt.clientName,
      clientPhone:  appt.clientPhone,
      providerName: appt.providerName,
      serviceName:  appt.serviceName,
      date:         appt.date,
      timeSlot:     appt.timeSlot,
      duration:     String(appt.duration),
      price:        String(appt.price),
      location:     appt.location,
      status:       appt.status,
      mode:         appt.mode,
      gender:       appt.gender,
      notes:        appt.notes || '',
    });
    router.push(`/appointmentform?${params.toString()}`);
  }, [router]);

  /* ── Go to bill ── */
  const handleGoToBill = useCallback((appt: Appointment) => {
    const params = new URLSearchParams({
      appointmentId: appt.bookingID,
      clientName:    appt.clientName,
      clientPhone:   appt.clientPhone,
      providerName:  appt.providerName,
      serviceName:   appt.serviceName,
      date:          appt.date,
      timeSlot:      appt.timeSlot,
      duration:      String(appt.duration),
      price:         String(appt.price),
      location:      appt.location,
      status:        appt.status,
      mode:          appt.mode,
      gender:        appt.gender,
      notes:         appt.notes || '',
    });
    router.push(`/billing?${params.toString()}`);
  }, [router]);

  /* ── Derived ── */
  const locOptions = useMemo(() => {
    const locs = [...new Set(appts.map(a => a.locCode))].sort();
    return ['ALL', ...locs];
  }, [appts]);

  const serviceOptions = useMemo(() => {                      // NEW
    const svcs = new Set<string>();
    appts.forEach(a => a.serviceNames.forEach(s => svcs.add(s)));
    return ['ALL', ...Array.from(svcs).sort()];
  }, [appts]);

  const filtered = useMemo(() => appts.filter(a => {
    if (filterMode === 'WALKIN'   && a.mode !== 'without_confirmation') return false;
    if (filterMode === 'PREBOOKED' && a.mode !== 'pre_booked')          return false;
    if (filterService !== 'ALL' && !a.serviceNames.includes(filterService)) return false;   // NEW
    if (search && !`${a.clientName} ${a.clientPhone} ${a.serviceName} ${a.providerName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [appts, filterMode, filterService, search]);

  const stats: Stats = {
    total:     appts.length,
    confirmed: appts.filter(a => a.status === 'confirmed').length,
    cancelled: appts.filter(a => a.status === 'cancelled').length,
    pending:   appts.filter(a => a.status === 'pending').length,
    ongoing:   appts.filter(a => a.status === 'ongoing').length,
  };

  // Unique providers from filtered appointments
  const providers = useMemo(() => {
    const provSet = new Set(filtered.map(a => a.providerName).filter(Boolean));
    return Array.from(provSet).sort();
  }, [filtered]);

  function handleDateChange(d: string) {
    setDate(d);
    setPeriod(computePeriod(d));
  }

  const PAGE  = '#c2d4d4';
  const PANEL = '#deeaea';
  const HDR   = '#dae6e6';

  const hasActiveFilters = filterLoc !== 'ALL' || filterMode !== 'ALL' || filterService !== 'ALL';

  return (
    <>
      <style>{CSS}</style>
      <ToastContainer toasts={toasts}/>

      {selected && (
        <DetailModal
          appt={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(id, loc, status) => {
            setSelected(null);
            handleStatusChange(id, loc, status);
          }}
          onGoToBill={handleGoToBill}
          onReschedule={handleRescheduleNav}
        />
      )}

      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>
        <AdminSidebar
          active={navKey}
          onNav={(key,path) => { setNavKey(key); router.push(path); }}
          onLogout={() => router.push('/admin/login')}
        />

        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

          {/* HEADER */}
          <header style={{background:HDR,height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10}}>
            <div className="srch-wrap" style={{position:'relative',flexShrink:0}}>
              <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4}}><Ico.Search/></span>
              <input className="srch" placeholder="Search client, service, provider..." value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <div style={{flex:1}}/>

            {/* Notification bell (NEW functionality) */}
            <div ref={notifRef} style={{position:'relative'}}>
              <button
                style={{background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8,position:'relative'}}
                onClick={() => { setNotifOpen(o=>!o); setProfileOpen(false); }}
              >
                <Ico.Bell/>
                {stats.pending > 0 && <span className="notif-dot">{stats.pending > 9 ? '9+' : stats.pending}</span>}
              </button>
              {notifOpen && <NotificationPanel appts={appts}/>}
            </div>

            {/* Admin profile (NEW dropdown) */}
            <div ref={profileRef} style={{position:'relative',display:'flex',alignItems:'center',gap:8}}>
              <div className="hdr-name" style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}
                onClick={() => { setProfileOpen(o=>!o); setNotifOpen(false); }}>
                <span style={{fontSize:14,fontWeight:500,color:'#1f2937'}}>MR. SAYO</span>
                <Ico.ChevD/>
              </div>
              <div
                style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0}}
                onClick={() => { setProfileOpen(o=>!o); setNotifOpen(false); }}
              >S</div>
              {profileOpen && <ProfileMenu onLogout={() => router.push('/admin/login')}/>}
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{flex:1,overflow:'auto',padding:'13px 15px',display:'flex',flexDirection:'column',gap:12}}>

            <StatsRow stats={stats} onNewAppt={() => router.push('/appointmentform')}/>

            {/* Filters (NEW: Service filter added) */}
            <div className="filters-row" style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <select className="f-sel" value={filterService} onChange={e=>setFilterService(e.target.value)}>
                {serviceOptions.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Services' : s}</option>)}
              </select>
              <select className="f-sel" value={filterLoc} onChange={e=>setFilterLoc(e.target.value)}>
                {locOptions.map(l => <option key={l} value={l}>{l === 'ALL' ? 'All Branches' : l}</option>)}
              </select>
              <select className="f-sel" value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
                <option value="ALL">All Modes</option>
                <option value="WALKIN">Walk-in</option>
                <option value="PREBOOKED">Pre-booked</option>
              </select>
              {hasActiveFilters && (
                <button onClick={() => { setFilterLoc('ALL'); setFilterMode('ALL'); setFilterService('ALL'); }}
                  style={{fontSize:12,fontWeight:600,color:'#b91c1c',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                  Clear Filters
                </button>
              )}
              {/* Last fetch indicator */}
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
                {lastFetch && (
                  <span style={{fontSize:11,color:'#9ca3af'}}>
                    Updated {fmtRelTime(lastFetch.toISOString())}
                  </span>
                )}
                <button className={`refresh-btn ${refreshing?'spinning':''}`}
                  onClick={() => fetchAppts(date, true)}>
                  <Ico.Refresh s={14} spin={refreshing}/>
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Main content panel */}
            <div style={{flex:1,minHeight:0,background:PANEL,borderRadius:12,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',overflow:'hidden',display:'flex',flexDirection:'column'}}>

              {/* Toolbar */}
              <div className="toolbar-row" style={{display:'flex',alignItems:'center',padding:'11px 14px 0',gap:8,flexWrap:'wrap',flexShrink:0}}>
                <DateNav date={date} onChange={handleDateChange}/>
                <div style={{display:'flex',gap:2,background:'rgba(0,0,0,0.07)',borderRadius:8,padding:'3px',marginLeft:4}}>
                  {(['grid','list'] as const).map(v => (
                    <button key={v} className={`view-btn ${viewMode===v?'active':''}`} onClick={()=>setViewMode(v)}>
                      {v==='grid' ? '⊞ Grid' : '≡ List'}
                    </button>
                  ))}
                </div>
                <div style={{flex:1}}/>
                <PeriodButtons period={period} onPick={(key,days)=>{setDate(shiftDate(todayISO(),days));setPeriod(key);}}/>
              </div>

              <div style={{height:1,background:'rgba(30,58,64,0.1)',margin:'10px 0 0',flexShrink:0}}/>

              {/* Loading state */}
              {loading ? (
                <div style={{flex:1,padding:'16px',display:'flex',flexDirection:'column',gap:10,overflow:'hidden'}}>
                  {[1,2,3,4].map(i => (
                    <div key={i} className="skeleton" style={{height:72,borderRadius:10}}/>
                  ))}
                </div>
              ) : viewMode === 'grid' ? (
                <div className="fade-up" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <ScheduleGrid
                    dayAppts={filtered}
                    providers={providers}
                    onPillClick={setSelected}
                    onReschedule={handleDragReschedule}
                    onSlotClick={handleSlotClick}
                    showToast={showToast}
                  />
                </div>
              ) : (
                <div className="fade-up" style={{flex:1,overflow:'auto',padding:'12px 13px'}}>
                  {filtered.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-ico"><Ico.Inbox/></div>
                      <p style={{fontSize:14,fontWeight:600,color:'#6b7280'}}>
                        {search ? 'No results found' : 'No appointments for this date'}
                      </p>
                      <p style={{fontSize:12,color:'#9ca3af'}}>
                        {search ? 'Try different search terms' : 'Create a new booking to get started'}
                      </p>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:9}}>
                      {filtered.map(a => (
                        <ApptCard key={a.bookingID} appt={a} onClick={() => setSelected(a)}/>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}