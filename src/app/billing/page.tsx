// app/billing/page.tsx
'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface ApptInfo {
  id: number;
  clientName: string;
  clientPhone: string;
  providerName: string;
  serviceName: string;
  date: string;
  timeSlot: string;
  duration: number;
  price: number;
  location: string;
  status: string;
  mode: string;
  gender: string;
  notes?: string;
}
interface BillItem {
  id: number;
  name: string;
  qty: number;
  price: number;
  mainTech: string;
  supporters: string;
}
type PayMethod = 'cash' | 'card' | 'online';

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtDateLong(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}
function fmtMoney(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}
function nowTimeLabel() {
  return new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}
function clamp(v:number,min:number,max:number){ return Math.min(Math.max(v,min),max); }

const NAV_ITEMS = [
  { key:'dashboard', label:'Dashboard', path:'/dashboard'        },
  { key:'mail',      label:'Messages',  path:'/admin/messages'   },
  { key:'calendar',  label:'Schedule',  path:'/appointment'      },
  { key:'dollar',    label:'Finance',   path:'/admin/finance'    },
  { key:'users',     label:'Team',      path:'/admin/team'       },
  { key:'chart',     label:'Reports',   path:'/admin/reports'    },
];

const PROVIDERS = ['Nadeesha','Piumi','Amaya','Deepika','Nihara','Kaveesha','Rohan'];

