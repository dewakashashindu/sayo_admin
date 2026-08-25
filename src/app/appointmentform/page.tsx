'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface ServiceItem {
  id: number;
  name: string;
  duration: string;
  durationMins: number;
  price: number;
  category: string;
}
interface Provider {
  id: number;
  name: string;
  role: string;
  expertise: string[];
  branch: string;
  avatar: string;
}
interface BookingFormData {
  fullName: string;
  phoneNumber: string;
  emailAddress: string;
  gender: string;
  branch: string;
  activeCategory: string;
  selectedServices: number[];
  selectedProviders: number[];
  date: string;
  timeSlot: string;
  specialRequest: string;
}
interface FieldErrors {
  fullName?: string;
  phoneNumber?: string;
  branch?: string;
  selectedServices?: string;
  providers?: string;
  date?: string;
  timeSlot?: string;
}

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const SERVICE_CATEGORIES = ['WAX', 'HAIR', 'SKIN', 'NAIL', 'BODY', 'BRIDAL'] as const;
type ServiceCategory = typeof SERVICE_CATEGORIES[number];

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  WAX:    'Hair Removal',
  HAIR:   'Hair Services',
  SKIN:   'Skin Treatments',
  NAIL:   'Nail Services',
  BODY:   'Body Treatments',
  BRIDAL: 'Bridal Services',
};

