'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AdminSidebar from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface AdminUser    { name: string; email: string; }
interface ServiceItem  { name: string; price: string; duration: string; category: string; }
interface ProviderItem { name: string; role: string; }
interface Booking {
  BookingId: string; UserId: number; BookingMode: string; Gender: string;
  Location: string; Categories: string; TotalDuration: number; TotalPrice: number;
  BookingDate: string; TimeSlot: string; SpecialNotes: string | null;
  Status: string; CreatedAt: string; services: ServiceItem[]; providers: ProviderItem[];
  ClientName: string;
}
interface DashboardStats {
  totalToday: number; totalPending: number; totalConfirmed: number;
  totalWalkin: number; totalCancelled: number;
  revenueOnline: number; revenueWalkin: number;
  onlineBookings: number; walkinBookings: number;
  emailCount: number; callCount: number; whatsappCount: number;
}
interface ActivityEntry {
  id: number; actor: string; section: string; action: string; timestamp: string;
}
interface DashboardData {
  date: string; stats: DashboardStats; providers: string[];
  timeSlots: string[]; bookings: Booking[]; activities?: ActivityEntry[];
}
interface ProductStock {
  id: number; name: string; category: string; stock: number;
  threshold: number; unit: string; supplier: string; supplierPhone: string;
}
interface WaitingOrder {
  id: number; productName: string; supplier: string; qty: number;
  orderedAt: string; status: 'pending' | 'confirmed' | 'shipped';
}

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const SLOT_H     = 72;
const SLOT_MIN   = 30;
const DAY_START  = 9 * 60;

const TIME_SLOTS: string[] = [];
for (let m = DAY_START; m < DAY_START + 6 * 60; m += SLOT_MIN) {
  const h = Math.floor(m / 60), mn = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  TIME_SLOTS.push(`${h12}:${String(mn).padStart(2, '0')} ${ap}`);
}

/* ─────────────────────────────────────────
   MOCK DATA
───────────────────────────────────────── */
const LOW_STOCK: ProductStock[] = [
  { id:1, name:'Argan Hair Oil 250ml',        category:'Hair Care', stock:4,  threshold:15, unit:'bottles', supplier:'Beauty Essentials Lanka', supplierPhone:'011 234 5678' },
  { id:2, name:'Keratin Shampoo 1L',          category:'Hair Care', stock:2,  threshold:10, unit:'bottles', supplier:'ProHair Distributors',     supplierPhone:'077 345 6789' },
  { id:3, name:'Gel Nail Polish – Red',       category:'Nails',     stock:5,  threshold:20, unit:'units',   supplier:'Nailart Supplies PVT',     supplierPhone:'071 456 7890' },
  { id:4, name:'Aromatherapy Massage Oil',    category:'Wellness',  stock:3,  threshold:12, unit:'bottles', supplier:'Wellness World SL',        supplierPhone:'076 567 8901' },
  { id:5, name:'Facial Clay Mask 500g',       category:'Skin',      stock:6,  threshold:15, unit:'jars',    supplier:'SkinCare Imports',         supplierPhone:'070 678 9012' },
  { id:6, name:'Acetone Nail Polish Remover', category:'Nails',     stock:4,  threshold:18, unit:'bottles', supplier:'Nailart Supplies PVT',     supplierPhone:'071 456 7890' },
];

const WAITING_ORDERS: WaitingOrder[] = [
  { id:101, productName:'Tea Tree Shampoo 1L',  supplier:'ProHair Distributors', qty:20, orderedAt:'2025-08-18', status:'shipped'   },
  { id:102, productName:'Lavender Massage Oil', supplier:'Wellness World SL',    qty:15, orderedAt:'2025-08-19', status:'confirmed' },
  { id:103, productName:'UV Gel Nail Kit',      supplier:'Nailart Supplies PVT', qty:30, orderedAt:'2025-08-20', status:'pending'   },
];

