'use client';

import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
/* Payment methods + split-payment maths live in one shared module so the bill
   screen and the API agree on what a payment is. */
import {
  METHOD_LABEL,
  PAY_METHODS,
  PaymentLine,
  PayMethod,
  applyLineCap,
  lineAmountCap,
  methodTypes,
  paymentLabel,
  summarisePayments,
} from '@/lib/billingPayments';
/* Suggestion lists must never be clipped by the card they sit in. */
import FloatingPanel from '@/components/FloatingPanel';
/* Tax maths. The rates are never hard-coded: they are read from tbl_taxes. */
import {
  computeTaxes,
  percentLabel,
  type TaxRow,
} from '@/lib/billingTaxes';

interface ApptInfo {
  id: string;
  bookingID: string;
  locCode: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
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

/** One read-only service line of the booking (GET /api/billing/booking/:id). */
interface BookingServicePayload {
  key: string;
  guessID: string;
  itemCode: string;
  name: string;
  qty: number;
  price: number;
  mainTech: string;
  supporters: string[];
  /** Distinct guests that booked this service (rows are collapsed by the API). */
  guestCount?: number;
  guessIDs?: string[];
}

interface BookingPayload {
  bookingID: string;
  locCode: string;
  cusCode: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  gender: string;
  date: string;
  timeSlot: string;
  status: string;
  mode: string;
  notes: string;
  pax: number;
  billed: boolean;
  total: number;
  services: BookingServicePayload[];
}

interface ServiceLine {
  key: string;
  guessID: string;
  itemCode: string;
  name: string;
  qty: number;
  price: number;
  mainTech: string;
  supporters: string;
  guestCount: number;
  guessIDs: string[];
}

interface BillItem {
  id: number;
  name: string;
  qty: number;
  price: number;
  /** "Sales by" technician (items only — services keep their Main Technician). */
  salesBy: string;
  supporters: string;
  /** true when the line came from the technician's material list. */
  material?: boolean;
  /** Item master code, when the line was picked from the item suggestions. */
  itemCode?: string;
  /** Unit cost — written to tbl_billdetail.CostPrice. */
  costPrice?: number;
}

/** One row of GET /api/items/search (tbl_itemmaster). */
interface ItemOption {
  code: string;
  locCode: string;
  des: string;
  masterUnitID: string;
  retailPrice: number;
  serviceItem: boolean;
}

function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtDateLong(iso: string) {
  if (!iso) return '—';
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
function statusLabel(status: string) {
  const value = (status || '').toLowerCase();
  if (value === 'done') return 'Done';
  if (value === 'ongoing') return 'Ongoing';
  if (value === 'confirmed') return 'Confirmed';
  if (value === 'cancelled') return 'Cancelled';
  if (value === 'pending') return 'Pending';
  return status || '—';
}

/* Technician names are never hard-coded on this screen: "Sales by" and the
   supporters picker list exactly the staff stored in tbl_userdetails, read from
   /api/appointments?meta=filters (Enable = 1). */

/** Names typed into a supporters cell, split on commas. */
function parseSupporters(value: string): string[] {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function SupporterPicker({
  value,
  options,
  onChange,
  exclude = '',
  compact = false,
  disabled = false,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  /** Main "Sales by" name — a supporter must be someone else. */
  exclude?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const names = parseSupporters(value);
  const available = options.filter(
    n => !names.includes(n) && n.trim().toUpperCase() !== exclude.trim().toUpperCase(),
  );

  return (
    <div className="chip-row">
      {names.map(name => (
        <span className="chip" key={name}>
          {name}
          {!disabled && (
            <button
              type="button"
              title={`Remove ${name}`}
              onClick={() => onChange(names.filter(n => n !== name).join(', '))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && available.length > 0 && (
        <select
          className="chip-sel"
          value=""
          title="Add a supporting technician"
          aria-label="Add a supporting technician"
          onChange={e => {
            const name = e.target.value;
            if (!name) return;
            onChange([...names, name].join(', '));
          }}
          style={compact ? undefined : { maxWidth: 170, padding: '5px 8px', fontSize: 11.5 }}
        >
          <option value="">+ Supporter</option>
          {available.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}
      {!disabled && available.length === 0 && names.length === 0 && (
        <span style={{ fontSize: 11, color: '#9ca3af' }}>No staff available</span>
      )}
    </div>
  );
}

function getApptFromParams(searchParams: ReturnType<typeof useSearchParams>): ApptInfo {
  const bookingID = (searchParams.get('appointmentId') || '').trim();
  const locCode   = (searchParams.get('locCode') || '').trim();

  return {
    id:           bookingID || 'WALKIN',
    bookingID,
    locCode,
    clientName:   searchParams.get('clientName')   || 'Walk-in Client',
    clientPhone:  searchParams.get('clientPhone')  || '—',
    clientEmail:  searchParams.get('clientEmail')  || '',
    providerName: searchParams.get('providerName') || '',
    serviceName:  searchParams.get('serviceName')  || 'Service',
    date:         searchParams.get('date')         || todayISO(),
    timeSlot:     searchParams.get('timeSlot')     || '—',
    duration:     Number(searchParams.get('duration')) || 30,
    price:        Number(searchParams.get('price'))    || 0,
    location:     locCode || searchParams.get('location') || '—',
    status:       searchParams.get('status')       || 'done',
    mode:         searchParams.get('mode')         || 'pre_booked',
    gender:       searchParams.get('gender')       || '',
    notes:        searchParams.get('notes')        || '',
  };
}

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

  .tax-pct {
    font-size:10px; font-weight:700; color:#5c7a80; background:rgba(30,58,64,0.07);
    border-radius:99px; padding:1px 6px; letter-spacing:0.02em;
  }
  .sum-note { font-size:10.5px; color:#9ca3af; margin-top:5px; text-align:right; }
  .save-warn {
    margin-top:12px; font-size:11.5px; font-weight:600; color:#991b1b;
    background:#fef2f2; border:1px solid #fca5a5; border-radius:8px;
    padding:8px 10px; line-height:1.45;
  }
  .bill-no { font-size:12px; font-weight:800; color:#1e3a40; letter-spacing:0.04em; }
  .tax-warn {
    font-size:11px; font-weight:600; color:#b45309; background:#fffbeb;
    border:1px solid #fcd34d; border-radius:8px; padding:7px 9px; line-height:1.45;
  }

  .pay-opt {
    flex:1; padding:10px 4px; border-radius:10px; border:1.5px solid #c8d6d8;
    background:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:5px;
    transition:all 0.15s; font-family:'Inter',sans-serif;
  }
  .pay-opt:hover { border-color:#1e3a40; }
  .pay-opt.active { border-color:#1e3a40; background:rgba(30,58,64,0.06); box-shadow:0 0 0 1px #1e3a40 inset; }
  .pay-opt-lbl { font-size:10.5px; font-weight:600; color:#374151; white-space:nowrap; }

  /* Split-payment lines */
  .pay-line {
    display:flex; flex-direction:column; padding:8px; border-radius:9px;
    background:#f4f9f9; border:1px solid #c8dcdd;
  }
  .pay-cap { font-size:10px; font-weight:600; color:#6b7280; margin-top:5px; }
  .pay-cap-note { font-size:10.5px; font-weight:700; color:#b45309; margin-top:4px; line-height:1.4; }
  .pay-inp {
    border:1px solid #c8d6d8; border-radius:7px; padding:5px 7px;
    font-family:'Inter',sans-serif; font-size:11.5px; color:#1f2937;
    background:#fff; outline:none; min-width:0;
  }
  .pay-inp:focus { border-color:#1e3a40; }
  .pay-amt { width:88px; flex-shrink:0; text-align:right; font-weight:700; }
  .pay-inp + .pay-inp { flex:1 1 auto; }

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
  .btn-revert {
    display:inline-flex; align-items:center; gap:5px;
    border:1.5px solid #f0c48a; background:#fffaf2; color:#b45309;
    font-family:'Inter',sans-serif; font-size:11px; font-weight:700;
    padding:5px 10px; border-radius:8px; cursor:pointer;
    transition:background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .btn-revert:hover:not(:disabled) { background:#fdf1dd; border-color:#d99a4e; box-shadow:0 2px 8px rgba(180,83,9,0.15); }
  .btn-revert:disabled { opacity:0.6; cursor:not-allowed; }
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

  @media(max-width:1100px) {
    .bill-layout { flex-direction:column !important; }
    .bill-right  { width:100% !important; position:static !important; }
  }
  @media(max-width:767px) {
    .hdr-name { display:none !important; }
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

  /* Item-name autocomplete (tbl_itemmaster) */
  .suggest-wrap { position:relative; }
  /* Portalled to <body> by <FloatingPanel>: the card can no longer clip it. */
  .suggest-pop {
    overflow-y:auto; padding:4px;
    background:#fff; border:1.5px solid #1e3a40; border-radius:10px;
    box-shadow:0 10px 26px rgba(0,0,0,0.18);
  }
  .suggest-item {
    display:flex; align-items:center; gap:8px; width:100%;
    padding:7px 9px; border:none; border-radius:7px; background:transparent;
    font-family:'Inter',sans-serif; text-align:left; cursor:pointer;
  }
  .suggest-item:hover, .suggest-item.active { background:rgba(30,58,64,0.08); }
  .suggest-item .si-code { font-size:10px; font-weight:700; color:#1e3a40; background:rgba(30,58,64,0.08); border-radius:5px; padding:2px 5px; flex-shrink:0; }
  .suggest-item .si-des  { flex:1; min-width:0; font-size:12px; color:#1f2937; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .suggest-item .si-price{ font-size:11.5px; font-weight:700; color:#1e3a40; flex-shrink:0; }
  .suggest-empty { padding:8px 10px; font-size:11.5px; color:#9ca3af; }

  /* Supporters picker: chips + dropdown */
  .chip-row { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
  .chip {
    display:inline-flex; align-items:center; gap:4px;
    background:#eef4f4; border:1px solid #c0d4d6; border-radius:99px;
    padding:2px 4px 2px 8px; font-size:11px; font-weight:600; color:#1e3a40;
  }
  .chip button {
    display:flex; align-items:center; justify-content:center;
    width:14px; height:14px; border:none; border-radius:50%;
    background:rgba(30,58,64,0.12); color:#1e3a40; cursor:pointer;
    font-size:10px; line-height:1; padding:0;
  }
  .chip button:hover { background:rgba(185,28,28,0.2); color:#b91c1c; }
  .chip-sel {
    border:1px dashed #b6c9cb; border-radius:99px; padding:2px 6px;
    font-family:'Inter',sans-serif; font-size:10.5px; color:#5c7a80;
    background:#fff; cursor:pointer; outline:none; max-width:130px;
  }
  .chip-sel:focus { border-color:#1e3a40; }
`;

function IBell()    { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({s=13}:{s?:number}) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IBack()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function IPlus()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function ITrash()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>; }
function ICash()    { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>; }
function ICard()    { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>; }
function IOnline()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>; }
function ITicket()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><line x1="13" y1="5" x2="13" y2="19"/></svg>; }
function IPrinter() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function ICheckBig(){ return <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function IClock()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function ILoc()     { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function IUserSm()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IPhone()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>; }

function BillingContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const appt      = useMemo(() => getApptFromParams(searchParams), [searchParams]);
  const bookingID = appt.bookingID;

    const [booking,         setBooking]         = useState<BookingPayload | null>(null);
  const [services,        setServices]        = useState<ServiceLine[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  useEffect(() => {
    if (!bookingID) return;
    let active = true;
    setServicesLoading(true);
    fetch(`/api/billing/booking/${encodeURIComponent(bookingID)}`, { cache:'no-store' })
      .then(r => r.json())
      .then(json => {
        if (!active || !json?.success || !json.booking) return;
        const payload = json.booking as BookingPayload;
        setBooking(payload);
        // The booking notes belong on the bill unless the cashier typed their own.
        setBillNotes(current => (current.trim() ? current : payload.notes || ''));
        setServices(
          (Array.isArray(payload.services) ? payload.services : []).map(svc => ({
            key:        svc.key || `${svc.guessID}|${svc.itemCode}`,
            guessID:    svc.guessID || 'MAIN',
            itemCode:   svc.itemCode || '',
            name:       svc.name || svc.itemCode || 'Service',
            qty:        Number(svc.qty) || 1,
            price:      Number(svc.price) || 0,
            mainTech:   svc.mainTech || '',
            supporters: Array.isArray(svc.supporters) ? svc.supporters.join(', ') : String(svc.supporters || ''),
            guestCount: Number(svc.guestCount) || 1,
            guessIDs: Array.isArray(svc.guessIDs) ? svc.guessIDs : [],
          })),
        );
      })
      .catch(() => undefined)
      .finally(() => { if (active) setServicesLoading(false); });
    return () => { active = false; };
  }, [bookingID]);

    const [items, setItems] = useState<BillItem[]>([]);

  useEffect(() => {
    if (!bookingID) return;
    let active = true;
    fetch(`/api/bookings/${encodeURIComponent(bookingID)}/extras`, { cache:'no-store' })
      .then(r => r.json())
      .then(json => {
        if (!active || !json?.success) return;
        const recipe: Array<Record<string, unknown>> = Array.isArray(json.recipe) ? json.recipe : [];
        const defaultSalesBy = appt.providerName && appt.providerName !== '—' ? appt.providerName : '';
        setItems(
          recipe.map((row, i) => ({
            id:         i + 1,
            name:       String(row.rawItemDes || row.rawItemCode || 'Material'),
            qty:        Number(row.qty) || 1,
            price:      Number(row.retailPrice) || 0,
            salesBy:    defaultSalesBy,
            supporters: '',
            material:   true,
            // The recipe row already knows the item code and what it cost, and
            // both are needed for tbl_billdetail.
            itemCode:   String(row.rawItemCode || '').trim() || undefined,
            costPrice:  Number(row.itemCost) || 0,
          })),
        );
      })
      .catch(() => undefined);
    return () => { active = false; };
    // The seed only runs once per booking; the provider name is a display default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingID]);

    const [providers, setProviders] = useState<string[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/api/appointments?meta=filters', { cache:'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!active || !j?.success || !Array.isArray(j.technicians)) return;
        const names = (j.technicians as Array<{ UserName?: string }>)
          .map(t => String(t.UserName || '').trim())
          .filter(Boolean);
        setProviders(Array.from(new Set(names)).sort());
      })
      .catch(() => undefined)
      .finally(() => { if (active) setProvidersLoading(false); });
    return () => { active = false; };
  }, []);

  /** Staff options for the picker, keeping whatever is already selected. */
  const providerOptions = (...current: string[]) =>
    Array.from(new Set([...providers, ...current.flatMap(parseSupporters), ...current].filter(Boolean)))
      .sort();

  /* The bill number is NOT invented on this screen any more. It is issued by
     Tbl_Serials (series “INV”) inside the complete-payment transaction, so it
     appears for the first time on the receipt. */

    const view = useMemo(() => ({
    clientName:  booking?.clientName  || appt.clientName,
    clientPhone: booking?.clientPhone || appt.clientPhone,
    date:        booking?.date        || appt.date,
    timeSlot:    booking?.timeSlot    || appt.timeSlot,
    status:      booking?.status      || appt.status,
    mode:        booking?.mode        || appt.mode,
    location:    booking?.locCode     || appt.location,
    provider:    services[0]?.mainTech || appt.providerName,
    notes:       booking?.notes ?? appt.notes ?? '',
  }), [booking, appt, services]);

  /* The bill can only be completed while the booking is DONE — the API refuses
     anything else. `booking` being null (API unreachable / demo) keeps the old
     behaviour instead of locking the screen. */
  const statusFromDbKnown = Boolean(booking?.status);
  const bookingIsDone = !statusFromDbKnown || (view.status || '').toLowerCase() === 'done';

  /* Services are NEVER editable here. When the booking cannot be read from the
     API (demo data / offline), the single line from the query params is shown
     so the screen still works. */
  const shownServices: ServiceLine[] = services.length > 0
    ? services
    : servicesLoading
      ? []
      : [{
          key:        'params',
          guessID:    'MAIN',
          itemCode:   '',
          name:       appt.serviceName || 'Service',
          qty:        1,
          price:      appt.price,
          mainTech:   appt.providerName,
          supporters: '',
          guestCount: 1,
          guessIDs:   [],
        }];

    /* Anchor for the suggestion panel (it is portalled, so a card with
     overflow:hidden can no longer cut the list off). */
  const itemAnchorRef = useRef<HTMLDivElement | null>(null);
  const [newName,       setNewName]       = useState('');
  const [newPrice,      setNewPrice]      = useState('');
  const [newSalesBy,    setNewSalesBy]    = useState(appt.providerName);
  const [newSupporters, setNewSupporters] = useState('');
  const [newItemCode,   setNewItemCode]   = useState('');

  const [itemOptions,   setItemOptions]   = useState<ItemOption[]>([]);
  const [itemSearching, setItemSearching] = useState(false);
  const [showSuggest,   setShowSuggest]   = useState(false);
  const [suggestIndex,  setSuggestIndex]  = useState(-1);

  // Debounced lookup — the same /api/items/search the technician recipe editor
  // uses, so the names, codes and prices always match the item master.
  useEffect(() => {
    const q = newName.trim();
    if (q.length < 2 || newItemCode) {
      setItemOptions([]);
      setItemSearching(false);
      return;
    }
    let active = true;
    setItemSearching(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, limit: '12' });
      const loc = booking?.locCode || appt.locCode;
      if (loc) params.set('locCode', loc);
      fetch(`/api/items/search?${params.toString()}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(json => {
          if (!active) return;
          setItemOptions(Array.isArray(json?.items) ? (json.items as ItemOption[]) : []);
        })
        .catch(() => { if (active) setItemOptions([]); })
        .finally(() => { if (active) setItemSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newName, newItemCode, booking?.locCode]);

  /** Take a suggestion: name, code and the item-master retail price. */
  function pickItemOption(option: ItemOption) {
    setNewName(option.des || option.code);
    setNewItemCode(option.code);
    setNewPrice(String(Number(option.retailPrice) || 0));
    setItemOptions([]);
    setShowSuggest(false);
    setSuggestIndex(-1);
  }

  const [discountPct,  setDiscountPct]  = useState<number|''>(0);
  const [discountAmt,  setDiscountAmt]  = useState<number|''>('');
  const [discountSource, setDiscountSource] = useState<'pct'|'amt'|''>('pct');

    const [taxRows,      setTaxRows]      = useState<TaxRow[]>([]);
  const [taxesLoading, setTaxesLoading] = useState(true);
  const [taxError,     setTaxError]     = useState('');
  useEffect(() => {
    let active = true;
    setTaxesLoading(true);
    fetch('/api/taxes', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (!active) return;
        if (json?.success) {
          setTaxRows(Array.isArray(json.data) ? (json.data as TaxRow[]) : []);
          setTaxError('');
        } else {
          setTaxRows([]);
          setTaxError(
            'Taxes could not be loaded from tbl_taxes — the bill is being calculated without tax. Check the table and reload.',
          );
        }
      })
      .catch(() => {
        if (!active) return;
        setTaxRows([]);
        setTaxError(
          'Taxes could not be loaded from tbl_taxes — the bill is being calculated without tax. Check the table and reload.',
        );
      })
      .finally(() => { if (active) setTaxesLoading(false); });
    return () => { active = false; };
  }, []);

    type VwMode = { PayCode: string; PayDes: string; PayGroup: string | null; PayGroupID: string | null };
  const [vwModes, setVwModes] = useState<VwMode[]>([]);
  const [vwGroups, setVwGroups] = useState<Record<string, VwMode[]>>({});
  const [payModesLoading, setPayModesLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/api/payment-modes', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (!active) return;
        if (json?.success && Array.isArray(json.data)) {
          const list = (json.data as VwMode[]).filter(m => m.PayCode && m.PayDes);
          setVwModes(list);
          if (json.groups && typeof json.groups === 'object') {
            const g: Record<string, VwMode[]> = {};
            for (const [k, v] of Object.entries(json.groups as Record<string, VwMode[]>)) {
              if (Array.isArray(v) && v.length) g[k] = v;
            }
            setVwGroups(g);
          } else {
            const grouped: Record<string, VwMode[]> = {};
            for (const m of list) {
              const key = (m.PayGroup || 'Other').trim() || 'Other';
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(m);
            }
            setVwGroups(grouped);
          }
        } else {
          setVwModes([]);
          setVwGroups({});
        }
      })
      .catch(() => { if (active) { setVwModes([]); setVwGroups({}); } })
      .finally(() => { if (active) setPayModesLoading(false); });
    return () => { active = false; };
  }, []);

    const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [billNotes, setBillNotes] = useState(appt.notes || '');
  const [paid,      setPaid]      = useState(false);
  const [paidAt,    setPaidAt]    = useState('');
    const [revertBusy,  setRevertBusy]  = useState(false);
  const [revertNote,  setRevertNote]  = useState('');
  const [revertError, setRevertError] = useState('');
  const [saveWarning, setSaveWarning] = useState('');
  /* The reason the server gave (step + database message) and what to do about
     it — shown under the warning so a failure is never a mystery again. */
  const [saveDetail,  setSaveDetail]  = useState('');
  const [saveHint,    setSaveHint]    = useState('');
  /* Real bill number, issued by Tbl_Serials (“INV” series) when the payment is
     recorded — it replaces the draft invoice number on the receipt. */
  const [billNo,      setBillNo]      = useState('');
  const [changeDue,   setChangeDue]   = useState(0);
  const [skippedLines, setSkippedLines] = useState<string[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');
  /* “Only cash can go above the bill” — this note appears when a card / online
     / voucher amount was capped at what the bill still owes. */
  const [payCapNote,  setPayCapNote]  = useState<Record<number, string>>({});

  const servicesTotal = shownServices.reduce((s,l)=>s+l.qty*l.price, 0);
  const itemsTotal    = items.reduce((s,i)=>s+i.qty*i.price, 0);
  const gross         = servicesTotal + itemsTotal;

  const discAmt = useMemo(()=>{
    if (discountAmt !== '') return Number(discountAmt);
    if (discountPct !== '') return gross * (clamp(Number(discountPct),0,100)/100);
    return 0;
  },[gross, discountPct, discountAmt]);

  // When the bill total changes after a discount was already typed, keep the
  // % ↔ value pair consistent so both boxes stay truthful.
  useEffect(() => {
    if (gross <= 0) return;
    if (discountSource === 'pct' && discountPct !== '') {
      const pct = clamp(Number(discountPct), 0, 100);
      const amt = Number((gross * pct / 100).toFixed(2));
      if (Number(discountAmt) !== amt) setDiscountAmt(amt);
    } else if (discountSource === 'amt' && discountAmt !== '') {
      const amtV = Number(discountAmt);
      if (!Number.isFinite(amtV)) return;
      const pct = Number(((Math.min(amtV, gross) / gross) * 100).toFixed(2));
      if (Number(discountPct) !== pct) setDiscountPct(pct);
    }
  }, [gross]); // keep %↔value synced when services/items change

    const tax = useMemo(
    () => computeTaxes(taxRows, gross, discAmt),
    [taxRows, gross, discAmt],
  );
  const grossAfterDis = tax.grossAfterDiscount;
  const netTotal      = tax.netTotal;
  /* Only the taxes that actually carry a rate are worth a row on screen. */
  const taxLines      = tax.lines.filter(line => line.percentage > 0);
  /* Split payments: everything the cashier entered, added together. */
  const paymentInfo   = summarisePayments(payments, netTotal);
  const paidAmt       = paymentInfo.paidAmount;
  const balance       = paymentInfo.balance;
  const remaining     = paymentInfo.remaining;

    function updateQty(id:number, delta:number) {
    setItems(prev=>prev.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+delta)}:i));
  }
  function updateItemField(id:number, field:'salesBy'|'supporters'|'name', val:string) {
    setItems(prev=>prev.map(i=>i.id===id?{...i,[field]:val}:i));
  }
  function updateItemPrice(id:number, raw:string) {
    const parsed = Number(raw);
    setItems(prev=>prev.map(i=>i.id===id?{...i,price: Number.isFinite(parsed) && parsed>=0 ? parsed : 0}:i));
  }
  function removeItem(id:number) {
    setItems(prev=>prev.filter(i=>i.id!==id));
  }
  function addItem() {
    const priceNum = Number(newPrice);
    if (!newName.trim() || !Number.isFinite(priceNum) || priceNum<=0) {
      setFormError('Pick an item name and a price first');
      return;
    }
    setItems(prev=>[...prev,{
      id: Date.now(),
      name: newName.trim(),
      qty: 1,
      price: priceNum,
      salesBy: newSalesBy,
      supporters: newSupporters,
      material: false,
      itemCode: newItemCode || undefined,
    }]);
    setNewName(''); setNewPrice(''); setNewSupporters(''); setNewItemCode('');
    setItemOptions([]); setShowSuggest(false);
  }

    function vwGroupToMethod(group: string): PayMethod {
    const g = (group || '').toLowerCase();
    if (g.includes('cash')) return 'cash';
    if (g.includes('voucher') || g.includes('gift') || g.includes('complement')) return 'voucher';
    if (g.includes('online') || g.includes('bank') || g.includes('wallet') || g.includes('gateway') || g.includes('transfer')) return 'online';
    if (g.includes('card') || g.includes('credit') || g.includes('visa') || g.includes('master') || g.includes('amex')) return 'card';
    return 'cash';
  }
  function vwTypesForMethod(method: PayMethod): string[] {
    const out: string[] = [];
    for (const [group, modes] of Object.entries(vwGroups)) {
      if (vwGroupToMethod(group) === method) {
        for (const m of modes) if (m.PayDes && !out.includes(m.PayDes)) out.push(m.PayDes);
      }
    }
    return out.length ? out : methodTypes(method);
  }
  function payGroupIcon(group: string) {
    const m = vwGroupToMethod(group);
    if (m === 'cash') return <ICash />;
    if (m === 'card') return <ICard />;
    if (m === 'online') return <IOnline />;
    return <ITicket />;
  }
  function addPaymentFromGroup(group: string) {
    const method = vwGroupToMethod(group);
    const owed = Math.max(0, netTotal - paidAmt);
    const modes = vwGroups[group] || [];
    const firstType = modes[0]?.PayDes || vwTypesForMethod(method)[0] || '';
    // Respect Enable/ZeroVal: if group has a Cash mode with ZeroVal maybe? Keep simple.
    setPayments(prev => [
      ...prev,
      { id: Date.now() + Math.floor(Math.random() * 1000), method, type: firstType, amount: owed > 0 ? owed.toFixed(2) : '', remark: '' },
    ]);
  }

    /** Add a method line, pre-filled with whatever is still owed. */
  function addPayment(method: PayMethod) {
    /* Pre-fill with what the bill still owes, so the last line is one tap.
       Card / online / voucher lines can never take more than that; a cash line
       may, and the difference is returned as change. */
    const owed = Math.max(0, netTotal - paidAmt);
    const types = methodTypes(method);
    setPayments(prev => [
      ...prev,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        method,
        type: types[0] || '',
        amount: owed > 0 ? owed.toFixed(2) : '',
        remark: '',
      },
    ]);
  }

  function updatePayment(id: number, patch: Partial<PaymentLine>) {
    setPayments(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePayment(id: number) {
    setPayments(prev => {
      const next = prev.filter(p => p.id !== id);
      setPayCapNote(notes => {
        if (!(id in notes)) return notes;
        const copy = { ...notes };
        delete copy[id];
        return copy;
      });
      return next;
    });
  }

  /** Everything on the other payment lines — what this line may still take. */
  const otherLinesTotal = (id: number) =>
    payments
      .filter(p => p.id !== id)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    function setLineAmount(id: number, raw: string) {
    const line = payments.find(p => p.id === id);
    if (!line) return;
    if (raw === '') {
      updatePayment(id, { amount: '' });
      setPayCapNote(notes => {
        if (!(id in notes)) return notes;
        const copy = { ...notes };
        delete copy[id];
        return copy;
      });
      return;
    }
    const typed = Number(raw);
    if (!Number.isFinite(typed) || typed < 0) return;

    const { amount, cap, capped } = applyLineCap(
      line.method,
      typed,
      netTotal,
      otherLinesTotal(id),
    );
    updatePayment(id, { amount: String(amount) });
    setPayCapNote(notes => {
      const copy = { ...notes };
      if (capped) {
        copy[id] = `${METHOD_LABEL[line.method]} cannot take more than ${fmtMoney(cap)} — that is all the bill still owes. Cash can cover the rest (change is given back).`;
      } else {
        delete copy[id];
      }
      return copy;
    });
  }

  /** Switching the method re-checks the cap (cash is free, others are not). */
  function setLineMethod(id: number, method: PayMethod) {
    const types = methodTypes(method);
    const line = payments.find(p => p.id === id);
    const typed = Number(line?.amount) || 0;
    const { amount } = applyLineCap(method, typed, netTotal, otherLinesTotal(id));
    updatePayment(id, { method, type: types[0] || '', amount: String(amount) });
    setPayCapNote(notes => {
      const copy = { ...notes };
      delete copy[id];
      return copy;
    });
  }

  /** The most this line may hold, or null when it is unlimited (cash). */
  const lineCap = (id: number, method: PayMethod) => {
    const cap = lineAmountCap(method, netTotal, otherLinesTotal(id));
    return Number.isFinite(cap) ? cap : null;
  };

    /* Everything that has to be written to the four bill tables:
     the item lines (services + items), the tax breakdown, the split payments
     and the “Gross ▸ Discount” headline numbers. */
  const billLines = () => [
    ...shownServices.map(s => ({
      itemId:    s.itemCode,
      name:      s.name,
      qty:       s.qty,
      price:     s.price,
      costPrice: 0,
    })),
    ...items.map(i => ({
      itemId:    i.itemCode || '',
      name:      i.name,
      qty:       i.qty,
      price:     i.price,
      costPrice: Number(i.costPrice) || 0,
    })),
  ];

  /* Lines without an item code cannot go into tbl_billdetail. The screen says
     so before the payment is taken (see the note under the items table). */
  const codeLessItems = items.filter(i => !String(i.itemCode || '').trim());
  const codeLessServices = shownServices.filter(s => !String(s.itemCode || '').trim());

  async function completePayment() {
    setPaid(true);
    setPaidAt(nowTimeLabel());
    setSaveWarning('');
    if (!bookingID) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/billing/booking/${encodeURIComponent(bookingID)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({
            // Every line on the bill → tbl_billdetail.
            lines: billLines(),
            // Headline numbers → tbl_billheader.
            gross,
            discountPercent: Number(discountPct) || 0,
            discountValue: discAmt,
            // Full split: one entry per method used on this bill.
            payments: payments
              .filter(p => (Number(p.amount) || 0) > 0)
              .map(p => ({
                method: p.method,
                type: p.type,
                amount: Number(p.amount) || 0,
                remark: p.remark,
              })),
            payMethod: payments
              .filter(p => (Number(p.amount) || 0) > 0)
              .map(p => METHOD_LABEL[p.method].toLowerCase())
              .join('+'),
            paidAmount: paidAmt,
            netTotal,
            // The tax breakdown travels with the bill so the future
            // tbl_billtaxes insert has every row it needs.
            taxes: taxLines.map(line => ({
              code: line.code,
              label: line.label,
              percentage: line.percentage,
              stage: line.stage,
              base: line.base,
              amount: line.amount,
            })),
            remark: billNotes,
          }),
        },
      );
      const json = await res.json();
      if (!json?.success) {
        // Keep the server's own explanation — it names the failed step and the
        // database message instead of a generic “could not be saved”.
        const pieces = [
          json?.message,
          json?.detail,
          json?.stage ? `step: ${json.stage}` : '',
        ].filter(Boolean);
        const error = new Error(pieces.join(' — ') || 'failed');
        (error as Error & { hint?: string }).hint = json?.hint || '';
        throw error;
      }
      setSaveDetail('');
      setSaveHint('');
      // The bill has a real number now (Tbl_Serials “INV” series) — use it on
      // the receipt instead of the draft number.
      if (typeof json.billNo === 'string') setBillNo(json.billNo);
      setChangeDue(Number(json.change) || 0);
      setSkippedLines(
        Array.isArray(json.unmappedLines)
          ? json.unmappedLines.map((l: { name?: string }) => String(l.name || 'line'))
          : [],
      );
    } catch (err) {
      // Stay on the bill: nothing was written, so the cashier can fix it and
      // press Complete Payment again.
      setPaid(false);
      setSaveWarning(
        err instanceof Error && err.message !== 'failed'
          ? 'The bill was NOT saved — nothing was written to the system.'
          : 'The bill was NOT saved — the server did not answer. Please try again.',
      );
      setSaveDetail(err instanceof Error && err.message !== 'failed' ? err.message : '');
      setSaveHint(
        err instanceof Error
          ? ((err as Error & { hint?: string }).hint || '')
          : '',
      );
    } finally {
      setSaving(false);
    }
  }
    async function revertStatus() {
    if (!bookingID || revertBusy) return;

    const current    = (view.status || '').toLowerCase();
    const nextLabel  = current === 'done' ? 'Ongoing' : 'Confirmed';

    if (
      !confirm(
        `Revert this booking?\n\n` +
          `Status: ${statusLabel(view.status)} → ${nextLabel}\n\n` +
          `The booking goes back to the technician list so the work, the materials ` +
          `and the supporters can be corrected. It is billed again after it is ` +
          `marked done.`,
      )
    )
      return;

    setRevertBusy(true);
    setRevertNote('');
    setRevertError('');

    try {
      const res = await fetch(
        `/api/billing/booking/${encodeURIComponent(bookingID)}/revert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locCode: booking?.locCode || appt.locCode || '' }),
        },
      );
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        to?: string;
        toLabel?: string;
      };
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'The status could not be reverted.');
      }

      const next = String(json.to || '').toLowerCase();
      setBooking(currentBooking =>
        currentBooking ? { ...currentBooking, status: next } : currentBooking,
      );
      setRevertNote(json.message || `Reverted to ${json.toLabel || nextLabel}.`);
    } catch (err) {
      setRevertError(
        err instanceof Error ? err.message : 'The status could not be reverted.',
      );
    } finally {
      setRevertBusy(false);
    }
  }

  function handlePrint() { window.print(); }

  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';

  const [mounted, setMounted] = useState(false);
  useEffect(()=>{ setMounted(true); },[]);

  return (
    <>
      <style>{CSS}</style>
      {/* The bill screen runs full width — the workspace sidebar was removed so
          the invoice, items and payment panels get the whole screen. */}
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
          <header className="hdr-inner no-print" style={{background:HDR,height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10}}>
            <button onClick={()=>router.push('/billing/dashboard')}
              style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',color:'#1e3a40',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,padding:'6px 10px',borderRadius:8}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(0,0,0,0.05)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
            ><IBack/> Back to Billing Dashboard</button>
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
              <div className="bill-layout fade-up" style={{display:'flex',gap:16,alignItems:'flex-start',maxWidth:1320,margin:'0 auto'}}>
                <div style={{flex:2,minWidth:0,display:'flex',flexDirection:'column',gap:14}}>

                  {}
                  <div className="bill-card">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
                      <div>
                        <p className="bill-sec-title" style={{marginBottom:4}}>Bill No.</p>
                        {/* No draft number is shown any more: the INV number is
                            issued from Tbl_Serials only when the payment is
                            confirmed, and it is printed on the receipt. */}
                        <p style={{fontSize:20,fontWeight:800,color:'#b6c2c4'}}>—</p>
                        <p style={{fontSize:10.5,color:'#9ca3af',marginTop:2}}>
                          Issued when the payment is confirmed
                        </p>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,maxWidth:320}}>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
                          <span className={`badge ${view.status==='ongoing'?'b-ong':'b-pre'}`}>{statusLabel(view.status)}</span>
                          <span className="badge b-pre">{view.mode==='pre_booked'?'Pre-booked':'Walk-in'}</span>
                        </div>

                        {/* REVERT — the antidote to a “Done” pressed by mistake.
                            Shown while the booking is still Done or Ongoing and
                            the bill has not been written yet. */}
                        {!paid && statusFromDbKnown && ['done','ongoing'].includes((view.status||'').toLowerCase()) && (
                          <button
                            type="button"
                            className="btn-revert"
                            onClick={() => void revertStatus()}
                            disabled={revertBusy}
                            title={
                              (view.status||'').toLowerCase() === 'done'
                                ? 'Put the booking back to Ongoing so the technician can correct the work'
                                : 'Undo the check-in (back to Confirmed)'
                            }
                          >
                            {revertBusy
                              ? 'Reverting…'
                              : (view.status||'').toLowerCase() === 'done'
                                ? '↩ Revert to Ongoing'
                                : '↩ Undo check-in'}
                          </button>
                        )}

                        {revertNote && (
                          <span style={{fontSize:10.5,fontWeight:600,color:'#15803d',textAlign:'right',lineHeight:1.45}}>
                            {revertNote}
                          </span>
                        )}
                        {revertError && (
                          <span style={{fontSize:10.5,fontWeight:600,color:'#b91c1c',textAlign:'right',lineHeight:1.45}}>
                            {revertError}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{height:1,background:'rgba(30,58,64,0.1)',margin:'14px 0'}}/>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                      <div>
                        <p className="bill-sec-title">Client</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:14,fontWeight:700,color:'#1f2937'}}><IUserSm/>{view.clientName}</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:12.5,color:'#6b7280',marginTop:4}}><IPhone/>{view.clientPhone}</p>
                      </div>
                      <div>
                        <p className="bill-sec-title">Appointment</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#374151',fontWeight:600}}><IClock/>{fmtDateLong(view.date)} · {view.timeSlot}</p>
                        <p style={{display:'flex',alignItems:'center',gap:6,fontSize:12.5,color:'#6b7280',marginTop:4}}><ILoc/>{view.location}{view.provider?` · ${view.provider}`:''}</p>
                        <p style={{fontSize:11.5,color:'#9ca3af',marginTop:4}}>Booking: {bookingID || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {}
                  <div className="bill-card">
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}>
                      <p className="bill-sec-title" style={{marginBottom:0}}>Services</p>
                      <span className="badge b-pre">Read-only</span>
                      <div style={{flex:1}}/>
                      <span style={{fontSize:11,color:'#9ca3af'}}>From the booking — same service booked for several guests shows as one line. Services cannot be added or removed here</span>
                    </div>
                    <div style={{overflowX:'auto'}}>
                      <table className="item-tbl" style={{minWidth:680}}>
                        <thead>
                          <tr>
                            <th style={{width:'30%'}}>Item</th>
                            <th style={{width:60,textAlign:'center'}}>Qty</th>
                            <th style={{width:110,textAlign:'right'}}>Price</th>
                            <th style={{width:120,textAlign:'right'}}>Amount</th>
                            <th style={{width:'17%'}}>Main Technician</th>
                            <th style={{width:'18%'}}>Supporters</th>
                          </tr>
                        </thead>
                        <tbody>
                          {servicesLoading && shownServices.length === 0 ? (
                            <tr><td colSpan={6} style={{color:'#9ca3af',fontSize:12,padding:'14px 5px'}}>Loading services…</td></tr>
                          ) : shownServices.map(svc=>(
                            <tr key={svc.key}>
                              <td style={{fontWeight:600}}>
                                {svc.name}
                                {svc.guestCount > 1 && (
                                  <span className="badge b-pre" style={{marginLeft:6}}>{svc.guestCount} guests</span>
                                )}
                                {svc.guestCount > 1 && svc.guessIDs.length > 0 && (
                                  <small style={{display:'block',color:'#9ca3af',fontSize:10.5,fontWeight:500}}>
                                    Guests: {svc.guessIDs.join(', ')}
                                  </small>
                                )}
                              </td>
                              <td style={{textAlign:'center',fontWeight:700,fontSize:13}}>{svc.qty}</td>
                              <td style={{textAlign:'right'}}>{fmtMoney(svc.price)}</td>
                              <td style={{textAlign:'right',fontWeight:700,color:'#1e3a40'}}>{fmtMoney(svc.qty*svc.price)}</td>
                              <td style={{color:'#374151',fontWeight:600}}>{svc.mainTech||'—'}</td>
                              <td style={{color:'#6b7280'}}>{svc.supporters||'—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {}
                  <div className="bill-card">
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}>
                      <p className="bill-sec-title" style={{marginBottom:0}}>Items</p>
                      <span className="badge b-ong">Editable</span>
                      <div style={{flex:1}}/>
                      <span style={{fontSize:11,color:'#9ca3af'}}>Materials the technician recorded are added here — add or remove lines freely</span>
                    </div>
                    <div style={{overflowX:'auto'}}>
                      <table className="item-tbl" style={{minWidth:800}}>
                        <thead>
                          <tr>
                            <th style={{width:'24%'}}>Item</th>
                            <th style={{width:72,textAlign:'center'}}>Qty</th>
                            <th style={{width:100,textAlign:'right'}}>Price</th>
                            <th style={{width:110,textAlign:'right'}}>Amount</th>
                            <th style={{width:'17%'}}>Sales by</th>
                            <th style={{width:'17%'}}>Supporters <span style={{fontWeight:400,color:'#9ca3af',fontSize:9,textTransform:'none'}}>(optional)</span></th>
                            <th style={{width:30}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 ? (
                            <tr><td colSpan={7} style={{color:'#9ca3af',fontSize:12,padding:'12px 5px'}}>No items on this bill yet — use the form below to add one.</td></tr>
                          ) : items.map(it=>(
                            <tr key={it.id}>
                              <td style={{fontWeight:600}}>
                                {it.name}
                                {it.material && <span className="badge b-pre" style={{marginLeft:6}}>Material</span>}
                              </td>
                              <td>
                                <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}>
                                  <button className="qty-btn" onClick={()=>updateQty(it.id,-1)}>–</button>
                                  <span style={{minWidth:14,textAlign:'center',fontWeight:700,fontSize:13}}>{it.qty}</span>
                                  <button className="qty-btn" onClick={()=>updateQty(it.id,1)}>+</button>
                                </div>
                              </td>
                              <td style={{textAlign:'right'}}>
                                <input className="inp-sm" type="number" min={0} value={it.price}
                                  onChange={e=>updateItemPrice(it.id,e.target.value)}
                                  style={{textAlign:'right',maxWidth:92}}/>
                              </td>
                              <td style={{textAlign:'right',fontWeight:700,color:'#1e3a40'}}>{fmtMoney(it.qty*it.price)}</td>
                              <td>
                                <select className="sel-sm" value={it.salesBy} onChange={e=>updateItemField(it.id,'salesBy',e.target.value)}>
                                  <option value="">{providersLoading ? 'Loading…' : '— Select —'}</option>
                                  {providerOptions(it.salesBy).map(p=><option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                              <td>
                                <SupporterPicker
                                  compact
                                  value={it.supporters}
                                  options={providerOptions(it.salesBy)}
                                  exclude={it.salesBy}
                                  onChange={next=>updateItemField(it.id,'supporters',next)}
                                />
                              </td>
                              <td style={{textAlign:'center'}}><button className="rm-btn" onClick={()=>removeItem(it.id)} title="Remove"><ITrash/></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(codeLessItems.length > 0 || codeLessServices.length > 0) && (
                      <p className="tax-warn" style={{marginTop:11}}>
                        {codeLessItems.length + codeLessServices.length} line
                        {codeLessItems.length + codeLessServices.length === 1 ? '' : 's'} here
                        {codeLessItems.length + codeLessServices.length === 1 ? ' has' : ' have'} no item code
                        {' '}({[...codeLessItems, ...codeLessServices].map(i => i.name).filter(Boolean).join(', ')}).
                        They are billed, but they cannot be written to tbl_billdetail — pick the item from the
                        suggestions so the line carries its item-master code.
                      </p>
                    )}
                    <div style={{display:'flex',gap:7,marginTop:14,flexWrap:'wrap',alignItems:'flex-end'}}>
                      {/* Item name — type to search tbl_itemmaster, pick to fill the price */}
                      <div ref={itemAnchorRef} style={{display:'flex',flexDirection:'column',gap:3,flex:'2 1 190px',minWidth:150,position:'relative'}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Item Name</label>
                        <input
                          className="add-row-inp"
                          placeholder="Type to search items…"
                          value={newName}
                          autoComplete="off"
                          onChange={e=>{ setNewName(e.target.value); setNewItemCode(''); setShowSuggest(true); setSuggestIndex(-1); setFormError(''); }}
                          onFocus={()=>{ if (itemOptions.length) setShowSuggest(true); }}
                          onBlur={()=>setTimeout(()=>setShowSuggest(false), 140)}
                          onKeyDown={e=>{
                            if (!showSuggest || itemOptions.length === 0) return;
                            if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIndex(i=>Math.min(i+1, itemOptions.length-1)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIndex(i=>Math.max(i-1, 0)); }
                            else if (e.key === 'Enter' && suggestIndex >= 0) { e.preventDefault(); pickItemOption(itemOptions[suggestIndex]); }
                            else if (e.key === 'Escape') { setShowSuggest(false); }
                          }}
                        />
                        <FloatingPanel
                          anchorRef={itemAnchorRef}
                          open={showSuggest && newName.trim().length >= 2 && !newItemCode}
                          className="suggest-pop"
                          preferredHeight={250}
                        >
                          {itemSearching && itemOptions.length === 0 ? (
                            <div className="suggest-empty">Searching item master…</div>
                          ) : itemOptions.length === 0 ? (
                            <div className="suggest-empty">No items matched “{newName.trim()}”</div>
                          ) : (
                            itemOptions.map((option, i) => (
                              <button
                                type="button"
                                key={option.code}
                                className={`suggest-item${i===suggestIndex?' active':''}`}
                                onMouseDown={e=>e.preventDefault()}
                                onClick={()=>pickItemOption(option)}
                              >
                                <span className="si-des">{option.des || option.code}</span>
                                {option.serviceItem && <span className="badge b-pre">Service</span>}
                                <span className="si-price">{fmtMoney(Number(option.retailPrice)||0)}</span>
                              </button>
                            ))
                          )}
                        </FloatingPanel>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 110px',minWidth:95}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>
                          Price (LKR){newItemCode && <span style={{color:'#15803d',marginLeft:4}}>· auto</span>}
                        </label>
                        <input className="add-row-inp" type="number" placeholder="0" value={newPrice} onChange={e=>setNewPrice(e.target.value)}/>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 120px',minWidth:105}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Sales by</label>
                        <select className="add-row-sel" value={newSalesBy} onChange={e=>setNewSalesBy(e.target.value)}>
                          <option value="">{providersLoading ? 'Loading…' : '— Select —'}</option>
                          {providerOptions(newSalesBy).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 150px',minWidth:130}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>Supporters <span style={{fontWeight:400,color:'#9ca3af'}}>(opt.)</span></label>
                        <div className="add-row-inp" style={{minHeight:34,display:'flex',alignItems:'center'}}>
                          <SupporterPicker
                            value={newSupporters}
                            options={providerOptions(newSalesBy)}
                            exclude={newSalesBy}
                            onChange={setNewSupporters}
                          />
                        </div>
                      </div>
                      <button onClick={addItem} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,border:'none',background:'#1e3a40',color:'#fff',fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0,height:36,alignSelf:'flex-end'}}>
                        <IPlus/> Add
                      </button>
                    </div>
                    {formError && (
                      <p style={{marginTop:8,fontSize:11.5,fontWeight:600,color:'#b91c1c'}}>{formError}</p>
                    )}
                  </div>

                  {}
                  <div className="bill-card">
                    <p className="bill-sec-title">Notes (optional)</p>
                    <textarea className="inp" style={{width:'100%',resize:'none',lineHeight:1.5}} rows={3} placeholder="Any remarks for this bill..." value={billNotes} onChange={e=>setBillNotes(e.target.value)}/>
                  </div>
                </div>

                {}
                <div className="bill-right" style={{width:300,flexShrink:0,position:'sticky',top:0}}>
                  <div className="bill-card" style={{display:'flex',flexDirection:'column',gap:0}}>
                    <p className="bill-sec-title">Payment Summary</p>
                    <div className="sum-row bold-row"><span>Gross</span><span>{fmtMoney(gross)}</span></div>
                    <div className="sum-row" style={{alignItems:'flex-start',flexDirection:'column',gap:6,paddingBottom:4}}>
                      <span style={{fontWeight:500}}>Discount</span>
                      <div style={{display:'flex',gap:6,width:'100%',alignItems:'center'}}>
                        <div style={{position:'relative',flex:1}}>
                          <input className="sum-inp" type="number" min={0} max={100} placeholder="0" value={discountPct} onChange={e=>{
                            const raw = e.target.value;
                            if (raw === '') { setDiscountPct(''); setDiscountAmt(''); setDiscountSource(''); return; }
                            const pct = clamp(Number(raw), 0, 100);
                            setDiscountPct(pct);
                            setDiscountSource('pct');
                            if (gross > 0) setDiscountAmt(Number((gross * pct / 100).toFixed(2)));
                            else setDiscountAmt('');
                          }} style={{width:'100%',paddingRight:22}}/>
                          <span style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9ca3af',pointerEvents:'none'}}>%</span>
                        </div>
                        <span style={{fontSize:11,color:'#9ca3af',flexShrink:0}}>or</span>
                        <div style={{flex:1}}>
                          <input className="sum-inp" type="number" min={0} placeholder="0.00" value={discountAmt} onChange={e=>{
                            const raw = e.target.value;
                            if (raw === '') { setDiscountPct(''); setDiscountAmt(''); setDiscountSource(''); return; }
                            const amt = clamp(Number(raw), 0, gross > 0 ? gross : Number(raw));
                            setDiscountAmt(amt);
                            setDiscountSource('amt');
                            if (gross > 0) setDiscountPct(Number(((amt / gross) * 100).toFixed(2)));
                            else setDiscountPct('');
                          }} style={{width:'100%'}}/>
                        </div>
                      </div>
                      {discAmt>0&&<div style={{display:'flex',justifyContent:'flex-end',width:'100%'}}><span style={{fontSize:11.5,color:'#b91c1c',fontWeight:600}}>– {fmtMoney(discAmt)}</span></div>}
                    </div>
                    <div className="sum-row divider bold-row"><span>Gross After Dis.</span><span>{fmtMoney(grossAfterDis)}</span></div>
                    {}
                    {taxesLoading ? (
                      <div className="sum-row" style={{color:'#9ca3af',fontSize:11.5}}><span>Loading taxes…</span><span>tbl_taxes</span></div>
                    ) : taxError ? (
                      <p className="tax-warn">{taxError}</p>
                    ) : taxLines.length === 0 ? (
                      <div className="sum-row" style={{color:'#9ca3af',fontSize:11.5}}>
                        <span>{taxRows.length === 0 ? 'No taxes enabled' : 'No taxes with a rate'}</span>
                        <span>tbl_taxes</span>
                      </div>
                    ) : (
                      <>
                        {taxLines.map(line=>(
                          <div
                            className="sum-row"
                            key={`tax-${line.code}-${line.stage}`}
                            title={`${line.label} — ${percentLabel(line.percentage)} of ${fmtMoney(line.base)} (tbl_taxes/${line.code})`}
                          >
                            <span style={{display:'flex',alignItems:'center',gap:6}}>
                              {line.label}
                              <span className="tax-pct">{percentLabel(line.percentage)}</span>
                            </span>
                            <span style={{fontWeight:600,color:'#1e3a40'}}>+ {fmtMoney(line.amount)}</span>
                          </div>
                        ))}
                        <p className="sum-note">Rates from tbl_taxes — enabled rows only.</p>
                      </>
                    )}
                    <div className="sum-row total-row"><span>Net Total</span><span>{fmtMoney(netTotal)}</span></div>
                    <div style={{height:1,background:'rgba(30,58,64,0.1)',margin:'14px 0 12px'}}/>

                    {}
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                      <p className="bill-sec-title" style={{marginBottom:0}}>Payments</p>
                      <span className="badge b-ong">{payments.length} method{payments.length===1?'':'s'}</span>
                    </div>

                    {payments.length === 0 ? (
                      <p style={{fontSize:11.5,color:'#9ca3af',marginBottom:10}}>
                        Pick a method below — split one bill across cash, card, online and vouchers.
                      </p>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:10}}>
                        {payments.map(p => (
                          <div key={p.id} className="pay-line">
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <select
                                className="pay-inp"
                                value={p.method}
                                aria-label="Payment method"
                                onChange={e=>setLineMethod(p.id, e.target.value as PayMethod)}
                              >
                                {PAY_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                              </select>
                              {vwTypesForMethod(p.method).length > 0 && (
                                <select
                                  className="pay-inp"
                                  value={p.type}
                                  aria-label="Payment type"
                                  onChange={e=>updatePayment(p.id,{ type: e.target.value })}
                                >
                                  {vwTypesForMethod(p.method).map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              )}
                              <input
                                className="pay-inp pay-amt"
                                type="number"
                                min={0}
                                placeholder="0.00"
                                aria-label="Amount"
                                value={p.amount}
                                onChange={e=>setLineAmount(p.id, e.target.value)}
                              />
                              <button className="rm-btn" type="button" onClick={()=>removePayment(p.id)} title="Remove payment"><ITrash/></button>
                            </div>
                            {/* What this line may still take. Cash has no limit —
                                that is where the change comes from. */}
                            {lineCap(p.id, p.method) !== null && (
                              <span className="pay-cap">
                                max {fmtMoney(lineCap(p.id, p.method) as number)} on this line
                                {p.method === 'cash' ? '' : ' — cash can take the rest'}
                              </span>
                            )}
                            {payCapNote[p.id] && (
                              <span className="pay-cap-note">{payCapNote[p.id]}</span>
                            )}
                            <input
                              className="pay-inp"
                              style={{marginTop:5}}
                              placeholder="Remark (optional) — e.g. ref no, last 4 digits"
                              aria-label="Payment remark"
                              value={p.remark}
                              onChange={e=>updatePayment(p.id,{ remark: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{display:'flex',gap:7,marginBottom:10,flexWrap:'wrap'}}>
                      {payModesLoading ? (
                        <span style={{fontSize:11,color:'#9ca3af',padding:'10px 0'}}>Loading payment modes…</span>
                      ) : Object.keys(vwGroups).length > 0 ? (
                        Object.keys(vwGroups).sort().map(group => (
                          <button key={group} className="pay-opt" type="button" onClick={()=>addPaymentFromGroup(group)} title={group}>
                            {payGroupIcon(group)}<span className="pay-opt-lbl">{group}</span>
                          </button>
                        ))
                      ) : (
                        <>
                          <button className="pay-opt" type="button" onClick={()=>addPayment('cash')}><ICash/><span className="pay-opt-lbl">Cash</span></button>
                          <button className="pay-opt" type="button" onClick={()=>addPayment('card')}><ICard/><span className="pay-opt-lbl">Card</span></button>
                          <button className="pay-opt" type="button" onClick={()=>addPayment('online')}><IOnline/><span className="pay-opt-lbl">Online</span></button>
                          <button className="pay-opt" type="button" onClick={()=>addPayment('voucher')}><ITicket/><span className="pay-opt-lbl">Voucher</span></button>
                        </>
                      )}
                    </div>
                    {Object.keys(vwGroups).length > 0 && (
                      <p style={{fontSize:10,color:'#9ca3af',marginTop:-4,marginBottom:8}}>Modes from Vw_PaymentModes (Tbl_PaymentModes + Tbl_PaymentGroup) — Enable=1, DoNotShowInSales=0.</p>
                    )}

                    <div className="sum-row" style={{paddingTop:2}}>
                      <span>Total Paid</span>
                      <span style={{fontWeight:700,color:'#1e3a40'}}>{fmtMoney(paidAmt)}</span>
                    </div>
                    <div className="sum-row" style={{fontWeight:700,fontSize:13}}>
                      <span>{remaining>0 ? 'Still to pay' : 'Balance'}</span>
                      <span style={{color: remaining>0 ? '#b91c1c' : balance>0 ? '#15803d' : '#1e3a40'}}>
                        {remaining>0 ? fmtMoney(remaining) : fmtMoney(Math.max(0, balance))}
                      </span>
                    </div>
                    {balance>0 && (
                      <p style={{marginTop:6,fontSize:11,fontWeight:600,color:'#15803d',textAlign:'center'}}>
                        Balance {fmtMoney(balance)} — give this back to the customer.
                      </p>
                    )}

                    {saveWarning && (
                      <div className="save-warn" role="alert">
                        {saveWarning}
                        {saveDetail && (
                          <span style={{display:'block',marginTop:5,fontWeight:500,wordBreak:'break-word'}}>
                            {saveDetail}
                          </span>
                        )}
                        {saveHint && (
                          <span style={{display:'block',marginTop:5,fontWeight:700,color:'#b45309'}}>
                            {saveHint}
                          </span>
                        )}
                        <span style={{display:'block',marginTop:6,fontWeight:500,color:'#7f1d1d'}}>
                          Your payment entries are still here — press Complete Payment again after fixing it,
                          or send this message to support.
                        </span>
                      </div>
                    )}

                    {!bookingIsDone && (
                      <p style={{marginTop:10,fontSize:11.5,fontWeight:700,color:'#b45309',textAlign:'center',lineHeight:1.5}}>
                        This booking is {statusLabel(view.status)} — the technician has to mark the work
                        <b> Done</b> again before the bill can be completed.
                      </p>
                    )}

                    <button
                      className="btn-primary"
                      style={{marginTop:12}}
                      onClick={()=>void completePayment()}
                      disabled={saving || paidAmt<=0 || !bookingIsDone}
                    >
                      {remaining>0
                        ? `Complete Partial Payment · ${fmtMoney(paidAmt)}`
                        : balance>0
                          ? `Complete Payment · ${fmtMoney(paidAmt)}`
                          : `Complete Payment · ${fmtMoney(netTotal)}`}
                    </button>
                    {remaining>0 && (
                      <p style={{marginTop:7,fontSize:11,fontWeight:600,color:'#b45309',textAlign:'center'}}>
                        LKR {remaining.toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2})} is still unpaid — the bill will be recorded as a partial payment.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="fade-up" style={{maxWidth:600,margin:'20px auto',display:'flex',flexDirection:'column',gap:14}}>
                <div className="bill-card no-print" style={{textAlign:'center',padding:'28px 18px'}}>
                  <div className="pop-in" style={{display:'flex',justifyContent:'center',marginBottom:10}}><ICheckBig/></div>
                  <p style={{fontSize:18,fontWeight:800,color:'#15803d'}}>Payment Successful</p>
                  <p style={{fontSize:12.5,color:'#6b7280',marginTop:4}}>
                    {billNo ? 'The bill was written to the system.' : 'Bill has been closed and payment recorded.'}
                  </p>
                  {billNo && (
                    <p className="bill-no" style={{marginTop:8}}>BILL NO · {billNo}</p>
                  )}
                  {changeDue > 0 && (
                    <p style={{marginTop:6,fontSize:13,fontWeight:800,color:'#15803d'}}>
                      Change · {fmtMoney(changeDue)}
                    </p>
                  )}
                </div>
                {skippedLines.length > 0 && (
                  <div className="bill-card no-print tax-warn">
                    Not written to tbl_billdetail (no item code): {skippedLines.join(', ')}. The money on this
                    receipt is correct — give those lines an item-master code next time.
                  </div>
                )}
                {saveWarning&&(
                  <div className="bill-card no-print" style={{border:'1px solid #fca5a5',background:'#fef2f2',color:'#991b1b',fontSize:12.5,fontWeight:600,lineHeight:1.5}}>
                    {saveWarning}
                    {saveDetail&&<span style={{display:'block',marginTop:5,fontWeight:500}}>{saveDetail}</span>}
                    {saveHint&&<span style={{display:'block',marginTop:5,fontWeight:700,color:'#b45309'}}>{saveHint}</span>}
                  </div>
                )}

                <div className="bill-card print-area" style={{fontFamily:"'Inter',sans-serif"}}>
                  <div style={{textAlign:'center',marginBottom:14}}>
                    <p style={{fontSize:17,fontWeight:800,color:'#1e3a40'}}>SAYO SALON</p>
                    <p style={{fontSize:11,color:'#6b7280'}}>Official Receipt</p>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#374151',marginBottom:10}}>
                    <span>Bill No: <b>{billNo || '—'}</b></span>
                    <span>{fmtDateLong(view.date)} · {paidAt}</span>
                  </div>
                  <div style={{fontSize:12.5,color:'#374151',marginBottom:10,lineHeight:1.6}}>
                    <div><b>Client:</b> {view.clientName} ({view.clientPhone})</div>
                    <div><b>Location:</b> {view.location} · Booking {bookingID || '—'}</div>
                  </div>

                  <p className="bill-sec-title" style={{marginBottom:6}}>Services</p>
                  <table className="item-tbl">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{textAlign:'center'}}>Qty</th>
                        <th style={{textAlign:'right'}}>Amount</th>
                        <th>Main Technician</th>
                        <th>Supporters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownServices.map(svc=>(
                        <tr key={`rcpt-svc-${svc.key}`}>
                          <td>{svc.name}</td>
                          <td style={{textAlign:'center'}}>{svc.qty}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(svc.qty*svc.price)}</td>
                          <td style={{fontSize:11,color:'#374151'}}>{svc.mainTech||'—'}</td>
                          <td style={{fontSize:11,color:'#6b7280'}}>{svc.supporters||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {items.length>0&&(
                    <>
                      <p className="bill-sec-title" style={{margin:'12px 0 6px'}}>Items</p>
                      <table className="item-tbl">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th style={{textAlign:'center'}}>Qty</th>
                            <th style={{textAlign:'right'}}>Amount</th>
                            <th>Sales by</th>
                            <th>Supporters</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(it=>(
                            <tr key={`rcpt-item-${it.id}`}>
                              <td>{it.name}</td>
                              <td style={{textAlign:'center'}}>{it.qty}</td>
                              <td style={{textAlign:'right'}}>{fmtMoney(it.qty*it.price)}</td>
                              <td style={{fontSize:11,color:'#374151'}}>{it.salesBy||'—'}</td>
                              <td style={{fontSize:11,color:'#6b7280'}}>{it.supporters||'—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  <div style={{height:1,background:'rgba(30,58,64,0.15)',margin:'10px 0'}}/>
                  <div className="sum-row"><span>Gross</span><span>{fmtMoney(gross)}</span></div>
                  {discAmt>0&&<div className="sum-row"><span>Discount</span><span style={{color:'#b91c1c'}}>– {fmtMoney(discAmt)}</span></div>}
                  {discAmt>0&&<div className="sum-row"><span>Gross After Dis.</span><span>{fmtMoney(grossAfterDis)}</span></div>}
                  {taxLines.map(line=>(
                    <div className="sum-row" key={`rcpt-tax-${line.code}-${line.stage}`}>
                      <span>{line.label} ({percentLabel(line.percentage)})</span>
                      <span>+ {fmtMoney(line.amount)}</span>
                    </div>
                  ))}
                  <div className="sum-row total-row"><span>Net Total</span><span>{fmtMoney(netTotal)}</span></div>
                  <div className="sum-row"><span>Paid Amount</span><span>{fmtMoney(paidAmt)}</span></div>
                  {remaining>0 ? (
                    <div className="sum-row" style={{fontWeight:700}}>
                      <span>Balance Due</span>
                      <span style={{color:'#b91c1c'}}>{fmtMoney(remaining)}</span>
                    </div>
                  ) : (
                    <div className="sum-row" style={{fontWeight:700}}>
                      <span>Balance</span>
                      <span style={{color: balance>0 ? '#15803d' : '#1e3a40'}}>{fmtMoney(Math.max(0, balance))}</span>
                    </div>
                  )}
                  {balance>0 && (
                    <p style={{fontSize:11.5,color:'#15803d',fontWeight:600,marginTop:6}}>
                      Balance {fmtMoney(balance)} returned to the customer.
                    </p>
                  )}
                  {payments.length > 0 && (
                    <>
                      <p className="bill-sec-title" style={{margin:'12px 0 6px'}}>Payment</p>
                      <table className="item-tbl">
                        <thead>
                          <tr>
                            <th>Method</th>
                            <th style={{textAlign:'right'}}>Amount</th>
                            <th>Remark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments
                            .filter(p => (Number(p.amount) || 0) > 0)
                            .map(p => (
                              <tr key={`rcpt-pay-${p.id}`}>
                                <td style={{fontSize:11.5,color:'#374151'}}>{paymentLabel(p)}</td>
                                <td style={{textAlign:'right',fontSize:11.5,fontWeight:700}}>{fmtMoney(Number(p.amount) || 0)}</td>
                                <td style={{fontSize:11,color:'#6b7280'}}>{p.remark || '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {billNotes&&<p style={{fontSize:11.5,color:'#9ca3af',marginTop:8,fontStyle:'italic'}}>"{billNotes}"</p>}
                  <p style={{textAlign:'center',fontSize:11,color:'#9ca3af',marginTop:16}}>Thank you for visiting us!</p>
                </div>
                <div className="no-print" style={{display:'flex',gap:10}}>
                  <button className="btn-ghost" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={handlePrint}><IPrinter/> Print Receipt</button>
                  <button className="btn-primary" style={{flex:1}} onClick={()=>router.push('/billing/dashboard')}>Back to Billing Dashboard</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

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