const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; text: string; dot: string }> = {
  WAX:    { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  HAIR:   { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  SKIN:   { bg: '#fce7f3', text: '#9d174d', dot: '#ec4899' },
  NAIL:   { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
  BODY:   { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  BRIDAL: { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
};

const SERVICES: ServiceItem[] = [
  // WAX
  { id: 101, name: 'Full Arms Wax',      duration: '45 min',  durationMins: 45,  price: 2500,  category: 'WAX' },
  { id: 102, name: 'Full Legs Wax',      duration: '60 min',  durationMins: 60,  price: 3500,  category: 'WAX' },
  { id: 103, name: 'Underarm Wax',       duration: '20 min',  durationMins: 20,  price: 1200,  category: 'WAX' },
  { id: 104, name: 'Eyebrow Threading',  duration: '15 min',  durationMins: 15,  price: 800,   category: 'WAX' },
  { id: 105, name: 'Full Body Wax',      duration: '120 min', durationMins: 120, price: 7500,  category: 'WAX' },
  { id: 106, name: 'Chest Wax',          duration: '30 min',  durationMins: 30,  price: 3200,  category: 'WAX' },
  { id: 107, name: 'Back Wax',           duration: '35 min',  durationMins: 35,  price: 3600,  category: 'WAX' },
  { id: 108, name: 'Beard Shaping',      duration: '20 min',  durationMins: 20,  price: 1000,  category: 'WAX' },
  // HAIR
  { id: 201, name: 'Cut & Re-Style',        duration: '60 min',  durationMins: 60,  price: 4200, category: 'HAIR' },
  { id: 202, name: 'Fringe Cut',            duration: '20 min',  durationMins: 20,  price: 1500, category: 'HAIR' },
  { id: 203, name: 'Blow Dry (Short)',       duration: '30 min',  durationMins: 30,  price: 2500, category: 'HAIR' },
  { id: 204, name: 'Hair Wash & Blast Dry', duration: '25 min',  durationMins: 25,  price: 2100, category: 'HAIR' },
  { id: 205, name: 'Trim',                  duration: '20 min',  durationMins: 20,  price: 1500, category: 'HAIR' },
  { id: 206, name: 'Haircut Classic',       duration: '30 min',  durationMins: 30,  price: 1800, category: 'HAIR' },
  { id: 207, name: 'Beard Trim',            duration: '20 min',  durationMins: 20,  price: 900,  category: 'HAIR' },
  { id: 208, name: 'Hair Color',            duration: '60 min',  durationMins: 60,  price: 3500, category: 'HAIR' },
  { id: 209, name: 'Head Massage',          duration: '30 min',  durationMins: 30,  price: 1500, category: 'HAIR' },
  // SKIN
  { id: 301, name: 'Classic Facial',        duration: '45 min', durationMins: 45, price: 3000, category: 'SKIN' },
  { id: 302, name: 'Gold Facial',           duration: '60 min', durationMins: 60, price: 6500, category: 'SKIN' },
  { id: 303, name: 'Skin Brightening',      duration: '60 min', durationMins: 60, price: 5200, category: 'SKIN' },
  { id: 304, name: 'Acne Treatment',        duration: '50 min', durationMins: 50, price: 4800, category: 'SKIN' },
  { id: 305, name: 'Anti-Aging Facial',     duration: '75 min', durationMins: 75, price: 7200, category: 'SKIN' },
  { id: 306, name: 'Deep Cleansing Facial', duration: '45 min', durationMins: 45, price: 3500, category: 'SKIN' },
  { id: 307, name: 'Beard Care Facial',     duration: '40 min', durationMins: 40, price: 3200, category: 'SKIN' },
  { id: 308, name: 'Whitening Facial',      duration: '60 min', durationMins: 60, price: 4800, category: 'SKIN' },
  { id: 309, name: 'Detox Facial',          duration: '65 min', durationMins: 65, price: 5500, category: 'SKIN' },
  // NAIL
  { id: 401, name: 'Classic Manicure',   duration: '30 min', durationMins: 30, price: 1800, category: 'NAIL' },
  { id: 402, name: 'Gel Manicure',       duration: '45 min', durationMins: 45, price: 3200, category: 'NAIL' },
  { id: 403, name: 'Classic Pedicure',   duration: '40 min', durationMins: 40, price: 2200, category: 'NAIL' },
  { id: 404, name: 'Gel Pedicure',       duration: '55 min', durationMins: 55, price: 3800, category: 'NAIL' },
  { id: 405, name: 'Nail Art (Per Set)', duration: '30 min', durationMins: 30, price: 1500, category: 'NAIL' },
  { id: 406, name: 'Basic Manicure',     duration: '25 min', durationMins: 25, price: 1200, category: 'NAIL' },
  { id: 407, name: 'Basic Pedicure',     duration: '30 min', durationMins: 30, price: 1500, category: 'NAIL' },
  { id: 408, name: 'Nail Trim & Buff',   duration: '15 min', durationMins: 15, price: 800,  category: 'NAIL' },
  { id: 409, name: 'Callus Removal',     duration: '20 min', durationMins: 20, price: 1000, category: 'NAIL' },
  { id: 410, name: 'Hand Spa',           duration: '35 min', durationMins: 35, price: 2200, category: 'NAIL' },
  // BODY
  { id: 501, name: 'Full Body Massage',       duration: '60 min', durationMins: 60, price: 5500, category: 'BODY' },
  { id: 502, name: 'Body Scrub',              duration: '45 min', durationMins: 45, price: 4200, category: 'BODY' },
  { id: 503, name: 'Body Wrap',               duration: '75 min', durationMins: 75, price: 6000, category: 'BODY' },
  { id: 504, name: 'Aromatherapy Massage',    duration: '60 min', durationMins: 60, price: 6800, category: 'BODY' },
  { id: 505, name: 'Hot Stone Massage',       duration: '75 min', durationMins: 75, price: 7500, category: 'BODY' },
  { id: 506, name: 'Deep Tissue Massage',     duration: '60 min', durationMins: 60, price: 6000, category: 'BODY' },
  { id: 507, name: 'Sports Massage',          duration: '60 min', durationMins: 60, price: 6500, category: 'BODY' },
  { id: 508, name: 'Back Massage',            duration: '40 min', durationMins: 40, price: 3500, category: 'BODY' },
  { id: 509, name: 'Head & Shoulder Massage', duration: '35 min', durationMins: 35, price: 2800, category: 'BODY' },
  // BRIDAL
  { id: 601, name: 'Bridal Package Full',  duration: '180 min', durationMins: 180, price: 45000, category: 'BRIDAL' },
  { id: 602, name: 'Bridal Hair & Makeup', duration: '120 min', durationMins: 120, price: 18000, category: 'BRIDAL' },
  { id: 603, name: 'Pre-Bridal Package',   duration: '150 min', durationMins: 150, price: 22000, category: 'BRIDAL' },
  { id: 604, name: 'Trial Makeup',         duration: '60 min',  durationMins: 60,  price: 6500,  category: 'BRIDAL' },
  { id: 605, name: 'Bridal Draping',       duration: '45 min',  durationMins: 45,  price: 5000,  category: 'BRIDAL' },
  { id: 606, name: 'Groom Package',        duration: '150 min', durationMins: 150, price: 25000, category: 'BRIDAL' },
  { id: 607, name: 'Groom Hair & Makeup',  duration: '90 min',  durationMins: 90,  price: 10000, category: 'BRIDAL' },
  { id: 608, name: 'Pre-Groom Package',    duration: '120 min', durationMins: 120, price: 14000, category: 'BRIDAL' },
  { id: 609, name: 'Groom Facial',         duration: '60 min',  durationMins: 60,  price: 4500,  category: 'BRIDAL' },
  { id: 610, name: 'Groom Grooming',       duration: '45 min',  durationMins: 45,  price: 3500,  category: 'BRIDAL' },
];

const ALL_PROVIDERS: Provider[] = [
  // COLOMBO
  { id: 1,  name: 'Nadeesha',  role: 'Senior Hair Stylist',   expertise: ['HAIR', 'BRIDAL'],         branch: 'COLOMBO',      avatar: 'N' },
  { id: 2,  name: 'Priyanka',  role: 'Beauty Therapist',      expertise: ['SKIN', 'BODY', 'BRIDAL'], branch: 'COLOMBO',      avatar: 'P' },
  { id: 3,  name: 'Chamari',   role: 'Nail Technician',       expertise: ['NAIL'],                   branch: 'COLOMBO',      avatar: 'C' },
  { id: 4,  name: 'Dilrukshi', role: 'Wax Specialist',        expertise: ['WAX'],                    branch: 'COLOMBO',      avatar: 'D' },
  { id: 5,  name: 'Sewwandi',  role: 'Massage Therapist',     expertise: ['BODY'],                   branch: 'COLOMBO',      avatar: 'S' },
  { id: 6,  name: 'Thilini',   role: 'Bridal & Skin Expert',  expertise: ['BRIDAL', 'SKIN'],         branch: 'COLOMBO',      avatar: 'T' },
  // NEGOMBO
  { id: 7,  name: 'Dilanka',   role: 'Hair Specialist',       expertise: ['HAIR', 'BRIDAL'],         branch: 'NEGOMBO',      avatar: 'D' },
  { id: 8,  name: 'Sanduni',   role: 'Skin Therapist',        expertise: ['SKIN'],                   branch: 'NEGOMBO',      avatar: 'S' },
  { id: 9,  name: 'Nimasha',   role: 'Nail & Wax Expert',     expertise: ['NAIL', 'WAX'],            branch: 'NEGOMBO',      avatar: 'N' },
  { id: 10, name: 'Kavindi',   role: 'Body Therapist',        expertise: ['BODY', 'BRIDAL'],         branch: 'NEGOMBO',      avatar: 'K' },
  // KIRIBATHGODA
  { id: 11, name: 'Rashmika',  role: 'Senior Body Therapist', expertise: ['BODY', 'BRIDAL'],         branch: 'KIRIBATHGODA', avatar: 'R' },
  { id: 12, name: 'Tharushi',  role: 'Bridal Specialist',     expertise: ['BRIDAL', 'HAIR'],         branch: 'KIRIBATHGODA', avatar: 'T' },
  { id: 13, name: 'Maleesha',  role: 'Nail Artist',           expertise: ['NAIL'],                   branch: 'KIRIBATHGODA', avatar: 'M' },
  { id: 14, name: 'Oshadi',    role: 'Hair Stylist',          expertise: ['HAIR', 'SKIN'],           branch: 'KIRIBATHGODA', avatar: 'O' },
  { id: 15, name: 'Chanika',   role: 'Wax Therapist',         expertise: ['WAX', 'BODY'],            branch: 'KIRIBATHGODA', avatar: 'C' },
];

const TIME_SLOTS = [
  '8:00 AM','8:30 AM','9:00 AM','9:30 AM',
  '10:00 AM','10:30 AM','11:00 AM','11:30 AM',
  '12:00 PM','12:30 PM','1:00 PM','1:30 PM',
  '2:00 PM','2:30 PM','3:00 PM','3:30 PM',
  '4:00 PM','4:30 PM','5:00 PM','5:30 PM',
];

const MAX_SPECIAL_REQUEST = 250;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function fmtMins(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h} hr ${r} min` : `${h} hr`;
}
function genRef(): string {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `SB-${ts}-${rnd}`;
}

/* ─────────────────────────────────────────
   PROVIDER TOGGLE LOGIC
───────────────────────────────────────── */
function toggleProviderLogic(
  prev: number[],
  provider: Provider,
  selectedCats: string[],
  allProviders: Provider[],
): number[] {
  const isMultiCat   = selectedCats.length > 1;
  const maxProviders = selectedCats.length || 1;

  if (prev.includes(provider.id)) return prev.filter(x => x !== provider.id);
  if (!isMultiCat) return [provider.id];

  const provCats = provider.expertise.filter(e => selectedCats.includes(e));
  if (provCats.length === 0) return prev;

  const currentProviders = allProviders.filter(p => prev.includes(p.id));
  const occupiedCats     = new Set(
    currentProviders.flatMap(p => p.expertise.filter(e => selectedCats.includes(e)))
  );
  const targetCat = provCats.find(cat => !occupiedCats.has(cat)) ?? provCats[0];
  const without   = prev.filter(pid => {
    const p = allProviders.find(x => x.id === pid);
    return !p?.expertise.includes(targetCat);
  });

  return [...without, provider.id].slice(0, maxProviders);
}

/* ─────────────────────────────────────────
   CSS  (sidebar + mob-nav CSS removed — now in AdminSidebar)
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes spin      { to { transform:rotate(360deg); } }
  @keyframes fadeUp    { from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;} }
  @keyframes slideUp   { from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:none;} }
  @keyframes slideDown { from{opacity:1;transform:translateY(0);}to{opacity:0;transform:translateY(24px);} }
  @keyframes selectPop { 0%{transform:scale(1);}40%{transform:scale(0.97);}100%{transform:scale(1);} }
  @keyframes chipIn    { from{opacity:0;transform:scale(0.8) translateY(4px);}to{opacity:1;transform:none;} }
  @keyframes provIn    { from{opacity:0;transform:translateX(-8px);}to{opacity:1;transform:none;} }
  @keyframes glow      { 0%,100%{box-shadow:0 0 0 0 rgba(30,58,64,0);}50%{box-shadow:0 0 0 4px rgba(30,58,64,0.15);} }

  .fade-up    { animation:fadeUp  0.2s  ease both; }
  .slide-up   { animation:slideUp 0.28s ease both; }
  .slide-down { animation:slideDown 0.22s ease both; }
  .chip-in    { animation:chipIn  0.2s  ease both; }
  .prov-in    { animation:provIn  0.18s ease both; }

  ::-webkit-scrollbar       { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.2); border-radius:4px; }
  * { scrollbar-width:thin; scrollbar-color:rgba(30,58,64,0.2) transparent; }

  /* ── Section card ── */
  .section-card {
    background:#deeaea; border-radius:14px;
    padding:20px 22px 24px;
    display:flex; flex-direction:column; gap:0;
    box-shadow:0 1px 4px rgba(0,0,0,0.07);
  }
  .section-title {
    font-size:18px; font-weight:600; color:#1f2937;
    display:flex; align-items:center; gap:9px;
  }
  .section-divider { height:1px; background:rgba(30,58,64,0.15); margin:12px 0 18px; }

  /* ── Category tabs ── */
  .cat-tab {
    position:relative;
    display:flex; flex-direction:column; align-items:center; gap:3px;
    padding:8px 14px; border-radius:10px; border:2px solid transparent;
    background:#d0e3e7; cursor:pointer;
    font-family:'Inter',sans-serif; font-size:12px; font-weight:700;
    color:#4b5563; letter-spacing:0.04em;
    transition:all 0.18s; white-space:nowrap; flex-shrink:0;
  }
  .cat-tab:hover:not(.active) { background:#c8dde3; }
  .cat-tab.active { background:#1e3a40; color:#fff; border-color:#1e3a40; }
  .cat-tab-sub {
    font-size:9px; font-weight:500; opacity:0.65;
    letter-spacing:0.02em; max-width:76px;
    text-align:center; line-height:1.2;
  }
  .cat-tab.active .cat-tab-sub { opacity:0.7; }
  .cat-dot {
    position:absolute; top:-5px; right:-5px;
    width:11px; height:11px; border-radius:50%;
    border:2px solid #deeaea; z-index:1;
  }

  /* ── Service cards ── */
  .svc-card {
    background:#d0e3e7; border-radius:10px;
    padding:14px 16px; cursor:pointer;
    border:2px solid transparent;
    transition:all 0.15s; display:flex;
    flex-direction:column; gap:5px;
    position:relative; overflow:hidden;
    text-align:left; font-family:'Inter',sans-serif;
  }
  .svc-card:hover:not(.selected) {
    background:#c8dde3; transform:translateY(-1px);
    box-shadow:0 3px 10px rgba(0,0,0,0.08);
  }
  .svc-card.selected {
    background:linear-gradient(135deg,#c4dce1,#b8d4da);
    border-color:#1e3a40;
    box-shadow:0 0 0 3px rgba(30,58,64,0.12);
    animation:selectPop 0.2s ease;
  }
  .svc-card:focus { outline:2px solid #1e3a40; outline-offset:2px; }
  .svc-card.error-highlight { border-color:#e53e3e !important; }

  .svc-check {
    width:22px; height:22px; border-radius:50%;
    border:2px solid rgba(30,58,64,0.3);
    background:#deeaea;
    display:flex; align-items:center; justify-content:center;
    transition:all 0.2s; flex-shrink:0;
    position:absolute; top:12px; right:12px;
  }
  .svc-check.checked { background:#1e3a40; border-color:#1e3a40; }

  /* ── Provider cards ── */
  .prov-card {
    background:#d0e3e7; border-radius:11px;
    padding:13px 15px; cursor:pointer;
    border:2px solid transparent;
    transition:all 0.17s; display:flex;
    align-items:center; gap:12px;
    font-family:'Inter',sans-serif;
    animation:provIn 0.18s ease both;
  }
  .prov-card:hover:not(.selected):not(.dimmed) {
    background:#c8dde3; transform:translateY(-1px);
  }
  .prov-card.selected {
    background:linear-gradient(135deg,#c4dce1,#b6d2d9);
    border-color:#1e3a40;
    box-shadow:0 0 0 3px rgba(30,58,64,0.13), 0 2px 8px rgba(0,0,0,0.08);
    animation:glow 1.2s ease 0.1s;
  }
  .prov-card.dimmed { opacity:0.4; cursor:not-allowed; }

  .prov-avatar {
    width:42px; height:42px; border-radius:50%;
    background:linear-gradient(135deg,#5a8a92,#3a6a72);
    display:flex; align-items:center; justify-content:center;
    color:#fff; font-weight:700; font-size:16px; flex-shrink:0;
    box-shadow:0 2px 6px rgba(0,0,0,0.15);
  }
  .prov-card.selected .prov-avatar {
    background:linear-gradient(135deg,#1e3a40,#2a5060);
  }

  /* ── Category slot ── */
  .cat-slot-row {
    border-radius:12px; overflow:hidden;
    border:1.5px solid rgba(30,58,64,0.12);
    margin-bottom:14px;
  }
  .cat-slot-header {
    display:flex; align-items:center; gap:8px;
    padding:10px 14px;
    background:rgba(30,58,64,0.06);
    border-bottom:1px solid rgba(30,58,64,0.1);
  }
  .cat-slot-body {
    padding:10px; display:flex; flex-direction:column;
    gap:8px; background:#d4e8ea;
  }

  /* ── Summary chip bar ── */
  .sum-bar {
    background:#1e3a40; border-radius:12px;
    padding:11px 15px;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  }
  .sum-chip {
    display:inline-flex; align-items:center; gap:5px;
    background:rgba(255,255,255,0.14); border-radius:20px;
    padding:4px 10px; font-size:11px; font-weight:600;
    color:#fff; white-space:nowrap;
    animation:chipIn 0.2s ease both;
  }
  .sum-chip-x {
    width:14px; height:14px; border-radius:50%;
    background:rgba(255,255,255,0.22);
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; font-size:9px; color:#fff; font-weight:700;
    transition:background 0.15s; flex-shrink:0;
    border:none; line-height:1;
  }
  .sum-chip-x:hover { background:rgba(255,255,255,0.42); }

  /* ── Form inputs ── */
  .form-lbl {
    font-size:11px; font-weight:700; color:#6b7280;
    text-transform:uppercase; letter-spacing:0.06em;
    display:block; margin-bottom:5px;
  }
  .form-lbl .req { color:#e53e3e; margin-left:2px; font-size:12px; }

  .form-inp {
    background:#d0e3e7; border:1.5px solid transparent; border-radius:9px;
    padding:0 14px; height:44px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    outline:none; width:100%;
    transition:border-color 0.18s, box-shadow 0.18s, background 0.18s;
  }
  .form-inp:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .form-inp::placeholder { color:rgba(0,0,0,0.32); }
  .form-inp.error { border-color:#e53e3e; background:#fdf0f0; }
  .form-inp.error:focus { box-shadow:0 0 0 3px rgba(229,62,62,0.1); }

  .form-sel {
    background:#d0e3e7; border:1.5px solid transparent; border-radius:9px;
    padding:0 34px 0 14px; height:44px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    outline:none; width:100%; cursor:pointer;
    appearance:none; -webkit-appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 11px center;
    background-color:#d0e3e7; transition:border-color 0.18s;
  }
  .form-sel:focus { border-color:#1e3a40; outline:none; }

  .form-ta {
    background:#d0e3e7; border:1.5px solid transparent; border-radius:9px;
    padding:12px 14px; resize:vertical;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    outline:none; width:100%; line-height:1.6;
    transition:border-color 0.18s;
  }
  .form-ta:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .form-ta::placeholder { color:rgba(0,0,0,0.32); }

  input[type="date"].form-inp { cursor:pointer; color-scheme:light; }
  input[type="date"].form-inp::-webkit-calendar-picker-indicator {
    opacity:0.5; cursor:pointer; filter:invert(0.3);
  }

  /* ── Branch buttons ── */
  .branch-btn {
    display:flex; align-items:center; justify-content:space-between;
    background:#d0e3e7; border-radius:9px; padding:0 14px;
    min-height:52px; cursor:pointer; border:2px solid transparent;
    transition:all 0.18s; flex:1;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600;
    color:#1f2937; gap:8px;
  }
  .branch-btn.selected { border-color:#1e3a40; background:#c4dce1; }
  .branch-btn:hover:not(.selected) { background:#c8dde3; }
  .branch-btn.error-border { border-color:#e53e3e; }
  .b-radio {
    width:20px; height:20px; border-radius:50%;
    border:2px solid rgba(30,58,64,0.5);
    background:#deeaea; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; transition:all 0.2s;
  }
  .b-radio.checked { background:#1e3a40; border-color:#1e3a40; }
  .b-radio.checked::after {
    content:''; width:7px; height:7px;
    border-radius:50%; background:#fff; display:block;
  }

  /* ── Time slot buttons ── */
  .ts-btn {
    background:#d0e3e7; border-radius:8px;
    padding:10px 4px; text-align:center;
    font-family:'Inter',sans-serif; font-size:12px; font-weight:600;
    cursor:pointer; border:2px solid transparent;
    transition:all 0.15s; color:#1e3a40;
    min-height:42px; display:flex; align-items:center; justify-content:center;
  }
  .ts-btn.selected {
    background:#1e3a40; color:#fff;
    border-color:#1e3a40; transform:scale(1.04);
  }
  .ts-btn:hover:not(.selected) { background:#b8d0d5; transform:scale(1.02); }
  .ts-btn:focus { outline:2px solid #1e3a40; outline-offset:2px; }
  .ts-btn.error-highlight { border-color:#e53e3e; }

  /* ── Error message ── */
  .err-msg {
    font-size:11px; color:#e53e3e; font-weight:600;
    margin-top:4px; display:flex; align-items:center; gap:4px;
    animation:fadeUp 0.18s ease both;
  }

  /* ── Header search ── */
  .srch {
    border:1.5px solid #c0cbcc; border-radius:10px;
    padding:0 14px 0 38px; height:40px; width:260px;
    font-family:'Inter',sans-serif; font-size:14px; color:#1f2937;
    background:#fff; outline:none;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .srch:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .srch::placeholder { color:rgba(0,0,0,0.35); }

  /* ── Confirm button ── */
  .confirm-btn {
    background:#1e3a40; color:#fff;
    border:none; border-radius:10px;
    width:100%; height:50px;
    font-family:'Inter',sans-serif; font-size:15px; font-weight:700;
    cursor:pointer; transition:all 0.18s; letter-spacing:0.02em;
    display:flex; align-items:center; justify-content:center; gap:10px;
  }
  .confirm-btn:hover:not(:disabled) {
    background:#2a5060; transform:translateY(-1px);
    box-shadow:0 4px 14px rgba(0,0,0,0.18);
  }
  .confirm-btn:active:not(:disabled) { transform:none; }
  .confirm-btn:disabled {
    background:#6b8e96; cursor:not-allowed;
    opacity:0.8; transform:none !important;
  }

  /* ── Spinner ── */
  .spinner {
    width:18px; height:18px; border-radius:50%;
    border:2.5px solid rgba(255,255,255,0.35);
    border-top-color:#fff;
    animation:spin 0.7s linear infinite; flex-shrink:0;
  }

  /* ── Summary card ── */
  .summary-card {
    background:#deeaea; border-radius:14px;
    padding:20px 20px 24px; position:sticky; top:16px;
    display:flex; flex-direction:column; gap:0;
    box-shadow:0 1px 4px rgba(0,0,0,0.07);
  }
  .sum-divider { height:1px; background:rgba(30,58,64,0.15); margin:10px 0 16px; }
  .sum-dotted  { border-top:1px dashed rgba(30,58,64,0.25); margin:12px 0; }

  /* ── Modal ── */
  .modal-bg {
    position:fixed; inset:0; background:rgba(0,0,0,0.46);
    z-index:9999; display:flex; align-items:flex-end; justify-content:center;
    backdrop-filter:blur(4px);
  }
  .modal-bg.closing { animation:fadeUp 0.18s ease reverse both; }
  .modal-box {
    background:#fff; border-radius:20px 20px 0 0;
    width:100%; max-width:540px; padding:28px 24px 36px;
    box-shadow:0 -8px 40px rgba(0,0,0,0.2);
    font-family:'Inter',sans-serif; animation:slideUp 0.28s ease both;
  }
  .modal-box.closing { animation:slideDown 0.22s ease both; }
  @media(min-width:700px) {
    .modal-bg  { align-items:center; padding:16px; }
    .modal-box { border-radius:16px; }
  }

  /* ── Empty state ── */
  .empty-state {
    background:#d0e3e7; border-radius:9px;
    padding:28px 16px; text-align:center;
    display:flex; flex-direction:column; align-items:center; gap:10px;
  }
  .empty-icon {
    width:48px; height:48px; border-radius:50%;
    background:rgba(30,58,64,0.1);
    display:flex; align-items:center; justify-content:center;
  }

  /* ── Char counter ── */
  .char-counter {
    font-size:11px; font-weight:600; text-align:right;
    margin-top:5px; transition:color 0.18s;
  }

  /* ── Provider progress bar ── */
  .prov-progress {
    height:4px; border-radius:99px;
    background:rgba(30,58,64,0.12); overflow:hidden; margin-top:8px;
  }
  .prov-progress-fill {
    height:100%; border-radius:99px;
    background:linear-gradient(90deg,#1e3a40,#3a8a92);
    transition:width 0.35s cubic-bezier(.4,0,.2,1);
  }

  /* ── Responsive ── */
  @media(max-width:1199px) { .srch{width:200px!important;} }
  @media(max-width:960px) {
    .summary-col{display:none!important;}
    .mobile-sum{display:flex!important; flex-direction:column; gap:12px;}
  }
  @media(max-width:767px) {
    .main-body{padding-bottom:80px!important;}
    .hdr-name{display:none!important;}
    .two-col{flex-direction:column!important;}
  }
  @media(max-width:480px) {
    .main-body{padding:10px 10px 80px!important;}
    .hdr-inner{padding:0 12px!important; height:52px!important;}
    .srch{width:100%!important; font-size:13px!important; height:38px!important;}
    .srch-wrap{flex:1!important;}
    .two-inp{flex-direction:column!important;}
    .branch-row{flex-direction:column!important;}
    .page-title{font-size:22px!important;}
    .page-sub{font-size:13px!important;}
    .branch-btn{flex:unset!important; width:100%!important;}
    .cat-tabs-wrap{gap:5px!important;}
    .cat-tab{padding:6px 9px!important; font-size:11px!important;}
    .svc-grid{grid-template-columns:1fr!important;}
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IBell()    { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({ s = 14 }: { s?: number }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IPerson()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IMapPin()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function IScissors(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>; }
function ICalIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function INote()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>; }
function IBookmark(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>; }
function ICheck()   { return <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>; }
function ITag()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }
function IAlertCircle() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function IInbox()   { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>; }
function IPrint()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function IProvIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function ICheckSm() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function IInfo()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>; }

/* ─────────────────────────────────────────
   SUCCESS MODAL
───────────────────────────────────────── */
function SuccessModal({ name, services, providers, totalPrice, totalDuration, date, time, branch, refNumber, onClose }: {
  name: string; services: ServiceItem[]; providers: Provider[];
  totalPrice: number; totalDuration: number;
  date: string; time: string; branch: string; refNumber: string; onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  function handleClose() { setClosing(true); setTimeout(() => onClose(), 210); }

  function handlePrint() {
    const w = window.open('', '_blank', 'width=440,height=680');
    if (!w) return;
    const svcRows = services.map(s =>
      `<div class="row"><span class="lbl">${s.name} <span style="color:#9ca3af;font-size:11px;">(${s.category})</span></span><span class="val">LKR ${s.price.toLocaleString()}</span></div>`
    ).join('');
    const provRows = providers.map(p =>
      `<div class="row"><span class="lbl">${p.name}</span><span class="val">${p.role}</span></div>`
    ).join('');
    w.document.write(`
      <html><head><title>Booking Receipt</title>
      <style>
        body{font-family:'Inter',sans-serif;padding:32px;color:#1e3a40;max-width:400px;margin:0 auto;}
        h2{font-size:20px;margin-bottom:4px;}
        p{font-size:13px;color:#6b7280;margin-bottom:20px;}
        .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px;}
        .row:last-child{border-bottom:none;}
        .lbl{color:#9ca3af;font-weight:600;}
        .val{color:#1e3a40;font-weight:700;}
        .ref{background:#f0f8f9;border-radius:8px;padding:10px 14px;margin-top:16px;text-align:center;font-size:14px;font-weight:700;letter-spacing:0.08em;}
        .sec{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 4px;}
        .total{display:flex;justify-content:space-between;padding:10px 0 0;font-size:15px;font-weight:700;color:#1e3a40;border-top:2px solid #1e3a40;margin-top:6px;}
      </style></head><body>
      <h2>Booking Confirmed</h2>
      <p>Walk-in booking receipt — Sayo Beauty</p>
      <div class="row"><span class="lbl">Client</span><span class="val">${name || 'Walk-in Client'}</span></div>
      <div class="row"><span class="lbl">Date</span><span class="val">${date}</span></div>
      <div class="row"><span class="lbl">Time</span><span class="val">${time}</span></div>
      <div class="row"><span class="lbl">Branch</span><span class="val">${branch}</span></div>
      <div class="sec">Services</div>${svcRows}
      <div class="total"><span>Total</span><span>LKR ${totalPrice.toLocaleString()}</span></div>
      ${providers.length > 0 ? `<div class="sec">Assigned Providers</div>${provRows}` : ''}
      <div class="ref">REF: ${refNumber}</div>
      </body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <div className={`modal-bg ${closing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal-box ${closing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
          <div style={{width:36,height:4,borderRadius:99,background:'#e0e0e0'}}/>
        </div>
        <div style={{textAlign:'center',marginBottom:8}}><ICheck/></div>
        <h2 style={{textAlign:'center',fontSize:22,fontWeight:700,color:'#1e3a40',marginBottom:4}}>
          Booking Confirmed!
        </h2>
        <p style={{textAlign:'center',fontSize:13,color:'#6b7280',marginBottom:10}}>
          Walk-in booking has been successfully registered.
        </p>
        <div style={{textAlign:'center',marginBottom:16}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:6,background:'#f0f8f9',border:'1.5px solid #c4dce1',borderRadius:20,padding:'5px 14px',fontSize:13,fontWeight:700,color:'#1e3a40',letterSpacing:'0.06em'}}>
            <ITag/> REF: {refNumber}
          </span>
        </div>
        <div style={{background:'#f0f8f9',borderRadius:12,padding:'14px 16px',display:'flex',flexDirection:'column',gap:8,marginBottom:16,maxHeight:320,overflowY:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
            <span style={{color:'#9ca3af',fontWeight:600}}>Client</span>
            <span style={{color:'#1e3a40',fontWeight:700}}>{name || 'Walk-in Client'}</span>
          </div>
          <div>
            <p style={{fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Services</p>
            {services.map(s => {
              const col = CATEGORY_COLORS[s.category as ServiceCategory];
              return (
                <div key={s.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:col.dot,display:'inline-block',flexShrink:0}}/>
                    <span style={{color:'#374151'}}>{s.name}</span>
                  </div>
                  <span style={{color:'#1e3a40',fontWeight:600}}>LKR {s.price.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:14,borderTop:'1px dashed rgba(30,58,64,0.2)',paddingTop:8}}>
            <span style={{color:'#1e3a40',fontWeight:700}}>Total</span>
            <span style={{color:'#1e3a40',fontWeight:700}}>LKR {totalPrice.toLocaleString()} · {fmtMins(totalDuration)}</span>
          </div>
          {providers.length > 0 && (
            <div>
              <p style={{fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Assigned Providers</p>
              {providers.map(p => (
                <div key={p.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                  <span style={{color:'#374151',fontWeight:600}}>{p.name}</span>
                  <span style={{color:'#6b7280'}}>{p.role}</span>
                </div>
              ))}
            </div>
          )}
          {[
            { label: 'Date',   value: date   },
            { label: 'Time',   value: time   },
            { label: 'Branch', value: branch },
          ].map(r => (
            <div key={r.label} style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
              <span style={{color:'#9ca3af',fontWeight:600}}>{r.label}</span>
              <span style={{color:'#1e3a40',fontWeight:700}}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={handlePrint}
            style={{flex:1,height:46,borderRadius:10,border:'1.5px solid #1e3a40',background:'transparent',color:'#1e3a40',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'background 0.15s'}}
            onMouseEnter={e => e.currentTarget.style.background='#f0f8f9'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          ><IPrint/> Print Receipt</button>
          <button onClick={handleClose}
            style={{flex:2,height:46,borderRadius:10,border:'none',background:'#1e3a40',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:"'Inter',sans-serif",transition:'background 0.15s'}}
            onMouseEnter={e => e.currentTarget.style.background='#2a5060'}
            onMouseLeave={e => e.currentTarget.style.background='#1e3a40'}
          >Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   BOOKING SUMMARY PANEL
───────────────────────────────────────── */
function BookingSummary({ form, selectedSvcs, selectedProviders, totalPrice, totalMins }: {
  form: BookingFormData;
  selectedSvcs: ServiceItem[];
  selectedProviders: Provider[];
  totalPrice: number;
  totalMins: number;
}) {
  const fmtDate = (iso: string) =>
    iso ? new Date(iso + 'T00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';

  return (
    <div className="summary-card">
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <IBookmark/>
        <span style={{fontSize:17,fontWeight:600,color:'#1f2937'}}>Booking Summary</span>
      </div>
      <div className="sum-divider"/>

      <p style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Services</p>
      {selectedSvcs.length === 0 ? (
        <p style={{fontSize:13,color:'rgba(0,0,0,0.35)',fontStyle:'italic'}}>No services selected</p>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {selectedSvcs.map(s => {
            const col = CATEGORY_COLORS[s.category as ServiceCategory];
            return (
              <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:6}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:1}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:col.dot,flexShrink:0,display:'inline-block'}}/>
                    <span style={{fontSize:12,fontWeight:600,color:'#1e3a40',lineHeight:1.3}}>{s.name}</span>
                  </div>
                  <span style={{fontSize:10,color:'#6b7280',marginLeft:12}}>{s.duration}</span>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:'#1e3a40',whiteSpace:'nowrap'}}>
                  LKR {s.price.toLocaleString()}
                </span>
              </div>
            );
          })}
          <div style={{borderTop:'1px dashed rgba(30,58,64,0.2)',paddingTop:8,marginTop:2}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:700,color:'#1e3a40'}}>
              <span>Total</span>
              <span>LKR {totalPrice.toLocaleString()}</span>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',fontSize:11,color:'#6b7280',marginTop:1}}>
              {fmtMins(totalMins)}
            </div>
          </div>
        </div>
      )}

      {selectedProviders.length > 0 && (
        <>
          <div className="sum-dotted"/>
          <p style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Providers</p>
          {selectedProviders.map(p => (
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:11,flexShrink:0}}>
                {p.avatar}
              </div>
              <div>
                <p style={{fontSize:12,fontWeight:700,color:'#1e3a40'}}>{p.name}</p>
                <p style={{fontSize:10,color:'#6b7280'}}>{p.role}</p>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="sum-dotted"/>
      <p style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Appointment</p>
      {form.date
        ? <p style={{fontSize:13,fontWeight:600,color:'#1f2937',marginBottom:3}}>{fmtDate(form.date)}</p>
        : <p style={{fontSize:12,color:'rgba(0,0,0,0.32)',fontStyle:'italic',marginBottom:3}}>No date selected</p>
      }
      {form.timeSlot
        ? <p style={{fontSize:13,fontWeight:600,color:'#1f2937',marginBottom:3}}>{form.timeSlot}</p>
        : <p style={{fontSize:12,color:'rgba(0,0,0,0.32)',fontStyle:'italic',marginBottom:3}}>No time selected</p>
      }
      {form.branch && <p style={{fontSize:11,color:'#6b7280'}}>{form.branch}</p>}

      {form.fullName && (
        <>
          <div className="sum-dotted"/>
          <p style={{fontSize:13,fontWeight:700,color:'#1e3a40',textTransform:'uppercase',letterSpacing:'0.04em'}}>{form.fullName}</p>
          {form.phoneNumber && <p style={{fontSize:11,color:'#6b7280',marginTop:2}}>{form.phoneNumber}</p>}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   SECTION CARD WRAPPER
───────────────────────────────────────── */
function SCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="section-card">
      <div className="section-title">{icon}{title}</div>
      <div className="section-divider"/>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────
   ERROR MESSAGE
───────────────────────────────────────── */
function ErrMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="err-msg">
      <IAlertCircle/> {msg}
    </p>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function WalkInPage() {
  const router = useRouter();
  const [navKey,      setNavKey]      = useState('calendar');
  const [search,      setSearch]      = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [refNumber,   setRefNumber]   = useState('');
  const [errors,      setErrors]      = useState<FieldErrors>({});

  const [form, setForm] = useState<BookingFormData>({
    fullName: '', phoneNumber: '', emailAddress: '', gender: '',
    branch: '', activeCategory: 'WAX',
    selectedServices: [], selectedProviders: [],
    date: '', timeSlot: '', specialRequest: '',
  });

  useEffect(() => {
    document.title = 'New Walk-in Booking | Sayo Beauty';
    return () => { document.title = 'Sayo Beauty'; };
  }, []);

  /* ── Derived ── */
  const selectedSvcObjects  = SERVICES.filter(s => form.selectedServices.includes(s.id));
  const totalPrice          = selectedSvcObjects.reduce((a, s) => a + s.price, 0);
  const totalMins           = selectedSvcObjects.reduce((a, s) => a + s.durationMins, 0);
  const selectedCats        = [...new Set(selectedSvcObjects.map(s => s.category))];
  const isMultiCat          = selectedCats.length > 1;

  const branchProviders     = ALL_PROVIDERS.filter(p => p.branch === form.branch);
  const filteredProviders   = branchProviders.filter(p =>
    selectedCats.length === 0 || p.expertise.some(e => selectedCats.includes(e))
  );
  const selectedProvObjects = ALL_PROVIDERS.filter(p => form.selectedProviders.includes(p.id));

  const catCoverage: Record<string, Provider | null> = {};
  for (const cat of selectedCats) {
    catCoverage[cat] = selectedProvObjects.find(p => p.expertise.includes(cat)) ?? null;
  }
  const assignedCount          = Object.values(catCoverage).filter(Boolean).length;
  const providerRequirementMet = selectedCats.length === 0 || assignedCount === selectedCats.length;

  const visibleServices = SERVICES.filter(s => s.category === form.activeCategory);
  const availableSlots  = form.date ? TIME_SLOTS : [];
  const charLeft        = MAX_SPECIAL_REQUEST - form.specialRequest.length;
  const charColor       = charLeft < 30 ? '#e53e3e' : charLeft < 60 ? '#f59e0b' : '#9ca3af';

  function setField<K extends keyof BookingFormData>(k: K, v: BookingFormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function clearErr(k: keyof FieldErrors) {
    setErrors(e => ({ ...e, [k]: undefined }));
  }

  function toggleService(id: number) {
    const isSelected   = form.selectedServices.includes(id);
    const nextServices = isSelected
      ? form.selectedServices.filter(x => x !== id)
      : [...form.selectedServices, id];
    const nextSvcObjs  = SERVICES.filter(s => nextServices.includes(s.id));
    const nextCats     = [...new Set(nextSvcObjs.map(s => s.category))];
    const nextProviders = form.selectedProviders.filter(pid => {
      const p = ALL_PROVIDERS.find(x => x.id === pid);
      return p && p.expertise.some(e => nextCats.includes(e));
    });
    setForm(f => ({ ...f, selectedServices: nextServices, selectedProviders: nextProviders }));
    clearErr('selectedServices');
  }

  function toggleProvider(provider: Provider) {
    const next = toggleProviderLogic(form.selectedProviders, provider, selectedCats, ALL_PROVIDERS);
    setField('selectedProviders', next);
    clearErr('providers');
  }

  function removeService(id: number) { toggleService(id); }

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!form.fullName.trim())              e.fullName         = 'Full name is required.';
    if (!form.phoneNumber.trim())           e.phoneNumber      = 'Phone number is required.';
    if (!form.branch)                       e.branch           = 'Please select a branch.';
    if (form.selectedServices.length === 0) e.selectedServices = 'Please select at least one service.';
    if (!form.date)                         e.date             = 'Please select a date.';
    if (!form.timeSlot)                     e.timeSlot         = 'Please select a time slot.';
    return e;
  }

  async function handleSubmit() {
    setSubmitted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const el = document.querySelector('.form-inp.error, .branch-btn.error-border, .svc-card.error-highlight, .ts-btn.error-highlight');
      el?.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    setIsLoading(false);
    setRefNumber(genRef());
    setShowSuccess(true);
  }

  function resetForm() {
    setForm({
      fullName: '', phoneNumber: '', emailAddress: '', gender: '',
      branch: '', activeCategory: 'WAX',
      selectedServices: [], selectedProviders: [],
      date: '', timeSlot: '', specialRequest: '',
    });
    setErrors({});
    setSubmitted(false);
  }

  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';

  return (
    <>
      <style>{CSS}</style>

      {showSuccess && (
        <SuccessModal
          name={form.fullName}
          services={selectedSvcObjects}
          providers={selectedProvObjects}
          totalPrice={totalPrice}
          totalDuration={totalMins}
          date={form.date ? new Date(form.date + 'T00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : ''}
          time={form.timeSlot}
          branch={form.branch}
          refNumber={refNumber}
          onClose={() => { setShowSuccess(false); resetForm(); }}
        />
      )}

      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>

        {/* ── SIDEBAR (desktop + mobile bottom nav) ── */}
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
              <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4}}>
                <ISearch/>
              </span>
              <input className="srch" placeholder="Search....." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <div style={{flex:1}}/>
            <button
              style={{background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8,transition:'background 0.15s'}}
              onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            ><IBell/></button>
            <div className="hdr-name" style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <span style={{fontSize:14,fontWeight:500,color:'#1f2937'}}>MR. SAYO</span>
              <IChevD/>
            </div>
            <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0}}>
              S
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{flex:1,overflow:'auto',padding:'16px 18px 24px'}}>

            <div style={{marginBottom:18}}>
              <h1 className="page-title" style={{fontSize:26,fontWeight:700,color:'#1f2937',lineHeight:1.2}}>
                New Walk-in Booking
              </h1>
              <p className="page-sub" style={{fontSize:13,color:'#6b7280',marginTop:4}}>
                Quickly register a new walk-in client and assign services.
              </p>
            </div>

            <div className="two-col" style={{display:'flex',gap:16,alignItems:'flex-start'}}>

              {/* ── LEFT ── */}
              <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:14}}>

                {/* ① CLIENT DETAILS */}
                <SCard icon={<IPerson/>} title="Client Details">
                  <div style={{display:'flex',flexDirection:'column',gap:13}}>
                    <div className="two-inp" style={{display:'flex',gap:13}}>
                      <div style={{flex:1}}>
                        <label className="form-lbl">Full Name <span className="req">*</span></label>
                        <input
                          className={`form-inp ${submitted && errors.fullName ? 'error' : ''}`}
                          placeholder="Enter full name"
                          value={form.fullName}
                          onChange={e => { setField('fullName', e.target.value); clearErr('fullName'); }}
                        />
                        <ErrMsg msg={errors.fullName}/>
                      </div>
                      <div style={{flex:1}}>
                        <label className="form-lbl">Phone Number <span className="req">*</span></label>
                        <input
                          className={`form-inp ${submitted && errors.phoneNumber ? 'error' : ''}`}
                          placeholder="+94 77 000 0000"
                          value={form.phoneNumber}
                          onChange={e => { setField('phoneNumber', e.target.value); clearErr('phoneNumber'); }}
                        />
                        <ErrMsg msg={errors.phoneNumber}/>
                      </div>
                    </div>
                    <div className="two-inp" style={{display:'flex',gap:13}}>
                      <div style={{flex:1}}>
                        <label className="form-lbl">Email Address</label>
                        <input
                          className="form-inp"
                          placeholder="email@example.com"
                          value={form.emailAddress}
                          onChange={e => setField('emailAddress', e.target.value)}
                        />
                      </div>
                      <div style={{flex:1}}>
                        <label className="form-lbl">Gender</label>
                        <select className="form-sel" value={form.gender} onChange={e => setField('gender', e.target.value)}>
                          <option value="">Select Gender</option>
                          <option>Female</option>
                          <option>Male</option>
                          <option>Prefer not to say</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </SCard>

                {/* ② SELECT BRANCH */}
                <SCard icon={<IMapPin/>} title="Select Branch">
                  <div className="branch-row" style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    {[
                      { id:'COLOMBO',      label:'Colombo',      count:'6 specialists' },
                      { id:'NEGOMBO',      label:'Negombo',      count:'4 specialists' },
                      { id:'KIRIBATHGODA', label:'Kiribathgoda', count:'5 specialists' },
                    ].map(b => (
                      <button key={b.id}
                        className={`branch-btn ${form.branch===b.id?'selected':''} ${submitted&&errors.branch&&!form.branch?'error-border':''}`}
                        onClick={() => {
                          setField('branch', form.branch===b.id ? '' : b.id);
                          setField('selectedProviders', []);
                          clearErr('branch');
                        }}
                      >
                        <div>
                          <p style={{fontSize:13,fontWeight:700}}>{b.label}</p>
                          <p style={{fontSize:10,color:'#6b7280',marginTop:1}}>{b.count}</p>
                        </div>
                        <div className={`b-radio ${form.branch===b.id?'checked':''}`}/>
                      </button>
                    ))}
                  </div>
                  <ErrMsg msg={errors.branch}/>
                </SCard>

                {/* ③ SELECT SERVICES */}
                <SCard icon={<IScissors/>} title="Select Services">
                  {/* Category tabs */}
                  <div style={{marginBottom:16}}>
                    <label className="form-lbl" style={{marginBottom:10}}>Category</label>
                    <div className="cat-tabs-wrap" style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
                      {SERVICE_CATEGORIES.map(cat => {
                        const col        = CATEGORY_COLORS[cat];
                        const hasSelected = selectedSvcObjects.some(s => s.category === cat);
                        return (
                          <button key={cat}
                            className={`cat-tab ${form.activeCategory===cat?'active':''}`}
                            onClick={() => setField('activeCategory', cat)}
                          >
                            {hasSelected && (
                              <span className="cat-dot" style={{background: form.activeCategory===cat ? '#4ade80' : col.dot}}/>
                            )}
                            <span>{cat}</span>
                            <span className="cat-tab-sub">{CATEGORY_LABELS[cat]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chip bar */}
                  {selectedSvcObjects.length > 0 && (
                    <div className="sum-bar" style={{marginBottom:14}}>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',flex:1}}>
                        {selectedSvcObjects.map(s => {
                          const col = CATEGORY_COLORS[s.category as ServiceCategory];
                          return (
                            <span key={s.id} className="sum-chip">
                              <span style={{width:6,height:6,borderRadius:'50%',background:col.dot,display:'inline-block',flexShrink:0}}/>
                              {s.name}
                              <button className="sum-chip-x" onClick={() => removeService(s.id)} title="Remove">×</button>
                            </span>
                          );
                        })}
                      </div>
                      <div style={{flexShrink:0,textAlign:'right'}}>
                        <div style={{fontSize:15,fontWeight:700,color:'#fff'}}>LKR {totalPrice.toLocaleString()}</div>
                        <div style={{fontSize:10,color:'rgba(255,255,255,0.6)',marginTop:1}}>{fmtMins(totalMins)}</div>
                      </div>
                    </div>
                  )}

                  {/* Service grid */}
                  <div>
                    <label className="form-lbl" style={{marginBottom:10}}>
                      {form.activeCategory} — {CATEGORY_LABELS[form.activeCategory as ServiceCategory]} <span className="req">*</span>
                    </label>
                    {visibleServices.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon"><IInbox/></div>
                        <p style={{fontSize:14,fontWeight:600,color:'#4b5563'}}>No services available</p>
                      </div>
                    ) : (
                      <div className="svc-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(195px, 1fr))',gap:10}}>
                        {visibleServices.map(svc => {
                          const isSelected = form.selectedServices.includes(svc.id);
                          const col        = CATEGORY_COLORS[svc.category as ServiceCategory];
                          const hasErr     = submitted && errors.selectedServices && form.selectedServices.length === 0;
                          return (
                            <button key={svc.id}
                              className={`svc-card ${isSelected?'selected':''} ${hasErr?'error-highlight':''}`}
                              onClick={() => toggleService(svc.id)}
                              aria-pressed={isSelected}
                            >
                              <span style={{display:'inline-flex',alignItems:'center',background:col.bg,color:col.text,borderRadius:20,padding:'2px 8px',fontSize:10,fontWeight:700,letterSpacing:'0.04em',alignSelf:'flex-start',marginBottom:3}}>
                                {svc.category}
                              </span>
                              <div className={`svc-check ${isSelected?'checked':''}`}>
                                {isSelected && <ICheckSm/>}
                              </div>
                              <p style={{fontSize:13,fontWeight:600,color:'#1f2937',paddingRight:28,lineHeight:1.3}}>{svc.name}</p>
                              <p style={{fontSize:11,color:'#6b7280'}}>{svc.duration}</p>
                              <p style={{fontSize:14,fontWeight:700,color:'#1e3a40',marginTop:4}}>LKR {svc.price.toLocaleString()}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <ErrMsg msg={errors.selectedServices}/>
                  </div>
                </SCard>

                {/* ④ ASSIGN PROVIDERS */}
                {selectedCats.length > 0 && (
                  <SCard icon={<IProvIcon/>} title="Assign Service Providers">
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:14}}>
                      <div style={{flex:1}}>
                        <p style={{fontSize:13,color:'#4b5563',lineHeight:1.5}}>
                          {!form.branch
                            ? 'Please select a branch first to see available providers.'
                            : isMultiCat
                              ? `${selectedCats.length} categories selected — assign one provider per category.`
                              : 'Select a provider for the selected category.'}
                        </p>
                        {form.branch && selectedCats.length > 0 && (
                          <div style={{marginTop:8}}>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#6b7280',marginBottom:4}}>
                              <span>Provider slots filled</span>
                              <span style={{fontWeight:700,color:providerRequirementMet?'#22c55e':'#1e3a40'}}>
                                {assignedCount} / {selectedCats.length}
                              </span>
                            </div>
                            <div className="prov-progress">
                              <div className="prov-progress-fill" style={{width:`${selectedCats.length>0?(assignedCount/selectedCats.length)*100:0}%`}}/>
                            </div>
                          </div>
                        )}
                      </div>
                      {providerRequirementMet && selectedCats.length > 0 && (
                        <span style={{display:'flex',alignItems:'center',gap:4,background:'#dcfce7',color:'#15803d',borderRadius:20,padding:'4px 10px',fontSize:11,fontWeight:700,flexShrink:0}}>
                          <ICheckSm/> All Assigned
                        </span>
                      )}
                    </div>

                    {form.branch && selectedCats.map((cat, catIdx) => {
                      const col          = CATEGORY_COLORS[cat as ServiceCategory];
                      const catProvs     = filteredProviders.filter(p => p.expertise.includes(cat));
                      const assignedProv = catCoverage[cat];
                      return (
                        <div key={cat} className="cat-slot-row">
                          <div className="cat-slot-header">
                            <span style={{background:col.bg,color:col.text,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:700}}>
                              {cat}
                            </span>
                            <span style={{fontSize:11,color:'#6b7280',flex:1}}>{CATEGORY_LABELS[cat as ServiceCategory]}</span>
                            {assignedProv ? (
                              <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:'#16a34a'}}>
                                <ICheckSm/> {assignedProv.name}
                              </span>
                            ) : (
                              <span style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#9ca3af'}}>
                                <IInfo/> Not assigned
                              </span>
                            )}
                          </div>
                          <div className="cat-slot-body">
                            {catProvs.length === 0 ? (
                              <div style={{padding:'10px 4px',textAlign:'center'}}>
                                <p style={{fontSize:12,color:'rgba(0,0,0,0.4)',fontStyle:'italic'}}>
                                  No providers available for {cat} at {form.branch}.
                                </p>
                              </div>
                            ) : catProvs.map((prov, pIdx) => {
                              const isSelected      = form.selectedProviders.includes(prov.id);
                              const coveringCats    = prov.expertise.filter(e => selectedCats.includes(e));
                              const isUsedElsewhere = !isSelected && isMultiCat &&
                                form.selectedProviders.some(pid => {
                                  const sp = ALL_PROVIDERS.find(x => x.id === pid);
                                  return sp && sp.expertise.some(e => coveringCats.includes(e) && e !== cat);
                                });
                              return (
                                <button key={prov.id}
                                  className={`prov-card ${isSelected?'selected':''} ${isUsedElsewhere?'dimmed':''}`}
                                  onClick={() => !isUsedElsewhere && toggleProvider(prov)}
                                  style={{animationDelay:`${(catIdx*0.05)+(pIdx*0.04)}s`}}
                                  title={isUsedElsewhere ? 'Already assigned to another category' : undefined}
                                >
                                  <div className="prov-avatar">{prov.avatar}</div>
                                  <div style={{flex:1}}>
                                    <p style={{fontSize:14,fontWeight:700,color:isSelected?'#1e3a40':'#1f2937'}}>{prov.name}</p>
                                    <p style={{fontSize:11,color:'#6b7280',marginTop:1}}>{prov.role}</p>
                                    <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
                                      {prov.expertise.map(e => {
                                        const ec       = CATEGORY_COLORS[e as ServiceCategory];
                                        const isActive = selectedCats.includes(e);
                                        return (
                                          <span key={e} style={{background:isActive?ec.bg:'rgba(0,0,0,0.06)',color:isActive?ec.text:'#9ca3af',borderRadius:10,padding:'1px 7px',fontSize:10,fontWeight:700,border:isActive?`1px solid ${ec.dot}40`:'1px solid transparent'}}>
                                            {e}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,border:`2px solid ${isSelected?'#1e3a40':'rgba(30,58,64,0.3)'}`,background:isSelected?'#1e3a40':'#deeaea',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                                    {isSelected && <ICheckSm/>}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {!form.branch && (
                      <div className="empty-state">
                        <div className="empty-icon"><IProvIcon/></div>
                        <p style={{fontSize:14,fontWeight:600,color:'#4b5563'}}>Select a branch first</p>
                        <p style={{fontSize:12,color:'rgba(0,0,0,0.38)'}}>Providers are filtered by your chosen branch location.</p>
                      </div>
                    )}
                    <ErrMsg msg={errors.providers}/>
                  </SCard>
                )}

                {/* ⑤ DATE & TIME */}
                <SCard icon={<ICalIcon/>} title="Select Date & Time">
                  <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    <div>
                      <label className="form-lbl">Select Date <span className="req">*</span></label>
                      <input type="date"
                        className={`form-inp ${submitted&&errors.date?'error':''}`}
                        value={form.date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => {
                          setField('date', e.target.value);
                          setField('timeSlot', '');
                          clearErr('date');
                          clearErr('timeSlot');
                        }}
                        style={{cursor:'pointer'}}
                      />
                      <ErrMsg msg={errors.date}/>
                    </div>
                    <div>
                      <label className="form-lbl" style={{marginBottom:8}}>Select Time Slot <span className="req">*</span></label>
                      {availableSlots.length > 0 ? (
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(86px,1fr))',gap:8}}>
                          {availableSlots.map(slot => (
                            <button key={slot}
                              className={`ts-btn ${form.timeSlot===slot?'selected':''} ${submitted&&errors.timeSlot&&!form.timeSlot?'error-highlight':''}`}
                              onClick={() => { setField('timeSlot', form.timeSlot===slot?'':slot); clearErr('timeSlot'); }}
                            >{slot}</button>
                          ))}
                        </div>
                      ) : (
                        <div style={{background:'#d0e3e7',borderRadius:9,padding:'20px 16px',minHeight:80,display:'flex',alignItems:'center'}}>
                          <p style={{fontSize:13,color:'rgba(0,0,0,0.4)',fontStyle:'italic'}}>
                            Time slots will appear after selecting a date.
                          </p>
                        </div>
                      )}
                      <ErrMsg msg={errors.timeSlot}/>
                    </div>
                  </div>
                </SCard>

                {/* ⑥ SPECIAL REQUEST */}
                <SCard icon={<INote/>} title="Special Request">
                  <textarea className="form-ta"
                    placeholder="Any special requests or notes for this booking..."
                    value={form.specialRequest}
                    maxLength={MAX_SPECIAL_REQUEST}
                    rows={4}
                    onChange={e => setField('specialRequest', e.target.value)}
                  />
                  <p className="char-counter" style={{color:charColor}}>
                    {form.specialRequest.length} / {MAX_SPECIAL_REQUEST}
                  </p>
                </SCard>

                {/* Mobile summary + confirm */}
                <div className="mobile-sum" style={{display:'none'}}>
                  <BookingSummary
                    form={form}
                    selectedSvcs={selectedSvcObjects}
                    selectedProviders={selectedProvObjects}
                    totalPrice={totalPrice}
                    totalMins={totalMins}
                  />
                  <button className="confirm-btn" onClick={handleSubmit} disabled={isLoading}>
                    {isLoading ? <><div className="spinner"/> Processing...</> : 'Confirm Booking'}
                  </button>
                </div>
              </div>

              {/* ── RIGHT: Summary ── */}
              <div className="summary-col" style={{width:278,flexShrink:0,display:'flex',flexDirection:'column',gap:12}}>
                <BookingSummary
                  form={form}
                  selectedSvcs={selectedSvcObjects}
                  selectedProviders={selectedProvObjects}
                  totalPrice={totalPrice}
                  totalMins={totalMins}
                />
                <button className="confirm-btn" onClick={handleSubmit} disabled={isLoading}>
                  {isLoading ? <><div className="spinner"/> Processing...</> : 'Confirm Booking'}
                </button>
              </div>

            </div>
          </div>{/* end body */}
        </div>{/* end main */}
      </div>{/* end root */}
    </>
  );
}