function emptyData(d: string): DashboardData {
  return {
    date: d,
    stats: {
      totalToday: 0, totalPending: 0, totalConfirmed: 0, totalWalkin: 0, totalCancelled: 0,
      revenueOnline: 0, revenueWalkin: 0, onlineBookings: 0, walkinBookings: 0,
      emailCount: 0, callCount: 0, whatsappCount: 0,
    },
    providers: [], timeSlots: [], bookings: [], activities: [],
  };
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function todayISO()  { return new Date().toISOString().split('T')[0]; }
function fmtDateNav(iso: string) {
  const d  = new Date(iso + 'T00:00');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${mo} / ${String(d.getDate()).padStart(2,'0')} / ${d.getFullYear()}`;
}
function fmtDateShort(iso: string) {
  const d = new Date(iso + 'T00:00');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`;
}
function fmtDateLong(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function shiftDate(iso: string, days: number) {
  const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0];
}
function isoFromYMD(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function slotToMin(slot: string): number {
  const [time, ap] = slot.split(' ');
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr); const m = Number(mStr);
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}
function minToSlot(mins: number): string {
  const h  = Math.floor(mins / 60) % 24;
  const m  = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
}

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ─────────────────────────────────────────
   PAGE CSS  (sidebar CSS is in AdminSidebar)
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp    { from{opacity:0;transform:translateY(4px);}  to{opacity:1;transform:none;} }
  @keyframes popIn     { from{opacity:0;transform:scale(0.95) translateY(-6px);} to{opacity:1;transform:scale(1) translateY(0);} }
  @keyframes slideUp   { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:none;} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px);} to{opacity:1;transform:none;} }
  @keyframes pulseRing { 0%{box-shadow:0 0 0 0 rgba(30,58,64,0.45);} 70%{box-shadow:0 0 0 10px rgba(30,58,64,0);} 100%{box-shadow:0 0 0 0 rgba(30,58,64,0);} }
  @keyframes bellShake { 0%,100%{transform:rotate(0);} 20%{transform:rotate(-14deg);} 40%{transform:rotate(14deg);} 60%{transform:rotate(-8deg);} 80%{transform:rotate(8deg);} }
  .fade-up  { animation:fadeUp   0.2s ease both; }
  .pop-in   { animation:popIn    0.18s cubic-bezier(.34,1.56,.64,1) both; }
  .slide-up { animation:slideUp  0.22s ease both; }
  .slide-dn { animation:slideDown 0.18s ease both; }
  .bell-shake { animation:bellShake 0.5s ease both; }

  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.2); border-radius:4px; }

  /* Buttons */
  .period-btn { padding:5px 16px; border-radius:7px; border:none; font-family:'Inter',sans-serif; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; background:transparent; color:#4b5563; }
  .period-btn.active { background:#1e3a40; color:#fff; box-shadow:0 1px 4px rgba(30,58,64,0.35); }
  .period-btn:not(.active):hover { background:rgba(0,0,0,0.06); }
  .view-btn { padding:5px 16px; border-radius:8px; border:1.5px solid rgba(30,58,64,0.2); font-family:'Inter',sans-serif; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; background:transparent; color:#4b5563; }
  .view-btn.active { background:#1e3a40; color:#fff; border-color:#1e3a40; }
  .view-btn:not(.active):hover { background:rgba(0,0,0,0.04); }
  .range-nav-btn { display:flex; align-items:center; gap:5px; background:#fff; border:1.5px solid rgba(30,58,64,0.18); border-radius:8px; padding:6px 12px; font-family:'Inter',sans-serif; font-size:12.5px; font-weight:600; color:#1e3a40; cursor:pointer; transition:background 0.15s; white-space:nowrap; }
  .range-nav-btn:hover { background:rgba(30,58,64,0.06); }

  /* Calendar day grid */
  .cal-grid-wrap { overflow:auto; flex:1; }
  .cal-grid-outer { display:flex; min-width:0; }
  .time-gutter { width:72px; flex-shrink:0; padding-top:52px; }
  .time-label  { height:${SLOT_H}px; display:flex; align-items:flex-start; padding-top:6px; padding-right:10px; justify-content:flex-end; }
  .time-label span { font-size:11px; font-weight:600; color:#6b7280; white-space:nowrap; }
  .provider-cols  { flex:1; min-width:0; display:flex; }
  .provider-col   { flex:1; min-width:130px; display:flex; flex-direction:column; border-left:1px solid rgba(30,58,64,0.08); }
  .provider-header { height:52px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:#374151; background:#dce8e8; border-bottom:1px solid rgba(30,58,64,0.1); position:sticky; top:0; z-index:3; flex-shrink:0; }
  .col-body  { position:relative; flex:1; }
  .slot-row  { height:${SLOT_H}px; border-bottom:1px solid rgba(30,58,64,0.06); }
  .slot-row.half { border-bottom:1px dashed rgba(30,58,64,0.04); }
  .appt-card-cal { position:absolute; left:4px; right:4px; border-radius:10px; padding:9px 10px; cursor:pointer; overflow:hidden; transition:filter 0.15s, transform 0.15s, box-shadow 0.15s; border-left-width:4px; border-left-style:solid; border-top:1px solid transparent; border-right:1px solid transparent; border-bottom:1px solid transparent; }
  .appt-card-cal:hover { filter:brightness(0.93); transform:scale(1.01); box-shadow:0 4px 16px rgba(0,0,0,0.14); }
  .appt-card-cal .ac-service { font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-card-cal .ac-time    { font-size:11px; font-weight:600; opacity:0.75; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-card-cal .ac-client  { font-size:12px; font-weight:600; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-card-cal .ac-badges  { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
  .ac-badge     { display:inline-flex; align-items:center; padding:2px 7px; border-radius:99px; font-size:10px; font-weight:700; font-family:'Inter',sans-serif; text-transform:uppercase; letter-spacing:0.04em; white-space:nowrap; }
  .ac-badge-wlk { background:rgba(56,178,172,0.18); color:#0f766e; }
  .ac-badge-pre { background:rgba(30,58,64,0.1);    color:#1e3a40; }
  .ac-badge-dur { background:rgba(0,0,0,0.07);       color:#374151; }
  .card-confirmed { background:rgba(34,197,94,0.1);  border-left-color:#22c55e; border-top-color:rgba(34,197,94,0.2);  border-right-color:rgba(34,197,94,0.2);  border-bottom-color:rgba(34,197,94,0.2);  color:#14532d; }
  .card-pending   { background:rgba(245,158,11,0.1); border-left-color:#f59e0b; border-top-color:rgba(245,158,11,0.2); border-right-color:rgba(245,158,11,0.2); border-bottom-color:rgba(245,158,11,0.2); color:#78350f; }
  .card-cancelled { background:rgba(239,68,68,0.08); border-left-color:#ef4444; border-top-color:rgba(239,68,68,0.15); border-right-color:rgba(239,68,68,0.15); border-bottom-color:rgba(239,68,68,0.15); color:#7f1d1d; }
  .card-cancelled .ac-service { text-decoration:line-through; opacity:0.7; }

  /* Badges */
  .badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:99px; font-size:10px; font-weight:700; font-family:'Inter',sans-serif; text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap; }
  .b-ok   { background:rgba(34,197,94,0.1);  color:#15803d; }
  .b-pnd  { background:rgba(245,158,11,0.1); color:#b45309; }
  .b-can  { background:rgba(239,68,68,0.1);  color:#b91c1c; }
  .b-wlk  { background:rgba(56,178,172,0.1); color:#0f766e; }
  .b-pre  { background:rgba(30,58,64,0.08);  color:#1e3a40; }
  .b-ship { background:rgba(59,130,246,0.1); color:#1d4ed8; }

  /* Range grid */
  .rng-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
  .rng-tbl thead th { font-family:'Inter',sans-serif; font-size:12px; font-weight:600; color:#374151; padding:10px 12px; text-align:left; background:#dce8e8; white-space:nowrap; border-bottom:1px solid rgba(30,58,64,0.1); position:sticky; top:0; z-index:2; }
  .rng-tbl thead th:first-child { width:110px; }
  .rng-tbl tbody tr:nth-child(odd)  td { background:#e2ecec; }
  .rng-tbl tbody tr:nth-child(even) td { background:#d8e4e4; }
  .rng-tbl tbody tr:hover td { background:#cddada; }
  .rng-tbl td { padding:6px 10px; height:52px; font-family:'Inter',sans-serif; font-size:12px; vertical-align:middle; border-bottom:1px solid rgba(0,0,0,0.03); }
  .rng-cell-btn { width:100%; border:none; border-radius:8px; padding:7px 5px; background:rgba(30,58,64,0.09); color:#1e3a40; font-weight:700; font-size:12px; cursor:pointer; font-family:'Inter',sans-serif; transition:filter .15s,transform .15s; text-align:center; }
  .rng-cell-btn:hover { filter:brightness(0.9); transform:scale(1.02); }
  .rng-cell-empty { text-align:center; color:#c4cdd4; font-size:13px; }

  /* Bookings table */
  .bk-tbl { width:100%; border-collapse:collapse; }
  .bk-tbl thead th { background:#1e3a40; color:#fff; font-family:'Inter',sans-serif; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; padding:10px 12px; text-align:left; white-space:nowrap; }
  .bk-tbl tbody tr { border-bottom:1px solid #e5eaeb; transition:background 0.12s; }
  .bk-tbl tbody tr:last-child { border-bottom:none; }
  .bk-tbl tbody tr:hover { background:#f0f7f8; }
  .bk-tbl td { font-family:'Inter',sans-serif; font-size:12px; color:#1f2937; padding:9px 12px; vertical-align:middle; }
  .bk-card { background:#fff; border-radius:12px; border:1px solid #c8d6d8; padding:13px; display:flex; flex-direction:column; gap:9px; cursor:pointer; transition:box-shadow 0.18s; }
  .bk-card:hover { box-shadow:0 2px 10px rgba(0,0,0,0.08); }

  /* Stat card */
  .stat-card { border-radius:12px; padding:15px 16px; display:flex; align-items:flex-start; justify-content:space-between; background:#deeaeb; border:1px solid rgba(0,0,0,0.05); transition:box-shadow 0.18s,transform 0.15s; cursor:default; }
  .stat-card:hover { box-shadow:0 4px 14px rgba(0,0,0,0.09); transform:translateY(-1px); }
  .stat-card.rev   { background:linear-gradient(135deg,#daeef0 0%,#cce3e8 100%); border:1px solid rgba(87,200,210,0.3); }

  /* Filter select */
  .f-sel { appearance:none; -webkit-appearance:none; border-radius:8px; border:1px solid rgba(0,0,0,0.1); padding:7px 28px 7px 11px; height:36px; font-family:'Inter',sans-serif; font-size:12px; color:#374151; background:#d8e4e4 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center; cursor:pointer; outline:none; }
  .f-sel:focus { outline:2px solid #1e3a40; outline-offset:1px; }

  /* Search */
  .srch { border:1.5px solid #c0cbcc; border-radius:10px; padding:0 14px 0 38px; height:40px; width:260px; font-family:'Inter',sans-serif; font-size:14px; color:#1f2937; background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s; }
  .srch:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .srch::placeholder { color:rgba(0,0,0,0.35); }
  .search-dropdown { position:absolute; top:calc(100% + 6px); left:0; right:0; background:#fff; border-radius:12px; box-shadow:0 10px 32px rgba(0,0,0,0.16),0 2px 8px rgba(0,0,0,0.08); border:1px solid rgba(30,58,64,0.1); max-height:360px; overflow-y:auto; z-index:600; padding:6px; }
  .search-result-item { width:100%; display:flex; align-items:center; gap:9px; padding:8px 9px; border:none; background:transparent; border-radius:8px; cursor:pointer; text-align:left; font-family:'Inter',sans-serif; transition:background 0.12s; }
  .search-result-item:hover { background:rgba(30,58,64,0.06); }
  .search-tag { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#0f766e; background:rgba(56,178,172,0.12); border-radius:5px; padding:2px 6px; flex-shrink:0; }

  /* Activity card */
  .act-card { border:1px solid rgba(30,58,64,0.12); border-radius:10px; display:flex; align-items:stretch; background:#fff; overflow:hidden; transition:box-shadow 0.18s; }
  .act-card:hover { box-shadow:0 2px 8px rgba(0,0,0,0.07); }
  .act-bar  { width:4px; flex-shrink:0; background:#1e3a40; }
  .act-body { padding:9px 11px; flex:1; }

  /* Modal */
  .modal-bg  { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:9999; display:flex; align-items:flex-end; justify-content:center; backdrop-filter:blur(4px); }
  .modal-box { background:#fff; border-radius:20px 20px 0 0; width:100%; max-width:560px; max-height:92vh; overflow-y:auto; box-shadow:0 -8px 40px rgba(0,0,0,0.2); font-family:'Inter',sans-serif; }
  @media(min-width:700px) { .modal-bg { align-items:center; padding:16px; } .modal-box { border-radius:16px; } }

  .date-trigger { display:flex; align-items:center; gap:6px; background:none; border:none; cursor:pointer; font-family:'Inter',sans-serif; font-size:15px; font-weight:600; color:#1f2937; padding:4px 8px; border-radius:8px; transition:background 0.15s; white-space:nowrap; }
  .date-trigger:hover { background:rgba(30,58,64,0.08); }
  .cal-popup { position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); background:#fff; border-radius:14px; padding:14px; box-shadow:0 8px 32px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.1); border:1px solid rgba(30,58,64,0.1); z-index:500; min-width:270px; }
  .cal-nav { width:28px; height:28px; border-radius:7px; border:none; background:transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#374151; transition:background 0.15s; }
  .cal-nav:hover { background:rgba(30,58,64,0.08); }
  .cal-grid-c  { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
  .cal-daylbl  { text-align:center; font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; padding:4px 0 6px; letter-spacing:0.04em; }
  .cal-day     { text-align:center; padding:5px 2px; border-radius:7px; font-size:12px; font-weight:500; color:#374151; cursor:pointer; transition:background 0.12s,color 0.12s; border:none; background:transparent; font-family:'Inter',sans-serif; }
  .cal-day:hover:not(:disabled) { background:rgba(30,58,64,0.08); }
  .cal-day.selected    { background:#1e3a40 !important; color:#fff !important; font-weight:700; }
  .cal-day.today       { color:#1e3a40; font-weight:700; box-shadow:inset 0 0 0 1.5px #1e3a40; }
  .cal-day.other-month { color:#c4cdd4; }
  .cal-month-title { font-size:14px; font-weight:700; color:#1f2937; cursor:pointer; padding:3px 7px; border-radius:6px; transition:background 0.12s; font-family:'Inter',sans-serif; border:none; background:transparent; }
  .cal-month-title:hover { background:rgba(30,58,64,0.07); }
  .month-grid  { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:4px; }
  .month-item  { text-align:center; padding:7px 4px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; transition:background 0.12s; border:none; background:transparent; font-family:'Inter',sans-serif; color:#374151; }
  .month-item:hover  { background:rgba(30,58,64,0.08); }
  .month-item.sel-mo { background:#1e3a40; color:#fff; font-weight:700; }
  .year-grid   { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-top:4px; }
  .year-item   { text-align:center; padding:7px 2px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; transition:background 0.12s; border:none; background:transparent; font-family:'Inter',sans-serif; color:#374151; }
  .year-item:hover  { background:rgba(30,58,64,0.08); }
  .year-item.sel-yr { background:#1e3a40; color:#fff; font-weight:700; }
  .nav-arr { background:none; border:none; cursor:pointer; color:#1e3a40; display:flex; align-items:center; padding:4px 5px; border-radius:7px; transition:background 0.15s; }
  .nav-arr:hover { background:rgba(0,0,0,0.06); }

  .search-highlight-ring { box-shadow:0 0 0 3px rgba(30,58,64,0.45),0 4px 18px rgba(30,58,64,0.22) !important; animation:pulseRing 1.4s ease-out 1; border-radius:12px; }
  .notif-drop { position:absolute; top:calc(100% + 10px); right:0; background:#fff; border-radius:14px; min-width:300px; max-width:340px; box-shadow:0 8px 32px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.1); border:1px solid rgba(30,58,64,0.1); z-index:600; overflow:hidden; }

  .prod-cb { width:17px; height:17px; border-radius:5px; border:2px solid #9ca3af; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:border-color 0.15s,background 0.15s; }
  .prod-cb.checked { border-color:#1e3a40; background:#1e3a40; }
  .order-sel-btn { width:100%; padding:11px; border-radius:9px; border:none; background:linear-gradient(135deg,#1e3a40,#2d5a64); color:#fff; font-family:'Inter',sans-serif; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:filter 0.15s; }
  .order-sel-btn:hover { filter:brightness(1.1); }
  .waiting-item { background:#fff; border:1px solid #dbe6e7; border-radius:10px; padding:10px 12px; display:flex; align-items:center; gap:10px; transition:box-shadow 0.15s; }
  .waiting-item:hover { box-shadow:0 2px 8px rgba(0,0,0,0.07); }

  @media(max-width:1199px) { .right-col{width:220px!important;} .srch{width:200px!important;} }
  @media(max-width:960px)  { .right-col{display:none!important;} }
`;

/* ─────────────────────────────────────────
   ICONS  (page-local, not exported)
───────────────────────────────────────── */
function IBell()   { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({s=14}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IChevL({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function IChevR({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function IPlus()   { return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1e3a40" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>; }
function IReceipt({s=26}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 2 2 2-2 2 2 2-2 3 2V2l-3 2-2-2-2 2-2-2-2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>; }
function IAppt({s=26}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/></svg>; }
function IEnq({s=26}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>; }
function ICheck({s=26}:{s?:number})  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function ICheckSm(){ return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function IX()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function IClock()  { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function ILoc()    { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function IPerson() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function ICalSm()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IBox({s=15}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function ITruck({s=14}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>; }
function IPhone({s=11}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>; }
function IUsers2() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }

/* ─────────────────────────────────────────
   BADGES / MINI STAT
───────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const lo = (status || '').toLowerCase();
  if (lo === 'confirmed') return <span className="badge b-ok"><span style={{width:5,height:5,borderRadius:'50%',background:'#22c55e',display:'inline-block'}}/> Confirmed</span>;
  if (lo === 'cancelled') return <span className="badge b-can"><span style={{width:5,height:5,borderRadius:'50%',background:'#ef4444',display:'inline-block'}}/> Cancelled</span>;
  return <span className="badge b-pnd"><span style={{width:5,height:5,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}/> Pending</span>;
}
function WaitingStatusBadge({ status }: { status: WaitingOrder['status'] }) {
  if (status === 'shipped')   return <span className="badge b-ship"><ITruck s={9}/> Shipped</span>;
  if (status === 'confirmed') return <span className="badge b-ok">Confirmed</span>;
  return <span className="badge b-pnd">Pending</span>;
}
function ModeBadge({ mode }: { mode: string }) {
  return mode === 'without_confirmation'
    ? <span className="badge b-wlk">Walk-in</span>
    : <span className="badge b-pre">Pre-booked</span>;
}
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{display:'flex',flexDirection:'column',lineHeight:1.25,minWidth:44}}>
      <span style={{fontSize:9,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>{label}</span>
      <span style={{fontSize:11.5,fontWeight:700,color:'#1e3a40'}}>{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────
   BOOKING DETAIL MODAL
───────────────────────────────────────── */
function BookingModal({ b, onClose }: { b: Booking; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box slide-up" onClick={e => e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 0'}}>
          <div style={{width:36,height:4,borderRadius:99,background:'#e0e0e0'}}/>
        </div>
        <div style={{background:'#1e3a40',padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
          <div>
            <p style={{color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase'}}>Booking</p>
            <p style={{color:'#fff',fontSize:18,fontWeight:700,marginTop:2}}>#{b.BookingId}</p>
          </div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'50%',width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff'}}><IX/></button>
        </div>
        <div style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:13}}>
          <div style={{background:'linear-gradient(135deg,#f0f7f8,#e4f0f2)',border:'1px solid #c0d8dc',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:'#1e3a40',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,flexShrink:0}}>{b.ClientName.charAt(0)}</div>
            <div>
              <p style={{fontSize:10,color:'#6b7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Client</p>
              <p style={{fontSize:15,fontWeight:700,color:'#1e3a40'}}>{b.ClientName}</p>
            </div>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><StatusBadge status={b.Status}/><ModeBadge mode={b.BookingMode}/><span className="badge b-pre"><IPerson/>{b.Gender}</span><span className="badge b-pre"><ILoc/>{b.Location}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
            <MIBox label="Date"     value={fmtDateLong(b.BookingDate)}/>
            <MIBox label="Time"     value={b.TimeSlot}/>
            <MIBox label="Duration" value={`${b.TotalDuration} min`}/>
            <MIBox label="Total"    value={`LKR ${b.TotalPrice.toLocaleString()}`}/>
          </div>
          <div>
            <MLbl>Providers</MLbl>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:6}}>
              {b.providers.map((p,i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:7,background:'#f0f7f8',border:'1px solid #c0d4d6',borderRadius:8,padding:'6px 10px'}}>
                  <div style={{width:24,height:24,borderRadius:'50%',background:'#1e3a40',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{p.name[0]}</div>
                  <div><p style={{fontSize:13,fontWeight:600,color:'#1f2937'}}>{p.name}</p><p style={{fontSize:11,color:'#6b7280'}}>{p.role}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <MLbl>Services</MLbl>
            <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:6}}>
              {b.services.map((sv,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafa',border:'1px solid #e0eaeb',borderRadius:8,padding:'7px 11px'}}>
                  <div><p style={{fontSize:13,fontWeight:600}}>{sv.name}</p><p style={{fontSize:11,color:'#6b7280'}}>{sv.category} · {sv.duration}</p></div>
                  <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>{sv.price}</span>
                </div>
              ))}
            </div>
          </div>
          {b.SpecialNotes && (
            <div style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.18)',borderRadius:8,padding:'8px 11px',fontSize:13,color:'#78350f',lineHeight:1.5}}>
              💬 {b.SpecialNotes}
            </div>
          )}
          <div style={{fontSize:11,color:'#9ca3af',marginTop:-4}}>Created: {fmtDT(b.CreatedAt)}</div>
          <button onClick={onClose} style={{width:'100%',padding:12,background:'#1e3a40',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif",marginTop:4}}>Close</button>
        </div>
      </div>
    </div>
  );
}
function MLbl({ children }: { children: React.ReactNode }) {
  return <p style={{fontSize:10,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#9ca3af'}}>{children}</p>;
}
function MIBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{background:'#f8fafa',border:'1px solid #e0eaeb',borderRadius:8,padding:'8px 11px'}}>
      <p style={{fontSize:10,color:'#9ca3af',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</p>
      <p style={{fontSize:13,fontWeight:600,color:'#1e3a40',marginTop:2}}>{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   DAY SCHEDULE GRID
───────────────────────────────────────── */
function DayScheduleGrid({ bookings, providers, onCardClick }: {
  bookings: Booking[]; providers: string[]; onCardClick: (b: Booking) => void;
}) {
  const totalSlots = TIME_SLOTS.length;
  const gridH      = totalSlots * SLOT_H;

  function getProviderAppts(providerName: string) {
    return bookings
      .filter(b => b.providers.some(p => p.name === providerName))
      .map(b => {
        const startMin  = slotToMin(b.TimeSlot);
        const offsetMin = startMin - DAY_START;
        const topPx     = (offsetMin / SLOT_MIN) * SLOT_H;
        const heightPx  = Math.max(SLOT_H, (b.TotalDuration / SLOT_MIN) * SLOT_H) - 4;
        const endLabel  = minToSlot(startMin + b.TotalDuration);
        return { booking: b, topPx, heightPx, endLabel };
      });
  }

  function cardCls(status: string) {
    const lo = status.toLowerCase();
    if (lo === 'confirmed') return 'appt-card-cal card-confirmed';
    if (lo === 'cancelled') return 'appt-card-cal card-cancelled';
    return 'appt-card-cal card-pending';
  }
  function clientColor(status: string) {
    const lo = status.toLowerCase();
    if (lo === 'confirmed') return '#15803d';
    if (lo === 'cancelled') return '#b91c1c';
    return '#92400e';
  }

  return (
    <div className="cal-grid-wrap">
      <div className="cal-grid-outer" style={{minWidth: 72 + providers.length * 150}}>
        {/* Time gutter */}
        <div className="time-gutter">
          {TIME_SLOTS.map((slot, i) => {
            const [time, ampm] = slot.split(' ');
            return (
              <div key={i} className="time-label">
                <span>{time}<br/><span style={{fontSize:9,opacity:0.7}}>{ampm}</span></span>
              </div>
            );
          })}
        </div>
        {/* Provider columns */}
        <div className="provider-cols">
          {providers.map(provName => {
            const appts = getProviderAppts(provName);
            return (
              <div key={provName} className="provider-col">
                <div className="provider-header">{provName}</div>
                <div className="col-body" style={{height: gridH, position:'relative'}}>
                  {TIME_SLOTS.map((_,i) => <div key={i} className={`slot-row${i%2===1?' half':''}`}/>)}
                  {appts.map(({ booking: b, topPx, heightPx, endLabel }) => (
                    <button
                      key={b.BookingId}
                      className={cardCls(b.Status)}
                      style={{ top: topPx + 2, height: heightPx }}
                      onClick={() => onCardClick(b)}
                      title={`${b.ClientName} — ${b.services[0]?.name}`}
                    >
                      <div className="ac-service">{b.services[0]?.name}</div>
                      <div className="ac-time">{b.TimeSlot} – {endLabel}</div>
                      {heightPx > 60 && (
                        <div className="ac-client" style={{color: clientColor(b.Status)}}>{b.ClientName}</div>
                      )}
                      {heightPx > 90 && (
                        <div className="ac-badges">
                          <span className={`ac-badge ${b.BookingMode==='without_confirmation'?'ac-badge-wlk':'ac-badge-pre'}`}>
                            {b.BookingMode==='without_confirmation'?'Walk-in':'Pre-booked'}
                          </span>
                          <span className="ac-badge ac-badge-dur">{b.TotalDuration}M</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   RANGE GRID
───────────────────────────────────────── */
function RangeScheduleGrid({ dates, providers, counts, onCellClick }: {
  dates: string[]; providers: string[];
  counts: Record<string, Record<string, number>>;
  onCellClick: (iso: string) => void;
}) {
  const today = todayISO();
  return (
    <div style={{overflowX:'auto',overflowY:'auto',flex:1,WebkitOverflowScrolling:'touch'}}>
      <table className="rng-tbl" style={{minWidth: Math.max(providers.length * 110 + 190, 500)}}>
        <thead>
          <tr>
            <th>Date</th>
            {providers.map(p => <th key={p}>{p}</th>)}
            <th style={{width:90}}>Total</th>
          </tr>
        </thead>
        <tbody>
          {dates.map(iso => {
            const dc    = counts[iso] || {};
            const total = providers.reduce((s, p) => s + (dc[p] || 0), 0);
            const d     = new Date(iso + 'T00:00');
            const isToday = iso === today;
            return (
              <tr key={iso}>
                <td>
                  <span style={{display:'block',fontSize:12,fontWeight:700,color:isToday?'#1e3a40':'#374151'}}>
                    {d.toLocaleDateString('en-GB',{weekday:'short'})}{isToday?' •':''}
                  </span>
                  <span style={{display:'block',fontSize:10,color:'#9ca3af'}}>{fmtDateShort(iso)}</span>
                </td>
                {providers.map(p => {
                  const c = dc[p] || 0;
                  if (c === 0) return <td key={p}><div className="rng-cell-empty">—</div></td>;
                  return (
                    <td key={p} style={{padding:'5px 8px'}}>
                      <button className="rng-cell-btn" onClick={() => onCellClick(iso)}>
                        {c} appointment{c>1?'s':''}
                      </button>
                    </td>
                  );
                })}
                <td style={{fontWeight:700,color:'#1e3a40',textAlign:'center',fontSize:13}}>
                  {total > 0 ? `${total}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────
   LOW STOCK PANEL
───────────────────────────────────────── */
function LowStockPanel({ products }: { products: ProductStock[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  function toggleOne(id: number) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(prev => prev.size === products.length ? new Set() : new Set(products.map(p => p.id)));
  }
  const selectedProducts = products.filter(p => selected.has(p.id));
  function handleOrderSelected() {
    alert(`Ordering ${selectedProducts.length} items:\n${selectedProducts.map(p=>`• ${p.name} (${p.supplier})`).join('\n')}`);
  }
  function handleOrderOne(p: ProductStock) {
    alert(`Order Now:\n${p.name}\nSupplier: ${p.supplier}\nPhone: ${p.supplierPhone}`);
  }

  return (
    <div id="products-panel" style={{background:'#deeaea',borderRadius:12,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',padding:15,display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><IBox s={17}/><h3 style={{fontSize:15,fontWeight:600,color:'#1f2937'}}>Products Running Low</h3></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={toggleAll} style={{fontSize:11,fontWeight:600,color:'#1e3a40',background:'rgba(30,58,64,0.08)',border:'1px solid rgba(30,58,64,0.15)',borderRadius:7,padding:'4px 10px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
            {selected.size === products.length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="badge b-can">{products.length} LOW</span>
        </div>
      </div>
      {selected.size > 0 && (
        <button className="order-sel-btn slide-dn" onClick={handleOrderSelected}>
          <IBox s={15}/> Order Now Selected Items ({selected.size})
        </button>
      )}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {products.map(p => {
          const pct   = Math.min(100, Math.round((p.stock / p.threshold) * 100));
          const isSel = selected.has(p.id);
          return (
            <div key={p.id} style={{display:'flex',alignItems:'flex-start',gap:10,background:isSel?'rgba(30,58,64,0.05)':'#fff',border:isSel?'1.5px solid rgba(30,58,64,0.25)':'1px solid #dbe6e7',borderRadius:10,padding:'10px 11px',transition:'all 0.15s'}}>
              <button className={`prod-cb${isSel?' checked':''}`} onClick={() => toggleOne(p.id)} style={{marginTop:3}}>{isSel && <ICheckSm/>}</button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                  <p style={{fontSize:13,fontWeight:600,color:'#1f2937',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</p>
                  <button onClick={() => handleOrderOne(p)} style={{flexShrink:0,background:'#1e3a40',color:'#fff',border:'none',borderRadius:7,padding:'5px 11px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}>Order Now</button>
                </div>
                <p style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{p.category} · {p.stock} {p.unit} left</p>
                <div style={{display:'flex',alignItems:'center',gap:5,marginTop:5,background:'rgba(30,58,64,0.05)',borderRadius:6,padding:'4px 8px'}}>
                  <IPhone s={10}/>
                  <p style={{fontSize:10.5,color:'#4b5563',fontWeight:500}}><span style={{fontWeight:700}}>{p.supplier}</span> · {p.supplierPhone}</p>
                </div>
                <div style={{height:4,borderRadius:99,background:'#eef2f2',marginTop:6,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${pct}%`,background:pct<30?'#ef4444':'#f59e0b',borderRadius:99,transition:'width 0.3s'}}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   WAITING ORDERS PANEL
───────────────────────────────────────── */
function WaitingOrdersPanel({ orders }: { orders: WaitingOrder[] }) {
  return (
    <div id="waiting-orders-panel" style={{background:'#deeaea',borderRadius:12,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',padding:15,display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><ITruck s={17}/><h3 style={{fontSize:15,fontWeight:600,color:'#1f2937'}}>Waiting Orders</h3></div>
        <span className="badge b-pnd">{orders.length} orders</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:7}}>
        {orders.map(o => (
          <div key={o.id} className="waiting-item">
            <div style={{width:38,height:38,borderRadius:9,background:'linear-gradient(135deg,#e0f2fe,#bae6fd)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#0369a1'}}><IBox s={17}/></div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:13,fontWeight:600,color:'#1f2937',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.productName}</p>
              <p style={{fontSize:11,color:'#6b7280',marginTop:1}}>Supplier: {o.supplier} · Qty: {o.qty}</p>
              <p style={{fontSize:10,color:'#9ca3af',marginTop:1}}>Ordered: {o.orderedAt}</p>
            </div>
            <WaitingStatusBadge status={o.status}/>
          </div>
        ))}
        {orders.length === 0 && <p style={{fontSize:12,color:'#9ca3af',textAlign:'center',padding:'8px 0'}}>No waiting orders.</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   BOOKINGS TABLE
───────────────────────────────────────── */
function BkCard({ b, onView }: { b: Booking; onView: () => void }) {
  return (
    <div className="bk-card" onClick={onView}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>#{b.BookingId}</span><ModeBadge mode={b.BookingMode}/></div>
        <StatusBadge status={b.Status}/>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'#1e3a40',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{b.ClientName.charAt(0)}</div>
        <span style={{fontSize:13,fontWeight:600,color:'#1f2937'}}>{b.ClientName}</span>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        <span style={{display:'flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600}}><IClock/>{b.TimeSlot}</span>
        <span style={{display:'flex',alignItems:'center',gap:3,fontSize:12,color:'#6b7280'}}><ILoc/>{b.Location}</span>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {b.services.map((sv,i) => <span key={i} style={{background:'rgba(30,58,64,0.08)',borderRadius:99,padding:'2px 8px',fontSize:11,fontWeight:600,color:'#1e3a40'}}>{sv.name}</span>)}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#1e3a40'}}>LKR {b.TotalPrice.toLocaleString()}<span style={{fontSize:11,fontWeight:400,color:'#6b7280',marginLeft:4}}>{b.TotalDuration}min</span></span>
        <button onClick={e=>{e.stopPropagation();onView();}} style={{background:'#1e3a40',color:'#fff',border:'none',borderRadius:8,padding:'5px 13px',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>View</button>
      </div>
    </div>
  );
}

function BookingsTable({ bookings }: { bookings: Booking[] }) {
  const [stF, setStF] = useState('all');
  const [moF, setMoF] = useState('all');
  const [sel, setSel] = useState<Booking|null>(null);
  const list = bookings.filter(b => {
    const sOk = stF === 'all' || b.Status.toLowerCase() === stF;
    const mOk = moF === 'all' || (moF === 'walkin' && b.BookingMode === 'without_confirmation') || (moF === 'pre' && b.BookingMode !== 'without_confirmation');
    return sOk && mOk;
  });
  return (
    <>
      {sel && <BookingModal b={sel} onClose={() => setSel(null)}/>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:11}}>
        <select className="f-sel" value={stF} onChange={e=>setStF(e.target.value)}>
          <option value="all">All Statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option>
        </select>
        <select className="f-sel" value={moF} onChange={e=>setMoF(e.target.value)}>
          <option value="all">All Modes</option><option value="pre">Pre-booked</option><option value="walkin">Walk-in</option>
        </select>
        <span style={{marginLeft:'auto',fontSize:12,color:'#6b7280',fontWeight:500}}>{list.length} result{list.length!==1?'s':''}</span>
      </div>
      <div className="bk-tbl-wrap" style={{borderRadius:10,overflow:'hidden',border:'1px solid #c8d6d8'}}>
        <div style={{overflowX:'auto'}}>
          <table className="bk-tbl">
            <thead>
              <tr><th>#</th><th>Client</th><th>Time</th><th>Location</th><th>Provider</th><th>Services</th><th>Dur.</th><th>Price</th><th>Mode</th><th>Status</th><th/></tr>
            </thead>
            <tbody>
              {list.length === 0
                ? <tr><td colSpan={11} style={{textAlign:'center',padding:'2rem',color:'#9ca3af',fontSize:13}}>No bookings match filters.</td></tr>
                : list.map(b => (
                  <tr key={b.BookingId}>
                    <td style={{fontWeight:700,color:'#1e3a40'}}>#{b.BookingId}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:24,height:24,borderRadius:'50%',background:'#1e3a40',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0}}>{b.ClientName.charAt(0)}</div>
                        <div><p style={{fontWeight:600,fontSize:12}}>{b.ClientName}</p><p style={{fontSize:10,color:'#9ca3af'}}>{b.Gender}</p></div>
                      </div>
                    </td>
                    <td><span style={{display:'flex',alignItems:'center',gap:4,fontWeight:600,whiteSpace:'nowrap'}}><IClock/>{b.TimeSlot}</span></td>
                    <td><span style={{display:'flex',alignItems:'center',gap:3,color:'#6b7280',whiteSpace:'nowrap'}}><ILoc/>{b.Location}</span></td>
                    <td>{b.providers.map((p,i) => <div key={i} style={{display:'flex',alignItems:'center',gap:4,marginBottom:1}}><div style={{width:16,height:16,borderRadius:'50%',background:'#1e3a40',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700}}>{p.name[0]}</div><span style={{fontSize:11,fontWeight:500}}>{p.name}</span></div>)}</td>
                    <td>{b.services.map((sv,i) => <span key={i} style={{background:'rgba(30,58,64,0.07)',borderRadius:99,padding:'2px 7px',fontSize:10,fontWeight:600,color:'#1e3a40',display:'inline-block',marginRight:3,marginBottom:2,whiteSpace:'nowrap'}}>{sv.name}</span>)}</td>
                    <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{b.TotalDuration}m</td>
                    <td style={{fontWeight:700,color:'#1e3a40',whiteSpace:'nowrap'}}>LKR {b.TotalPrice.toLocaleString()}</td>
                    <td><ModeBadge mode={b.BookingMode}/></td>
                    <td><StatusBadge status={b.Status}/></td>
                    <td><button onClick={() => setSel(b)} style={{background:'#1e3a40',color:'#fff',border:'none',borderRadius:6,padding:'4px 11px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>View</button></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
      <div className="bk-cards" style={{display:'none',flexDirection:'column',gap:9}}>
        {list.length === 0
          ? <p style={{textAlign:'center',color:'#9ca3af',padding:'2rem 0',fontSize:13}}>No bookings.</p>
          : list.map(b => <BkCard key={b.BookingId} b={b} onView={() => setSel(b)}/>)
        }
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   CALENDAR POPUP
───────────────────────────────────────── */
type CalView = 'day' | 'month' | 'year';
function CalendarPopup({ value, onChange, onClose }: { value:string; onChange:(iso:string)=>void; onClose:()=>void }) {
  const sel    = new Date(value + 'T00:00');
  const todayD = new Date(todayISO() + 'T00:00');
  const [view,      setView]      = useState<CalView>('day');
  const [calYear,   setCalYear]   = useState(sel.getFullYear());
  const [calMonth,  setCalMonth]  = useState(sel.getMonth());
  const [yearBase,  setYearBase]  = useState(Math.floor(sel.getFullYear() / 16) * 16);
  const selDay = sel.getDate(), selMonth = sel.getMonth(), selYear = sel.getFullYear();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays    = new Date(calYear, calMonth, 0).getDate();
  const cells: {d:number;m:number;y:number;cur:boolean}[] = [];
  for (let i = 0; i < firstDow; i++) {
    const pm = calMonth===0?11:calMonth-1, py = calMonth===0?calYear-1:calYear;
    cells.push({d: prevDays-firstDow+1+i, m:pm, y:py, cur:false});
  }
  for (let i = 1; i <= daysInMonth; i++) cells.push({d:i, m:calMonth, y:calYear, cur:true});
  for (let i = 1; i <= 42 - cells.length; i++) {
    const nm = calMonth===11?0:calMonth+1, ny = calMonth===11?calYear+1:calYear;
    cells.push({d:i, m:nm, y:ny, cur:false});
  }
  return (
    <div className="cal-popup pop-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <button className="cal-nav" onClick={() => {
          if (view==='day')   { calMonth===0?(setCalMonth(11),setCalYear(y=>y-1)):setCalMonth(m=>m-1); }
          if (view==='month') { setCalYear(y=>y-1); }
          if (view==='year')  { setYearBase(b=>b-16); }
        }}><IChevL s={14}/></button>
        <button className="cal-month-title" onClick={() => {
          if (view==='day') setView('month'); else if (view==='month') setView('year'); else setView('day');
        }}>
          {view==='day'   && `${MONTHS_LONG[calMonth]} ${calYear}`}
          {view==='month' && `${calYear}`}
          {view==='year'  && `${yearBase}–${yearBase+15}`}
        </button>
        <button className="cal-nav" onClick={() => {
          if (view==='day')   { calMonth===11?(setCalMonth(0),setCalYear(y=>y+1)):setCalMonth(m=>m+1); }
          if (view==='month') { setCalYear(y=>y+1); }
          if (view==='year')  { setYearBase(b=>b+16); }
        }}><IChevR s={14}/></button>
      </div>
      {view==='day' && (
        <>
          <div className="cal-grid-c">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><div key={d} className="cal-daylbl">{d}</div>)}</div>
          <div className="cal-grid-c">
            {cells.map((c,i) => {
              const isT   = c.d===todayD.getDate()&&c.m===todayD.getMonth()&&c.y===todayD.getFullYear();
              const isSel = c.d===selDay&&c.m===selMonth&&c.y===selYear;
              return (
                <button key={i} className={`cal-day${!c.cur?' other-month':''}${isSel?' selected':''}${isT&&!isSel?' today':''}`}
                  onClick={() => { onChange(isoFromYMD(c.y,c.m,c.d)); onClose(); }}>
                  {c.d}
                </button>
              );
            })}
          </div>
        </>
      )}
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
      <button className="nav-arr" onClick={() => onChange(shiftDate(date, -1))}><IChevL/></button>
      <button className="date-trigger" onClick={() => setOpen(o => !o)}>
        <ICalSm/><span>{fmtDateNav(date)}</span><IChevD s={11}/>
      </button>
      <button className="nav-arr" onClick={() => onChange(shiftDate(date, 1))}><IChevR/></button>
      {open && <CalendarPopup value={date} onChange={d=>{onChange(d);setOpen(false);}} onClose={() => setOpen(false)}/>}
    </div>
  );
}

/* ─────────────────────────────────────────
   NOTIFICATION DROPDOWN
───────────────────────────────────────── */
function NotifDropdown({ onScrollToLow, onClose }: { onScrollToLow:()=>void; onClose:()=>void }) {
  return (
    <div className="notif-drop pop-in" onClick={e => e.stopPropagation()}>
      <div style={{background:'#1e3a40',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{color:'#fff',fontSize:14,fontWeight:700}}>Notifications</span>
        <button onClick={onClose} style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'50%',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff'}}><IX/></button>
      </div>
      <button
        onClick={() => { onScrollToLow(); onClose(); }}
        style={{width:'100%',display:'flex',alignItems:'flex-start',gap:11,padding:'13px 16px',border:'none',background:'transparent',cursor:'pointer',textAlign:'left',borderBottom:'1px solid #f0f4f4',fontFamily:"'Inter',sans-serif",transition:'background 0.12s'}}
        onMouseEnter={e  => e.currentTarget.style.background='rgba(30,58,64,0.04)'}
        onMouseLeave={e  => e.currentTarget.style.background='transparent'}
      >
        <div style={{width:36,height:36,borderRadius:9,background:'rgba(239,68,68,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><IBox s={17}/></div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:13,fontWeight:700,color:'#1f2937'}}>Products Running Low</p>
          <p style={{fontSize:12,color:'#6b7280',marginTop:2,lineHeight:1.45}}><span style={{fontWeight:700,color:'#b91c1c'}}>{LOW_STOCK.length} products</span> below threshold.</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
            {LOW_STOCK.slice(0,3).map(p => <span key={p.id} style={{background:'rgba(239,68,68,0.08)',borderRadius:99,padding:'2px 7px',fontSize:10,fontWeight:600,color:'#b91c1c'}}>{p.name}</span>)}
            {LOW_STOCK.length > 3 && <span style={{fontSize:10,color:'#9ca3af',fontWeight:600,alignSelf:'center'}}>+{LOW_STOCK.length-3} more</span>}
          </div>
          <p style={{fontSize:11,color:'#1e3a40',fontWeight:600,marginTop:5}}>Click to view →</p>
        </div>
      </button>
      <div style={{padding:'12px 16px'}}><p style={{fontSize:12,color:'#9ca3af',textAlign:'center'}}>No other notifications.</p></div>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function AdminDashboardPage() {
  const router = useRouter();
  const [admin,       setAdmin]       = useState<AdminUser|null>(null);
  const [navKey,      setNavKey]      = useState('dashboard');
  const [viewTab,     setViewTab]     = useState<'schedule'|'bookings'>('schedule');
  const [period,      setPeriod]      = useState<'today'|'week'|'month'>('today');
  const [date,        setDate]        = useState(todayISO());
  const [data,        setData]        = useState<DashboardData>(() => emptyData(todayISO()));
  const [loadError,   setLoadError]   = useState(false);
  const [search,      setSearch]      = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [highlightId, setHighlightId] = useState<string|null>(null);
  const [selBooking,  setSelBooking]  = useState<Booking|null>(null);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [bellKey,     setBellKey]     = useState(0);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const notifRef      = useRef<HTMLDivElement>(null);
  const lowStockRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin');
      setAdmin(raw ? JSON.parse(raw) : { name: 'MR. SAYO', email: 'admin@sayo.com' });
    } catch {
      setAdmin({ name: 'MR. SAYO', email: 'admin@sayo.com' });
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    fetch(`/api/dashboard?date=${encodeURIComponent(date)}`)
      .then(r => r.json())
      .then(j => {
        if (!active) return;
        if (j?.success) setData({ ...emptyData(date), ...j, activities: j.activities || [] });
        else setLoadError(true);
      })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [date]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSearchFocus(false);
      if (notifRef.current      && !notifRef.current.contains(e.target as Node))      setNotifOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function handleNav(key: string, path: string) { setNavKey(key); router.push(path); }

  function scrollToLowStock() {
    if (lowStockRef.current) {
      lowStockRef.current.scrollIntoView({ behavior:'smooth', block:'start' });
      setHighlightId('products-panel');
      window.setTimeout(() => setHighlightId(null), 1600);
    }
  }
  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior:'smooth', block:'start' });
      setHighlightId(id);
      window.setTimeout(() => setHighlightId(null), 1600);
    }
  }
  function handleBellClick() { setBellKey(k => k + 1); setNotifOpen(o => !o); }

  /* Range dates */
  const rangeDates = useMemo<string[]>(() => {
    if (period === 'week')  return Array.from({length:7}, (_,i) => shiftDate(date, i-6));
    if (period === 'month') {
      const d = new Date(date+'T00:00'), y = d.getFullYear(), m = d.getMonth();
      const days = new Date(y, m+1, 0).getDate();
      return Array.from({length:days}, (_,i) => isoFromYMD(y, m, i+1));
    }
    return [];
  }, [period, date]);

  const [rangeGrid, setRangeGrid] = useState<Record<string, Record<string, number>>>({});
  const [rangeProviders, setRangeProviders] = useState<string[]>([]);
  useEffect(() => {
    if (period === 'today' || rangeDates.length === 0) { setRangeGrid({}); setRangeProviders([]); return; }
    let active = true;
    const from = rangeDates[0];
    const to = rangeDates[rangeDates.length - 1];
    fetch(`/api/dashboard?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(j => { if (!active) return; if (j?.success) { setRangeGrid(j.counts || {}); setRangeProviders(j.providers || []); } })
      .catch(() => {});
    return () => { active = false; };
  }, [rangeDates, period]);

  /* Recent Activities = today's bookings + activity log (SMS results, edits) */
  const feed = useMemo(() => {
    const b = data.bookings.map(bk => ({ kind: 'booking' as const, time: bk.CreatedAt, b: bk, a: null as ActivityEntry | null }));
    const a = (data.activities || []).map(ac => ({ kind: 'log' as const, time: ac.timestamp, b: null as Booking | null, a: ac }));
    return [...b, ...a].sort((x, y) => +new Date(y.time) - +new Date(x.time)).slice(0, 8);
  }, [data]);

  function shiftRange(dir: 1 | -1) {
    if (period === 'week')  setDate(d => shiftDate(d, dir*7));
    else if (period === 'month') setDate(d => {
      const dt = new Date(d + 'T00:00'); dt.setMonth(dt.getMonth() + dir);
      return isoFromYMD(dt.getFullYear(), dt.getMonth(), 1);
    });
  }
  function rangeLabel(): string {
    if (period==='week'  && rangeDates.length) { const first=rangeDates[0],last=rangeDates[rangeDates.length-1],y=new Date(last+'T00:00').getFullYear(); return `${fmtDateShort(first)} – ${fmtDateShort(last)}, ${y}`; }
    if (period==='month' && rangeDates.length) { const d=new Date(rangeDates[0]+'T00:00'); return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; }
    return '';
  }

  /* Search */
  interface SearchResult { id:string; title:string; subtitle:string; tag:string; icon:React.ReactNode; onSelect:()=>void; }
  const searchResults = useMemo<SearchResult[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];
    data.bookings.forEach(b => {
      const hay = `${b.BookingId} ${b.ClientName} ${b.Location} ${b.Categories} ${b.services.map(s=>s.name).join(' ')} ${b.providers.map(p=>p.name).join(' ')} ${b.Status} ${b.TimeSlot}`.toLowerCase();
      if (hay.includes(q)) results.push({
        id: `bk-${b.BookingId}`, title: `#${b.BookingId} · ${b.ClientName}`,
        subtitle: `${b.services[0]?.name??''} · ${b.Location} · ${b.TimeSlot}`,
        tag: 'Booking', icon: <IAppt s={15}/>,
        onSelect: () => { setViewTab('schedule'); setPeriod('today'); setDate(b.BookingDate); scrollToId('schedule-panel'); setTimeout(() => setSelBooking(b), 350); },
      });
    });
    data.providers.filter(p => p.toLowerCase().includes(q)).forEach(p => {
      results.push({ id:`pv-${p}`, title:p, subtitle:'Service Provider', tag:'Provider', icon:<IUsers2/>, onSelect:() => { setViewTab('schedule'); scrollToId('schedule-panel'); } });
    });
    LOW_STOCK.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).forEach(p => {
      results.push({ id:`pd-${p.id}`, title:p.name, subtitle:`${p.category} · ${p.stock} ${p.unit} left`, tag:'Product', icon:<IBox/>, onSelect:() => scrollToLowStock() });
    });
    return results.slice(0, 9);
  }, [search, data]);

  const name    = (admin?.name || 'MR. SAYO').toUpperCase();
  const initial = name.replace('MR. ','').charAt(0);
  const revenue = data.stats.revenueOnline + data.stats.revenueWalkin;

  const PAGE  = '#c2d4d4';
  const PANEL = '#deeaea';
  const HDR   = '#dae6e6';

  return (
    <>
      <style>{CSS}</style>

      {selBooking && <BookingModal b={selBooking} onClose={() => setSelBooking(null)}/>}

      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>

        {/* ── SIDEBAR (desktop + mobile) ── */}
        <AdminSidebar
          active={navKey}
          onNav={handleNav}
          onLogout={() => router.push('/admin/login')}
        />

        {/* ── MAIN ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

          {/* HEADER */}
          <header className="hdr-inner" style={{background:HDR,height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10}}>
            <div className="srch-wrap" ref={searchWrapRef} style={{position:'relative',flexShrink:0}}>
              <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4}}><ISearch/></span>
              <input
                className="srch"
                placeholder="Search....."
                value={search}
                onChange={e => { setSearch(e.target.value); setSearchFocus(true); }}
                onFocus={() => setSearchFocus(true)}
              />
              {searchFocus && search.trim() && (
                <div className="search-dropdown pop-in">
                  {searchResults.length === 0
                    ? <p style={{padding:'12px 14px',fontSize:12,color:'#9ca3af'}}>No results for &quot;{search}&quot;</p>
                    : searchResults.map(r => (
                      <button key={r.id} className="search-result-item" onClick={() => { r.onSelect(); setSearchFocus(false); setSearch(''); }}>
                        <span style={{color:'#1e3a40',flexShrink:0}}>{r.icon}</span>
                        <span style={{flex:1,minWidth:0,textAlign:'left'}}>
                          <span style={{display:'block',fontSize:12,fontWeight:600,color:'#1f2937',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.title}</span>
                          <span style={{display:'block',fontSize:11,color:'#9ca3af',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.subtitle}</span>
                        </span>
                        <span className="search-tag">{r.tag}</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            <div style={{flex:1}}/>
            {/* Bell */}
            <div ref={notifRef} style={{position:'relative'}}>
              <button
                key={bellKey}
                onClick={handleBellClick}
                className={bellKey > 0 ? 'bell-shake' : ''}
                style={{background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8,position:'relative',transition:'background 0.15s'}}
                onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
              >
                <IBell/>
                <span style={{position:'absolute',top:0,right:0,minWidth:16,height:16,borderRadius:99,background:'#ef4444',color:'#fff',fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px',lineHeight:1,border:'2px solid '+HDR,pointerEvents:'none'}}>
                  {LOW_STOCK.length}
                </span>
              </button>
              {notifOpen && <NotifDropdown onScrollToLow={scrollToLowStock} onClose={() => setNotifOpen(false)}/>}
            </div>
            {/* Admin name */}
            <div className="hdr-name" style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <span style={{fontSize:14,fontWeight:500,color:'#1f2937'}}>{name}</span><IChevD s={13}/>
            </div>
            {/* Avatar */}
            <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0}}>
              {initial}
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{flex:1,overflow:'auto',padding:'13px 15px',display:'flex',flexDirection:'column',gap:13}}>
            <div style={{display:'flex',gap:13,alignItems:'flex-start'}}>

              {/* LEFT COLUMN */}
              <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:13}}>

                {/* STAT CARDS */}
                <div
                  id="stats-section"
                  className={`stat-grid${highlightId==='stats-section'?' search-highlight-ring':''}`}
                  style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:11,borderRadius:12}}
                >
                  {/* Revenue */}
                  <div className="stat-card rev">
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,color:'#4b5563',fontWeight:400}}>Today Revenue</p>
                      <p style={{fontSize:11,color:'#6b7280',marginTop:5}}>LKR</p>
                      <p style={{fontSize:28,fontWeight:700,color:'#1f2937',lineHeight:1.1,marginTop:2}}>{revenue.toLocaleString()}</p>
                      <div style={{display:'flex',gap:14,marginTop:8,paddingTop:8,borderTop:'1px dashed rgba(0,0,0,0.12)',flexWrap:'wrap'}}>
                        <MiniStat label="Online"  value={data.stats.revenueOnline.toLocaleString()}/>
                        <MiniStat label="Walk-in" value={data.stats.revenueWalkin.toLocaleString()}/>
                      </div>
                    </div>
                    <div className="stat-icon" style={{color:'#4a7a82',opacity:0.7,flexShrink:0}}><IReceipt s={26}/></div>
                  </div>
                  {/* Appointments */}
                  <div className="stat-card">
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,color:'#4b5563',fontWeight:400}}>Today<br/>Appointments</p>
                      <p style={{fontSize:28,fontWeight:700,color:'#1f2937',lineHeight:1,marginTop:8}}>{String(data.stats.totalToday).padStart(2,'0')}</p>
                      <div style={{display:'flex',gap:14,marginTop:8,paddingTop:8,borderTop:'1px dashed rgba(0,0,0,0.12)',flexWrap:'wrap'}}>
                        <MiniStat label="Online"  value={data.stats.onlineBookings}/>
                        <MiniStat label="Walk-in" value={data.stats.walkinBookings}/>
                      </div>
                    </div>
                    <div className="stat-icon" style={{color:'#4a7a82',opacity:0.7,flexShrink:0}}><IAppt s={26}/></div>
                  </div>
                  {/* Enquiry */}
                  <div className="stat-card">
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,color:'#4b5563',fontWeight:400}}>Today<br/>Enquiry</p>
                      <p style={{fontSize:28,fontWeight:700,color:'#1f2937',lineHeight:1,marginTop:8}}>{String(data.stats.emailCount+data.stats.callCount+data.stats.whatsappCount).padStart(2,'0')}</p>
                      <div style={{display:'flex',gap:10,marginTop:8,paddingTop:8,borderTop:'1px dashed rgba(0,0,0,0.12)',flexWrap:'wrap'}}>
                        <MiniStat label="Emails"    value={data.stats.emailCount}/>
                        <MiniStat label="Calls"     value={data.stats.callCount}/>
                        <MiniStat label="WhatsApp"  value={data.stats.whatsappCount}/>
                      </div>
                    </div>
                    <div className="stat-icon" style={{color:'#4a7a82',opacity:0.7,flexShrink:0}}><IEnq s={26}/></div>
                  </div>
                  {/* Clients */}
                  <div className="stat-card">
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,color:'#4b5563',fontWeight:400}}>Clients<br/>Visit</p>
                      <p style={{fontSize:28,fontWeight:700,color:'#1f2937',lineHeight:1,marginTop:8}}>{String(data.stats.totalConfirmed+data.stats.totalPending).padStart(2,'0')}</p>
                      <div style={{display:'flex',gap:14,marginTop:8,paddingTop:8,borderTop:'1px dashed rgba(0,0,0,0.12)',flexWrap:'wrap'}}>
                        <MiniStat label="So far"  value={data.stats.totalConfirmed}/>
                        <MiniStat label="Pending" value={data.stats.totalPending}/>
                      </div>
                    </div>
                    <div className="stat-icon" style={{color:'#4a7a82',opacity:0.7,flexShrink:0}}><ICheck s={26}/></div>
                  </div>
                </div>

                {/* SCHEDULE PANEL */}
                <div
                  id="schedule-panel"
                  className={highlightId==='schedule-panel'?'search-highlight-ring':''}
                  style={{background:PANEL,borderRadius:12,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',display:'flex',flexDirection:'column',overflow:'hidden'}}
                >
                  {/* Filters */}
                  <div style={{display:'flex',gap:9,padding:'13px 15px 0',flexWrap:'wrap',flexShrink:0}}>
                    <select className="f-sel" defaultValue="ALL SERVICES"><option>ALL SERVICES</option><option>HAIR</option><option>NAILS</option><option>MASSAGE</option></select>
                    <select className="f-sel" defaultValue="COLOMBO"><option>COLOMBO</option><option>KANDY</option><option>GALLE</option></select>
                    <select className="f-sel" defaultValue="ALL MODE"><option>ALL MODE</option><option>PRE-BOOKED</option><option>WALK-IN</option></select>
                  </div>

                  {/* Date / Range nav */}
                  <div style={{display:'flex',alignItems:'center',padding:'9px 15px',gap:8,flexWrap:'wrap',flexShrink:0}}>
                    {period === 'today'
                      ? <DateNav date={date} onChange={d => setDate(d)}/>
                      : (
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <button className="range-nav-btn" onClick={() => shiftRange(-1)}><IChevL s={14}/> Previous</button>
                          <span style={{fontSize:14,fontWeight:700,color:'#1f2937',padding:'0 4px',whiteSpace:'nowrap'}}>{rangeLabel()}</span>
                          <button className="range-nav-btn" onClick={() => shiftRange(1)}>Next <IChevR s={14}/></button>
                        </div>
                      )
                    }
                    <div style={{flex:1}}/>
                    {/* Period toggle */}
                    <div style={{background:'#ccd8d8',borderRadius:9,padding:'3px 4px',display:'flex',gap:2,flexShrink:0}}>
                      {(['today','week','month'] as const).map(t => (
                        <button
                          key={t}
                          className={`period-btn ${period===t?'active':''}`}
                          onClick={() => {
                            setPeriod(t);
                            if (t === 'today') setDate(todayISO());
                            else if (t === 'week') setDate(todayISO());
                            else { const now=new Date(); setDate(isoFromYMD(now.getFullYear(),now.getMonth(),1)); }
                          }}
                        >
                          {t[0].toUpperCase()+t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{height:1,background:'rgba(30,58,64,0.1)',flexShrink:0}}/>

                  {/* View toggle */}
                  <div style={{display:'flex',gap:8,padding:'9px 15px 7px',flexShrink:0}}>
                    <button className={`view-btn ${viewTab==='schedule'?'active':''}`} onClick={() => setViewTab('schedule')}>Schedule</button>
                    <button className={`view-btn ${viewTab==='bookings'?'active':''}`} onClick={() => setViewTab('bookings')}>Bookings ({data.bookings.length})</button>
                  </div>

                  {/* Schedule view */}
                  {viewTab === 'schedule' && (
                    <div className="fade-up" style={{height:480,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                      {period === 'today'
                        ? <DayScheduleGrid bookings={data.bookings} providers={data.providers} onCardClick={b => setSelBooking(b)}/>
                        : <RangeScheduleGrid dates={rangeDates} providers={rangeProviders} counts={rangeGrid} onCellClick={iso => { setPeriod('today'); setDate(iso); }}/>
                      }
                    </div>
                  )}

                  {/* Bookings view */}
                  {viewTab === 'bookings' && (
                    <div className="fade-up" style={{maxHeight:480,overflow:'auto',padding:'0 15px 15px'}}>
                      <BookingsTable bookings={data.bookings}/>
                    </div>
                  )}
                </div>

                {/* PRODUCTS RUNNING LOW */}
                <div
                  ref={lowStockRef}
                  id="products-panel"
                  className={highlightId==='products-panel'?'search-highlight-ring':''}
                  style={{transition:'box-shadow 0.3s',borderRadius:12}}
                >
                  <LowStockPanel products={LOW_STOCK}/>
                </div>

                {/* WAITING ORDERS */}
                <div
                  id="waiting-orders-panel"
                  className={highlightId==='waiting-orders-panel'?'search-highlight-ring':''}
                  style={{transition:'box-shadow 0.3s',borderRadius:12}}
                >
                  <WaitingOrdersPanel orders={WAITING_ORDERS}/>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="right-col" style={{width:232,flexShrink:0,display:'flex',flexDirection:'column',gap:13}}>
                {/* Greeting + New Appointment */}
                <div style={{background:PANEL,borderRadius:12,padding:15,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',display:'flex',flexDirection:'column',gap:13}}>
                  <div>
                    <p style={{fontSize:13,color:'#4b5563'}}>Good Morning.</p>
                    <p style={{fontSize:17,fontWeight:500,color:'#1f2937',marginTop:2}}>{name}</p>
                  </div>
                  <button
                    onClick={() => router.push('/appointmentform')}
                    style={{background:'#ccd8d8',borderRadius:10,width:'100%',padding:'14px 12px',display:'flex',flexDirection:'column',alignItems:'center',gap:5,border:'none',cursor:'pointer',transition:'background 0.18s',fontFamily:"'Inter',sans-serif"}}
                    onMouseEnter={e => e.currentTarget.style.background='#bccece'}
                    onMouseLeave={e => e.currentTarget.style.background='#ccd8d8'}
                  >
                    <IPlus/>
                    <span style={{fontSize:15,fontWeight:600,color:'#1f2937'}}>Appointment</span>
                  </button>
                </div>

                {/* Recent Activities */}
                <div
                  id="activities-panel"
                  className={highlightId==='activities-panel'?'search-highlight-ring':''}
                  style={{background:PANEL,borderRadius:12,padding:15,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',display:'flex',flexDirection:'column',gap:9}}
                >
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                    <h3 style={{fontSize:15,fontWeight:600,color:'#1f2937'}}>Recent Activities</h3>
                    {data.stats.totalPending > 0 && (
                      <span style={{background:'#1e3a40',color:'#fff',borderRadius:99,padding:'2px 9px',fontSize:10,fontWeight:700}}>
                        {data.stats.totalPending} NEW
                      </span>
                    )}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:7,overflowY:'auto'}}>
                    {feed.map((entry, i) => entry.kind === 'booking' ? (
                      <div key={`b-${entry.b!.BookingId}-${i}`} className="act-card" style={{cursor:'pointer'}} onClick={() => setSelBooking(entry.b!)}>
                        <div className="act-bar"/>
                        <div className="act-body">
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:2}}>
                            <p style={{fontSize:13,fontWeight:600,color:'#1f2937'}}>{entry.b!.services[0]?.name||'Appointment'}</p>
                            <StatusBadge status={entry.b!.Status}/>
                          </div>
                          <p style={{fontSize:12,color:'#1e3a40',fontWeight:600}}>{entry.b!.ClientName}</p>
                          <p style={{fontSize:12,color:'#374151',lineHeight:1.4}}>{entry.b!.providers[0]?.name??'Unknown'} · {entry.b!.TimeSlot}</p>
                          <p style={{fontSize:11,color:'rgba(0,0,0,0.38)',marginTop:3}}>{fmtDateShort(entry.b!.BookingDate)} · LKR {entry.b!.TotalPrice.toLocaleString()}</p>
                        </div>
                      </div>
                    ) : (
                      <div key={`a-${entry.a!.id}`} className="act-card" style={{borderLeft:`3px solid ${entry.a!.section === 'sms' ? (entry.a!.action.startsWith('SMS FAILED') ? '#e05252' : '#3ba55d') : '#4a7fa5'}`}}>
                        <div className="act-body">
                          <p style={{fontSize:12,fontWeight:600,color: entry.a!.section === 'sms' && entry.a!.action.startsWith('SMS FAILED') ? '#b3403f' : '#1f2937',lineHeight:1.4}}>{entry.a!.action}</p>
                          <p style={{fontSize:11,color:'rgba(0,0,0,0.38)',marginTop:3}}>{entry.a!.section.toUpperCase()} · {entry.a!.actor} · {fmtDateShort(entry.a!.timestamp.slice(0,10))}</p>
                        </div>
                      </div>
                    ))}
                    {feed.length === 0 && (
                      <p style={{fontSize:12,color:'#9ca3af',textAlign:'center',padding:'1rem 0'}}>{loadError ? 'Could not load dashboard data — check the server/DB.' : 'No recent activity.'}</p>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>{/* end main-body */}
        </div>{/* end main flex */}
      </div>{/* end root flex */}
    </>
  );
}