/* ─────────────────────────────────────────
   BUILD APPOINTMENT INFO FROM QUERY PARAMS
───────────────────────────────────────── */
function getApptFromParams(searchParams: ReturnType<typeof useSearchParams>): ApptInfo {
  const idParam = searchParams.get('appointmentId');
  const id = idParam ? Number(idParam) : 1;
  const clientName = searchParams.get('clientName');
  if (clientName) {
    return {
      id,
      clientName,
      clientPhone:  searchParams.get('clientPhone')  || '—',
      providerName: searchParams.get('providerName') || '—',
      serviceName:  searchParams.get('serviceName')  || 'Service',
      date:         searchParams.get('date')         || todayISO(),
      timeSlot:     searchParams.get('timeSlot')     || '—',
      duration:     Number(searchParams.get('duration')) || 30,
      price:        Number(searchParams.get('price'))    || 0,
      location:     searchParams.get('location')     || '—',
      status:       searchParams.get('status')       || 'ongoing',
      mode:         searchParams.get('mode')          || 'pre_booked',
      gender:       searchParams.get('gender')        || '—',
      notes:        searchParams.get('notes')         || '',
    };
  }
  return {
    id, clientName:'Walk-in Client', clientPhone:'—',
    providerName:'Nadeesha', serviceName:'Service',
    date:todayISO(), timeSlot:'9:00 AM', duration:30, price:0,
    location:'Colombo', status:'ongoing', mode:'pre_booked', gender:'—', notes:'',
  };
}

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  @keyframes popIn   { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }
  .fade-up { animation:fadeUp 0.22s ease both; }
  .pop-in  { animation:popIn  0.3s cubic-bezier(.34,1.56,.64,1) both; }

  ::-webkit-scrollbar       { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.2); border-radius:4px; }

  .sb-icon-btn {
    width:44px; height:44px; border-radius:10px;
    display:flex; align-items:center; justify-content:center;
    border:none; background:transparent;
    color:rgba(255,255,255,0.45); cursor:pointer;
    transition:background 0.18s, color 0.18s; flex-shrink:0;
  }
  .sb-icon-btn:hover  { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.85); }
  .sb-icon-btn.active { background:rgba(255,255,255,0.13); color:#fff; }
  .sb-row-btn {
    width:100%; height:44px; border-radius:10px;
    display:flex; align-items:center; gap:12px; padding:0 12px;
    border:none; background:transparent;
    color:rgba(255,255,255,0.45); cursor:pointer;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:500;
    transition:background 0.18s, color 0.18s; white-space:nowrap; text-align:left;
  }
  .sb-row-btn:hover  { background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.85); }
  .sb-row-btn.active { background:rgba(255,255,255,0.12); color:#fff; }
  .sb-grip {
    position:absolute; right:-14px; top:50%; transform:translateY(-50%);
    width:14px; height:52px;
    background:linear-gradient(180deg,#243c44 0%,#1a2e36 100%);
    border:1px solid rgba(255,255,255,0.1); border-left:none;
    border-radius:0 8px 8px 0;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3.5px;
    cursor:pointer; z-index:50; transition:background 0.18s, width 0.15s;
  }
  .sb-grip:hover { background:linear-gradient(180deg,#2e4a52 0%,#223840 100%); width:16px; }
  .sb-grip-line { width:5px; height:1.5px; border-radius:99px; background:rgba(255,255,255,0.5); transition:background 0.18s; }
  .sb-grip:hover .sb-grip-line { background:rgba(255,255,255,0.85); }

  .srch {
    border:1.5px solid #c0cbcc; border-radius:10px;
    padding:0 14px 0 38px; height:40px; width:260px;
    font-family:'Inter',sans-serif; font-size:14px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s, box-shadow 0.15s;
  }
  .srch:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .srch::placeholder { color:rgba(0,0,0,0.35); }

  .bill-card {
    background:#deeaea; border-radius:14px; border:1px solid rgba(0,0,0,0.05);
    box-shadow:0 1px 5px rgba(0,0,0,0.06); padding:18px;
  }
  .bill-sec-title {
    font-size:11px; font-weight:700; color:#5c7a80; text-transform:uppercase;
    letter-spacing:0.06em; margin-bottom:12px;
  }

  .item-tbl { width:100%; border-collapse:collapse; font-size:12px; }
  .item-tbl th {
    text-align:left; font-size:10px; font-weight:700; color:#6b7280;
    text-transform:uppercase; letter-spacing:0.05em;
    padding:0 5px 8px; border-bottom:1.5px solid rgba(30,58,64,0.12);
    white-space:nowrap;
  }
  .item-tbl td {
    padding:8px 5px; font-size:12px; color:#1f2937;
    border-bottom:1px solid rgba(30,58,64,0.06); vertical-align:middle;
  }
  .item-tbl tr:last-child td { border-bottom:none; }
  .qty-btn {
    width:20px; height:20px; border-radius:5px; border:1px solid #c8d6d8; background:#fff;
    display:flex; align-items:center; justify-content:center; cursor:pointer; color:#1e3a40;
    font-size:12px; font-weight:700; transition:background 0.12s; flex-shrink:0;
  }
  .qty-btn:hover { background:#eef4f4; }
  .rm-btn {
    width:24px; height:24px; border-radius:6px; border:none; background:rgba(239,68,68,0.08);
    color:#b91c1c; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background 0.15s;
  }
  .rm-btn:hover { background:rgba(239,68,68,0.16); }

  .inp {
    border:1.5px solid #c8d6d8; border-radius:8px; padding:8px 10px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937; outline:none;
    background:#fff; transition:border-color 0.15s;
  }
  .inp:focus { border-color:#1e3a40; }
  .inp-sm {
    border:1px solid #c8d6d8; border-radius:6px; padding:4px 7px;
    font-family:'Inter',sans-serif; font-size:11px; color:#1f2937; outline:none;
    background:#fff; transition:border-color 0.15s; width:100%;
  }
  .inp-sm:focus { border-color:#1e3a40; }
  .sel-sm {
    border:1px solid #c8d6d8; border-radius:6px; padding:4px 22px 4px 7px;
    font-family:'Inter',sans-serif; font-size:11px; color:#1f2937; outline:none;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 5px center;
    appearance:none; -webkit-appearance:none; cursor:pointer; width:100%;
  }
  .sel-sm:focus { border-color:#1e3a40; }

  .pay-opt {
    flex:1; padding:11px 6px; border-radius:10px; border:1.5px solid #c8d6d8;
    background:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:5px;
    transition:all 0.15s; font-family:'Inter',sans-serif;
  }
  .pay-opt:hover { border-color:#1e3a40; }
  .pay-opt.active { border-color:#1e3a40; background:rgba(30,58,64,0.06); box-shadow:0 0 0 1px #1e3a40 inset; }
  .pay-opt-lbl { font-size:11.5px; font-weight:600; color:#374151; }

  .sum-row {
    display:flex; justify-content:space-between; align-items:center;
    font-size:12.5px; color:#374151; padding:5px 0;
  }
  .sum-row.divider { border-top:1px solid rgba(30,58,64,0.1); margin-top:4px; padding-top:8px; }
  .sum-row.bold-row { font-weight:700; color:#1e3a40; }
  .sum-row.total-row {
    font-size:16px; font-weight:800; color:#1e3a40;
    border-top:2px dashed rgba(30,58,64,0.2); margin-top:6px; padding-top:10px;
  }
  .sum-inp {
    width:80px; text-align:right; border:1px solid #c8d6d8; border-radius:6px;
    padding:3px 7px; font-family:'Inter',sans-serif; font-size:12px; color:#1f2937;
    background:#fff; outline:none;
  }
  .sum-inp:focus { border-color:#1e3a40; }
  .sum-inp-wide {
    width:110px; text-align:right; border:1px solid #c8d6d8; border-radius:6px;
    padding:3px 7px; font-family:'Inter',sans-serif; font-size:12px; color:#1f2937;
    background:#fff; outline:none;
  }
  .sum-inp-wide:focus { border-color:#1e3a40; }

  .btn-primary {
    width:100%; padding:13px; border-radius:10px; border:none; background:#1e3a40; color:#fff;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:background 0.15s;
  }
  .btn-primary:hover { background:#16292d; }
  .btn-primary:disabled { background:#9ca3af; cursor:not-allowed; }
  .btn-ghost {
    width:100%; padding:11px; border-radius:10px; border:1.5px solid #c8d6d8; background:#fff; color:#374151;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.15s;
  }
  .btn-ghost:hover { background:#f3f7f7; }

  .badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:99px;
    font-size:10px; font-weight:700; font-family:'Inter',sans-serif;
    text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap;
  }
  .b-ong { background:rgba(59,130,246,0.1); color:#1d4ed8; }
  .b-pre { background:rgba(30,58,64,0.08);  color:#1e3a40; }

  .mob-nav {
    display:none; position:fixed; bottom:0; left:0; right:0; z-index:100;
    background:linear-gradient(180deg,#1a2e35 0%,#111e24 100%);
    height:64px; align-items:center; justify-content:space-around;
    padding:0 6px; border-top:1px solid rgba(255,255,255,0.07);
    box-shadow:0 -4px 20px rgba(0,0,0,0.25);
  }
  .mob-btn {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:3px; padding:6px 10px; border:none; background:transparent;
    color:rgba(255,255,255,0.4); cursor:pointer; border-radius:8px; transition:all 0.18s; min-width:44px;
  }
  .mob-btn.active { color:#fff; background:rgba(255,255,255,0.1); }
  .mob-lbl { font-size:9px; font-weight:600; letter-spacing:0.02em; font-family:'Inter',sans-serif; }

  @media(max-width:1100px) {
    .bill-layout { flex-direction:column !important; }
    .bill-right  { width:100% !important; position:static !important; }
  }
  @media(max-width:767px) {
    .sb-desktop { display:none !important; }
    .mob-nav    { display:flex !important; }
    .main-body  { padding-bottom:76px !important; }
    .hdr-name   { display:none !important; }
  }
  @media(max-width:480px) {
    .main-body { padding:10px !important; }
    .hdr-inner { padding:0 12px !important; height:52px !important; }
    .srch      { width:100% !important; font-size:13px !important; height:38px !important; }
    .srch-wrap { flex:1 !important; }
  }

  @media print {
    .no-print { display:none !important; }
    body, html { overflow:visible !important; background:#fff !important; }
    .print-area { box-shadow:none !important; border:1px solid #ddd !important; }
  }

  .add-row-inp {
    border:1px solid #c8d6d8; border-radius:7px; padding:7px 9px;
    font-family:'Inter',sans-serif; font-size:12px; color:#1f2937;
    background:#fff; outline:none;
  }
  .add-row-inp:focus { border-color:#1e3a40; }
  .add-row-sel {
    border:1px solid #c8d6d8; border-radius:7px; padding:7px 22px 7px 9px;
    font-family:'Inter',sans-serif; font-size:12px; color:#1f2937;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 6px center;
    appearance:none; -webkit-appearance:none; cursor:pointer; outline:none;
  }
  .add-row-sel:focus { border-color:#1e3a40; }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IGrid()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>; }
function IMail()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>; }
function ICal()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IDollar()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function IUsers()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IChart()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>; }
function ILogout()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IBell()    { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({s=13}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IBack()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function IPlus()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function ITrash()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>; }
function ICash()    { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>; }
function ICard()    { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>; }
function IOnline()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>; }
function IPrinter() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function ICheckBig(){ return <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function IClock()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function ILoc()     { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function IUserSm()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IPhone()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>; }

function navIcon(key: string) {
  if (key==='dashboard') return <IGrid/>;
  if (key==='mail')      return <IMail/>;
  if (key==='calendar')  return <ICal/>;
  if (key==='dollar')    return <IDollar/>;
  if (key==='users')     return <IUsers/>;
  if (key==='chart')     return <IChart/>;
  return <IGrid/>;
}

/* ─────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────── */
function Sidebar({ active, setActive, onLogout }: {
  active:string; setActive:(k:string)=>void; onLogout:()=>void;
}) {
  const [open, setOpen] = useState(false);
  const W = open ? 196 : 64;
  return (
    <aside className="sb-desktop no-print" style={{width:W,minWidth:W,height:'100vh',background:'linear-gradient(180deg,#1c2f37 0%,#111e25 100%)',display:'flex',flexDirection:'column',alignItems:open?'stretch':'center',paddingBottom:16,flexShrink:0,position:'relative',overflow:'visible',zIndex:20,transition:'width 0.24s cubic-bezier(.4,0,.2,1), min-width 0.24s cubic-bezier(.4,0,.2,1)'}}>
      <div style={{display:'flex',justifyContent:open?'flex-start':'center',padding:open?'12px 14px 6px':'12px 0 6px',flexShrink:0}}>
        <Image src="/sayologo.png" alt="Sayo" width={44} height={44} style={{objectFit:'contain'}}/>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',gap:2,padding:open?'6px 10px':'6px 0',alignItems:open?'stretch':'center',overflowX:'hidden'}}>
        {NAV_ITEMS.map(n=>open?(
          <button key={n.key} className={`sb-row-btn ${active===n.key?'active':''}`} onClick={()=>setActive(n.key)}>
            <span style={{flexShrink:0,display:'flex',alignItems:'center',width:20,justifyContent:'center'}}>{navIcon(n.key)}</span>
            <span style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap'}}>{n.label}</span>
          </button>
        ):(
          <button key={n.key} className={`sb-icon-btn ${active===n.key?'active':''}`} onClick={()=>setActive(n.key)} title={n.label}>{navIcon(n.key)}</button>
        ))}
      </div>
      <div style={{padding:open?'0 10px':'0',display:'flex',flexDirection:'column',alignItems:open?'stretch':'center'}}>
        {open?(
          <button className="sb-row-btn" onClick={onLogout} style={{color:'#f87171'}}>
            <span style={{flexShrink:0,display:'flex',alignItems:'center',width:20,justifyContent:'center'}}><ILogout/></span>
            <span style={{fontSize:13,fontWeight:500}}>Logout</span>
          </button>
        ):(
          <button className="sb-icon-btn" onClick={onLogout} title="Logout" style={{color:'#f87171'}}><ILogout/></button>
        )}
      </div>
      <div className="sb-grip" onClick={()=>setOpen(o=>!o)}>
        <div className="sb-grip-line"/><div className="sb-grip-line"/><div className="sb-grip-line"/>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────
   MOBILE NAV
───────────────────────────────────────── */
function MobNav({ active, onNav, onLogout }: {
  active:string; onNav:(k:string,p:string)=>void; onLogout:()=>void;
}) {
  return (
    <nav className="mob-nav no-print">
      {NAV_ITEMS.map(n=>(
        <button key={n.key} className={`mob-btn ${active===n.key?'active':''}`} onClick={()=>onNav(n.key,n.path)}>
          {navIcon(n.key)}<span className="mob-lbl">{n.label}</span>
        </button>
      ))}
      <button className="mob-btn" onClick={onLogout} style={{color:'#f87171'}}>
        <ILogout/><span className="mob-lbl">Logout</span>
      </button>
    </nav>
  );
}

/* ─────────────────────────────────────────
   BILLING CONTENT (useSearchParams inside)
───────────────────────────────────────── */
function BillingContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [navKey]     = useState('calendar');

  const appt = useMemo(() => getApptFromParams(searchParams), [searchParams]);

  const [invoiceNo, setInvoiceNo] = useState('');
  useEffect(() => {
    setInvoiceNo(`INV-${String(appt.id).padStart(4,'0')}-${Math.floor(Math.random()*900+100)}`);
  }, [appt.id]);

  const [items, setItems] = useState<BillItem[]>([
    { id:1, name:appt.serviceName, qty:1, price:appt.price, mainTech:appt.providerName, supporters:'' },
  ]);

  /* Pull technician additions (materials used + supporting technicians) so
     everything added after check-in lands on the bill automatically. */
  useEffect(() => {
    const bookingID = searchParams.get('appointmentId');
    if (!bookingID) return;
    let active = true;
    fetch(`/api/bookings/${encodeURIComponent(bookingID)}/extras`)
      .then((r) => r.json())
      .then((json) => {
        if (!active || !json.success) return;
        const recipe: Array<Record<string, unknown>> = Array.isArray(json.recipe) ? json.recipe : [];
        const addTech: Array<Record<string, unknown>> = Array.isArray(json.addTech) ? json.addTech : [];
        const techNames = Array.from(
          new Set(addTech.map((t) => String((t as { techName?: string }).techName || '').trim()).filter(Boolean)),
        );
        setItems((prev) => {
          let next = [...prev];
          if (recipe.length) {
            next = next.concat(
              recipe.map((row, i) => {
                const r = row as { rawItemDes?: string; rawItemCode?: string; qty?: number; retailPrice?: number };
                return {
                  id: Date.now() + i + 1,
                  name: `${r.rawItemDes || r.rawItemCode || 'Material'} (used)`,
                  qty: Number(r.qty) || 1,
                  price: Number(r.retailPrice) || 0,
                  mainTech: appt.providerName,
                  supporters: '',
                };
              }),
            );
          }
          if (techNames.length && next.length) {
            next = next.map((item, idx) =>
              idx === 0 ? { ...item, supporters: techNames.join(', ') } : item,
            );
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [newName,       setNewName]       = useState('');
  const [newPrice,      setNewPrice]      = useState('');
  const [newMainTech,   setNewMainTech]   = useState(appt.providerName);
  const [newSupporters, setNewSupporters] = useState('');

  const [discountPct,  setDiscountPct]  = useState<number|''>(0);
  const [discountAmt,  setDiscountAmt]  = useState<number|''>('');
  const [serChg,       setSerChg]       = useState<number|''>('');
  const [packChg,      setPackChg]      = useState<number|''>('');
  const [vatPct,       setVatPct]       = useState<number|''>('');
  const [nbtPct,       setNbtPct]       = useState<number|''>('');
  const [deliveryChg,  setDeliveryChg]  = useState<number|''>('');
  const [paidAmount,   setPaidAmount]   = useState<number|''>('');

  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [billNotes, setBillNotes] = useState(appt.notes || '');
  const [paid,      setPaid]      = useState(false);
  const [paidAt,    setPaidAt]    = useState('');

  const gross = items.reduce((s,i)=>s+i.qty*i.price, 0);

  const discAmt = useMemo(()=>{
    if (discountAmt !== '') return Number(discountAmt);
    if (discountPct !== '') return gross * (clamp(Number(discountPct),0,100)/100);
    return 0;
  },[gross, discountPct, discountAmt]);

  const grossAfterDis = Math.max(0, gross - discAmt);
  const serChgAmt     = Number(serChg)      || 0;
  const packChgAmt    = Number(packChg)     || 0;
  const tol           = grossAfterDis + serChgAmt + packChgAmt;
  const vatAmt        = tol * (clamp(Number(vatPct),0,100)/100);
  const nbtAmt        = tol * (clamp(Number(nbtPct),0,100)/100);
  const delivAmt      = Number(deliveryChg) || 0;
  const netTotal      = tol + vatAmt + nbtAmt + delivAmt;
  const paidAmt       = Number(paidAmount)  || 0;
  const balance       = paidAmt - netTotal;

  function updateQty(id:number, delta:number) {
    setItems(prev=>prev.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+delta)}:i));
  }
  function updateItemField(id:number, field:keyof BillItem, val:string) {
    setItems(prev=>prev.map(i=>i.id===id?{...i,[field]:val}:i));
  }
  function removeItem(id:number) {
    setItems(prev=>prev.length>1?prev.filter(i=>i.id!==id):prev);
  }
  function addItem() {
    const priceNum = Number(newPrice);
    if (!newName.trim() || !priceNum || priceNum<=0) return;
    setItems(prev=>[...prev,{ id:Date.now(), name:newName.trim(), qty:1, price:priceNum, mainTech:newMainTech, supporters:newSupporters }]);
    setNewName(''); setNewPrice(''); setNewSupporters('');
  }
  function completePayment() { setPaid(true); setPaidAt(nowTimeLabel()); }
  function handlePrint() { window.print(); }

  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';

  const [mounted, setMounted] = useState(false);
  useEffect(()=>{ setMounted(true); },[]);

  return (
    <>
      <style>{CSS}</style>
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>
        <Sidebar
          active={navKey}
          setActive={k=>{const n=NAV_ITEMS.find(x=>x.key===k);if(n)router.push(n.path);}}
          onLogout={()=>router.push('/admin/login')}
        />
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
          <header className="hdr-inner no-print" style={{background:HDR,height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10}}>
            <button onClick={()=>router.push('/appointment')}
              style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',color:'#1e3a40',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,padding:'6px 10px',borderRadius:8}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(0,0,0,0.05)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
            ><IBack/> Back</button>
            <div className="srch-wrap" style={{position:'relative',flexShrink:0,marginLeft:6}}>
              <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4}}><ISearch/></span>
              <input className="srch" placeholder="Search....."/>
            </div>
            <div style={{flex:1}}/>
            <button style={{background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(0,0,0,0.05)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
            ><IBell/></button>
            <div className="hdr-name" style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <span style={{fontSize:14,fontWeight:500,color:'#1f2937'}}>MR. SAYO</span><IChevD/>
            </div>
            <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0}}>S</div>
          </header>

          <div className="main-body" style={{flex:1,overflow:'auto',padding:'16px 18px'}}>
            {!paid ? (
              <div className="bill-layout fade-up" style={{display:'flex',gap:16,alignItems:'flex-start',maxWidth:1200,margin:'0 auto'}}>
                <div style={{flex:2,minWidth:0,display:'flex',flexDirection:'column',gap:14}}>
                  <div className="bill-card">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
                      <div>
                        <p className="bill-sec-title" style={{marginBottom:4}}>Invoice</p>
                        <p style={{fontSize:20,fontWeight:800,color:'#1e3a40'}}>{mounted ? invoiceNo : '—'}</p>
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <span className="badge b-ong">{appt.status==='ongoing'?'Ongoing':appt.status}</span>
                        <span className="badge b-pre">{appt.mode==='pre_booked'?'Pre-booked':'Walk-in'}</span>
                      </div>
                    </div>
                    <div style={{height:1,background:'rgba(30,58,64,0.1)',margin:'14px 0'}}/>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                      <div>
                        <p className="bill-sec-title">Client</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:14,fontWeight:700,color:'#1f2937'}}><IUserSm/>{appt.clientName}</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:12.5,color:'#6b7280',marginTop:4}}><IPhone/>{appt.clientPhone}</p>
                      </div>
                      <div>
                        <p className="bill-sec-title">Appointment</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#374151',fontWeight:600}}><IClock/>{fmtDateLong(appt.date)} · {appt.timeSlot}</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:12.5,color:'#6b7280',marginTop:4}}><ILoc/>{appt.location} · {appt.providerName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bill-card">
                    <p className="bill-sec-title">Services &amp; Items</p>
                    <div style={{overflowX:'auto'}}>
                      <table className="item-tbl" style={{minWidth:680}}>
                        <thead>
                          <tr>
                            <th style={{width:'24%'}}>Item</th>
                            <th style={{width:72,textAlign:'center'}}>Qty</th>
                            <th style={{width:100,textAlign:'right'}}>Price</th>
                            <th style={{width:110,textAlign:'right'}}>Amount</th>
                            <th style={{width:'18%'}}>Main Technician</th>
                            <th style={{width:'20%'}}>Supporters <span style={{fontWeight:400,color:'#9ca3af',fontSize:9,textTransform:'none'}}>(optional)</span></th>
                            <th style={{width:30}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(it=>(
                            <tr key={it.id}>
                              <td style={{fontWeight:600}}>{it.name}</td>
                              <td>
                                <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}>
                                  <button className="qty-btn" onClick={()=>updateQty(it.id,-1)}>–</button>
                                  <span style={{minWidth:14,textAlign:'center',fontWeight:700,fontSize:13}}>{it.qty}</span>
                                  <button className="qty-btn" onClick={()=>updateQty(it.id,1)}>+</button>
                                </div>
                              </td>
                              <td style={{textAlign:'right'}}>{fmtMoney(it.price)}</td>
                              <td style={{textAlign:'right',fontWeight:700,color:'#1e3a40'}}>{fmtMoney(it.qty*it.price)}</td>
                              <td>
                                <select className="sel-sm" value={it.mainTech} onChange={e=>updateItemField(it.id,'mainTech',e.target.value)}>
                                  <option value="">— Select —</option>
                                  {PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                              <td><input className="inp-sm" placeholder="e.g. Piumi, Amaya" value={it.supporters} onChange={e=>updateItemField(it.id,'supporters',e.target.value)}/></td>
                              <td style={{textAlign:'center'}}><button className="rm-btn" onClick={()=>removeItem(it.id)} title="Remove"><ITrash/></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{display:'flex',gap:7,marginTop:14,flexWrap:'wrap',alignItems:'flex-end'}}>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'2 1 160px',minWidth:130}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Item Name</label>
                        <input className="add-row-inp" placeholder="e.g. Hair Serum" value={newName} onChange={e=>setNewName(e.target.value)}/>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 90px',minWidth:80}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Price (LKR)</label>
                        <input className="add-row-inp" type="number" placeholder="0" value={newPrice} onChange={e=>setNewPrice(e.target.value)}/>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 110px',minWidth:100}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Main Technician</label>
                        <select className="add-row-sel" value={newMainTech} onChange={e=>setNewMainTech(e.target.value)}>
                          <option value="">— Select —</option>
                          {PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 120px',minWidth:110}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Supporters <span style={{fontWeight:400,color:'#9ca3af'}}>(opt.)</span></label>
                        <input className="add-row-inp" placeholder="e.g. Piumi, Amaya" value={newSupporters} onChange={e=>setNewSupporters(e.target.value)}/>
                      </div>
                      <button onClick={addItem} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,border:'none',background:'#1e3a40',color:'#fff',fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0,height:36,alignSelf:'flex-end'}}>
                        <IPlus/> Add
                      </button>
                    </div>
                  </div>

                  <div className="bill-card">
                    <p className="bill-sec-title">Notes (optional)</p>
                    <textarea className="inp" style={{width:'100%',resize:'none',lineHeight:1.5}} rows={3} placeholder="Any remarks for this bill..." value={billNotes} onChange={e=>setBillNotes(e.target.value)}/>
                  </div>
                </div>

                <div className="bill-right" style={{width:300,flexShrink:0,position:'sticky',top:0}}>
                  <div className="bill-card" style={{display:'flex',flexDirection:'column',gap:0}}>
                    <p className="bill-sec-title">Payment Summary</p>
                    <div className="sum-row bold-row"><span>Gross</span><span>{fmtMoney(gross)}</span></div>
                    <div className="sum-row" style={{alignItems:'flex-start',flexDirection:'column',gap:6,paddingBottom:4}}>
                      <span style={{fontWeight:500}}>Discount</span>
                      <div style={{display:'flex',gap:6,width:'100%',alignItems:'center'}}>
                        <div style={{position:'relative',flex:1}}>
                          <input className="sum-inp" type="number" min={0} max={100} placeholder="0" value={discountPct} onChange={e=>{ setDiscountPct(e.target.value===''?'':Number(e.target.value)); setDiscountAmt(''); }} style={{width:'100%',paddingRight:22}}/>
                          <span style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9ca3af',pointerEvents:'none'}}>%</span>
                        </div>
                        <span style={{fontSize:11,color:'#9ca3af',flexShrink:0}}>or</span>
                        <div style={{flex:1}}>
                          <input className="sum-inp" type="number" min={0} placeholder="0.00" value={discountAmt} onChange={e=>{ setDiscountAmt(e.target.value===''?'':Number(e.target.value)); setDiscountPct(''); }} style={{width:'100%'}}/>
                        </div>
                      </div>
                      {discAmt>0&&<div style={{display:'flex',justifyContent:'flex-end',width:'100%'}}><span style={{fontSize:11.5,color:'#b91c1c',fontWeight:600}}>– {fmtMoney(discAmt)}</span></div>}
                    </div>
                    <div className="sum-row divider bold-row"><span>Gross After Dis.</span><span>{fmtMoney(grossAfterDis)}</span></div>
                    <div className="sum-row" style={{alignItems:'center'}}><span>Ser. Chg</span><input className="sum-inp" type="number" min={0} placeholder="0.00" value={serChg} onChange={e=>setSerChg(e.target.value===''?'':Number(e.target.value))}/></div>
                    <div className="sum-row" style={{alignItems:'center'}}><span>Pack Chg</span><input className="sum-inp" type="number" min={0} placeholder="0.00" value={packChg} onChange={e=>setPackChg(e.target.value===''?'':Number(e.target.value))}/></div>
                    <div className="sum-row divider bold-row"><span>TOL</span><span>{fmtMoney(tol)}</span></div>
                    <div className="sum-row" style={{alignItems:'center'}}><span>VAT (%)</span><input className="sum-inp" type="number" min={0} max={100} placeholder="0" value={vatPct} onChange={e=>setVatPct(e.target.value===''?'':Number(e.target.value))}/></div>
                    {vatAmt>0&&<div style={{display:'flex',justifyContent:'flex-end'}}><span style={{fontSize:11,color:'#15803d',fontWeight:600}}>+ {fmtMoney(vatAmt)}</span></div>}
                    <div className="sum-row" style={{alignItems:'center'}}><span>N.B.T (%)</span><input className="sum-inp" type="number" min={0} max={100} placeholder="0" value={nbtPct} onChange={e=>setNbtPct(e.target.value===''?'':Number(e.target.value))}/></div>
                    {nbtAmt>0&&<div style={{display:'flex',justifyContent:'flex-end'}}><span style={{fontSize:11,color:'#15803d',fontWeight:600}}>+ {fmtMoney(nbtAmt)}</span></div>}
                    <div className="sum-row" style={{alignItems:'center'}}><span>Delivery Chg</span><input className="sum-inp" type="number" min={0} placeholder="0.00" value={deliveryChg} onChange={e=>setDeliveryChg(e.target.value===''?'':Number(e.target.value))}/></div>
                    <div className="sum-row total-row"><span>Net Total</span><span>{fmtMoney(netTotal)}</span></div>
                    <div className="sum-row" style={{alignItems:'center',marginTop:8}}>
                      <span style={{fontWeight:600}}>Paid Amount</span>
                      <input className="sum-inp-wide" type="number" min={0} placeholder="0.00" value={paidAmount} onChange={e=>setPaidAmount(e.target.value===''?'':Number(e.target.value))} style={{border:'1.5px solid #1e3a40'}}/>
                    </div>
                    <div className="sum-row" style={{fontWeight:700,fontSize:13}}>
                      <span>Balance</span>
                      <span style={{color:balance>=0?'#15803d':'#b91c1c'}}>{balance>=0?fmtMoney(balance):`– ${fmtMoney(Math.abs(balance))}`}</span>
                    </div>
                    <div style={{height:1,background:'rgba(30,58,64,0.1)',margin:'14px 0 12px'}}/>
                    <p className="bill-sec-title">Payment Method</p>
                    <div style={{display:'flex',gap:7,marginBottom:16}}>
                      <button className={`pay-opt ${payMethod==='cash'?'active':''}`} onClick={()=>setPayMethod('cash')}><ICash/><span className="pay-opt-lbl">Cash</span></button>
                      <button className={`pay-opt ${payMethod==='card'?'active':''}`} onClick={()=>setPayMethod('card')}><ICard/><span className="pay-opt-lbl">Card</span></button>
                      <button className={`pay-opt ${payMethod==='online'?'active':''}`} onClick={()=>setPayMethod('online')}><IOnline/><span className="pay-opt-lbl">Online</span></button>
                    </div>
                    <button className="btn-primary" onClick={completePayment}>Complete Payment · {fmtMoney(netTotal)}</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="fade-up" style={{maxWidth:560,margin:'20px auto',display:'flex',flexDirection:'column',gap:14}}>
                <div className="bill-card no-print" style={{textAlign:'center',padding:'28px 18px'}}>
                  <div className="pop-in" style={{display:'flex',justifyContent:'center',marginBottom:10}}><ICheckBig/></div>
                  <p style={{fontSize:18,fontWeight:800,color:'#15803d'}}>Payment Successful</p>
                  <p style={{fontSize:12.5,color:'#6b7280',marginTop:4}}>Bill has been closed and payment recorded.</p>
                </div>
                <div className="bill-card print-area" style={{fontFamily:"'Inter',sans-serif"}}>
                  <div style={{textAlign:'center',marginBottom:14}}>
                    <p style={{fontSize:17,fontWeight:800,color:'#1e3a40'}}>SAYO SALON</p>
                    <p style={{fontSize:11,color:'#6b7280'}}>Official Receipt</p>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#374151',marginBottom:10}}>
                    <span>Invoice: <b>{invoiceNo}</b></span>
                    <span>{fmtDateLong(appt.date)} · {paidAt}</span>
                  </div>
                  <div style={{fontSize:12.5,color:'#374151',marginBottom:10,lineHeight:1.6}}>
                    <div><b>Client:</b> {appt.clientName} ({appt.clientPhone})</div>
                    <div><b>Provider:</b> {appt.providerName} · {appt.location}</div>
                  </div>
                  <div style={{height:1,background:'rgba(30,58,64,0.15)',margin:'10px 0'}}/>
                  <table className="item-tbl">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{textAlign:'center'}}>Qty</th>
                        <th style={{textAlign:'right'}}>Amount</th>
                        <th>Technician</th>
                        <th>Supporters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it=>(
                        <tr key={it.id}>
                          <td>{it.name}</td>
                          <td style={{textAlign:'center'}}>{it.qty}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(it.qty*it.price)}</td>
                          <td style={{fontSize:11,color:'#374151'}}>{it.mainTech||'—'}</td>
                          <td style={{fontSize:11,color:'#6b7280'}}>{it.supporters||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{height:1,background:'rgba(30,58,64,0.15)',margin:'10px 0'}}/>
                  <div className="sum-row"><span>Gross</span><span>{fmtMoney(gross)}</span></div>
                  {discAmt>0&&<div className="sum-row"><span>Discount</span><span style={{color:'#b91c1c'}}>– {fmtMoney(discAmt)}</span></div>}
                  {discAmt>0&&<div className="sum-row"><span>Gross After Dis.</span><span>{fmtMoney(grossAfterDis)}</span></div>}
                  {serChgAmt>0&&<div className="sum-row"><span>Ser. Chg</span><span>+ {fmtMoney(serChgAmt)}</span></div>}
                  {packChgAmt>0&&<div className="sum-row"><span>Pack Chg</span><span>+ {fmtMoney(packChgAmt)}</span></div>}
                  <div className="sum-row bold-row"><span>TOL</span><span>{fmtMoney(tol)}</span></div>
                  {vatAmt>0&&<div className="sum-row"><span>VAT</span><span>+ {fmtMoney(vatAmt)}</span></div>}
                  {nbtAmt>0&&<div className="sum-row"><span>N.B.T</span><span>+ {fmtMoney(nbtAmt)}</span></div>}
                  {delivAmt>0&&<div className="sum-row"><span>Delivery Chg</span><span>+ {fmtMoney(delivAmt)}</span></div>}
                  <div className="sum-row total-row"><span>Net Total</span><span>{fmtMoney(netTotal)}</span></div>
                  <div className="sum-row"><span>Paid Amount</span><span>{fmtMoney(paidAmt)}</span></div>
                  <div className="sum-row" style={{fontWeight:700}}>
                    <span>Balance</span>
                    <span style={{color:balance>=0?'#15803d':'#b91c1c'}}>{balance>=0?fmtMoney(balance):`– ${fmtMoney(Math.abs(balance))}`}</span>
                  </div>
                  <p style={{fontSize:12,color:'#6b7280',marginTop:8}}>Payment: <b style={{color:'#1e3a40',textTransform:'capitalize'}}>{payMethod}</b></p>
                  {billNotes&&<p style={{fontSize:11.5,color:'#9ca3af',marginTop:8,fontStyle:'italic'}}>"{billNotes}"</p>}
                  <p style={{textAlign:'center',fontSize:11,color:'#9ca3af',marginTop:16}}>Thank you for visiting us!</p>
                </div>
                <div className="no-print" style={{display:'flex',gap:10}}>
                  <button className="btn-ghost" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={handlePrint}><IPrinter/> Print Receipt</button>
                  <button className="btn-primary" style={{flex:1}} onClick={()=>router.push('/appointment')}>Back to Appointments</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <MobNav active={navKey} onNav={(_k,path)=>router.push(path)} onLogout={()=>router.push('/admin/login')}/>
    </>
  );
}

/* ─────────────────────────────────────────
   DEFAULT EXPORT — Suspense wrapper
───────────────────────────────────────── */
export default function BillingPage() {
  return (
    <Suspense fallback={
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#c2d4d4',fontFamily:'Inter,sans-serif',color:'#1e3a40',fontSize:14}}>
        Loading...
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}