'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ConflictModal, {
  ConflictModalData,
  ProviderAvailability,
} from '@/components/ConflictModal';
import { evaluateSlot } from '@/lib/slotEvaluator';
import type { SlotResult } from '@/lib/slotEvaluator';
import {
  t, svc as svcName, role as roleName, cat as catName, loc as locName,
  monthNames, dayNames, formatDateL, durStr, fmtDur, type Lang,
} from '@/i18n/translations';

/* ─────────────────────────────────────────
   STORED USER TYPE
───────────────────────────────────────── */
interface StoredUser {
  userId:      number;
  name:        string;
  email:       string;
  phoneNumber: string;
  gender:      string;
}

/* ─────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────── */
const tokens = {
  color: {
    gold:        '#B8860B',
    goldBorder:  'rgba(184,134,11,0.4)',
    goldBg:      'rgba(184,134,11,0.14)',
    white:       '#ffffff',
    whiteMuted:  'rgba(255,255,255,0.80)',
    whiteDim:    'rgba(255,255,255,0.70)',
    whiteFaint:  'rgba(255,255,255,0.35)',
    whiteBorder: 'rgba(255,255,255,0.10)',
    cardBg:      'rgba(20,18,15,0.92)',
    green:       '#22c55e',
    greenBg:     'rgba(34,197,94,0.14)',
    greenBorder: 'rgba(34,197,94,0.4)',
    red:         '#ef4444',
    redBg:       'rgba(239,68,68,0.12)',
    redBorder:   'rgba(239,68,68,0.35)',
    amber:       '#f59e0b',
    amberBg:     'rgba(245,158,11,0.13)',
    amberBorder: 'rgba(245,158,11,0.55)',
  },
  font: { family: 'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif' },
  radius: { card: '1.25rem', input: '0.625rem' },
} as const;

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
type BookingMode = 'confirmed' | 'without_confirmation';
type Step        = 1 | 2;
type GenderValue = 'male' | 'female' | 'prefer_not_to_say' | 'other';

export const GENDER_OPTIONS: { value: GenderValue; label: string }[] = [
  { value: 'male',              label: 'Male'               },
  { value: 'female',            label: 'Female'             },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other',             label: 'Other'              },
];

interface ServiceItem { name: string; price: string; duration: string; category: string; }
interface Provider    { name: string; role: string; avatar: string; expertise: string[]; }

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const CATEGORIES = ['WAX', 'HAIR', 'SKIN', 'NAIL', 'BODY', 'BRIDAL'];

const ALL_SERVICES: Record<string, ServiceItem[]> = {
  WAX: [
    { name: 'Full Arms Wax',     price: 'LKR 2,500',  duration: '45 min',  category: 'WAX' },
    { name: 'Full Legs Wax',     price: 'LKR 3,500',  duration: '60 min',  category: 'WAX' },
    { name: 'Underarm Wax',      price: 'LKR 1,200',  duration: '20 min',  category: 'WAX' },
    { name: 'Eyebrow Threading', price: 'LKR 800',    duration: '15 min',  category: 'WAX' },
    { name: 'Full Body Wax',     price: 'LKR 7,500',  duration: '120 min', category: 'WAX' },
    { name: 'Chest Wax',         price: 'LKR 3,200',  duration: '30 min',  category: 'WAX' },
    { name: 'Back Wax',          price: 'LKR 3,600',  duration: '35 min',  category: 'WAX' },
    { name: 'Beard Shaping',     price: 'LKR 1,000',  duration: '20 min',  category: 'WAX' },
  ],
  HAIR: [
    { name: 'Cut & Re-Style',        price: 'LKR 4,200', duration: '60 min', category: 'HAIR' },
    { name: 'Fringe Cut',            price: 'LKR 1,500', duration: '20 min', category: 'HAIR' },
    { name: 'Blow Dry (Short)',       price: 'LKR 2,500', duration: '30 min', category: 'HAIR' },
    { name: 'Hair Wash & Blast Dry', price: 'LKR 2,100', duration: '25 min', category: 'HAIR' },
    { name: 'Trim',                  price: 'LKR 1,500', duration: '20 min', category: 'HAIR' },
    { name: 'Haircut – Classic',     price: 'LKR 1,800', duration: '30 min', category: 'HAIR' },
    { name: 'Beard Trim',            price: 'LKR 900',   duration: '20 min', category: 'HAIR' },
    { name: 'Hair Color',            price: 'LKR 3,500', duration: '60 min', category: 'HAIR' },
    { name: 'Head Massage',          price: 'LKR 1,500', duration: '30 min', category: 'HAIR' },
  ],
  SKIN: [
    { name: 'Classic Facial',        price: 'LKR 3,000', duration: '45 min', category: 'SKIN' },
    { name: 'Gold Facial',           price: 'LKR 6,500', duration: '60 min', category: 'SKIN' },
    { name: 'Skin Brightening',      price: 'LKR 5,200', duration: '60 min', category: 'SKIN' },
    { name: 'Acne Treatment',        price: 'LKR 4,800', duration: '50 min', category: 'SKIN' },
    { name: 'Anti-Aging Facial',     price: 'LKR 7,200', duration: '75 min', category: 'SKIN' },
    { name: 'Deep Cleansing Facial', price: 'LKR 3,500', duration: '45 min', category: 'SKIN' },
    { name: 'Beard Care Facial',     price: 'LKR 3,200', duration: '40 min', category: 'SKIN' },
    { name: 'Whitening Facial',      price: 'LKR 4,800', duration: '60 min', category: 'SKIN' },
    { name: 'Detox Facial',          price: 'LKR 5,500', duration: '65 min', category: 'SKIN' },
  ],
  NAIL: [
    { name: 'Classic Manicure',   price: 'LKR 1,800', duration: '30 min', category: 'NAIL' },
    { name: 'Gel Manicure',       price: 'LKR 3,200', duration: '45 min', category: 'NAIL' },
    { name: 'Classic Pedicure',   price: 'LKR 2,200', duration: '40 min', category: 'NAIL' },
    { name: 'Gel Pedicure',       price: 'LKR 3,800', duration: '55 min', category: 'NAIL' },
    { name: 'Nail Art (Per Set)', price: 'LKR 1,500', duration: '30 min', category: 'NAIL' },
    { name: 'Basic Manicure',     price: 'LKR 1,200', duration: '25 min', category: 'NAIL' },
    { name: 'Basic Pedicure',     price: 'LKR 1,500', duration: '30 min', category: 'NAIL' },
    { name: 'Nail Trim & Buff',   price: 'LKR 800',   duration: '15 min', category: 'NAIL' },
    { name: 'Callus Removal',     price: 'LKR 1,000', duration: '20 min', category: 'NAIL' },
    { name: 'Hand Spa',           price: 'LKR 2,200', duration: '35 min', category: 'NAIL' },
  ],
  BODY: [
    { name: 'Full Body Massage',       price: 'LKR 5,500', duration: '60 min', category: 'BODY' },
    { name: 'Body Scrub',              price: 'LKR 4,200', duration: '45 min', category: 'BODY' },
    { name: 'Body Wrap',               price: 'LKR 6,000', duration: '75 min', category: 'BODY' },
    { name: 'Aromatherapy Massage',    price: 'LKR 6,800', duration: '60 min', category: 'BODY' },
    { name: 'Hot Stone Massage',       price: 'LKR 7,500', duration: '75 min', category: 'BODY' },
    { name: 'Deep Tissue Massage',     price: 'LKR 6,000', duration: '60 min', category: 'BODY' },
    { name: 'Sports Massage',          price: 'LKR 6,500', duration: '60 min', category: 'BODY' },
    { name: 'Back Massage',            price: 'LKR 3,500', duration: '40 min', category: 'BODY' },
    { name: 'Head & Shoulder Massage', price: 'LKR 2,800', duration: '35 min', category: 'BODY' },
  ],
  BRIDAL: [
    { name: 'Bridal Package – Full', price: 'LKR 45,000', duration: '180 min', category: 'BRIDAL' },
    { name: 'Bridal Hair & Makeup',  price: 'LKR 18,000', duration: '120 min', category: 'BRIDAL' },
    { name: 'Pre-Bridal Package',    price: 'LKR 22,000', duration: '150 min', category: 'BRIDAL' },
    { name: 'Trial Makeup',          price: 'LKR 6,500',  duration: '60 min',  category: 'BRIDAL' },
    { name: 'Bridal Draping',        price: 'LKR 5,000',  duration: '45 min',  category: 'BRIDAL' },
    { name: 'Groom Package',         price: 'LKR 25,000', duration: '150 min', category: 'BRIDAL' },
    { name: 'Groom Hair & Makeup',   price: 'LKR 10,000', duration: '90 min',  category: 'BRIDAL' },
    { name: 'Pre-Groom Package',     price: 'LKR 14,000', duration: '120 min', category: 'BRIDAL' },
    { name: 'Groom Facial',          price: 'LKR 4,500',  duration: '60 min',  category: 'BRIDAL' },
    { name: 'Groom Grooming',        price: 'LKR 3,500',  duration: '45 min',  category: 'BRIDAL' },
  ],
};

const PROVIDERS: Record<string, Provider[]> = {
  Colombo: [
    { name: 'Nadeesha',  role: 'Senior Hair Stylist',  avatar: 'N', expertise: ['HAIR', 'BRIDAL']        },
    { name: 'Priyanka',  role: 'Beauty Therapist',     avatar: 'P', expertise: ['SKIN', 'BODY', 'BRIDAL'] },
    { name: 'Chamari',   role: 'Nail Technician',      avatar: 'C', expertise: ['NAIL']                   },
    { name: 'Dilrukshi', role: 'Wax Specialist',       avatar: 'D', expertise: ['WAX']                    },
    { name: 'Sewwandi',  role: 'Massage Therapist',    avatar: 'S', expertise: ['BODY']                   },
    { name: 'Thilini',   role: 'Bridal & Skin Expert', avatar: 'T', expertise: ['BRIDAL', 'SKIN']         },
  ],
  Negombo: [
    { name: 'Dilanka', role: 'Hair Specialist',   avatar: 'D', expertise: ['HAIR', 'BRIDAL'] },
    { name: 'Sanduni', role: 'Skin Therapist',    avatar: 'S', expertise: ['SKIN']            },
    { name: 'Nimasha', role: 'Nail & Wax Expert', avatar: 'N', expertise: ['NAIL', 'WAX']    },
    { name: 'Kavindi', role: 'Body Therapist',    avatar: 'K', expertise: ['BODY', 'BRIDAL'] },
  ],
  Kiribathgoda: [
    { name: 'Rashmika', role: 'Senior Body Therapist', avatar: 'R', expertise: ['BODY', 'BRIDAL'] },
    { name: 'Tharushi', role: 'Bridal Specialist',     avatar: 'T', expertise: ['BRIDAL', 'HAIR'] },
    { name: 'Maleesha', role: 'Nail Artist',           avatar: 'M', expertise: ['NAIL']            },
    { name: 'Oshadi',   role: 'Hair Stylist',          avatar: 'O', expertise: ['HAIR', 'SKIN']   },
    { name: 'Chanika',  role: 'Wax Therapist',         avatar: 'C', expertise: ['WAX', 'BODY']    },
  ],
};

