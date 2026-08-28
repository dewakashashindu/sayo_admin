'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface Branch {
  LocCode: string;
  LocDes: string;
  Address: string;
}

interface ServiceItem {
  itemCode: string;
  itemDes: string;
  itemPrintDes: string;
  price: number;
  category1: string;
  category1Label: string;
  category2: string;
  category2Label: string;
  category3: string;
  category3Label: string;
  category4: string;
  category4Label: string;
}

interface CustomerSuggestion {
  cusCode: string;
  cusName: string;
  regTel: string;
  cusEmail: string;
  gender: string;
}

/* One provider entry per guest — techID is the provider ID string */
interface GuestProvider {
  guessID: string;  // "MAIN" | "G001" | "G002" ...
  techID: string;
  techName: string;
  categoryCode: string;
}

interface SubClient {
  id: string;           // local UUID
  guessID: string;      // "G001", "G002" ...
  label: string;
  gender: string;
  selectedServices: string[];   // itemCode strings
  timeSlot: string;
  activeCategoryCode: string;
  providers: GuestProvider[];   // one per category covered
}

interface BookingFormData {
  /* Step 1 */
  branch: string;
  /* Step 2 */
  fullName: string;
  phoneNumber: string;
  emailAddress: string;
  gender: string;
  /* Services */
  activeCategoryCode: string;
  selectedServices: string[];
  providers: GuestProvider[];   // main client providers
  /* Date / time */
  date: string;
  timeSlot: string;
  /* Special */
  specialRequest: string;
  /* Sub-clients */
  subClients: SubClient[];
}

interface FieldErrors {
  branch?: string;
  fullName?: string;
  phoneNumber?: string;
  selectedServices?: string;
  date?: string;
  timeSlot?: string;
}

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const TIME_SLOTS = [
  '8:00 AM','8:30 AM','9:00 AM','9:30 AM',
  '10:00 AM','10:30 AM','11:00 AM','11:30 AM',
  '12:00 PM','12:30 PM','1:00 PM','1:30 PM',
  '2:00 PM','2:30 PM','3:00 PM','3:30 PM',
  '4:00 PM','4:30 PM','5:00 PM','5:30 PM',
];
const MAX_CHARS = 250;
const PHONE_DEBOUNCE_MS = 400;

const CAT_PALETTE: Record<string, { bg: string; text: string; dot: string }> = {
  WAX:    { bg:'#fef3c7', text:'#92400e', dot:'#f59e0b' },
  HAIR:   { bg:'#dbeafe', text:'#1e40af', dot:'#3b82f6' },
  SKIN:   { bg:'#fce7f3', text:'#9d174d', dot:'#ec4899' },
  NAIL:   { bg:'#ede9fe', text:'#5b21b6', dot:'#8b5cf6' },
  BODY:   { bg:'#d1fae5', text:'#065f46', dot:'#10b981' },
  BRIDAL: { bg:'#fee2e2', text:'#991b1b', dot:'#ef4444' },
};
function catColor(code: string) {
  return CAT_PALETTE[code?.trim().toUpperCase()] ?? { bg:'#f3f4f6', text:'#374151', dot:'#9ca3af' };
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function fmtMins(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r > 0 ? `${h} hr ${r} min` : `${h} hr`;
}
function fmtDateLong(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00').toLocaleDateString('en-US', {
    weekday:'long', month:'long', day:'numeric', year:'numeric'
  });
}
function genId(): string { return Math.random().toString(36).substring(2, 9); }
function genGuessID(idx: number): string { return `G${String(idx).padStart(3, '0')}`; }

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;font-family:'Inter',sans-serif;overflow:hidden;}

@keyframes spin   {to{transform:rotate(360deg);}}
@keyframes fadeUp {from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes fadeIn {from{opacity:0;}to{opacity:1;}}
@keyframes scaleIn{from{opacity:0;transform:scale(0.96);}to{opacity:1;transform:scale(1);}}
@keyframes popIn  {0%{transform:scale(1);}45%{transform:scale(0.96);}100%{transform:scale(1);}}
@keyframes chipIn {from{opacity:0;transform:scale(0.8) translateY(4px);}to{opacity:1;transform:none;}}
@keyframes tabIn  {from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;}}
@keyframes rowIn  {from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:none;}}
@keyframes slideDown{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}

.tab-in  {animation:tabIn  .18s ease both;}
.row-in  {animation:rowIn  .18s ease both;}
.slide-down{animation:slideDown .18s ease both;}

::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(30,58,64,.2);border-radius:4px;}
*{scrollbar-width:thin;scrollbar-color:rgba(30,58,64,.2) transparent;}

