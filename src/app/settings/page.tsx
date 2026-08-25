// app/admin/settings/page.tsx
'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

/* ─────────────────────────────────────────
   TYPES — mapped 1:1 to the 5 tables
───────────────────────────────────────── */
interface UserGroup {
  id: number;             // internal UI key only
  groupId: string;        // GroupId    char(10)
  groupDes: string;       // GroupDes   varchar(50)
}

interface Location {
  id: number;             // internal UI key only
  locCode: string;        // LocCode    char(10)
  locDes: string;         // LocDes     varchar(50)
  address: string;        // Address    varchar(300)
  enable: boolean;        // Enable     bit
}

interface BookingType {
  id: number;             // internal UI key only
  bookingTypeID: string;  // BooikingTypeID char(10)
  bookingTypeDes: string; // BookingTypeDes char(50)
  enabel: boolean;        // Enabel     bit
}

interface Speciality {
  id: number;             // internal UI key only
  specAreaID: string;     // SpecAreaID   char(10)
  specilities: string;    // Specilities  varchar(100)
}

interface UserDetail {
  id: number;             // internal UI key only
  userId: string;         // UserId       char(10)
  nic: string;            // NIC          char(20)
  logName: string;        // LogName      varchar(400)
  psw: string;            // PSW          varchar(400)
  groupId: string;        // GroupId      char(10)
  userName: string;       // UserName     varchar(200)
  address: string;        // Address      varchar(200)
  workingLocID: string;   // WorkingLocID varchar(200)
  contNo: string;         // ContNo       varchar(100)
  email: string;          // Email        varchar(100)
  dob: string;            // DOB          datetime
  doj: string;            // DOJ          datetime
  dol: string;            // DOL          datetime
  createUser: string;     // CreateUser   char(10)
  picture: string | null; // Picture      image (preview only)
  rmks: string;           // Rmks         varchar(250)
  enable: boolean;        // Enable       bit
  specAreaIDs: string[];  // (from Tbl_TechnicianSpecilityAssignment)
}

type Section = 'users' | 'groups' | 'locations' | 'bookingtypes' | 'specialities';

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard'        },
  { key: 'mail',      label: 'Messages',  path: '/admin/messages'   },
  { key: 'calendar',  label: 'Schedule',  path: '/appointment'      },
  { key: 'dollar',    label: 'Finance',   path: '/admin/finance'    },
  { key: 'users',     label: 'Team',      path: '/admin/team'       },
  { key: 'chart',     label: 'Reports',   path: '/admin/reports'    },
  { key: 'services',  label: 'Items',     path: '/services'   },
  { key: 'suppliers', label: 'Suppliers', path: '/suppliers'  },
  { key: 'units',     label: 'Units',     path: '/units'      },
  { key: 'recipes',   label: 'Recipes',   path: '/recipes'    },
  { key: 'settings',  label: 'Settings',  path: '/settings'   },
];

/* ─────────────────────────────────────────
   DEMO DATA
───────────────────────────────────────── */
function getDemoGroups(): UserGroup[] {
  return [
    { id: 1, groupId: 'GRP01', groupDes: 'Administrator' },
    { id: 2, groupId: 'GRP02', groupDes: 'Cashier' },
    { id: 3, groupId: 'GRP03', groupDes: 'Technician' },
    { id: 4, groupId: 'GRP04', groupDes: 'Manager' },
    { id: 5, groupId: 'GRP05', groupDes: 'Receptionist' },
  ];
}

function getDemoLocations(): Location[] {
  return [
    { id: 1, locCode: '01', locDes: 'Main Salon - Colombo', address: 'No. 10, Galle Road, Colombo 03', enable: true },
    { id: 2, locCode: '02', locDes: 'Branch - Kandy',        address: 'No. 55, Peradeniya Road, Kandy', enable: true },
    { id: 3, locCode: '03', locDes: 'Branch - Galle',        address: 'No. 22, Matara Road, Galle',     enable: false },
  ];
}

function getDemoBookingTypes(): BookingType[] {
  return [
    { id: 1, bookingTypeID: 'BKT01', bookingTypeDes: 'Walk-In', enabel: true },
    { id: 2, bookingTypeID: 'BKT02', bookingTypeDes: 'Phone Booking', enabel: true },
    { id: 3, bookingTypeID: 'BKT03', bookingTypeDes: 'Online Booking', enabel: true },
    { id: 4, bookingTypeID: 'BKT04', bookingTypeDes: 'VIP / Referral', enabel: false },
  ];
}

function getDemoSpecialities(): Speciality[] {
  return [
    { id: 1, specAreaID: 'SPC01', specilities: 'Hair Cutting & Styling' },
    { id: 2, specAreaID: 'SPC02', specilities: 'Hair Coloring' },
    { id: 3, specAreaID: 'SPC03', specilities: 'Facial & Skin Treatments' },
    { id: 4, specAreaID: 'SPC04', specilities: 'Nail Art & Manicure' },
    { id: 5, specAreaID: 'SPC05', specilities: 'Body Massage' },
    { id: 6, specAreaID: 'SPC06', specilities: 'Bridal Makeup' },
  ];
}

function getDemoUsers(): UserDetail[] {
  return [
    {
      id: 1, userId: 'USR001', nic: '901234567V', logName: 'nadeesha.p', psw: '••••••••',
      groupId: 'GRP03', userName: 'Nadeesha Perera', address: 'No. 5, Lake Road, Colombo 06',
      workingLocID: '01', contNo: '071-2345678', email: 'nadeesha@sayosalon.lk',
      dob: '1995-04-12', doj: '2022-01-10', dol: '',
      createUser: 'ADMIN', picture: null, rmks: 'Senior hair stylist',
      enable: true, specAreaIDs: ['SPC01', 'SPC02'],
    },
    {
      id: 2, userId: 'USR002', nic: '925678901V', logName: 'piumi.k', psw: '••••••••',
      groupId: 'GRP03', userName: 'Piumi Kumari', address: 'No. 18, Flower Road, Colombo 07',
      workingLocID: '01', contNo: '077-9988776', email: 'piumi@sayosalon.lk',
      dob: '1997-08-25', doj: '2022-06-15', dol: '',
      createUser: 'ADMIN', picture: null, rmks: '',
      enable: true, specAreaIDs: ['SPC03', 'SPC06'],
    },
    {
      id: 3, userId: 'USR003', nic: '881122334V', logName: 'admin', psw: '••••••••',
      groupId: 'GRP01', userName: 'Sayo Admin', address: 'Head Office, Colombo 03',
      workingLocID: '01', contNo: '011-2223344', email: 'admin@sayosalon.lk',
      dob: '1988-01-01', doj: '2020-01-01', dol: '',
      createUser: 'SYSTEM', picture: null, rmks: 'System administrator account',
      enable: true, specAreaIDs: [],
    },
    {
      id: 4, userId: 'USR004', nic: '936655443V', logName: 'kaveesha.r', psw: '••••••••',
      groupId: 'GRP03', userName: 'Kaveesha Rathnayake', address: 'No. 8, Temple Road, Kandy',
      workingLocID: '02', contNo: '076-5544332', email: 'kaveesha@sayosalon.lk',
      dob: '1993-11-03', doj: '2023-02-20', dol: '',
      createUser: 'ADMIN', picture: null, rmks: '',
      enable: true, specAreaIDs: ['SPC04', 'SPC05'],
    },
    {
      id: 5, userId: 'USR005', nic: '900011223V', logName: 'rohan.f', psw: '••••••••',
      groupId: 'GRP02', userName: 'Rohan Fernando', address: 'No. 3, Beach Road, Galle',
      workingLocID: '03', contNo: '070-1122334', email: 'rohan@sayosalon.lk',
      dob: '1991-06-18', doj: '2021-09-05', dol: '2024-03-01',
      createUser: 'ADMIN', picture: null, rmks: 'Left the company',
      enable: false, specAreaIDs: [],
    },
  ];
}