const LOCATIONS  = ['Colombo', 'Negombo', 'Kiribathgoda'];
const TIME_SLOTS = [
  '09:00 AM','09:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM',
  '01:00 PM','01:30 PM','02:00 PM','02:30 PM',
  '03:00 PM','03:30 PM','04:00 PM','04:30 PM',
  '05:00 PM','05:30 PM','06:00 PM',
];

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function formatDate(iso: string, lang: Lang = 'en') {
  return formatDateL(lang, iso);
}
function parseMins(d: string)  { return parseInt(d, 10) || 0; }
function parseLKR(p: string)   { return parseInt(p.replace(/\D/g, ''), 10) || 0; }
function genderLabelEn(val: GenderValue | ''): string {
  return GENDER_OPTIONS.find(g => g.value === val)?.label ?? '—';
}
function timeToMinutes(tStr: string): number {
  const m = tStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10), p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + mn;
}


const SLOT_AVAILABLE_EMPTY: SlotResult = {
  status: 'available',
  isSequenceSwapped: false,
  occupiedSlots: [],
};

/* ─────────────────────────────────────────
   R5 HIGHLIGHT HELPERS
───────────────────────────────────────── */
function buildSlotResults(
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
  bookedSlots:   Set<string>,
): Record<string, SlotResult> {
  const results: Record<string, SlotResult> = {};
  for (const slot of TIME_SLOTS) {
    results[slot] = evaluateSlot(slot, providers, services, providerSlots, bookedSlots);
  }
  return results;
}

function getHighlightedSlots(
  hoveredSlot: string | null,
  slotResults: Record<string, SlotResult>,
): Set<string> {
  if (!hoveredSlot) return new Set();
  const result = slotResults[hoveredSlot];
  if (!result) return new Set();
  return new Set(result.occupiedSlots ?? []);
}

