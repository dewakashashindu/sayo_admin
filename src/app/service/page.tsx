'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface LocationDetail {
  locCode:         string;
  locName:         string;
  enable:          boolean;
  locStockBalance: number;
  salesMargin:     number;
  retailPrice:     number;
  wsPrice:         number;
}

interface Item {
  id:               number;
  locCode:          string;
  itemCode:         string;
  serviceItem:      boolean;
  itemDes:          string;
  itemPrintDes:     string;
  masterUnitID:     string;
  category1:        string;
  category2:        string;
  category3:        string;
  category4:        string;
  supID:            string;
  rol:              number;
  roq:              number;
  minQty:           number;
  maxQty:           number;
  rawCost:          number;
  costMarkup:       number;
  salesMargin:      number;
  stockBalance:     number;
  expiryItem:       boolean;
  retailPrice:      number;
  wsApp:            boolean;
  wsQty:            number;
  wsPrice:          number;
  packedItem:       boolean;
  packSize:         number;
  packPrice:        number;
  semiFinishedProd: boolean;
  itemPic:          string | null;
  createDate:       string;
  createBy:         string;
  updDate:          string;
  updBy:            string;
  enable:           boolean;
  locationDetails:  LocationDetail[];
}

interface MasterOpt { code: string; name?: string; des?: string; id?: string; }
interface SubUnit   { id: string; des: string; }
interface RawItem   { code: string; des: string; unit: string; cost: number; }

interface RecipeRow {
  menuItmID:    string;
  rowItemCode:  string;
  rowItemDes:   string;
  masterUnitID: string;
  subUnitID:    string;
  qty:          number;
  locCode:      string;
  itemCost:     number;
  isNew?:       boolean;
}