function emptyGroup(nextId: number): UserGroup {
  return { id: nextId, groupId: `GRP${String(nextId).padStart(2,'0')}`, groupDes: '' };
}
function emptyLocation(nextId: number): Location {
  return { id: nextId, locCode: String(nextId).padStart(2,'0'), locDes: '', address: '', enable: true };
}
function emptyBookingType(nextId: number): BookingType {
  return { id: nextId, bookingTypeID: `BKT${String(nextId).padStart(2,'0')}`, bookingTypeDes: '', enabel: true };
}
function emptySpeciality(nextId: number): Speciality {
  return { id: nextId, specAreaID: `SPC${String(nextId).padStart(2,'0')}`, specilities: '' };
}
function emptyUser(nextId: number, defGroup: string, defLoc: string): UserDetail {
  const today = new Date().toISOString().slice(0,10);
  return {
    id: nextId, userId: `USR${String(nextId).padStart(3,'0')}`, nic: '', logName: '', psw: '',
    groupId: defGroup, userName: '', address: '', workingLocID: defLoc, contNo: '', email: '',
    dob: '', doj: today, dol: '', createUser: 'ADMIN', picture: null, rmks: '',
    enable: true, specAreaIDs: [],
  };
}

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp  { from{opacity:0;transform:translateY(6px);}  to{opacity:1;transform:none;} }
  .fade-up  { animation:fadeUp  0.2s ease both; }

  ::-webkit-scrollbar       { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  /* ── Sidebar ── */
  .sb-icon-btn {
    width:44px; height:44px; border-radius:10px;
    display:flex; align-items:center; justify-content:center;
    border:none; background:transparent; color:rgba(255,255,255,0.45);
    cursor:pointer; transition:background 0.18s,color 0.18s; flex-shrink:0;
  }
  .sb-icon-btn:hover  { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.85); }
  .sb-icon-btn.active { background:rgba(255,255,255,0.13); color:#fff; }
  .sb-row-btn {
    width:100%; height:44px; border-radius:10px;
    display:flex; align-items:center; gap:12px; padding:0 12px;
    border:none; background:transparent; color:rgba(255,255,255,0.45);
    cursor:pointer; font-family:'Inter',sans-serif; font-size:13px; font-weight:500;
    transition:background 0.18s,color 0.18s; white-space:nowrap; text-align:left;
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
    cursor:pointer; z-index:50; transition:background 0.18s,width 0.15s;
  }
  .sb-grip:hover { background:linear-gradient(180deg,#2e4a52 0%,#223840 100%); width:16px; }
  .sb-grip-line { width:5px; height:1.5px; border-radius:99px; background:rgba(255,255,255,0.5); }

  /* ── Form Inputs ── */
  .frm-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-input:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:read-only { background:#f3f6f6; color:#6b7280; cursor:default; }

  .frm-select {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 28px 0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;
    appearance:none; -webkit-appearance:none; outline:none; cursor:pointer;
    transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-select:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

  .frm-textarea {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:9px 11px; min-height:64px; resize:vertical;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-textarea:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

  /* ── Section Box ── */
  .sect-box {
    background:#fff; border:1.5px solid #d8e4e6; border-radius:12px;
    overflow:hidden;
  }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:9px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:14px; display:flex; flex-direction:column; gap:10px; }

  /* ── Label ── */
  .frm-label { font-size:11px; font-weight:700; color:#4b5563; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; display:block; }

  /* ── Checkbox ── */
  .chk-row {
    display:flex; align-items:center; gap:8px; cursor:pointer;
    padding:7px 10px; border-radius:8px; transition:background 0.12s;
    user-select:none;
  }
  .chk-row:hover { background:rgba(30,58,64,0.05); }
  .chk-box {
    width:17px; height:17px; border-radius:4px; border:2px solid #9ca3af;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:all 0.15s; background:#fff;
  }
  .chk-box.checked { background:#1e3a40; border-color:#1e3a40; }
  .chk-label { font-size:13px; font-weight:500; color:#374151; }

  /* ── Chip (specialities) ── */
  .spec-chip {
    display:inline-flex; align-items:center; gap:5px;
    padding:5px 10px; border-radius:99px; border:1.5px solid #d1d9da;
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s;
    background:#fff; color:#6b7280; white-space:nowrap;
  }
  .spec-chip:hover  { border-color:#1e3a40; color:#1e3a40; background:rgba(30,58,64,0.04); }
  .spec-chip.sel    { background:#1e3a40; border-color:#1e3a40; color:#fff; }

  /* ── Action Buttons ── */
  .btn-save {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 24px; height:40px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25);
  }
  .btn-save:hover { background:#162e34; transform:translateY(-1px); box-shadow:0 4px 14px rgba(30,58,64,0.35); }

  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }
  .btn-new:disabled { background:#9ca3af; box-shadow:none; cursor:not-allowed; transform:none; }

  .btn-del {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-del:hover { background:#fee2e2; border-color:#f87171; transform:translateY(-1px); }

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

  /* ── Segmented top switch ── */
  .seg-wrap {
    display:flex; gap:4px; background:#d6e2e2; padding:4px; border-radius:10px;
    overflow-x:auto;
  }
  .seg-btn {
    flex:1; display:flex; align-items:center; justify-content:center; gap:6px;
    padding:8px 12px; border-radius:8px; border:none; background:transparent;
    font-family:'Inter',sans-serif; font-size:12.5px; font-weight:700; color:#4b5563;
    cursor:pointer; transition:all 0.18s; white-space:nowrap;
  }
  .seg-btn.active { background:#1e3a40; color:#fff; box-shadow:0 2px 6px rgba(30,58,64,0.25); }
  .seg-btn:hover:not(.active) { background:rgba(255,255,255,0.5); color:#1e3a40; }

  /* ── List Item ── */
  .srv-list-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s; border:none;
    background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }

  /* ── Badge ── */
  .badge-active   { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }
  .badge-tag      { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:rgba(30,58,64,0.08);color:#1e3a40; }

  /* ── Tabs ── */
  .tab-btn {
    padding:8px 16px; border:none; background:transparent; cursor:pointer;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#6b7280;
    border-bottom:2.5px solid transparent; transition:all 0.15s; white-space:nowrap;
  }
  .tab-btn.active { color:#1e3a40; border-bottom-color:#1e3a40; }
  .tab-btn:hover:not(.active) { color:#374151; }
  .tab-btn-inner { display:inline-flex; align-items:center; gap:6px; }

  /* ── Mobile ── */
  .mob-nav {
    display:none; position:fixed; bottom:0; left:0; right:0; z-index:100;
    background:linear-gradient(180deg,#1a2e35 0%,#111e24 100%);
    height:64px; align-items:center; justify-content:space-around;
    padding:0 6px; border-top:1px solid rgba(255,255,255,0.07);
    overflow-x:auto;
  }
  .mob-btn {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:3px; padding:6px 8px; border:none; background:transparent;
    color:rgba(255,255,255,0.4); cursor:pointer; border-radius:8px; transition:all 0.18s;
    flex-shrink:0;
  }
  .mob-btn.active { color:#fff; background:rgba(255,255,255,0.1); }
  .mob-lbl { font-size:9px; font-weight:600; font-family:'Inter',sans-serif; }

  @media(max-width:767px) {
    .sb-desktop { display:none !important; }
    .mob-nav    { display:flex !important; }
    .main-body  { padding-bottom:72px !important; }
    .left-panel { display:none !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IGrid({s=20}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>; }
function IMail({s=20}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>; }
function ICal({s=20}:{s?:number})      { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IDollar({s=20}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function IUsers({s=20}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IChart({s=20}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>; }
function ILogout({s=20}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IBox({s=20}:{s?:number})      { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function ITruck({s=20}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>; }
function IRuler({s=20}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="M14.5 7.5l2 2"/><path d="M11.5 10.5l2 2"/><path d="M8.5 13.5l2 2"/><path d="M17.5 4.5l2 2"/></svg>; }
function IBook({s=20}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }
function IGear({s=20}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IBell({s=21}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function ISearch({s=15}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IChevD({s=13}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function IPlus({s=16}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function ITrash({s=15}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IPrint({s=15}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function ISave({s=15}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>; }
function IRefresh({s=15}:{s?:number})  { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>; }
function ICheck({s=11}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function ITag({s=13}:{s?:number})      { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }
function IIdCard({s=13}:{s?:number})   { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="11" r="2"/><line x1="14" y1="9" x2="19" y2="9"/><line x1="14" y1="13" x2="19" y2="13"/><line x1="5" y1="17" x2="11" y2="17"/></svg>; }
function IPhone({s=13}:{s?:number})    { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>; }
function IStar({s=13}:{s?:number})     { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function IKey({s=13}:{s?:number})      { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>; }
function IClipboard({s=13}:{s?:number}){ return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>; }
function IPin({s=13}:{s?:number})      { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }

function navIcon(key: string) {
  if (key==='dashboard') return <IGrid/>;
  if (key==='mail')      return <IMail/>;
  if (key==='calendar')  return <ICal/>;
  if (key==='dollar')    return <IDollar/>;
  if (key==='users')     return <IUsers/>;
  if (key==='chart')     return <IChart/>;
  if (key==='services')  return <IBox/>;
  if (key==='suppliers') return <ITruck/>;
  if (key==='units')     return <IRuler/>;
  if (key==='recipes')   return <IBook/>;
  if (key==='settings')  return <IGear/>;
  return <IGrid/>;
}

/* ─────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────── */
function Sidebar({ active, setActive, onLogout }: { active:string; setActive:(k:string)=>void; onLogout:()=>void; }) {
  const [open, setOpen] = useState(false);
  const W = open ? 196 : 64;
  return (
    <aside className="sb-desktop" style={{width:W,minWidth:W,height:'100vh',background:'linear-gradient(180deg,#1c2f37 0%,#111e25 100%)',display:'flex',flexDirection:'column',alignItems:open?'stretch':'center',paddingBottom:16,flexShrink:0,position:'relative',overflow:'visible',zIndex:20,transition:'width 0.24s cubic-bezier(.4,0,.2,1),min-width 0.24s cubic-bezier(.4,0,.2,1)'}}>
      <div style={{display:'flex',justifyContent:open?'flex-start':'center',padding:open?'12px 14px 6px':'12px 0 6px',flexShrink:0}}>
        <Image src="/sayologo.png" alt="Sayo" width={44} height={44} style={{objectFit:'contain'}}/>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',gap:2,padding:open?'6px 10px':'6px 0',alignItems:open?'stretch':'center',overflowX:'hidden',overflowY:'auto'}}>
        {NAV_ITEMS.map(n => open ? (
          <button key={n.key} className={`sb-row-btn ${active===n.key?'active':''}`} onClick={()=>setActive(n.key)}>
            <span style={{flexShrink:0,display:'flex',alignItems:'center',width:20,justifyContent:'center'}}>{navIcon(n.key)}</span>
            <span>{n.label}</span>
          </button>
        ) : (
          <button key={n.key} className={`sb-icon-btn ${active===n.key?'active':''}`} onClick={()=>setActive(n.key)} title={n.label}>{navIcon(n.key)}</button>
        ))}
      </div>
      <div style={{padding:open?'0 10px':'0',display:'flex',flexDirection:'column',alignItems:open?'stretch':'center'}}>
        {open
          ? <button className="sb-row-btn" onClick={onLogout} style={{color:'#f87171'}}><span style={{flexShrink:0,display:'flex',alignItems:'center',width:20,justifyContent:'center'}}><ILogout/></span><span>Logout</span></button>
          : <button className="sb-icon-btn" onClick={onLogout} style={{color:'#f87171'}} title="Logout"><ILogout/></button>
        }
      </div>
      <div className="sb-grip" onClick={()=>setOpen(o=>!o)}>
        <div className="sb-grip-line"/><div className="sb-grip-line"/><div className="sb-grip-line"/>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────
   CHECKBOX
───────────────────────────────────────── */
function Checkbox({ checked, onChange, label }: { checked:boolean; onChange:(v:boolean)=>void; label:string; }) {
  return (
    <div className="chk-row" onClick={()=>onChange(!checked)} role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onChange(!checked); } }}>
      <div className={`chk-box ${checked?'checked':''}`}>
        {checked && <ICheck s={10}/>}
      </div>
      <span className="chk-label">{label}</span>
    </div>
  );
}

/* ─────────────────────────────────────────
   FIELD ROW / SECTION BOX
───────────────────────────────────────── */
function FieldRow({ label, htmlFor, children }: { label:string; htmlFor?:string; children:React.ReactNode; }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      <label className="frm-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
function SectBox({ title, icon, children }: { title:string; icon?:React.ReactNode; children:React.ReactNode; }) {
  return (
    <div className="sect-box">
      <div className="sect-hdr">
        {icon && <span style={{color:'rgba(255,255,255,0.7)'}}>{icon}</span>}
        <span className="sect-hdr-title">{title}</span>
      </div>
      <div className="sect-body">{children}</div>
    </div>
  );
}

/* generic list-item card used by the 4 simple master lists */
function SimpleListItem({ active, title, sub, badge, icon, onClick }:{ active:boolean; title:string; sub:string; badge?:React.ReactNode; icon:React.ReactNode; onClick:()=>void; }) {
  return (
    <button className={`srv-list-item ${active?'active':''}`} onClick={onClick}>
      <div style={{width:36,height:36,borderRadius:9,background:'linear-gradient(135deg,#1e3a40,#2a5260)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff'}}>
        {icon}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:13,fontWeight:700,color:'#1e3a40',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{title || '(no name)'}</p>
        <p style={{fontSize:11,color:'#6b7280',marginTop:1}}>{sub}</p>
        {badge && <div style={{marginTop:3}}>{badge}</div>}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE — System Settings
───────────────────────────────────────── */
export default function SettingsPage() {
  const router  = useRouter();
  const [navKey, setNavKey] = useState('settings');
  const [section, setSection] = useState<Section>('users');
  const [search, setSearch] = useState('');
  const [userTab, setUserTab] = useState<'identification'|'contact'|'specialities'|'security'>('identification');

  /* ── USERS ── */
  const [users, setUsers] = useState<UserDetail[]>(getDemoUsers);
  const [curUser, setCurUser] = useState<UserDetail>(() => getDemoUsers()[0]);
  const [isNewUser, setIsNewUser] = useState(false);
  const nextUserIdRef = useRef<number>((()=>{const a=getDemoUsers();return a.length?Math.max(...a.map(u=>u.id))+1:1;})());
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── GROUPS ── */
  const [groups, setGroups] = useState<UserGroup[]>(getDemoGroups);
  const [curGroup, setCurGroup] = useState<UserGroup>(() => getDemoGroups()[0]);
  const [isNewGroup, setIsNewGroup] = useState(false);
  const nextGroupIdRef = useRef<number>((()=>{const a=getDemoGroups();return a.length?Math.max(...a.map(g=>g.id))+1:1;})());

  /* ── LOCATIONS ── */
  const [locations, setLocations] = useState<Location[]>(getDemoLocations);
  const [curLoc, setCurLoc] = useState<Location>(() => getDemoLocations()[0]);
  const [isNewLoc, setIsNewLoc] = useState(false);
  const nextLocIdRef = useRef<number>((()=>{const a=getDemoLocations();return a.length?Math.max(...a.map(l=>l.id))+1:1;})());

  /* ── BOOKING TYPES ── */
  const [bookingTypes, setBookingTypes] = useState<BookingType[]>(getDemoBookingTypes);
  const [curBT, setCurBT] = useState<BookingType>(() => getDemoBookingTypes()[0]);
  const [isNewBT, setIsNewBT] = useState(false);
  const nextBTIdRef = useRef<number>((()=>{const a=getDemoBookingTypes();return a.length?Math.max(...a.map(b=>b.id))+1:1;})());

  /* ── SPECIALITIES ── */
  const [specialities, setSpecialities] = useState<Speciality[]>(getDemoSpecialities);
  const [curSpec, setCurSpec] = useState<Speciality>(() => getDemoSpecialities()[0]);
  const [isNewSpec, setIsNewSpec] = useState(false);
  const nextSpecIdRef = useRef<number>((()=>{const a=getDemoSpecialities();return a.length?Math.max(...a.map(s=>s.id))+1:1;})());

  /* ── helpers ── */
  const groupDes = (id: string) => groups.find(g=>g.groupId===id)?.groupDes ?? id;
  const locDes   = (code: string) => locations.find(l=>l.locCode===code)?.locDes ?? code;
  const specDes  = (id: string) => specialities.find(s=>s.specAreaID===id)?.specilities ?? id;

  /* ── filtered lists ── */
  const filteredUsers = useMemo(()=>users.filter(u=>
    u.userName.toLowerCase().includes(search.toLowerCase()) ||
    u.userId.toLowerCase().includes(search.toLowerCase()) ||
    u.logName.toLowerCase().includes(search.toLowerCase())
  ),[users, search]);

  const filteredGroups = useMemo(()=>groups.filter(g=>
    g.groupDes.toLowerCase().includes(search.toLowerCase()) || g.groupId.toLowerCase().includes(search.toLowerCase())
  ),[groups, search]);

  const filteredLocs = useMemo(()=>locations.filter(l=>
    l.locDes.toLowerCase().includes(search.toLowerCase()) || l.locCode.toLowerCase().includes(search.toLowerCase())
  ),[locations, search]);

  const filteredBTs = useMemo(()=>bookingTypes.filter(b=>
    b.bookingTypeDes.toLowerCase().includes(search.toLowerCase()) || b.bookingTypeID.toLowerCase().includes(search.toLowerCase())
  ),[bookingTypes, search]);

  const filteredSpecs = useMemo(()=>specialities.filter(s=>
    s.specilities.toLowerCase().includes(search.toLowerCase()) || s.specAreaID.toLowerCase().includes(search.toLowerCase())
  ),[specialities, search]);

  /* ── dirty checks ── */
  const isDirtyUser = useMemo(()=>{
    if (isNewUser) { const b=emptyUser(curUser.id, curUser.groupId, curUser.workingLocID); return JSON.stringify({...curUser,id:0,userId:''})!==JSON.stringify({...b,id:0,userId:''}); }
    const orig = users.find(u=>u.id===curUser.id); return orig? JSON.stringify(curUser)!==JSON.stringify(orig):false;
  },[curUser, users, isNewUser]);

  const isDirtyGroup = useMemo(()=>{
    if (isNewGroup) { const b=emptyGroup(curGroup.id); return JSON.stringify({...curGroup,id:0,groupId:''})!==JSON.stringify({...b,id:0,groupId:''}); }
    const orig = groups.find(g=>g.id===curGroup.id); return orig? JSON.stringify(curGroup)!==JSON.stringify(orig):false;
  },[curGroup, groups, isNewGroup]);

  const isDirtyLoc = useMemo(()=>{
    if (isNewLoc) { const b=emptyLocation(curLoc.id); return JSON.stringify({...curLoc,id:0,locCode:''})!==JSON.stringify({...b,id:0,locCode:''}); }
    const orig = locations.find(l=>l.id===curLoc.id); return orig? JSON.stringify(curLoc)!==JSON.stringify(orig):false;
  },[curLoc, locations, isNewLoc]);

  const isDirtyBT = useMemo(()=>{
    if (isNewBT) { const b=emptyBookingType(curBT.id); return JSON.stringify({...curBT,id:0,bookingTypeID:''})!==JSON.stringify({...b,id:0,bookingTypeID:''}); }
    const orig = bookingTypes.find(b=>b.id===curBT.id); return orig? JSON.stringify(curBT)!==JSON.stringify(orig):false;
  },[curBT, bookingTypes, isNewBT]);

  const isDirtySpec = useMemo(()=>{
    if (isNewSpec) { const b=emptySpeciality(curSpec.id); return JSON.stringify({...curSpec,id:0,specAreaID:''})!==JSON.stringify({...b,id:0,specAreaID:''}); }
    const orig = specialities.find(s=>s.id===curSpec.id); return orig? JSON.stringify(curSpec)!==JSON.stringify(orig):false;
  },[curSpec, specialities, isNewSpec]);

  const isDirtyActive =
    section==='users' ? isDirtyUser :
    section==='groups' ? isDirtyGroup :
    section==='locations' ? isDirtyLoc :
    section==='bookingtypes' ? isDirtyBT : isDirtySpec;

  function confirmDiscard(msg: string, dirty: boolean) { return !dirty || confirm(msg); }

  function switchSection(next: Section) {
    if (next===section) return;
    if (!confirmDiscard('You have unsaved changes. Discard them and switch section?', isDirtyActive)) return;
    setSection(next); setSearch(''); setUserTab('identification');
  }

  /* ═══════ USER CRUD ═══════ */
  function handleNewUser() {
    if (!confirmDiscard('Discard unsaved changes and create a new user?', isDirtyUser)) return;
    const id = nextUserIdRef.current++;
    setCurUser(emptyUser(id, groups[0]?.groupId ?? '', locations[0]?.locCode ?? ''));
    setIsNewUser(true); setUserTab('identification');
  }
  function handleSelectUser(u: UserDetail) {
    if (curUser.id===u.id && !isNewUser) return;
    if (!confirmDiscard('Discard unsaved changes and switch user?', isDirtyUser)) return;
    setCurUser({...u}); setIsNewUser(false); setUserTab('identification');
  }
  function handleSaveUser() {
    if (!curUser.userName.trim()) { alert('User name (UserName) is required'); return; }
    if (!curUser.logName.trim())  { alert('Login name (LogName) is required'); return; }
    if (isNewUser) { setUsers(p=>[...p, curUser]); setIsNewUser(false); }
    else setUsers(p=>p.map(u=>u.id===curUser.id?curUser:u));
    alert('User saved ✓');
  }
  function handleDeleteUser() {
    if (!confirm(`Delete user "${curUser.userName}" (${curUser.userId})?`)) return;
    const remaining = users.filter(u=>u.id!==curUser.id);
    setUsers(remaining);
    if (remaining.length>0) { setCurUser({...remaining[0]}); setIsNewUser(false); }
    else { const id=nextUserIdRef.current++; setCurUser(emptyUser(id, groups[0]?.groupId??'', locations[0]?.locCode??'')); setIsNewUser(true); }
  }
  function handleClearUser() {
    if (isNewUser) setCurUser(emptyUser(curUser.id, curUser.groupId, curUser.workingLocID));
    else { const orig = users.find(u=>u.id===curUser.id); if (orig) setCurUser({...orig}); }
  }
  function toggleSpec(specID: string) {
    setCurUser(p=>({...p, specAreaIDs: p.specAreaIDs.includes(specID) ? p.specAreaIDs.filter(x=>x!==specID) : [...p.specAreaIDs, specID]}));
  }
  function handlePicChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCurUser(p=>({...p, picture: reader.result as string}));
    reader.readAsDataURL(file);
  }

  /* ═══════ GROUP CRUD ═══════ */
  function handleNewGroup() {
    if (!confirmDiscard('Discard unsaved changes and create a new group?', isDirtyGroup)) return;
    const id = nextGroupIdRef.current++; setCurGroup(emptyGroup(id)); setIsNewGroup(true);
  }
  function handleSelectGroup(g: UserGroup) {
    if (curGroup.id===g.id && !isNewGroup) return;
    if (!confirmDiscard('Discard unsaved changes and switch group?', isDirtyGroup)) return;
    setCurGroup({...g}); setIsNewGroup(false);
  }
  function handleSaveGroup() {
    if (!curGroup.groupDes.trim()) { alert('Group description (GroupDes) is required'); return; }
    if (isNewGroup) { setGroups(p=>[...p, curGroup]); setIsNewGroup(false); }
    else setGroups(p=>p.map(g=>g.id===curGroup.id?curGroup:g));
    alert('User group saved ✓');
  }
  function handleDeleteGroup() {
    if (users.some(u=>u.groupId===curGroup.groupId)) { alert('Cannot delete: this group is assigned to one or more users.'); return; }
    if (!confirm(`Delete group "${curGroup.groupDes}"?`)) return;
    const remaining = groups.filter(g=>g.id!==curGroup.id);
    setGroups(remaining);
    if (remaining.length>0) { setCurGroup({...remaining[0]}); setIsNewGroup(false); }
    else { const id=nextGroupIdRef.current++; setCurGroup(emptyGroup(id)); setIsNewGroup(true); }
  }
  function handleClearGroup() {
    if (isNewGroup) setCurGroup(emptyGroup(curGroup.id));
    else { const orig = groups.find(g=>g.id===curGroup.id); if (orig) setCurGroup({...orig}); }
  }

  /* ═══════ LOCATION CRUD ═══════ */
  function handleNewLoc() {
    if (!confirmDiscard('Discard unsaved changes and create a new location?', isDirtyLoc)) return;
    const id = nextLocIdRef.current++; setCurLoc(emptyLocation(id)); setIsNewLoc(true);
  }
  function handleSelectLoc(l: Location) {
    if (curLoc.id===l.id && !isNewLoc) return;
    if (!confirmDiscard('Discard unsaved changes and switch location?', isDirtyLoc)) return;
    setCurLoc({...l}); setIsNewLoc(false);
  }
  function handleSaveLoc() {
    if (!curLoc.locDes.trim()) { alert('Location description (LocDes) is required'); return; }
    if (isNewLoc) { setLocations(p=>[...p, curLoc]); setIsNewLoc(false); }
    else setLocations(p=>p.map(l=>l.id===curLoc.id?curLoc:l));
    alert('Location saved ✓');
  }
  function handleDeleteLoc() {
    if (users.some(u=>u.workingLocID===curLoc.locCode)) { alert('Cannot delete: this location is assigned to one or more users.'); return; }
    if (!confirm(`Delete location "${curLoc.locDes}"?`)) return;
    const remaining = locations.filter(l=>l.id!==curLoc.id);
    setLocations(remaining);
    if (remaining.length>0) { setCurLoc({...remaining[0]}); setIsNewLoc(false); }
    else { const id=nextLocIdRef.current++; setCurLoc(emptyLocation(id)); setIsNewLoc(true); }
  }
  function handleClearLoc() {
    if (isNewLoc) setCurLoc(emptyLocation(curLoc.id));
    else { const orig = locations.find(l=>l.id===curLoc.id); if (orig) setCurLoc({...orig}); }
  }

  /* ═══════ BOOKING TYPE CRUD ═══════ */
  function handleNewBT() {
    if (!confirmDiscard('Discard unsaved changes and create a new booking type?', isDirtyBT)) return;
    const id = nextBTIdRef.current++; setCurBT(emptyBookingType(id)); setIsNewBT(true);
  }
  function handleSelectBT(b: BookingType) {
    if (curBT.id===b.id && !isNewBT) return;
    if (!confirmDiscard('Discard unsaved changes and switch booking type?', isDirtyBT)) return;
    setCurBT({...b}); setIsNewBT(false);
  }
  function handleSaveBT() {
    if (!curBT.bookingTypeDes.trim()) { alert('Booking type description is required'); return; }
    if (isNewBT) { setBookingTypes(p=>[...p, curBT]); setIsNewBT(false); }
    else setBookingTypes(p=>p.map(b=>b.id===curBT.id?curBT:b));
    alert('Booking type saved ✓');
  }
  function handleDeleteBT() {
    if (!confirm(`Delete booking type "${curBT.bookingTypeDes}"?`)) return;
    const remaining = bookingTypes.filter(b=>b.id!==curBT.id);
    setBookingTypes(remaining);
    if (remaining.length>0) { setCurBT({...remaining[0]}); setIsNewBT(false); }
    else { const id=nextBTIdRef.current++; setCurBT(emptyBookingType(id)); setIsNewBT(true); }
  }
  function handleClearBT() {
    if (isNewBT) setCurBT(emptyBookingType(curBT.id));
    else { const orig = bookingTypes.find(b=>b.id===curBT.id); if (orig) setCurBT({...orig}); }
  }

  /* ═══════ SPECIALITY CRUD ═══════ */
  function handleNewSpec() {
    if (!confirmDiscard('Discard unsaved changes and create a new speciality?', isDirtySpec)) return;
    const id = nextSpecIdRef.current++; setCurSpec(emptySpeciality(id)); setIsNewSpec(true);
  }
  function handleSelectSpec(s: Speciality) {
    if (curSpec.id===s.id && !isNewSpec) return;
    if (!confirmDiscard('Discard unsaved changes and switch speciality?', isDirtySpec)) return;
    setCurSpec({...s}); setIsNewSpec(false);
  }
  function handleSaveSpec() {
    if (!curSpec.specilities.trim()) { alert('Speciality name is required'); return; }
    if (isNewSpec) { setSpecialities(p=>[...p, curSpec]); setIsNewSpec(false); }
    else setSpecialities(p=>p.map(s=>s.id===curSpec.id?curSpec:s));
    alert('Speciality saved ✓');
  }
  function handleDeleteSpec() {
    if (users.some(u=>u.specAreaIDs.includes(curSpec.specAreaID))) { alert('Cannot delete: this speciality is assigned to one or more technicians.'); return; }
    if (!confirm(`Delete speciality "${curSpec.specilities}"?`)) return;
    const remaining = specialities.filter(s=>s.id!==curSpec.id);
    setSpecialities(remaining);
    if (remaining.length>0) { setCurSpec({...remaining[0]}); setIsNewSpec(false); }
    else { const id=nextSpecIdRef.current++; setCurSpec(emptySpeciality(id)); setIsNewSpec(true); }
  }
  function handleClearSpec() {
    if (isNewSpec) setCurSpec(emptySpeciality(curSpec.id));
    else { const orig = specialities.find(s=>s.id===curSpec.id); if (orig) setCurSpec({...orig}); }
  }

  /* ── navigation guard ── */
  function handleNavigate(path: string, key: string) {
    if (!confirmDiscard('You have unsaved changes. Leave this page without saving?', isDirtyActive)) return;
    setNavKey(key); router.push(path);
  }
  function handleLogout() {
    if (!confirmDiscard('You have unsaved changes. Leave without saving?', isDirtyActive)) return;
    router.push('/admin/login');
  }

  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';

  return (
    <>
      <style jsx global>{CSS}</style>

      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:PAGE}}>

        <Sidebar active={navKey} setActive={k=>{const n=NAV_ITEMS.find(x=>x.key===k); if(n) handleNavigate(n.path, k);}} onLogout={handleLogout}/>

        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

          {/* HEADER */}
          <header style={{background:HDR,height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 18px',gap:12,borderBottom:'1px solid rgba(0,0,0,0.06)',zIndex:10}}>
            <div style={{position:'relative',flexShrink:0}}>
              <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none',opacity:0.4}}><ISearch/></span>
              <input id="set-search" aria-label="Search" style={{border:'1.5px solid #c0cbcc',borderRadius:10,padding:'0 14px 0 38px',height:40,width:260,fontFamily:"'Inter',sans-serif",fontSize:14,color:'#1f2937',background:'#fff',outline:'none'}}
                placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <div style={{flex:1}}/>
            <button style={{background:'none',border:'none',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',padding:4,borderRadius:8}} aria-label="Notifications"><IBell/></button>
            <div style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><span style={{fontSize:14,fontWeight:500,color:'#1f2937'}}>MR. SAYO</span><IChevD/></div>
            <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#5a8a92,#3a6a72)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',flexShrink:0}}>S</div>
          </header>

          {/* SEGMENTED SWITCH */}
          <div style={{padding:'12px 15px 0'}}>
            <div className="seg-wrap">
              <button className={`seg-btn ${section==='users'?'active':''}`} onClick={()=>switchSection('users')}><IUsers s={14}/> Users</button>
              <button className={`seg-btn ${section==='groups'?'active':''}`} onClick={()=>switchSection('groups')}><IIdCard s={14}/> User Groups</button>
              <button className={`seg-btn ${section==='locations'?'active':''}`} onClick={()=>switchSection('locations')}><IPin s={14}/> Locations</button>
              <button className={`seg-btn ${section==='bookingtypes'?'active':''}`} onClick={()=>switchSection('bookingtypes')}><ICal s={14}/> Booking Types</button>
              <button className={`seg-btn ${section==='specialities'?'active':''}`} onClick={()=>switchSection('specialities')}><IStar s={14}/> Specialities</button>
            </div>
          </div>

          {/* BODY */}
          <div className="main-body" style={{flex:1,overflow:'hidden',padding:'13px 15px',display:'flex',gap:13}}>

            {/* ═══════════════ USERS ═══════════════ */}
            {section==='users' && (
              <>
                <div className="left-panel" style={{width:260,flexShrink:0,background:'#deeaea',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 1px 5px rgba(0,0,0,0.08)'}}>
                  <div style={{padding:'12px 12px 8px',borderBottom:'1px solid rgba(30,58,64,0.1)',flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>Users</span>
                      <span style={{fontSize:11,color:'#6b7280',fontWeight:500}}>{users.length} total</span>
                    </div>
                    <button className="btn-new" style={{width:'100%'}} onClick={handleNewUser}><IPlus s={14}/> New User</button>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
                    {filteredUsers.length===0 && <p style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:'2rem 0'}}>No users found</p>}
                    {filteredUsers.map(u=>(
                      <SimpleListItem key={u.id} active={curUser.id===u.id && !isNewUser} onClick={()=>handleSelectUser(u)}
                        title={u.userName} sub={`${u.userId} · ${groupDes(u.groupId)}`}
                        icon={u.picture ? <img src={u.picture} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:9}}/> : <IUsers s={16}/>}
                        badge={<span className={u.enable?'badge-active':'badge-inactive'}>{u.enable?'Active':'Inactive'}</span>}
                      />
                    ))}
                  </div>
                </div>

                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{background:'#1e3a40',borderRadius:'12px 12px 0 0',padding:'14px 18px',flexShrink:0}}>
                    <p style={{color:'rgba(255,255,255,0.55)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{isNewUser?'New User':'Edit User'}{isDirtyUser && '  •  Unsaved changes'}</p>
                    <p style={{color:'#fff',fontSize:18,fontWeight:800,marginTop:2}}>USER DETAILS</p>
                  </div>

                  <div style={{background:'#fff',borderBottom:'1px solid #e5e7eb',display:'flex',flexShrink:0,overflowX:'auto'}}>
                    {(['identification','contact','specialities','security'] as const).map(t=>(
                      <button key={t} className={`tab-btn ${userTab===t?'active':''}`} onClick={()=>setUserTab(t)}>
                        <span className="tab-btn-inner">
                          {t==='identification' && <><IIdCard s={14}/> Identification</>}
                          {t==='contact'        && <><IPhone s={14}/> Contact &amp; Employment</>}
                          {t==='specialities'   && <><IStar s={14}/> Specialities</>}
                          {t==='security'       && <><IKey s={14}/> Security &amp; Audit</>}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:13,background:'#e8f0f1'}}>

                    {userTab==='identification' && (
                      <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                        <SectBox title="Identification" icon={<IIdCard s={14}/>}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr',gap:10}}>
                            <FieldRow label="User ID"><input className="frm-input" value={curUser.userId} readOnly/></FieldRow>
                            <FieldRow label="NIC"><input className="frm-input" value={curUser.nic} onChange={e=>setCurUser(p=>({...p,nic:e.target.value}))} placeholder="e.g. 901234567V"/></FieldRow>
                            <FieldRow label="User Name (UserName) *"><input className="frm-input" value={curUser.userName} onChange={e=>setCurUser(p=>({...p,userName:e.target.value}))} placeholder="Full name"/></FieldRow>
                          </div>
                          <FieldRow label="Address"><input className="frm-input" value={curUser.address} onChange={e=>setCurUser(p=>({...p,address:e.target.value}))} placeholder="Street, City"/></FieldRow>
                        </SectBox>
                        <SectBox title="Profile Picture">
                          <div style={{display:'flex',alignItems:'center',gap:14}}>
                            <div style={{width:76,height:76,borderRadius:10,background:'#f3f6f6',border:'1.5px dashed #d1d9da',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
                              {curUser.picture ? <img src={curUser.picture} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <IUsers s={26}/>}
                            </div>
                            <div style={{display:'flex',flexDirection:'column',gap:8}}>
                              <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handlePicChange}/>
                              <button className="btn-clear" onClick={()=>fileInputRef.current?.click()}>Upload Picture</button>
                              {curUser.picture && <button className="btn-del" onClick={()=>setCurUser(p=>({...p,picture:null}))}><ITrash s={13}/> Remove</button>}
                            </div>
                          </div>
                        </SectBox>
                        <SectBox title="Status"><Checkbox checked={curUser.enable} onChange={v=>setCurUser(p=>({...p,enable:v}))} label="Enable"/></SectBox>
                        <SectBox title="Remarks">
                          <textarea className="frm-textarea" value={curUser.rmks} onChange={e=>setCurUser(p=>({...p,rmks:e.target.value}))} placeholder="Additional notes..." maxLength={250}/>
                        </SectBox>
                      </div>
                    )}

                    {userTab==='contact' && (
                      <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                        <SectBox title="Contact Details" icon={<IPhone s={14}/>}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                            <FieldRow label="Contact No (ContNo)"><input className="frm-input" value={curUser.contNo} onChange={e=>setCurUser(p=>({...p,contNo:e.target.value}))} placeholder="071-2345678"/></FieldRow>
                            <FieldRow label="Email"><input className="frm-input" type="email" value={curUser.email} onChange={e=>setCurUser(p=>({...p,email:e.target.value}))} placeholder="user@example.com"/></FieldRow>
                          </div>
                        </SectBox>
                        <SectBox title="Employment" icon={<IIdCard s={14}/>}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                            <FieldRow label="User Group (GroupId)">
                              <select className="frm-select" value={curUser.groupId} onChange={e=>setCurUser(p=>({...p,groupId:e.target.value}))}>
                                <option value="">-- Select --</option>
                                {groups.map(g=><option key={g.groupId} value={g.groupId}>{g.groupDes}</option>)}
                              </select>
                            </FieldRow>
                            <FieldRow label="Working Location (WorkingLocID)">
                              <select className="frm-select" value={curUser.workingLocID} onChange={e=>setCurUser(p=>({...p,workingLocID:e.target.value}))}>
                                <option value="">-- Select --</option>
                                {locations.map(l=><option key={l.locCode} value={l.locCode}>{l.locDes}</option>)}
                              </select>
                            </FieldRow>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                            <FieldRow label="Date of Birth (DOB)"><input className="frm-input" type="date" value={curUser.dob} onChange={e=>setCurUser(p=>({...p,dob:e.target.value}))}/></FieldRow>
                            <FieldRow label="Date Joined (DOJ)"><input className="frm-input" type="date" value={curUser.doj} onChange={e=>setCurUser(p=>({...p,doj:e.target.value}))}/></FieldRow>
                            <FieldRow label="Date Left (DOL)"><input className="frm-input" type="date" value={curUser.dol} onChange={e=>setCurUser(p=>({...p,dol:e.target.value}))}/></FieldRow>
                          </div>
                        </SectBox>
                      </div>
                    )}

                    {userTab==='specialities' && (
                      <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                        <SectBox title="Technician Specialities" icon={<IStar s={14}/>}>
                          <p style={{fontSize:12,color:'#6b7280',marginBottom:4}}>Assign specialities to this user (Tbl_TechnicianSpecilityAssignment):</p>
                          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                            {specialities.map(s=>(
                              <button key={s.specAreaID} className={`spec-chip ${curUser.specAreaIDs.includes(s.specAreaID)?'sel':''}`} onClick={()=>toggleSpec(s.specAreaID)}>
                                {curUser.specAreaIDs.includes(s.specAreaID) && <ICheck s={10}/>}
                                {s.specilities}
                              </button>
                            ))}
                            {specialities.length===0 && <p style={{fontSize:12,color:'#9ca3af'}}>No specialities defined yet — add some in the &quot;Specialities&quot; section.</p>}
                          </div>
                          {curUser.specAreaIDs.length>0 && (
                            <div style={{marginTop:10,padding:'10px 12px',background:'#f0f9f0',border:'1px solid #bbf7d0',borderRadius:8}}>
                              <p style={{fontSize:11,fontWeight:700,color:'#15803d',marginBottom:4}}>ASSIGNED ({curUser.specAreaIDs.length})</p>
                              <p style={{fontSize:13,color:'#166534'}}>{curUser.specAreaIDs.map(specDes).join(' · ')}</p>
                            </div>
                          )}
                        </SectBox>
                      </div>
                    )}

                    {userTab==='security' && (
                      <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                        <SectBox title="Login Credentials" icon={<IKey s={14}/>}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                            <FieldRow label="Login Name (LogName) *"><input className="frm-input" value={curUser.logName} onChange={e=>setCurUser(p=>({...p,logName:e.target.value}))} placeholder="e.g. nadeesha.p"/></FieldRow>
                            <FieldRow label="Password (PSW)"><input className="frm-input" type="password" value={curUser.psw} onChange={e=>setCurUser(p=>({...p,psw:e.target.value}))} placeholder="••••••••"/></FieldRow>
                          </div>
                        </SectBox>
                        <SectBox title="Audit Trail" icon={<IClipboard s={14}/>}>
                          <FieldRow label="Created By (CreateUser)"><input className="frm-input" value={curUser.createUser} readOnly/></FieldRow>
                        </SectBox>
                      </div>
                    )}

                  </div>

                  <div style={{background:'#dce8e8',borderTop:'1.5px solid rgba(30,58,64,0.12)',padding:'12px 16px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                    <button className="btn-clear" onClick={handleClearUser}><IRefresh s={14}/> Clear</button>
                    <button className="btn-print" onClick={()=>window.print()}><IPrint s={14}/> Print</button>
                    <div style={{flex:1}}/>
                    <button className="btn-del" onClick={handleDeleteUser} style={{display:isNewUser?'none':'flex'}}><ITrash s={14}/> Delete</button>
                    <button className="btn-save" onClick={handleSaveUser}><ISave s={14}/> Save</button>
                  </div>
                </div>
              </>
            )}

            {/* ═══════════════ USER GROUPS ═══════════════ */}
            {section==='groups' && (
              <>
                <div className="left-panel" style={{width:250,flexShrink:0,background:'#deeaea',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 1px 5px rgba(0,0,0,0.08)'}}>
                  <div style={{padding:'12px 12px 8px',borderBottom:'1px solid rgba(30,58,64,0.1)',flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>User Groups</span>
                      <span style={{fontSize:11,color:'#6b7280',fontWeight:500}}>{groups.length} total</span>
                    </div>
                    <button className="btn-new" style={{width:'100%'}} onClick={handleNewGroup}><IPlus s={14}/> New Group</button>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
                    {filteredGroups.length===0 && <p style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:'2rem 0'}}>No groups found</p>}
                    {filteredGroups.map(g=>(
                      <SimpleListItem key={g.id} active={curGroup.id===g.id && !isNewGroup} onClick={()=>handleSelectGroup(g)}
                        title={g.groupDes} sub={g.groupId} icon={<IIdCard s={16}/>}
                        badge={<span className="badge-tag">{users.filter(u=>u.groupId===g.groupId).length} user(s)</span>}
                      />
                    ))}
                  </div>
                </div>

                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{background:'#1e3a40',borderRadius:'12px 12px 0 0',padding:'14px 18px',flexShrink:0}}>
                    <p style={{color:'rgba(255,255,255,0.55)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{isNewGroup?'New User Group':'Edit User Group'}{isDirtyGroup && '  •  Unsaved changes'}</p>
                    <p style={{color:'#fff',fontSize:18,fontWeight:800,marginTop:2}}>USER GROUP DETAIL</p>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:13,background:'#e8f0f1'}}>
                    <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                      <SectBox title="Group Identification" icon={<IIdCard s={14}/>}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
                          <FieldRow label="Group ID"><input className="frm-input" value={curGroup.groupId} readOnly/></FieldRow>
                          <FieldRow label="Group Description (GroupDes) *"><input className="frm-input" value={curGroup.groupDes} onChange={e=>setCurGroup(p=>({...p,groupDes:e.target.value}))} placeholder="e.g. Administrator"/></FieldRow>
                        </div>
                      </SectBox>
                      <SectBox title="Members" icon={<IUsers s={14}/>}>
                        {users.filter(u=>u.groupId===curGroup.groupId).length===0
                          ? <p style={{fontSize:12,color:'#9ca3af'}}>No users assigned to this group yet.</p>
                          : <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{users.filter(u=>u.groupId===curGroup.groupId).map(u=><span key={u.id} className="badge-tag">{u.userName}</span>)}</div>}
                      </SectBox>
                    </div>
                  </div>
                  <div style={{background:'#dce8e8',borderTop:'1.5px solid rgba(30,58,64,0.12)',padding:'12px 16px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                    <button className="btn-clear" onClick={handleClearGroup}><IRefresh s={14}/> Clear</button>
                    <button className="btn-print" onClick={()=>window.print()}><IPrint s={14}/> Print</button>
                    <div style={{flex:1}}/>
                    <button className="btn-del" onClick={handleDeleteGroup} style={{display:isNewGroup?'none':'flex'}}><ITrash s={14}/> Delete</button>
                    <button className="btn-save" onClick={handleSaveGroup}><ISave s={14}/> Save</button>
                  </div>
                </div>
              </>
            )}

            {/* ═══════════════ LOCATIONS ═══════════════ */}
            {section==='locations' && (
              <>
                <div className="left-panel" style={{width:260,flexShrink:0,background:'#deeaea',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 1px 5px rgba(0,0,0,0.08)'}}>
                  <div style={{padding:'12px 12px 8px',borderBottom:'1px solid rgba(30,58,64,0.1)',flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>Locations</span>
                      <span style={{fontSize:11,color:'#6b7280',fontWeight:500}}>{locations.length} total</span>
                    </div>
                    <button className="btn-new" style={{width:'100%'}} onClick={handleNewLoc}><IPlus s={14}/> New Location</button>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
                    {filteredLocs.length===0 && <p style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:'2rem 0'}}>No locations found</p>}
                    {filteredLocs.map(l=>(
                      <SimpleListItem key={l.id} active={curLoc.id===l.id && !isNewLoc} onClick={()=>handleSelectLoc(l)}
                        title={l.locDes} sub={`Loc ${l.locCode}`} icon={<IPin s={16}/>}
                        badge={<span className={l.enable?'badge-active':'badge-inactive'}>{l.enable?'Active':'Inactive'}</span>}
                      />
                    ))}
                  </div>
                </div>

                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{background:'#1e3a40',borderRadius:'12px 12px 0 0',padding:'14px 18px',flexShrink:0}}>
                    <p style={{color:'rgba(255,255,255,0.55)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{isNewLoc?'New Location':'Edit Location'}{isDirtyLoc && '  •  Unsaved changes'}</p>
                    <p style={{color:'#fff',fontSize:18,fontWeight:800,marginTop:2}}>LOCATION MASTER DETAIL</p>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:13,background:'#e8f0f1'}}>
                    <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                      <SectBox title="Location Identification" icon={<IPin s={14}/>}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
                          <FieldRow label="Location Code (LocCode)"><input className="frm-input" value={curLoc.locCode} readOnly={!isNewLoc} onChange={e=>isNewLoc && setCurLoc(p=>({...p,locCode:e.target.value}))}/></FieldRow>
                          <FieldRow label="Location Description (LocDes) *"><input className="frm-input" value={curLoc.locDes} onChange={e=>setCurLoc(p=>({...p,locDes:e.target.value}))} placeholder="e.g. Main Salon - Colombo"/></FieldRow>
                        </div>
                        <FieldRow label="Address"><textarea className="frm-textarea" value={curLoc.address} onChange={e=>setCurLoc(p=>({...p,address:e.target.value}))} placeholder="Full address..."/></FieldRow>
                      </SectBox>
                      <SectBox title="Status"><Checkbox checked={curLoc.enable} onChange={v=>setCurLoc(p=>({...p,enable:v}))} label="Enable"/></SectBox>
                      <SectBox title="Staff at this Location" icon={<IUsers s={14}/>}>
                        {users.filter(u=>u.workingLocID===curLoc.locCode).length===0
                          ? <p style={{fontSize:12,color:'#9ca3af'}}>No staff assigned to this location yet.</p>
                          : <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{users.filter(u=>u.workingLocID===curLoc.locCode).map(u=><span key={u.id} className="badge-tag">{u.userName}</span>)}</div>}
                      </SectBox>
                    </div>
                  </div>
                  <div style={{background:'#dce8e8',borderTop:'1.5px solid rgba(30,58,64,0.12)',padding:'12px 16px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                    <button className="btn-clear" onClick={handleClearLoc}><IRefresh s={14}/> Clear</button>
                    <button className="btn-print" onClick={()=>window.print()}><IPrint s={14}/> Print</button>
                    <div style={{flex:1}}/>
                    <button className="btn-del" onClick={handleDeleteLoc} style={{display:isNewLoc?'none':'flex'}}><ITrash s={14}/> Delete</button>
                    <button className="btn-save" onClick={handleSaveLoc}><ISave s={14}/> Save</button>
                  </div>
                </div>
              </>
            )}

            {/* ═══════════════ BOOKING TYPES ═══════════════ */}
            {section==='bookingtypes' && (
              <>
                <div className="left-panel" style={{width:250,flexShrink:0,background:'#deeaea',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 1px 5px rgba(0,0,0,0.08)'}}>
                  <div style={{padding:'12px 12px 8px',borderBottom:'1px solid rgba(30,58,64,0.1)',flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>Booking Types</span>
                      <span style={{fontSize:11,color:'#6b7280',fontWeight:500}}>{bookingTypes.length} total</span>
                    </div>
                    <button className="btn-new" style={{width:'100%'}} onClick={handleNewBT}><IPlus s={14}/> New Booking Type</button>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
                    {filteredBTs.length===0 && <p style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:'2rem 0'}}>No booking types found</p>}
                    {filteredBTs.map(b=>(
                      <SimpleListItem key={b.id} active={curBT.id===b.id && !isNewBT} onClick={()=>handleSelectBT(b)}
                        title={b.bookingTypeDes} sub={b.bookingTypeID} icon={<ICal s={16}/>}
                        badge={<span className={b.enabel?'badge-active':'badge-inactive'}>{b.enabel?'Active':'Inactive'}</span>}
                      />
                    ))}
                  </div>
                </div>

                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{background:'#1e3a40',borderRadius:'12px 12px 0 0',padding:'14px 18px',flexShrink:0}}>
                    <p style={{color:'rgba(255,255,255,0.55)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{isNewBT?'New Booking Type':'Edit Booking Type'}{isDirtyBT && '  •  Unsaved changes'}</p>
                    <p style={{color:'#fff',fontSize:18,fontWeight:800,marginTop:2}}>BOOKING TYPE DETAIL</p>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:13,background:'#e8f0f1'}}>
                    <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                      <SectBox title="Booking Type Identification" icon={<ICal s={14}/>}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
                          <FieldRow label="Booking Type ID"><input className="frm-input" value={curBT.bookingTypeID} readOnly/></FieldRow>
                          <FieldRow label="Description (BookingTypeDes) *"><input className="frm-input" value={curBT.bookingTypeDes} onChange={e=>setCurBT(p=>({...p,bookingTypeDes:e.target.value}))} placeholder="e.g. Walk-In"/></FieldRow>
                        </div>
                      </SectBox>
                      <SectBox title="Status"><Checkbox checked={curBT.enabel} onChange={v=>setCurBT(p=>({...p,enabel:v}))} label="Enable"/></SectBox>
                    </div>
                  </div>
                  <div style={{background:'#dce8e8',borderTop:'1.5px solid rgba(30,58,64,0.12)',padding:'12px 16px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                    <button className="btn-clear" onClick={handleClearBT}><IRefresh s={14}/> Clear</button>
                    <button className="btn-print" onClick={()=>window.print()}><IPrint s={14}/> Print</button>
                    <div style={{flex:1}}/>
                    <button className="btn-del" onClick={handleDeleteBT} style={{display:isNewBT?'none':'flex'}}><ITrash s={14}/> Delete</button>
                    <button className="btn-save" onClick={handleSaveBT}><ISave s={14}/> Save</button>
                  </div>
                </div>
              </>
            )}

            {/* ═══════════════ SPECIALITIES ═══════════════ */}
            {section==='specialities' && (
              <>
                <div className="left-panel" style={{width:260,flexShrink:0,background:'#deeaea',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 1px 5px rgba(0,0,0,0.08)'}}>
                  <div style={{padding:'12px 12px 8px',borderBottom:'1px solid rgba(30,58,64,0.1)',flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:'#1e3a40'}}>Technician Specialities</span>
                      <span style={{fontSize:11,color:'#6b7280',fontWeight:500}}>{specialities.length} total</span>
                    </div>
                    <button className="btn-new" style={{width:'100%'}} onClick={handleNewSpec}><IPlus s={14}/> New Speciality</button>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
                    {filteredSpecs.length===0 && <p style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:'2rem 0'}}>No specialities found</p>}
                    {filteredSpecs.map(s=>(
                      <SimpleListItem key={s.id} active={curSpec.id===s.id && !isNewSpec} onClick={()=>handleSelectSpec(s)}
                        title={s.specilities} sub={s.specAreaID} icon={<IStar s={16}/>}
                        badge={<span className="badge-tag">{users.filter(u=>u.specAreaIDs.includes(s.specAreaID)).length} technician(s)</span>}
                      />
                    ))}
                  </div>
                </div>

                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{background:'#1e3a40',borderRadius:'12px 12px 0 0',padding:'14px 18px',flexShrink:0}}>
                    <p style={{color:'rgba(255,255,255,0.55)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{isNewSpec?'New Speciality':'Edit Speciality'}{isDirtySpec && '  •  Unsaved changes'}</p>
                    <p style={{color:'#fff',fontSize:18,fontWeight:800,marginTop:2}}>TECHNICIAN SPECIALITY DETAIL</p>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:13,background:'#e8f0f1'}}>
                    <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:13}}>
                      <SectBox title="Speciality Identification" icon={<IStar s={14}/>}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
                          <FieldRow label="Spec. Area ID"><input className="frm-input" value={curSpec.specAreaID} readOnly/></FieldRow>
                          <FieldRow label="Speciality Name (Specilities) *"><input className="frm-input" value={curSpec.specilities} onChange={e=>setCurSpec(p=>({...p,specilities:e.target.value}))} placeholder="e.g. Hair Coloring"/></FieldRow>
                        </div>
                      </SectBox>
                      <SectBox title="Assigned Technicians" icon={<IUsers s={14}/>}>
                        {users.filter(u=>u.specAreaIDs.includes(curSpec.specAreaID)).length===0
                          ? <p style={{fontSize:12,color:'#9ca3af'}}>No technicians assigned to this speciality yet.</p>
                          : <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{users.filter(u=>u.specAreaIDs.includes(curSpec.specAreaID)).map(u=><span key={u.id} className="badge-tag">{u.userName}</span>)}</div>}
                      </SectBox>
                    </div>
                  </div>
                  <div style={{background:'#dce8e8',borderTop:'1.5px solid rgba(30,58,64,0.12)',padding:'12px 16px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                    <button className="btn-clear" onClick={handleClearSpec}><IRefresh s={14}/> Clear</button>
                    <button className="btn-print" onClick={()=>window.print()}><IPrint s={14}/> Print</button>
                    <div style={{flex:1}}/>
                    <button className="btn-del" onClick={handleDeleteSpec} style={{display:isNewSpec?'none':'flex'}}><ITrash s={14}/> Delete</button>
                    <button className="btn-save" onClick={handleSaveSpec}><ISave s={14}/> Save</button>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      <nav className="mob-nav">
        {NAV_ITEMS.map(n=>(
          <button key={n.key} className={`mob-btn ${navKey===n.key?'active':''}`} onClick={()=>handleNavigate(n.path, n.key)}>
            {navIcon(n.key)}<span className="mob-lbl">{n.label}</span>
          </button>
        ))}
        <button className="mob-btn" onClick={handleLogout} style={{color:'#f87171'}}><ILogout/><span className="mob-lbl">Logout</span></button>
      </nav>
    </>
  );
}