/* ─────────────────────────────────────────
   CALENDAR HELPERS
───────────────────────────────────────── */
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Sinhala:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#040405;}
  html{--app-font:'Inter','Noto Sans Sinhala','Noto Sans Tamil',sans-serif;}

  @keyframes fadeInUp {from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes checkPop {0%{transform:scale(0) rotate(-20deg);opacity:0}70%{transform:scale(1.2) rotate(5deg)}100%{transform:scale(1) rotate(0);opacity:1}}
  @keyframes spin     {to{transform:rotate(360deg)}}
  @keyframes badgePop {from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
  @keyframes slotPop  {from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
  @keyframes scaleIn  {from{opacity:0;transform:scale(0.96) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes calPop   {from{opacity:0;transform:translateY(6px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes slotHighlightPulse {
    0%,100%{ box-shadow:0 0 0 0 rgba(245,158,11,0); }
    50%     { box-shadow:0 0 10px 3px rgba(245,158,11,0.45); }
  }

  .reveal-up  {animation:fadeInUp  0.55s cubic-bezier(0.16,1,0.3,1) both;}
  .scale-in   {animation:scaleIn   0.45s cubic-bezier(0.16,1,0.3,1) both;}
  .check-pop  {animation:checkPop  0.5s  cubic-bezier(0.34,1.56,0.64,1) 0.1s both;}
  .badge-pop  {animation:badgePop  0.25s cubic-bezier(0.34,1.56,0.64,1) both;}
  .slot-pop   {animation:slotPop   0.2s  cubic-bezier(0.16,1,0.3,1) both;}
  .slide-down {animation:slideDown 0.32s cubic-bezier(0.16,1,0.3,1) both;}
  .cal-pop    {animation:calPop    0.22s cubic-bezier(0.16,1,0.3,1) both;}

  /* ── R5 highlight ring ── */
  .slot-highlighted{
    outline:2px solid rgba(245,158,11,0.90) !important;
    outline-offset:2px !important;
    background:rgba(245,158,11,0.22) !important;
    box-shadow:0 0 10px rgba(245,158,11,0.45) !important;
    animation:slotHighlightPulse 1.4s ease-in-out infinite !important;
    z-index:2;
    position:relative;
  }

  .step-dot {width:2.4rem;height:2.4rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.82rem;font-weight:600;flex-shrink:0;transition:all 0.35s;font-family:var(--app-font);}
  .step-line{flex:1;height:2px;border-radius:2px;transition:background 0.5s;}
  .step-label{font-size:0.6rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;font-family:var(--app-font);margin-top:0.3rem;}

  .mode-badge{display:inline-flex;align-items:center;gap:0.3rem;border-radius:999px;padding:0.18rem 0.6rem;font-size:0.62rem;font-weight:700;letter-spacing:0.07em;font-family:var(--app-font);}
  .mode-badge-confirmed{background:rgba(184,134,11,0.18);border:1px solid rgba(184,134,11,0.45);color:#B8860B;}
  .mode-badge-walkin   {background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#22c55e;}

  .mode-toggle-wrap{display:inline-flex;align-items:center;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.12);border-radius:999px;padding:3px;gap:0;}
  .mtb{cursor:pointer;border:none;outline:none;font-family:var(--app-font);font-size:0.73rem;font-weight:600;letter-spacing:0.05em;border-radius:999px;padding:0.38rem 1rem;transition:all 0.25s;display:inline-flex;align-items:center;gap:0.32rem;background:transparent;color:rgba(255,255,255,0.42);white-space:nowrap;}
  .mtb:hover:not(.mtb-active){color:rgba(255,255,255,0.72);}
  .mtb-confirmed.mtb-active{background:#B8860B;color:#fff;box-shadow:0 2px 14px rgba(184,134,11,0.45);}
  .mtb-walkin.mtb-active   {background:#22c55e;color:#fff;box-shadow:0 2px 14px rgba(34,197,94,0.40);}

  .lang-switch-wrap{display:inline-flex;align-items:center;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.12);border-radius:999px;padding:3px;gap:0;}
  .lsb{cursor:pointer;border:none;outline:none;font-family:var(--app-font);font-size:0.73rem;font-weight:600;letter-spacing:0.04em;border-radius:999px;padding:0.38rem 0.85rem;transition:all 0.25s;display:inline-flex;align-items:center;gap:0.3rem;background:transparent;color:rgba(255,255,255,0.42);white-space:nowrap;}
  .lsb:hover:not(.lsb-active){color:rgba(255,255,255,0.72);}
  .lsb-active{background:#B8860B;color:#fff;box-shadow:0 2px 14px rgba(184,134,11,0.45);}

  .gender-inline-wrap{position:relative;display:inline-flex;align-items:center;gap:0.3rem;cursor:pointer;}
  .gender-inline-wrap select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;appearance:none;-webkit-appearance:none;border:none;background:transparent;}
  .gender-inline-wrap select option{background:#1a1a1a;color:#fff;}
  .g-chevron{opacity:0.55;pointer-events:none;transition:opacity 0.18s;}

  .svc-card{cursor:pointer;border-radius:0.75rem;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);padding:0.8rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;transition:all 0.2s;}
  .svc-card:hover{border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);transform:translateY(-1px);}
  .svc-card-active{border-color:#B8860B !important;background:rgba(184,134,11,0.15) !important;}
  .prov-card{cursor:pointer;border-radius:0.75rem;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);padding:0.8rem 1rem;display:flex;align-items:center;gap:0.85rem;transition:all 0.2s;}
  .prov-card:hover{border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);transform:translateY(-1px);}
  .prov-card-active{border-color:#B8860B !important;background:rgba(184,134,11,0.15) !important;}
  .prov-avatar{width:2.6rem;height:2.6rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--app-font);font-size:0.85rem;font-weight:700;color:#fff;flex-shrink:0;background:rgba(184,134,11,0.35);border:1.5px solid rgba(184,134,11,0.55);}

  .cat-tabs-wrap{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:0.5rem;padding-bottom:2px;scrollbar-width:none;}
  .cat-tabs-wrap::-webkit-scrollbar{display:none;}
  .cat-tab{cursor:pointer;outline:none;border:none;font-family:var(--app-font);font-size:0.74rem;font-weight:600;letter-spacing:0.1em;border-radius:0.5rem;padding:0.42rem 0.9rem;white-space:nowrap;transition:all 0.22s;position:relative;}
  .cat-tab-active  {background:#B8860B;color:#fff;box-shadow:0 4px 16px rgba(184,134,11,0.38);}
  .cat-tab-inactive{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.65);border:1.5px solid rgba(255,255,255,0.18);}
  .cat-tab-inactive:hover{border-color:#B8860B;color:#fff;background:rgba(184,134,11,0.1);}
  .cat-tab-dot{position:absolute;top:-3px;right:-3px;width:0.5rem;height:0.5rem;border-radius:50%;background:#22c55e;border:1.5px solid #040405;}

  .t-slot{cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:var(--app-font);font-size:0.74rem;font-weight:500;text-align:center;transition:all 0.18s;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.72);}
  .t-slot:hover{border-color:#B8860B;background:rgba(184,134,11,0.12);color:#fff;transform:translateY(-1px);}
  .t-slot-active{border-color:#B8860B !important;background:#B8860B !important;color:#fff !important;}
  .t-slot-available{cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:var(--app-font);font-size:0.74rem;font-weight:600;text-align:center;transition:all 0.18s;border:1.5px solid rgba(34,197,94,0.45);background:rgba(34,197,94,0.1);color:#22c55e;}
  .t-slot-available:hover{background:rgba(34,197,94,0.22);transform:translateY(-1px);}
  .t-slot-available-selected{border-color:#22c55e !important;background:#22c55e !important;color:#fff !important;}
  .t-slot-booked{border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:var(--app-font);font-size:0.74rem;font-weight:500;text-align:center;border:1.5px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:rgba(239,68,68,0.55);text-decoration:line-through;cursor:not-allowed;opacity:0.7;}
  .t-slot-partial{cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:var(--app-font);font-size:0.74rem;font-weight:600;text-align:center;transition:all 0.18s;border:1.5px solid rgba(245,158,11,0.55);background:rgba(245,158,11,0.13);color:#f59e0b;position:relative;}
  .t-slot-partial:hover{background:rgba(245,158,11,0.24);border-color:rgba(245,158,11,0.80);transform:translateY(-1px);box-shadow:0 4px 14px rgba(245,158,11,0.22);}
  .t-slot-partial::after{content:'';position:absolute;top:-3px;right:-3px;width:0.45rem;height:0.45rem;border-radius:50%;background:#f59e0b;border:1.5px solid #040405;}

  .legend-dot{width:0.55rem;height:0.55rem;border-radius:50%;flex-shrink:0;display:inline-block;}

  .date-trigger{
    width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);
    border-radius:0.625rem;padding:0.75rem 1rem;font-family:var(--app-font);font-size:0.9rem;
    color:#fff;outline:none;cursor:pointer;display:flex;align-items:center;
    justify-content:space-between;gap:0.6rem;transition:border-color 0.25s,background 0.25s;
    user-select:none;text-align:left;
  }
  .date-trigger:hover{border-color:rgba(184,134,11,0.5);background:rgba(184,134,11,0.06);}
  .date-trigger-open{border-color:#B8860B !important;background:rgba(184,134,11,0.08) !important;}
  .date-trigger-filled{border-color:rgba(184,134,11,0.38);}

  .cal-panel{
    position:absolute;
    z-index:500;
    background:rgba(16,14,11,0.98);
    border:1.5px solid rgba(184,134,11,0.4);
    border-radius:1rem;padding:1rem 1rem 0.75rem;
    box-shadow:0 24px 64px rgba(0,0,0,0.75),0 0 0 1px rgba(184,134,11,0.08);
    backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  }
  .cal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;}
  .cal-nav{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:0.375rem;width:1.85rem;height:1.85rem;display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,0.6);transition:all 0.18s;padding:0;}
  .cal-nav:hover{background:rgba(184,134,11,0.2);border-color:rgba(184,134,11,0.5);color:#B8860B;}
  .cal-daynames{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:0.35rem;}
  .cal-dayname{font-size:0.6rem;font-weight:700;letter-spacing:0.08em;text-align:center;color:rgba(255,255,255,0.28);padding:0.18rem 0;font-family:var(--app-font);}
  .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
  .cal-cell{
    aspect-ratio:1;border-radius:0.375rem;display:flex;align-items:center;justify-content:center;
    font-size:0.77rem;font-weight:500;cursor:pointer;transition:all 0.15s;
    border:1.5px solid transparent;font-family:var(--app-font);color:rgba(255,255,255,0.72);
    background:transparent;padding:0;
  }
  .cal-cell:hover:not(.cal-cell-disabled):not(.cal-cell-selected){
    background:rgba(184,134,11,0.16);border-color:rgba(184,134,11,0.42);color:#fff;
  }
  .cal-cell-selected{background:#B8860B !important;border-color:#B8860B !important;color:#fff !important;font-weight:700;box-shadow:0 2px 10px rgba(184,134,11,0.5);}
  .cal-cell-today:not(.cal-cell-selected){border-color:rgba(184,134,11,0.55) !important;color:#B8860B;font-weight:600;}
  .cal-cell-disabled{color:rgba(255,255,255,0.15) !important;cursor:not-allowed !important;background:transparent !important;border-color:transparent !important;}
  .cal-cell-empty{pointer-events:none;cursor:default;}
  .cal-footer{display:flex;justify-content:space-between;align-items:center;margin-top:0.65rem;padding-top:0.6rem;border-top:1px solid rgba(255,255,255,0.07);}
  .cal-footer-btn{background:transparent;border:none;cursor:pointer;font-family:var(--app-font);font-size:0.72rem;font-weight:600;padding:0.25rem 0.4rem;border-radius:0.3rem;transition:all 0.15s;}
  .cal-footer-btn:hover{background:rgba(255,255,255,0.06);}

  .sayo-input{width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);border-radius:0.625rem;padding:0.75rem 1rem;font-family:var(--app-font);font-size:0.9rem;color:#fff;outline:none;transition:border-color 0.25s,background 0.25s;color-scheme:dark;}
  .sayo-input::placeholder{color:rgba(255,255,255,0.3);}
  .sayo-input:focus{border-color:#B8860B;background:rgba(184,134,11,0.07);}
  .phone-plain-input{background:transparent;border:none;border-bottom:1.5px solid rgba(255,255,255,0.18);padding:0.3rem 0.1rem;font-family:var(--app-font);font-size:0.95rem;font-weight:600;color:#fff;outline:none;width:100%;text-align:right;transition:border-color 0.22s;color-scheme:dark;}
  .phone-plain-input:focus{border-color:#B8860B;}
  .phone-plain-input::placeholder{color:rgba(255,255,255,0.28);}

  .btn-gold {cursor:pointer;outline:none;border:none;font-family:var(--app-font);font-weight:600;letter-spacing:0.06em;border-radius:0.75rem;background:#B8860B;color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;}
  .btn-gold:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(184,134,11,0.38);}
  .btn-gold:disabled{opacity:0.42;cursor:not-allowed;}
  .btn-green{cursor:pointer;outline:none;border:none;font-family:var(--app-font);font-weight:600;letter-spacing:0.06em;border-radius:0.75rem;background:#22c55e;color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;}
  .btn-green:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(34,197,94,0.35);}
  .btn-green:disabled{opacity:0.42;cursor:not-allowed;}
  .btn-ghost{cursor:pointer;outline:none;background:transparent;border:1.5px solid rgba(255,255,255,0.28);border-radius:0.75rem;font-family:var(--app-font);font-weight:500;color:rgba(255,255,255,0.65);transition:all 0.2s;}
  .btn-ghost:hover{border-color:#B8860B;color:#fff;transform:translateY(-2px);}

  .sum-row{display:flex;justify-content:space-between;align-items:flex-start;padding:0.52rem 0;border-bottom:1px solid rgba(255,255,255,0.07);gap:1rem;}
  .sum-row:last-child{border-bottom:none;}
  .cf-block{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:0.875rem;padding:0.2rem 1rem;margin-bottom:0.9rem;}
  .chip{display:inline-flex;align-items:center;gap:0.28rem;background:rgba(184,134,11,0.18);border:1px solid rgba(184,134,11,0.4);border-radius:999px;padding:0.2rem 0.6rem;font-size:0.69rem;font-weight:600;color:#B8860B;font-family:var(--app-font);white-space:nowrap;}
  .info-box      {background:rgba(184,134,11,0.09);border:1px solid rgba(184,134,11,0.28);border-radius:0.625rem;padding:0.65rem 0.9rem;font-size:0.75rem;color:rgba(255,255,255,0.65);font-family:var(--app-font);line-height:1.55;}
  .info-box-green{background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3); border-radius:0.625rem;padding:0.65rem 0.9rem;font-size:0.75rem;color:rgba(255,255,255,0.65);font-family:var(--app-font);line-height:1.55;}
  .api-error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:0.625rem;padding:0.7rem 1rem;font-size:0.78rem;color:#ef4444;font-family:var(--app-font);line-height:1.55;margin-bottom:1rem;}
  .divider{height:1px;background:rgba(255,255,255,0.09);margin:1.2rem 0;}
  .loc-card{cursor:pointer;border-radius:0.875rem;border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);padding:0.9rem 1.1rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;transition:all 0.22s;flex:1;min-width:0;}
  .loc-card:hover{border-color:rgba(184,134,11,0.5);background:rgba(184,134,11,0.08);transform:translateY(-1px);}
  .loc-card-active{border-color:#B8860B !important;background:rgba(184,134,11,0.14) !important;}
  .spinner-sm{width:1rem;height:1rem;border:2px solid rgba(34,197,94,0.3);border-top-color:#22c55e;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite;}

  .appt-header-row{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem;}
  .appt-header-left{flex:1 1 180px;min-width:160px;}
  .appt-header-right{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:1.1rem;text-align:right;}

  .time-section-card{border-radius:1rem;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.025);overflow:hidden;margin-top:0.25rem;}
  .time-section-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;padding:0.85rem 1rem 0.75rem;border-bottom:1px solid rgba(255,255,255,0.07);}
  .time-section-body{padding:1rem;}

  @media(max-width:600px){
    .time-grid{grid-template-columns:repeat(3,1fr) !important;}
    .appt-header-right{align-items:flex-start !important;text-align:left !important;}
    .phone-plain-input{text-align:left !important;}
    .loc-cards-wrap{flex-direction:column !important;}
    .time-section-header{flex-direction:column;align-items:flex-start;}
  }
`;

/* ─────────────────────────────────────────
   SVG ICONS
───────────────────────────────────────── */
const Ico = {
  Check:        ({ s=16,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Right:        ({ s=15 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Left:         ({ s=14 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Clock:        ({ s=12 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Calendar:     ({ s=14,c='currentColor' }:{s?:number;c?:string})=> <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  User:         ({ s=13 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Scissors:     ({ s=13 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  Location:     ({ s=13 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Phone:        ({ s=13 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.9-8.2A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/></svg>,
  Mail:         ({ s=13 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  CalCheck:     ({ s=15 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m16 19 2 2 4-4"/></svg>,
  Walk:         ({ s=15 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2"/><path d="m15 8-4 1-2 4 3 2v5h2v-6l-2-2 1-2"/><path d="m9 21-1-5 3-2"/></svg>,
  Info:         ({ s=13 }:{s?:number})                            => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  MapPin:       ({ s=18,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  MaleSymbol:   ({ s=22,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="14" r="6"/><line x1="14.5" y1="9.5" x2="20" y2="4"/><polyline points="14 4 20 4 20 10"/></svg>,
  FemaleSymbol: ({ s=22,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><line x1="12" y1="15" x2="12" y2="22"/><line x1="8.5" y1="18.5" x2="15.5" y2="18.5"/></svg>,
  GenderN:      ({ s=22,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="11" r="5"/><line x1="12" y1="16" x2="12" y2="22"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="16" y1="7" x2="20" y2="3"/><polyline points="16 3 20 3 20 7"/></svg>,
  ChevDown:     ({ s=13,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  X:            ({ s=12,c='currentColor' }:{s?:number;c?:string}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

function GenderSymbol({ value, s = 22 }: { value: GenderValue | ''; s?: number }) {
  const c = tokens.color.gold;
  if (value === 'male')   return <Ico.MaleSymbol   s={s} c={c} />;
  if (value === 'female') return <Ico.FemaleSymbol s={s} c={c} />;
  return <Ico.GenderN s={s} c={c} />;
}

/* ─────────────────────────────────────────
   INLINE CALENDAR
───────────────────────────────────────── */
interface InlineCalendarProps {
  value:    string;
  minDate:  string;
  onChange: (iso: string) => void;
  onClose:  () => void;
  dropUp:   boolean;
  lang:     Lang;
}

function InlineCalendar({ value, minDate, onChange, onClose, dropUp, lang }: InlineCalendarProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const todayISO = new Date().toISOString().split('T')[0];

  const initD = value ? new Date(value + 'T00:00') : new Date();
  const [vYear,  setVYear]  = useState(initD.getFullYear());
  const [vMonth, setVMonth] = useState(initD.getMonth());

  useEffect(() => {
    function down(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    }
    const tmo = setTimeout(() => document.addEventListener('mousedown', down), 50);
    return () => { clearTimeout(tmo); document.removeEventListener('mousedown', down); };
  }, [onClose]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  function prevMonth() {
    if (vMonth === 0) { setVMonth(11); setVYear(y => y - 1); }
    else setVMonth(m => m - 1);
  }
  function nextMonth() {
    if (vMonth === 11) { setVMonth(0); setVYear(y => y + 1); }
    else setVMonth(m => m + 1);
  }
  function pickDay(day: number) {
    const iso = `${vYear}-${String(vMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso < minDate) return;
    onChange(iso);
    onClose();
  }

  const daysInMonth = getDaysInMonth(vYear, vMonth);
  const firstDow    = getFirstDayOfMonth(vYear, vMonth);
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div
      ref={panelRef}
      className="cal-panel cal-pop"
      style={{ left: 0, right: 0, [dropUp ? 'bottom' : 'top']: 'calc(100% + 8px)', width: '100%' }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth} type="button" aria-label={t(lang, 'cal.prevMonth')}>
          <Ico.Left s={13} />
        </button>
        <span style={{ color: tokens.color.white, fontFamily: tokens.font.family, fontSize: '0.86rem', fontWeight: 600 }}>
          {monthNames(lang)[vMonth]} {vYear}
        </span>
        <button className="cal-nav" onClick={nextMonth} type="button" aria-label={t(lang, 'cal.nextMonth')}>
          <Ico.Right s={13} />
        </button>
      </div>

      <div className="cal-daynames">
        {dayNames(lang).map(d => <div key={d} className="cal-dayname">{d}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} className="cal-cell cal-cell-empty" />;
          const iso      = `${vYear}-${String(vMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const disabled = iso < minDate;
          const selected = iso === value;
          const isToday  = iso === todayISO;
          let cls = 'cal-cell';
          if (disabled) cls += ' cal-cell-disabled';
          if (selected) cls += ' cal-cell-selected';
          else if (isToday) cls += ' cal-cell-today';
          return (
            <button
              key={day} type="button" className={cls}
              onClick={() => pickDay(day)}
              disabled={disabled}
              aria-label={`${day} ${monthNames(lang)[vMonth]} ${vYear}`}
              aria-pressed={selected}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="cal-footer">
        <button className="cal-footer-btn" type="button"
          style={{ color: tokens.color.gold }}
          onClick={() => { onChange(todayISO); onClose(); }}
        >
          {t(lang, 'cal.today')}
        </button>
        {value && (
          <button className="cal-footer-btn" type="button"
            style={{ color: 'rgba(239,68,68,0.75)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            onClick={() => onChange('')}
          >
            <Ico.X s={11} c="rgba(239,68,68,0.75)" /> {t(lang, 'cal.clear')}
          </button>
        )}
        <button className="cal-footer-btn" type="button"
          style={{ color: tokens.color.whiteFaint }}
          onClick={onClose}
        >
          {t(lang, 'cal.close')}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   DATE PICKER FIELD
───────────────────────────────────────── */
function DatePickerField({ value, minDate, onChange, lang }: {
  value: string; minDate: string;
  onChange: (iso: string) => void;
  lang: Lang;
}) {
  const [open,   setOpen]   = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 380);
    }
    setOpen(o => !o);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', marginBottom: '1.25rem' }}>
      <button
        type="button"
        className={['date-trigger', open ? 'date-trigger-open' : '', value && !open ? 'date-trigger-filled' : ''].join(' ')}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <Ico.Calendar s={15} c={value ? tokens.color.gold : 'rgba(255,255,255,0.3)'} />
          <span style={{ color: value ? tokens.color.white : 'rgba(255,255,255,0.35)', fontFamily: tokens.font.family }}>
            {value ? formatDate(value, lang) : t(lang, 'cal.selectDate')}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {value && (
            <span
              role="button" aria-label={t(lang, 'cal.clearDate')}
              style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.35)', padding: '0.1rem' }}
              onMouseDown={e => { e.stopPropagation(); onChange(''); setOpen(false); }}
            >
              <Ico.X s={12} />
            </span>
          )}
          <span style={{ display: 'flex', color: open ? tokens.color.gold : 'rgba(255,255,255,0.35)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s' }}>
            <Ico.ChevDown s={13} />
          </span>
        </span>
      </button>

      {open && (
        <InlineCalendar
          value={value} minDate={minDate}
          onChange={iso => { onChange(iso); if (iso) setOpen(false); }}
          onClose={() => setOpen(false)}
          dropUp={dropUp} lang={lang}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   STEP INDICATOR
───────────────────────────────────────── */
function StepIndicator({ current, mode, lang }: { current: 1 | 2; mode: BookingMode; lang: Lang }) {
  const ac    = mode === 'without_confirmation' ? tokens.color.green : tokens.color.gold;
  const steps = [{ n: 1, label: t(lang, 'steps.one') }, { n: 2, label: t(lang, 'steps.two') }];
  return (
    <div style={{ display: 'flex', alignItems: 'center', maxWidth: '400px', margin: '0 auto clamp(1.75rem,4vw,2.5rem)' }}>
      {steps.map((s, i) => {
        const done = current > s.n, active = current === s.n;
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
              <div className="step-dot" style={{ background: done ? ac : active ? `rgba(${mode === 'without_confirmation' ? '34,197,94' : '184,134,11'},0.18)` : 'rgba(255,255,255,0.06)', border: active ? `2px solid ${ac}` : done ? 'none' : '2px solid rgba(255,255,255,0.18)', color: done || active ? '#fff' : tokens.color.whiteFaint }}>
                {done ? <Ico.Check s={14} c="#fff" /> : s.n}
              </div>
              <span className="step-label" style={{ color: active ? ac : done ? tokens.color.whiteDim : tokens.color.whiteFaint }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="step-line" style={{ margin: '0 0.4rem 1.4rem', background: done ? ac : 'rgba(255,255,255,0.12)' }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────── */
function Card({ children, style, mode }: { children: React.ReactNode; style?: React.CSSProperties; mode?: BookingMode }) {
  return (
    <div style={{ background: tokens.color.cardBg, border: `1px solid ${mode === 'without_confirmation' ? 'rgba(34,197,94,0.2)' : mode === 'confirmed' ? 'rgba(184,134,11,0.22)' : tokens.color.whiteBorder}`, borderRadius: tokens.radius.card, padding: 'clamp(1.25rem,3vw,1.85rem)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', ...style }}>
      {children}
    </div>
  );
}
function Label({ text }: { text: string }) {
  return <p style={{ color: tokens.color.gold, fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: '0.5rem', fontFamily: tokens.font.family }}>{text}</p>;
}
function FieldLabel({ text, opt, lang = 'en' }: { text: string; opt?: boolean; lang?: Lang }) {
  return <label style={{ display: 'block', color: tokens.color.whiteDim, fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.35rem', fontFamily: tokens.font.family }}>{text}{opt && <span style={{ color: tokens.color.whiteFaint, marginLeft: '0.3rem' }}>{t(lang, 's2.optional')}</span>}</label>;
}
function CircleCheck({ active }: { active: boolean }) {
  return <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', flexShrink: 0, background: active ? tokens.color.gold : 'rgba(255,255,255,0.08)', border: active ? 'none' : '1.5px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>{active && <Ico.Check s={9} c="#fff" />}</div>;
}
function SumRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sum-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: tokens.color.whiteFaint }}>{icon}<span style={{ fontSize: '0.76rem', fontFamily: tokens.font.family }}>{label}</span></div>
      <span style={{ color: tokens.color.whiteMuted, fontSize: '0.82rem', fontWeight: 500, fontFamily: tokens.font.family, textAlign: 'right', maxWidth: '58%' }}>{value || '—'}</span>
    </div>
  );
}

/* ─────────────────────────────────────────
   LANGUAGE SWITCHER
───────────────────────────────────────── */
const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'si', label: 'සිං' },
  { code: 'ta', label: 'த' },
];
function LangSwitcher({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="lang-switch-wrap" role="group" aria-label="Language">
      {LANG_OPTIONS.map(l => (
        <button key={l.code} type="button" className={`lsb${lang === l.code ? ' lsb-active' : ''}`} aria-pressed={lang === l.code} onClick={() => onChange(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   MODE TOGGLE
───────────────────────────────────────── */
function ModeToggle({ mode, onChange, lang }: { mode: BookingMode; onChange: (m: BookingMode) => void; lang: Lang }) {
  return (
    <div className="mode-toggle-wrap">
      <button className={`mtb mtb-confirmed${mode === 'confirmed' ? ' mtb-active' : ''}`} onClick={() => onChange('confirmed')}>
        <Ico.CalCheck s={12} /> {t(lang, 'mode.with')}
      </button>
      <button className={`mtb mtb-walkin${mode === 'without_confirmation' ? ' mtb-active' : ''}`} onClick={() => onChange('without_confirmation')}>
        <Ico.Walk s={12} /> {t(lang, 'mode.without')}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   GENDER INLINE
───────────────────────────────────────── */
function GenderInline({ value, onChange, lang }: { value: GenderValue | ''; onChange: (v: GenderValue) => void; lang: Lang }) {
  return (
    <div className="gender-inline-wrap" title={value ? t(lang, `gender.${value}`) : t(lang, 'gp.selectGenderTitle')}>
      <GenderSymbol value={value} s={24} />
      <span className="g-chevron"><Ico.ChevDown s={12} c={tokens.color.gold} /></span>
      <select value={value} onChange={e => onChange(e.target.value as GenderValue)} aria-label={t(lang, 'gp.selectGenderTitle')}>
        <option value="" disabled>{t(lang, 'gp.selectGender')}</option>
        {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{t(lang, `gender.${g.value}`)}</option>)}
      </select>
    </div>
  );
}

/* ─────────────────────────────────────────
   PHONE INLINE
───────────────────────────────────────── */
function PhoneInline({ phone, autoFilled, onChange, lang }: { phone: string; autoFilled: boolean; onChange: (v: string) => void; lang: Lang }) {
  if (autoFilled) return <p style={{ color: tokens.color.white, fontFamily: tokens.font.family, fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{phone}</p>;
  return (
    <div style={{ width: '100%' }}>
      <input type="tel" className="phone-plain-input" placeholder="07X XXX XXXX" value={phone} onChange={e => onChange(e.target.value)} />
      {!phone.trim() && <p style={{ color: 'rgba(239,68,68,0.75)', fontSize: '0.68rem', fontFamily: tokens.font.family, marginTop: '0.25rem', textAlign: 'right' }}>⚠ {t(lang, 'gp.required')}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────
   GENDER + PHONE CORNER
───────────────────────────────────────── */
function GenderPhoneCorner({ gender, onGenderChange, phone, onPhoneChange, phoneAutoFilled, lang }: {
  gender: GenderValue | ''; onGenderChange: (v: GenderValue) => void;
  phone: string; onPhoneChange: (v: string) => void; phoneAutoFilled: boolean; lang: Lang;
}) {
  return (
    <div className="appt-header-right">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
        <Label text={t(lang, 'gp.gender')} />
        <GenderInline value={gender} onChange={onGenderChange} lang={lang} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem', width: '100%' }}>
        <Label text={t(lang, 'gp.contact')} />
        <PhoneInline phone={phone} autoFilled={phoneAutoFilled} onChange={onPhoneChange} lang={lang} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   TIME SECTION
───────────────────────────────────────── */
interface TimeSectionCardProps {
  date:                 string;
  mode:                 BookingMode;
  onModeChange:         (m: BookingMode) => void;
  timeSlot:             string;
  loadingSlots:         boolean;
  slotsError:           string;
  walkinDisabledReason: string;
  classifySlot:         (s: string) => SlotResult;
  handleSlotClick:      (s: string) => void;
  multiProvider:        boolean;
  setTimeSlot:          (s: string) => void;
  lang:                 Lang;
  /* R5 */
  highlightedSlots: Set<string>;
  onSlotHover:      (slot: string | null) => void;
  slotResults:      Record<string, SlotResult>;
}

function TimeSectionCard({
  date, mode, onModeChange,
  timeSlot, loadingSlots, slotsError, walkinDisabledReason,
  classifySlot, handleSlotClick,
  multiProvider, setTimeSlot, lang,
  highlightedSlots, onSlotHover, slotResults,
}: TimeSectionCardProps) {
  return (
    <div className="time-section-card slide-down">
      <div className="time-section-header">
        <div>
          <p style={{ color: tokens.color.gold, fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: tokens.font.family, marginBottom: '0.18rem' }}>{t(lang, 'time.preferredTime')}</p>
          <p style={{ color: tokens.color.whiteFaint, fontSize: '0.72rem', fontFamily: tokens.font.family }}>{formatDate(date, lang)}</p>
        </div>
        <ModeToggle mode={mode} onChange={onModeChange} lang={lang} />
      </div>
      <div className="time-section-body">
        {mode === 'confirmed'
          ? (
            <ConfirmedSlots
              timeSlot={timeSlot}
              setTimeSlot={setTimeSlot}
              highlightedSlots={highlightedSlots}
              onSlotHover={onSlotHover}
            />
          ) : (
            <WalkinSlots
              timeSlot={timeSlot}
              loading={loadingSlots}
              error={slotsError}
              disabledReason={walkinDisabledReason}
              classifySlot={classifySlot}
              handleSlotClick={handleSlotClick}
              multiProvider={multiProvider}
              lang={lang}
              highlightedSlots={highlightedSlots}
              onSlotHover={onSlotHover}
              slotResults={slotResults}
            />
          )
        }
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   CONFIRMED SLOTS  (with R5 hover)
───────────────────────────────────────── */
function ConfirmedSlots({ timeSlot, setTimeSlot, highlightedSlots, onSlotHover }: {
  timeSlot: string;
  setTimeSlot: (s: string) => void;
  highlightedSlots: Set<string>;
  onSlotHover: (slot: string | null) => void;
}) {
  return (
    <div className="time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.42rem' }}>
      {TIME_SLOTS.map(slot => {
        const isHighlighted = highlightedSlots.has(slot);
        const isActive      = timeSlot === slot;
        return (
          <button
            key={slot}
            type="button"
            className={[
              't-slot',
              isActive      ? 't-slot-active'    : '',
              isHighlighted ? 'slot-highlighted' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => setTimeSlot(slot)}
            onMouseEnter={() => onSlotHover(slot)}
            onMouseLeave={() => onSlotHover(null)}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   WALK-IN SLOTS  (with R5 hover)
───────────────────────────────────────── */
function WalkinSlots({
  timeSlot, loading, error, disabledReason,
  classifySlot, handleSlotClick,
  multiProvider, lang,
  highlightedSlots, onSlotHover, slotResults,
}: {
  timeSlot: string; loading: boolean; error: string; disabledReason: string;
  classifySlot: (s: string) => SlotResult; handleSlotClick: (s: string) => void;
  multiProvider: boolean; lang: Lang;
  highlightedSlots: Set<string>;
  onSlotHover: (slot: string | null) => void;
  slotResults: Record<string, SlotResult>;
}) {
  if (disabledReason) return (
    <div className="info-box" style={{ display: 'flex', gap: '0.5rem' }}>
      <Ico.Info s={13} /><span>{disabledReason}</span>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1.5rem 0' }}>
      <span className="spinner-sm" />
      <span style={{ color: tokens.color.whiteFaint, fontSize: '0.78rem', fontFamily: tokens.font.family }}>{t(lang, 'time.checking')}</span>
    </div>
  );

  const av = TIME_SLOTS.filter(s => classifySlot(s).status === 'available').length;
  const pa = TIME_SLOTS.filter(s => classifySlot(s).status === 'partial').length;
  const bo = TIME_SLOTS.filter(s => classifySlot(s).status === 'booked').length;

  return (
    <>
      {error && (
        <div className="info-box" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Ico.Info s={13} /><span>{error}</span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span className="legend-dot" style={{ background: tokens.color.green }} />
          <span style={{ color: tokens.color.whiteFaint, fontSize: '0.71rem', fontFamily: tokens.font.family }}>{t(lang, 'time.available')} ({av})</span>
        </div>
        {multiProvider && pa > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="legend-dot" style={{ background: tokens.color.amber }} />
            <span style={{ color: tokens.color.whiteFaint, fontSize: '0.71rem', fontFamily: tokens.font.family }}>{t(lang, 'time.partial')} ({pa})</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span className="legend-dot" style={{ background: tokens.color.red }} />
          <span style={{ color: tokens.color.whiteFaint, fontSize: '0.71rem', fontFamily: tokens.font.family }}>
            {multiProvider ? t(lang, 'time.fullyBooked') : t(lang, 'time.booked')} ({bo})
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.42rem' }}>
        {TIME_SLOTS.map(slot => {
          const result        = classifySlot(slot);
          const st            = result.status;
          const sel           = timeSlot === slot;
          const isHighlighted = highlightedSlots.has(slot);
          const hasSwap       = st === 'partial' && result.isSequenceSwapped;

          /* booked */
          if (st === 'booked') {
            return (
              <div
                key={slot}
                className={['t-slot-booked slot-pop', isHighlighted ? 'slot-highlighted' : ''].filter(Boolean).join(' ')}
              >
                {slot}
              </div>
            );
          }

          /* partial */
          if (st === 'partial') {
            return (
              <button
                key={slot}
                type="button"
                className={['t-slot-partial slot-pop', isHighlighted ? 'slot-highlighted' : ''].filter(Boolean).join(' ')}
                onClick={() => handleSlotClick(slot)}
                onMouseEnter={() => onSlotHover(slot)}
                onMouseLeave={() => onSlotHover(null)}
                title={t(lang, hasSwap ? 'time.swapTip' : 'time.partialTip')}
              >
                {slot}
                {hasSwap && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', fontSize: '0.55rem', background: '#a855f7', borderRadius: '999px', padding: '0.06rem 0.28rem', color: '#fff', fontWeight: 700, letterSpacing: '0.04em', border: '1.5px solid #040405' }}>↕</span>
                )}
              </button>
            );
          }

          /* available */
          return (
            <button
              key={slot}
              type="button"
              className={[
                't-slot-available slot-pop',
                sel           ? 't-slot-available-selected' : '',
                isHighlighted ? 'slot-highlighted'          : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleSlotClick(slot)}
              onMouseEnter={() => onSlotHover(slot)}
              onMouseLeave={() => onSlotHover(null)}
            >
              {slot}
            </button>
          );
        })}
      </div>

      {multiProvider && (
        <p style={{ color: tokens.color.whiteFaint, fontSize: '0.68rem', fontFamily: tokens.font.family, marginTop: '0.55rem' }}>
          {t(lang, 'time.yellowHint')}{' '}
          <span style={{ color: '#a855f7' }}>↕</span> {t(lang, 'time.swapEquals')}
        </p>
      )}

      {/* R5 hint banner — appears when hovering shows multi-slot span */}
      {highlightedSlots.size > 1 && (
        <div style={{
          marginTop: '0.65rem',
          background: 'rgba(245,158,11,0.09)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '0.5rem',
          padding: '0.45rem 0.75rem',
          fontSize: '0.7rem',
          color: 'rgba(245,158,11,0.85)',
          fontFamily: tokens.font.family,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}>
          <Ico.Info s={12} />
          {t(lang, 'time.highlightHint', { count: String(highlightedSlots.size) })}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════ */
export default function BookingPage() {
  const router = useRouter();

  const [lang,      setLangState] = useState<Lang>('en');
  const [mode,      setMode]      = useState<BookingMode>('confirmed');
  const [step,      setStep]      = useState<Step>(1);
  const [gender,    setGender]    = useState<GenderValue | ''>('');
  const [name,      setName]      = useState('');
  const [phone,     setPhone]     = useState('');
  const [email,     setEmail]     = useState('');
  const [location,  setLocation]  = useState('');
  const [category,  setCategory]  = useState('HAIR');
  const [services,  setServices]  = useState<ServiceItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [date,      setDate]      = useState('');
  const [timeSlot,  setTimeSlot]  = useState('');
  const [notes,     setNotes]     = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [apiError,  setApiError]  = useState('');
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [phoneAutoFilled, setPhoneAutoFilled] = useState(false);

  const [bookedSlots,   setBookedSlots]   = useState<Set<string>>(new Set());
  const [providerSlots, setProviderSlots] = useState<Record<string, string[]>>({});
  const [loadingSlots,  setLoadingSlots]  = useState(false);
  const [slotsError,    setSlotsError]    = useState('');
  const [conflictModal, setConflictModal] = useState<ConflictModalData | null>(null);

  /* ── R5: hover state ── */
  const [hoveredSlot,        setHoveredSlot]        = useState<string | null>(null);
  /* ── R5: persisted highlight — stays visible after modal closes ── */
  const [persistedHighlight, setPersistedHighlight] = useState<Set<string>>(new Set());

  /* ── R5: pre-computed result map — recomputed only when deps change ── */
  const slotResults = useMemo<Record<string, SlotResult>>(() => {
    if (providers.length === 0 || services.length === 0) return {};
    return buildSlotResults(providers, services, providerSlots, bookedSlots);
  }, [providers, services, providerSlots, bookedSlots]);

  /* ── R5: highlighted cells — hover takes priority; falls back to persisted ── */
  const highlightedSlots = useMemo<Set<string>>(() => {
    const hovered = getHighlightedSlots(hoveredSlot, slotResults);
    if (hovered.size > 0) return hovered;
    return persistedHighlight;
  }, [hoveredSlot, slotResults, persistedHighlight]);

  /* ── language: restore + persist ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('lang');
    if (saved === 'en' || saved === 'si' || saved === 'ta') setLangState(saved as Lang);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== 'undefined') window.localStorage.setItem('lang', l);
  };

  /* ── auto-fill from localStorage ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('user');
    if (!raw) { router.replace('/login?redirect=/booking'); return; }
    try {
      const u = JSON.parse(raw) as StoredUser;
      if (u.name)  setName(u.name);
      if (u.email) setEmail(u.email);
      if (u.phoneNumber?.trim()) { setPhone(u.phoneNumber.trim()); setPhoneAutoFilled(true); }
      if (u.gender?.trim()) {
        const rg = u.gender.trim().toLowerCase();
        const m  = GENDER_OPTIONS.find(g => g.value === rg || g.label.toLowerCase() === rg || rg.startsWith(g.value.split('_')[0]));
        if (m) setGender(m.value);
      }
    } catch { localStorage.removeItem('user'); router.replace('/login?redirect=/booking'); }
  }, [router]);

  const today       = new Date().toISOString().split('T')[0];
  const serviceList = ALL_SERVICES[category] ?? [];

  const allBranchProvs   = location ? (PROVIDERS[location] ?? []) : [];
  const selectedCats     = Array.from(new Set(services.map(s => s.category)));
  const catFilter        = selectedCats.length > 0 ? selectedCats : [category];
  const filteredProvs    = allBranchProvs.filter(p => p.expertise.some(e => catFilter.includes(e)));
  const providerNamesKey = providers.map(p => p.name).sort().join(',');

  /* ── fetch live availability ── */
  useEffect(() => {
    if (mode !== 'without_confirmation' || !date || providers.length === 0) {
      setBookedSlots(new Set()); setProviderSlots({}); return;
    }
    const ctrl = new AbortController();
    (async () => {
      setLoadingSlots(true); setSlotsError('');
      try {
        const p = new URLSearchParams({ date });
        if (location)         p.set('location', location);
        if (providerNamesKey) p.set('providers', providerNamesKey);
        const res = await fetch(`/api/bookings/availability?${p}`, { signal: ctrl.signal });
        const d   = await res.json();
        if (d.success) {
          const nb = new Set<string>(d.bookedSlots || []);
          setBookedSlots(nb); setProviderSlots(d.providerSlots || {});
          if (timeSlot && nb.has(timeSlot)) setTimeSlot('');
        } else setSlotsError(t(lang, 'time.loadError'));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSlotsError(t(lang, 'time.loadError'));
      } finally { setLoadingSlots(false); }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, location, providerNamesKey]);

  const walkinDisabledReason =
    mode === 'without_confirmation' && providers.length === 0
      ? t(lang, 'time.needProvider') : '';

  /* ─────────────────────────────────────────
     classifySlot — uses SLOT_AVAILABLE_EMPTY
     so the return type always satisfies SlotResult
  ───────────────────────────────────────── */
  function classifySlot(slot: string): SlotResult {
    if (providers.length === 0) return SLOT_AVAILABLE_EMPTY;
    return evaluateSlot(slot, providers, services, providerSlots, bookedSlots);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ✅ FIXED — handleSlotClick
     ─────────────────────────────────────────────────────────────────────
     BUG FIXED: Previously this function manually re-calculated gap info
     using `findBackToBack()` and its own busy-provider loop — which could
     disagree with what `slotEvaluator.ts` (`evaluateSlot`) already
     computed. That mismatch caused the modal to show WRONG times
     (e.g. showing "09:00 AM" chips for an "11:30 AM" booking).

     FIX: Now we trust `result` (the SlotResult from classifySlot/
     evaluateSlot) as the single source of truth for:
       - swappedDetails.gapMinutes / nextFreeTime
       - gapOnlyDetails
       - recommendedOriginalTime
     The old `findBackToBack()` helper is no longer needed and has been
     removed to avoid confusion/drift between two "sources of truth".
  ═══════════════════════════════════════════════════════════════════════ */
  function handleSlotClick(slot: string) {
    const result = classifySlot(slot);
    if (result.status === 'booked')    return;
    if (result.status === 'available') { setTimeSlot(slot); return; }

    const sm = timeToMinutes(slot);

    // Provider availability snapshot — used only for the modal's provider list UI
    const pa: ProviderAvailability[] = providers.map(p => {
      const busy         = providerSlots[p.name] ?? [];
      const isFree       = !busy.includes(slot);
      const nextFreeSlot = !isFree
        ? TIME_SLOTS.find(s => timeToMinutes(s) > sm && !busy.includes(s)) ?? null
        : null;
      return {
        providerName:  p.name,
        serviceName:   services.find(sv => p.expertise.includes(sv.category))?.name ?? '',
        isFree,
        nextFreeSlot,
      };
    });

    const busyProviders = pa.filter(p => !p.isFree);

    // ✅ Build gap description strictly from evaluator's result — no manual math
    let gapDescription = '';
    const sd = result.swappedDetails;
    const gd = result.gapOnlyDetails;

    if (sd && sd.gapMinutes > 0) {
      // Sequence swap WITH a waiting gap
      gapDescription = t(lang, 'cm.gapDesc', {
        names:  sd.orderedServices[1] ?? '',
        isAre:  'is',
        until:  sd.nextFreeTime,
        mins:   sd.gapMinutes,
        slot,
      });
    } else if (gd) {
      // Original order possible, but only with a waiting gap
      gapDescription = t(lang, 'cm.gapDesc', {
        names:  gd.busyProvider,
        isAre:  'is',
        until:  gd.busyUntil,
        mins:   gd.gapMinutes,
        slot,
      });
    } else if (busyProviders.length > 0) {
      // Fallback — legacy single-provider style busy description
      const latestNext = busyProviders.reduce<string | null>((acc, p) => {
        if (!p.nextFreeSlot) return acc;
        if (!acc) return p.nextFreeSlot;
        return timeToMinutes(p.nextFreeSlot) > timeToMinutes(acc) ? p.nextFreeSlot : acc;
      }, null);

      if (latestNext) {
        const gapMins   = timeToMinutes(latestNext) - timeToMinutes(slot);
        const busyNames = busyProviders.map(p => p.providerName).join(', ');
        gapDescription  = t(lang, 'cm.gapDesc', {
          names: busyNames, isAre: busyProviders.length === 1 ? 'is' : 'are',
          until: latestNext, mins: gapMins, slot,
        });
      }
    }

    // ✅ recommendedOriginalTime comes directly from the evaluator —
    // no separate findBackToBack() scan needed anymore.
    const btb = result.recommendedOriginalTime ?? null;

    setConflictModal({
      selectedSlot:   slot,
      backToBackSlot: btb,
      providers:      pa,
      gapDescription,
      slotResult:     result,
      serviceNames:   services.map(s => s.name),
    });
  }

  function handleBookBackToBack(slot: string) {
    const result = evaluateSlot(slot, providers, services, providerSlots, bookedSlots);
    if (result.status !== 'available') {
      setSlotsError(t(lang, 'err.slotTaken', { slot }));
      setConflictModal(null);
      return;
    }
    setTimeSlot(slot);
    setConflictModal(null);
  }

  function handleBookSplit(sel: string, next: string) {
    setTimeSlot(sel);
    const freeAt  = providers.filter(p => !(providerSlots[p.name] ?? []).includes(sel)).map(p => p.name).join(', ');
    const laterAt = providers.filter(p =>  (providerSlots[p.name] ?? []).includes(sel)).map(p => p.name).join(', ');
    const note    = `[Split Booking] ${freeAt} starts at ${sel}. ${laterAt} joins at ${next}.`;
    setNotes(prev => prev ? `${prev}\n${note}` : note);
    setConflictModal(null);
  }

  function handleBookSwapped(slot: string) {
    const sd       = conflictModal?.slotResult?.swappedDetails;
    const swapNote = sd?.orderedServices?.length
      ? `[Sequence Swap] Services run in this order at ${slot}: ${sd.orderedServices.join(' → ')}`
      : services.length === 2
        ? `[Sequence Swap] Services run in reverse order at ${slot}: ${services[1].name} → ${services[0].name}`
        : `[Sequence Swap] Services reordered at ${slot}`;
    setNotes(prev => prev ? `${prev}\n${swapNote}` : swapNote);
    setTimeSlot(slot);

    /* R5: persist occupied slots so grid stays highlighted after modal closes */
    const occupied =
      conflictModal?.slotResult?.swappedDetails?.occupiedSlots ??
      conflictModal?.slotResult?.gapOnlyDetails?.occupiedSlots ??
      conflictModal?.slotResult?.occupiedSlots ??
      [];
    setPersistedHighlight(new Set(occupied));

    setConflictModal(null);
  }

  function handleModeChange(m: BookingMode) {
    setMode(m); setTimeSlot(''); setBookedSlots(new Set()); setProviderSlots({});
    setHoveredSlot(null); setPersistedHighlight(new Set());
  }
  function handleDateChange(iso: string) {
    setDate(iso); setTimeSlot('');
    setHoveredSlot(null); setPersistedHighlight(new Set());
  }

  /* ── Provider rules:
       • Single category  → max 1 provider total (selecting new one replaces old)
       • Multi category   → max 1 provider PER category (one per each selected cat)
       • Confirmed mode   → provider selection is optional
  ── */
  const isMultiCat     = selectedCats.length > 1;
  const maxProviders   = isMultiCat ? selectedCats.length : 1;

  /* canStep2: confirmed mode doesn't require providers */
  const providerRequirementMet =
    mode === 'confirmed'
      ? true   // optional in confirmed mode
      : providers.length > 0 && (
          isMultiCat
            ? providers.length === selectedCats.length   // one per category
            : providers.length === 1                     // exactly one
        );

  const canStep2   = !!gender && !!location && services.length > 0 && providerRequirementMet && !!date && !!timeSlot && !!phone.trim();
  const totalMins  = services.reduce((a, s) => a + parseMins(s.duration), 0);
  const totalPrice = services.reduce((a, s) => a + parseLKR(s.price), 0);
  const accentColor = mode === 'without_confirmation' ? tokens.color.green : tokens.color.gold;
  const btnClass    = mode === 'without_confirmation' ? 'btn-green' : 'btn-gold';

  const toggleService  = (svc: ServiceItem) => setServices(prev => prev.some(s => s.name === svc.name && s.price === svc.price) ? prev.filter(s => !(s.name === svc.name && s.price === svc.price)) : [...prev, svc]);

  function toggleProvider(p: Provider) {
    setProviders(prev => {
      const alreadySelected = prev.some(x => x.name === p.name);

      if (alreadySelected) {
        // Deselect
        return prev.filter(x => x.name !== p.name);
      }

      if (!isMultiCat) {
        // Single category — always replace (max 1)
        return [p];
      }

      // Multi-category — find which category this provider covers
      // that isn't already represented; replace if that cat already has one
      const provCats = p.expertise.filter(e => selectedCats.includes(e));
      if (provCats.length === 0) return prev; // provider doesn't match any selected cat

      // Pick the first unoccupied cat this provider covers; fallback to first cat
      const targetCat =
        provCats.find(cat => !prev.some(x => x.expertise.includes(cat))) ??
        provCats[0];

      // Remove the existing provider for targetCat (if any), then add new one
      const without = prev.filter(x => !x.expertise.includes(targetCat));

      // Cap total at maxProviders
      const next = [...without, p].slice(0, maxProviders);
      return next;
    });
    setTimeSlot('');
    setHoveredSlot(null);
    setPersistedHighlight(new Set());
  }

  const handleLocChange = (locSel: string)  => { setLocation(locSel); setProviders([]); setTimeSlot(''); setHoveredSlot(null); };

  /* ── submit ── */
  const handleConfirm = async () => {
    setLoading(true); setApiError('');
    try {
      const payload = {
        name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(),
        gender: genderLabelEn(gender as GenderValue), location, mode,
        services: services.map(s => ({ name: s.name, price: s.price, duration: s.duration, category: s.category })),
        categories: selectedCats, totalDuration: totalMins, totalPrice,
        providers: providers.map(p => ({ name: p.name, role: p.role })),
        date, timeSlot, notes: notes.trim() || null,
      };
      const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d   = await res.json();
      if (!res.ok || !d.success) { setApiError(d.message || t(lang, 'err.generic')); setLoading(false); return; }
      setBookingId(d.bookingId); setConfirmed(true);
    } catch { setApiError(t(lang, 'err.network')); }
    finally  { setLoading(false); }
  };

  const handleReset = () => {
    setMode('confirmed'); setStep(1); setGender(''); setLocation(''); setCategory('HAIR');
    setServices([]); setProviders([]); setDate(''); setTimeSlot(''); setNotes('');
    setConfirmed(false); setLoading(false); setApiError(''); setBookingId(null);
    setBookedSlots(new Set()); setProviderSlots({}); setSlotsError(''); setConflictModal(null);
    setHoveredSlot(null);
  };

  /* ══════════════════════════════════════
     SUCCESS SCREEN
  ══════════════════════════════════════ */
  if (confirmed) {
    return (
      <>
        <style>{globalCss}</style>
        <main style={{ minHeight: '100vh', fontFamily: tokens.font.family, backgroundImage: 'url(/booking.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,5,0.84)' }} />
          <div className="reveal-up" style={{ position: 'relative', zIndex: 1, maxWidth: '520px', width: '100%', textAlign: 'center' }}>
            <div className="check-pop" style={{ width: '5rem', height: '5rem', borderRadius: '50%', background: mode === 'without_confirmation' ? 'rgba(34,197,94,0.15)' : 'rgba(184,134,11,0.15)', border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Ico.Check s={32} c={accentColor} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span className={`mode-badge ${mode === 'without_confirmation' ? 'mode-badge-walkin' : 'mode-badge-confirmed'}`}>
                {mode === 'without_confirmation' ? <><Ico.Walk s={11} /> {t(lang, 'mode.without')}</> : <><Ico.CalCheck s={11} /> {t(lang, 'mode.confirmedBadge')}</>}
              </span>
              <LangSwitcher lang={lang} onChange={setLang} />
            </div>
            {bookingId && <p style={{ color: tokens.color.whiteFaint, fontSize: '0.72rem', fontFamily: tokens.font.family, marginBottom: '0.4rem', letterSpacing: '0.1em' }}>{t(lang, 'ok.bookingId')}: <strong style={{ color: accentColor }}>#{bookingId}</strong></p>}
            <p style={{ color: accentColor, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{t(lang, 'ok.bookingWord')} {t(lang, mode === 'without_confirmation' ? 'ok.registeredWord' : 'ok.confirmedWord')}</p>
            <h2 style={{ color: tokens.color.white, fontSize: 'clamp(1.6rem,3vw,2.2rem)', fontWeight: 600, marginBottom: '0.75rem', fontFamily: tokens.font.family }}>{t(lang, 'ok.seeYouSoon', { name: name.split(' ')[0] })}</h2>
            <p style={{ color: tokens.color.whiteMuted, fontSize: '0.88rem', lineHeight: 1.9, marginBottom: '2rem', fontFamily: tokens.font.family }}>
              <span style={{ color: accentColor }}>{services.map(s => svcName(lang, s.name)).join(', ')}</span>{' '}
              {t(lang, 'ok.onDate', { date: date ? formatDate(date, lang) : '' })}{' '}
              {t(lang, 'ok.atTime', { time: timeSlot })}<br />
              {t(lang, 'ok.withProvs', { provs: providers.map(p => p.name).join(' & ') })}<br />
              {t(lang, 'ok.atOurBranch', { loc: locName(lang, location) })}<br />
              <span style={{ color: tokens.color.whiteDim, fontSize: '0.8rem' }}>
                {mode === 'without_confirmation' ? t(lang, 'ok.walkinNote') : t(lang, 'ok.confirmationSentTo', { email })}
              </span>
            </p>
            <button className={btnClass} onClick={handleReset} style={{ padding: '0.85rem 2.5rem', fontSize: '0.9rem' }}>{t(lang, 'ok.bookAnother')}</button>
          </div>
        </main>
      </>
    );
  }

  /* ══════════════════════════════════════
     MAIN FORM
  ══════════════════════════════════════ */
  return (
    <>
      <style>{globalCss}</style>
      <main style={{ minHeight: '100vh', fontFamily: tokens.font.family, backgroundImage: 'url(/booking.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,5,0.76)', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(1.5rem,5vw,3rem) clamp(1rem,4vw,2rem) clamp(3rem,6vw,5rem)' }}>

          {/* PAGE HEADER */}
          <div className="reveal-up" style={{ textAlign: 'center', marginBottom: 'clamp(1.25rem,3vw,1.75rem)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
              <LangSwitcher lang={lang} onChange={setLang} />
            </div>
            <p style={{ color: tokens.color.gold, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '0.4rem', fontFamily: tokens.font.family }}>{t(lang, 'header.onlineBooking')}</p>
            <h1 style={{ color: tokens.color.white, fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 600, marginBottom: '0.5rem', fontFamily: tokens.font.family }}>
              {t(lang, 'header.title1')} <span style={{ color: accentColor }}>{t(lang, 'header.title2')}</span> {t(lang, 'header.title3')}
            </h1>
            <p style={{ color: tokens.color.whiteFaint, fontSize: '0.75rem', fontFamily: tokens.font.family }}>
              {t(lang, mode === 'confirmed' ? 'header.confirmEmailNote' : 'header.instantNote')}
            </p>
          </div>

          <StepIndicator current={step} mode={mode} lang={lang} />

          <div style={{ maxWidth: '680px', margin: '0 auto' }}>

            {/* ════════════ STEP 1 ════════════ */}
            {step === 1 && (
              <div className="reveal-up">
                <Card mode={mode}>

                  {/* header row */}
                  <div className="appt-header-row">
                    <div className="appt-header-left">
                      <h2 style={{ color: tokens.color.white, fontSize: '1.25rem', fontWeight: 600, fontFamily: tokens.font.family, marginBottom: '0.25rem' }}>{t(lang, 's1.buildYourAppointment')}</h2>
                      <p style={{ color: tokens.color.whiteFaint, fontSize: '0.78rem', fontFamily: tokens.font.family, lineHeight: 1.55 }}>{t(lang, 's1.intro')}</p>
                    </div>
                    <GenderPhoneCorner gender={gender} onGenderChange={setGender} phone={phone} onPhoneChange={setPhone} phoneAutoFilled={phoneAutoFilled} lang={lang} />
                  </div>

                  <div className="divider" style={{ margin: '0 0 1.4rem' }} />

                  {/* LOCATION */}
                  <Label text={t(lang, 's1.branchLocation')} />
                  <div className="loc-cards-wrap" style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
                    {LOCATIONS.map(locSel => (
                      <div key={locSel} className={`loc-card${location === locSel ? ' loc-card-active' : ''}`} onClick={() => handleLocChange(locSel)} role="button" aria-pressed={location === locSel}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', flexShrink: 0, background: location === locSel ? 'rgba(184,134,11,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${location === locSel ? 'rgba(184,134,11,0.55)' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ico.MapPin s={13} c={location === locSel ? tokens.color.gold : tokens.color.whiteFaint} />
                          </div>
                          <span style={{ color: location === locSel ? tokens.color.gold : tokens.color.whiteMuted, fontSize: '0.85rem', fontWeight: 600, fontFamily: tokens.font.family }}>{locName(lang, locSel)}</span>
                        </div>
                        <CircleCheck active={location === locSel} />
                      </div>
                    ))}
                  </div>

                  <div className="divider" style={{ margin: '0 0 1.4rem' }} />

                  {/* SERVICES */}
                  <Label text={t(lang, 's1.category')} />
                  <div className="cat-tabs-wrap" style={{ marginBottom: '1rem' }}>
                    {CATEGORIES.map(catSel => {
                      const has = selectedCats.includes(catSel);
                      return (
                        <button key={catSel} type="button" className={`cat-tab ${category === catSel ? 'cat-tab-active' : 'cat-tab-inactive'}`} onClick={() => setCategory(catSel)}>
                          {catName(lang, catSel)}{has && <span className="cat-tab-dot" />}
                        </button>
                      );
                    })}
                  </div>

                  <Label text={t(lang, 's1.chooseServices')} />
                  <p style={{ color: tokens.color.whiteFaint, fontSize: '0.72rem', marginBottom: '0.65rem', fontFamily: tokens.font.family }}>{t(lang, 's1.tapToSelect')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.9rem' }}>
                    {serviceList.map(s => {
                      const active = services.some(x => x.name === s.name && x.price === s.price);
                      return (
                        <div key={`${category}-${s.name}`} className={`svc-card${active ? ' svc-card-active' : ''}`} onClick={() => toggleService(s)} role="button" aria-pressed={active}>
                          <div>
                            <p style={{ color: tokens.color.whiteMuted, fontSize: '0.85rem', fontWeight: 500, fontFamily: tokens.font.family }}>{svcName(lang, s.name)}</p>
                            <p style={{ color: tokens.color.whiteFaint, fontSize: '0.71rem', marginTop: '0.12rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: tokens.font.family }}><Ico.Clock s={11} />{durStr(lang, s.duration)}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                            <span style={{ color: tokens.color.gold, fontSize: '0.85rem', fontWeight: 700, fontFamily: tokens.font.family }}>{s.price}</span>
                            <CircleCheck active={active} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {services.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(184,134,11,0.1)', border: '1px solid rgba(184,134,11,0.28)', borderRadius: '0.625rem', padding: '0.6rem 1rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flex: 1 }}>
                        {services.map(s => <span key={s.name} className="chip badge-pop" style={{ fontSize: '0.64rem' }}>{svcName(lang, s.name)}</span>)}
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: '0.75rem', textAlign: 'right' }}>
                        <p style={{ color: tokens.color.gold, fontWeight: 700, fontSize: '0.9rem', fontFamily: tokens.font.family }}>LKR {totalPrice.toLocaleString()}</p>
                        <p style={{ color: tokens.color.whiteFaint, fontSize: '0.68rem', fontFamily: tokens.font.family }}>{fmtDur(lang, totalMins)}</p>
                      </div>
                    </div>
                  )}

                  <div className="divider" style={{ margin: '0 0 1.4rem' }} />

                  {/* PROVIDERS */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <Label text={t(lang, 's1.serviceProvider')} />
                    {mode === 'confirmed' && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', borderRadius: '999px', padding: '0.12rem 0.5rem', background: 'rgba(255,255,255,0.06)', color: tokens.color.whiteFaint, border: '1px solid rgba(255,255,255,0.12)', fontFamily: tokens.font.family }}>
                        OPTIONAL
                      </span>
                    )}
                  </div>
                  {!location ? (
                    <div className="info-box" style={{ marginBottom: '1.2rem', display: 'flex', gap: '0.5rem' }}><Ico.Info s={13} /><span>{t(lang, 's1.selectBranchFirst')}</span></div>
                  ) : filteredProvs.length === 0 ? (
                    <p style={{ color: tokens.color.whiteFaint, fontSize: '0.8rem', marginBottom: '1.25rem', fontFamily: tokens.font.family }}>
                      {t(lang, 's1.noProvidersFor', { cats: catFilter.map(c => catName(lang, c)).join(', '), loc: locName(lang, location) })}
                    </p>
                  ) : (
                    <>
                      <p style={{ color: tokens.color.whiteFaint, fontSize: '0.72rem', marginBottom: '0.65rem', fontFamily: tokens.font.family }}>
                        {isMultiCat
                          ? `Select one specialist per category (${selectedCats.map(c => catName(lang, c)).join(', ')}) — ${maxProviders} total`
                          : t(lang, 's1.showingSpecialistsFor', { cats: catFilter.map(c => catName(lang, c)).join(', '), loc: locName(lang, location) })
                        }
                      </p>
                      {providers.length > 1 && <div className="info-box" style={{ marginBottom: '0.8rem', display: 'flex', gap: '0.5rem' }}><Ico.Info s={13} /><span>{t(lang, 's1.multiProviderInfo', { n: providers.length })}</span></div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.9rem' }}>
                        {filteredProvs.map(p => {
                          const active = providers.some(x => x.name === p.name);
                          return (
                            <div key={p.name} className={`prov-card${active ? ' prov-card-active' : ''}`} onClick={() => toggleProvider(p)} role="button" aria-pressed={active}>
                              <div className="prov-avatar">{p.avatar}</div>
                              <div style={{ flex: 1 }}>
                                <p style={{ color: tokens.color.whiteMuted, fontSize: '0.85rem', fontWeight: 600, fontFamily: tokens.font.family }}>{p.name}</p>
                                <p style={{ color: tokens.color.whiteFaint, fontSize: '0.71rem', marginTop: '0.1rem', fontFamily: tokens.font.family }}>{roleName(lang, p.role)}</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', marginTop: '0.32rem' }}>
                                  {p.expertise.map(e => {
                                    const m = catFilter.includes(e);
                                    return <span key={e} style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', borderRadius: '999px', padding: '0.12rem 0.45rem', fontFamily: tokens.font.family, background: m ? 'rgba(184,134,11,0.25)' : 'rgba(255,255,255,0.06)', color: m ? tokens.color.gold : tokens.color.whiteFaint, border: `1px solid ${m ? 'rgba(184,134,11,0.5)' : 'rgba(255,255,255,0.12)'}` }}>{catName(lang, e)}</span>;
                                  })}
                                </div>
                              </div>
                              <CircleCheck active={active} />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {providers.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.9rem' }}>
                      {providers.map(p => <span key={p.name} className="chip badge-pop"><Ico.Check s={9} c={tokens.color.gold} />{p.name}</span>)}
                    </div>
                  )}

                  <div className="divider" style={{ margin: '0 0 1.4rem' }} />

                  {/* DATE */}
                  <Label text={t(lang, 's1.preferredDate')} />
                  <DatePickerField value={date} minDate={today} onChange={handleDateChange} lang={lang} />

                  {/* TIME */}
                  {date && (
                    <TimeSectionCard
                      date={date} mode={mode} onModeChange={handleModeChange}
                      timeSlot={timeSlot} loadingSlots={loadingSlots} slotsError={slotsError}
                      walkinDisabledReason={walkinDisabledReason}
                      classifySlot={classifySlot} handleSlotClick={handleSlotClick}
                      multiProvider={providers.length > 1} setTimeSlot={setTimeSlot}
                      lang={lang}
                      /* R5 */
                      highlightedSlots={highlightedSlots}
                      onSlotHover={setHoveredSlot}
                      slotResults={slotResults}
                    />
                  )}

                  {/* missing-fields hint */}
                  {!canStep2 && (gender || location || services.length > 0) && (
                    <div style={{ background: 'rgba(184,134,11,0.07)', border: '1px solid rgba(184,134,11,0.22)', borderRadius: '0.5rem', padding: '0.55rem 0.85rem', marginTop: '1rem', marginBottom: '0.85rem', fontSize: '0.71rem', color: tokens.color.whiteFaint, fontFamily: tokens.font.family, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {!location             && <span>• {t(lang, 's1.missingBranch')}</span>}
                      {!gender               && <span>• {t(lang, 's1.missingGender')}</span>}
                      {!phone.trim()         && <span>• {t(lang, 's1.missingPhone')}</span>}
                      {services.length === 0 && <span>• {t(lang, 's1.missingServices')}</span>}
                      {/* Provider hint — only shown for walk-in mode */}
                      {mode === 'without_confirmation' && providers.length === 0 && (
                        <span>• {t(lang, 's1.missingProvider')}</span>
                      )}
                      {mode === 'without_confirmation' && providers.length > 0 && !providerRequirementMet && isMultiCat && (
                        <span>• {t(lang, 's1.missingMatch', { p: providers.length, s: selectedCats.length })}</span>
                      )}
                      {!date                 && <span>• {t(lang, 's1.missingDate')}</span>}
                      {!timeSlot             && <span>• {t(lang, 's1.missingTime')}</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button className={btnClass} type="button" disabled={!canStep2} onClick={() => setStep(2)} style={{ padding: '0.85rem 2.2rem', fontSize: '0.9rem' }}>
                      {t(lang, 's1.reviewBooking')} <Ico.Right />
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {/* ════════════ STEP 2 ════════════ */}
            {step === 2 && (
              <div className="reveal-up">
                <Card mode={mode}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <span className={`mode-badge ${mode === 'without_confirmation' ? 'mode-badge-walkin' : 'mode-badge-confirmed'}`}>
                      {mode === 'without_confirmation' ? <><Ico.Walk s={11} /> {t(lang, 'mode.without')}</> : <><Ico.CalCheck s={11} /> {t(lang, 'mode.with')}</>}
                    </span>
                    <h2 style={{ color: tokens.color.white, fontSize: '1.25rem', fontWeight: 600, fontFamily: tokens.font.family, marginBottom: '0.2rem' }}>{t(lang, 's2.reviewYourBooking')}</h2>
                    <p style={{ color: tokens.color.whiteFaint, fontSize: '0.78rem', fontFamily: tokens.font.family }}>{t(lang, 's2.confirmLooksRight')}</p>
                  </div>

                  {mode === 'without_confirmation' && (
                    <div className="info-box-green" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <Ico.Info s={13} />
                      <span style={{ fontSize: '0.75rem', color: tokens.color.whiteDim, fontFamily: tokens.font.family }}>{t(lang, 's2.walkinBox')}</span>
                    </div>
                  )}

                  {apiError && <div className="api-error">⚠ {apiError}</div>}

                  <div className="cf-block">
                    <SumRow icon={<Ico.User />}     label={t(lang, 'sum.name')}   value={name} />
                    <SumRow icon={<Ico.Phone />}    label={t(lang, 'sum.phone')}  value={phone} />
                    <SumRow icon={<Ico.Mail />}     label={t(lang, 'sum.email')}  value={email} />
                    <SumRow icon={<GenderSymbol value={gender} s={13} />} label={t(lang, 'sum.gender')} value={gender ? t(lang, `gender.${gender}`) : '—'} />
                    <SumRow icon={<Ico.Location />} label={t(lang, 'sum.branch')} value={locName(lang, location)} />
                  </div>

                  <div className="cf-block">
                    <SumRow icon={<Ico.Scissors />} label={t(lang, 'sum.services')}  value={services.map(s => svcName(lang, s.name)).join(', ')} />
                    <SumRow icon={<Ico.Clock />}    label={t(lang, 'sum.duration')}   value={fmtDur(lang, totalMins)} />
                    <SumRow icon={<Ico.User />}     label={t(lang, 'sum.providers')}  value={providers.map(p => `${p.name} — ${roleName(lang, p.role)}`).join(', ')} />
                    <SumRow icon={<Ico.Calendar />} label={t(lang, 'sum.date')}       value={date ? formatDate(date, lang) : ''} />
                    <SumRow icon={<Ico.Clock />}    label={t(lang, 'sum.time')}       value={timeSlot} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tokens.color.goldBg, border: `1px solid ${tokens.color.goldBorder}`, borderRadius: '0.75rem', padding: '0.85rem 1.1rem', marginBottom: '1.25rem' }}>
                    <span style={{ color: tokens.color.whiteMuted, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: tokens.font.family }}>{t(lang, 's2.totalPrice')}</span>
                    <span style={{ color: tokens.color.gold, fontSize: '1.15rem', fontWeight: 700, fontFamily: tokens.font.family }}>LKR {totalPrice.toLocaleString()}</span>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <FieldLabel text={t(lang, 's2.specialRequests')} opt lang={lang} />
                    <textarea className="sayo-input" placeholder={t(lang, 's2.notesPlaceholder')} value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ resize: 'vertical', minHeight: '76px', lineHeight: 1.6 }} />
                  </div>

                  <p style={{ color: tokens.color.whiteFaint, fontSize: '0.7rem', lineHeight: 1.75, marginBottom: '1.25rem', fontFamily: tokens.font.family }}>
                    {t(lang, mode === 'without_confirmation' ? 's2.walkinPolicy' : 's2.confirmPolicy')}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <button className="btn-ghost" type="button" onClick={() => { setStep(1); setApiError(''); }} style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem' }}>{t(lang, 's2.back')}</button>
                    <button className={btnClass} type="button" disabled={loading} onClick={handleConfirm} style={{ padding: '0.8rem 2rem', fontSize: '0.87rem', minWidth: '210px' }}>
                      {loading
                        ? <><span style={{ width: '0.85rem', height: '0.85rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />{t(lang, mode === 'without_confirmation' ? 's2.registering' : 's2.confirming')}</>
                        : t(lang, mode === 'without_confirmation' ? 's2.registerWithout' : 's2.confirmBooking')
                      }
                    </button>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>
      </main>

      {conflictModal && (
        <ConflictModal
          data={conflictModal}
          onBookBackToBack={handleBookBackToBack}
          onBookSplit={handleBookSplit}
          onBookSwapped={handleBookSwapped}
          onClose={() => setConflictModal(null)}
          lang={lang}
        />
      )}
    </>
  );
}