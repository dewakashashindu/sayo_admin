'use client';

import { useState } from 'react';

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
type GenderKey     = 'her' | 'his';
type BookingMode   = 'confirmed' | 'walkin';
type Step          = 1 | 2 | 3;

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
const GENDER_OPTIONS: { key: GenderKey; label: string }[] = [
  { key: 'her', label: 'Her Sanctuary' },
  { key: 'his', label: 'His Retreat'   },
];

const CATEGORIES = ['WAX', 'HAIR', 'SKIN', 'NAIL', 'BODY', 'BRIDAL'];

const SERVICES: Record<GenderKey, Record<string, ServiceItem[]>> = {
  her: {
    WAX: [
      { name: 'Full Arms Wax',     price: 'LKR 2,500',  duration: '45 min',  category: 'WAX'    },
      { name: 'Full Legs Wax',     price: 'LKR 3,500',  duration: '60 min',  category: 'WAX'    },
      { name: 'Underarm Wax',      price: 'LKR 1,200',  duration: '20 min',  category: 'WAX'    },
      { name: 'Eyebrow Threading', price: 'LKR 800',    duration: '15 min',  category: 'WAX'    },
      { name: 'Full Body Wax',     price: 'LKR 7,500',  duration: '120 min', category: 'WAX'    },
    ],
    HAIR: [
      { name: 'Cut & Re-Style',        price: 'LKR 4,200', duration: '60 min', category: 'HAIR' },
      { name: 'Fringe Cut',            price: 'LKR 1,500', duration: '20 min', category: 'HAIR' },
      { name: 'Blow Dry (Short)',       price: 'LKR 2,500', duration: '30 min', category: 'HAIR' },
      { name: 'Hair Wash & Blast Dry', price: 'LKR 2,100', duration: '25 min', category: 'HAIR' },
      { name: 'Trim',                  price: 'LKR 1,500', duration: '20 min', category: 'HAIR' },
    ],
    SKIN: [
      { name: 'Classic Facial',    price: 'LKR 3,000', duration: '45 min', category: 'SKIN' },
      { name: 'Gold Facial',       price: 'LKR 6,500', duration: '60 min', category: 'SKIN' },
      { name: 'Skin Brightening',  price: 'LKR 5,200', duration: '60 min', category: 'SKIN' },
      { name: 'Acne Treatment',    price: 'LKR 4,800', duration: '50 min', category: 'SKIN' },
      { name: 'Anti-Aging Facial', price: 'LKR 7,200', duration: '75 min', category: 'SKIN' },
    ],
    NAIL: [
      { name: 'Classic Manicure',   price: 'LKR 1,800', duration: '30 min', category: 'NAIL' },
      { name: 'Gel Manicure',       price: 'LKR 3,200', duration: '45 min', category: 'NAIL' },
      { name: 'Classic Pedicure',   price: 'LKR 2,200', duration: '40 min', category: 'NAIL' },
      { name: 'Gel Pedicure',       price: 'LKR 3,800', duration: '55 min', category: 'NAIL' },
      { name: 'Nail Art (Per Set)', price: 'LKR 1,500', duration: '30 min', category: 'NAIL' },
    ],
    BODY: [
      { name: 'Full Body Massage',    price: 'LKR 5,500', duration: '60 min', category: 'BODY' },
      { name: 'Body Scrub',           price: 'LKR 4,200', duration: '45 min', category: 'BODY' },
      { name: 'Body Wrap',            price: 'LKR 6,000', duration: '75 min', category: 'BODY' },
      { name: 'Aromatherapy Massage', price: 'LKR 6,800', duration: '60 min', category: 'BODY' },
      { name: 'Hot Stone Massage',    price: 'LKR 7,500', duration: '75 min', category: 'BODY' },
    ],
    BRIDAL: [
      { name: 'Bridal Package – Full', price: 'LKR 45,000', duration: '180 min', category: 'BRIDAL' },
      { name: 'Bridal Hair & Makeup',  price: 'LKR 18,000', duration: '120 min', category: 'BRIDAL' },
      { name: 'Pre-Bridal Package',    price: 'LKR 22,000', duration: '150 min', category: 'BRIDAL' },
      { name: 'Trial Makeup',          price: 'LKR 6,500',  duration: '60 min',  category: 'BRIDAL' },
      { name: 'Bridal Draping',        price: 'LKR 5,000',  duration: '45 min',  category: 'BRIDAL' },
    ],
  },
  his: {
    WAX: [
      { name: 'Chest Wax',     price: 'LKR 3,200', duration: '30 min', category: 'WAX' },
      { name: 'Back Wax',      price: 'LKR 3,600', duration: '35 min', category: 'WAX' },
      { name: 'Full Legs Wax', price: 'LKR 4,000', duration: '60 min', category: 'WAX' },
      { name: 'Beard Shaping', price: 'LKR 1,000', duration: '20 min', category: 'WAX' },
      { name: 'Half Arms Wax', price: 'LKR 2,000', duration: '25 min', category: 'WAX' },
    ],
    HAIR: [
      { name: 'Haircut – Classic', price: 'LKR 1,800', duration: '30 min', category: 'HAIR' },
      { name: 'Beard Trim',        price: 'LKR 900',   duration: '20 min', category: 'HAIR' },
      { name: 'Hair Wash',         price: 'LKR 700',   duration: '15 min', category: 'HAIR' },
      { name: 'Head Massage',      price: 'LKR 1,500', duration: '30 min', category: 'HAIR' },
      { name: 'Hair Color',        price: 'LKR 3,500', duration: '60 min', category: 'HAIR' },
    ],
    SKIN: [
      { name: 'Deep Cleansing Facial', price: 'LKR 3,500', duration: '45 min', category: 'SKIN' },
      { name: 'Skin Polishing',        price: 'LKR 4,000', duration: '50 min', category: 'SKIN' },
      { name: 'Beard Care Facial',     price: 'LKR 3,200', duration: '40 min', category: 'SKIN' },
      { name: 'Whitening Facial',      price: 'LKR 4,800', duration: '60 min', category: 'SKIN' },
      { name: 'Detox Facial',          price: 'LKR 5,500', duration: '65 min', category: 'SKIN' },
    ],
    NAIL: [
      { name: 'Basic Manicure',   price: 'LKR 1,200', duration: '25 min', category: 'NAIL' },
      { name: 'Basic Pedicure',   price: 'LKR 1,500', duration: '30 min', category: 'NAIL' },
      { name: 'Nail Trim & Buff', price: 'LKR 800',   duration: '15 min', category: 'NAIL' },
      { name: 'Callus Removal',   price: 'LKR 1,000', duration: '20 min', category: 'NAIL' },
      { name: 'Hand Spa',         price: 'LKR 2,200', duration: '35 min', category: 'NAIL' },
    ],
    BODY: [
      { name: 'Deep Tissue Massage',     price: 'LKR 6,000', duration: '60 min', category: 'BODY' },
      { name: 'Body Scrub',              price: 'LKR 4,000', duration: '45 min', category: 'BODY' },
      { name: 'Sports Massage',          price: 'LKR 6,500', duration: '60 min', category: 'BODY' },
      { name: 'Back Massage',            price: 'LKR 3,500', duration: '40 min', category: 'BODY' },
      { name: 'Head & Shoulder Massage', price: 'LKR 2,800', duration: '35 min', category: 'BODY' },
    ],
    BRIDAL: [
      { name: 'Groom Package',       price: 'LKR 25,000', duration: '150 min', category: 'BRIDAL' },
      { name: 'Groom Hair & Makeup', price: 'LKR 10,000', duration: '90 min',  category: 'BRIDAL' },
      { name: 'Pre-Groom Package',   price: 'LKR 14,000', duration: '120 min', category: 'BRIDAL' },
      { name: 'Groom Facial',        price: 'LKR 4,500',  duration: '60 min',  category: 'BRIDAL' },
      { name: 'Groom Grooming',      price: 'LKR 3,500',  duration: '45 min',  category: 'BRIDAL' },
    ],
  },
};

