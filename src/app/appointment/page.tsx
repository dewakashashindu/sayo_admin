'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface Appointment {
  id: number;
  userId: number;
  clientName: string;
  clientPhone: string;
  providerName: string;
  serviceName: string;
  date: string;
  timeSlot: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'ongoing';
  mode: 'pre_booked' | 'without_confirmation';
  location: string;
  duration: number;
  price: number;
  gender: string;
  notes?: string;
}
interface Stats {
  total: number; confirmed: number; cancelled: number; pending: number; ongoing: number;
}
interface DragInfo {
  apptId: number;
  originProvider: string;
  originSlotIdx: number;
}
interface ToastMsg { id: number; text: string; type: 'success' | 'error' | 'info'; }

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
  const [time, ap] = slot.split(' ');
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr); const m = Number(mStr);
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
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

const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PROVIDERS    = ['Nadeesha','Piumi','Amaya','Deepika','Nihara','Kaveesha','Rohan'];
const TIME_SLOTS   = ['9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM'];
const SLOT_MINUTES = 30;

/* ─────────────────────────────────────────
   DEMO DATA
───────────────────────────────────────── */
function getDemoData(): Appointment[] {
  const t  = todayISO();
  const t1 = shiftDate(t, 1);
  const t2 = shiftDate(t, 2);
  return [
    { id:1,  userId:101, clientName:'Sanduni Perera',         clientPhone:'077 123 4567', providerName:'Nadeesha', serviceName:'Massage',   date:t,  timeSlot:'9:00 AM',  status:'confirmed', mode:'pre_booked',           location:'Colombo', duration:60, price:5000, gender:'Female', notes:'' },
    { id:2,  userId:102, clientName:'Ishara Fernando',        clientPhone:'071 234 5678', providerName:'Piumi',    serviceName:'Hair Cut',  date:t,  timeSlot:'9:30 AM',  status:'pending',   mode:'pre_booked',           location:'Colombo', duration:45, price:3500, gender:'Female', notes:'Sensitive scalp' },
    { id:3,  userId:103, clientName:'Nimasha Silva',          clientPhone:'076 345 6789', providerName:'Amaya',    serviceName:'Manicure',  date:t,  timeSlot:'10:00 AM', status:'confirmed', mode:'without_confirmation', location:'Colombo', duration:30, price:2500, gender:'Female', notes:'' },
    { id:4,  userId:104, clientName:'Chathurika Weerasinghe', clientPhone:'070 456 7890', providerName:'Deepika',  serviceName:'Facial',    date:t,  timeSlot:'10:30 AM', status:'pending',   mode:'pre_booked',           location:'Kandy',   duration:60, price:6000, gender:'Female', notes:'' },
    { id:5,  userId:105, clientName:'Ruwan Jayasuriya',       clientPhone:'075 567 8901', providerName:'Rohan',    serviceName:'Hair Cut',  date:t,  timeSlot:'11:00 AM', status:'confirmed', mode:'pre_booked',           location:'Colombo', duration:30, price:2000, gender:'Male',   notes:'' },
    { id:6,  userId:106, clientName:'Dilani Rathnayake',      clientPhone:'072 678 9012', providerName:'Kaveesha', serviceName:'Massage',   date:t,  timeSlot:'9:00 AM',  status:'cancelled', mode:'pre_booked',           location:'Galle',   duration:90, price:8500, gender:'Female', notes:'Cancelled by client' },
    { id:7,  userId:107, clientName:'Hasini Gunawardena',     clientPhone:'078 789 0123', providerName:'Nihara',   serviceName:'Pedicure',  date:t,  timeSlot:'11:30 AM', status:'pending',   mode:'without_confirmation', location:'Colombo', duration:45, price:3000, gender:'Female', notes:'' },
    { id:8,  userId:108, clientName:'Tharindu Bandara',       clientPhone:'077 890 1234', providerName:'Nadeesha', serviceName:'Body Wrap', date:t,  timeSlot:'12:00 PM', status:'confirmed', mode:'pre_booked',           location:'Colombo', duration:75, price:9500, gender:'Female', notes:'' },
    { id:9,  userId:109, clientName:'Sachini Amarasena',      clientPhone:'071 901 2345', providerName:'Piumi',    serviceName:'Waxing',    date:t,  timeSlot:'12:30 PM', status:'ongoing',   mode:'without_confirmation', location:'Colombo', duration:30, price:2800, gender:'Female', notes:'' },
    { id:10, userId:110, clientName:'Menaka Kularatne',       clientPhone:'076 012 3456', providerName:'Amaya',    serviceName:'Facial',    date:t,  timeSlot:'1:00 PM',  status:'pending',   mode:'pre_booked',           location:'Kandy',   duration:45, price:4200, gender:'Female', notes:'First visit' },
    { id:11, userId:111, clientName:'Yasodha Wickrama',       clientPhone:'077 111 2222', providerName:'Nadeesha', serviceName:'Massage',   date:t1, timeSlot:'9:00 AM',  status:'confirmed', mode:'pre_booked',           location:'Colombo', duration:60, price:5000, gender:'Female', notes:'' },
    { id:12, userId:112, clientName:'Kasun Perera',           clientPhone:'071 222 3333', providerName:'Rohan',    serviceName:'Hair Cut',  date:t1, timeSlot:'10:00 AM', status:'pending',   mode:'pre_booked',           location:'Colombo', duration:30, price:2000, gender:'Male',   notes:'' },
    { id:13, userId:113, clientName:'Anusha Rajapaksha',      clientPhone:'076 333 4444', providerName:'Amaya',    serviceName:'Manicure',  date:t1, timeSlot:'11:00 AM', status:'confirmed', mode:'without_confirmation', location:'Colombo', duration:30, price:2500, gender:'Female', notes:'' },
    { id:14, userId:114, clientName:'Buddhika Senanayake',    clientPhone:'070 444 5555', providerName:'Deepika',  serviceName:'Facial',    date:t1, timeSlot:'12:00 PM', status:'pending',   mode:'pre_booked',           location:'Kandy',   duration:60, price:6000, gender:'Female', notes:'' },
    { id:15, userId:115, clientName:'Ovini Madushani',        clientPhone:'075 555 6666', providerName:'Nihara',   serviceName:'Pedicure',  date:t1, timeSlot:'1:00 PM',  status:'confirmed', mode:'without_confirmation', location:'Colombo', duration:45, price:3000, gender:'Female', notes:'' },
    { id:16, userId:116, clientName:'Chamodi Rathnasekara',   clientPhone:'077 666 7777', providerName:'Piumi',    serviceName:'Hair Cut',  date:t2, timeSlot:'9:30 AM',  status:'pending',   mode:'pre_booked',           location:'Colombo', duration:45, price:3500, gender:'Female', notes:'' },
    { id:17, userId:117, clientName:'Lakmal Dissanayake',     clientPhone:'071 777 8888', providerName:'Rohan',    serviceName:'Hair Cut',  date:t2, timeSlot:'10:00 AM', status:'confirmed', mode:'pre_booked',           location:'Colombo', duration:30, price:2000, gender:'Male',   notes:'' },
    { id:18, userId:118, clientName:'Nadeeka Ekanayake',      clientPhone:'076 888 9999', providerName:'Kaveesha', serviceName:'Massage',   date:t2, timeSlot:'11:00 AM', status:'pending',   mode:'pre_booked',           location:'Galle',   duration:90, price:8500, gender:'Female', notes:'' },
    { id:19, userId:119, clientName:'Isuru Bandaranayake',    clientPhone:'070 999 0000', providerName:'Amaya',    serviceName:'Waxing',    date:t2, timeSlot:'12:30 PM', status:'confirmed', mode:'without_confirmation', location:'Colombo', duration:30, price:2800, gender:'Female', notes:'' },
    { id:20, userId:120, clientName:'Tharushi Peiris',        clientPhone:'078 000 1111', providerName:'Deepika',  serviceName:'Facial',    date:t2, timeSlot:'1:30 PM',  status:'pending',   mode:'pre_booked',           location:'Kandy',   duration:60, price:6000, gender:'Female', notes:'' },
  ];
}