function emptyItem(nextId: number): Item {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: nextId, locCode: '01',
    itemCode: `ITM-${String(nextId).padStart(3, '0')}`,
    serviceItem: false, itemDes: '', itemPrintDes: '',
    masterUnitID: 'UNT03',
    category1: '', category2: '', category3: '', category4: '',
    supID: '', rol: 0, roq: 0, minQty: 0, maxQty: 0,
    rawCost: 0, costMarkup: 0, salesMargin: 0, stockBalance: 0,
    expiryItem: false, retailPrice: 0,
    wsApp: false, wsQty: 0, wsPrice: 0,
    packedItem: false, packSize: 0, packPrice: 0,
    semiFinishedProd: false, itemPic: null,
    createDate: today, createBy: 'ADMIN',
    updDate: today, updBy: 'ADMIN', enable: true,
    locationDetails: [],
  };
}

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:none; }
  }
  .fade-up { animation:fadeUp 0.2s ease both; }

  @keyframes spin { to { transform:rotate(360deg); } }
  .spinner {
    display:inline-block; width:14px; height:14px;
    border:2px solid rgba(255,255,255,0.35);
    border-top-color:#fff; border-radius:50%;
    animation:spin 0.65s linear infinite; flex-shrink:0;
  }
  .spinner.dark { border-color:rgba(30,58,64,0.2); border-top-color:#1e3a40; }

  @keyframes toastIn {
    from { opacity:0; transform:translateX(-50%) translateY(16px); }
    to   { opacity:1; transform:translateX(-50%) translateY(0); }
  }
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
    background:#fff; outline:none;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .frm-input:focus      { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:read-only  { background:#f3f6f6; color:#6b7280; cursor:default; }
  .frm-input:disabled   { background:#f3f6f6; color:#9ca3af; cursor:not-allowed; }

  .frm-select {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 28px 0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;
    appearance:none; -webkit-appearance:none; outline:none; cursor:pointer;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .frm-select:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

  .card {
    background:#fff; border:1.5px solid #d8e4e6;
    border-radius:14px; overflow:hidden;
    box-shadow:0 1px 4px rgba(30,58,64,0.06);
  }
  .card-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:10px 16px; display:flex; align-items:center; gap:8px;
  }
  .card-hdr-title {
    color:#fff; font-size:11.5px; font-weight:700;
    letter-spacing:0.07em; text-transform:uppercase; flex:1;
  }
  .card-hdr-badge {
    background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.9);
    font-size:10px; font-weight:700; padding:2px 9px;
    border-radius:99px; letter-spacing:0.04em;
  }
  .card-body { padding:16px; }

  .frm-label {
    font-size:10.5px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.06em;
    margin-bottom:4px; display:block;
  }

  /* FLAGS */
  .flags-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .flag-card {
    position:relative; border-radius:12px;
    border:1.5px solid #e5eded; background:#fafbfc;
    overflow:hidden; transition:all 0.2s ease;
  }
  .flag-card.is-on { border-color:var(--fc,#1e3a40); background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.07); }
  .flag-card::before {
    content:''; position:absolute; left:0; top:0; bottom:0; width:3px;
    background:var(--fc,#d1d9da); transition:background 0.2s;
  }
  .flag-card.is-on::before { background:var(--fc,#1e3a40); }
  .flag-card-inner { padding:12px 14px 12px 17px; }
  .flag-toggle-row { display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none; }
  .flag-switch { position:relative; width:36px; height:20px; flex-shrink:0; }
  .flag-switch-track { width:36px; height:20px; border-radius:10px; background:#d1d9da; transition:background 0.2s; }
  .flag-switch-track.on { background:var(--fc,#1e3a40); }
  .flag-switch-thumb {
    position:absolute; top:3px; left:3px; width:14px; height:14px;
    border-radius:50%; background:#fff; transition:transform 0.2s;
    box-shadow:0 1px 3px rgba(0,0,0,0.2);
  }
  .flag-switch-thumb.on { transform:translateX(16px); }
  .flag-info { flex:1; min-width:0; }
  .flag-title { font-size:12.5px; font-weight:700; color:#374151; line-height:1.2; transition:color 0.2s; }
  .flag-title.on { color:var(--fc,#1e3a40); }
  .flag-subtitle { font-size:10.5px; color:#9ca3af; margin-top:1px; font-weight:500; }
  .flag-status-dot { width:8px; height:8px; border-radius:50%; background:#d1d9da; flex-shrink:0; transition:background 0.2s; }
  .flag-status-dot.on { background:var(--fc,#16a34a); }
  .flag-sub-area { border-top:1px solid #f0f4f4; padding:10px 14px 12px 17px; background:#f8fafa; display:flex; flex-direction:column; gap:8px; }
  .flag-sub-label { font-size:9.5px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:3px; }
  .flag-sub-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:7px;
    padding:0 10px; height:32px; font-size:12.5px;
    font-family:'Inter',sans-serif; color:#1f2937; background:#fff; outline:none;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .flag-sub-input:focus { border-color:var(--fc,#1e3a40); box-shadow:0 0 0 2px rgba(30,58,64,0.08); }
  .flag-sub-input:disabled { background:#f3f6f6; color:#9ca3af; cursor:not-allowed; }

  /* BUTTONS */
  .btn-save {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 24px; height:40px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25);
  }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); box-shadow:0 4px 14px rgba(30,58,64,0.35); }
  .btn-save:disabled { background:#9ca3af; cursor:not-allowed; }
  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover:not(:disabled) { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }
  .btn-new:disabled { opacity:0.5; cursor:not-allowed; }
  .btn-del {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-del:hover:not(:disabled) { background:#fee2e2; border-color:#f87171; transform:translateY(-1px); }
  .btn-del:disabled { opacity:0.5; cursor:not-allowed; }
  .btn-clear {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-clear:hover { background:#e5e7eb; transform:translateY(-1px); }
  .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-print:hover { background:#e0f2fe; transform:translateY(-1px); }

  .srv-list-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s;
    border:none; background:transparent; width:100%;
    text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }

  .badge-active   { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-cat      { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:rgba(30,58,64,0.08);color:#1e3a40; }

  .loc-grid-wrap { overflow-x:auto; border-radius:10px; border:1.5px solid #e5e7eb; }
  .loc-grid { width:100%; border-collapse:collapse; font-family:'Inter',sans-serif; font-size:13px; }
  .loc-grid thead tr { background:linear-gradient(90deg,#1e3a40,#2a5260); }
  .loc-grid thead th { padding:10px 12px; text-align:left; color:rgba(255,255,255,0.9); font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap; }
  .loc-grid tbody tr { border-bottom:1px solid #f0f4f4; transition:background 0.1s; }
  .loc-grid tbody tr:last-child { border-bottom:none; }
  .loc-grid tbody tr:hover { background:#f7fafa; }
  .loc-grid tbody td { padding:8px 10px; vertical-align:middle; }
  .loc-grid-input {
    width:100%; min-width:90px; border:1.5px solid #d1d9da; border-radius:6px;
    padding:0 8px; height:31px; font-size:12px;
    font-family:'Inter',sans-serif; color:#1f2937; background:#fff; outline:none;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .loc-grid-input:focus     { border-color:#1e3a40; box-shadow:0 0 0 2px rgba(30,58,64,0.08); }
  .loc-grid-input:read-only { background:#f3f6f6; color:#6b7280; cursor:default; }

  .quick-nav { display:flex; gap:6px; flex-wrap:wrap; padding:10px 14px; background:#fff; border-bottom:1px solid #e5e7eb; flex-shrink:0; }
  .quick-nav-btn {
    padding:5px 12px; border-radius:7px; border:1.5px solid #d8e4e6;
    background:#f7fafa; color:#1e3a40; font-family:'Inter',sans-serif;
    font-size:11px; font-weight:700; cursor:pointer; transition:all 0.15s;
    white-space:nowrap; display:flex; align-items:center; gap:5px;
  }
  .quick-nav-btn:hover { background:#1e3a40; color:#fff; border-color:#1e3a40; }

  .panel-tabs { display:flex; gap:0; flex-shrink:0; background:#1e3a40; padding:0 16px; }
  .panel-tab {
    padding:10px 22px; font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    color:rgba(255,255,255,0.55); border:none; background:transparent; cursor:pointer;
    border-bottom:3px solid transparent; transition:all 0.15s; letter-spacing:0.02em;
    display:flex; align-items:center; gap:7px;
  }
  .panel-tab:hover  { color:rgba(255,255,255,0.85); }
  .panel-tab.active { color:#fff; border-bottom-color:#7dd3c8; }

  /* RECIPE TABLE */
  .rcp-wrap  { border-radius:12px; border:1.5px solid #e5e7eb; overflow:hidden; }
  .rcp-table { width:100%; border-collapse:collapse; font-family:'Inter',sans-serif; font-size:13px; }
  .rcp-table thead tr { background:linear-gradient(90deg,#1e3a40,#2a5260); }
  .rcp-table thead th { padding:10px 12px; text-align:left; color:rgba(255,255,255,0.85); font-size:10.5px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; white-space:nowrap; }
  .rcp-table tbody tr { border-bottom:1px solid #f0f4f4; transition:background 0.1s; }
  .rcp-table tbody tr:last-child { border-bottom:none; }
  .rcp-table tbody tr:hover { background:#f7fafa; }
  .rcp-table tbody td { padding:6px 8px; vertical-align:middle; }
  .rcp-input {
    width:100%; border:1.5px solid #e2e8f0; border-radius:7px;
    padding:0 9px; height:32px; font-size:12.5px;
    font-family:'Inter',sans-serif; color:#1f2937; background:#fff; outline:none;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .rcp-input:focus     { border-color:#1e3a40; box-shadow:0 0 0 2px rgba(30,58,64,0.08); }
  .rcp-input:read-only { background:#f8fafa; color:#6b7280; cursor:default; }
  .rcp-input:disabled  { background:#f3f6f6; color:#9ca3af; }
  .rcp-btn-add {
    display:inline-flex; align-items:center; gap:7px; padding:0 18px; height:36px;
    border-radius:8px; background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer; transition:background 0.15s;
  }
  .rcp-btn-add:hover { background:#162e34; }
  .rcp-btn-remove {
    display:inline-flex; align-items:center; justify-content:center;
    width:28px; height:28px; border-radius:7px; flex-shrink:0;
    background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5;
    cursor:pointer; transition:all 0.15s;
  }
  .rcp-btn-remove:hover { background:#fecaca; border-color:#f87171; }

  /* AUTOCOMPLETE */
  .ac-wrap { position:relative; }
  .ac-dropdown {
    position:absolute; top:calc(100% + 4px); left:0; right:0;
    background:#fff; border:1.5px solid #1e3a40; border-radius:9px;
    box-shadow:0 8px 24px rgba(30,58,64,0.18);
    z-index:9999; max-height:220px; overflow-y:auto; font-family:'Inter',sans-serif;
  }
  .ac-item {
    display:flex; align-items:center; gap:10px; padding:8px 12px;
    cursor:pointer; transition:background 0.1s; border-bottom:1px solid #f0f4f4;
  }
  .ac-item:last-child { border-bottom:none; }
  .ac-item:hover, .ac-item.highlighted { background:rgba(30,58,64,0.07); }
  .ac-code { font-size:11px; font-weight:800; color:#1e3a40; background:rgba(30,58,64,0.08); padding:2px 7px; border-radius:5px; white-space:nowrap; flex-shrink:0; }
  .ac-des  { font-size:12px; color:#374151; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ac-cost { font-size:11px; color:#6b7280; font-weight:600; margin-left:auto; white-space:nowrap; flex-shrink:0; }
  .ac-empty { padding:12px; text-align:center; font-size:12px; color:#9ca3af; font-style:italic; }

  @media(max-width:767px) {
    .left-panel { display:none !important; }
    .flags-grid { grid-template-columns:1fr 1fr !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const IBell    = ({s=21}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const ISearch  = ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IChevD   = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IPlus    = ({s=16}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ITrash   = ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IPrint   = ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const ISave    = ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IRefresh = ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>;
const ITag     = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const IArchive = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>;
const ILayers  = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>;
const IDollar  = ({s=14}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const IBox     = ({s=20}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const IMapPin  = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IFlag    = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
const IFlask   = ({s=14}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6"/><path d="M10 3v6l-4 9a1 1 0 0 0 .9 1.45h10.2A1 1 0 0 0 18 18l-4-9V3"/></svg>;
const IImage   = ({s=13}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function FieldRow({ label, htmlFor, children }: {
  label: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label className="frm-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function Card({ id, title, icon, badge, children }: {
  id?: string; title: string; icon?: React.ReactNode;
  badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="card" id={id}>
      <div className="card-hdr">
        {icon && <span style={{ color:'rgba(255,255,255,0.7)', display:'flex' }}>{icon}</span>}
        <span className="card-hdr-title">{title}</span>
        {badge && <span className="card-hdr-badge">{badge}</span>}
      </div>
      <div className="card-body">{children}</div>
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

/* ─────────────────────────────────────────
   FLAG DEFINITIONS & CARD
───────────────────────────────────────── */
interface FlagDef {
  key:       keyof Item;
  label:     string;
  subtitle:  string;
  color:     string;
  subInputs?: { label: string; field: keyof Item }[];
}

const FLAG_DEFS: FlagDef[] = [
  { key:'serviceItem',      label:'Service Item',      subtitle:'Non-physical / service-based',  color:'#7c3aed' },
  { key:'enable',           label:'Enable',            subtitle:'Item is active & visible',      color:'#16a34a' },
  {
    key:'wsApp', label:'Wholesale Pricing', subtitle:'Wholesale rate applicable', color:'#0369a1',
    subInputs:[{ label:'WS Qty', field:'wsQty' },{ label:'WS Price', field:'wsPrice' }],
  },
  { key:'expiryItem',       label:'Expiry Tracking',   subtitle:'Track expiration dates',        color:'#b45309' },
  {
    key:'packedItem', label:'Packing Details', subtitle:'Has pack size & price', color:'#0f766e',
    subInputs:[{ label:'Pack Size', field:'packSize' },{ label:'Pack Price', field:'packPrice' }],
  },
  { key:'semiFinishedProd', label:'Production',        subtitle:'Semi-finished product',         color:'#be185d' },
];

function FlagsCard({ item, onChange }: {
  item: Item;
  onChange: <K extends keyof Item>(key: K, val: Item[K]) => void;
}) {
  const activeCount = FLAG_DEFS.filter(f => Boolean(item[f.key])).length;
  return (
    <Card id="sec-flags" title="Flags" icon={<IFlag s={13}/>} badge={`${activeCount} / ${FLAG_DEFS.length} active`}>
      <div className="flags-grid">
        {FLAG_DEFS.map(def => {
          const isOn = Boolean(item[def.key]);
          return (
            <div
              key={String(def.key)}
              className={`flag-card ${isOn ? 'is-on' : ''}`}
              style={{ '--fc': def.color } as React.CSSProperties}
            >
              <div className="flag-card-inner">
                <div
                  className="flag-toggle-row"
                  role="checkbox" aria-checked={isOn} tabIndex={0}
                  onClick={() => onChange(def.key, !isOn as Item[typeof def.key])}
                  onKeyDown={e => {
                    if (e.key==='Enter'||e.key===' ') {
                      e.preventDefault(); e.stopPropagation();
                      onChange(def.key, !isOn as Item[typeof def.key]);
                    }
                  }}
                >
                  <div className="flag-switch">
                    <div className={`flag-switch-track ${isOn?'on':''}`}/>
                    <div className={`flag-switch-thumb ${isOn?'on':''}`}/>
                  </div>
                  <div className="flag-info">
                    <div className={`flag-title ${isOn?'on':''}`}>{def.label}</div>
                    <div className="flag-subtitle">{def.subtitle}</div>
                  </div>
                  <div className={`flag-status-dot ${isOn?'on':''}`}/>
                </div>
              </div>
              {def.subInputs && (
                <div className="flag-sub-area">
                  {def.subInputs.map(inp => (
                    <div key={String(inp.field)}>
                      <label className="flag-sub-label">{inp.label}</label>
                      <input
                        className="flag-sub-input"
                        type="number" min={0}
                        value={item[inp.field] as number}
                        disabled={!isOn}
                        style={{ '--fc': def.color } as React.CSSProperties}
                        onChange={e => onChange(inp.field, Number(e.target.value) as Item[typeof inp.field])}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────
   AUTOCOMPLETE
───────────────────────────────────────── */
function ItemCodeAC({ value, rawItems, onSelect, onChange }: {
  value: string; rawItems: RawItem[];
  onSelect: (item: RawItem) => void;
  onChange: (val: string) => void;
}) {
  const [open,  setOpen]  = useState(false);
  const [hiIdx, setHiIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    const q = value.trim().toUpperCase();
    return rawItems
      .filter(it => it.code.toUpperCase().includes(q) || it.des.toUpperCase().includes(q))
      .slice(0, 10);
  }, [value, rawItems]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key==='ArrowDown') { e.preventDefault(); setHiIdx(h=>Math.min(h+1,suggestions.length-1)); }
    else if (e.key==='ArrowUp') { e.preventDefault(); setHiIdx(h=>Math.max(h-1,0)); }
    else if (e.key==='Enter') {
      e.preventDefault(); e.stopPropagation();
      if (suggestions[hiIdx]) { onSelect(suggestions[hiIdx]); setOpen(false); }
    } else if (e.key==='Escape') setOpen(false);
  }

  return (
    <div className="ac-wrap" ref={wrapRef}>
      <input
        className="rcp-input"
        style={{ minWidth:120, textTransform:'uppercase' }}
        value={value}
        placeholder="Item Code"
        onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true); setHiIdx(0); }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <div className="ac-dropdown">
          {suggestions.map((it,i) => (
            <div
              key={it.code}
              className={`ac-item ${i===hiIdx?'highlighted':''}`}
              onMouseDown={() => { onSelect(it); setOpen(false); }}
              onMouseEnter={() => setHiIdx(i)}
            >
              <span className="ac-code">{it.code}</span>
              <span className="ac-des">{it.des}</span>
              <span className="ac-cost">LKR {it.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {open && value.trim().length > 0 && suggestions.length === 0 && (
        <div className="ac-dropdown">
          <div className="ac-empty">No items match &ldquo;{value}&rdquo;</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   LOCATION GRID
───────────────────────────────────────── */
function LocationGrid({ rows, onChange }: {
  rows: LocationDetail[]; onChange: (u: LocationDetail[]) => void;
}) {
  function updRow(idx: number, key: keyof LocationDetail, val: LocationDetail[keyof LocationDetail]) {
    onChange(rows.map((r,i) => i===idx ? { ...r,[key]:val } : r));
  }
  if (rows.length===0)
    return <p style={{ color:'#9ca3af',fontSize:13,padding:'16px 0',textAlign:'center' }}>No location rows found.</p>;
  return (
    <div className="loc-grid-wrap">
      <table className="loc-grid">
        <thead>
          <tr>
            <th>Loc Code</th><th>Location Name</th>
            <th style={{ textAlign:'center' }}>Enable</th>
            <th>Stock Balance</th><th>Sales Margin %</th>
            <th>Retail Price</th><th>WS Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row,idx) => (
            <tr key={row.locCode}>
              <td><input className="loc-grid-input" value={row.locCode} readOnly style={{ minWidth:70,fontWeight:700 }}/></td>
              <td><input className="loc-grid-input" value={row.locName} readOnly style={{ minWidth:130 }}/></td>
              <td style={{ textAlign:'center' }}>
                <div
                  style={{ display:'flex',justifyContent:'center',cursor:'pointer' }}
                  role="checkbox" aria-checked={row.enable} tabIndex={0}
                  onClick={()=>updRow(idx,'enable',!row.enable)}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();updRow(idx,'enable',!row.enable);} }}
                >
                  <div style={{ width:20,height:20,borderRadius:5,border:`2px solid ${row.enable?'#1e3a40':'#9ca3af'}`,background:row.enable?'#1e3a40':'#fff',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s' }}>
                    {row.enable&&<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                </div>
              </td>
              <td><input className="loc-grid-input" type="number" value={row.locStockBalance} onChange={e=>updRow(idx,'locStockBalance',Number(e.target.value))} min={0} style={{ minWidth:100 }}/></td>
              <td><input className="loc-grid-input" type="number" value={row.salesMargin}     onChange={e=>updRow(idx,'salesMargin',    Number(e.target.value))} min={0} style={{ minWidth:100 }}/></td>
              <td><input className="loc-grid-input" type="number" value={row.retailPrice}     onChange={e=>updRow(idx,'retailPrice',    Number(e.target.value))} min={0} style={{ minWidth:100 }}/></td>
              <td><input className="loc-grid-input" type="number" value={row.wsPrice}         onChange={e=>updRow(idx,'wsPrice',        Number(e.target.value))} min={0} style={{ minWidth:100 }}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────
   RECIPE GRID  ← KEY FIX HERE
───────────────────────────────────────── */
function RecipeGrid({ rows, rawItems, subUnits, onChange, menuItmID, defaultLocCode }: {
  rows: RecipeRow[]; rawItems: RawItem[]; subUnits: SubUnit[];
  onChange: (r: RecipeRow[]) => void;
  menuItmID: string; defaultLocCode: string;
}) {
  /* ✅ FIX: normalize both sides before comparing */
  function findRaw(code: string): RawItem | undefined {
    const q = code.trim().toUpperCase().replace(/\s+/g,'');
    return rawItems.find(it => it.code.trim().toUpperCase().replace(/\s+/g,'') === q);
  }

  function updRow(idx: number, key: keyof RecipeRow, val: RecipeRow[keyof RecipeRow]) {
    onChange(rows.map((r,i) => {
      if (i!==idx) return r;
      const u = { ...r,[key]:val };
      if (key==='rowItemCode') {
        /* try exact match first, then partial */
        const exact = findRaw(String(val));
        if (exact) {
          u.rowItemDes   = exact.des;
          u.masterUnitID = exact.unit;
          u.itemCost     = exact.cost;
        }
        /* if no exact match yet, keep existing des (user still typing) */
      }
      return u;
    }));
  }

  /* Called when user picks from autocomplete dropdown */
  function selectItem(idx: number, it: RawItem) {
    onChange(rows.map((r,i) => i!==idx ? r : {
      ...r,
      rowItemCode:  it.code,
      rowItemDes:   it.des,
      masterUnitID: it.unit,
      itemCost:     it.cost,
    }));
  }

  function addRow() {
    onChange([...rows,{
      menuItmID, rowItemCode:'', rowItemDes:'',
      masterUnitID:'', subUnitID:'', qty:1,
      locCode:defaultLocCode, itemCost:0, isNew:true,
    }]);
  }

  const totalCost = rows.reduce((s,r) => s + Number(r.qty)*Number(r.itemCost), 0);

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
      <div className="rcp-wrap">
        <table className="rcp-table">
          <thead>
            <tr>
              <th style={{ width:36 }}>#</th>
              <th style={{ minWidth:160 }}>Item Code</th>
              <th style={{ minWidth:200 }}>Description</th>
              <th style={{ minWidth:120 }}>Sub Unit</th>
              <th style={{ minWidth:80  }}>Qty</th>
              <th style={{ minWidth:110 }}>Unit Cost</th>
              <th style={{ minWidth:110 }}>Line Total</th>
              <th style={{ width:40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr>
                <td colSpan={8} style={{ textAlign:'center',color:'#9ca3af',padding:'24px 0',fontSize:13 }}>
                  No ingredients yet — click <strong>+ Add Ingredient</strong> below.
                </td>
              </tr>
            )}
            {rows.map((row,idx) => (
              <tr key={idx}>
                <td style={{ color:'#9ca3af',fontSize:11,textAlign:'center',fontWeight:700 }}>{idx+1}</td>
                <td style={{ position:'relative' }}>
                  <ItemCodeAC
                    value={row.rowItemCode}
                    rawItems={rawItems}
                    onChange={val => updRow(idx,'rowItemCode',val)}
                    onSelect={it  => selectItem(idx,it)}
                  />
                </td>
                <td>
                  <input
                    className="rcp-input"
                    value={row.rowItemDes}
                    readOnly
                    placeholder="Auto-filled on select"
                    style={{
                      minWidth:190,
                      background: row.rowItemDes ? '#f0fdf4' : '#f8fafa',
                      color:      row.rowItemDes ? '#15803d' : '#9ca3af',
                      fontWeight: row.rowItemDes ? 600 : 400,
                    }}
                  />
                </td>
                <td>
                  <select
                    className="rcp-input frm-select"
                    style={{ minWidth:110,paddingRight:28 }}
                    value={row.subUnitID}
                    onChange={e => updRow(idx,'subUnitID',e.target.value)}
                  >
                    <option value="">-- Unit --</option>
                    {subUnits.map(u=><option key={u.id} value={u.id}>{u.des}</option>)}
                  </select>
                </td>
                <td>
                  <input className="rcp-input" type="number" min={0} style={{ minWidth:70 }}
                    value={row.qty} onChange={e=>updRow(idx,'qty',Number(e.target.value))}/>
                </td>
                <td>
                  <input className="rcp-input" type="number" min={0} style={{ minWidth:100 }}
                    value={row.itemCost} onChange={e=>updRow(idx,'itemCost',Number(e.target.value))}/>
                </td>
                <td>
                  <input className="rcp-input" readOnly
                    style={{ minWidth:100,background:'#f0f9ff',color:'#0369a1',fontWeight:700 }}
                    value={(Number(row.qty)*Number(row.itemCost)).toFixed(2)}/>
                </td>
                <td>
                  <button className="rcp-btn-remove"
                    onClick={()=>onChange(rows.filter((_,i)=>i!==idx))}
                    title="Remove">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap' }}>
        <button className="rcp-btn-add" onClick={addRow}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Ingredient
        </button>
        {rows.length>0 && (
          <div style={{ display:'flex',alignItems:'center',gap:16,background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',border:'1.5px solid #bbf7d0',borderRadius:10,padding:'10px 18px' }}>
            <div>
              <p style={{ fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em' }}>Ingredients</p>
              <p style={{ fontSize:15,fontWeight:800,color:'#15803d' }}>{rows.length}</p>
            </div>
            <div style={{ width:1,height:32,background:'#bbf7d0' }}/>
            <div>
              <p style={{ fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em' }}>Total Recipe Cost</p>
              <p style={{ fontSize:15,fontWeight:800,color:'#15803d' }}>LKR {totalCost.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   QUICK-NAV
───────────────────────────────────────── */
const SECTIONS = [
  { id:'sec-ident',      label:'Identification',  icon:<ITag s={11}/>     },
  { id:'sec-categories', label:'Categories',      icon:<IArchive s={11}/> },
  { id:'sec-flags',      label:'Flags',           icon:<IFlag s={11}/>    },
  { id:'sec-cost',       label:'Cost & Margin',   icon:<IDollar s={11}/>  },
  { id:'sec-reorder',    label:'Reorder & Stock', icon:<ILayers s={11}/>  },
  { id:'sec-locations',  label:'Locations',       icon:<IMapPin s={11}/>  },
  { id:'sec-image',      label:'Image',           icon:<IImage s={11}/>   },
];

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function ItemMasterPage() {
  const router  = useRouter();
  const [navKey, setNavKey] = useState('services');
  const [search, setSearch] = useState('');

  const [items,     setItems]     = useState<Item[]>([]);
  const [locations, setLocations] = useState<MasterOpt[]>([]);
  const [units,     setUnits]     = useState<MasterOpt[]>([]);
  const [suppliers, setSuppliers] = useState<MasterOpt[]>([]);
  const [category1, setCategory1] = useState<MasterOpt[]>([]);
  const [category2, setCategory2] = useState<MasterOpt[]>([]);
  const [category3, setCategory3] = useState<MasterOpt[]>([]);
  const [category4, setCategory4] = useState<MasterOpt[]>([]);

  const [current,  setCurrent]  = useState<Item>(emptyItem(0));
  const [isNew,    setIsNew]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [activeTab,      setActiveTab]      = useState<'details'|'recipe'>('details');
  const [allRecipes,     setAllRecipes]     = useState<RecipeRow[]>([]);
  const [rawItems,       setRawItems]       = useState<RawItem[]>([]);
  const [recipeRows,     setRecipeRows]     = useState<RecipeRow[]>([]);
  const [subUnits,       setSubUnits]       = useState<SubUnit[]>([]);
  const [recipeSaving,   setRecipeSaving]   = useState(false);
  const [recipeLocCodes, setRecipeLocCodes] = useState<string[]>([]);

  const nextIdRef    = useRef(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef      = useRef<HTMLDivElement>(null);
  const { toast, show: showToast } = useToast();

  const overallCost = useMemo(
    () => current.rawCost * (1 + current.costMarkup / 100),
    [current.rawCost, current.costMarkup],
  );

  const catDes = useCallback(
    (list: MasterOpt[], code: string) => list.find(c=>c.code===code)?.des ?? code,
    [],
  );

  /* ✅ FIX: stable primary loc (fixes useEffect size error) */
  const primaryLocCode = recipeLocCodes[0] ?? current.locCode;

  /* ════════════════════════════════════════
     LOAD ITEMS  ← KEY FIX: proper select after save
  ════════════════════════════════════════ */
  const loadItems = useCallback(async (
    selectKey?: { locCode: string; itemCode: string }
  ) => {
    setLoading(true);
    try {
      const res  = await fetch('/api/services');
      const json = await res.json() as {
        success: boolean; items: Item[];
        locations: MasterOpt[]; units: MasterOpt[]; suppliers: MasterOpt[];
        category1: MasterOpt[]; category2: MasterOpt[];
        category3: MasterOpt[]; category4: MasterOpt[];
      };
      if (!json.success) throw new Error('Failed');

      setItems(json.items);
      setLocations(json.locations);
      setUnits(json.units);
      setSuppliers(json.suppliers);
      setCategory1(json.category1);
      setCategory2(json.category2);
      setCategory3(json.category3);
      setCategory4(json.category4);

      nextIdRef.current = json.items.length > 0
        ? Math.max(...json.items.map(s=>s.id)) + 1 : 1;

      if (json.items.length > 0) {
        /* ✅ FIX: normalize comparison so saved item is always found */
        const target = selectKey
          ? json.items.find(i =>
              i.locCode.trim().toUpperCase()  === selectKey.locCode.trim().toUpperCase() &&
              i.itemCode.trim().toUpperCase() === selectKey.itemCode.trim().toUpperCase()
            ) ?? json.items[0]
          : json.items[0];

        setCurrent({ ...target });
        setIsNew(false);           // ✅ FIX: always set isNew=false after load
      } else {
        setCurrent(emptyItem(1));
        setIsNew(true);
      }
    } catch {
      showToast('Failed to load items', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  /* ════════════════════════════════════════
     LOAD RECIPE MASTER
     ✅ FIX: all items (not just non-service) returned as rawItems
  ════════════════════════════════════════ */
  const loadRecipeMaster = useCallback(async () => {
    try {
      const res  = await fetch('/api/recipes');
      const json = await res.json() as {
        success:  boolean;
        recipes:  Array<{
          menuItmID:string; rowItemCode:string; masterUnitID:string;
          subUnitID:string; qty:number; locCode:string; itemCost:number;
        }>;
        rawItems: RawItem[];
        subUnits: SubUnit[];
      };
      if (!json.success) return;

      const ri: RawItem[] = json.rawItems ?? [];
      setRawItems(ri);
      setSubUnits(json.subUnits ?? []);

      /* ✅ FIX: normalize codes on both sides during description lookup */
      setAllRecipes(
        (json.recipes ?? []).map(r => {
          const normalizedCode = r.rowItemCode.trim().toUpperCase();
          const found = ri.find(it => it.code.trim().toUpperCase() === normalizedCode);
          return {
            ...r,
            rowItemDes:   found?.des  ?? '',
            masterUnitID: found?.unit ?? r.masterUnitID,
            itemCost:     r.itemCost  !== 0 ? r.itemCost : (found?.cost ?? 0),
          };
        })
      );
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadRecipeMaster(); }, [loadRecipeMaster]);

  /* ── Filter recipes for current item ── */
  const loadRecipes = useCallback((menuItmID: string, locCode: string) => {
    if (!menuItmID) { setRecipeRows([]); return; }
    setRecipeRows(
      allRecipes
        .filter(r =>
          r.menuItmID.trim().toUpperCase() === menuItmID.trim().toUpperCase() &&
          r.locCode.trim().toUpperCase()   === locCode.trim().toUpperCase()
        )
        .map(r => ({ ...r }))
    );
  }, [allRecipes]);

  /* ✅ FIX: stable deps – primaryLocCode is a string, not an array */
  useEffect(() => {
    if (!isNew && current.itemCode)
      loadRecipes(current.itemCode, primaryLocCode);
    else
      setRecipeRows([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.itemCode, isNew, primaryLocCode, loadRecipes]);

  useEffect(() => {
    setRecipeLocCodes([current.locCode]);
  }, [current.locCode]);

  /* ── Save recipes ── */
  const handleSaveRecipes = useCallback(async () => {
    if (!current.itemCode || isNew) { showToast('Save item first', true); return; }
    if (recipeRows.length === 0)    { showToast('Add at least one ingredient', true); return; }
    if (recipeLocCodes.length === 0){ showToast('Select at least one location', true); return; }

    setRecipeSaving(true);
    try {
      const lines = recipeRows.map(r => ({
        rowItemCode: r.rowItemCode, masterUnitID: r.masterUnitID,
        subUnitID: r.subUnitID, qty: r.qty, itemCost: r.itemCost,
      }));
      await Promise.all(
        recipeLocCodes.map(lc =>
          fetch('/api/recipes', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ menuItmID:current.itemCode, lines:lines.map(l=>({...l,locCode:lc})) }),
          }).then(r=>r.json())
        )
      );
      showToast(`Recipe saved for ${recipeLocCodes.length} location(s) ✓`);
      await loadRecipeMaster();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Recipe save failed', true);
    } finally {
      setRecipeSaving(false);
    }
  }, [current.itemCode, isNew, recipeLocCodes, recipeRows, loadRecipeMaster, showToast]);

  /* ════════════════════════════════════════
     ITEM CRUD
  ════════════════════════════════════════ */
  const filtered = useMemo(() =>
    items.filter(it =>
      it.itemDes.toLowerCase().includes(search.toLowerCase()) ||
      it.itemCode.toLowerCase().includes(search.toLowerCase()) ||
      it.locCode.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

  const originalItem = useMemo(() =>
    isNew ? null : items.find(s=>s.id===current.id) ?? null,
    [items, current.id, isNew],
  );

  const isDirty = useMemo(() => {
    if (isNew) return current.itemDes.trim()!=='' || current.itemCode.trim()!=='';
    if (!originalItem) return false;
    return JSON.stringify(current) !== JSON.stringify(originalItem);
  }, [current, originalItem, isNew]);

  function confirmDiscard(msg: string) {
    if (!isDirty) return true;
    return confirm(msg);
  }

  function upd<K extends keyof Item>(key: K, val: Item[K]) {
    setCurrent(p => ({ ...p, [key]:val }));
  }
  function updLocDetail(updated: LocationDetail[]) {
    setCurrent(p => ({ ...p, locationDetails:updated }));
  }

  function handleNew() {
    if (!confirmDiscard('Discard changes and create new item?')) return;
    const id = nextIdRef.current++;
    setCurrent(emptyItem(id));
    setIsNew(true);
    document.getElementById('sec-ident')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function handleSelect(it: Item) {
    if (current.id===it.id && !isNew) return;
    if (!confirmDiscard('Discard changes?')) return;
    setCurrent({ ...it });
    setIsNew(false);
    document.getElementById('sec-ident')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  /* ✅ KEY FIX: handleSave – pass correct selectKey so form stays on saved item */
  const handleSave = useCallback(async () => {
    if (!current.itemDes.trim())           { showToast('Item Description is required', true); return; }
    if (isNew && !current.itemCode.trim()) { showToast('Item Code is required', true); return; }

    setSaving(true);

    /* Capture codes before async call */
    const savedLocCode  = current.locCode.trim();
    const savedItemCode = current.itemCode.trim().toUpperCase();

    try {
      const res = isNew
        ? await fetch('/api/services', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(current),
          })
        : await fetch(
            `/api/services/${encodeURIComponent(savedLocCode)}/${encodeURIComponent(savedItemCode)}`,
            { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(current) }
          );

      const json = await res.json() as { success:boolean; message?:string };
      if (!json.success) throw new Error(json.message ?? 'Save failed');

      showToast(isNew ? 'Item created ✓' : 'Saved ✓');

      /* ✅ FIX: pass named object so loadItems can find the right item */
      await loadItems({ locCode: savedLocCode, itemCode: savedItemCode });

    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  }, [current, isNew, loadItems, showToast]);

  async function handleDelete() {
    if (!current.itemCode || isNew) return;
    if (!confirm(`Delete "${current.itemDes}" (${current.itemCode})?\nCannot be undone.`)) return;
    setDeleting(true);
    try {
      const res  = await fetch(
        `/api/services/${encodeURIComponent(current.locCode)}/${encodeURIComponent(current.itemCode)}`,
        { method:'DELETE' }
      );
      const json = await res.json() as { success:boolean; message?:string };
      if (!json.success) throw new Error(json.message ?? 'Delete failed');
      showToast('Deleted');
      await loadItems();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setDeleting(false);
    }
  }

  function handleClear() {
    if (isNew) { setCurrent(emptyItem(current.id)); return; }
    const orig = items.find(s=>s.id===current.id);
    if (orig) setCurrent({ ...orig });
  }

  function handlePicChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => upd('itemPic', reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleNavigate(key: string, path: string) {
    if (!confirmDiscard('Leave without saving?')) return;
    setNavKey(key); router.push(path);
  }
  function handleLogout() {
    if (!confirmDiscard('Leave without saving?')) return;
    router.push('/admin/login');
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key!=='Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName!=='INPUT' && target.tagName!=='SELECT') return;
    e.preventDefault();
    if (!formRef.current) return;
    const focusable = Array.from(
      formRef.current.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([readonly]):not([disabled]), select:not([disabled])'
      )
    ).filter(el=>el.offsetParent!==null);
    const idx = focusable.indexOf(target);
    if (idx===-1||idx>=focusable.length-1) { target.blur(); return; }
    const next = focusable[idx+1];
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }

  const saveRef = useRef(handleSave);
  const busyRef = useRef(false);
  saveRef.current = handleSave;
  busyRef.current = saving || deleting;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')) return;
      e.preventDefault();
      if (!busyRef.current) saveRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  const busy = saving || deleting;

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      {toast && <div className={`toast ${toast.err?'err':''}`}>{toast.msg}</div>}

      <div style={{ display:'flex',height:'100vh',overflow:'hidden',background:'#c2d4d4' }}>
        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout}/>

        <div style={{ flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden' }}>

          {/* HEADER */}
          <header style={{ background:'#dae6e6',height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10 }}>
            <div style={{ position:'relative',flexShrink:0 }}>
              <span style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4 }}><ISearch/></span>
              <input
                aria-label="Search items"
                style={{ border:'1.5px solid #c0cbcc',borderRadius:10,padding:'0 14px 0 38px',height:40,width:260,fontFamily:"'Inter',sans-serif",fontSize:14,color:'#1f2937',background:'#fff',outline:'none' }}
                placeholder="Search items…" value={search} onChange={e=>setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex:1 }}/>
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8 }}><IBell/></button>
            <div style={{ display:'flex',alignItems:'center',gap:4,cursor:'pointer' }}>
              <span style={{ fontSize:14,fontWeight:500,color:'#1f2937' }}>MR. SAYO</span>
              <IChevD/>
            </div>
            <div style={{ width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0 }}>S</div>
          </header>

          <div style={{ flex:1,overflow:'hidden',padding:'13px 15px',display:'flex',gap:13 }}>

            {/* LEFT PANEL */}
            <div className="left-panel" style={{ width:250,flexShrink:0,background:'#deeaea',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
              <div style={{ padding:'12px 12px 8px',borderBottom:'1px solid rgba(30,58,64,0.1)',flexShrink:0 }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                  <span style={{ fontSize:13,fontWeight:700,color:'#1e3a40' }}>Items</span>
                  <span style={{ fontSize:11,color:'#6b7280',fontWeight:500 }}>{loading?'…':`${items.length} total`}</span>
                </div>
                <button className="btn-new" style={{ width:'100%' }} onClick={handleNew} disabled={busy}>
                  <IPlus s={14}/> New Item
                </button>
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:'8px' }}>
                {loading && <div style={{ display:'flex',justifyContent:'center',padding:'2rem 0' }}><span className="spinner dark"/></div>}
                {!loading && filtered.length===0 && <p style={{ textAlign:'center',color:'#9ca3af',fontSize:12,padding:'2rem 0' }}>No items found</p>}
                {!loading && filtered.map(it=>(
                  <button
                    key={it.id}
                    className={`srv-list-item ${current.id===it.id&&!isNew?'active':''}`}
                    onClick={()=>handleSelect(it)}
                  >
                    <div style={{ width:36,height:36,borderRadius:9,background:it.enable?'linear-gradient(135deg,#1e3a40,#2a5260)':'#d1d5db',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',overflow:'hidden' }}>
                      {it.itemPic ? <img src={it.itemPic} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/> : <IBox s={17}/>}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <p style={{ fontSize:13,fontWeight:700,color:'#1e3a40',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{it.itemDes||'(no description)'}</p>
                      <p style={{ fontSize:11,color:'#6b7280',marginTop:1 }}>{it.itemCode} · Loc {it.locCode}</p>
                      <div style={{ display:'flex',alignItems:'center',gap:4,marginTop:3,flexWrap:'wrap' }}>
                        <span className={it.enable?'badge-active':'badge-inactive'}>{it.enable?'Active':'Inactive'}</span>
                        {it.category1&&<span className="badge-cat">{catDes(category1,it.category1)}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden',borderRadius:14,boxShadow:'0 2px 12px rgba(30,58,64,0.1)' }}>

              {/* Title / tabs */}
              <div style={{ background:'#1e3a40',borderRadius:'14px 14px 0 0',padding:'14px 18px 0',flexShrink:0 }}>
                <p style={{ color:'rgba(255,255,255,0.45)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase' }}>
                  {isNew?'New Item':'Edit Item'}{isDirty&&'  •  Unsaved'}{'  •  Ctrl+S to save'}
                </p>
                <p style={{ color:'#fff',fontSize:18,fontWeight:800,marginTop:2,marginBottom:10 }}>ITEM MASTER DETAIL</p>
                <div className="panel-tabs">
                  <button className={`panel-tab ${activeTab==='details'?'active':''}`} onClick={()=>setActiveTab('details')}>
                    <ITag s={13}/> Item Details
                  </button>
                  {!isNew&&(
                    <button
                      className={`panel-tab ${activeTab==='recipe'?'active':''}`}
                      onClick={()=>{ setActiveTab('recipe'); loadRecipes(current.itemCode,primaryLocCode); }}
                    >
                      <IFlask s={13}/> Recipe Management
                    </button>
                  )}
                </div>
              </div>

              {/* Quick nav */}
              {activeTab==='details'&&(
                <div className="quick-nav">
                  {SECTIONS.map(s=>(
                    <button key={s.id} className="quick-nav-btn" onClick={()=>scrollTo(s.id)}>
                      {s.icon}{s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* SCROLLABLE BODY */}
              <div
                ref={formRef}
                onKeyDown={handleFormKeyDown}
                style={{ flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:14,background:'#e8f0f1' }}
              >
                {loading&&(
                  <div style={{ display:'flex',justifyContent:'center',alignItems:'center',flex:1 }}>
                    <span className="spinner dark" style={{ width:28,height:28 }}/>
                  </div>
                )}

                {/* ══ RECIPE TAB ══ */}
                {!loading&&activeTab==='recipe'&&!isNew&&(
                  <div className="fade-up" style={{ display:'flex',flexDirection:'column',gap:14 }}>
                    {/* Banner */}
                    <div style={{ background:'linear-gradient(135deg,#1e3a40,#2a5260)',borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap' }}>
                      <div style={{ flex:1,minWidth:200 }}>
                        <p style={{ color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em' }}>Recipe For</p>
                        <p style={{ color:'#fff',fontSize:17,fontWeight:800,marginTop:3 }}>{current.itemDes}</p>
                        <p style={{ color:'rgba(255,255,255,0.45)',fontSize:11,marginTop:2 }}>
                          {current.itemCode} &nbsp;·&nbsp; {recipeRows.length} ingredient{recipeRows.length!==1?'s':''}
                        </p>
                      </div>
                      <div style={{ display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end' }}>
                        <p style={{ color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em' }}>Apply to Locations</p>
                        <div style={{ display:'flex',flexWrap:'wrap',gap:7,justifyContent:'flex-end' }}>
                          {locations.map(l=>{
                            const checked=recipeLocCodes.includes(l.code);
                            return (
                              <button
                                key={l.code}
                                onClick={()=>setRecipeLocCodes(prev=>checked?prev.filter(c=>c!==l.code):[...prev,l.code])}
                                style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'5px 13px',borderRadius:20,cursor:'pointer',fontFamily:"'Inter',sans-serif",border:`1.5px solid ${checked?'#7dd3c8':'rgba(255,255,255,0.2)'}`,background:checked?'rgba(125,211,200,0.2)':'rgba(255,255,255,0.07)',color:checked?'#7dd3c8':'rgba(255,255,255,0.55)',fontSize:12,fontWeight:700,transition:'all 0.15s' }}
                              >
                                <div style={{ width:14,height:14,borderRadius:3,flexShrink:0,border:`2px solid ${checked?'#7dd3c8':'rgba(255,255,255,0.3)'}`,background:checked?'#7dd3c8':'transparent',display:'flex',alignItems:'center',justifyContent:'center' }}>
                                  {checked&&<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1e3a40" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                                {l.code} – {l.name}
                              </button>
                            );
                          })}
                        </div>
                        {recipeLocCodes.length>1&&<p style={{ color:'rgba(255,211,100,0.85)',fontSize:10,fontWeight:600 }}>⚠ Recipe will be saved to {recipeLocCodes.length} locations</p>}
                      </div>
                    </div>

                    <Card title="Recipe Ingredients" icon={<IFlask s={14}/>}>
                      <RecipeGrid
                        rows={recipeRows} rawItems={rawItems} subUnits={subUnits}
                        onChange={setRecipeRows}
                        menuItmID={current.itemCode} defaultLocCode={primaryLocCode}
                      />
                    </Card>
                  </div>
                )}

                {/* ══ DETAILS TAB ══ */}
                {!loading&&activeTab==='details'&&(
                  <div className="fade-up" style={{ display:'flex',flexDirection:'column',gap:14 }}>

                    {/* 1 – IDENTIFICATION */}
                    <Card id="sec-ident" title="Item Identification" icon={<ITag s={13}/>}>
                      <div style={{ display:'grid',gridTemplateColumns:'200px 1fr',gap:12,marginBottom:12 }}>
                        <FieldRow label="Item Code *" htmlFor="itm-code">
                          {isNew
                            ? <input id="itm-code" className="frm-input" value={current.itemCode} onChange={e=>upd('itemCode',e.target.value.toUpperCase())} placeholder="e.g. ITM-006" maxLength={15}/>
                            : <input id="itm-code" className="frm-input" value={current.itemCode} readOnly/>
                          }
                        </FieldRow>
                        <FieldRow label="Item Description *" htmlFor="itm-des">
                          <input id="itm-des" className="frm-input" value={current.itemDes} onChange={e=>upd('itemDes',e.target.value)} placeholder="e.g. Shampoo & Conditioner" maxLength={50}/>
                        </FieldRow>
                      </div>
                      <div style={{ display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:12 }}>
                        <FieldRow label="Print Description" htmlFor="itm-printdes">
                          <input id="itm-printdes" className="frm-input" value={current.itemPrintDes} onChange={e=>upd('itemPrintDes',e.target.value)} maxLength={50}/>
                        </FieldRow>
                        <FieldRow label="Master Unit" htmlFor="itm-unit">
                          <select id="itm-unit" className="frm-select" value={current.masterUnitID} onChange={e=>upd('masterUnitID',e.target.value)}>
                            {units.map(u=><option key={u.id} value={u.id}>{u.des}</option>)}
                          </select>
                        </FieldRow>
                        <FieldRow label="Supplier" htmlFor="itm-sup">
                          <select id="itm-sup" className="frm-select" value={current.supID} onChange={e=>upd('supID',e.target.value)}>
                            <option value="">-- Select --</option>
                            {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </FieldRow>
                      </div>
                    </Card>

                    {/* 2 – CATEGORIES */}
                    <Card id="sec-categories" title="Item Categories" icon={<IArchive s={13}/>}>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12 }}>
                        {([
                          { label:'Main Category',  id:'itm-cat1', val:current.category1, list:category1, key:'category1' as const },
                          { label:'Sub Category 1', id:'itm-cat2', val:current.category2, list:category2, key:'category2' as const },
                          { label:'Sub Category 2', id:'itm-cat3', val:current.category3, list:category3, key:'category3' as const },
                          { label:'Sub Category 3', id:'itm-cat4', val:current.category4, list:category4, key:'category4' as const },
                        ] as const).map(c=>(
                          <FieldRow key={c.key} label={c.label} htmlFor={c.id}>
                            <select id={c.id} className="frm-select" value={c.val} onChange={e=>upd(c.key,e.target.value)}>
                              <option value="">-- Select --</option>
                              {c.list.map(o=><option key={o.code} value={o.code}>{o.des}</option>)}
                            </select>
                          </FieldRow>
                        ))}
                      </div>
                    </Card>

                    {/* 3 – FLAGS */}
                    <FlagsCard item={current} onChange={upd}/>

                    {/* 4 – COST & MARGIN */}
                    <Card id="sec-cost" title="Cost & Margin" icon={<IDollar s={13}/>}>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12 }}>
                        <FieldRow label="Raw Cost" htmlFor="itm-rawcost">
                          <input id="itm-rawcost" className="frm-input" type="number" value={current.rawCost} onChange={e=>upd('rawCost',Number(e.target.value))} min={0}/>
                        </FieldRow>
                        <FieldRow label="Cost Markup %" htmlFor="itm-markup">
                          <input id="itm-markup" className="frm-input" type="number" value={current.costMarkup} onChange={e=>upd('costMarkup',Number(e.target.value))} min={0}/>
                        </FieldRow>
                        <FieldRow label="Overall Cost (Auto)">
                          <input className="frm-input" value={overallCost.toFixed(2)} readOnly style={{ background:'#f0fdf4',color:'#15803d',fontWeight:700 }}/>
                        </FieldRow>
                        <FieldRow label="Sales Margin %" htmlFor="itm-margin">
                          <input id="itm-margin" className="frm-input" type="number" value={current.salesMargin} onChange={e=>upd('salesMargin',Number(e.target.value))} min={0}/>
                        </FieldRow>
                      </div>
                      <div style={{ marginTop:14,background:'linear-gradient(135deg,#1e3a40,#2a5260)',borderRadius:10,padding:'12px 16px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>
                        {[
                          { label:'Raw Cost',val:`LKR ${current.rawCost.toLocaleString()}` },
                          { label:'Overall Cost',val:`LKR ${overallCost.toFixed(2)}` },
                          { label:'Margin',val:`${current.salesMargin}%` },
                        ].map(it=>(
                          <div key={it.label}>
                            <p style={{ color:'rgba(255,255,255,0.45)',fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em' }}>{it.label}</p>
                            <p style={{ color:'#fff',fontSize:15,fontWeight:800,marginTop:3 }}>{it.val}</p>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* 5 – REORDER */}
                    <Card id="sec-reorder" title="Reorder Levels & Stock Limits" icon={<ILayers s={13}/>}>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12 }}>
                        {([
                          { label:'Reorder Level (ROL)', id:'itm-rol',    key:'rol'    },
                          { label:'Reorder Qty (ROQ)',   id:'itm-roq',    key:'roq'    },
                          { label:'Min Qty',             id:'itm-minqty', key:'minQty' },
                          { label:'Max Qty',             id:'itm-maxqty', key:'maxQty' },
                        ] as {label:string;id:string;key:keyof Item}[]).map(f=>(
                          <FieldRow key={f.key as string} label={f.label} htmlFor={f.id}>
                            <input id={f.id} className="frm-input" type="number" min={0}
                              value={current[f.key] as number}
                              onChange={e=>upd(f.key,Number(e.target.value) as Item[typeof f.key])}/>
                          </FieldRow>
                        ))}
                      </div>
                      <div style={{ marginTop:10,background:'#fffbeb',border:'1.5px solid #fde68a',borderRadius:8,padding:'8px 12px',display:'flex',alignItems:'center',gap:8 }}>
                        <span style={{ fontSize:15 }}>💡</span>
                        <span style={{ fontSize:12,color:'#92400e',fontWeight:500 }}>
                          Stock Balance is managed per-location — see <strong>Location Details</strong> below.
                        </span>
                      </div>
                    </Card>

                    {/* 6 – LOCATIONS */}
                    <Card id="sec-locations" title="Location Details" icon={<IMapPin s={13}/>} badge={`${current.locationDetails.length} locations`}>
                      <p style={{ fontSize:12,color:'#6b7280',marginBottom:10 }}>Per-location stock, pricing &amp; enable. Saved with the main Save button.</p>
                      <LocationGrid rows={current.locationDetails} onChange={updLocDetail}/>
                      {current.locationDetails.length>0&&(
                        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginTop:14 }}>
                          {current.locationDetails.map(ld=>(
                            <div key={ld.locCode} style={{ background:'#fff',borderRadius:10,border:`1.5px solid ${ld.enable?'#bbf7d0':'#fecaca'}`,padding:'12px 14px' }}>
                              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                                <span style={{ fontSize:13,fontWeight:700,color:'#1e3a40' }}>{ld.locCode}</span>
                                <span className={ld.enable?'badge-active':'badge-inactive'}>{ld.enable?'Active':'Inactive'}</span>
                              </div>
                              <p style={{ fontSize:11,color:'#6b7280',marginBottom:8 }}>{ld.locName}</p>
                              <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                                {[
                                  { label:'Stock',        val:String(ld.locStockBalance) },
                                  { label:'Sales Margin', val:`${ld.salesMargin}%` },
                                  { label:'Retail Price', val:`LKR ${ld.retailPrice.toFixed(2)}` },
                                  { label:'WS Price',     val:`LKR ${ld.wsPrice.toFixed(2)}` },
                                ].map(r=>(
                                  <div key={r.label} style={{ display:'flex',justifyContent:'space-between' }}>
                                    <span style={{ fontSize:11,color:'#9ca3af' }}>{r.label}</span>
                                    <span style={{ fontSize:11,fontWeight:600,color:'#1f2937' }}>{r.val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    {/* 7 – IMAGE */}
                    <Card id="sec-image" title="Item Image" icon={<IImage s={13}/>}>
                      <div style={{ display:'flex',alignItems:'center',gap:18 }}>
                        <div style={{ width:100,height:100,borderRadius:12,background:current.itemPic?'transparent':'#f3f6f6',border:'2px dashed #d1d9da',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0 }}>
                          {current.itemPic
                            ? <img src={current.itemPic} alt="item" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
                            : <div style={{ textAlign:'center',color:'#9ca3af' }}><IBox s={28}/><p style={{ fontSize:10,marginTop:4,fontWeight:600 }}>No Image</p></div>
                          }
                        </div>
                        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handlePicChange}/>
                          <button className="btn-clear" onClick={()=>fileInputRef.current?.click()}><IImage s={14}/> Upload Image</button>
                          {current.itemPic&&<button className="btn-del" onClick={()=>upd('itemPic',null)}><ITrash s={13}/> Remove</button>}
                          <p style={{ fontSize:11,color:'#9ca3af',maxWidth:200 }}>JPG, PNG, GIF, WebP. 400×400px recommended.</p>
                        </div>
                      </div>
                    </Card>

                  </div>
                )}
              </div>

              {/* FOOTER */}
              <div style={{ background:'#dce8e8',borderTop:'1.5px solid rgba(30,58,64,0.12)',padding:'12px 16px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center',borderRadius:'0 0 14px 14px' }}>
                <button className="btn-clear" onClick={handleClear} disabled={busy}><IRefresh s={14}/> Reset</button>
                <button className="btn-print" onClick={()=>window.print()} disabled={busy}><IPrint s={14}/> Print</button>
                <div style={{ flex:1 }}/>
                {!isNew&&(
                  <button className="btn-del" onClick={handleDelete} disabled={busy}>
                    {deleting ? <><span className="spinner" style={{ borderTopColor:'#dc2626',borderColor:'rgba(220,38,38,0.2)' }}/> Deleting…</> : <><ITrash s={14}/> Delete</>}
                  </button>
                )}
                {activeTab==='details'&&(
                  <button className="btn-save" onClick={handleSave} disabled={busy}>
                    {saving ? <><span className="spinner"/> Saving…</> : <><ISave s={14}/> Save Item</>}
                  </button>
                )}
                {activeTab==='recipe'&&!isNew&&(
                  <button className="btn-save" onClick={handleSaveRecipes} disabled={recipeSaving}>
                    {recipeSaving ? <><span className="spinner"/> Saving…</> : <><ISave s={14}/> Save Recipe</>}
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