const PROVIDERS: Record<string, Provider[]> = {
  Colombo: [
    { name: 'Nadeesha',  role: 'Senior Hair Stylist',   avatar: 'N', expertise: ['HAIR', 'BRIDAL']        },
    { name: 'Priyanka',  role: 'Beauty Therapist',      avatar: 'P', expertise: ['SKIN', 'BODY', 'BRIDAL'] },
    { name: 'Chamari',   role: 'Nail Technician',       avatar: 'C', expertise: ['NAIL']                   },
    { name: 'Dilrukshi', role: 'Wax Specialist',        avatar: 'D', expertise: ['WAX']                    },
    { name: 'Sewwandi',  role: 'Massage Therapist',     avatar: 'S', expertise: ['BODY']                   },
    { name: 'Thilini',   role: 'Bridal & Skin Expert',  avatar: 'T', expertise: ['BRIDAL', 'SKIN']         },
  ],
  Negombo: [
    { name: 'Dilanka',  role: 'Hair Specialist',        avatar: 'D', expertise: ['HAIR', 'BRIDAL']         },
    { name: 'Sanduni',  role: 'Skin Therapist',         avatar: 'S', expertise: ['SKIN']                   },
    { name: 'Nimasha',  role: 'Nail & Wax Expert',      avatar: 'N', expertise: ['NAIL', 'WAX']            },
    { name: 'Kavindi',  role: 'Body Therapist',         avatar: 'K', expertise: ['BODY', 'BRIDAL']         },
  ],
  Kiribathgoda: [
    { name: 'Rashmika', role: 'Senior Body Therapist',  avatar: 'R', expertise: ['BODY', 'BRIDAL']         },
    { name: 'Tharushi', role: 'Bridal Specialist',      avatar: 'T', expertise: ['BRIDAL', 'HAIR']         },
    { name: 'Maleesha', role: 'Nail Artist',            avatar: 'M', expertise: ['NAIL']                   },
    { name: 'Oshadi',   role: 'Hair Stylist',           avatar: 'O', expertise: ['HAIR', 'SKIN']           },
    { name: 'Chanika',  role: 'Wax Therapist',          avatar: 'C', expertise: ['WAX', 'BODY']            },
  ],
};

const LOCATIONS = ['Colombo', 'Negombo', 'Kiribathgoda'];

const TIME_SLOTS = [
  '09:00 AM','09:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM',
  '01:00 PM','01:30 PM','02:00 PM','02:30 PM',
  '03:00 PM','03:30 PM','04:00 PM','04:30 PM',
  '05:00 PM','05:30 PM','06:00 PM',
];