/* ─────────────────────────────────────────
   OCCUPANCY
───────────────────────────────────────── */
interface OccCell { appt: Appointment; span: number; isStart: boolean; }
type OccMap = Record<string, Record<number, OccCell>>;

function buildOccupancy(dayAppts: Appointment[], excludeId?: number): OccMap {
  const occ: OccMap = {};
  PROVIDERS.forEach(p => { occ[p] = {}; });
  dayAppts
    .filter(a => excludeId === undefined || a.id !== excludeId)
    .forEach(a => {
      const startIdx = TIME_SLOTS.indexOf(a.timeSlot);
      if (startIdx === -1) return;
      let span = Math.max(1, Math.ceil(a.duration / SLOT_MINUTES));
      if (startIdx + span > TIME_SLOTS.length) span = TIME_SLOTS.length - startIdx;
      for (let i = 0; i < span; i++) {
        const idx = startIdx + i;
        if (occ[a.providerName][idx]) continue;
        occ[a.providerName][idx] = { appt: a, span, isStart: i === 0 };
      }
    });
  return occ;
}

function canDrop(occ: OccMap, provider: string, slotIdx: number, duration: number): boolean {
  const needed = Math.max(1, Math.ceil(duration / SLOT_MINUTES));
  if (slotIdx + needed > TIME_SLOTS.length) return false;
  for (let i = 0; i < needed; i++) {
    if (occ[provider]?.[slotIdx + i]) return false;
  }
  return true;
}

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp        { from{opacity:0;transform:translateY(5px);}  to{opacity:1;transform:none;} }
  @keyframes slideUp       { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:none;} }
  @keyframes popIn         { from{opacity:0;transform:scale(0.95) translateY(-6px);} to{opacity:1;transform:scale(1) translateY(0);} }
  @keyframes scaleIn       { from{opacity:0;transform:scale(0.92);}      to{opacity:1;transform:scale(1);} }
  @keyframes livePulseBlue { 0%{box-shadow:0 0 0 0 rgba(59,130,246,0.5);} 70%{box-shadow:0 0 0 7px rgba(59,130,246,0);} 100%{box-shadow:0 0 0 0 rgba(59,130,246,0);} }
  @keyframes dropSuccess   { 0%{box-shadow:0 0 0 0 rgba(34,197,94,0.7);} 60%{box-shadow:0 0 0 10px rgba(34,197,94,0);} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0);} }

  .fade-up    { animation:fadeUp  0.2s ease both; }
  .slide-up   { animation:slideUp 0.25s ease both; }
  .pop-in     { animation:popIn   0.18s cubic-bezier(.34,1.56,.64,1) both; }
  .scale-in   { animation:scaleIn 0.2s cubic-bezier(.34,1.56,.64,1) both; }
  .drop-success { animation:dropSuccess 0.6s ease-out; }

  ::-webkit-scrollbar       { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.2); border-radius:4px; }

  /* ── Schedule Table ── */
  .sch-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
  .sch-tbl thead th {
    font-family:'Inter',sans-serif; font-size:13px; font-weight:500; color:#374151;
    padding:11px 12px; text-align:left; background:#dce8e8;
    white-space:nowrap; border-bottom:1px solid rgba(30,58,64,0.1);
    position:sticky; top:0; z-index:2;
  }
  .sch-tbl thead th:first-child { width:84px; }
  .sch-tbl tbody tr:nth-child(odd)  td { background:#e2ecec; }
  .sch-tbl tbody tr:nth-child(even) td { background:#d8e4e4; }
  .sch-tbl td {
    padding:0 12px; height:56px;
    font-family:'Inter',sans-serif; font-size:13px; vertical-align:middle;
    border-bottom:1px solid rgba(0,0,0,0.03); transition:background 0.1s;
  }
  .sch-tbl td.occ-cell { vertical-align:top; padding:5px 8px; }

  /* Drop zones */
  .drop-valid   { background:rgba(34,197,94,0.18)  !important; outline:2px dashed rgba(34,197,94,0.6); outline-offset:-2px; }
  .drop-invalid { background:rgba(239,68,68,0.15)  !important; outline:2px dashed rgba(239,68,68,0.5); outline-offset:-2px; }
  .drop-hover-v { background:rgba(34,197,94,0.32)  !important; }
  .drop-hover-i { background:rgba(239,68,68,0.28)  !important; }

  /* ── Pills ── */
  .appt-pill {
    display:flex; flex-direction:column; gap:2px; border-radius:8px; padding:7px 9px;
    font-size:11px; font-weight:600; width:100%; height:100%;
    overflow:hidden; cursor:grab;
    transition:opacity 0.15s, transform 0.15s, box-shadow 0.15s;
    border:none; font-family:'Inter',sans-serif; text-align:left;
    user-select:none; -webkit-user-select:none;
  }
  .appt-pill:active           { cursor:grabbing; }
  .appt-pill:hover            { transform:scale(1.02); box-shadow:0 4px 14px rgba(0,0,0,0.15); }
  .appt-pill.dragging         { opacity:0.3; transform:scale(0.97); cursor:grabbing; box-shadow:none; }
  .appt-pill.not-draggable    { cursor:not-allowed; opacity:0.65; }
  .appt-pill.not-draggable:hover { transform:none; box-shadow:none; }

  .appt-pill .ap-service { font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-pill .ap-time    { font-size:10.5px; font-weight:600; opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-pill .ap-client  { font-size:10px; font-weight:500; opacity:0.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .appt-pill .ap-meta    { display:flex; gap:5px; flex-wrap:wrap; margin-top:2px; }
  .ap-drag-hint          { font-size:9px; opacity:0.5; margin-top:2px; }

  .pill-confirmed { background:rgba(34,197,94,0.13);  color:#15803d; border:1px solid rgba(34,197,94,0.25); }
  .pill-pending   { background:rgba(245,158,11,0.13); color:#b45309; border:1px solid rgba(245,158,11,0.25); }
  .pill-cancelled { background:rgba(239,68,68,0.1);   color:#b91c1c; border:1px solid rgba(239,68,68,0.22); }
  .pill-ongoing   { background:rgba(59,130,246,0.13); color:#1d4ed8; border:1px solid rgba(59,130,246,0.3); animation:livePulseBlue 2s infinite; }
  .live-dot-blue  { width:6px; height:6px; border-radius:50%; background:#2563eb; display:inline-block; flex-shrink:0; }

  /* ── Badges ── */
  .badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:99px;
    font-size:10px; font-weight:700; font-family:'Inter',sans-serif;
    text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap;
  }
  .mini-badge {
    display:inline-flex; align-items:center; padding:1.5px 6px; border-radius:99px;
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
    background:#d8e4e4
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")
      no-repeat right 8px center;
    cursor:pointer; outline:none; min-width:110px;
  }
  .f-sel:focus { outline:2px solid #1e3a40; outline-offset:1px; }

  .srch {
    border:1.5px solid #c0cbcc; border-radius:10px;
    padding:0 14px 0 38px; height:40px; width:260px;
    font-family:'Inter',sans-serif; font-size:14px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s, box-shadow 0.15s;
  }
  .srch:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .srch::placeholder { color:rgba(0,0,0,0.35); }

  .nav-arr {
    background:none; border:none; cursor:pointer; color:#1e3a40;
    display:flex; align-items:center; padding:5px 6px; border-radius:7px; transition:background 0.15s;
  }
  .nav-arr:hover { background:rgba(0,0,0,0.07); }

  .date-trigger {
    display:flex; align-items:center; gap:6px;
    background:none; border:none; cursor:pointer;
    font-family:'Inter',sans-serif; font-size:15px; font-weight:600; color:#1f2937;
    padding:4px 8px; border-radius:8px; transition:background 0.15s; white-space:nowrap;
  }
  .date-trigger:hover { background:rgba(30,58,64,0.08); }

  /* ── View btn ── */
  .view-btn {
    padding:4px 13px; border-radius:6px; border:none;
    font-family:'Inter',sans-serif; font-size:12px; font-weight:600;
    cursor:pointer; transition:all 0.15s; background:transparent; color:#6b7280;
  }
  .view-btn.active { background:#fff; color:#1e3a40; box-shadow:0 1px 4px rgba(0,0,0,0.12); }

  /* ── Calendar ── */
  .cal-popup {
    position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%);
    background:#fff; border-radius:14px; padding:14px;
    box-shadow:0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
    border:1px solid rgba(30,58,64,0.1); z-index:500; min-width:270px;
  }
  .cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .cal-nav {
    width:28px; height:28px; border-radius:7px; border:none; background:transparent;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; color:#374151; transition:background 0.15s;
  }
  .cal-nav:hover { background:rgba(30,58,64,0.08); }
  .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
  .cal-daylbl { text-align:center; font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; padding:4px 0 6px; letter-spacing:0.04em; }
  .cal-day {
    text-align:center; padding:5px 2px; border-radius:7px;
    font-size:12px; font-weight:500; color:#374151;
    cursor:pointer; transition:background 0.12s, color 0.12s; border:none; background:transparent;
    font-family:'Inter',sans-serif;
  }
  .cal-day:hover:not(:disabled) { background:rgba(30,58,64,0.08); }
  .cal-day.selected    { background:#1e3a40 !important; color:#fff !important; font-weight:700; }
  .cal-day.today       { color:#1e3a40; font-weight:700; box-shadow:inset 0 0 0 1.5px #1e3a40; }
  .cal-day.other-month { color:#c4cdd4; }
  .cal-month-title {
    font-size:14px; font-weight:700; color:#1f2937; cursor:pointer;
    padding:3px 7px; border-radius:6px; transition:background 0.12s;
    font-family:'Inter',sans-serif; border:none; background:transparent;
  }
  .cal-month-title:hover { background:rgba(30,58,64,0.07); }
  .month-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:4px; }
  .month-item {
    text-align:center; padding:7px 4px; border-radius:8px;
    font-size:12px; font-weight:500; cursor:pointer; transition:background 0.12s;
    border:none; background:transparent; font-family:'Inter',sans-serif; color:#374151;
  }
  .month-item:hover  { background:rgba(30,58,64,0.08); }
  .month-item.sel-mo { background:#1e3a40; color:#fff; font-weight:700; }
  .year-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-top:4px; }
  .year-item {
    text-align:center; padding:7px 2px; border-radius:8px;
    font-size:12px; font-weight:500; cursor:pointer; transition:background 0.12s;
    border:none; background:transparent; font-family:'Inter',sans-serif; color:#374151;
  }
  .year-item:hover  { background:rgba(30,58,64,0.08); }
  .year-item.sel-yr { background:#1e3a40; color:#fff; font-weight:700; }

  /* ── Modal ── */
  .modal-bg {
    position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999;
    display:flex; align-items:flex-end; justify-content:center; backdrop-filter:blur(5px);
  }
  .modal-box {
    background:#fff; border-radius:20px 20px 0 0;
    width:100%; max-width:560px; max-height:93vh; overflow-y:auto;
    box-shadow:0 -8px 40px rgba(0,0,0,0.2); font-family:'Inter',sans-serif;
  }
  @media(min-width:700px) {
    .modal-bg  { align-items:center; padding:16px; }
    .modal-box { border-radius:18px; }
  }

  /* ── Modal action buttons ── */
  .modal-action-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .btn-modal-cancel {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px 12px; border-radius:12px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-modal-cancel:hover { background:#fee2e2; border-color:#f87171; box-shadow:0 2px 10px rgba(220,38,38,0.15); transform:translateY(-1px); }
  .btn-modal-confirm {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px 12px; border-radius:12px;
    background:#1e3a40; color:#fff; border:1.5px solid #1e3a40;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 10px rgba(30,58,64,0.25);
  }
  .btn-modal-confirm:hover { background:#162e34; border-color:#162e34; box-shadow:0 4px 16px rgba(30,58,64,0.35); transform:translateY(-1px); }
  .btn-modal-checkin {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px 12px; border-radius:12px;
    background:#1e3a40; color:#fff; border:1.5px solid #1e3a40;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 10px rgba(30,58,64,0.25);
  }
  .btn-modal-checkin:hover { background:#162e34; box-shadow:0 4px 16px rgba(30,58,64,0.35); transform:translateY(-1px); }
  .btn-modal-reschedule {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:13px 12px; border-radius:12px;
    background:#fffbeb; color:#b45309; border:1.5px solid #fcd34d;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:700;
    cursor:pointer; transition:all 0.18s; width:100%;
  }
  .btn-modal-reschedule:hover { background:#fef3c7; border-color:#f59e0b; box-shadow:0 2px 10px rgba(180,83,9,0.15); transform:translateY(-1px); }
  .btn-modal-bill {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px 12px; border-radius:12px;
    background:#2563eb; color:#fff; border:1.5px solid #2563eb;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:700;
    cursor:pointer; transition:all 0.18s; width:100%; box-shadow:0 2px 10px rgba(37,99,235,0.3);
  }
  .btn-modal-bill:hover { background:#1d4ed8; box-shadow:0 4px 16px rgba(37,99,235,0.4); transform:translateY(-1px); }

  /* ── Toast ── */
  .toast {
    background:#1e3a40; color:#fff; border-radius:12px;
    padding:12px 22px; font-family:'Inter',sans-serif; font-size:13px; font-weight:600;
    box-shadow:0 4px 20px rgba(0,0,0,0.25); z-index:99999;
    display:flex; align-items:center; gap:9px; white-space:nowrap;
    animation:slideUp 0.25s ease both;
  }
  .toast.success { background:#15803d; }
  .toast.error   { background:#b91c1c; }

  /* ── Drag legend ── */
  .drag-legend {
    display:flex; align-items:center; gap:14px; padding:6px 14px;
    background:rgba(30,58,64,0.05); border-top:1px solid rgba(30,58,64,0.08);
    flex-shrink:0; flex-wrap:wrap;
  }
  .legend-item { display:flex; align-items:center; gap:5px; font-size:11px; color:#6b7280; font-weight:500; }
  .legend-dot  { width:10px; height:10px; border-radius:3px; flex-shrink:0; }

  /* ── Appt Card ── */
  .appt-card {
    background:#fff; border-radius:12px; border:1px solid #c8d6d8;
    padding:13px; display:flex; flex-direction:column; gap:9px;
    cursor:pointer; transition:box-shadow 0.18s;
  }
  .appt-card:hover { box-shadow:0 2px 10px rgba(0,0,0,0.09); }

  @media(max-width:767px) {
    .main-body { padding-bottom:72px !important; }
    .hdr-name  { display:none !important; }
  }
  @media(max-width:480px) {
    .main-body { padding:10px 10px 72px !important; }
    .hdr-inner { padding:0 12px !important; height:52px !important; }
    .srch      { width:100% !important; font-size:13px !important; height:38px !important; }
    .srch-wrap { flex:1 !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IBell()   { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({s=13}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IChevL({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function IChevR({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function IX()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function IClock()  { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function ILoc()    { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function ICalSm()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IAppt({s=24}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/></svg>; }
function ICheck({s=24}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function IPending({s=24}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function ICancel({s=24}:{s?:number})  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>; }
function ILive({s=24}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>; }
function IRefresh({s=16}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>; }
function ICheckCircle({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function IXCircle({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>; }
function ILogin({s=18}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>; }
function IReceipt({s=18}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>; }
function IDrag({s=10}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>; }

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
    ? <span className="mini-badge b-wlk">Walk-in</span>
    : <span className="mini-badge b-pre">Pre-booked</span>;
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,display:'flex',flexDirection:'column',gap:8,alignItems:'center',pointerEvents:'none'}}>
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'success' && '✓ '}
          {t.type === 'error'   && '✕ '}
          {t.text}
        </div>
      ))}
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
          if (view==='day')   { calMonth===0 ? (setCalMonth(11),setCalYear(y=>y-1)) : setCalMonth(m=>m-1); }
          if (view==='month') { setCalYear(y=>y-1); }
          if (view==='year')  { setYearBase(b=>b-16); }
        }}><IChevL s={14}/></button>
        <button className="cal-month-title" onClick={() => {
          if (view==='day') setView('month'); else if (view==='month') setView('year'); else setView('day');
        }}>
          {view==='day'   && `${MONTHS[calMonth]} ${calYear}`}
          {view==='month' && calYear}
          {view==='year'  && `${yearBase}–${yearBase+15}`}
        </button>
        <button className="cal-nav" onClick={() => {
          if (view==='day')   { calMonth===11 ? (setCalMonth(0),setCalYear(y=>y+1)) : setCalMonth(m=>m+1); }
          if (view==='month') { setCalYear(y=>y+1); }
          if (view==='year')  { setYearBase(b=>b+16); }
        }}><IChevR s={14}/></button>
      </div>
      {view==='day' && (
        <>
          <div className="cal-grid">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="cal-daylbl">{d}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((c,i) => {
              const isToday = c.d===todayD.getDate()&&c.m===todayD.getMonth()&&c.y===todayD.getFullYear();
              const isSel   = c.d===selDay&&c.m===selMonth&&c.y===selYear;
              return (
                <button key={i}
                  className={`cal-day${!c.cur?' other-month':''}${isSel?' selected':''}${isToday&&!isSel?' today':''}`}
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
            <button key={mo}
              className={`month-item${i===selMonth&&calYear===selYear?' sel-mo':''}`}
              onClick={() => { setCalMonth(i); setView('day'); }}>
              {mo}
            </button>
          ))}
        </div>
      )}
      {view==='year' && (
        <div className="year-grid">
          {Array.from({length:16},(_,i)=>yearBase+i).map(yr => (
            <button key={yr}
              className={`year-item${yr===selYear?' sel-yr':''}`}
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
function DateNav({ date, onChange }: { date:string; onChange:(d:string)=>void; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{position:'relative',display:'flex',alignItems:'center',gap:2}}>
      <button className="nav-arr" onClick={() => onChange(shiftDate(date,-1))}><IChevL/></button>
      <button className="date-trigger" onClick={() => setOpen(o=>!o)}>
        <ICalSm/><span>{fmtDateNav(date)}</span><IChevD s={11}/>
      </button>
      <button className="nav-arr" onClick={() => onChange(shiftDate(date,1))}><IChevR/></button>
      {open && <CalendarPopup value={date} onChange={d=>{onChange(d);setOpen(false);}} onClose={() => setOpen(false)}/>}
    </div>
  );
}

/* ─────────────────────────────────────────
   MODAL HEADER
───────────────────────────────────────── */
function ModalHeader({ title, sub, onClose }: { title:string; sub:string; onClose:()=>void; }) {
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
          style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:'50%',width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff',transition:'background 0.15s'}}
          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.12)'}
        ><IX/></button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   INFO BOX
───────────────────────────────────────── */
function InfoBox({ label, value }: { label:string; value:string; }) {
  return (
    <div style={{background:'#f8fafb',border:'1px solid #e5eaeb',borderRadius:10,padding:'9px 12px'}}>
      <p style={{fontSize:10,color:'#9ca3af',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</p>
      <p style={{fontSize:13,fontWeight:700,color:'#1e3a40',marginTop:3}}>{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   DETAIL MODAL
───────────────────────────────────────── */
function DetailModal({ appt, onClose, onStatusChange, onReschedule, onGoToBill }: {
  appt: Appointment; onClose: () => void;
  onStatusChange: (id:number, s:Appointment['status']) => void;
  onReschedule:   (appt:Appointment) => void;
  onGoToBill:     (appt:Appointment) => void;
}) {
  const startMin = parseSlotToMinutes(appt.timeSlot);
  const endLabel = minutesToSlotLabel(startMin + appt.duration);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box slide-up" onClick={e => e.stopPropagation()} style={{maxWidth:540}}>
        <ModalHeader title={`Appointment #${appt.id}`} sub="Detail" onClose={onClose}/>
        <div style={{padding:'18px 20px 24px',display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <StatusBadge status={appt.status}/>
            <ModeBadge   mode={appt.mode}/>
            <span className="badge b-pre" style={{background:'#f3f4f6',color:'#374151'}}>{appt.gender.toUpperCase()}</span>
            <span className="badge b-pre" style={{background:'#f3f4f6',color:'#374151'}}>{appt.location.toUpperCase()}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <InfoBox label="Client"     value={appt.clientName}/>
            <InfoBox label="Contact"    value={appt.clientPhone}/>
            <InfoBox label="Date"       value={fmtDateLong(appt.date)}/>
            <InfoBox label="Time Range" value={`${appt.timeSlot} – ${endLabel}`}/>
            <InfoBox label="Provider"   value={appt.providerName}/>
            <InfoBox label="Service"    value={appt.serviceName}/>
            <InfoBox label="Duration"   value={`${appt.duration} min`}/>
            <InfoBox label="Price"      value={`LKR ${appt.price.toLocaleString()}`}/>
          </div>
          {appt.notes && (
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#92400e',lineHeight:1.6}}>
              {appt.notes}
            </div>
          )}
          {appt.status === 'pending' && (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div className="modal-action-row">
                <button className="btn-modal-cancel"  onClick={() => { onStatusChange(appt.id,'cancelled'); onClose(); }}><IXCircle s={18}/> Cancel Appointment</button>
                <button className="btn-modal-confirm" onClick={() => { onStatusChange(appt.id,'confirmed'); onClose(); }}><ICheckCircle s={18}/> Confirm Appointment</button>
              </div>
              <button className="btn-modal-reschedule" onClick={() => { onReschedule(appt); onClose(); }}><IRefresh s={16}/> Reschedule</button>
            </div>
          )}
          {appt.status === 'confirmed' && (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div className="modal-action-row">
                <button className="btn-modal-cancel"  onClick={() => { onStatusChange(appt.id,'cancelled'); onClose(); }}><IXCircle s={18}/> Cancel Appointment</button>
                <button className="btn-modal-checkin" onClick={() => { onStatusChange(appt.id,'ongoing'); onClose(); }}><ILogin s={18}/> Check In Client</button>
              </div>
              <button className="btn-modal-reschedule" onClick={() => { onReschedule(appt); onClose(); }}><IRefresh s={16}/> Reschedule</button>
            </div>
          )}
          {appt.status === 'ongoing' && (
            <button className="btn-modal-bill" onClick={() => { onGoToBill(appt); onClose(); }}><IReceipt s={18}/> Go to Bill</button>
          )}
          {appt.status === 'cancelled' && (
            <button className="btn-modal-reschedule" onClick={() => { onReschedule(appt); onClose(); }}><IRefresh s={16}/> Reschedule</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   SCHEDULE GRID
───────────────────────────────────────── */
function ScheduleGrid({ dayAppts, onFreeSlotClick, onPillClick, onDropped }: {
  dayAppts: Appointment[];
  onFreeSlotClick: (provider:string, slot:string) => void;
  onPillClick:     (a:Appointment) => void;
  onDropped:       (apptId:number, newProvider:string, newSlot:string) => void;
}) {
  const [dragging,    setDragging]    = useState<DragInfo|null>(null);
  const [hoverKey,    setHoverKey]    = useState<string|null>(null);
  const [justDropped, setJustDropped] = useState<number|null>(null);

  useEffect(() => {
    const reset = () => { setDragging(null); setHoverKey(null); };
    window.addEventListener('dragend', reset);
    return () => window.removeEventListener('dragend', reset);
  }, []);

  const occ      = useMemo(() => buildOccupancy(dayAppts, dragging?.apptId), [dayAppts, dragging?.apptId]);
  const fullOcc  = useMemo(() => buildOccupancy(dayAppts), [dayAppts]);
  const dragAppt = useMemo(() => dragging ? dayAppts.find(a => a.id === dragging.apptId) : null, [dragging, dayAppts]);

  function dropValid(provider: string, slotIdx: number): boolean {
    if (!dragAppt) return false;
    return canDrop(occ, provider, slotIdx, dragAppt.duration);
  }
  function onDragStart(e: React.DragEvent, a: Appointment) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('apptId', String(a.id));
    setDragging({ apptId:a.id, originProvider:a.providerName, originSlotIdx:TIME_SLOTS.indexOf(a.timeSlot) });
  }
  function onDragEnd() { setDragging(null); setHoverKey(null); }
  function onCellDragOver(e: React.DragEvent, provider: string, slotIdx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dropValid(provider, slotIdx) ? 'move' : 'none';
    setHoverKey(`${provider}|${slotIdx}`);
  }
  function onCellDragLeave() { setHoverKey(null); }
  function onCellDrop(e: React.DragEvent, provider: string, slotIdx: number) {
    e.preventDefault(); setHoverKey(null);
    if (!dragAppt || !dropValid(provider, slotIdx)) return;
    const originIdx = TIME_SLOTS.indexOf(dragAppt.timeSlot);
    if (provider === dragAppt.providerName && slotIdx === originIdx) return;
    onDropped(dragAppt.id, provider, TIME_SLOTS[slotIdx]);
    setJustDropped(dragAppt.id);
    setTimeout(() => setJustDropped(null), 700);
  }
  function pillCls(a: Appointment): string {
    const base = a.status==='confirmed' ? 'appt-pill pill-confirmed'
               : a.status==='cancelled' ? 'appt-pill pill-cancelled'
               : a.status==='ongoing'   ? 'appt-pill pill-ongoing'
               :                          'appt-pill pill-pending';
    return base
      + (a.status === 'ongoing'    ? ' not-draggable' : '')
      + (dragging?.apptId === a.id ? ' dragging'      : '')
      + (justDropped === a.id      ? ' drop-success'  : '');
  }
  function cellCls(provider: string, slotIdx: number): string {
    if (!dragging) return '';
    const isHover = hoverKey === `${provider}|${slotIdx}`;
    const valid   = dropValid(provider, slotIdx);
    if (isHover) return valid ? ' drop-hover-v' : ' drop-hover-i';
    return valid ? ' drop-valid' : ' drop-invalid';
  }

  return (
    <div style={{overflowX:'auto',overflowY:'auto',flex:1,WebkitOverflowScrolling:'touch'}}>
      <table className="sch-tbl" style={{minWidth: PROVIDERS.length*140+84}}>
        <thead>
          <tr>
            <th>Time</th>
            {PROVIDERS.map(p => <th key={p}>{p}</th>)}
          </tr>
        </thead>
        <tbody>
          {TIME_SLOTS.map((slot, rowIdx) => {
            const [time, ampm] = slot.split(' ');
            return (
              <tr key={slot}>
                <td>
                  <span style={{display:'block',fontSize:12,fontWeight:600,color:'#374151'}}>{time}</span>
                  {ampm && <span style={{display:'block',fontSize:10,color:'#9ca3af'}}>{ampm}</span>}
                </td>
                {PROVIDERS.map(p => {
                  const cell = fullOcc[p]?.[rowIdx];
                  if (cell && cell.isStart) {
                    const a       = cell.appt;
                    const notDrag = a.status === 'ongoing';
                    const sm      = parseSlotToMinutes(a.timeSlot);
                    const el      = minutesToSlotLabel(sm + a.duration);
                    return (
                      <td key={`${slot}-${p}`} rowSpan={cell.span} className="occ-cell">
                        <div draggable={!notDrag}
                          onDragStart={notDrag ? undefined : e => onDragStart(e, a)}
                          onDragEnd={notDrag ? undefined : onDragEnd}
                          style={{height:'100%'}}>
                          <button className={pillCls(a)}
                            onClick={() => { if (!dragging) onPillClick(a); }}
                            title={notDrag ? 'Ongoing – cannot move' : 'Drag to reschedule'}>
                            <span className="ap-service">
                              {a.status==='ongoing' && <span className="live-dot-blue" style={{marginRight:4}}/>}
                              {!notDrag && <span style={{marginRight:3,opacity:0.45}}><IDrag/></span>}
                              {a.serviceName}
                            </span>
                            <span className="ap-time">{a.timeSlot} – {el}</span>
                            <span className="ap-client">{a.clientName}</span>
                            <span className="ap-meta">
                              <MiniModeBadge mode={a.mode}/>
                              <span className="mini-badge" style={{background:'rgba(0,0,0,0.06)',color:'inherit'}}>{a.duration}m</span>
                            </span>
                            {!notDrag && <span className="ap-drag-hint">⠿ drag to move</span>}
                          </button>
                        </div>
                      </td>
                    );
                  }
                  if (cell && !cell.isStart) return null;
                  return (
                    <td key={`${slot}-${p}`} className={cellCls(p, rowIdx)}
                      onDragOver={e  => onCellDragOver(e, p, rowIdx)}
                      onDragLeave={onCellDragLeave}
                      onDrop={e => onCellDrop(e, p, rowIdx)}>
                      <div
                        onClick={() => { if (!dragging) onFreeSlotClick(p, slot); }}
                        style={{width:'100%',height:'100%',minHeight:36,cursor:'pointer',borderRadius:6}}
                        onMouseEnter={e => { if (!dragging) e.currentTarget.style.background='rgba(30,58,64,0.05)'; }}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {dragging && (
        <div className="drag-legend fade-up">
          <span style={{fontSize:11,fontWeight:700,color:'#374151',marginRight:2}}>Drop zones:</span>
          <span className="legend-item"><span className="legend-dot" style={{background:'rgba(34,197,94,0.3)',outline:'1.5px dashed #22c55e',outlineOffset:'1px'}}/> Available</span>
          <span className="legend-item"><span className="legend-dot" style={{background:'rgba(239,68,68,0.25)',outline:'1.5px dashed #ef4444',outlineOffset:'1px'}}/> Blocked</span>
          <span style={{marginLeft:'auto',fontSize:11,color:'#9ca3af'}}>Release on green cell to confirm</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   APPT CARD (list view)
───────────────────────────────────────── */
function ApptCard({ appt, onClick }: { appt:Appointment; onClick:()=>void; }) {
  const startMin = parseSlotToMinutes(appt.timeSlot);
  const endLabel = minutesToSlotLabel(startMin + appt.duration);
  return (
    <div className="appt-card" onClick={onClick}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:'#1e3a40'}}>{appt.serviceName}</p>
          <p style={{fontSize:12,color:'#6b7280',marginTop:1}}>{appt.providerName}</p>
          <p style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{appt.clientName} · {appt.clientPhone}</p>
        </div>
        <StatusBadge status={appt.status}/>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{display:'flex',alignItems:'center',gap:3,fontSize:12,color:'#374151',fontWeight:600}}><IClock/>{appt.timeSlot} – {endLabel}</span>
        <span style={{display:'flex',alignItems:'center',gap:3,fontSize:12,color:'#6b7280'}}><ILoc/>{appt.location}</span>
        <ModeBadge mode={appt.mode}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#1e3a40'}}>LKR {appt.price.toLocaleString()}<span style={{fontWeight:400,fontSize:11,color:'#9ca3af',marginLeft:4}}>{appt.duration}min</span></span>
        <span style={{fontSize:11,color:'#9ca3af'}}>{appt.gender}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   STATS ROW
───────────────────────────────────────── */
function TopActionRow({ stats, onNewAppt }: { stats:Stats; onNewAppt:()=>void; }) {
  const cards = [
    { label:'Total Appointments',     value:stats.total,     icon:<IAppt/>,    bg:'linear-gradient(135deg,#daeef0,#cce3e8)', border:'1px solid rgba(30,58,64,0.18)',  iconColor:'#4a7a82' },
    { label:'Confirmed Appointments', value:stats.confirmed, icon:<ICheck/>,   bg:'linear-gradient(135deg,#dcfce7,#bbf7d0)', border:'1px solid rgba(34,197,94,0.3)',   iconColor:'#15803d' },
    { label:'Ongoing Appointments',   value:stats.ongoing,   icon:<ILive/>,    bg:'linear-gradient(135deg,#dbeafe,#bfdbfe)', border:'1px solid rgba(59,130,246,0.35)', iconColor:'#1d4ed8', dotColor:'#2563eb' },
    { label:'Pending Appointments',   value:stats.pending,   icon:<IPending/>, bg:'linear-gradient(135deg,#fef9c3,#fde68a)', border:'1px solid rgba(245,158,11,0.35)', iconColor:'#b45309' },
    { label:'Cancelled Appointments', value:stats.cancelled, icon:<ICancel/>,  bg:'linear-gradient(135deg,#fee2e2,#fecaca)', border:'1px solid rgba(239,68,68,0.3)',   iconColor:'#b91c1c' },
  ] as const;
  return (
    <div style={{display:'flex',gap:12,alignItems:'stretch',width:'100%',flexWrap:'wrap'}}>
      <div style={{display:'flex',gap:11,flex:'1 1 480px',minWidth:0,flexWrap:'wrap'}}>
        {cards.map(c => (
          <div key={c.label} style={{flex:'1 1 0',minWidth:110,borderRadius:12,padding:'14px 15px',minHeight:84,display:'flex',alignItems:'flex-start',justifyContent:'space-between',background:c.bg,border:c.border,boxSizing:'border-box',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:11,color:'#374151',fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
                {'dotColor' in c && c.dotColor && <span style={{width:6,height:6,borderRadius:'50%',background:c.dotColor,display:'inline-block',flexShrink:0}}/>}
                {c.label}
              </p>
              <p style={{fontSize:28,fontWeight:800,color:'#1f2937',lineHeight:1.15,marginTop:6}}>{String(c.value).padStart(2,'0')}</p>
            </div>
            <div style={{color:c.iconColor,opacity:0.85,flexShrink:0,marginLeft:8}}>{c.icon}</div>
          </div>
        ))}
      </div>
      <button onClick={onNewAppt}
        style={{width:180,flexShrink:0,minHeight:84,background:'linear-gradient(135deg,#1e3a40,#2a5260)',border:'none',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,cursor:'pointer',fontFamily:"'Inter',sans-serif",transition:'all 0.18s',boxShadow:'0 2px 10px rgba(30,58,64,0.3)'}}
        onMouseEnter={e => { e.currentTarget.style.background='linear-gradient(135deg,#162e34,#1e3d4a)'; e.currentTarget.style.transform='translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.background='linear-gradient(135deg,#1e3a40,#2a5260)'; e.currentTarget.style.transform='none'; }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Appointment</span>
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
  const items = [
    { key:'today'    as const, label:'Today',    days:0 },
    { key:'tomorrow' as const, label:'Tomorrow', days:1 },
    { key:'dayafter' as const, label:'Day After', days:2 },
  ];
  return (
    <div style={{background:'#ccd8d8',borderRadius:9,padding:'3px 4px',display:'flex',gap:2,flexShrink:0}}>
      {items.map(it => {
        const active = period === it.key;
        return (
          <button key={it.key} onClick={() => onPick(it.key, it.days)}
            style={{padding:'5px 14px',borderRadius:7,border:'none',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:active?700:500,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',background:active?'#1e3a40':'transparent',color:active?'#fff':'#4b5563',boxShadow:active?'0 1px 4px rgba(30,58,64,0.35)':'none'}}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background='rgba(0,0,0,0.06)'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background='transparent'; }}
          >{it.label}</button>
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
  const [appts,    setAppts]    = useState<Appointment[]>(getDemoData);
  const [selected, setSelected] = useState<Appointment|null>(null);
  const [toasts,   setToasts]   = useState<ToastMsg[]>([]);

  const toastCounter = useRef(0);

  const [filterService,  setFilterService]  = useState('ALL SERVICES');
  const [filterLocation, setFilterLocation] = useState('ALL LOCATIONS');
  const [filterMode,     setFilterMode]     = useState('ALL MODE');

  const serviceOptions  = useMemo(() => ['ALL SERVICES',  ...Array.from(new Set(appts.map(a=>a.serviceName))).sort()], [appts]);
  const locationOptions = useMemo(() => ['ALL LOCATIONS', ...Array.from(new Set(appts.map(a=>a.location))).sort()],    [appts]);

  const showToast = useCallback((text:string, type:'success'|'error'|'info'='info') => {
    const id = ++toastCounter.current;
    setToasts(p => [...p, {id, text, type}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2800);
  }, []);

  const todayAppts = useMemo(() =>
    appts.filter(a =>
      a.date === date &&
      (filterService  === 'ALL SERVICES'  || a.serviceName === filterService) &&
      (filterLocation === 'ALL LOCATIONS' || a.location    === filterLocation) &&
      (filterMode === 'ALL MODE' ||
       (filterMode === 'PRE-BOOKED' && a.mode === 'pre_booked') ||
       (filterMode === 'WALK-IN'    && a.mode === 'without_confirmation'))
    ),
    [appts, date, filterService, filterLocation, filterMode]
  );

  const stats: Stats = {
    total:     todayAppts.length,
    confirmed: todayAppts.filter(a=>a.status==='confirmed').length,
    cancelled: todayAppts.filter(a=>a.status==='cancelled').length,
    pending:   todayAppts.filter(a=>a.status==='pending').length,
    ongoing:   todayAppts.filter(a=>a.status==='ongoing').length,
  };

  const filtered = useMemo(() =>
    todayAppts.filter(a =>
      search === '' ||
      a.serviceName.toLowerCase().includes(search.toLowerCase()) ||
      a.providerName.toLowerCase().includes(search.toLowerCase()) ||
      a.clientName.toLowerCase().includes(search.toLowerCase()) ||
      a.clientPhone.toLowerCase().includes(search.toLowerCase())
    ),
    [todayAppts, search]
  );

  const handleStatusChange = useCallback((id:number, s:Appointment['status']) => {
    setAppts(prev => prev.map(a => a.id===id ? {...a,status:s} : a));
    showToast(
      s==='confirmed' ? 'Appointment confirmed' :
      s==='cancelled' ? 'Appointment cancelled' :
      s==='ongoing'   ? 'Client checked in'     : 'Status updated',
      s==='cancelled' ? 'error' : 'success'
    );
  }, [showToast]);

  const handleFreeSlotClick = useCallback((provider:string, slot:string) => {
    router.push(`/appointmentform?${new URLSearchParams({date, timeSlot:slot, provider}).toString()}`);
  }, [router, date]);

  const handleReschedule = useCallback((appt:Appointment) => {
    const params = new URLSearchParams({
      provider:appt.providerName, serviceName:appt.serviceName,
      clientName:appt.clientName, clientPhone:appt.clientPhone,
      duration:String(appt.duration), price:String(appt.price),
      location:appt.location, gender:appt.gender, mode:appt.mode,
      notes:appt.notes||'', reschedule:'existing',
    });
    router.push(`/appointmentform?${params.toString()}`);
  }, [router]);

  const handleGoToBill = useCallback((appt:Appointment) => {
    const params = new URLSearchParams({
      appointmentId:String(appt.id), clientName:appt.clientName,
      clientPhone:appt.clientPhone,  providerName:appt.providerName,
      serviceName:appt.serviceName,  date:appt.date, timeSlot:appt.timeSlot,
      duration:String(appt.duration), price:String(appt.price),
      location:appt.location, status:appt.status, mode:appt.mode,
      gender:appt.gender, notes:appt.notes||'',
    });
    router.push(`/billing?${params.toString()}`);
  }, [router]);

  const handleDropped = useCallback((apptId:number, newProvider:string, newSlot:string) => {
    setAppts(prev => prev.map(a => {
      if (a.id !== apptId) return a;
      const changed: string[] = [];
      if (a.providerName !== newProvider) changed.push(`Provider → ${newProvider}`);
      if (a.timeSlot     !== newSlot)     changed.push(`Time → ${newSlot}`);
      showToast(`${a.clientName}: ${changed.join(' · ')}`, 'success');
      return { ...a, providerName:newProvider, timeSlot:newSlot };
    }));
  }, [showToast]);

  function handleDateNavChange(d: string) { setDate(d); setPeriod(computePeriod(d)); }
  function handlePeriodClick(key:'today'|'tomorrow'|'dayafter', days:number) {
    setDate(shiftDate(todayISO(), days)); setPeriod(key);
  }

  const PAGE  = '#c2d4d4';
  const PANEL = '#deeaea';
  const HDR   = '#dae6e6';

  return (
    <>
      <style>{CSS}</style>
      <ToastContainer toasts={toasts}/>

      {selected && (
        <DetailModal
          appt={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onReschedule={a => { setSelected(null); handleReschedule(a); }}
          onGoToBill={handleGoToBill}
        />
      )}

      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>

        {/* ── SIDEBAR (desktop + mobile) ── */}
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => { setNavKey(key); router.push(path); }}
          onLogout={() => router.push('/admin/login')}
        />

        {/* ── MAIN ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

          {/* HEADER */}
          <header className="hdr-inner" style={{background:HDR,height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10}}>
            <div className="srch-wrap" style={{position:'relative',flexShrink:0}}>
              <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4}}><ISearch/></span>
              <input className="srch" placeholder="Search....." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <div style={{flex:1}}/>
            <button
              style={{background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8}}
              onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            ><IBell/></button>
            <div className="hdr-name" style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <span style={{fontSize:14,fontWeight:500,color:'#1f2937'}}>MR. SAYO</span><IChevD/>
            </div>
            <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0}}>
              S
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{flex:1,overflow:'auto',padding:'13px 15px',display:'flex',flexDirection:'column',gap:12}}>

            <TopActionRow stats={stats} onNewAppt={() => router.push('/appointmentform')}/>

            {/* Filters */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <select className="f-sel" value={filterService}  onChange={e=>setFilterService(e.target.value)}>
                {serviceOptions.map(s  => <option key={s}>{s}</option>)}
              </select>
              <select className="f-sel" value={filterLocation} onChange={e=>setFilterLocation(e.target.value)}>
                {locationOptions.map(l => <option key={l}>{l}</option>)}
              </select>
              <select className="f-sel" value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
                <option>ALL MODE</option>
                <option>PRE-BOOKED</option>
                <option>WALK-IN</option>
              </select>
              {(filterService!=='ALL SERVICES'||filterLocation!=='ALL LOCATIONS'||filterMode!=='ALL MODE') && (
                <button
                  onClick={() => { setFilterService('ALL SERVICES'); setFilterLocation('ALL LOCATIONS'); setFilterMode('ALL MODE'); }}
                  style={{fontSize:12,fontWeight:600,color:'#b91c1c',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                  Clear Filters
                </button>
              )}
            </div>

            {/* Content */}
            <div style={{display:'flex',gap:13,alignItems:'flex-start',flex:1,minHeight:0}}>
              <div style={{flex:1,minWidth:0,background:PANEL,borderRadius:12,boxShadow:'0 1px 5px rgba(0,0,0,0.08)',overflow:'hidden',display:'flex',flexDirection:'column'}}>

                {/* Toolbar */}
                <div style={{display:'flex',alignItems:'center',padding:'12px 14px 0',gap:6,flexWrap:'wrap',flexShrink:0}}>
                  <DateNav date={date} onChange={handleDateNavChange}/>
                  <div style={{display:'flex',gap:2,background:'rgba(0,0,0,0.07)',borderRadius:8,padding:'3px',marginLeft:4}}>
                    {(['grid','list'] as const).map(v => (
                      <button key={v} className={`view-btn ${viewMode===v?'active':''}`} onClick={() => setViewMode(v)}>
                        {v==='grid' ? '⊞ Grid' : '≡ List'}
                      </button>
                    ))}
                  </div>
                  {viewMode==='grid' && (
                    <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:'rgba(30,58,64,0.06)',borderRadius:8,marginLeft:4}}>
                      <IDrag s={11}/><span style={{fontSize:11,color:'#6b7280',fontWeight:600}}>Drag pills to reschedule</span>
                    </div>
                  )}
                  <div style={{flex:1}}/>
                  <PeriodButtons period={period} onPick={handlePeriodClick}/>
                </div>

                <div style={{height:1,background:'rgba(30,58,64,0.1)',margin:'10px 0 0',flexShrink:0}}/>

                {/* Grid view */}
                {viewMode==='grid' && (
                  <div className="fade-up" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                    <ScheduleGrid
                      dayAppts={todayAppts}
                      onFreeSlotClick={handleFreeSlotClick}
                      onPillClick={setSelected}
                      onDropped={handleDropped}
                    />
                  </div>
                )}

                {/* List view */}
                {viewMode==='list' && (
                  <div className="fade-up" style={{flex:1,overflow:'auto',padding:'12px 13px'}}>
                    {filtered.length === 0
                      ? <p style={{textAlign:'center',color:'#9ca3af',padding:'3rem 0',fontSize:13}}>No appointments match.</p>
                      : <div style={{display:'flex',flexDirection:'column',gap:9}}>
                          {filtered.map(a => <ApptCard key={a.id} appt={a} onClick={() => setSelected(a)}/>)}
                        </div>
                    }
                  </div>
                )}

              </div>
            </div>
          </div>{/* end main-body */}
        </div>{/* end main flex */}
      </div>{/* end root flex */}
    </>
  );
}