/* ── Card ── */
.form-card{background:#deeaea;border-radius:16px;padding:22px 24px 26px;display:flex;flex-direction:column;gap:0;box-shadow:0 1px 6px rgba(0,0,0,.07);}
.card-hdr{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.card-title{font-size:17px;font-weight:700;color:#1f2937;}
.card-div{height:1px;background:rgba(30,58,64,.14);margin-bottom:18px;}
.step-num{width:26px;height:26px;border-radius:50%;background:#1e3a40;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}

/* ── Inputs ── */
.inp{background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;padding:0 14px;height:44px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;outline:none;width:100%;transition:border-color .18s,box-shadow .18s,background .18s;}
.inp:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.08);}
.inp::placeholder{color:rgba(0,0,0,.32);}
.inp.err{border-color:#e53e3e;background:#fdf0f0;}
.sel{background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;padding:0 34px 0 14px;height:44px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;outline:none;width:100%;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-color:#d0e3e7;transition:border-color .18s;}
.sel:focus{border-color:#1e3a40;outline:none;}
.ta{background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;padding:12px 14px;resize:vertical;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;outline:none;width:100%;line-height:1.6;transition:border-color .18s;}
.ta:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.08);}
.ta::placeholder{color:rgba(0,0,0,.32);}
.lbl{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px;}
.req{color:#e53e3e;margin-left:2px;}

/* ── Phone autocomplete dropdown ── */
.phone-wrap{position:relative;}
.suggest-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #1e3a40;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:200;overflow:hidden;animation:slideDown .15s ease both;}
.suggest-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .12s;border-bottom:1px solid #f3f4f6;}
.suggest-item:last-child{border-bottom:none;}
.suggest-item:hover{background:#f0f8f9;}
.suggest-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#5a8a92,#3a6a72);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0;}

/* ── Date picker ── */
.date-wrap{position:relative;width:100%;height:48px;background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;cursor:pointer;transition:border-color .18s,box-shadow .18s;display:flex;align-items:center;overflow:hidden;}
.date-wrap:hover{border-color:rgba(30,58,64,.3);}
.date-wrap.focused{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.08);}
.date-wrap.err{border-color:#e53e3e;background:#fdf0f0;}
.date-wrap input[type=date]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none;outline:none;background:transparent;font-size:1px;}
.date-disp{display:flex;align-items:center;gap:10px;padding:0 14px;width:100%;pointer-events:none;z-index:1;}

/* ── Branch buttons ── */
.branch-btn{flex:1;display:flex;align-items:center;justify-content:space-between;background:#d0e3e7;border-radius:10px;padding:12px 14px;cursor:pointer;border:2px solid transparent;transition:all .18s;font-family:'Inter',sans-serif;}
.branch-btn:hover:not(.sel-b){background:#c8dde3;}
.branch-btn.sel-b{border-color:#1e3a40;background:#c4dce1;}
.branch-btn.err-b{border-color:#e53e3e;}
.b-radio{width:20px;height:20px;border-radius:50%;border:2px solid rgba(30,58,64,.5);background:#deeaea;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.b-radio.on{background:#1e3a40;border-color:#1e3a40;}
.b-radio.on::after{content:'';width:7px;height:7px;border-radius:50%;background:#fff;display:block;}

/* ── Gender pills ── */
.g-pill{padding:6px 12px;border-radius:20px;border:1.5px solid rgba(30,58,64,.2);background:#c8dde3;cursor:pointer;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:#1e3a40;transition:all .15s;display:flex;align-items:center;gap:4px;white-space:nowrap;}
.g-pill.f{background:#fce7f3;color:#9d174d;border-color:#ec4899;}
.g-pill.m{background:#dbeafe;color:#1e40af;border-color:#3b82f6;}
.g-pill.o{background:#ede9fe;color:#5b21b6;border-color:#8b5cf6;}

/* ── Person row ── */
.person-row{display:flex;align-items:center;gap:10px;background:#d4e8ea;border-radius:10px;padding:10px 14px;border:1.5px solid rgba(30,58,64,.12);animation:rowIn .2s ease both;}
.p-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#5a8a92,#3a6a72);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;}
.add-btn{display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(30,58,64,.08);border-radius:10px;padding:11px;cursor:pointer;border:2px dashed rgba(30,58,64,.25);font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#1e3a40;transition:all .18s;width:100%;}
.add-btn:hover{background:rgba(30,58,64,.13);border-color:rgba(30,58,64,.4);}

/* ── Client switcher tabs ── */
.cli-bar{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;}
.cli-tab{display:flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;border:2px solid transparent;background:#d0e3e7;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#4b5563;white-space:nowrap;flex-shrink:0;transition:all .18s;}
.cli-tab:hover:not(.active){background:#c8dde3;}
.cli-tab.active{background:#1e3a40;color:#fff;border-color:#1e3a40;box-shadow:0 2px 8px rgba(30,58,64,.25);}
.cli-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;flex-shrink:0;}
.cli-badge{background:rgba(255,255,255,.2);color:#fff;border-radius:20px;padding:1px 6px;font-size:10px;font-weight:700;}
.cli-tab:not(.active) .cli-badge{background:rgba(30,58,64,.12);color:#1e3a40;}

/* ── Cat tabs ── */
.cat-tab{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 14px;border-radius:10px;border:2px solid transparent;background:#d0e3e7;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#4b5563;letter-spacing:.04em;transition:all .18s;white-space:nowrap;flex-shrink:0;}
.cat-tab:hover:not(.active){background:#c8dde3;}
.cat-tab.active{background:#1e3a40;color:#fff;border-color:#1e3a40;}
.cat-tab.dim{opacity:.35;pointer-events:none;}
.cat-tab-sub{font-size:9px;font-weight:500;opacity:.65;max-width:76px;text-align:center;line-height:1.2;}
.cat-tab.active .cat-tab-sub{opacity:.7;}
.cat-dot{position:absolute;top:-5px;right:-5px;width:11px;height:11px;border-radius:50%;border:2px solid #deeaea;z-index:1;}

/* ── Service cards ── */
.svc-card{background:#d0e3e7;border-radius:10px;padding:13px 15px;cursor:pointer;border:2px solid transparent;transition:all .15s;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden;text-align:left;font-family:'Inter',sans-serif;}
.svc-card:hover:not(.sel-s){background:#c8dde3;transform:translateY(-1px);box-shadow:0 3px 10px rgba(0,0,0,.08);}
.svc-card.sel-s{background:linear-gradient(135deg,#c4dce1,#b8d4da);border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.12);animation:popIn .2s ease;}
.svc-card.err-s{border-color:#e53e3e!important;}
.svc-chk{width:20px;height:20px;border-radius:50%;border:2px solid rgba(30,58,64,.3);background:#deeaea;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;position:absolute;top:11px;right:11px;}
.svc-chk.on{background:#1e3a40;border-color:#1e3a40;}

/* ── Time slots ── */
.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:7px;}
.ts-btn{background:#d0e3e7;border-radius:8px;padding:9px 4px;text-align:center;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;border:2px solid transparent;transition:all .15s;color:#1e3a40;min-height:40px;display:flex;align-items:center;justify-content:center;}
.ts-btn.sel-t{background:#1e3a40;color:#fff;border-color:#1e3a40;transform:scale(1.04);}
.ts-btn:hover:not(.sel-t){background:#b8d0d5;transform:scale(1.02);}
.ts-btn.err-t{border-color:#e53e3e;}

/* ── Chip bar ── */
.chip-bar{background:#1e3a40;border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.chip{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.14);border-radius:20px;padding:4px 9px;font-size:11px;font-weight:600;color:#fff;white-space:nowrap;animation:chipIn .2s ease both;}
.chip-x{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;color:#fff;font-weight:700;transition:background .15s;border:none;line-height:1;}
.chip-x:hover{background:rgba(255,255,255,.42);}

/* ── Provider cards ── */
.prov-card{background:#d0e3e7;border-radius:11px;padding:12px 14px;cursor:pointer;border:2px solid transparent;transition:all .17s;display:flex;align-items:center;gap:12px;font-family:'Inter',sans-serif;animation:rowIn .18s ease both;}
.prov-card:hover:not(.sel-p){background:#c8dde3;transform:translateY(-1px);}
.prov-card.sel-p{background:linear-gradient(135deg,#c4dce1,#b6d2d9);border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.13);}
.prov-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#5a8a92,#3a6a72);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.15);}
.prov-card.sel-p .prov-av{background:linear-gradient(135deg,#1e3a40,#2a5060);}

/* ── Summary ──
   NOTE: previously used position:sticky + own max-height calc.
   Now the parent panel (.sum-col) is a fixed-height, non-scrolling
   flex column, so .sum-card just needs to flex-fill that space and
   scroll INTERNALLY if its own content overflows. */
.sum-card{background:#deeaea;border-radius:16px;padding:20px 20px 24px;display:flex;flex-direction:column;gap:0;box-shadow:0 1px 6px rgba(0,0,0,.07);flex:1;min-height:0;overflow-y:auto;}
.sum-div{height:1px;background:rgba(30,58,64,.15);margin:10px 0 14px;}
.sum-dot{border-top:1px dashed rgba(30,58,64,.22);margin:10px 0;}

/* ── Buttons ── */
.confirm-btn{background:#1e3a40;color:#fff;border:none;border-radius:11px;width:100%;height:50px;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .18s;letter-spacing:.02em;display:flex;align-items:center;justify-content:center;gap:10px;flex-shrink:0;}
.confirm-btn:hover:not(:disabled){background:#2a5060;transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.18);}
.confirm-btn:disabled{background:#6b8e96;cursor:not-allowed;opacity:.8;}
.spinner{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .7s linear infinite;flex-shrink:0;}

/* ── Misc ── */
.err-msg{font-size:11px;color:#e53e3e;font-weight:600;margin-top:4px;display:flex;align-items:center;gap:4px;animation:fadeUp .18s ease both;}
.info-box{display:flex;align-items:flex-start;gap:7px;background:rgba(30,58,64,.06);border-radius:9px;padding:9px 12px;}
.prov-prog{height:4px;border-radius:99px;background:rgba(30,58,64,.1);overflow:hidden;margin-top:7px;}
.prov-prog-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#1e3a40,#3a8a92);transition:width .35s ease;}
.cat-row{border-radius:12px;overflow:hidden;border:1.5px solid rgba(30,58,64,.12);margin-bottom:12px;}
.cat-row-hdr{display:flex;align-items:center;gap:8px;padding:9px 13px;background:rgba(30,58,64,.06);border-bottom:1px solid rgba(30,58,64,.1);}
.cat-row-body{padding:9px;display:flex;flex-direction:column;gap:7px;background:#d4e8ea;}
.empty-s{background:#d0e3e7;border-radius:9px;padding:26px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:9px;}
.empty-ico{width:46px;height:46px;border-radius:50%;background:rgba(30,58,64,.1);display:flex;align-items:center;justify-content:center;}
.char-ct{font-size:11px;font-weight:600;text-align:right;margin-top:5px;transition:color .18s;}
.srch{border:1.5px solid #c0cbcc;border-radius:10px;padding:0 14px 0 38px;height:40px;width:240px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;background:#fff;outline:none;transition:border-color .15s;}
.srch:focus{border-color:#1e3a40;}
.srch::placeholder{color:rgba(0,0,0,.35);}
.skeleton{background:linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
@keyframes shimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
.sk-btn{height:52px;border-radius:10px;width:100%;}
.sk-svc{height:90px;border-radius:10px;}

/* ── Modals ── */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:fadeIn .2s ease both;padding:16px;}
.modal-bg.closing{animation:fadeIn .18s ease reverse both;}
.modal-box{background:#fff;border-radius:18px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:'Inter',sans-serif;animation:scaleIn .22s ease both;}
.modal-box.closing{animation:scaleIn .18s ease reverse both;}
.m-hdr{background:linear-gradient(135deg,#1e3a40,#2a5060);padding:24px 24px 20px;border-radius:18px 18px 0 0;}
.m-body{padding:20px 24px 26px;display:flex;flex-direction:column;gap:14px;}
.prev-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;gap:8px;}
.prev-lbl{color:#6b7280;font-weight:500;flex-shrink:0;}
.prev-val{color:#1e3a40;font-weight:700;text-align:right;}
.prev-sec{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:6px;}
.prev-sec::after{content:'';flex:1;height:1px;background:#f3f4f6;}
.prev-svc{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8fafa;border-radius:8px;gap:8px;}
.prev-total{background:linear-gradient(135deg,#1e3a40,#2a5060);border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;}
.suc-box{background:#fff;border-radius:18px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:scaleIn .22s ease both;font-family:'Inter',sans-serif;}

@keyframes fadeUp {from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}

/* ── Responsive: right summary panel hides below 960px,
     mobile summary block shows instead inside scrollable left panel ── */
@media(max-width:960px){
  .sum-col{display:none!important;}
  .mob-sum{display:flex!important;flex-direction:column;gap:12px;}
}
@media(max-width:767px){.main-body{padding-bottom:80px!important;}}
@media(max-width:540px){.two-inp{flex-direction:column!important;}.branch-row{flex-direction:column!important;}.person-row{flex-wrap:wrap!important;}.svc-grid{grid-template-columns:1fr!important;}.ts-grid{grid-template-columns:repeat(4,1fr)!important;}.modal-bg{padding:8px!important;}}
`;

/* ─────────────────────────────────────────
   ICONS  (same as original)
───────────────────────────────────────── */
const Ico = {
  Bell:    ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Search:  ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ChevD:   ({s=14}:{s?:number})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Person:  ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  MapPin:  ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Users:   ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Scissors:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  Prov:    ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Cal:     ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Note:    ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Book:    ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  Eye:     ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Arrow:   ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Close:   ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Trash:   ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Check:   ()=><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  BigChk:  ()=><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Tag:     ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  Alert:   ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Info:    ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Inbox:   ()=><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  Print:   ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  Female:  ()=><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/></svg>,
  Male:    ()=><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="14" r="5"/><line x1="19" y1="5" x2="14.35" y2="9.65"/><polyline points="15 5 19 5 19 9"/></svg>,
  Plus:    ()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

/* ─────────────────────────────────────────
   SMALL REUSABLE COMPONENTS
───────────────────────────────────────── */
function ErrMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="err-msg"><Ico.Alert /> {msg}</p>;
}

function FormCard({ step, icon, title, children }: {
  step: number; icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <div className="form-card">
      <div className="card-hdr">
        <div className="step-num">{step}</div>
        <span style={{ color: '#1e3a40', display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span className="card-title">{title}</span>
      </div>
      <div className="card-div" />
      {children}
    </div>
  );
}

function GenderPills({ value, onChange }: { value: string; onChange: (g: string) => void }) {
  const opts = [
    { label: 'Female', cls: 'f', icon: <Ico.Female /> },
    { label: 'Male',   cls: 'm', icon: <Ico.Male /> },
    { label: 'Other',  cls: 'o', icon: null },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(o => (
        <button key={o.label} className={`g-pill ${value === o.label ? o.cls : ''}`}
          onClick={() => onChange(value === o.label ? '' : o.label)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function DatePicker({ value, onChange, minDate, hasError }: {
  value: string; onChange: (v: string) => void; minDate?: string; hasError?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  function open() {
    if (!ref.current) return;
    try { (ref.current as any).showPicker?.(); } catch { ref.current.focus(); }
  }
  return (
    <div className={`date-wrap ${focused ? 'focused' : ''} ${hasError ? 'err' : ''}`} onClick={open}>
      <input ref={ref} type="date" value={value} min={minDate}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} tabIndex={-1} />
      <div className="date-disp">
        <span style={{ color: '#1e3a40', flexShrink: 0, opacity: .75 }}><Ico.Cal /></span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, flex: 1, color: value ? '#1f2937' : 'rgba(0,0,0,.35)' }}>
          {value ? fmtDateLong(value) : 'Click to select appointment date'}
        </span>
        {value
          ? <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>Change</span>
          : <span style={{ color: '#1e3a40', opacity: .5, flexShrink: 0 }}><Ico.ChevD /></span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   PHONE FIELD WITH AUTO-COMPLETE
───────────────────────────────────────── */
function PhoneField({ value, onChange, onSelect, hasError }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (c: CustomerSuggestion) => void;
  hasError?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleChange(v: string) {
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.length < 3) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/appointmentform?type=customer&phone=${encodeURIComponent(v)}`);
        const json = await res.json();
        if (json.success && json.data.length > 0) {
          setSuggestions(json.data);
          setOpen(true);
        } else {
          setSuggestions([]); setOpen(false);
        }
      } catch { setSuggestions([]); setOpen(false); }
      finally { setLoading(false); }
    }, PHONE_DEBOUNCE_MS);
  }

  function select(c: CustomerSuggestion) {
    onSelect(c);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="phone-wrap" ref={wrapRef}>
      <div style={{ position: 'relative' }}>
        <input
          className={`inp ${hasError ? 'err' : ''}`}
          placeholder="+94 77 000 0000"
          value={value}
          onChange={e => handleChange(e.target.value)}
          autoComplete="off"
        />
        {loading && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(30,58,64,.2)', borderTopColor: '#1e3a40', animation: 'spin .7s linear infinite' }} />
          </span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="suggest-drop">
          {suggestions.map(c => (
            <div key={c.cusCode} className="suggest-item" onClick={() => select(c)}>
              <div className="suggest-av">{c.cusName.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>{c.cusName}</p>
                <p style={{ fontSize: 11, color: '#6b7280' }}>{c.regTel}{c.gender ? ` · ${c.gender}` : ''}</p>
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>Select</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   BOOKING SUMMARY (fixed right column)
───────────────────────────────────────── */
function BookingSummary({ form, services }: {
  form: BookingFormData;
  services: ServiceItem[];
}) {
  const mainSvcs = services.filter(s => form.selectedServices.includes(s.itemCode));
  const mainTotal = mainSvcs.reduce((a, s) => a + s.price, 0);

  const subTotals = form.subClients.map(sc => ({
    sc,
    svcs: services.filter(s => sc.selectedServices.includes(s.itemCode)),
  }));
  const grand = mainTotal + subTotals.reduce((a, x) => a + x.svcs.reduce((b, s) => b + s.price, 0), 0);

  return (
    <div className="sum-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ico.Book />
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>Booking Summary</span>
      </div>
      <div className="sum-div" />

      {/* Branch */}
      {form.branch && (
        <>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Branch</p>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a40', marginBottom: 8 }}>{form.branch}</p>
          <div className="sum-dot" />
        </>
      )}

      {/* Main client services */}
      <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Main Client</p>
      {mainSvcs.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,.35)', fontStyle: 'italic' }}>No services selected</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mainSvcs.map(s => {
            const col = catColor(s.category1);
            return (
              <div key={s.itemCode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 5 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.dot, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1e3a40', lineHeight: 1.3 }}>{s.itemPrintDes || s.itemDes}</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap' }}>LKR {s.price.toLocaleString()}</span>
              </div>
            );
          })}
          <div style={{ borderTop: '1px dashed rgba(30,58,64,.18)', paddingTop: 5, marginTop: 2, display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#1e3a40' }}>
            <span>Subtotal</span><span>LKR {mainTotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Sub-clients */}
      {subTotals.map(({ sc, svcs }) => {
        const t = svcs.reduce((a, s) => a + s.price, 0);
        if (!svcs.length) return null;
        return (
          <div key={sc.id}>
            <div className="sum-dot" />
            <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
              {sc.label}
              {sc.gender && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, background: sc.gender === 'Female' ? '#fce7f3' : sc.gender === 'Male' ? '#dbeafe' : '#ede9fe', color: sc.gender === 'Female' ? '#9d174d' : sc.gender === 'Male' ? '#1e40af' : '#5b21b6', borderRadius: 20, padding: '1px 6px' }}>{sc.gender}</span>}
            </p>
            {svcs.map(s => {
              const col = catColor(s.category1);
              return (
                <div key={s.itemCode} style={{ display: 'flex', justifyContent: 'space-between', gap: 5, marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: col.dot, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>{s.itemPrintDes || s.itemDes}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap' }}>LKR {s.price.toLocaleString()}</span>
                </div>
              );
            })}
            {sc.timeSlot && <p style={{ fontSize: 9, color: '#6b7280', marginTop: 2, marginLeft: 10 }}>⏰ {sc.timeSlot}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#1e3a40', marginTop: 3 }}>
              <span>Subtotal</span><span>LKR {t.toLocaleString()}</span>
            </div>
          </div>
        );
      })}

      {grand > 0 && (
        <>
          <div className="sum-dot" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>
            <span>Grand Total</span><span>LKR {grand.toLocaleString()}</span>
          </div>
        </>
      )}

      {/* Date / time */}
      <div className="sum-dot" />
      <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>Appointment</p>
      {form.date
        ? <p style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', marginBottom: 3 }}>{fmtDateLong(form.date)}</p>
        : <p style={{ fontSize: 11, color: 'rgba(0,0,0,.32)', fontStyle: 'italic', marginBottom: 3 }}>No date selected</p>}
      {form.timeSlot
        ? <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a40', marginBottom: 3 }}>{form.timeSlot}</p>
        : <p style={{ fontSize: 11, color: 'rgba(0,0,0,.32)', fontStyle: 'italic', marginBottom: 3 }}>No time selected</p>}

      {/* Client name */}
      {form.fullName && (
        <>
          <div className="sum-dot" />
          <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a40', textTransform: 'uppercase', letterSpacing: '.04em' }}>{form.fullName}</p>
          {form.phoneNumber && <p style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{form.phoneNumber}</p>}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   CONFIRM PREVIEW MODAL
───────────────────────────────────────── */
function ConfirmModal({ form, services, grandTotal, isLoading, onConfirm, onClose }: {
  form: BookingFormData;
  services: ServiceItem[];
  grandTotal: number;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  function close() { setClosing(true); setTimeout(onClose, 180); }

  const mainSvcs = services.filter(s => form.selectedServices.includes(s.itemCode));
  const mainTotal = mainSvcs.reduce((a, s) => a + s.price, 0);

  return (
    <div className={`modal-bg ${closing ? 'closing' : ''}`} onClick={close}>
      <div className={`modal-box ${closing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="m-hdr">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Ico.Eye /></div>
              <div>
                <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Review Booking</p>
                <p style={{ color: '#fff', fontSize: 17, fontWeight: 700 }}>Confirm Details</p>
              </div>
            </div>
            <button onClick={close} style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Ico.Close /></button>
          </div>
          <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 10, fontWeight: 700 }}>GRAND TOTAL</p>
              <p style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>LKR {grandTotal.toLocaleString()}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: 600 }}>{form.branch}</p>
              <p style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: 600 }}>{fmtDateLong(form.date)}</p>
              <p style={{ color: '#4ade80', fontSize: 13, fontWeight: 700 }}>{form.timeSlot}</p>
            </div>
          </div>
        </div>
        <div className="m-body">
          {/* Client info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="prev-sec"><Ico.Person /> Client Info</p>
            <div style={{ background: '#f8fafa', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { l: 'Name',  v: form.fullName || '—' },
                { l: 'Phone', v: form.phoneNumber || '—' },
                ...(form.emailAddress ? [{ l: 'Email', v: form.emailAddress }] : []),
                ...(form.gender ? [{ l: 'Gender', v: form.gender }] : []),
              ].map(r => (
                <div key={r.l} className="prev-row">
                  <span className="prev-lbl">{r.l}</span>
                  <span className="prev-val">{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main services */}
          {mainSvcs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p className="prev-sec"><Ico.Scissors /> Main Client Services</p>
              {mainSvcs.map(s => {
                const col = catColor(s.category1);
                return (
                  <div key={s.itemCode} className="prev-svc">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1e3a40' }}>{s.itemPrintDes || s.itemDes}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap' }}>LKR {s.price.toLocaleString()}</span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', fontSize: 12, fontWeight: 700, color: '#1e3a40' }}>
                <span>Subtotal</span><span>LKR {mainTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Sub-clients */}
          {form.subClients.some(sc => sc.selectedServices.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="prev-sec"><Ico.Users /> Additional Persons</p>
              {form.subClients.map((sc, i) => {
                const scSvcs = services.filter(s => sc.selectedServices.includes(s.itemCode));
                const scTotal = scSvcs.reduce((a, s) => a + s.price, 0);
                if (!scSvcs.length) return null;
                return (
                  <div key={sc.id} style={{ background: '#f8fafa', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>{sc.label}</span>
                      {sc.gender && <span style={{ fontSize: 10, fontWeight: 700, background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>{sc.gender}</span>}
                      {sc.timeSlot && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#1e3a40' }}>⏰ {sc.timeSlot}</span>}
                    </div>
                    {scSvcs.map(s => {
                      const col = catColor(s.category1);
                      return (
                        <div key={s.itemCode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.dot, display: 'inline-block' }} />
                            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{s.itemPrintDes || s.itemDes}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a40' }}>LKR {s.price.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, fontWeight: 700, color: '#1e3a40' }}>
                      <span>Subtotal</span><span>LKR {scTotal.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Providers summary */}
          {(form.providers.length > 0 || form.subClients.some(sc => sc.providers.length > 0)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p className="prev-sec"><Ico.Prov /> Assigned Providers</p>
              {[...form.providers, ...form.subClients.flatMap(sc => sc.providers)].map((gp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafa', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{gp.techName.charAt(0)}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>{gp.techName}</p>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>Guest: {gp.guessID} · Cat: {gp.categoryCode}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {form.specialRequest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p className="prev-sec"><Ico.Note /> Special Request</p>
              <div style={{ background: '#f8fafa', borderRadius: 10, padding: '11px 14px' }}>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{form.specialRequest}</p>
              </div>
            </div>
          )}

          <div className="prev-total">
            <div>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 10, fontWeight: 700 }}>GRAND TOTAL</p>
              <p style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>LKR {grandTotal.toLocaleString()}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>{form.branch}</p>
              <p style={{ color: '#4ade80', fontSize: 12, fontWeight: 700 }}>{form.timeSlot}</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={close} style={{ flex: 1, height: 46, borderRadius: 10, border: '1.5px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
              Edit Booking
            </button>
            <button onClick={onConfirm} disabled={isLoading}
              style={{ flex: 2, height: 46, borderRadius: 10, border: 'none', background: '#1e3a40', color: '#fff', fontSize: 15, fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isLoading ? .8 : 1 }}>
              {isLoading ? <><div className="spinner" />Processing...</> : <><Ico.Arrow />Confirm Booking</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   SUCCESS MODAL
───────────────────────────────────────── */
function SuccessModal({ refNumber, form, services, grandTotal, onClose }: {
  refNumber: string; form: BookingFormData; services: ServiceItem[];
  grandTotal: number; onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  function close() { setClosing(true); setTimeout(onClose, 180); }
  return (
    <div className={`modal-bg ${closing ? 'closing' : ''}`} onClick={close}>
      <div className="suc-box" onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg,#1e3a40,#2a5060)', borderRadius: '18px 18px 0 0', padding: '28px 24px 24px', textAlign: 'center' }}>
          <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Ico.BigChk /></div>
          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Booking Confirmed!</h2>
          <p style={{ color: 'rgba(255,255,255,.65)', fontSize: 13 }}>Walk-in booking successfully registered.</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 20, padding: '6px 16px', marginTop: 12, fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '.06em' }}>
            <Ico.Tag /> REF: {refNumber}
          </div>
        </div>
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#f8fafa', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { l: 'Client', v: form.fullName || 'Walk-in' },
              { l: 'Phone',  v: form.phoneNumber },
              { l: 'Date',   v: fmtDateLong(form.date) },
              { l: 'Time',   v: form.timeSlot },
              { l: 'Branch', v: form.branch },
            ].filter(r => r.v).map(r => (
              <div key={r.l} className="prev-row">
                <span className="prev-lbl">{r.l}</span>
                <span className="prev-val">{r.v}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'linear-gradient(135deg,#1e3a40,#2a5060)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600 }}>Grand Total</span>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>LKR {grandTotal.toLocaleString()}</span>
          </div>
          <button onClick={close} style={{ height: 46, borderRadius: 10, border: 'none', background: '#1e3a40', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   PROVIDER PICKER (per guest, per category)
───────────────────────────────────────── */
interface ProviderEntry {
  id: string;
  name: string;
  role: string;
  expertise: string[];
  branch: string;
}

function ProviderPicker({ guessID, label, categories, branch, selectedProviders, onChange, allProviders }: {
  guessID: string;
  label: string;
  categories: string[];
  branch: string;
  selectedProviders: GuestProvider[];
  onChange: (providers: GuestProvider[]) => void;
  allProviders: ProviderEntry[];
}) {
  if (!branch || categories.length === 0) return null;

  const branchProvs = allProviders.filter(p => p.branch === branch);

  function isSelected(techID: string, catCode: string) {
    return selectedProviders.some(gp => gp.techID === techID && gp.categoryCode === catCode);
  }

  function toggle(prov: ProviderEntry, catCode: string) {
    const exists = selectedProviders.find(gp => gp.techID === prov.id && gp.categoryCode === catCode);
    if (exists) {
      onChange(selectedProviders.filter(gp => !(gp.techID === prov.id && gp.categoryCode === catCode)));
    } else {
      // Remove any previous selection for this category+guest
      const cleaned = selectedProviders.filter(gp => !(gp.guessID === guessID && gp.categoryCode === catCode));
      onChange([...cleaned, {
        guessID,
        techID: prov.id,
        techName: prov.name,
        categoryCode: catCode,
      }]);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {categories.map(cat => {
        const col = catColor(cat);
        const catProvs = branchProvs.filter(p => p.expertise.includes(cat));
        const assigned = selectedProviders.find(gp => gp.guessID === guessID && gp.categoryCode === cat);
        return (
          <div key={cat} className="cat-row">
            <div className="cat-row-hdr">
              <span style={{ background: col.bg, color: col.text, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{cat}</span>
              <span style={{ fontSize: 11, color: '#6b7280', flex: 1 }}>{label}</span>
              {assigned
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#16a34a' }}><Ico.Check /> {assigned.techName}</span>
                : <span style={{ fontSize: 11, color: '#9ca3af' }}>Not assigned</span>}
            </div>
            <div className="cat-row-body">
              {catProvs.length === 0
                ? <p style={{ fontSize: 12, color: 'rgba(0,0,0,.4)', fontStyle: 'italic', padding: '6px 4px', textAlign: 'center' }}>No providers for {cat} at {branch}</p>
                : catProvs.map(prov => {
                  const sel = isSelected(prov.id, cat);
                  return (
                    <button key={prov.id} className={`prov-card ${sel ? 'sel-p' : ''}`}
                      onClick={() => toggle(prov, cat)}>
                      <div className="prov-av">{prov.name.charAt(0)}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: sel ? '#1e3a40' : '#1f2937' }}>{prov.name}</p>
                        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{prov.role}</p>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `2px solid ${sel ? '#1e3a40' : 'rgba(30,58,64,.3)'}`, background: sel ? '#1e3a40' : '#deeaea', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                        {sel && <Ico.Check />}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function WalkInPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState('calendar');
  const [search, setSearch] = useState('');

  /* ── Remote data ── */
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  /* ── Provider data (static for now; replace with API if needed) ── */
  const [allProviders] = useState<ProviderEntry[]>([
    { id: 'T001', name: 'Nadeesha', role: 'Senior Hair Stylist',  expertise: ['HAIR','BRIDAL'],        branch: 'COLOMBO' },
    { id: 'T002', name: 'Priyanka', role: 'Beauty Therapist',     expertise: ['SKIN','BODY','BRIDAL'], branch: 'COLOMBO' },
    { id: 'T003', name: 'Chamari',  role: 'Nail Technician',      expertise: ['NAIL'],                 branch: 'COLOMBO' },
    { id: 'T004', name: 'Dilrukshi',role: 'Wax Specialist',       expertise: ['WAX'],                  branch: 'COLOMBO' },
    { id: 'T005', name: 'Sewwandi', role: 'Massage Therapist',    expertise: ['BODY'],                 branch: 'COLOMBO' },
    { id: 'T006', name: 'Thilini',  role: 'Bridal & Skin Expert', expertise: ['BRIDAL','SKIN'],        branch: 'COLOMBO' },
    { id: 'T007', name: 'Dilanka',  role: 'Hair Specialist',      expertise: ['HAIR','BRIDAL'],        branch: 'NEGOMBO' },
    { id: 'T008', name: 'Sanduni',  role: 'Skin Therapist',       expertise: ['SKIN'],                 branch: 'NEGOMBO' },
    { id: 'T009', name: 'Nimasha',  role: 'Nail & Wax Expert',    expertise: ['NAIL','WAX'],           branch: 'NEGOMBO' },
    { id: 'T010', name: 'Kavindi',  role: 'Body Therapist',       expertise: ['BODY','BRIDAL'],        branch: 'NEGOMBO' },
    { id: 'T011', name: 'Rashmika', role: 'Senior Body Therapist',expertise: ['BODY','BRIDAL'],        branch: 'KIRIBATHGODA' },
    { id: 'T012', name: 'Tharushi', role: 'Bridal Specialist',    expertise: ['BRIDAL','HAIR'],        branch: 'KIRIBATHGODA' },
    { id: 'T013', name: 'Maleesha', role: 'Nail Artist',          expertise: ['NAIL'],                 branch: 'KIRIBATHGODA' },
    { id: 'T014', name: 'Oshadi',   role: 'Hair Stylist',         expertise: ['HAIR','SKIN'],          branch: 'KIRIBATHGODA' },
    { id: 'T015', name: 'Chanika',  role: 'Wax Therapist',        expertise: ['WAX','BODY'],           branch: 'KIRIBATHGODA' },
  ]);

  /* ── UI state ── */
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [refNumber,   setRefNumber]   = useState('');
  const [errors,      setErrors]      = useState<FieldErrors>({});
  const [activeTab,   setActiveTab]   = useState<string>('main');

  /* ── Form ── */
  const [form, setForm] = useState<BookingFormData>({
    branch: '',
    fullName: '', phoneNumber: '', emailAddress: '', gender: '',
    activeCategoryCode: '',
    selectedServices: [],
    providers: [],
    date: '', timeSlot: '',
    specialRequest: '',
    subClients: [],
  });

  /* ── Load branches on mount ── */
  useEffect(() => {
    document.title = 'New Walk-in Booking | Sayo Beauty';
    fetch('/api/appointmentform?type=branches')
      .then(r => r.json())
      .then(j => { if (j.success) setBranches(j.data); })
      .catch(() => {})
      .finally(() => setBranchesLoading(false));
    return () => { document.title = 'Sayo Beauty'; };
  }, []);

  /* ── Load services when branch changes ── */
  useEffect(() => {
    if (!form.branch) { setServices([]); return; }
    setServicesLoading(true);
    setForm(f => ({ ...f, selectedServices: [], providers: [], subClients: f.subClients.map(sc => ({ ...sc, selectedServices: [], providers: [] })) }));
    fetch(`/api/appointmentform?type=services&locCode=${encodeURIComponent(form.branch)}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setServices(j.data);
          // Default to first category found
          if (j.data.length > 0) {
            const firstCat = j.data[0].category1?.trim() || '';
            setForm(f => ({ ...f, activeCategoryCode: firstCat }));
          }
        }
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, [form.branch]);

  /* ── Sync activeTab when sub-client is removed ── */
  useEffect(() => {
    if (activeTab !== 'main' && !form.subClients.find(sc => sc.id === activeTab)) {
      setActiveTab('main');
    }
  }, [form.subClients, activeTab]);

  /* ── Derived ── */
  const isMain    = activeTab === 'main';
  const activeSub = form.subClients.find(sc => sc.id === activeTab) ?? null;

  const tabCat      = isMain ? form.activeCategoryCode : (activeSub?.activeCategoryCode ?? '');
  const tabSelSvcs  = isMain ? form.selectedServices   : (activeSub?.selectedServices ?? []);
  const tabTimeSlot = isMain ? form.timeSlot           : (activeSub?.timeSlot ?? '');
  const tabProviders= isMain ? form.providers          : (activeSub?.providers ?? []);

  // Available categories from loaded services (unique category1 codes)
  const availableCats = [...new Set(services.map(s => s.category1?.trim()).filter(Boolean))];

  // Services visible in current tab+category
  const tabVisible = services.filter(s => s.category1?.trim() === tabCat);

  // Services selected in current tab
  const tabSelObjs = services.filter(s => tabSelSvcs.includes(s.itemCode));
  const tabTotal   = tabSelObjs.reduce((a, s) => a + s.price, 0);

  // Categories selected by main client
  const mainSelCats = [...new Set(
    services.filter(s => form.selectedServices.includes(s.itemCode)).map(s => s.category1?.trim())
  )].filter(Boolean) as string[];

  // Grand total
  const mainTotal    = services.filter(s => form.selectedServices.includes(s.itemCode)).reduce((a, s) => a + s.price, 0);
  const subTotalAll  = form.subClients.reduce((a, sc) =>
    a + services.filter(s => sc.selectedServices.includes(s.itemCode)).reduce((b, s) => b + s.price, 0), 0);
  const grandTotal   = mainTotal + subTotalAll;

  const charLeft  = MAX_CHARS - form.specialRequest.length;
  const charColor = charLeft < 30 ? '#e53e3e' : charLeft < 60 ? '#f59e0b' : '#9ca3af';
  const avSlots   = form.date ? TIME_SLOTS : [];

  /* ── Setters ── */
  function setF<K extends keyof BookingFormData>(k: K, v: BookingFormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function clrErr(k: keyof FieldErrors) { setErrors(e => ({ ...e, [k]: undefined })); }

  /* ── Service toggle ── */
  function handleTabToggleSvc(itemCode: string) {
    if (isMain) {
      const next = form.selectedServices.includes(itemCode)
        ? form.selectedServices.filter(x => x !== itemCode)
        : [...form.selectedServices, itemCode];
      setForm(f => ({ ...f, selectedServices: next }));
      clrErr('selectedServices');
    } else {
      if (!activeSub) return;
      const next = activeSub.selectedServices.includes(itemCode)
        ? activeSub.selectedServices.filter(x => x !== itemCode)
        : [...activeSub.selectedServices, itemCode];
      updateSub(activeSub.id, { ...activeSub, selectedServices: next });
    }
  }

  /* ── Category change ── */
  function handleTabCatChange(cat: string) {
    if (isMain) { setF('activeCategoryCode', cat); return; }
    if (!activeSub) return;
    updateSub(activeSub.id, { ...activeSub, activeCategoryCode: cat });
  }

  /* ── Time slot ── */
  function handleTabTimeSlot(slot: string) {
    if (isMain) {
      setF('timeSlot', form.timeSlot === slot ? '' : slot);
      clrErr('timeSlot');
    } else {
      if (!activeSub) return;
      updateSub(activeSub.id, { ...activeSub, timeSlot: activeSub.timeSlot === slot ? '' : slot });
    }
  }

  /* ── Provider change ── */
  function handleProviderChange(providers: GuestProvider[]) {
    if (isMain) { setF('providers', providers); return; }
    if (!activeSub) return;
    updateSub(activeSub.id, { ...activeSub, providers });
  }

  /* ── Sub-client CRUD ── */
  function addSub() {
    const idx = form.subClients.length + 1;
    setForm(f => ({
      ...f, subClients: [...f.subClients, {
        id: genId(), guessID: genGuessID(idx), label: `Person ${idx}`,
        gender: '', selectedServices: [], timeSlot: '',
        activeCategoryCode: availableCats[0] ?? '',
        providers: [],
      }],
    }));
  }
  function updateSub(id: string, updated: SubClient) {
    setForm(f => ({ ...f, subClients: f.subClients.map(sc => sc.id === id ? updated : sc) }));
  }
  function removeSub(id: string) {
    setForm(f => {
      const next = f.subClients.filter(sc => sc.id !== id);
      return { ...f, subClients: next.map((sc, i) => ({ ...sc, label: `Person ${i + 1}`, guessID: genGuessID(i + 1) })) };
    });
  }
  function subGender(id: string, gender: string) {
    const sc = form.subClients.find(x => x.id === id); if (!sc) return;
    updateSub(id, { ...sc, gender });
  }

  /* ── Phone autofill ── */
  function handleCustomerSelect(c: CustomerSuggestion) {
    setForm(f => ({
      ...f,
      phoneNumber: c.regTel.trim(),
      fullName: c.cusName.trim(),
      emailAddress: c.cusEmail.trim(),
      gender: c.gender ?? '',
    }));
    clrErr('phoneNumber');
    clrErr('fullName');
  }

  /* ── Validate ── */
  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!form.branch)                     e.branch           = 'Please select a branch.';
    if (!form.fullName.trim())            e.fullName         = 'Full name is required.';
    if (!form.phoneNumber.trim())         e.phoneNumber      = 'Phone number is required.';
    if (form.selectedServices.length === 0) e.selectedServices = 'Select at least one service for the main client.';
    if (!form.date)                       e.date             = 'Please select an appointment date.';
    if (!form.timeSlot)                   e.timeSlot         = 'Please select a time slot for the main client.';
    return e;
  }

  function handleReviewClick() {
    setSubmitted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        const el = document.querySelector('.inp.err,.date-wrap.err,.branch-btn.err-b,.svc-card.err-s,.ts-btn.err-t');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    setShowPreview(true);
  }

  /* ── Final submit to API ── */
  async function handleFinalSubmit() {
    setIsLoading(true);
    try {
      const payload = {
        locCode: form.branch,
        regTel: form.phoneNumber.trim(),
        cusName: form.fullName.trim(),
        cusEmail: form.emailAddress.trim() || undefined,
        gender: form.gender || undefined,
        bookingTypeID: 'WALKIN',
        status: 'PENDING',
        confirmationType: 'WI',
        remarks: form.specialRequest || undefined,
        appointmentDate: form.date,
        guests: [
          {
            guessID: 'MAIN',
            label: 'Main Client',
            gender: form.gender,
            timeSlot: form.timeSlot,
            services: services
              .filter(s => form.selectedServices.includes(s.itemCode))
              .map(s => ({
                serviceItemID: s.itemCode,
                qty: 1,
                itemPrice: s.price,
                techID: form.providers.find(gp => gp.guessID === 'MAIN' && catForService(s) === gp.categoryCode)?.techID || '0',
              })),
          },
          ...form.subClients.map(sc => ({
            guessID: sc.guessID,
            label: sc.label,
            gender: sc.gender,
            timeSlot: sc.timeSlot,
            services: services
              .filter(s => sc.selectedServices.includes(s.itemCode))
              .map(s => ({
                serviceItemID: s.itemCode,
                qty: 1,
                itemPrice: s.price,
                techID: sc.providers.find(gp => gp.guessID === sc.guessID && catForService(s) === gp.categoryCode)?.techID || '0',
              })),
          })),
        ],
      };

      const res = await fetch('/api/appointmentform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Booking failed');
      setRefNumber(json.data.refNumber ?? json.data.bookingID);
      setShowPreview(false);
      setShowSuccess(true);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function catForService(s: ServiceItem) { return s.category1?.trim() || ''; }

  function resetForm() {
    setForm({ branch: '', fullName: '', phoneNumber: '', emailAddress: '', gender: '', activeCategoryCode: '', selectedServices: [], providers: [], date: '', timeSlot: '', specialRequest: '', subClients: [] });
    setErrors({}); setSubmitted(false); setActiveTab('main'); setServices([]);
  }

  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';

  return (
    <>
      <style>{CSS}</style>

      {showPreview && (
        <ConfirmModal
          form={form} services={services} grandTotal={grandTotal}
          isLoading={isLoading} onConfirm={handleFinalSubmit}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showSuccess && (
        <SuccessModal
          refNumber={refNumber} form={form} services={services}
          grandTotal={grandTotal}
          onClose={() => { setShowSuccess(false); resetForm(); }}
        />
      )}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: PAGE }}>
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => { setNavKey(key); router.push(path); }}
          onLogout={() => router.push('/admin/login')}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* HEADER */}
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,.06)', zIndex: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: .4 }}><Ico.Search /></span>
              <input className="srch" placeholder="Search....." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}><Ico.Bell /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>MR. SAYO</span>
              <Ico.ChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>S</div>
          </header>

          {/* ══════════════════════════════════════════════════
              BODY — outer row: [ scrollable form panel | fixed summary panel ]
              This row fills all remaining vertical space below header.
              Only the LEFT panel scrolls. The RIGHT panel (summary) never
              scrolls with the page — it just fills its own fixed height,
              and internally the .sum-card can scroll if its own content
              is too tall for the available space.
          ══════════════════════════════════════════════════ */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

            {/* ══════════ LEFT — SCROLLABLE FORM PANEL ══════════ */}
            <div className="main-body" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 18px 24px' }}>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1f2937', lineHeight: 1.2 }}>New Walk-in Booking</h1>
                <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Register a new walk-in client and assign services.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 1 — SELECT BRANCH   (Step 1 as required)
                ━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <FormCard step={1} icon={<Ico.MapPin />} title="Select Branch">
                  {branchesLoading ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[1,2,3].map(i => <div key={i} className="skeleton sk-btn" style={{ flex: 1 }} />)}
                    </div>
                  ) : (
                    <div className="branch-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {branches.map(b => (
                        <button key={b.LocCode}
                          className={`branch-btn ${form.branch === b.LocCode ? 'sel-b' : ''} ${submitted && errors.branch && !form.branch ? 'err-b' : ''}`}
                          onClick={() => { setF('branch', form.branch === b.LocCode ? '' : b.LocCode); clrErr('branch'); }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{b.LocDes}</p>
                            {b.Address && b.Address.trim() && b.Address.trim() !== ' ' && (
                              <p style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{b.Address.trim()}</p>
                            )}
                          </div>
                          <div className={`b-radio ${form.branch === b.LocCode ? 'on' : ''}`} />
                        </button>
                      ))}
                    </div>
                  )}
                  <ErrMsg msg={errors.branch} />
                </FormCard>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 2 — CLIENT DETAILS  (Step 2 as required)
                ━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <FormCard step={2} icon={<Ico.Person />} title="Client Details">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    {/* Phone first — drives autofill */}
                    <div className="two-inp" style={{ display: 'flex', gap: 13 }}>
                      <div style={{ flex: 1 }}>
                        <label className="lbl">Phone Number <span className="req">*</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'none', letterSpacing: 0, fontWeight: 500, marginLeft: 4 }}>(auto-fills known customers)</span>
                        </label>
                        <PhoneField
                          value={form.phoneNumber}
                          onChange={v => { setF('phoneNumber', v); clrErr('phoneNumber'); }}
                          onSelect={handleCustomerSelect}
                          hasError={submitted && !!errors.phoneNumber}
                        />
                        <ErrMsg msg={errors.phoneNumber} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="lbl">Full Name <span className="req">*</span></label>
                        <input className={`inp ${submitted && errors.fullName ? 'err' : ''}`}
                          placeholder="Enter full name" value={form.fullName}
                          onChange={e => { setF('fullName', e.target.value); clrErr('fullName'); }} />
                        <ErrMsg msg={errors.fullName} />
                      </div>
                    </div>
                    <div className="two-inp" style={{ display: 'flex', gap: 13 }}>
                      <div style={{ flex: 1 }}>
                        <label className="lbl">Email Address</label>
                        <input className="inp" placeholder="email@example.com" value={form.emailAddress}
                          onChange={e => setF('emailAddress', e.target.value)} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="lbl">Gender
                          <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'none', letterSpacing: 0, fontWeight: 500, marginLeft: 4 }}>(filters services)</span>
                        </label>
                        <select className="sel" value={form.gender} onChange={e => setF('gender', e.target.value)}>
                          <option value="">Select Gender</option>
                          <option>Female</option>
                          <option>Male</option>
                          <option>Prefer not to say</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </FormCard>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 3 — ADDITIONAL PERSONS
                ━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <FormCard step={3} icon={<Ico.Users />} title="Additional Persons">
                  <div className="info-box" style={{ marginBottom: 14 }}>
                    <span style={{ flexShrink: 0, marginTop: 1, opacity: .7 }}><Ico.Info /></span>
                    <p style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.55 }}>
                      Add companions joining the main client. Set their gender here — services and time slots are configured in the <strong>Services</strong> card below.
                    </p>
                  </div>
                  {form.subClients.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                      {form.subClients.map((sc, i) => (
                        <div key={sc.id} className="person-row">
                          <div className="p-av">{i + 1}</div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40', minWidth: 58, flexShrink: 0 }}>{sc.label}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <GenderPills value={sc.gender} onChange={g => subGender(sc.id, g)} />
                          </div>
                          {sc.selectedServices.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(30,58,64,.1)', color: '#1e3a40', borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {sc.selectedServices.length} svc{sc.selectedServices.length > 1 ? 's' : ''}
                            </span>
                          )}
                          {sc.timeSlot && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: '#d1fae5', color: '#065f46', borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              ⏰ {sc.timeSlot}
                            </span>
                          )}
                          <button onClick={() => removeSub(sc.id)}
                            style={{ background: 'rgba(229,62,62,.1)', border: 'none', borderRadius: 7, padding: '6px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#e53e3e', flexShrink: 0 }}>
                            <Ico.Trash />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="add-btn" onClick={addSub}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1e3a40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico.Plus /></div>
                    Add Another Person
                    {form.subClients.length > 0 && (
                      <span style={{ marginLeft: 'auto', background: 'rgba(30,58,64,.12)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#1e3a40' }}>
                        {form.subClients.length} added
                      </span>
                    )}
                  </button>
                </FormCard>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 4 — SERVICES (with client tabs)
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <FormCard step={4} icon={<Ico.Scissors />} title="Services">
                  {/* Client tabs */}
                  <div style={{ marginBottom: 18 }}>
                    <label className="lbl" style={{ marginBottom: 8 }}>Select Client</label>
                    <div className="cli-bar">
                      <button className={`cli-tab ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
                        {form.selectedServices.length > 0 && <span className="cli-dot" />}
                        <Ico.Person />
                        Main Client
                        {form.selectedServices.length > 0 && <span className="cli-badge">{form.selectedServices.length}</span>}
                      </button>
                      {form.subClients.map(sc => (
                        <button key={sc.id} className={`cli-tab ${activeTab === sc.id ? 'active' : ''}`} onClick={() => setActiveTab(sc.id)}>
                          {sc.selectedServices.length > 0 && <span className="cli-dot" />}
                          {sc.gender === 'Female' && <Ico.Female />}
                          {sc.gender === 'Male'   && <Ico.Male />}
                          {sc.label}
                          {sc.selectedServices.length > 0 && <span className="cli-badge">{sc.selectedServices.length}</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="tab-in" key={activeTab}>
                    {/* Branch guard */}
                    {!form.branch && (
                      <div className="info-box" style={{ marginBottom: 14 }}>
                        <span style={{ flexShrink: 0, marginTop: 1, opacity: .7 }}><Ico.Info /></span>
                        <p style={{ fontSize: 12, color: '#4b5563' }}>Select a <strong>branch</strong> first to load available services.</p>
                      </div>
                    )}

                    {/* Category tabs */}
                    {availableCats.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <label className="lbl" style={{ marginBottom: 8 }}>Service Category</label>
                        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3 }}>
                          {availableCats.map(cat => {
                            const col = catColor(cat);
                            const hasSel = tabSelObjs.some(s => s.category1?.trim() === cat);
                            return (
                              <button key={cat}
                                className={`cat-tab ${tabCat === cat ? 'active' : ''}`}
                                onClick={() => handleTabCatChange(cat)}>
                                {hasSel && <span className="cat-dot" style={{ background: tabCat === cat ? '#4ade80' : col.dot }} />}
                                <span>{cat}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Chip bar */}
                    {tabSelObjs.length > 0 && (
                      <div className="chip-bar" style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                          {tabSelObjs.map(s => {
                            const col = catColor(s.category1);
                            return (
                              <span key={s.itemCode} className="chip">
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
                                {s.itemPrintDes || s.itemDes}
                                <button className="chip-x" onClick={() => handleTabToggleSvc(s.itemCode)}>×</button>
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>LKR {tabTotal.toLocaleString()}</div>
                        </div>
                      </div>
                    )}

                    {/* Service grid */}
                    <div>
                      <label className="lbl" style={{ marginBottom: 9 }}>
                        {tabCat || 'Services'}
                        {isMain && <span className="req"> *</span>}
                      </label>
                      {servicesLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 9 }}>
                          {[1,2,3,4].map(i => <div key={i} className="skeleton sk-svc" />)}
                        </div>
                      ) : tabVisible.length === 0 ? (
                        <div className="empty-s">
                          <div className="empty-ico"><Ico.Inbox /></div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#4b5563' }}>
                            {!form.branch ? 'Select a branch to see services' : 'No services in this category'}
                          </p>
                        </div>
                      ) : (
                        <div className="svc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 9 }}>
                          {tabVisible.map(svc => {
                            const isSel = tabSelSvcs.includes(svc.itemCode);
                            const col   = catColor(svc.category1);
                            const hasErr = isMain && submitted && errors.selectedServices && form.selectedServices.length === 0;
                            return (
                              <button key={svc.itemCode}
                                className={`svc-card ${isSel ? 'sel-s' : ''} ${hasErr ? 'err-s' : ''}`}
                                onClick={() => handleTabToggleSvc(svc.itemCode)}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', background: col.bg, color: col.text, borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700, alignSelf: 'flex-start', marginBottom: 3 }}>{svc.category1}</span>
                                <div className={`svc-chk ${isSel ? 'on' : ''}`}>{isSel && <Ico.Check />}</div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', paddingRight: 26, lineHeight: 1.3 }}>{svc.itemPrintDes || svc.itemDes}</p>
                                <p style={{ fontSize: 14, fontWeight: 700, color: '#1e3a40', marginTop: 4 }}>LKR {svc.price.toLocaleString()}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {isMain && <ErrMsg msg={errors.selectedServices} />}
                    </div>
                  </div>
                </FormCard>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 5 — ASSIGN PROVIDERS (per guest per category)
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {(mainSelCats.length > 0 || form.subClients.some(sc => sc.selectedServices.length > 0)) && (
                  <FormCard step={5} icon={<Ico.Prov />} title="Assign Service Providers">
                    <div className="info-box" style={{ marginBottom: 16 }}>
                      <span style={{ flexShrink: 0, marginTop: 1, opacity: .7 }}><Ico.Info /></span>
                      <p style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.55 }}>
                        Assign one provider per service category, per person. Sub-client providers are configured here too.
                      </p>
                    </div>

                    {/* Client switcher for providers */}
                    <div className="cli-bar" style={{ marginBottom: 16 }}>
                      {mainSelCats.length > 0 && (
                        <button className={`cli-tab ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
                          <Ico.Person /> Main Client
                          {form.providers.length > 0 && <span className="cli-badge">{form.providers.length}</span>}
                        </button>
                      )}
                      {form.subClients.filter(sc => sc.selectedServices.length > 0).map(sc => (
                        <button key={sc.id} className={`cli-tab ${activeTab === sc.id ? 'active' : ''}`} onClick={() => setActiveTab(sc.id)}>
                          {sc.gender === 'Female' && <Ico.Female />}
                          {sc.gender === 'Male'   && <Ico.Male />}
                          {sc.label}
                          {sc.providers.length > 0 && <span className="cli-badge">{sc.providers.length}</span>}
                        </button>
                      ))}
                    </div>

                    <div className="tab-in" key={activeTab + '-prov'}>
                      {isMain && mainSelCats.length > 0 && (
                        <ProviderPicker
                          guessID="MAIN"
                          label="Main Client"
                          categories={mainSelCats}
                          branch={form.branch}
                          selectedProviders={form.providers}
                          onChange={handleProviderChange}
                          allProviders={allProviders}
                        />
                      )}
                      {!isMain && activeSub && activeSub.selectedServices.length > 0 && (
                        <ProviderPicker
                          guessID={activeSub.guessID}
                          label={activeSub.label}
                          categories={[...new Set(services.filter(s => activeSub.selectedServices.includes(s.itemCode)).map(s => s.category1?.trim()).filter(Boolean))] as string[]}
                          branch={form.branch}
                          selectedProviders={activeSub.providers}
                          onChange={ps => updateSub(activeSub.id, { ...activeSub, providers: ps })}
                          allProviders={allProviders}
                        />
                      )}
                    </div>
                  </FormCard>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 6 — APPOINTMENT DATE & TIME SLOTS
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <FormCard step={6} icon={<Ico.Cal />} title="Appointment Date &amp; Time Slots">
                  <div style={{ marginBottom: 20 }}>
                    <label className="lbl">Select Date <span className="req">*</span></label>
                    <DatePicker
                      value={form.date}
                      minDate={new Date().toISOString().split('T')[0]}
                      hasError={submitted && !!errors.date}
                      onChange={v => {
                        setForm(f => ({
                          ...f, date: v, timeSlot: '',
                          subClients: f.subClients.map(sc => ({ ...sc, timeSlot: '' })),
                        }));
                        clrErr('date'); clrErr('timeSlot');
                      }}
                    />
                    <ErrMsg msg={errors.date} />
                  </div>

                  <div>
                    <label className="lbl" style={{ marginBottom: 8 }}>Time Slots</label>
                    <div className="cli-bar" style={{ marginBottom: 14 }}>
                      <button className={`cli-tab ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
                        {form.timeSlot && <span className="cli-dot" />}
                        <Ico.Person /> Main Client
                        {form.timeSlot && <span className="cli-badge">✓</span>}
                      </button>
                      {form.subClients.map(sc => (
                        <button key={sc.id} className={`cli-tab ${activeTab === sc.id ? 'active' : ''}`} onClick={() => setActiveTab(sc.id)}>
                          {sc.timeSlot && <span className="cli-dot" />}
                          {sc.gender === 'Female' && <Ico.Female />}
                          {sc.gender === 'Male'   && <Ico.Male />}
                          {sc.label}
                          {sc.timeSlot && <span className="cli-badge">✓</span>}
                        </button>
                      ))}
                    </div>

                    {!form.date ? (
                      <div style={{ background: '#d4e8ea', borderRadius: 9, padding: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ opacity: .5 }}><Ico.Cal /></span>
                        <p style={{ fontSize: 13, color: 'rgba(0,0,0,.4)', fontStyle: 'italic' }}>Select a date above to unlock time slots.</p>
                      </div>
                    ) : (
                      <div className="tab-in" key={activeTab + '-ts'}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                            {isMain ? 'Main Client time slot' : (activeSub?.label + ' time slot')}
                          </p>
                          {tabTimeSlot && <span style={{ fontSize: 11, fontWeight: 700, background: '#d1fae5', color: '#065f46', borderRadius: 20, padding: '3px 10px' }}>⏰ {tabTimeSlot}</span>}
                        </div>
                        <div className="ts-grid">
                          {avSlots.map(slot => (
                            <button key={slot}
                              className={`ts-btn ${tabTimeSlot === slot ? 'sel-t' : ''} ${isMain && submitted && errors.timeSlot && !form.timeSlot ? 'err-t' : ''}`}
                              onClick={() => handleTabTimeSlot(slot)}>
                              {slot}
                            </button>
                          ))}
                        </div>
                        {isMain && <ErrMsg msg={errors.timeSlot} />}
                      </div>
                    )}
                  </div>
                </FormCard>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━
                    CARD 7 — SPECIAL REQUEST
                ━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <FormCard step={7} icon={<Ico.Note />} title="Special Request">
                  <textarea className="ta"
                    placeholder="Any special requests or notes for this booking..."
                    value={form.specialRequest}
                    maxLength={MAX_CHARS}
                    rows={4}
                    onChange={e => setF('specialRequest', e.target.value)}
                  />
                  <p className="char-ct" style={{ color: charColor }}>{form.specialRequest.length} / {MAX_CHARS}</p>
                </FormCard>

                {/* Mobile summary — appears inside the scrollable left panel
                    only when the right fixed panel is hidden (<960px) */}
                <div className="mob-sum" style={{ display: 'none' }}>
                  <BookingSummary form={form} services={services} />
                  <button className="confirm-btn" onClick={handleReviewClick}>
                    <Ico.Eye />
                    {`Review & Confirm${grandTotal > 0 ? ` · LKR ${grandTotal.toLocaleString()}` : ''}`}
                  </button>
                </div>

              </div>
            </div>

            {/* ══════════ RIGHT — FIXED SUMMARY PANEL (never scrolls with left) ══════════ */}
            <div className="sum-col" style={{ width: 296, flexShrink: 0, padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
              <BookingSummary form={form} services={services} />
              <button className="confirm-btn" onClick={handleReviewClick}>
                <Ico.Eye />
                {`Review & Confirm${grandTotal > 0 ? ` · LKR ${grandTotal.toLocaleString()}` : ''}`}
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}