const BOOKED_SLOTS = new Set([
  '09:30 AM','10:00 AM','11:00 AM',
  '12:30 PM','02:00 PM','03:30 PM','05:00 PM',
]);

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function isValidEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function isValidPhone(v: string) { return /^[\d\s+\-()]{7,20}$/.test(v.trim()); }
function formatDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function parseMins(d: string) { return parseInt(d, 10) || 0; }
function fmtMins(m: number) {
  if (m <= 0) return '—';
  return m >= 60 ? `${Math.floor(m/60)}h${m%60>0?` ${m%60}min`:''}` : `${m} min`;
}
function parseLKR(p: string) { return parseInt(p.replace(/\D/g,''), 10) || 0; }

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#040405;}

  @keyframes fadeInUp  {from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes checkPop  {0%{transform:scale(0) rotate(-20deg);opacity:0}70%{transform:scale(1.2) rotate(5deg)}100%{transform:scale(1) rotate(0);opacity:1}}
  @keyframes spin      {to{transform:rotate(360deg)}}
  @keyframes badgePop  {from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
  @keyframes slotPop   {from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}

  .reveal-up   {animation:fadeInUp  0.55s cubic-bezier(0.16,1,0.3,1) both;}
  .check-pop   {animation:checkPop  0.5s  cubic-bezier(0.34,1.56,0.64,1) 0.1s both;}
  .badge-pop   {animation:badgePop  0.25s cubic-bezier(0.34,1.56,0.64,1) both;}
  .slot-pop    {animation:slotPop   0.2s  cubic-bezier(0.16,1,0.3,1) both;}

  .mode-toggle-wrap {
    display:flex;background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.12);
    border-radius:0.875rem;padding:0.28rem;gap:0.28rem;
    margin-bottom:1.5rem;
  }
  .mode-btn {
    flex:1;cursor:pointer;outline:none;border:none;border-radius:0.65rem;
    padding:0.65rem 1rem;font-family:Inter,sans-serif;font-size:0.82rem;
    font-weight:600;letter-spacing:0.04em;transition:all 0.28s;
    display:flex;align-items:center;justify-content:center;gap:0.45rem;
  }
  .mode-btn-confirmed {
    background:linear-gradient(135deg,rgba(184,134,11,0.9),rgba(184,134,11,0.65));
    color:#fff;box-shadow:0 4px 18px rgba(184,134,11,0.35);
  }
  .mode-btn-walkin {
    background:linear-gradient(135deg,rgba(34,197,94,0.75),rgba(34,197,94,0.5));
    color:#fff;box-shadow:0 4px 18px rgba(34,197,94,0.28);
  }
  .mode-btn-inactive {
    background:transparent;color:rgba(255,255,255,0.45);
  }
  .mode-btn-inactive:hover {background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.75);}

  .mode-badge {
    display:inline-flex;align-items:center;gap:0.35rem;
    border-radius:999px;padding:0.22rem 0.75rem;
    font-size:0.68rem;font-weight:700;letter-spacing:0.08em;
    font-family:Inter,sans-serif;margin-bottom:1.1rem;
  }
  .mode-badge-confirmed {background:rgba(184,134,11,0.18);border:1px solid rgba(184,134,11,0.45);color:#B8860B;}
  .mode-badge-walkin    {background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#22c55e;}

  .card-confirmed {border-color:rgba(184,134,11,0.35) !important;}
  .card-walkin    {border-color:rgba(34,197,94,0.3) !important;}

  .step-dot  {width:2.4rem;height:2.4rem;border-radius:50%;display:flex;align-items:center;
              justify-content:center;font-size:0.82rem;font-weight:600;flex-shrink:0;
              transition:all 0.35s;font-family:Inter,sans-serif;}
  .step-line {flex:1;height:2px;border-radius:2px;transition:background 0.5s;}

  .gender-tab {cursor:pointer;outline:none;font-family:Inter,sans-serif;color:#fff;
               transition:all 0.25s;border-radius:1.25rem;padding:0.55rem 1.4rem;
               font-size:0.83rem;font-weight:600;letter-spacing:0.06em;}
  .gender-tab-active   {background:rgba(184,134,11,0.55);border:2px solid #B8860B;box-shadow:0 6px 22px rgba(184,134,11,0.28);}
  .gender-tab-inactive {background:transparent;border:2px solid rgba(184,134,11,0.4);}
  .gender-tab-inactive:hover {background:rgba(184,134,11,0.12);}

  .cat-tabs-wrap {display:flex;flex-wrap:nowrap;overflow-x:auto;gap:0.5rem;padding-bottom:2px;
                  scrollbar-width:none;-webkit-overflow-scrolling:touch;}
  .cat-tabs-wrap::-webkit-scrollbar {display:none;}
  .cat-tab {cursor:pointer;outline:none;border:none;font-family:Inter,sans-serif;
            font-size:0.74rem;font-weight:600;letter-spacing:0.1em;border-radius:0.5rem;
            padding:0.42rem 0.9rem;white-space:nowrap;transition:all 0.22s;position:relative;}
  .cat-tab-active   {background:#B8860B;color:#fff;box-shadow:0 4px 16px rgba(184,134,11,0.38);}
  .cat-tab-inactive {background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.65);border:1.5px solid rgba(255,255,255,0.18);}
  .cat-tab-inactive:hover {border-color:#B8860B;color:#fff;background:rgba(184,134,11,0.1);}
  .cat-tab-dot {position:absolute;top:-3px;right:-3px;width:0.5rem;height:0.5rem;border-radius:50%;background:#22c55e;border:1.5px solid #040405;}

  .svc-card {cursor:pointer;border-radius:0.75rem;border:1.5px solid rgba(255,255,255,0.1);
             background:rgba(255,255,255,0.04);padding:0.8rem 1rem;
             display:flex;align-items:center;justify-content:space-between;gap:1rem;transition:all 0.2s;}
  .svc-card:hover  {border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);transform:translateY(-1px);}
  .svc-card-active {border-color:#B8860B !important;background:rgba(184,134,11,0.15) !important;}

  .prov-card {cursor:pointer;border-radius:0.75rem;border:1.5px solid rgba(255,255,255,0.1);
              background:rgba(255,255,255,0.04);padding:0.8rem 1rem;
              display:flex;align-items:center;gap:0.85rem;transition:all 0.2s;}
  .prov-card:hover  {border-color:rgba(184,134,11,0.45);background:rgba(184,134,11,0.07);transform:translateY(-1px);}
  .prov-card-active {border-color:#B8860B !important;background:rgba(184,134,11,0.15) !important;}
  .prov-avatar {width:2.6rem;height:2.6rem;border-radius:50%;display:flex;align-items:center;
                justify-content:center;font-family:Inter,sans-serif;font-size:1.05rem;font-weight:700;
                color:#fff;flex-shrink:0;background:rgba(184,134,11,0.35);border:1.5px solid rgba(184,134,11,0.55);}

  .t-slot {cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:Inter,sans-serif;
           font-size:0.74rem;font-weight:500;text-align:center;transition:all 0.18s;
           border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);
           color:rgba(255,255,255,0.72);}
  .t-slot:hover  {border-color:#B8860B;background:rgba(184,134,11,0.12);color:#fff;transform:translateY(-1px);}
  .t-slot-active {border-color:#B8860B !important;background:#B8860B !important;color:#fff !important;}

  .t-slot-available {
    cursor:pointer;border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:Inter,sans-serif;
    font-size:0.74rem;font-weight:600;text-align:center;transition:all 0.18s;
    border:1.5px solid rgba(34,197,94,0.45);background:rgba(34,197,94,0.1);color:#22c55e;
  }
  .t-slot-available:hover {background:rgba(34,197,94,0.22);transform:translateY(-1px);}
  .t-slot-available-selected {
    border-color:#22c55e !important;background:#22c55e !important;color:#fff !important;
  }
  .t-slot-booked {
    border-radius:0.45rem;padding:0.45rem 0.5rem;font-family:Inter,sans-serif;
    font-size:0.74rem;font-weight:500;text-align:center;
    border:1.5px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);
    color:rgba(239,68,68,0.55);text-decoration:line-through;cursor:not-allowed;
    opacity:0.7;
  }

  .legend-dot {width:0.55rem;height:0.55rem;border-radius:50%;flex-shrink:0;display:inline-block;}

  .sayo-input {width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);
               border-radius:0.625rem;padding:0.75rem 1rem;font-family:Inter,sans-serif;
               font-size:0.9rem;color:#fff;outline:none;
               transition:border-color 0.25s,background 0.25s;color-scheme:dark;}
  .sayo-input::placeholder {color:rgba(255,255,255,0.3);}
  .sayo-input:focus  {border-color:#B8860B;background:rgba(184,134,11,0.07);}
  .sayo-input option {background:#1a1a1a;color:#fff;}
  .sayo-input.err    {border-color:#e05c5c !important;}
  .field-err {color:#e05c5c;font-size:0.7rem;margin-top:0.28rem;font-family:Inter,sans-serif;}

  .btn-gold {cursor:pointer;outline:none;border:none;font-family:Inter,sans-serif;font-weight:600;
             letter-spacing:0.06em;border-radius:0.75rem;background:#B8860B;color:#fff;
             display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;
             transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;}
  .btn-gold:hover:not(:disabled) {transform:translateY(-2px);box-shadow:0 8px 24px rgba(184,134,11,0.38);}
  .btn-gold:disabled {opacity:0.42;cursor:not-allowed;}
  .btn-green {cursor:pointer;outline:none;border:none;font-family:Inter,sans-serif;font-weight:600;
              letter-spacing:0.06em;border-radius:0.75rem;background:#22c55e;color:#fff;
              display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;
              transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;}
  .btn-green:hover:not(:disabled) {transform:translateY(-2px);box-shadow:0 8px 24px rgba(34,197,94,0.35);}
  .btn-green:disabled {opacity:0.42;cursor:not-allowed;}
  .btn-ghost {cursor:pointer;outline:none;background:transparent;
              border:1.5px solid rgba(255,255,255,0.28);border-radius:0.75rem;
              font-family:Inter,sans-serif;font-weight:500;color:rgba(255,255,255,0.65);
              transition:all 0.2s;}
  .btn-ghost:hover {border-color:#B8860B;color:#fff;transform:translateY(-2px);}

  .sum-row {display:flex;justify-content:space-between;align-items:flex-start;
            padding:0.52rem 0;border-bottom:1px solid rgba(255,255,255,0.07);gap:1rem;}
  .sum-row:last-child {border-bottom:none;}

  .cf-block {background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);
             border-radius:0.875rem;padding:0.2rem 1rem;margin-bottom:0.9rem;}

  .chip {display:inline-flex;align-items:center;gap:0.28rem;
         background:rgba(184,134,11,0.18);border:1px solid rgba(184,134,11,0.4);
         border-radius:999px;padding:0.2rem 0.6rem;font-size:0.69rem;font-weight:600;
         color:#B8860B;font-family:Inter,sans-serif;white-space:nowrap;}

  .chip-cat {background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.7);}

  .info-box {background:rgba(184,134,11,0.09);border:1px solid rgba(184,134,11,0.28);
             border-radius:0.625rem;padding:0.65rem 0.9rem;font-size:0.75rem;
             color:rgba(255,255,255,0.65);font-family:Inter,sans-serif;line-height:1.55;}

  .info-box-green {background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);
                   border-radius:0.625rem;padding:0.65rem 0.9rem;font-size:0.75rem;
                   color:rgba(255,255,255,0.65);font-family:Inter,sans-serif;line-height:1.55;}

  .divider {height:1px;background:rgba(255,255,255,0.09);margin:1.2rem 0;}

  @media(max-width:600px){
    .step-label {display:none !important;}
    .time-grid  {grid-template-columns:repeat(3,1fr) !important;}
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const Ico = {
  Check: ({s=16,c='currentColor'}:{s?:number;c?:string}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  Right: ({s=15}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  ),
  Down: ({s=16}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  ),
  Clock: ({s=12}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
  Calendar: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  ),
  User: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  Scissors: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
  ),
  Location: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  ),
  Phone: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.9-8.2A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/></svg>
  ),
  Mail: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
  ),
  CalCheck: ({s=15}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m16 19 2 2 4-4"/></svg>
  ),
  Walk: ({s=15}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2"/><path d="m15 8-4 1-2 4 3 2v5h2v-6l-2-2 1-2"/><path d="m9 21-1-5 3-2"/></svg>
  ),
  Info: ({s=13}:{s?:number}) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
};

/* ─────────────────────────────────────────
   STEP INDICATOR
───────────────────────────────────────── */
const STEPS = [
  {n:1, label:'Your Details'  },
  {n:2, label:'Service & Time'},
  {n:3, label:'Confirm'       },
];

function StepIndicator({current,mode}:{current:Step;mode:BookingMode}) {
  const activeColor = mode==='walkin' ? tokens.color.green : tokens.color.gold;
  return (
    <div style={{display:'flex',alignItems:'center',maxWidth:'480px',margin:'0 auto clamp(1.75rem,4vw,2.5rem)'}}>
      {STEPS.map((s,i)=>{
        const done=current>s.n, active=current===s.n;
        return (
          <div key={s.n} style={{display:'flex',alignItems:'center',flex:i<STEPS.length-1?1:undefined}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0.3rem'}}>
              <div className="step-dot" style={{
                background: done?activeColor:active?`rgba(${mode==='walkin'?'34,197,94':'184,134,11'},0.18)`:'rgba(255,255,255,0.06)',
                border: active?`2px solid ${activeColor}`:done?'none':'2px solid rgba(255,255,255,0.18)',
                color: done||active?'#fff':tokens.color.whiteFaint,
              }}>
                {done?<Ico.Check s={14} c="#fff"/>:s.n}
              </div>
              <span className="step-label" style={{
                fontSize:'0.62rem',fontWeight:600,letterSpacing:'0.1em',
                textTransform:'uppercase',whiteSpace:'nowrap',fontFamily:tokens.font.family,
                color:active?activeColor:done?tokens.color.whiteDim:tokens.color.whiteFaint,
              }}>{s.label}</span>
            </div>
            {i<STEPS.length-1&&(
              <div className="step-line" style={{
                margin:'0 0.3rem 1.25rem',
                background:done?activeColor:'rgba(255,255,255,0.12)',
              }}/>
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
function Card({children,style,mode}:{children:React.ReactNode;style?:React.CSSProperties;mode?:BookingMode}) {
  return (
    <div className={mode?`card-${mode}`:''} style={{
      background:tokens.color.cardBg,
      border:`1px solid ${tokens.color.whiteBorder}`,
      borderRadius:tokens.radius.card,
      padding:'clamp(1.25rem,3vw,1.85rem)',
      backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)',...style,
    }}>{children}</div>
  );
}

function Label({text}:{text:string}) {
  return (
    <p style={{color:tokens.color.gold,fontSize:'0.67rem',fontWeight:700,
      letterSpacing:'0.22em',textTransform:'uppercase',marginBottom:'0.6rem',fontFamily:tokens.font.family}}>
      {text}
    </p>
  );
}

function FieldLabel({text,opt}:{text:string;opt?:boolean}) {
  return (
    <label style={{display:'block',color:tokens.color.whiteDim,fontSize:'0.78rem',fontWeight:500,marginBottom:'0.35rem',fontFamily:tokens.font.family}}>
      {text}{opt&&<span style={{color:tokens.color.whiteFaint,marginLeft:'0.3rem'}}>(optional)</span>}
    </label>
  );
}

function CircleCheck({active}:{active:boolean}) {
  return (
    <div style={{
      width:'1.25rem',height:'1.25rem',borderRadius:'50%',flexShrink:0,
      background:active?tokens.color.gold:'rgba(255,255,255,0.08)',
      border:active?'none':'1.5px solid rgba(255,255,255,0.22)',
      display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s',
    }}>
      {active&&<Ico.Check s={9} c="#fff"/>}
    </div>
  );
}

function SumRow({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return (
    <div className="sum-row">
      <div style={{display:'flex',alignItems:'center',gap:'0.4rem',color:tokens.color.whiteFaint}}>
        {icon}
        <span style={{fontSize:'0.76rem',fontFamily:tokens.font.family}}>{label}</span>
      </div>
      <span style={{color:tokens.color.whiteMuted,fontSize:'0.82rem',fontWeight:500,fontFamily:tokens.font.family,textAlign:'right',maxWidth:'58%'}}>
        {value||'—'}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────
   BOOKING MODE TOGGLE
───────────────────────────────────────── */
function BookingModeToggle({mode,onChange}:{mode:BookingMode;onChange:(m:BookingMode)=>void}) {
  return (
    <div>
      <p style={{color:tokens.color.whiteDim,fontSize:'0.72rem',fontWeight:600,
        letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:'0.6rem',
        fontFamily:tokens.font.family}}>
        Booking Type
      </p>
      <div className="mode-toggle-wrap">
        <button
          className={`mode-btn ${mode==='confirmed'?'mode-btn-confirmed':'mode-btn-inactive'}`}
          onClick={()=>onChange('confirmed')}>
          <Ico.CalCheck s={15}/>
          With Confirmation
        </button>
        <button
          className={`mode-btn ${mode==='walkin'?'mode-btn-walkin':'mode-btn-inactive'}`}
          onClick={()=>onChange('walkin')}>
          <Ico.Walk s={15}/>
          Without Confirmation
        </button>
      </div>

      {mode==='confirmed' && (
        <div style={{
          background:'rgba(184,134,11,0.08)',border:'1px solid rgba(184,134,11,0.25)',
          borderRadius:'0.625rem',padding:'0.6rem 0.9rem',marginBottom:'1.25rem',
          display:'flex',gap:'0.5rem',alignItems:'flex-start',
        }}>
          <Ico.Info s={13}/>
          <p style={{color:tokens.color.whiteDim,fontSize:'0.74rem',lineHeight:1.6,fontFamily:tokens.font.family}}>
            <strong style={{color:tokens.color.gold}}>With Confirmation</strong> — Fill in your details, choose a service, provider and date. We will confirm your slot.
          </p>
        </div>
      )}
      {mode==='walkin' && (
        <div style={{
          background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.25)',
          borderRadius:'0.625rem',padding:'0.6rem 0.9rem',marginBottom:'1.25rem',
          display:'flex',gap:'0.5rem',alignItems:'flex-start',
        }}>
          <Ico.Info s={13}/>
          <p style={{color:tokens.color.whiteDim,fontSize:'0.74rem',lineHeight:1.6,fontFamily:tokens.font.family}}>
            <strong style={{color:tokens.color.green}}>Without Confirmation</strong> — Check live slot availability and register instantly. Green = available, Red = already booked.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   TIME SLOT SECTIONS
───────────────────────────────────────── */
function ConfirmedTimeSlots({timeSlot,setTimeSlot}:{timeSlot:string;setTimeSlot:(s:string)=>void}) {
  return (
    <div className="time-grid" style={{
      display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.42rem',marginBottom:'1.25rem',
    }}>
      {TIME_SLOTS.map(slot=>(
        <button key={slot}
          className={`t-slot${timeSlot===slot?' t-slot-active':''}`}
          onClick={()=>setTimeSlot(slot)}>
          {slot}
        </button>
      ))}
    </div>
  );
}

function WalkinTimeSlots({timeSlot,setTimeSlot}:{timeSlot:string;setTimeSlot:(s:string)=>void}) {
  const availableCount = TIME_SLOTS.filter(s=>!BOOKED_SLOTS.has(s)).length;
  const bookedCount    = TIME_SLOTS.filter(s=>BOOKED_SLOTS.has(s)).length;

  return (
    <>
      <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'0.75rem',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'0.35rem'}}>
          <span className="legend-dot" style={{background:tokens.color.green}}/>
          <span style={{color:tokens.color.whiteFaint,fontSize:'0.72rem',fontFamily:tokens.font.family}}>
            Available ({availableCount})
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.35rem'}}>
          <span className="legend-dot" style={{background:tokens.color.red}}/>
          <span style={{color:tokens.color.whiteFaint,fontSize:'0.72rem',fontFamily:tokens.font.family}}>
            Booked ({bookedCount})
          </span>
        </div>
      </div>

      <div className="time-grid" style={{
        display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.42rem',marginBottom:'1.25rem',
      }}>
        {TIME_SLOTS.map(slot=>{
          const booked   = BOOKED_SLOTS.has(slot);
          const selected = timeSlot===slot;
          if (booked) {
            return (
              <div key={slot} className="t-slot-booked slot-pop">
                {slot}
              </div>
            );
          }
          return (
            <button key={slot}
              className={`t-slot-available slot-pop${selected?' t-slot-available-selected':''}`}
              onClick={()=>setTimeSlot(slot)}>
              {slot}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function BookingPage() {

  const [mode,      setMode]      = useState<BookingMode>('confirmed');
  const [step,      setStep]      = useState<Step>(1);
  const [gender,    setGender]    = useState<GenderKey>('her');
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

  const [tName,  setTName]  = useState(false);
  const [tPhone, setTPhone] = useState(false);
  const [tEmail, setTEmail] = useState(false);

  const today           = new Date().toISOString().split('T')[0];
  const serviceList     = SERVICES[gender][category] ?? [];
  const allBranchProvs  = location ? (PROVIDERS[location] ?? []) : [];

  const selectedCategories = Array.from(new Set(services.map(s=>s.category)));
  const categoriesForProviderFilter = selectedCategories.length>0 ? selectedCategories : [category];
  const filteredProvs = allBranchProvs.filter(p=>
    p.expertise.some(e=>categoriesForProviderFilter.includes(e))
  );

  const errName  = tName  && !name.trim()        ? 'Full name is required.'      : '';
  const errPhone = tPhone && !isValidPhone(phone) ? 'Enter a valid phone number.' : '';
  const errEmail = tEmail && !isValidEmail(email) ? 'Enter a valid email.'        : '';

  const canStep2   = !!name.trim() && isValidPhone(phone) && isValidEmail(email) && !!location;
  const canStep3   = services.length>0 && providers.length>0 && !!date && !!timeSlot;

  const totalMins  = services.reduce((a,s)=>a+parseMins(s.duration),0);
  const totalPrice = services.reduce((a,s)=>a+parseLKR(s.price),0);

  const toggleService = (svc: ServiceItem) => {
    setServices(prev=>{
      const exists=prev.some(s=>s.name===svc.name&&s.price===svc.price);
      return exists
        ?prev.filter(s=>!(s.name===svc.name&&s.price===svc.price))
        :[...prev,svc];
    });
  };
  const toggleProvider = (p: Provider) => {
    setProviders(prev=>
      prev.some(x=>x.name===p.name)?prev.filter(x=>x.name!==p.name):[...prev,p]
    );
  };
  const handleGenderChange   = (k: GenderKey) => { setGender(k); setServices([]); setProviders([]); };
  const handleCategoryChange = (cat: string)  => { setCategory(cat); };
  const handleLocationChange = (loc: string)  => { setLocation(loc); setProviders([]); };

  const handleModeChange = (m: BookingMode) => {
    setMode(m);
    setTimeSlot('');
    setStep(1);
    setServices([]);
    setProviders([]);
    setDate('');
  };

  const handleConfirm = () => {
    setLoading(true);
    setTimeout(()=>{ setLoading(false); setConfirmed(true); }, 1200);
  };

  const handleReset = () => {
    setMode('confirmed'); setStep(1); setGender('her');
    setName(''); setPhone(''); setEmail(''); setLocation('');
    setCategory('HAIR'); setServices([]); setProviders([]);
    setDate(''); setTimeSlot(''); setNotes('');
    setConfirmed(false); setLoading(false);
    setTName(false); setTPhone(false); setTEmail(false);
  };

  const accentColor  = mode==='walkin' ? tokens.color.green : tokens.color.gold;
  const btnClass     = mode==='walkin' ? 'btn-green' : 'btn-gold';

  /* ══ CONFIRMED SCREEN ══ */
  if (confirmed) {
    return (
      <>
        <style>{globalCss}</style>
        <main style={{
          minHeight:'100vh',fontFamily:tokens.font.family,
          backgroundImage:'url(/booking.jpg)',backgroundSize:'cover',backgroundPosition:'center',
          display:'flex',alignItems:'center',justifyContent:'center',
          padding:'2rem',position:'relative',
        }}>
          <div style={{position:'absolute',inset:0,background:'rgba(4,4,5,0.84)'}}/>
          <div className="reveal-up" style={{position:'relative',zIndex:1,maxWidth:'520px',width:'100%',textAlign:'center'}}>
            <div className="check-pop" style={{
              width:'5rem',height:'5rem',borderRadius:'50%',
              background:mode==='walkin'?'rgba(34,197,94,0.15)':'rgba(184,134,11,0.15)',
              border:`2px solid ${accentColor}`,
              display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.5rem',
            }}>
              <Ico.Check s={32} c={accentColor}/>
            </div>

            <span className={`mode-badge ${mode==='walkin'?'mode-badge-walkin':'mode-badge-confirmed'}`}
              style={{margin:'0 auto 0.75rem',display:'inline-flex'}}>
              {mode==='walkin'?<><Ico.Walk s={11}/>Without Confirmation</>:<><Ico.CalCheck s={11}/>Confirmed</>}
            </span>

            <p style={{color:accentColor,fontSize:'0.68rem',fontWeight:700,letterSpacing:'0.28em',textTransform:'uppercase',marginBottom:'0.5rem'}}>
              Booking {mode==='walkin'?'Registered':'Confirmed'}
            </p>
            <h2 style={{color:tokens.color.white,fontSize:'clamp(1.6rem,3vw,2.2rem)',fontWeight:600,marginBottom:'0.75rem'}}>
              See you soon, {name.split(' ')[0]}!
            </h2>
            <p style={{color:tokens.color.whiteMuted,fontSize:'0.88rem',lineHeight:1.9,marginBottom:'2rem'}}>
              <span style={{color:accentColor}}>{services.map(s=>s.name).join(', ')}</span>
              {' '}on{' '}
              <span style={{color:accentColor}}>{date?formatDate(date):''}</span>
              {' '}at{' '}
              <span style={{color:accentColor}}>{timeSlot}</span>
              <br/>with{' '}
              <span style={{color:accentColor}}>{providers.map(p=>p.name).join(' & ')}</span>
              <br/>at our{' '}
              <span style={{color:accentColor}}>{location}</span> branch.
              <br/>
              <span style={{color:tokens.color.whiteDim,fontSize:'0.8rem'}}>
                {mode==='walkin'
                  ?'Registered without confirmation — please arrive on time.'
                  :`Confirmation sent to ${email}`
                }
              </span>
            </p>
            <button className={btnClass} onClick={handleReset}
              style={{padding:'0.85rem 2.5rem',fontSize:'0.9rem'}}>
              Book Another Appointment
            </button>
          </div>
        </main>
      </>
    );
  }

  /* ══ MAIN FORM ══ */
  return (
    <>
      <style>{globalCss}</style>
      <main style={{
        minHeight:'100vh',fontFamily:tokens.font.family,
        backgroundImage:'url(/booking.jpg)',backgroundSize:'cover',backgroundPosition:'center',
        position:'relative',
      }}>
        <div style={{position:'absolute',inset:0,background:'rgba(4,4,5,0.76)',zIndex:0}}/>

        <div style={{position:'relative',zIndex:1,padding:'clamp(1.5rem,5vw,3.5rem) clamp(1rem,4vw,2rem) clamp(3rem,6vw,5rem)'}}>

          {/* HERO */}
          <div className="reveal-up" style={{textAlign:'center',marginBottom:'clamp(1.5rem,4vw,2.5rem)'}}>
            <p style={{color:tokens.color.gold,fontSize:'0.68rem',fontWeight:700,letterSpacing:'0.3em',textTransform:'uppercase',marginBottom:'0.55rem'}}>
              Online Booking
            </p>
            <h1 style={{color:tokens.color.white,fontSize:tokens.font.heroTitle,fontWeight:600,lineHeight:1.15,marginBottom:'0.65rem'}}>
              Reserve Your <span style={{color:tokens.color.gold}}>Luxury</span> Moment
            </h1>
            <p style={{color:tokens.color.whiteMuted,fontSize:tokens.font.heroSub,lineHeight:1.7,maxWidth:'400px',margin:'0 auto'}}>
              Three simple steps to your perfect appointment.
            </p>
          </div>

          <StepIndicator current={step} mode={mode}/>

          <div style={{maxWidth:'640px',margin:'0 auto'}}>

            {/* ══════════════════════════════
                STEP 1 — YOUR DETAILS
            ══════════════════════════════ */}
            {step===1&&(
              <div className="reveal-up">
                <Card mode={mode}>

                  <BookingModeToggle mode={mode} onChange={handleModeChange}/>

                  <div className="divider" style={{marginTop:0}}/>

                  {/* Gender */}
                  <Label text="Booking For"/>
                  <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',marginBottom:'1.5rem'}}>
                    {GENDER_OPTIONS.map(g=>(
                      <button key={g.key}
                        className={`gender-tab ${gender===g.key?'gender-tab-active':'gender-tab-inactive'}`}
                        onClick={()=>handleGenderChange(g.key)}>
                        {g.label}
                      </button>
                    ))}
                  </div>

                  {/* Details */}
                  <Label text="Your Details"/>
                  <div style={{display:'flex',flexDirection:'column',gap:'1rem',marginBottom:'1.5rem'}}>
                    <div>
                      <FieldLabel text="Full Name *"/>
                      <input className={`sayo-input${errName?' err':''}`} type="text"
                        placeholder="e.g. Amara Silva" value={name}
                        onChange={e=>setName(e.target.value)} onBlur={()=>setTName(true)}/>
                      {errName&&<p className="field-err">{errName}</p>}
                    </div>
                    <div>
                      <FieldLabel text="Phone Number *"/>
                      <input className={`sayo-input${errPhone?' err':''}`} type="tel"
                        placeholder="+94 77 000 0000" value={phone}
                        onChange={e=>setPhone(e.target.value)} onBlur={()=>setTPhone(true)}/>
                      {errPhone&&<p className="field-err">{errPhone}</p>}
                    </div>
                    <div>
                      <FieldLabel text="Email Address *"/>
                      <input className={`sayo-input${errEmail?' err':''}`} type="email"
                        placeholder="you@example.com" value={email}
                        onChange={e=>setEmail(e.target.value)} onBlur={()=>setTEmail(true)}/>
                      {errEmail&&<p className="field-err">{errEmail}</p>}
                    </div>
                    <div>
                      <FieldLabel text="Branch / Location *"/>
                      <select className="sayo-input" value={location}
                        onChange={e=>handleLocationChange(e.target.value)}>
                        <option value="">Choose a branch…</option>
                        {LOCATIONS.map(l=><option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{display:'flex',justifyContent:'flex-end'}}>
                    <button className={btnClass} disabled={!canStep2}
                      onClick={()=>setStep(2)}
                      style={{padding:'0.8rem 2rem',fontSize:'0.87rem'}}>
                      Continue <Ico.Right/>
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {/* ═══════════════════════════════════════════
                STEP 2 — SERVICE, PROVIDER, DATE & TIME
            ═══════════════════════════════════════════ */}
            {step===2&&(
              <div className="reveal-up">
                <Card mode={mode}>

                  {/* mode badge reminder */}
                  <div style={{marginBottom:'1rem'}}>
                    <span className={`mode-badge ${mode==='walkin'?'mode-badge-walkin':'mode-badge-confirmed'}`}>
                      {mode==='walkin'
                        ?<><Ico.Walk s={11}/>Without Confirmation</>
                        :<><Ico.CalCheck s={11}/>With Confirmation</>
                      }
                    </span>
                  </div>

                  {/* Category */}
                  <Label text="Category"/>
                  <p style={{color:tokens.color.whiteFaint,fontSize:'0.72rem',marginBottom:'0.65rem',fontFamily:tokens.font.family}}>
                    Browse any category and add services — your selections are saved across categories, so you can mix and match (e.g. HAIR + SKIN + NAIL).
                  </p>
                  <div className="cat-tabs-wrap" style={{marginBottom:'1.25rem'}}>
                    {CATEGORIES.map(cat=>{
                      const hasSelection = selectedCategories.includes(cat);
                      return (
                        <button key={cat}
                          className={`cat-tab ${category===cat?'cat-tab-active':'cat-tab-inactive'}`}
                          onClick={()=>handleCategoryChange(cat)}>
                          {cat}
                          {hasSelection&&<span className="cat-tab-dot"/>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Services */}
                  <Label text="Choose Services"/>
                  <p style={{color:tokens.color.whiteFaint,fontSize:'0.72rem',marginBottom:'0.65rem',fontFamily:tokens.font.family}}>
                    Tap to select or deselect. You can pick multiple, even across categories.
                  </p>
                  <div style={{display:'flex',flexDirection:'column',gap:'0.45rem',marginBottom:'0.9rem'}}>
                    {serviceList.map(s=>{
                      const active=services.some(x=>x.name===s.name&&x.price===s.price);
                      return (
                        <div key={`${category}-${s.name}`}
                          className={`svc-card${active?' svc-card-active':''}`}
                          onClick={()=>toggleService(s)} role="button" aria-pressed={active}>
                          <div>
                            <p style={{color:tokens.color.whiteMuted,fontSize:'0.85rem',fontWeight:500}}>{s.name}</p>
                            <p style={{color:tokens.color.whiteFaint,fontSize:'0.71rem',marginTop:'0.12rem',display:'flex',alignItems:'center',gap:'0.25rem'}}>
                              <Ico.Clock s={11}/>{s.duration}
                            </p>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                            <span style={{color:tokens.color.gold,fontSize:'0.85rem',fontWeight:700}}>{s.price}</span>
                            <CircleCheck active={active}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {services.length>0&&(
                    <>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'0.4rem',marginBottom:'0.5rem'}}>
                        {services.map(s=>(
                          <span key={s.name} className="chip badge-pop">
                            <Ico.Check s={9} c={tokens.color.gold}/>{s.name}
                          </span>
                        ))}
                      </div>
                      {selectedCategories.length>1&&(
                        <div style={{display:'flex',flexWrap:'wrap',gap:'0.35rem',marginBottom:'0.75rem'}}>
                          {selectedCategories.map(c=>(
                            <span key={c} className="chip chip-cat badge-pop">{c}</span>
                          ))}
                        </div>
                      )}
                      <div style={{
                        display:'flex',justifyContent:'space-between',alignItems:'center',
                        background:'rgba(184,134,11,0.1)',border:'1px solid rgba(184,134,11,0.28)',
                        borderRadius:'0.625rem',padding:'0.55rem 0.9rem',marginBottom:'1rem',
                      }}>
                        <span style={{color:tokens.color.whiteFaint,fontSize:'0.74rem',fontFamily:tokens.font.family}}>
                          {services.length} service{services.length>1?'s':''} · {fmtMins(totalMins)}
                        </span>
                        <span style={{color:tokens.color.gold,fontSize:'0.9rem',fontWeight:700,fontFamily:tokens.font.family}}>
                          LKR {totalPrice.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="divider"/>

                  {/* Providers */}
                  <Label text="Choose Service Providers"/>
                  <div className="info-box" style={{marginBottom:'0.9rem'}}>
                    ✦ Showing providers who specialise in{' '}
                    <strong style={{color:tokens.color.gold}}>{categoriesForProviderFilter.join(', ')}</strong>
                  </div>

                  {!location?(
                    <p style={{color:tokens.color.whiteFaint,fontSize:'0.8rem',marginBottom:'1.25rem',fontFamily:tokens.font.family}}>
                      Please select a branch in Step 1 to see providers.
                    </p>
                  ):filteredProvs.length===0?(
                    <p style={{color:tokens.color.whiteFaint,fontSize:'0.8rem',marginBottom:'1.25rem',fontFamily:tokens.font.family}}>
                      No providers available for <strong style={{color:tokens.color.gold}}>{categoriesForProviderFilter.join(', ')}</strong> at {location}.
                    </p>
                  ):(
                    <div style={{display:'flex',flexDirection:'column',gap:'0.45rem',marginBottom:'0.9rem'}}>
                      {filteredProvs.map(p=>{
                        const active=providers.some(x=>x.name===p.name);
                        return (
                          <div key={p.name}
                            className={`prov-card${active?' prov-card-active':''}`}
                            onClick={()=>toggleProvider(p)} role="button" aria-pressed={active}>
                            <div className="prov-avatar">{p.avatar}</div>
                            <div style={{flex:1}}>
                              <p style={{color:tokens.color.whiteMuted,fontSize:'0.85rem',fontWeight:600}}>{p.name}</p>
                              <p style={{color:tokens.color.whiteFaint,fontSize:'0.71rem',marginTop:'0.1rem'}}>{p.role}</p>
                              <div style={{display:'flex',flexWrap:'wrap',gap:'0.28rem',marginTop:'0.32rem'}}>
                                {p.expertise.map(e=>{
                                  const match=categoriesForProviderFilter.includes(e);
                                  return (
                                    <span key={e} style={{
                                      fontSize:'0.6rem',fontWeight:600,letterSpacing:'0.07em',
                                      borderRadius:'999px',padding:'0.12rem 0.45rem',
                                      fontFamily:tokens.font.family,
                                      background:match?'rgba(184,134,11,0.25)':'rgba(255,255,255,0.06)',
                                      color:match?tokens.color.gold:tokens.color.whiteFaint,
                                      border:`1px solid ${match?'rgba(184,134,11,0.5)':'rgba(255,255,255,0.12)'}`,
                                    }}>{e}</span>
                                  );
                                })}
                              </div>
                            </div>
                            <CircleCheck active={active}/>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {providers.length>0&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:'0.4rem',marginBottom:'0.9rem'}}>
                      {providers.map(p=>(
                        <span key={p.name} className="chip badge-pop">
                          <Ico.Check s={9} c={tokens.color.gold}/>{p.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="divider"/>

                  {/* Date */}
                  <Label text="Preferred Date"/>
                  <input type="date" className="sayo-input"
                    value={date} min={today}
                    onChange={e=>{setDate(e.target.value);setTimeSlot('');}}
                    style={{marginBottom:'1.25rem'}}/>

                  {/* Time slots */}
                  {date&&(
                    <>
                      <Label text="Preferred Time"/>
                      <p style={{color:tokens.color.whiteFaint,fontSize:'0.72rem',marginBottom:'0.7rem',fontFamily:tokens.font.family}}>
                        {formatDate(date)}
                      </p>

                      {mode==='walkin'&&(
                        <div className="info-box-green" style={{marginBottom:'0.75rem',display:'flex',gap:'0.5rem',alignItems:'flex-start'}}>
                          <Ico.Info s={13}/>
                          <span>
                            Real-time availability shown below.{' '}
                            <strong style={{color:tokens.color.green}}>Green = available</strong>,{' '}
                            <strong style={{color:tokens.color.red}}>Red = already booked</strong>.
                          </span>
                        </div>
                      )}

                      {mode==='confirmed'
                        ?<ConfirmedTimeSlots timeSlot={timeSlot} setTimeSlot={setTimeSlot}/>
                        :<WalkinTimeSlots    timeSlot={timeSlot} setTimeSlot={setTimeSlot}/>
                      }
                    </>
                  )}

                  <div style={{display:'flex',justifyContent:'space-between',gap:'1rem'}}>
                    <button className="btn-ghost" onClick={()=>setStep(1)}
                      style={{padding:'0.75rem 1.5rem',fontSize:'0.85rem'}}>
                      ← Back
                    </button>
                    <button className={btnClass} disabled={!canStep3}
                      onClick={()=>setStep(3)}
                      style={{padding:'0.8rem 2rem',fontSize:'0.87rem'}}>
                      Review Booking <Ico.Right/>
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {/* ══════════════════════════
                STEP 3 — CONFIRM
            ══════════════════════════ */}
            {step===3&&(
              <div className="reveal-up">
                <Card mode={mode}>
                  <Label text="Review Your Booking"/>

                  <div style={{marginBottom:'1rem'}}>
                    <span className={`mode-badge ${mode==='walkin'?'mode-badge-walkin':'mode-badge-confirmed'}`}>
                      {mode==='walkin'
                        ?<><Ico.Walk s={11}/>Without Confirmation</>
                        :<><Ico.CalCheck s={11}/>With Confirmation</>
                      }
                    </span>
                  </div>

                  {mode==='walkin'&&(
                    <div className="info-box-green" style={{marginBottom:'1rem',display:'flex',gap:'0.5rem',alignItems:'flex-start'}}>
                      <Ico.Info s={13}/>
                      <span style={{fontSize:'0.75rem',color:tokens.color.whiteDim,fontFamily:tokens.font.family}}>
                        You are registering a booking <strong style={{color:tokens.color.green}}>without confirmation</strong>. No confirmation email will be sent. Please arrive at least 5 minutes before your slot.
                      </span>
                    </div>
                  )}

                  <div className="cf-block">
                    <SumRow icon={<Ico.User/>}    label="Name"   value={name}/>
                    <SumRow icon={<Ico.Phone/>}    label="Phone"  value={phone}/>
                    <SumRow icon={<Ico.Mail/>}     label="Email"  value={email}/>
                    <SumRow icon={<Ico.Location/>} label="Branch" value={location}/>
                  </div>

                  <div className="cf-block">
                    <SumRow icon={<Ico.Scissors/>}
                      label="Service(s)"
                      value={services.map(s=>s.name).join(', ')}/>
                    <SumRow icon={<Ico.Scissors/>}
                      label="Categories"
                      value={selectedCategories.join(', ')}/>
                    <SumRow icon={<Ico.Clock/>}
                      label="Duration"
                      value={fmtMins(totalMins)}/>
                    <SumRow icon={<Ico.User/>}
                      label="Provider(s)"
                      value={providers.map(p=>`${p.name} (${p.role})`).join(', ')}/>
                    <SumRow icon={<Ico.Calendar/>}
                      label="Date"
                      value={date?formatDate(date):''}/>
                    <SumRow icon={<Ico.Clock/>}    label="Time"   value={timeSlot}/>
                  </div>

                  {/* price */}
                  <div style={{
                    display:'flex',justifyContent:'space-between',alignItems:'center',
                    background:tokens.color.goldBg,border:`1px solid ${tokens.color.goldBorder}`,
                    borderRadius:'0.75rem',padding:'0.85rem 1.1rem',marginBottom:'1.25rem',
                  }}>
                    <span style={{color:tokens.color.whiteMuted,fontSize:'0.8rem',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:tokens.font.family}}>
                      Total Price
                    </span>
                    <span style={{color:tokens.color.gold,fontSize:'1.15rem',fontWeight:700,fontFamily:tokens.font.family}}>
                      LKR {totalPrice.toLocaleString()}
                    </span>
                  </div>

                  {/* notes */}
                  <div style={{marginBottom:'1.25rem'}}>
                    <FieldLabel text="Special Requests" opt/>
                    <textarea className="sayo-input"
                      placeholder="Allergies, preferences, or anything else we should know…"
                      value={notes} onChange={e=>setNotes(e.target.value)}
                      rows={3} style={{resize:'vertical',minHeight:'76px',lineHeight:1.6}}/>
                  </div>

                  <p style={{color:tokens.color.whiteFaint,fontSize:'0.7rem',lineHeight:1.75,marginBottom:'1.25rem',fontFamily:tokens.font.family}}>
                    {mode==='walkin'
                      ?'Bookings without confirmation are first-come-first-served. Please arrive on time. Payment collected at salon.'
                      :'Payment is collected at the salon. Please notify us at least 24 hours in advance to cancel or reschedule.'
                    }
                  </p>

                  <div style={{display:'flex',justifyContent:'space-between',gap:'1rem'}}>
                    <button className="btn-ghost" onClick={()=>setStep(2)}
                      style={{padding:'0.75rem 1.5rem',fontSize:'0.85rem'}}>
                      ← Back
                    </button>
                    <button className={btnClass} disabled={loading}
                      onClick={handleConfirm}
                      style={{padding:'0.8rem 2rem',fontSize:'0.87rem',minWidth:'200px'}}>
                      {loading?(
                        <>
                          <span style={{
                            width:'0.85rem',height:'0.85rem',
                            border:'2px solid rgba(255,255,255,0.3)',
                            borderTopColor:'#fff',borderRadius:'50%',
                            display:'inline-block',animation:'spin 0.7s linear infinite',
                          }}/>
                          {mode==='walkin'?'Registering…':'Confirming…'}
                        </>
                      ):mode==='walkin'?'Register Without Confirmation':'Confirm Booking'}
                    </button>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>
      </main>
    </>
  );
}