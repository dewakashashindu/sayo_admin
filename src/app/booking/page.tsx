'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  },
  font: {
    family:    'Inter, sans-serif',
    heroTitle: 'clamp(1.8rem, 4vw, 3.5rem)',
    heroSub:   'clamp(0.85rem, 1.5vw, 1.2rem)',
  },
  radius: {
    card:  '1.25rem',
    pill:  '1.25rem',
    input: '0.625rem',
  },
} as const;

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
type BookingMode = 'confirmed' | 'walkin';
type Step        = 'select' | 1 | 2;
type GenderValue = 'male' | 'female' | 'prefer_not_to_say' | 'other';

export const GENDER_OPTIONS: { value: GenderValue; label: string }[] = [
  { value: 'male',              label: 'Male'               },
  { value: 'female',            label: 'Female'             },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other',             label: 'Other'              },
];

interface ServiceItem {
  name:     string;
  price:    string;
  duration: string;
  category: string;
}
interface Provider {
  name:      string;
  role:      string;
  avatar:    string;
  expertise: string[];
}

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
function formatDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function parseMins(d: string) { return parseInt(d, 10) || 0; }
function fmtMins(m: number) {
  if (m <= 0) return '—';
  return m >= 60
    ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
    : `${m} min`;
}
function parseLKR(p: string) { return parseInt(p.replace(/\D/g, ''), 10) || 0; }
function genderLabel(val: GenderValue | ''): string {
  return GENDER_OPTIONS.find(g => g.value === val)?.label ?? '—';
}

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#040405;}

  @keyframes fadeInUp {from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn   {from{opacity:0}to{opacity:1}}
  @keyframes checkPop {0%{transform:scale(0) rotate(-20deg);opacity:0}70%{transform:scale(1.2) rotate(5deg)}100%{transform:scale(1) rotate(0);opacity:1}}
  @keyframes spin     {to{transform:rotate(360deg)}}
  @keyframes badgePop {from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
  @keyframes slotPop  {from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
  @keyframes scaleIn  {from{opacity:0;transform:scale(0.96) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}

  .reveal-up {animation:fadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) both;}
  .scale-in  {animation:scaleIn  0.45s cubic-bezier(0.16,1,0.3,1) both;}
  .fade-in   {animation:fadeIn   0.35s ease both;}
  .check-pop {animation:checkPop 0.5s  cubic-bezier(0.34,1.56,0.64,1) 0.1s both;}
  .badge-pop {animation:badgePop 0.25s cubic-bezier(0.34,1.56,0.64,1) both;}
  .slot-pop  {animation:slotPop  0.2s  cubic-bezier(0.16,1,0.3,1) both;}

  .fs-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:1.5rem;}
  .fs-bg{position:absolute;inset:0;background:rgba(4,4,5,0.88);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}

  .mode-option{cursor:pointer;border-radius:1.5rem;padding:2.5rem 2rem;display:flex;flex-direction:column;align-items:center;gap:1rem;text-align:center;flex:1;min-width:0;max-width:280px;position:relative;overflow:hidden;transition:transform 0.32s cubic-bezier(0.16,1,0.3,1),box-shadow 0.32s;}
  .mode-option-confirmed{background:rgba(184,134,11,0.08);border:2px solid rgba(184,134,11,0.35);}
  .mode-option-confirmed:hover{transform:translateY(-4px);box-shadow:0 20px 60px rgba(184,134,11,0.22);border-color:rgba(184,134,11,0.7);background:rgba(184,134,11,0.14);}
  .mode-option-walkin{background:rgba(34,197,94,0.07);border:2px solid rgba(34,197,94,0.3);}
  .mode-option-walkin:hover{transform:translateY(-4px);box-shadow:0 20px 60px rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.65);background:rgba(34,197,94,0.12);}
  .mode-icon-ring{width:4rem;height:4rem;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:0.25rem;}

  .step-dot  {width:2.4rem;height:2.4rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.82rem;font-weight:600;flex-shrink:0;transition:all 0.35s;font-family:Inter,sans-serif;}
  .step-line {flex:1;height:2px;border-radius:2px;transition:background 0.5s;}
  .step-label{font-size:0.6rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;font-family:Inter,sans-serif;margin-top:0.3rem;}

  .mode-badge{display:inline-flex;align-items:center;gap:0.35rem;border-radius:999px;padding:0.22rem 0.75rem;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;font-family:Inter,sans-serif;margin-bottom:1rem;}
  .mode-badge-confirmed{background:rgba(184,134,11,0.18);border:1px solid rgba(184,134,11,0.45);color:#B8860B;}
  .mode-badge-walkin   {background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#22c55e;}

  .gender-select-wrap{position:relative;margin-bottom:1.4rem;}
  .gender-select-wrap select{appearance:none;-webkit-appearance:none;width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);border-radius:0.625rem;padding:0.78rem 2.5rem 0.78rem 1rem;font-family:Inter,sans-serif;font-size:0.9rem;color:#fff;outline:none;cursor:pointer;transition:border-color 0.25s,background 0.25s;color-scheme:dark;}
  .gender-select-wrap select:focus{border-color:#B8860B;background:rgba(184,134,11,0.07);}
  .gender-select-wrap select option{background:#1a1a1a;color:#fff;}
  .gender-select-arrow{position:absolute;right:0.9rem;top:50%;transform:translateY(-50%);pointer-events:none;color:rgba(255,255,255,0.4);}
  .gender-select-wrap.auto-filled select{border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);}

  .cat-tabs-wrap{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:0.5rem;padding-bottom:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
  .cat-tabs-wrap::-webkit-scrollbar{display:none;}
  .cat-tab{cursor:pointer;outline:none;border:none;font-family:Inter,sans-serif;font-size:0.74rem;font-weight:600;letter-spacing:0.1em;border-radius:0.5rem;padding:0.42rem 0.9rem;white-space:nowrap;transition:all 0.22s;position:relative;}
  .cat-tab-active  {background:#B8860B;color:#fff;box-shadow:0 4px 16px rgba(184,134,11,0.38);}
  .cat-tab-inactive{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.65);border:1.5px solid rgba(255,255,255,0.18);}
  .cat-tab-inactive:hover{border-color:#B8860B;color:#fff;background:rgba(184,134,11,0.1);}
  .cat-tab-dot{position:absolute;top:-3px;right:-3px;width:0.5rem;height:0.5rem;border-radius:50%;background:#22c55e;border:1.5px solid #040405;}

  .svc-card{cursor:pointer;border-radius:0.75rem;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);padding:0.8rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;transition:all 0.2s;}
  .svc-card:hover {border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);transform:translateY(-1px);}
  .svc-card-active{border-color:#B8860B !important;background:rgba(184,134,11,0.15) !important;}

  .prov-card{cursor:pointer;border-radius:0.75rem;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);padding:0.8rem 1rem;display:flex;align-items:center;gap:0.85rem;transition:all 0.2s;}
  .prov-card:hover {border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);transform:translateY(-1px);}
  .prov-card-active{border-color:#B8860B !important;background:rgba(184,134,11,0.15) !important;}
  .prov-avatar{width:2.6rem;height:2.6rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;font-size:1.05rem;font-weight:700;color:#fff;flex-shrink:0;background:rgba(184,134,11,0.35);border:1.5px solid rgba(184,134,11,0.55);}

  .t-slot{cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:Inter,sans-serif;font-size:0.74rem;font-weight:500;text-align:center;transition:all 0.18s;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.72);}
  .t-slot:hover {border-color:#B8860B;background:rgba(184,134,11,0.12);color:#fff;transform:translateY(-1px);}
  .t-slot-active{border-color:#B8860B !important;background:#B8860B !important;color:#fff !important;}
  .t-slot-available{cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:Inter,sans-serif;font-size:0.74rem;font-weight:600;text-align:center;transition:all 0.18s;border:1.5px solid rgba(34,197,94,0.45);background:rgba(34,197,94,0.1);color:#22c55e;}
  .t-slot-available:hover{background:rgba(34,197,94,0.22);transform:translateY(-1px);}
  .t-slot-available-selected{border-color:#22c55e !important;background:#22c55e !important;color:#fff !important;}
  .t-slot-booked{border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:Inter,sans-serif;font-size:0.74rem;font-weight:500;text-align:center;border:1.5px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:rgba(239,68,68,0.55);text-decoration:line-through;cursor:not-allowed;opacity:0.7;}

  .legend-dot{width:0.55rem;height:0.55rem;border-radius:50%;flex-shrink:0;display:inline-block;}

  .sayo-input{width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);border-radius:0.625rem;padding:0.75rem 1rem;font-family:Inter,sans-serif;font-size:0.9rem;color:#fff;outline:none;transition:border-color 0.25s,background 0.25s;color-scheme:dark;}
  .sayo-input::placeholder{color:rgba(255,255,255,0.3);}
  .sayo-input:focus{border-color:#B8860B;background:rgba(184,134,11,0.07);}
  .sayo-input option{background:#1a1a1a;color:#fff;}

  .btn-gold {cursor:pointer;outline:none;border:none;font-family:Inter,sans-serif;font-weight:600;letter-spacing:0.06em;border-radius:0.75rem;background:#B8860B;color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;}
  .btn-gold:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(184,134,11,0.38);}
  .btn-gold:disabled{opacity:0.42;cursor:not-allowed;}
  .btn-green{cursor:pointer;outline:none;border:none;font-family:Inter,sans-serif;font-weight:600;letter-spacing:0.06em;border-radius:0.75rem;background:#22c55e;color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;}
  .btn-green:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(34,197,94,0.35);}
  .btn-green:disabled{opacity:0.42;cursor:not-allowed;}
  .btn-ghost{cursor:pointer;outline:none;background:transparent;border:1.5px solid rgba(255,255,255,0.28);border-radius:0.75rem;font-family:Inter,sans-serif;font-weight:500;color:rgba(255,255,255,0.65);transition:all 0.2s;}
  .btn-ghost:hover{border-color:#B8860B;color:#fff;transform:translateY(-2px);}

  .sum-row{display:flex;justify-content:space-between;align-items:flex-start;padding:0.52rem 0;border-bottom:1px solid rgba(255,255,255,0.07);gap:1rem;}
  .sum-row:last-child{border-bottom:none;}
  .cf-block{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:0.875rem;padding:0.2rem 1rem;margin-bottom:0.9rem;}

  .chip{display:inline-flex;align-items:center;gap:0.28rem;background:rgba(184,134,11,0.18);border:1px solid rgba(184,134,11,0.4);border-radius:999px;padding:0.2rem 0.6rem;font-size:0.69rem;font-weight:600;color:#B8860B;font-family:Inter,sans-serif;white-space:nowrap;}

  .info-box      {background:rgba(184,134,11,0.09);border:1px solid rgba(184,134,11,0.28);border-radius:0.625rem;padding:0.65rem 0.9rem;font-size:0.75rem;color:rgba(255,255,255,0.65);font-family:Inter,sans-serif;line-height:1.55;}
  .info-box-green{background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3); border-radius:0.625rem;padding:0.65rem 0.9rem;font-size:0.75rem;color:rgba(255,255,255,0.65);font-family:Inter,sans-serif;line-height:1.55;}
  .api-error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:0.625rem;padding:0.7rem 1rem;font-size:0.78rem;color:#ef4444;font-family:Inter,sans-serif;line-height:1.55;margin-bottom:1rem;}
  .divider{height:1px;background:rgba(255,255,255,0.09);margin:1.2rem 0;}

  .loc-card{cursor:pointer;border-radius:0.875rem;border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);padding:0.9rem 1.1rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;transition:all 0.22s;flex:1;min-width:0;}
  .loc-card:hover{border-color:rgba(184,134,11,0.5);background:rgba(184,134,11,0.08);transform:translateY(-1px);}
  .loc-card-active{border-color:#B8860B !important;background:rgba(184,134,11,0.14) !important;}

  .phone-autofilled{
    display:inline-flex;align-items:center;gap:0.4rem;
    background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);
    border-radius:0.5rem;padding:0.55rem 0.85rem;
    font-family:Inter,sans-serif;font-size:0.85rem;color:#fff;width:100%;
    margin-bottom:1.25rem;
  }
  .phone-autofilled-dot{width:0.45rem;height:0.45rem;border-radius:50%;background:#22c55e;flex-shrink:0;}

  .spinner-sm{
    width:1rem;height:1rem;border:2px solid rgba(34,197,94,0.3);
    border-top-color:#22c55e;border-radius:50%;display:inline-block;
    animation:spin 0.7s linear infinite;
  }

  @media(max-width:600px){
    .time-grid{grid-template-columns:repeat(3,1fr) !important;}
    .mode-options-wrap{flex-direction:column !important;gap:1rem !important;}
    .mode-option{max-width:100% !important;}
    .loc-cards-wrap{flex-direction:column !important;}
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const Ico = {
  Check: ({ s = 16, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Right: ({ s = 15 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Clock: ({ s = 12 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Calendar: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  ),
  User: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Scissors: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6"  cy="6"  r="3" />
      <circle cx="6"  cy="18" r="3" />
      <line x1="20" y1="4"    x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12"  y1="8.12"  x2="12" y2="12" />
    </svg>
  ),
  Location: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Phone: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.9-8.2A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z" />
    </svg>
  ),
  Mail: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  CalCheck: ({ s = 15 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
      <path d="m16 19 2 2 4-4" />
    </svg>
  ),
  Walk: ({ s = 15 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2" />
      <path d="m15 8-4 1-2 4 3 2v5h2v-6l-2-2 1-2" />
      <path d="m9 21-1-5 3-2" />
    </svg>
  ),
  Info: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8"  x2="12.01" y2="8" />
    </svg>
  ),
  MapPin: ({ s = 18, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Gender: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="14" r="4" />
      <path d="M18 2 l-4 4 4 4" />
      <line x1="22" y1="2" x2="14" y2="10" />
      <line x1="10" y1="18" x2="10" y2="22" />
      <line x1="7"  y1="21" x2="13" y2="21" />
    </svg>
  ),
  ChevronDown: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Lock: ({ s = 12 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};

/* ─────────────────────────────────────────
   STEP INDICATOR
───────────────────────────────────────── */
const STEPS_DEF = [
  { n: 1, label: 'Your Appointment' },
  { n: 2, label: 'Review & Confirm' },
];

function StepIndicator({ current, mode }: { current: 1 | 2; mode: BookingMode }) {
  const activeColor = mode === 'walkin' ? tokens.color.green : tokens.color.gold;
  return (
    <div style={{ display:'flex', alignItems:'center', maxWidth:'400px', margin:'0 auto clamp(1.75rem,4vw,2.5rem)' }}>
      {STEPS_DEF.map((s, i) => {
        const done   = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} style={{ display:'flex', alignItems:'center', flex: i < STEPS_DEF.length - 1 ? 1 : undefined }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.3rem' }}>
              <div className="step-dot" style={{
                background: done ? activeColor : active ? `rgba(${mode === 'walkin' ? '34,197,94' : '184,134,11'},0.18)` : 'rgba(255,255,255,0.06)',
                border:     active ? `2px solid ${activeColor}` : done ? 'none' : '2px solid rgba(255,255,255,0.18)',
                color:      done || active ? '#fff' : tokens.color.whiteFaint,
              }}>
                {done ? <Ico.Check s={14} c="#fff" /> : s.n}
              </div>
              <span className="step-label" style={{
                color: active ? activeColor : done ? tokens.color.whiteDim : tokens.color.whiteFaint,
              }}>
                {s.label}
              </span>
            </div>
            {i < STEPS_DEF.length - 1 && (
              <div className="step-line" style={{ margin:'0 0.4rem 1.4rem', background: done ? activeColor : 'rgba(255,255,255,0.12)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   SHARED UI
───────────────────────────────────────── */
function Card({ children, style, mode }: { children: React.ReactNode; style?: React.CSSProperties; mode?: BookingMode }) {
  return (
    <div style={{
      background: tokens.color.cardBg,
      border: `1px solid ${mode === 'walkin' ? 'rgba(34,197,94,0.2)' : mode === 'confirmed' ? 'rgba(184,134,11,0.22)' : tokens.color.whiteBorder}`,
      borderRadius: tokens.radius.card,
      padding: 'clamp(1.25rem,3vw,1.85rem)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <p style={{
      color: tokens.color.gold, fontSize:'0.67rem', fontWeight:700,
      letterSpacing:'0.22em', textTransform:'uppercase',
      marginBottom:'0.6rem', fontFamily: tokens.font.family,
    }}>
      {text}
    </p>
  );
}

function FieldLabel({ text, opt }: { text: string; opt?: boolean }) {
  return (
    <label style={{
      display:'block', color: tokens.color.whiteDim, fontSize:'0.78rem',
      fontWeight:500, marginBottom:'0.35rem', fontFamily: tokens.font.family,
    }}>
      {text}
      {opt && <span style={{ color: tokens.color.whiteFaint, marginLeft:'0.3rem' }}>(optional)</span>}
    </label>
  );
}

function CircleCheck({ active, green }: { active: boolean; green?: boolean }) {
  const col = green ? tokens.color.green : tokens.color.gold;
  return (
    <div style={{
      width:'1.25rem', height:'1.25rem', borderRadius:'50%', flexShrink:0,
      background: active ? col : 'rgba(255,255,255,0.08)',
      border:     active ? 'none' : '1.5px solid rgba(255,255,255,0.22)',
      display:'flex', alignItems:'center', justifyContent:'center',
      transition:'all 0.2s',
    }}>
      {active && <Ico.Check s={9} c="#fff" />}
    </div>
  );
}

function SumRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sum-row">
      <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', color: tokens.color.whiteFaint }}>
        {icon}
        <span style={{ fontSize:'0.76rem', fontFamily: tokens.font.family }}>{label}</span>
      </div>
      <span style={{
        color: tokens.color.whiteMuted, fontSize:'0.82rem', fontWeight:500,
        fontFamily: tokens.font.family, textAlign:'right', maxWidth:'58%',
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────
   GENDER SELECT
───────────────────────────────────────── */
function GenderSelect({
  value,
  onChange,
  autoFilled,
}: {
  value:      GenderValue | '';
  onChange:   (v: GenderValue) => void;
  autoFilled: boolean;
}) {
  return (
    <div className={`gender-select-wrap${autoFilled ? ' auto-filled' : ''}`}>
      <select value={value} onChange={e => onChange(e.target.value as GenderValue)}>
        <option value="" disabled>Select gender…</option>
        {GENDER_OPTIONS.map(g => (
          <option key={g.value} value={g.value}>{g.label}</option>
        ))}
      </select>
      <span className="gender-select-arrow">
        {autoFilled ? <Ico.Lock s={13} /> : <Ico.ChevronDown s={16} />}
      </span>
      {autoFilled && (
        <div style={{
          position:'absolute', top:'-0.55rem', left:'0.75rem',
          background:'rgba(34,197,94,0.18)', border:'1px solid rgba(34,197,94,0.4)',
          borderRadius:'999px', padding:'0.05rem 0.5rem',
          fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.08em',
          color: tokens.color.green, fontFamily: tokens.font.family,
          display:'flex', alignItems:'center', gap:'0.25rem',
        }}>
          <Ico.Check s={8} c={tokens.color.green} /> Auto-filled
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   PHONE DISPLAY
───────────────────────────────────────── */
function PhoneDisplay({
  phone,
  autoFilled,
  onChange,
}: {
  phone:      string;
  autoFilled: boolean;
  onChange:   (v: string) => void;
}) {
  if (autoFilled) {
    return (
      <div style={{ position:'relative', marginBottom:'1.25rem' }}>
        <div style={{
          position:'absolute', top:'-0.55rem', left:'0.75rem', zIndex:1,
          background:'rgba(34,197,94,0.18)', border:'1px solid rgba(34,197,94,0.4)',
          borderRadius:'999px', padding:'0.05rem 0.5rem',
          fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.08em',
          color: tokens.color.green, fontFamily: tokens.font.family,
          display:'flex', alignItems:'center', gap:'0.25rem',
        }}>
          <Ico.Check s={8} c={tokens.color.green} /> Auto-filled
        </div>
        <div className="phone-autofilled">
          <span className="phone-autofilled-dot" />
          <Ico.Phone s={13} />
          <span style={{ flex:1 }}>{phone}</span>
          <Ico.Lock s={12} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:'1.25rem' }}>
      <input
        type="tel"
        className="sayo-input"
        placeholder="07X XXX XXXX"
        value={phone}
        onChange={e => onChange(e.target.value)}
      />
      {!phone.trim() && (
        <p style={{ color:'rgba(239,68,68,0.75)', fontSize:'0.7rem', fontFamily: tokens.font.family, marginTop:'0.3rem' }}>
          ⚠ Phone number is required to continue.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   TIME SLOTS
───────────────────────────────────────── */
function ConfirmedTimeSlots({ timeSlot, setTimeSlot }: { timeSlot: string; setTimeSlot: (s: string) => void }) {
  return (
    <div className="time-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.42rem', marginBottom:'1.25rem' }}>
      {TIME_SLOTS.map(slot => (
        <button key={slot} className={`t-slot${timeSlot === slot ? ' t-slot-active' : ''}`} onClick={() => setTimeSlot(slot)}>
          {slot}
        </button>
      ))}
    </div>
  );
}

/* ── WALKIN — now driven by REAL DB availability ── */
function WalkinTimeSlots({
  timeSlot,
  setTimeSlot,
  bookedSlots,
  loading,
  error,
  disabledReason,
}: {
  timeSlot:       string;
  setTimeSlot:    (s: string) => void;
  bookedSlots:    Set<string>;
  loading:        boolean;
  error:          string;
  disabledReason: string;
}) {
  if (disabledReason) {
    return (
      <div className="info-box" style={{ marginBottom:'1.25rem', display:'flex', gap:'0.5rem' }}>
        <Ico.Info s={13} />
        <span>{disabledReason}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        gap:'0.6rem', padding:'2rem 0', marginBottom:'1.25rem',
      }}>
        <span className="spinner-sm" />
        <span style={{ color: tokens.color.whiteFaint, fontSize:'0.78rem', fontFamily: tokens.font.family }}>
          Checking live availability…
        </span>
      </div>
    );
  }

  const availableCount = TIME_SLOTS.filter(s => !bookedSlots.has(s)).length;
  const bookedCount    = TIME_SLOTS.filter(s =>  bookedSlots.has(s)).length;

  return (
    <>
      {error && (
        <div className="info-box" style={{ marginBottom:'0.75rem', display:'flex', gap:'0.5rem' }}>
          <Ico.Info s={13} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
          <span className="legend-dot" style={{ background: tokens.color.green }} />
          <span style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', fontFamily: tokens.font.family }}>
            Available ({availableCount})
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
          <span className="legend-dot" style={{ background: tokens.color.red }} />
          <span style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', fontFamily: tokens.font.family }}>
            Booked ({bookedCount})
          </span>
        </div>
      </div>

      <div className="time-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.42rem', marginBottom:'1.25rem' }}>
        {TIME_SLOTS.map(slot => {
          const booked   = bookedSlots.has(slot);
          const selected = timeSlot === slot;
          if (booked) return <div key={slot} className="t-slot-booked slot-pop">{slot}</div>;
          return (
            <button key={slot}
              className={`t-slot-available slot-pop${selected ? ' t-slot-available-selected' : ''}`}
              onClick={() => setTimeSlot(slot)}>
              {slot}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   BOOKING TYPE SELECTOR
───────────────────────────────────────── */
function BookingTypeSelector({ onSelect }: { onSelect: (m: BookingMode) => void }) {
  return (
    <div className="fs-overlay">
      <div className="fs-bg" />
      <div className="scale-in" style={{ position:'relative', zIndex:1, maxWidth:'680px', width:'100%' }}>
        <div style={{ textAlign:'center', marginBottom:'3rem' }}>
          <p style={{ color: tokens.color.gold, fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.35em', textTransform:'uppercase', marginBottom:'0.75rem', fontFamily: tokens.font.family }}>
            Online Booking
          </p>
          <h1 style={{ color: tokens.color.white, fontSize:'clamp(1.9rem,4vw,3rem)', fontWeight:600, lineHeight:1.15, marginBottom:'0.75rem', fontFamily: tokens.font.family }}>
            Reserve Your <span style={{ color: tokens.color.gold }}>Luxury</span> Moment
          </h1>
          <p style={{ color: tokens.color.whiteFaint, fontSize:'0.92rem', lineHeight:1.7, fontFamily: tokens.font.family }}>
            How would you like to book today?
          </p>
        </div>

        <div className="mode-options-wrap" style={{ display:'flex', gap:'1.25rem', justifyContent:'center' }}>
          <div className="mode-option mode-option-confirmed" onClick={() => onSelect('confirmed')} role="button">
            <div className="mode-icon-ring" style={{ background:'rgba(184,134,11,0.15)', border:'1.5px solid rgba(184,134,11,0.5)', color: tokens.color.gold }}>
              <Ico.CalCheck s={26} />
            </div>
            <div>
              <p style={{ color: tokens.color.gold, fontSize:'1.05rem', fontWeight:700, fontFamily: tokens.font.family, marginBottom:'0.45rem' }}>With Confirmation</p>
              <p style={{ color: tokens.color.whiteFaint, fontSize:'0.78rem', fontFamily: tokens.font.family, lineHeight:1.65 }}>
                Choose your preferred slot and we&apos;ll confirm your appointment via email.
              </p>
            </div>
            <div style={{ width:'100%', marginTop:'0.5rem', padding:'0.5rem 0.75rem', background:'rgba(184,134,11,0.12)', border:'1px solid rgba(184,134,11,0.3)', borderRadius:'0.5rem', color: tokens.color.whiteDim, fontSize:'0.72rem', fontFamily: tokens.font.family }}>
              ✦ Email confirmation sent
            </div>
          </div>

          <div className="mode-option mode-option-walkin" onClick={() => onSelect('walkin')} role="button">
            <div className="mode-icon-ring" style={{ background:'rgba(34,197,94,0.12)', border:'1.5px solid rgba(34,197,94,0.45)', color: tokens.color.green }}>
              <Ico.Walk s={26} />
            </div>
            <div>
              <p style={{ color: tokens.color.green, fontSize:'1.05rem', fontWeight:700, fontFamily: tokens.font.family, marginBottom:'0.45rem' }}>Without Confirmation</p>
              <p style={{ color: tokens.color.whiteFaint, fontSize:'0.78rem', fontFamily: tokens.font.family, lineHeight:1.65 }}>
                See live slot availability and register instantly — no email needed.
              </p>
            </div>
            <div style={{ width:'100%', marginTop:'0.5rem', padding:'0.5rem 0.75rem', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:'0.5rem', color: tokens.color.whiteDim, fontSize:'0.72rem', fontFamily: tokens.font.family }}>
              ✦ Instant registration, arrive on time
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function BookingPage() {
  const router = useRouter();

  const [mode,      setMode]      = useState<BookingMode>('confirmed');
  const [step,      setStep]      = useState<Step>('select');
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

  const [phoneAutoFilled,  setPhoneAutoFilled]  = useState(false);
  const [genderAutoFilled, setGenderAutoFilled] = useState(false);

  /* ── real-time DB availability state (walkin mode) ── */
  const [bookedSlots,  setBookedSlots]  = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError,   setSlotsError]   = useState('');

  /* ══ localStorage CHECK + AUTO-FILL ══ */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = localStorage.getItem('user');
    if (!raw) { router.replace('/login?redirect=/booking'); return; }

    try {
      const user = JSON.parse(raw) as StoredUser;

      if (user.name)  setName(user.name);
      if (user.email) setEmail(user.email);

      if (user.phoneNumber?.trim()) {
        setPhone(user.phoneNumber.trim());
        setPhoneAutoFilled(true);
      }

      if (user.gender?.trim()) {
        const raw_g   = user.gender.trim().toLowerCase();
        const byValue = GENDER_OPTIONS.find(g => g.value === raw_g);
        const byLabel = GENDER_OPTIONS.find(g => g.label.toLowerCase() === raw_g);
        const bySimple = GENDER_OPTIONS.find(g => raw_g.startsWith(g.value.split('_')[0]));
        const matched = byValue ?? byLabel ?? bySimple;
        if (matched) {
          setGender(matched.value);
          setGenderAutoFilled(true);
        }
      }
    } catch {
      localStorage.removeItem('user');
      router.replace('/login?redirect=/booking');
    }
  }, [router]);

  const today       = new Date().toISOString().split('T')[0];
  const serviceList = ALL_SERVICES[category] ?? [];

  const allBranchProvs              = location ? (PROVIDERS[location] ?? []) : [];
  const selectedCategories          = Array.from(new Set(services.map(s => s.category)));
  const categoriesForProviderFilter = selectedCategories.length > 0 ? selectedCategories : [category];
  const filteredProvs               = allBranchProvs.filter(p =>
    p.expertise.some(e => categoriesForProviderFilter.includes(e))
  );

  const providerNamesKey = providers.map(p => p.name).sort().join(',');

  /* ══ FETCH REAL-TIME AVAILABILITY (walkin mode only) ══
     Slot booked-status is now computed from the DATABASE,
     scoped to the selected provider(s) + date + location —
     NOT a hardcoded list. Different providers can be free
     at the same time another provider is booked. */
  useEffect(() => {
    if (mode !== 'walkin' || !date || providers.length === 0) {
      setBookedSlots(new Set());
      return;
    }

    const controller = new AbortController();

    const fetchAvailability = async () => {
      setLoadingSlots(true);
      setSlotsError('');
      try {
        const params = new URLSearchParams({ date });
        if (location)        params.set('location', location);
        if (providerNamesKey) params.set('providers', providerNamesKey);

        const res  = await fetch(`/api/bookings/availability?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();

        if (data.success) {
          const newBooked = new Set<string>(data.bookedSlots || []);
          setBookedSlots(newBooked);

          // if currently-selected slot just became booked, clear it
          if (timeSlot && newBooked.has(timeSlot)) {
            setTimeSlot('');
          }
        } else {
          setSlotsError('Could not load live availability. Please try again.');
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSlotsError('Could not load live availability. Please try again.');
        }
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchAvailability();
    return () => controller.abort();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, location, providerNamesKey]);

  /* reason walkin slots can't be shown yet */
  const walkinDisabledReason =
    mode === 'walkin' && providers.length === 0
      ? 'Please select a provider above to see their real-time availability.'
      : '';

  const canStep2 = !!gender && !!location && services.length > 0 &&
                   providers.length > 0 && !!date && !!timeSlot && !!phone.trim();

  const totalMins  = services.reduce((a, s) => a + parseMins(s.duration), 0);
  const totalPrice = services.reduce((a, s) => a + parseLKR(s.price), 0);

  const accentColor = mode === 'walkin' ? tokens.color.green : tokens.color.gold;
  const btnClass    = mode === 'walkin' ? 'btn-green' : 'btn-gold';

  const toggleService = (svc: ServiceItem) => {
    setServices(prev => {
      const exists = prev.some(s => s.name === svc.name && s.price === svc.price);
      return exists
        ? prev.filter(s => !(s.name === svc.name && s.price === svc.price))
        : [...prev, svc];
    });
  };

  const toggleProvider = (p: Provider) => {
    setProviders(prev =>
      prev.some(x => x.name === p.name)
        ? prev.filter(x => x.name !== p.name)
        : [...prev, p]
    );
    // provider change → clear stale time selection, force re-check
    setTimeSlot('');
  };

  const handleLocationChange = (loc: string) => {
    setLocation(loc);
    setProviders([]);
    setTimeSlot('');
  };

  const handleModeSelect = (m: BookingMode) => { setMode(m); setStep(1); };

  /* ══ SUBMIT ══ */
  const handleConfirm = async () => {
    setLoading(true);
    setApiError('');
    try {
      const payload = {
        name:          name.trim(),
        email:         email.trim().toLowerCase(),
        phone:         phone.trim(),
        gender:        genderLabel(gender as GenderValue),
        location, mode,
        services:      services.map(s => ({ name: s.name, price: s.price, duration: s.duration, category: s.category })),
        categories:    selectedCategories,
        totalDuration: totalMins,
        totalPrice,
        providers:     providers.map(p => ({ name: p.name, role: p.role })),
        date, timeSlot,
        notes: notes.trim() || null,
      };

      const res  = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setApiError(data.message || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      setBookingId(data.bookingId);
      setConfirmed(true);
    } catch {
      setApiError('Network error — please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMode('confirmed'); setStep('select'); setGender('');
    setLocation(''); setCategory('HAIR'); setServices([]); setProviders([]);
    setDate(''); setTimeSlot(''); setNotes('');
    setConfirmed(false); setLoading(false); setApiError('');
    setBookingId(null);
    setBookedSlots(new Set()); setSlotsError('');
  };

  /* ══ SUCCESS SCREEN ══ */
  if (confirmed) {
    return (
      <>
        <style>{globalCss}</style>
        <main style={{
          minHeight:'100vh', fontFamily: tokens.font.family,
          backgroundImage:'url(/booking.jpg)',
          backgroundSize:'cover', backgroundPosition:'center',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'2rem', position:'relative',
        }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(4,4,5,0.84)' }} />
          <div className="reveal-up" style={{ position:'relative', zIndex:1, maxWidth:'520px', width:'100%', textAlign:'center' }}>
            <div className="check-pop" style={{
              width:'5rem', height:'5rem', borderRadius:'50%',
              background: mode === 'walkin' ? 'rgba(34,197,94,0.15)' : 'rgba(184,134,11,0.15)',
              border: `2px solid ${accentColor}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              margin:'0 auto 1.5rem',
            }}>
              <Ico.Check s={32} c={accentColor} />
            </div>

            <span className={`mode-badge ${mode === 'walkin' ? 'mode-badge-walkin' : 'mode-badge-confirmed'}`}
              style={{ margin:'0 auto 0.75rem', display:'inline-flex' }}>
              {mode === 'walkin' ? <><Ico.Walk s={11} /> Without Confirmation</> : <><Ico.CalCheck s={11} /> Confirmed</>}
            </span>

            {bookingId && (
              <p style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', fontFamily: tokens.font.family, marginBottom:'0.4rem', letterSpacing:'0.1em' }}>
                Booking ID: <strong style={{ color: accentColor }}>#{bookingId}</strong>
              </p>
            )}

            <p style={{ color: accentColor, fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.28em', textTransform:'uppercase', marginBottom:'0.5rem' }}>
              Booking {mode === 'walkin' ? 'Registered' : 'Confirmed'}
            </p>

            <h2 style={{ color: tokens.color.white, fontSize:'clamp(1.6rem,3vw,2.2rem)', fontWeight:600, marginBottom:'0.75rem', fontFamily: tokens.font.family }}>
              See you soon, {name.split(' ')[0]}!
            </h2>

            <p style={{ color: tokens.color.whiteMuted, fontSize:'0.88rem', lineHeight:1.9, marginBottom:'2rem', fontFamily: tokens.font.family }}>
              <span style={{ color: accentColor }}>{services.map(s => s.name).join(', ')}</span>
              {' '}on{' '}
              <span style={{ color: accentColor }}>{date ? formatDate(date) : ''}</span>
              {' '}at{' '}
              <span style={{ color: accentColor }}>{timeSlot}</span>
              <br />with{' '}
              <span style={{ color: accentColor }}>{providers.map(p => p.name).join(' & ')}</span>
              <br />at our{' '}
              <span style={{ color: accentColor }}>{location}</span> branch.
              <br />
              <span style={{ color: tokens.color.whiteDim, fontSize:'0.8rem' }}>
                {mode === 'walkin'
                  ? 'Registered without confirmation — please arrive on time.'
                  : `Confirmation sent to ${email}`}
              </span>
            </p>

            <button className={btnClass} onClick={handleReset} style={{ padding:'0.85rem 2.5rem', fontSize:'0.9rem' }}>
              Book Another Appointment
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{globalCss}</style>

      {step === 'select' && (
        <main style={{ minHeight:'100vh', fontFamily: tokens.font.family, backgroundImage:'url(/booking.jpg)', backgroundSize:'cover', backgroundPosition:'center' }}>
          <BookingTypeSelector onSelect={handleModeSelect} />
        </main>
      )}

      {(step === 1 || step === 2) && (
        <main style={{
          minHeight:'100vh', fontFamily: tokens.font.family,
          backgroundImage:'url(/booking.jpg)',
          backgroundSize:'cover', backgroundPosition:'center',
          position:'relative',
        }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(4,4,5,0.76)', zIndex:0 }} />

          <div style={{ position:'relative', zIndex:1, padding:'clamp(1.5rem,5vw,3rem) clamp(1rem,4vw,2rem) clamp(3rem,6vw,5rem)' }}>

            <div className="reveal-up" style={{ textAlign:'center', marginBottom:'clamp(1.25rem,3vw,2rem)' }}>
              <p style={{ color: tokens.color.gold, fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:'0.4rem', fontFamily: tokens.font.family }}>
                Online Booking
              </p>
              <h1 style={{ color: tokens.color.white, fontSize:'clamp(1.4rem,3vw,2rem)', fontWeight:600, marginBottom:'0.4rem', fontFamily: tokens.font.family }}>
                Reserve Your <span style={{ color: accentColor }}>Luxury</span> Moment
              </h1>
              <button onClick={() => setStep('select')} style={{ background:'transparent', border:'none', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'0.4rem', color: tokens.color.whiteFaint, fontSize:'0.72rem', fontFamily: tokens.font.family, padding:'0.25rem 0.6rem', borderRadius:'999px', transition:'color 0.2s' }}>
                <span className={`mode-badge ${mode === 'walkin' ? 'mode-badge-walkin' : 'mode-badge-confirmed'}`} style={{ margin:0 }}>
                  {mode === 'walkin' ? <><Ico.Walk s={11} /> Without Confirmation</> : <><Ico.CalCheck s={11} /> With Confirmation</>}
                </span>
                <span style={{ fontSize:'0.65rem', opacity:0.55 }}>← change</span>
              </button>
            </div>

            <StepIndicator current={step as 1 | 2} mode={mode} />

            <div style={{ maxWidth:'680px', margin:'0 auto' }}>

              {/* ═══ STEP 1 ═══ */}
              {step === 1 && (
                <div className="reveal-up">
                  <Card mode={mode}>

                    <div style={{ marginBottom:'1.5rem' }}>
                      <h2 style={{ color: tokens.color.white, fontSize:'1.25rem', fontWeight:600, fontFamily: tokens.font.family, marginBottom:'0.2rem' }}>
                        Build Your Appointment
                      </h2>
                      <p style={{ color: tokens.color.whiteFaint, fontSize:'0.78rem', fontFamily: tokens.font.family }}>
                        Choose your branch, services, provider, date and time.
                      </p>
                    </div>

                    {/* ── LOCATION ── */}
                    <Label text="Branch / Location" />
                    <div className="loc-cards-wrap" style={{ display:'flex', gap:'0.65rem', marginBottom:'1.4rem', flexWrap:'wrap' }}>
                      {LOCATIONS.map(loc => (
                        <div key={loc}
                          className={`loc-card${location === loc ? ' loc-card-active' : ''}`}
                          onClick={() => handleLocationChange(loc)}
                          role="button" aria-pressed={location === loc}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                            <div style={{
                              width:'2rem', height:'2rem', borderRadius:'50%', flexShrink:0,
                              background: location === loc ? 'rgba(184,134,11,0.2)' : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${location === loc ? 'rgba(184,134,11,0.55)' : 'rgba(255,255,255,0.12)'}`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                            }}>
                              <Ico.MapPin s={13} c={location === loc ? tokens.color.gold : tokens.color.whiteFaint} />
                            </div>
                            <span style={{ color: location === loc ? tokens.color.gold : tokens.color.whiteMuted, fontSize:'0.85rem', fontWeight:600, fontFamily: tokens.font.family }}>
                              {loc}
                            </span>
                          </div>
                          <CircleCheck active={location === loc} />
                        </div>
                      ))}
                    </div>

                    <div className="divider" style={{ margin:'0 0 1.4rem' }} />

                    {/* ── GENDER ── */}
                    <Label text="Gender" />
                    <p style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', marginBottom:'0.75rem', fontFamily: tokens.font.family }}>
                      {genderAutoFilled
                        ? 'Pre-filled from your profile. You can change it if needed.'
                        : 'This helps us personalise your experience.'}
                    </p>
                    <GenderSelect value={gender} onChange={setGender} autoFilled={genderAutoFilled} />

                    <div className="divider" style={{ margin:'0 0 1.4rem' }} />

                    {/* ── PHONE ── */}
                    <Label text="Contact Number" />
                    <p style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', marginBottom:'0.55rem', fontFamily: tokens.font.family }}>
                      {phoneAutoFilled ? 'Pre-filled from your profile.' : 'Required for appointment reminders.'}
                    </p>
                    <PhoneDisplay phone={phone} autoFilled={phoneAutoFilled} onChange={setPhone} />

                    <div className="divider" style={{ margin:'0 0 1.4rem' }} />

                    {/* ── SERVICES ── */}
                    <Label text="Category" />
                    <div className="cat-tabs-wrap" style={{ marginBottom:'1rem' }}>
                      {CATEGORIES.map(cat => {
                        const hasSelection = selectedCategories.includes(cat);
                        return (
                          <button key={cat}
                            className={`cat-tab ${category === cat ? 'cat-tab-active' : 'cat-tab-inactive'}`}
                            onClick={() => setCategory(cat)}>
                            {cat}
                            {hasSelection && <span className="cat-tab-dot" />}
                          </button>
                        );
                      })}
                    </div>

                    <Label text="Choose Services" />
                    <p style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', marginBottom:'0.65rem', fontFamily: tokens.font.family }}>
                      Tap to select. You can pick multiple across categories.
                    </p>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem', marginBottom:'0.9rem' }}>
                      {serviceList.map(s => {
                        const active = services.some(x => x.name === s.name && x.price === s.price);
                        return (
                          <div key={`${category}-${s.name}`}
                            className={`svc-card${active ? ' svc-card-active' : ''}`}
                            onClick={() => toggleService(s)}
                            role="button" aria-pressed={active}>
                            <div>
                              <p style={{ color: tokens.color.whiteMuted, fontSize:'0.85rem', fontWeight:500, fontFamily: tokens.font.family }}>{s.name}</p>
                              <p style={{ color: tokens.color.whiteFaint, fontSize:'0.71rem', marginTop:'0.12rem', display:'flex', alignItems:'center', gap:'0.25rem', fontFamily: tokens.font.family }}>
                                <Ico.Clock s={11} />{s.duration}
                              </p>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexShrink:0 }}>
                              <span style={{ color: tokens.color.gold, fontSize:'0.85rem', fontWeight:700, fontFamily: tokens.font.family }}>{s.price}</span>
                              <CircleCheck active={active} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {services.length > 0 && (
                      <div style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        background:'rgba(184,134,11,0.1)', border:'1px solid rgba(184,134,11,0.28)',
                        borderRadius:'0.625rem', padding:'0.6rem 1rem', marginBottom:'1rem',
                      }}>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', flex:1 }}>
                          {services.map(s => (
                            <span key={s.name} className="chip badge-pop" style={{ fontSize:'0.64rem' }}>{s.name}</span>
                          ))}
                        </div>
                        <div style={{ flexShrink:0, marginLeft:'0.75rem', textAlign:'right' }}>
                          <p style={{ color: tokens.color.gold, fontWeight:700, fontSize:'0.9rem', fontFamily: tokens.font.family }}>
                            LKR {totalPrice.toLocaleString()}
                          </p>
                          <p style={{ color: tokens.color.whiteFaint, fontSize:'0.68rem', fontFamily: tokens.font.family }}>
                            {fmtMins(totalMins)}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="divider" style={{ margin:'0 0 1.4rem' }} />

                    {/* ── PROVIDERS ── */}
                    <Label text="Service Provider" />
                    {!location ? (
                      <div className="info-box" style={{ marginBottom:'1.2rem', display:'flex', gap:'0.5rem' }}>
                        <Ico.Info s={13} />
                        <span>Please select a branch above to see available providers.</span>
                      </div>
                    ) : filteredProvs.length === 0 ? (
                      <p style={{ color: tokens.color.whiteFaint, fontSize:'0.8rem', marginBottom:'1.25rem', fontFamily: tokens.font.family }}>
                        No providers for <strong style={{ color: tokens.color.gold }}>{categoriesForProviderFilter.join(', ')}</strong> at {location}.
                      </p>
                    ) : (
                      <>
                        <p style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', marginBottom:'0.65rem', fontFamily: tokens.font.family }}>
                          Showing specialists for{' '}
                          <strong style={{ color: tokens.color.gold }}>{categoriesForProviderFilter.join(', ')}</strong>
                          {' '}at{' '}
                          <strong style={{ color: tokens.color.gold }}>{location}</strong>
                        </p>
                        <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem', marginBottom:'0.9rem' }}>
                          {filteredProvs.map(p => {
                            const active = providers.some(x => x.name === p.name);
                            return (
                              <div key={p.name}
                                className={`prov-card${active ? ' prov-card-active' : ''}`}
                                onClick={() => toggleProvider(p)}
                                role="button" aria-pressed={active}>
                                <div className="prov-avatar">{p.avatar}</div>
                                <div style={{ flex:1 }}>
                                  <p style={{ color: tokens.color.whiteMuted, fontSize:'0.85rem', fontWeight:600, fontFamily: tokens.font.family }}>{p.name}</p>
                                  <p style={{ color: tokens.color.whiteFaint, fontSize:'0.71rem', marginTop:'0.1rem', fontFamily: tokens.font.family }}>{p.role}</p>
                                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.28rem', marginTop:'0.32rem' }}>
                                    {p.expertise.map(e => {
                                      const match = categoriesForProviderFilter.includes(e);
                                      return (
                                        <span key={e} style={{
                                          fontSize:'0.6rem', fontWeight:600, letterSpacing:'0.07em',
                                          borderRadius:'999px', padding:'0.12rem 0.45rem',
                                          fontFamily: tokens.font.family,
                                          background: match ? 'rgba(184,134,11,0.25)' : 'rgba(255,255,255,0.06)',
                                          color:      match ? tokens.color.gold : tokens.color.whiteFaint,
                                          border:     `1px solid ${match ? 'rgba(184,134,11,0.5)' : 'rgba(255,255,255,0.12)'}`,
                                        }}>{e}</span>
                                      );
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
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', marginBottom:'0.9rem' }}>
                        {providers.map(p => (
                          <span key={p.name} className="chip badge-pop">
                            <Ico.Check s={9} c={tokens.color.gold} />{p.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="divider" style={{ margin:'0 0 1.4rem' }} />

                    {/* ── DATE ── */}
                    <Label text="Preferred Date" />
                    <input type="date" className="sayo-input"
                      value={date} min={today}
                      onChange={e => { setDate(e.target.value); setTimeSlot(''); }}
                      style={{ marginBottom:'1.25rem' }} />

                    {/* ── TIME ── */}
                    {date && (
                      <>
                        <Label text="Preferred Time" />
                        <p style={{ color: tokens.color.whiteFaint, fontSize:'0.72rem', marginBottom:'0.7rem', fontFamily: tokens.font.family }}>
                          {formatDate(date)}
                        </p>
                        {mode === 'walkin' && !walkinDisabledReason && (
                          <div className="info-box-green" style={{ marginBottom:'0.75rem', display:'flex', gap:'0.5rem', alignItems:'flex-start' }}>
                            <Ico.Info s={13} />
                            <span>
                              Live availability for{' '}
                              <strong style={{ color: tokens.color.green }}>
                                {providers.map(p => p.name).join(', ')}
                              </strong>.{' '}
                              <strong style={{ color: tokens.color.green }}>Green = open</strong>,{' '}
                              <strong style={{ color: tokens.color.red }}>Red = taken</strong>.
                            </span>
                          </div>
                        )}
                        {mode === 'confirmed'
                          ? <ConfirmedTimeSlots timeSlot={timeSlot} setTimeSlot={setTimeSlot} />
                          : <WalkinTimeSlots
                              timeSlot={timeSlot}
                              setTimeSlot={setTimeSlot}
                              bookedSlots={bookedSlots}
                              loading={loadingSlots}
                              error={slotsError}
                              disabledReason={walkinDisabledReason}
                            />
                        }
                      </>
                    )}

                    {/* missing fields hint */}
                    {!canStep2 && (gender || location || services.length > 0) && (
                      <div style={{
                        background:'rgba(184,134,11,0.07)', border:'1px solid rgba(184,134,11,0.22)',
                        borderRadius:'0.5rem', padding:'0.55rem 0.85rem', marginBottom:'0.85rem',
                        fontSize:'0.71rem', color: tokens.color.whiteFaint, fontFamily: tokens.font.family,
                        display:'flex', flexDirection:'column', gap:'0.2rem',
                      }}>
                        {!location             && <span>• Select a branch</span>}
                        {!gender               && <span>• Select your gender</span>}
                        {!phone.trim()         && <span>• Enter your phone number</span>}
                        {services.length === 0 && <span>• Choose at least one service</span>}
                        {providers.length === 0 && <span>• Choose a provider</span>}
                        {!date                 && <span>• Pick a date</span>}
                        {!timeSlot             && <span>• Pick a time slot</span>}
                      </div>
                    )}

                    <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'0.5rem' }}>
                      <button className={btnClass} disabled={!canStep2}
                        onClick={() => setStep(2)}
                        style={{ padding:'0.85rem 2.2rem', fontSize:'0.9rem' }}>
                        Review Booking <Ico.Right />
                      </button>
                    </div>
                  </Card>
                </div>
              )}

              {/* ═══ STEP 2 ═══ */}
              {step === 2 && (
                <div className="reveal-up">
                  <Card mode={mode}>

                    <div style={{ marginBottom:'1.25rem' }}>
                      <span className={`mode-badge ${mode === 'walkin' ? 'mode-badge-walkin' : 'mode-badge-confirmed'}`}>
                        {mode === 'walkin' ? <><Ico.Walk s={11} /> Without Confirmation</> : <><Ico.CalCheck s={11} /> With Confirmation</>}
                      </span>
                      <h2 style={{ color: tokens.color.white, fontSize:'1.25rem', fontWeight:600, fontFamily: tokens.font.family, marginBottom:'0.2rem' }}>
                        Review Your Booking
                      </h2>
                      <p style={{ color: tokens.color.whiteFaint, fontSize:'0.78rem', fontFamily: tokens.font.family }}>
                        Confirm everything looks right before we lock it in.
                      </p>
                    </div>

                    {mode === 'walkin' && (
                      <div className="info-box-green" style={{ marginBottom:'1rem', display:'flex', gap:'0.5rem', alignItems:'flex-start' }}>
                        <Ico.Info s={13} />
                        <span style={{ fontSize:'0.75rem', color: tokens.color.whiteDim, fontFamily: tokens.font.family }}>
                          Registering <strong style={{ color: tokens.color.green }}>without confirmation</strong>. No email sent. Please arrive at least 5 minutes early.
                        </span>
                      </div>
                    )}

                    {apiError && <div className="api-error">⚠ {apiError}</div>}

                    <div className="cf-block">
                      <SumRow icon={<Ico.User />}     label="Name"   value={name}  />
                      <SumRow icon={<Ico.Phone />}    label="Phone"  value={phone} />
                      <SumRow icon={<Ico.Mail />}     label="Email"  value={email} />
                      <SumRow icon={<Ico.Gender />}   label="Gender" value={genderLabel(gender as GenderValue)} />
                      <SumRow icon={<Ico.Location />} label="Branch" value={location} />
                    </div>

                    <div className="cf-block">
                      <SumRow icon={<Ico.Scissors />} label="Service(s)"  value={services.map(s => s.name).join(', ')} />
                      <SumRow icon={<Ico.Clock />}    label="Duration"    value={fmtMins(totalMins)} />
                      <SumRow icon={<Ico.User />}     label="Provider(s)" value={providers.map(p => `${p.name} — ${p.role}`).join(', ')} />
                      <SumRow icon={<Ico.Calendar />} label="Date"        value={date ? formatDate(date) : ''} />
                      <SumRow icon={<Ico.Clock />}    label="Time"        value={timeSlot} />
                    </div>

                    <div style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      background: tokens.color.goldBg, border: `1px solid ${tokens.color.goldBorder}`,
                      borderRadius:'0.75rem', padding:'0.85rem 1.1rem', marginBottom:'1.25rem',
                    }}>
                      <span style={{ color: tokens.color.whiteMuted, fontSize:'0.8rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', fontFamily: tokens.font.family }}>
                        Total Price
                      </span>
                      <span style={{ color: tokens.color.gold, fontSize:'1.15rem', fontWeight:700, fontFamily: tokens.font.family }}>
                        LKR {totalPrice.toLocaleString()}
                      </span>
                    </div>

                    <div style={{ marginBottom:'1.25rem' }}>
                      <FieldLabel text="Special Requests" opt />
                      <textarea className="sayo-input"
                        placeholder="Allergies, preferences, or anything else…"
                        value={notes} onChange={e => setNotes(e.target.value)}
                        rows={3} style={{ resize:'vertical', minHeight:'76px', lineHeight:1.6 }} />
                    </div>

                    <p style={{ color: tokens.color.whiteFaint, fontSize:'0.7rem', lineHeight:1.75, marginBottom:'1.25rem', fontFamily: tokens.font.family }}>
                      {mode === 'walkin'
                        ? 'Registrations are first-come-first-served. Please arrive on time. Payment collected at salon.'
                        : 'Payment is collected at the salon. Please notify us at least 24 hours in advance to cancel or reschedule.'}
                    </p>

                    <div style={{ display:'flex', justifyContent:'space-between', gap:'1rem' }}>
                      <button className="btn-ghost" onClick={() => { setStep(1); setApiError(''); }} style={{ padding:'0.75rem 1.5rem', fontSize:'0.85rem' }}>
                        ← Back
                      </button>
                      <button className={btnClass} disabled={loading} onClick={handleConfirm}
                        style={{ padding:'0.8rem 2rem', fontSize:'0.87rem', minWidth:'210px' }}>
                        {loading ? (
                          <>
                            <span style={{ width:'0.85rem', height:'0.85rem', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />
                            {mode === 'walkin' ? 'Registering…' : 'Confirming…'}
                          </>
                        ) : mode === 'walkin'
                          ? 'Register Without Confirmation'
                          : 'Confirm Booking'
                        }
                      </button>
                    </div>
                  </Card>
                </div>
              )}

            </div>
          </div>
        </main>
      )}
    </>
  );
}