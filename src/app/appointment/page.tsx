"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";

interface Appointment {
  id: string;
  bookingID: string;
  locCode: string;
  cusCode: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  providerName: string;
  techID: string;
  serviceName: string;
  serviceNames: string[];
  date: string;
  bookingDate?: string;
  timeSlot: string;
  status: "confirmed" | "pending" | "cancelled" | "ongoing";
  mode: "confirmed" | "pre_booked" | "without_confirmation" | string;
  bookingTypeID?: string;
  categoryCodes?: string[];
  techIDs?: string[];
  location: string;
  duration: number;
  price: number;
  gender: string;
  notes?: string;
  guests: string[];
  detailCount: number;
  pax?: number;
  confirmed?: boolean;
  confirmedBy?: string;
  confirmedDate?: string | null;
  cancelledBy?: string;
  cancelledDate?: string | null;
  checkInTime?: string | null;
  billingTime?: string | null;
  txnDateTime: string;
}

interface Stats {
  total: number;
  confirmed: number;
  cancelled: number;
  pending: number;
  ongoing: number;
}

interface ToastMsg {
  id: number;
  text: string;
  type: "success" | "error" | "info";
}

interface FilterMeta {
  locations: { LocCode: string; LocDes: string }[];
  categories: { CatCode: string; CatDes: string }[];
  bookingTypes: { BooikingTypeID: string; BookingTypeDes: string }[];
  technicians: {
    UserId: string;
    UserName: string;
    WorkingLocID?: string;
  }[];
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function fmtDateNav(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][date.getMonth()];

  return `${month} / ${String(date.getDate()).padStart(2, "0")} / ${date.getFullYear()}`;
}

function fmtDateLong(iso: string): string {
  if (!iso) return "";

  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoFromYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSlotToMinutes(slot: string): number {
  if (!slot) return -1;

  const parts = slot.trim().split(/\s+/);
  if (parts.length < 2) return -1;

  const [time, period] = parts;
  const [hourText, minuteText] = time.split(":");
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
  if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (period.toUpperCase() === "AM" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function minutesToSlotLabel(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function computePeriod(date: string): "today" | "tomorrow" | "dayafter" | "" {
  const today = todayISO();
  if (date === today) return "today";
  if (date === shiftDate(today, 1)) return "tomorrow";
  if (date === shiftDate(today, 2)) return "dayafter";
  return "";
}

function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/*
 * The form supports 5-minute offsets such as 5:45 PM. The old grid only
 * looked for exact 30-minute labels, which caused those appointments to be
 * skipped. The grid now uses 5-minute internal rows while showing the main
 * time label every 30 minutes.
 */
const TIME_SLOTS = [
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
  "6:00 PM",
  "6:30 PM",
  "7:00 PM",
  "7:30 PM",
  "8:00 PM",
  "8:30 PM",
  "9:00 PM",
  "9:30 PM",
  "10:00 PM",
  "10:30 PM",
  "11:00 PM",
  "11:30 PM",
];
const GRID_START_MINUTES = parseSlotToMinutes(TIME_SLOTS[0]);
const GRID_END_MINUTES =
  parseSlotToMinutes(TIME_SLOTS[TIME_SLOTS.length - 1]) + 30;
const GRID_STEP_MINUTES = 5;
const GRID_ROWS = Array.from(
  {
    length: Math.floor(
      (GRID_END_MINUTES - GRID_START_MINUTES) / GRID_STEP_MINUTES,
    ),
  },
  (_, index) => GRID_START_MINUTES + index * GRID_STEP_MINUTES,
);
const ROW_HEIGHT_PX = 10;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: 'Inter', sans-serif; overflow: hidden; }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
  @keyframes popIn { from { opacity: 0; transform: scale(.95) translateY(-6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes livePulseBlue { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,.5); } 70% { box-shadow: 0 0 0 7px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }
  @keyframes dropSuccess { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.7); } 60% { box-shadow: 0 0 0 10px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
  @keyframes timelinePulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }

  .fade-up { animation: fadeUp .2s ease both; }
  .slide-up { animation: slideUp .25s ease both; }
  .pop-in { animation: popIn .18s cubic-bezier(.34,1.56,.64,1) both; }
  .scale-in { animation: scaleIn .2s cubic-bezier(.34,1.56,.64,1) both; }
  .drop-success { animation: dropSuccess .6s ease-out; }

  .skeleton { background: linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 8px; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(30,58,64,.2); border-radius: 4px; }

  .sch-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .sch-tbl thead th {
    height: 41px; padding: 10px; text-align: left; white-space: nowrap;
    background: #dce8e8; color: #374151; border-bottom: 1px solid rgba(30,58,64,.1);
    font-size: 12px; font-weight: 600; position: sticky; top: 0; z-index: 3;
  }
  .sch-tbl thead th:first-child { width: 76px; }
  .sch-tbl tbody tr:nth-child(odd) td { background: #e2ecec; }
  .sch-tbl tbody tr:nth-child(even) td { background: #d8e4e4; }
  .sch-tbl td {
    height: 10px; padding: 0 8px; line-height: 1; vertical-align: middle;
    border-bottom: 1px solid rgba(0,0,0,.03); font-size: 12px;
    transition: background .1s;
  }
  .sch-tbl td.occ-cell { vertical-align: top; padding: 2px 6px; line-height: normal; }

  .now-line { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg,#ef4444,#f87171); z-index: 10; pointer-events: none; box-shadow: 0 0 6px rgba(239,68,68,.6); animation: timelinePulse 2s ease-in-out infinite; }
  .now-line::before { content: ''; position: absolute; left: 76px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.25); }
  .now-label { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); padding: 1px 4px; border-radius: 4px; background: rgba(255,255,255,.9); color: #ef4444; font-size: 9px; font-weight: 800; white-space: nowrap; line-height: 1; }

  .appt-pill { display: flex; flex-direction: column; gap: 1px; width: 100%; height: 100%; padding: 4px 6px; overflow: hidden; border: none; border-radius: 7px; cursor: grab; text-align: left; user-select: none; font-family: 'Inter',sans-serif; font-size: 11px; font-weight: 600; transition: opacity .15s, transform .15s, box-shadow .15s; }
  .appt-pill:active { cursor: grabbing; }
  .appt-pill:hover { transform: scale(1.02); box-shadow: 0 4px 14px rgba(0,0,0,.15); }
  .appt-pill.dragging { opacity: .35; }
  .appt-pill.locked-pill { cursor: not-allowed; }
  .appt-pill.locked-pill:hover { transform: none; box-shadow: none; }
  .appt-pill .ap-service { display: flex; align-items: center; gap: 3px; overflow: hidden; font-size: 10px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
  .appt-pill .ap-time { font-size: 9px; font-weight: 600; opacity: .85; white-space: nowrap; }
  .appt-pill .ap-client { overflow: hidden; font-size: 9px; font-weight: 500; opacity: .75; white-space: nowrap; text-overflow: ellipsis; }
  .appt-pill .ap-meta { display: flex; gap: 3px; flex-wrap: wrap; margin-top: 1px; }
  .pill-confirmed { background: rgba(34,197,94,.13); color: #15803d; border: 1px solid rgba(34,197,94,.25); }
  .pill-pending { background: rgba(245,158,11,.13); color: #b45309; border: 1px solid rgba(245,158,11,.25); }
  .pill-cancelled { background: rgba(239,68,68,.1); color: #b91c1c; border: 1px solid rgba(239,68,68,.22); }
  .pill-ongoing { background: rgba(59,130,246,.13); color: #1d4ed8; border: 1px solid rgba(59,130,246,.3); animation: livePulseBlue 2s infinite; }
  .live-dot-blue { display: inline-block; width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: #2563eb; }

  .badge, .mini-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 99px; font-weight: 700; white-space: nowrap; text-transform: uppercase; }
  .badge { padding: 3px 8px; font-size: 10px; letter-spacing: .05em; }
  .mini-badge { padding: 1.5px 5px; font-size: 8px; letter-spacing: .03em; }
  .b-ok { background: rgba(34,197,94,.12); color: #15803d; }
  .b-pnd { background: rgba(245,158,11,.12); color: #b45309; }
  .b-can { background: rgba(239,68,68,.1); color: #b91c1c; }
  .b-ong { background: rgba(59,130,246,.1); color: #1d4ed8; }
  .b-wlk { background: rgba(56,178,172,.1); color: #0f766e; }
  .b-pre { background: rgba(30,58,64,.08); color: #1e3a40; }

  .f-sel { appearance: none; min-width: 110px; height: 36px; padding: 7px 28px 7px 11px; border: 1px solid rgba(0,0,0,.1); border-radius: 8px; outline: none; background: #d8e4e4; color: #374151; font-family: 'Inter',sans-serif; font-size: 12px; cursor: pointer; }
  .f-sel:focus { outline: 2px solid #1e3a40; outline-offset: 1px; }
  .srch { width: 260px; height: 40px; padding: 0 14px 0 38px; border: 1.5px solid #c0cbcc; border-radius: 10px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 14px; }
  .srch:focus { border-color: #1e3a40; box-shadow: 0 0 0 3px rgba(30,58,64,.08); }
  .srch::placeholder { color: rgba(0,0,0,.35); }

  .nav-arr, .date-trigger, .cal-nav, .cal-month-title, .cal-day, .month-item, .year-item, .view-btn, .period-tab { border: none; background: transparent; cursor: pointer; font-family: 'Inter',sans-serif; }
  .nav-arr { display: flex; align-items: center; padding: 5px 6px; border-radius: 7px; color: #1e3a40; }
  .nav-arr:hover, .date-trigger:hover, .cal-nav:hover, .cal-month-title:hover, .cal-day:hover:not(:disabled), .month-item:hover, .year-item:hover { background: rgba(30,58,64,.08); }
  .date-trigger { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 8px; color: #1f2937; font-size: 15px; font-weight: 600; white-space: nowrap; }
  .view-btn { padding: 4px 13px; border-radius: 6px; color: #6b7280; font-size: 12px; font-weight: 600; }
  .view-btn.active { background: #fff; color: #1e3a40; box-shadow: 0 1px 4px rgba(0,0,0,.12); }

  .cal-popup { position: absolute; top: calc(100% + 8px); left: 50%; z-index: 500; min-width: 270px; padding: 14px; transform: translateX(-50%); border: 1px solid rgba(30,58,64,.1); border-radius: 14px; background: #fff; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .cal-nav { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px; color: #374151; }
  .cal-month-title { padding: 3px 7px; border-radius: 6px; color: #1f2937; font-size: 14px; font-weight: 700; }
  .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
  .cal-daylbl { padding: 4px 0 6px; color: #9ca3af; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .cal-day { padding: 5px 2px; border-radius: 7px; color: #374151; font-size: 12px; }
  .cal-day.selected { background: #1e3a40 !important; color: #fff !important; font-weight: 700; }
  .cal-day.today { color: #1e3a40; font-weight: 700; box-shadow: inset 0 0 0 1.5px #1e3a40; }
  .cal-day.other-month { color: #c4cdd4; }
  .month-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; margin-top: 4px; }
  .month-item, .year-item { padding: 7px 4px; border-radius: 8px; color: #374151; font-size: 12px; font-weight: 500; }
  .month-item.sel-mo, .year-item.sel-yr { background: #1e3a40; color: #fff; font-weight: 700; }
  .year-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 5px; margin-top: 4px; }

  .modal-bg { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: flex-end; justify-content: center; padding: 16px; background: rgba(0,0,0,.5); backdrop-filter: blur(5px); }
  .modal-box { width: 100%; max-width: 560px; max-height: 93vh; overflow-y: auto; border-radius: 18px; background: #fff; box-shadow: 0 -8px 40px rgba(0,0,0,.2); font-family: 'Inter',sans-serif; }
  .modal-action-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btn-modal-cancel, .btn-modal-confirm, .btn-modal-checkin, .btn-modal-reschedule, .btn-modal-bill { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 12px; border-radius: 12px; font-family: 'Inter',sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; transition: all .18s; }
  .btn-modal-cancel { border: 1.5px solid #fca5a5; background: #fff2f2; color: #dc2626; }
  .btn-modal-confirm, .btn-modal-checkin { border: 1.5px solid #1e3a40; background: #1e3a40; color: #fff; }
  .btn-modal-reschedule { width: 100%; border: 1.5px solid #fcd34d; background: #fffbeb; color: #b45309; }
  .btn-modal-bill { width: 100%; border: 1.5px solid #2563eb; background: #2563eb; color: #fff; }
  .btn-modal-cancel:hover, .btn-modal-confirm:hover, .btn-modal-checkin:hover, .btn-modal-reschedule:hover, .btn-modal-bill:hover { transform: translateY(-1px); }
  .btn-modal-cancel:hover { background: #fee2e2; }
  .btn-modal-confirm:hover, .btn-modal-checkin:hover { background: #162e34; }
  .btn-modal-reschedule:hover { background: #fef3c7; }
  .btn-modal-bill:hover { background: #1d4ed8; }

  .toast { display: flex; align-items: center; gap: 9px; padding: 12px 22px; border-radius: 12px; background: #1e3a40; color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.25); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .toast.success { background: #15803d; }
  .toast.error { background: #b91c1c; }
  .appt-card { display: flex; flex-direction: column; gap: 9px; padding: 13px; border: 1px solid #c8d6d8; border-radius: 12px; background: #fff; cursor: pointer; transition: box-shadow .18s, transform .15s; }
  .appt-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.1); transform: translateY(-1px); }
  .refresh-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1.5px solid rgba(30,58,64,.2); border-radius: 8px; background: rgba(30,58,64,.05); color: #1e3a40; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #9ca3af; }
  .empty-ico { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: rgba(30,58,64,.08); }
  .notif-dropdown, .profile-dropdown { position: absolute; top: calc(100% + 10px); right: 0; z-index: 600; overflow: hidden; border: 1px solid rgba(30,58,64,.1); border-radius: 14px; background: #fff; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  .notif-dropdown { width: 300px; max-width: 88vw; }
  .notif-item { display: flex; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #f3f4f6; }
  .profile-dropdown { display: flex; flex-direction: column; width: 170px; padding: 6px; }
  .profile-item { padding: 9px 12px; border: none; border-radius: 8px; background: none; color: #374151; text-align: left; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
  .profile-item:hover { background: #f3f4f6; }
  .stats-row-wrap { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; }
  .stat-card { position: relative; display: flex; flex: 1 1 0; min-width: 80px; flex-direction: column; gap: 4px; overflow: hidden; padding: 14px 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.05); }
  .stat-card .sc-label { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; opacity: .7; }
  .stat-card .sc-value { color: #1f2937; font-size: 30px; font-weight: 800; line-height: 1.1; }
  .stat-card .sc-sub { margin-top: 2px; font-size: 10px; font-weight: 500; opacity: .55; }
  .stat-card .sc-icon { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); opacity: .12; }
  .stat-card .sc-bar { position: absolute; bottom: 0; left: 0; height: 3px; border-radius: 0 0 12px 12px; }
  .period-tab { padding: 6px 14px; border-radius: 7px; color: #4b5563; font-size: 12px; font-weight: 500; white-space: nowrap; }
  .period-tab.active { background: #1e3a40; color: #fff; font-weight: 700; box-shadow: 0 1px 4px rgba(30,58,64,.35); }

  @media (min-width: 700px) { .modal-bg { align-items: center; } }
  @media (max-width: 767px) { .main-body { padding-bottom: 72px !important; } .hdr-name { display: none !important; } }
  @media (max-width: 640px) { .toolbar-row, .filters-row { align-items: stretch !important; flex-direction: column; } .stats-row-wrap { gap: 7px; } .stat-card { min-width: calc(50% - 4px); } }
  @media (max-width: 480px) { .srch { width: 100% !important; } }
`;

const Ico = {
  Bell: () => (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Search: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ChevD: ({ size = 13 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevL: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevR: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  X: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Clock: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Loc: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Cal: ({ size = 15 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Appt: ({ size = 32 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </svg>
  ),
  Check: ({ size = 32 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Pending: ({ size = 32 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Cancel: ({ size = 32 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  Live: ({ size = 32 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M4.93 4.93a10 10 0 0 0 0 14.14M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  Refresh: ({ size = 15 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
    </svg>
  ),
  CheckCircle: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  XCircle: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  Login: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  ),
  Receipt: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  ),
  Inbox: () => (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  Plus: () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  Users: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Lock: ({ size = 10 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Reschedule: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 3 3 8 8 8" />
    </svg>
  ),
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  if (normalized === "confirmed") {
    return (
      <span className="badge b-ok">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#22c55e",
          }}
        />
        Confirmed
      </span>
    );
  }

  if (normalized === "cancelled") {
    return (
      <span className="badge b-can">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#ef4444",
          }}
        />
        Cancelled
      </span>
    );
  }

  if (normalized === "ongoing") {
    return (
      <span className="badge b-ong">
        <span className="live-dot-blue" /> Ongoing
      </span>
    );
  }

  return (
    <span className="badge b-pnd">
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#f59e0b",
        }}
      />
      Pending
    </span>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  return mode === "without_confirmation" ? (
    <span className="badge b-wlk">Walk-in</span>
  ) : (
    <span className="badge b-pre">Pre-booked</span>
  );
}

function MiniModeBadge({ mode }: { mode: string }) {
  return mode === "without_confirmation" ? (
    <span className="mini-badge b-wlk">WI</span>
  ) : (
    <span className="mini-badge b-pre">PB</span>
  );
}

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        transform: "translateX(-50%)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === "success"
            ? "✓ "
            : toast.type === "error"
              ? "✕ "
              : "ℹ "}
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function NotificationPanel({ appointments }: { appointments: Appointment[] }) {
  const recent = useMemo(() => {
    const seen = new Set<string>();

    return [...appointments]
      .sort(
        (a, b) =>
          new Date(b.txnDateTime).getTime() - new Date(a.txnDateTime).getTime(),
      )
      .filter((appointment) => {
        if (seen.has(appointment.bookingID)) return false;
        seen.add(appointment.bookingID);
        return true;
      })
      .slice(0, 8);
  }, [appointments]);

  function dotColor(status: string): string {
    if (status === "cancelled") return "#ef4444";
    if (status === "confirmed") return "#22c55e";
    if (status === "ongoing") return "#3b82f6";
    return "#f59e0b";
  }

  return (
    <div className="notif-dropdown pop-in">
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #eee",
          color: "#1e3a40",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Notifications
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {recent.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: "#9ca3af",
              textAlign: "center",
              fontSize: 12,
            }}
          >
            No recent activity
          </div>
        ) : (
          recent.map((appointment) => (
            <div key={appointment.bookingID} className="notif-item">
              <span
                style={{
                  width: 8,
                  height: 8,
                  marginTop: 5,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: dotColor(appointment.status),
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    overflow: "hidden",
                    color: "#1f2937",
                    fontSize: 12,
                    fontWeight: 600,
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {appointment.clientName} ·{" "}
                  {appointment.serviceName.split(",")[0]}
                </p>
                <p style={{ marginTop: 1, color: "#9ca3af", fontSize: 11 }}>
                  {fmtRelTime(appointment.txnDateTime)} · {appointment.status}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="profile-dropdown pop-in">
      <button className="profile-item" type="button">
        Profile
      </button>
      <button className="profile-item" type="button">
        Settings
      </button>
      <div style={{ height: 1, margin: "4px 2px", background: "#eee" }} />
      <button
        className="profile-item"
        type="button"
        style={{ color: "#dc2626" }}
        onClick={onLogout}
      >
        Logout
      </button>
    </div>
  );
}

function StatsRow({
  stats,
  onNewAppointment,
}: {
  stats: Stats;
  onNewAppointment: () => void;
}) {
  const percentage = (value: number) =>
    stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;

  return (
    <div className="stats-row-wrap">
      <div
        className="stat-card"
        style={{
          minWidth: 160,
          flex: "1.4 1 160px",
          background: "linear-gradient(135deg,#1e3a40,#2a5260)",
        }}
      >
        <div className="sc-label" style={{ color: "rgba(255,255,255,.6)" }}>
          <Ico.Appt size={12} /> Total Appointments
        </div>
        <div className="sc-value" style={{ color: "#fff", fontSize: 38 }}>
          {stats.total}
        </div>
        <div className="sc-sub" style={{ color: "rgba(255,255,255,.45)" }}>
          {fmtDateNav(todayISO())}
        </div>
        <div className="sc-icon" style={{ opacity: 0.08 }}>
          <Ico.Appt size={64} />
        </div>
        <div
          className="sc-bar"
          style={{ width: "100%", background: "rgba(255,255,255,.18)" }}
        />
      </div>

      <div
        className="stat-card"
        style={{
          background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
          border: "1px solid rgba(34,197,94,.25)",
        }}
      >
        <div className="sc-label" style={{ color: "#15803d" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#22c55e",
            }}
          />{" "}
          Confirmed
        </div>
        <div className="sc-value" style={{ color: "#14532d" }}>
          {stats.confirmed}
        </div>
        <div className="sc-sub" style={{ color: "#16a34a" }}>
          {percentage(stats.confirmed)}% of total
        </div>
        <div className="sc-icon">
          <Ico.Check size={40} />
        </div>
        <div
          className="sc-bar"
          style={{
            width: `${percentage(stats.confirmed)}%`,
            background: "#22c55e",
          }}
        />
      </div>

      <div
        className="stat-card"
        style={{
          background: "linear-gradient(135deg,#eff6ff,#dbeafe)",
          border: "1px solid rgba(59,130,246,.3)",
          animation:
            stats.ongoing > 0 ? "livePulseBlue 2s infinite" : undefined,
        }}
      >
        <div className="sc-label" style={{ color: "#1d4ed8" }}>
          <span className="live-dot-blue" /> Ongoing
        </div>
        <div className="sc-value" style={{ color: "#1e3a8a" }}>
          {stats.ongoing}
        </div>
        <div className="sc-sub" style={{ color: "#2563eb" }}>
          {stats.ongoing > 0 ? "In session now" : "None active"}
        </div>
        <div className="sc-icon">
          <Ico.Live size={40} />
        </div>
        <div
          className="sc-bar"
          style={{
            width: `${percentage(stats.ongoing)}%`,
            background: "#3b82f6",
          }}
        />
      </div>

      <div
        className="stat-card"
        style={{
          background: "linear-gradient(135deg,#fffbeb,#fef3c7)",
          border: "1px solid rgba(245,158,11,.3)",
        }}
      >
        <div className="sc-label" style={{ color: "#b45309" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#f59e0b",
            }}
          />{" "}
          Pending
        </div>
        <div className="sc-value" style={{ color: "#78350f" }}>
          {stats.pending}
        </div>
        <div className="sc-sub" style={{ color: "#d97706" }}>
          {percentage(stats.pending)}% of total
        </div>
        <div className="sc-icon">
          <Ico.Pending size={40} />
        </div>
        <div
          className="sc-bar"
          style={{
            width: `${percentage(stats.pending)}%`,
            background: "#f59e0b",
          }}
        />
      </div>

      <div
        className="stat-card"
        style={{
          background: "linear-gradient(135deg,#fff1f2,#fee2e2)",
          border: "1px solid rgba(239,68,68,.25)",
        }}
      >
        <div className="sc-label" style={{ color: "#b91c1c" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#ef4444",
            }}
          />{" "}
          Cancelled
        </div>
        <div className="sc-value" style={{ color: "#7f1d1d" }}>
          {stats.cancelled}
        </div>
        <div className="sc-sub" style={{ color: "#dc2626" }}>
          {percentage(stats.cancelled)}% of total
        </div>
        <div className="sc-icon">
          <Ico.Cancel size={40} />
        </div>
        <div
          className="sc-bar"
          style={{
            width: `${percentage(stats.cancelled)}%`,
            background: "#ef4444",
          }}
        />
      </div>

      <button
        type="button"
        onClick={onNewAppointment}
        style={{
          minWidth: 130,
          minHeight: 90,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          border: "none",
          borderRadius: 12,
          background: "linear-gradient(135deg,#1e3a40,#2a5260)",
          boxShadow: "0 2px 10px rgba(30,58,64,.3)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        <Ico.Plus />
        <span style={{ fontSize: 13, fontWeight: 700 }}>New Booking</span>
      </button>
    </div>
  );
}

type CalendarView = "day" | "month" | "year";

function CalendarPopup({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const selectedDate = new Date(`${value}T00:00:00`);
  const todayDate = new Date(`${todayISO()}T00:00:00`);
  const [view, setView] = useState<CalendarView>("day");
  const [year, setYear] = useState(selectedDate.getFullYear());
  const [month, setMonth] = useState(selectedDate.getMonth());
  const [yearBase, setYearBase] = useState(
    Math.floor(selectedDate.getFullYear() / 16) * 16,
  );

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const cells: {
    day: number;
    month: number;
    year: number;
    current: boolean;
  }[] = [];

  for (let index = 0; index < firstDay; index += 1) {
    const previousMonth = month === 0 ? 11 : month - 1;
    const previousYear = month === 0 ? year - 1 : year;
    cells.push({
      day: daysInPreviousMonth - firstDay + 1 + index,
      month: previousMonth,
      year: previousYear,
      current: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, month, year, current: true });
  }

  for (let day = 1; cells.length < 42; day += 1) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    cells.push({ day, month: nextMonth, year: nextYear, current: false });
  }

  function changeMonth(direction: number) {
    if (view === "day") {
      const next = new Date(year, month + direction, 1);
      setYear(next.getFullYear());
      setMonth(next.getMonth());
    } else if (view === "month") {
      setYear((current) => current + direction);
    } else {
      setYearBase((current) => current + direction * 16);
    }
  }

  return (
    <div className="cal-popup pop-in">
      <div className="cal-header">
        <button
          className="cal-nav"
          type="button"
          onClick={() => changeMonth(-1)}
        >
          <Ico.ChevL size={14} />
        </button>
        <button
          className="cal-month-title"
          type="button"
          onClick={() =>
            setView(
              view === "day" ? "month" : view === "month" ? "year" : "day",
            )
          }
        >
          {view === "day"
            ? `${MONTHS[month]} ${year}`
            : view === "month"
              ? year
              : `${yearBase}–${yearBase + 15}`}
        </button>
        <button
          className="cal-nav"
          type="button"
          onClick={() => changeMonth(1)}
        >
          <Ico.ChevR size={14} />
        </button>
      </div>

      {view === "day" && (
        <>
          <div className="cal-grid">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <div key={day} className="cal-daylbl">
                {day}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((cell, index) => {
              const isToday =
                cell.day === todayDate.getDate() &&
                cell.month === todayDate.getMonth() &&
                cell.year === todayDate.getFullYear();
              const isSelected =
                cell.day === selectedDate.getDate() &&
                cell.month === selectedDate.getMonth() &&
                cell.year === selectedDate.getFullYear();

              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}-${index}`}
                  type="button"
                  className={`cal-day${cell.current ? "" : " other-month"}${isSelected ? " selected" : ""}${isToday && !isSelected ? " today" : ""}`}
                  onClick={() => {
                    onChange(isoFromYMD(cell.year, cell.month, cell.day));
                    onClose();
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === "month" && (
        <div className="month-grid">
          {MONTHS_SHORT.map((monthName, index) => (
            <button
              key={monthName}
              type="button"
              className={`month-item${index === selectedDate.getMonth() && year === selectedDate.getFullYear() ? " sel-mo" : ""}`}
              onClick={() => {
                setMonth(index);
                setView("day");
              }}
            >
              {monthName}
            </button>
          ))}
        </div>
      )}

      {view === "year" && (
        <div className="year-grid">
          {Array.from({ length: 16 }, (_, index) => yearBase + index).map(
            (itemYear) => (
              <button
                key={itemYear}
                type="button"
                className={`year-item${itemYear === selectedDate.getFullYear() ? " sel-yr" : ""}`}
                onClick={() => {
                  setYear(itemYear);
                  setView("month");
                }}
              >
                {itemYear}
              </button>
            ),
          )}
        </div>
      )}

      <div style={{ marginTop: 10, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => {
            onChange(todayISO());
            onClose();
          }}
          style={{
            padding: "4px 14px",
            border: "none",
            borderRadius: 6,
            background: "rgba(30,58,64,.07)",
            color: "#1e3a40",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Today
        </button>
      </div>
    </div>
  );
}

function DateNav({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <button
        className="nav-arr"
        type="button"
        onClick={() => onChange(shiftDate(date, -1))}
      >
        <Ico.ChevL />
      </button>
      <button
        className="date-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Ico.Cal size={13} />
        <span>{fmtDateNav(date)}</span>
        <Ico.ChevD size={11} />
      </button>
      <button
        className="nav-arr"
        type="button"
        onClick={() => onChange(shiftDate(date, 1))}
      >
        <Ico.ChevR />
      </button>
      {open && (
        <CalendarPopup
          value={date}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <>
      <div
        style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: "#e5e7eb",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
          padding: "16px 20px 18px",
          background: "#1e3a40",
        }}
      >
        <div>
          <p
            style={{
              color: "rgba(255,255,255,.55)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </p>
          <p
            style={{
              marginTop: 3,
              color: "#fff",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            {title}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            border: "none",
            borderRadius: "50%",
            background: "rgba(255,255,255,.12)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          <Ico.X />
        </button>
      </div>
    </>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "9px 12px",
        border: "1px solid #e5eaeb",
        borderRadius: 10,
        background: "#f8fafb",
      }}
    >
      <p
        style={{
          color: "#9ca3af",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".07em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <p
        style={{
          marginTop: 3,
          color: "#1e3a40",
          fontSize: 13,
          fontWeight: 700,
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function DetailModal({
  appointment,
  onClose,
  onStatusChange,
  onGoToBill,
  onReschedule,
}: {
  appointment: Appointment;
  onClose: () => void;
  onStatusChange: (
    id: string,
    locCode: string,
    status: Appointment["status"],
  ) => void;
  onGoToBill: (appointment: Appointment) => void;
  onReschedule: (appointment: Appointment) => void;
}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        className="modal-box slide-up"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <ModalHeader
          title={`Booking ${appointment.bookingID}`}
          subtitle="Appointment Detail"
          onClose={onClose}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "18px 20px 28px",
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <StatusBadge status={appointment.status} />
            <ModeBadge mode={appointment.mode} />
            {appointment.gender && (
              <span className="badge b-pre">
                {appointment.gender.toUpperCase()}
              </span>
            )}
            <span className="badge b-pre">{appointment.location}</span>
            {appointment.guests.length > 1 && (
              <span className="badge b-wlk">
                <Ico.Users /> {appointment.guests.length} guests
              </span>
            )}
          </div>

          {appointment.serviceNames.length > 1 && (
            <div
              style={{
                padding: "10px 14px",
                border: "1px solid #c8dce0",
                borderRadius: 10,
                background: "#f0f8f9",
              }}
            >
              <p
                style={{
                  marginBottom: 6,
                  color: "#6b7280",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                Services
              </p>
              {appointment.serviceNames.map((service) => (
                <p
                  key={service}
                  style={{
                    marginBottom: 2,
                    color: "#1e3a40",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  • {service}
                </p>
              ))}
            </div>
          )}

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            <InfoBox label="Client" value={appointment.clientName} />
            <InfoBox label="Contact" value={appointment.clientPhone} />
            {appointment.clientEmail && (
              <div style={{ gridColumn: "1 / -1" }}>
                <InfoBox label="Email" value={appointment.clientEmail} />
              </div>
            )}
            <InfoBox label="Date" value={fmtDateLong(appointment.date)} />
            <InfoBox label="Time" value={appointment.timeSlot} />
            <InfoBox label="Provider" value={appointment.providerName} />
            <InfoBox label="Service" value={appointment.serviceName} />
            <InfoBox label="Duration" value={`${appointment.duration} mins`} />
            <InfoBox
              label="Total Price"
              value={`LKR ${appointment.price.toLocaleString()}`}
            />
            <InfoBox
              label="Booked At"
              value={fmtRelTime(appointment.txnDateTime)}
            />
          </div>

          {appointment.notes && appointment.notes.trim() && (
            <div
              style={{
                padding: "10px 14px",
                border: "1px solid #fde68a",
                borderRadius: 10,
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <strong>Notes:</strong> {appointment.notes}
            </div>
          )}

          {appointment.status === "pending" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="modal-action-row">
                <button
                  className="btn-modal-cancel"
                  type="button"
                  onClick={() => {
                    onStatusChange(
                      appointment.bookingID,
                      appointment.locCode,
                      "cancelled",
                    );
                    onClose();
                  }}
                >
                  <Ico.XCircle size={18} /> Cancel
                </button>
                <button
                  className="btn-modal-confirm"
                  type="button"
                  onClick={() => {
                    onStatusChange(
                      appointment.bookingID,
                      appointment.locCode,
                      "confirmed",
                    );
                    onClose();
                  }}
                >
                  <Ico.CheckCircle size={18} /> Confirm
                </button>
              </div>
              <button
                className="btn-modal-reschedule"
                type="button"
                onClick={() => {
                  onReschedule(appointment);
                  onClose();
                }}
              >
                <Ico.Reschedule size={18} /> Reschedule
              </button>
            </div>
          )}

          {appointment.status === "confirmed" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="modal-action-row">
                <button
                  className="btn-modal-cancel"
                  type="button"
                  onClick={() => {
                    onStatusChange(
                      appointment.bookingID,
                      appointment.locCode,
                      "cancelled",
                    );
                    onClose();
                  }}
                >
                  <Ico.XCircle size={18} /> Cancel
                </button>
                <button
                  className="btn-modal-checkin"
                  type="button"
                  onClick={() => {
                    onStatusChange(
                      appointment.bookingID,
                      appointment.locCode,
                      "ongoing",
                    );
                    onClose();
                  }}
                >
                  <Ico.Login size={18} /> Check In
                </button>
              </div>
              <button
                className="btn-modal-reschedule"
                type="button"
                onClick={() => {
                  onReschedule(appointment);
                  onClose();
                }}
              >
                <Ico.Reschedule size={18} /> Reschedule
              </button>
            </div>
          )}

          {appointment.status === "ongoing" && (
            <button
              className="btn-modal-bill"
              type="button"
              onClick={() => {
                onGoToBill(appointment);
                onClose();
              }}
            >
              <Ico.Receipt size={18} /> Go to Bill
            </button>
          )}

          {appointment.status === "cancelled" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  padding: "12px 14px",
                  border: "1px solid #fca5a5",
                  borderRadius: 10,
                  background: "#fef2f2",
                  color: "#991b1b",
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                This booking has been cancelled.
              </div>
              <button
                className="btn-modal-reschedule"
                type="button"
                onClick={() => {
                  onReschedule(appointment);
                  onClose();
                }}
              >
                <Ico.Reschedule size={18} /> Reschedule
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NowLine({ isToday }: { isToday: boolean }) {
  const [minutes, setMinutes] = useState(nowMinutes());

  useEffect(() => {
    const timer = setInterval(() => setMinutes(nowMinutes()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (!isToday) return null;

  const headerHeight = 41;
  const minutesFromStart = minutes - GRID_START_MINUTES;
  const totalMinutes = GRID_ROWS.length * GRID_STEP_MINUTES;

  if (minutesFromStart < 0 || minutesFromStart > totalMinutes) return null;

  return (
    <div
      className="now-line"
      style={{
        top:
          headerHeight + (minutesFromStart / GRID_STEP_MINUTES) * ROW_HEIGHT_PX,
      }}
    >
      <span className="now-label">{minutesToSlotLabel(minutes)}</span>
    </div>
  );
}

interface ScheduleGridProps {
  appointments: Appointment[];
  providers: string[];
  onAppointmentClick: (appointment: Appointment) => void;
  onReschedule: (
    appointment: Appointment,
    provider: string,
    timeSlot: string,
  ) => void;
  onSlotClick: (provider: string, timeSlot: string) => void;
  showToast: (text: string, type?: ToastMsg["type"]) => void;
  isToday: boolean;
}

function ScheduleGrid({
  appointments,
  providers,
  onAppointmentClick,
  onReschedule,
  onSlotClick,
  showToast,
  isToday,
}: ScheduleGridProps) {
  const [dragAppointmentID, setDragAppointmentID] = useState<string | null>(
    null,
  );
  const [dragSpan, setDragSpan] = useState(1);
  const [hoverCell, setHoverCell] = useState<{
    provider: string;
    index: number;
  } | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);

  const occupancy = useMemo(() => {
    const result: Record<
      string,
      Record<
        number,
        { appointment: Appointment; span: number; isStart: boolean }
      >
    > = {};
    providers.forEach((provider) => {
      result[provider] = {};
    });

    appointments.forEach((appointment) => {
      const startMinutes = parseSlotToMinutes(appointment.timeSlot);
      if (startMinutes < GRID_START_MINUTES) return;

      const startIndex = Math.round(
        (startMinutes - GRID_START_MINUTES) / GRID_STEP_MINUTES,
      );
      if (startIndex < 0 || startIndex >= GRID_ROWS.length) return;

      const span = Math.max(
        1,
        Math.ceil(appointment.duration / GRID_STEP_MINUTES),
      );
      const provider = providers.includes(appointment.providerName)
        ? appointment.providerName
        : providers[0] || "";
      if (!provider) return;

      for (
        let index = 0;
        index < span && startIndex + index < GRID_ROWS.length;
        index += 1
      ) {
        if (!result[provider]) result[provider] = {};
        if (!result[provider][startIndex + index]) {
          result[provider][startIndex + index] = {
            appointment,
            span,
            isStart: index === 0,
          };
        }
      }
    });

    return result;
  }, [appointments, providers]);

  const draggedAppointment =
    appointments.find(
      (appointment) => appointment.bookingID === dragAppointmentID,
    ) || null;

  function isRangeFree(
    provider: string,
    startIndex: number,
    span: number,
    excludedID: string,
  ): boolean {
    if (startIndex + span > GRID_ROWS.length) return false;

    for (let index = 0; index < span; index += 1) {
      const cell = occupancy[provider]?.[startIndex + index];
      if (cell && cell.appointment.bookingID !== excludedID) return false;
    }

    return true;
  }

  function handleDragStart(event: React.DragEvent, appointment: Appointment) {
    if (appointment.status === "ongoing") {
      event.preventDefault();
      return;
    }

    setDragAppointmentID(appointment.bookingID);
    setDragSpan(
      Math.max(1, Math.ceil(appointment.duration / GRID_STEP_MINUTES)),
    );
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", appointment.bookingID);
  }

  function handleDragEnd() {
    setDragAppointmentID(null);
    setHoverCell(null);
  }

  function handleFreeDrop(
    event: React.DragEvent,
    provider: string,
    index: number,
  ) {
    event.preventDefault();
    if (!draggedAppointment) return;

    const valid = isRangeFree(
      provider,
      index,
      dragSpan,
      draggedAppointment.bookingID,
    );
    if (!valid) {
      showToast("Cannot drop here — slot occupied", "error");
      handleDragEnd();
      return;
    }

    const timeSlot = minutesToSlotLabel(GRID_ROWS[index]);
    onReschedule(draggedAppointment, provider, timeSlot);
    const key = `${provider}-${index}`;
    setSuccessKey(key);
    setTimeout(() => setSuccessKey(null), 650);
    handleDragEnd();
  }

  if (providers.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-ico">
          <Ico.Inbox />
        </div>
        <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>
          No appointments for this date
        </p>
        <p style={{ color: "#9ca3af", fontSize: 12 }}>
          Bookings you create will appear here
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        overflowX: "auto",
        overflowY: "auto",
      }}
    >
      <NowLine isToday={isToday} />
      <table
        className="sch-tbl"
        style={{ minWidth: providers.length * 160 + 76 }}
      >
        <thead>
          <tr>
            <th>Time</th>
            {providers.map((provider) => (
              <th key={provider}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {provider.charAt(0).toUpperCase()}
                  </div>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {provider}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRID_ROWS.map((rowMinutes, rowIndex) => {
            const timeSlot = minutesToSlotLabel(rowMinutes);
            const majorRow = rowMinutes % 30 === 0;
            const blockIndex = Math.floor(
              (rowMinutes - GRID_START_MINUTES) / 30,
            );
            const blockBackground =
              blockIndex % 2 === 0 ? "#e2ecec" : "#d8e4e4";
            const rowBorder = majorRow
              ? "2px solid rgba(30,58,64,.24)"
              : "1px dashed rgba(30,58,64,.10)";

            return (
              <tr key={timeSlot} style={{ height: ROW_HEIGHT_PX }}>
                <td
                  style={{
                    position: "relative",
                    height: ROW_HEIGHT_PX,
                    borderTop: rowBorder,
                    background: blockBackground,
                  }}
                >
                  {majorRow && (
                    <>
                      <span
                        style={{
                          display: "block",
                          color: "#374151",
                          fontSize: 12,
                          fontWeight: 600,
                          lineHeight: 1,
                        }}
                      >
                        {timeSlot.split(" ")[0]}
                      </span>
                      <span
                        style={{
                          display: "block",
                          marginTop: 2,
                          color: "#9ca3af",
                          fontSize: 9,
                          lineHeight: 1,
                        }}
                      >
                        {timeSlot.split(" ")[1]}
                      </span>
                    </>
                  )}
                </td>

                {providers.map((provider) => {
                  const cell = occupancy[provider]?.[rowIndex];

                  if (cell && cell.isStart) {
                    const appointment = cell.appointment;
                    const locked = appointment.status === "ongoing";
                    const pillClass = `appt-pill pill-${appointment.status}${dragAppointmentID === appointment.bookingID ? " dragging" : ""}${locked ? " locked-pill" : ""}`;
                    const endLabel = minutesToSlotLabel(
                      parseSlotToMinutes(appointment.timeSlot) +
                        appointment.duration,
                    );
                    const invalidHover = Boolean(
                      hoverCell &&
                      hoverCell.provider === provider &&
                      hoverCell.index === rowIndex &&
                      dragAppointmentID &&
                      appointment.bookingID !== dragAppointmentID,
                    );

                    return (
                      <td
                        key={provider}
                        rowSpan={cell.span}
                        className="occ-cell"
                        style={{
                          borderTop: rowBorder,
                          background: blockBackground,
                          ...(invalidHover
                            ? {
                                background: "rgba(239,68,68,.15)",
                                outline: "2px dashed rgba(239,68,68,.5)",
                                outlineOffset: "-2px",
                                cursor: "not-allowed",
                              }
                            : {}),
                        }}
                        onDragOver={(event) => {
                          if (dragAppointmentID) {
                            event.preventDefault();
                            setHoverCell({ provider, index: rowIndex });
                          }
                        }}
                        onDragLeave={() => setHoverCell(null)}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (
                            dragAppointmentID &&
                            appointment.bookingID !== dragAppointmentID
                          )
                            showToast(
                              "Cannot drop — slot already occupied",
                              "error",
                            );
                          handleDragEnd();
                        }}
                      >
                        <button
                          className={pillClass}
                          type="button"
                          draggable={!locked}
                          onDragStart={(event) =>
                            handleDragStart(event, appointment)
                          }
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            if (!dragAppointmentID)
                              onAppointmentClick(appointment);
                          }}
                          title={
                            locked
                              ? "Ongoing appointments are locked"
                              : "Drag to reschedule · Click for details"
                          }
                        >
                          <span className="ap-service">
                            {appointment.status === "ongoing" && (
                              <span className="live-dot-blue" />
                            )}
                            {locked && <Ico.Lock />}
                            {appointment.serviceName.split(",")[0]}
                          </span>
                          <span className="ap-time">
                            {appointment.timeSlot} – {endLabel}
                          </span>
                          <span className="ap-client">
                            {appointment.clientName}
                          </span>
                          <span className="ap-meta">
                            <MiniModeBadge mode={appointment.mode} />
                            <span
                              className="mini-badge"
                              style={{
                                background: "rgba(0,0,0,.06)",
                                color: "inherit",
                              }}
                            >
                              LKR {appointment.price.toLocaleString()}
                            </span>
                          </span>
                        </button>
                      </td>
                    );
                  }

                  if (cell && !cell.isStart) return null;

                  const key = `${provider}-${rowIndex}`;
                  const isHover = Boolean(
                    hoverCell &&
                    hoverCell.provider === provider &&
                    hoverCell.index === rowIndex,
                  );
                  const valid = draggedAppointment
                    ? isRangeFree(
                        provider,
                        rowIndex,
                        dragSpan,
                        draggedAppointment.bookingID,
                      )
                    : true;
                  let className = "";
                  if (dragAppointmentID)
                    className = isHover
                      ? valid
                        ? "drop-hover-v"
                        : "drop-hover-i"
                      : "";
                  if (successKey === key) className += " drop-success";

                  return (
                    <td
                      key={provider}
                      className={className}
                      style={{
                        cursor: dragAppointmentID ? "default" : "pointer",
                        borderTop: rowBorder,
                        background: blockBackground,
                      }}
                      onDragOver={(event) => {
                        if (dragAppointmentID) {
                          event.preventDefault();
                          setHoverCell({ provider, index: rowIndex });
                        }
                      }}
                      onDragLeave={() => setHoverCell(null)}
                      onDrop={(event) =>
                        handleFreeDrop(event, provider, rowIndex)
                      }
                      onClick={() => {
                        if (!dragAppointmentID) onSlotClick(provider, timeSlot);
                      }}
                      title={
                        dragAppointmentID
                          ? undefined
                          : "Click to book this slot"
                      }
                    >
                      <div
                        style={{ width: "100%", height: "100%", minHeight: 8 }}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentCard({
  appointment,
  onClick,
}: {
  appointment: Appointment;
  onClick: () => void;
}) {
  const endLabel = minutesToSlotLabel(
    parseSlotToMinutes(appointment.timeSlot) + appointment.duration,
  );

  return (
    <div className="appt-card" onClick={onClick}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              overflow: "hidden",
              color: "#1e3a40",
              fontSize: 14,
              fontWeight: 700,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {appointment.serviceName}
          </p>
          <p style={{ marginTop: 1, color: "#6b7280", fontSize: 12 }}>
            {appointment.providerName}
          </p>
          <p style={{ marginTop: 1, color: "#9ca3af", fontSize: 11 }}>
            {appointment.clientName} · {appointment.clientPhone}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <StatusBadge status={appointment.status} />
          <span style={{ color: "#1e3a40", fontSize: 13, fontWeight: 700 }}>
            LKR {appointment.price.toLocaleString()}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            color: "#374151",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Ico.Clock /> {appointment.timeSlot} – {endLabel}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            color: "#6b7280",
            fontSize: 12,
          }}
        >
          <Ico.Loc /> {appointment.location}
        </span>
        <ModeBadge mode={appointment.mode} />
        {appointment.guests.length > 1 && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              color: "#6b7280",
              fontSize: 11,
            }}
          >
            <Ico.Users /> {appointment.guests.length} guests
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#9ca3af", fontSize: 11 }}>
          Booking: {appointment.bookingID}
        </span>
        <span style={{ color: "#9ca3af", fontSize: 11 }}>
          {fmtRelTime(appointment.txnDateTime)}
        </span>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState("calendar");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [date, setDate] = useState(todayISO);
  const [search, setSearch] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [filterMeta, setFilterMeta] = useState<FilterMeta>({
    locations: [],
    categories: [],
    bookingTypes: [],
    technicians: [],
  });
  const [filterLoc, setFilterLoc] = useState("ALL");
  const [filterCat, setFilterCat] = useState("ALL");
  const [filterMode, setFilterMode] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterTech, setFilterTech] = useState("ALL");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const toastCounter = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const isToday = date === todayISO();
  const period = computePeriod(date);

  const showToast = useCallback(
    (text: string, type: ToastMsg["type"] = "info") => {
      const id = ++toastCounter.current;
      setToasts((current) => [...current, { id, text, type }]);
      setTimeout(
        () =>
          setToasts((current) => current.filter((toast) => toast.id !== id)),
        2800,
      );
    },
    [],
  );

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      )
        setNotificationOpen(false);
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      )
        setProfileOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    fetch("/api/appointments?meta=filters")
      .then((response) => response.json())
      .then((json) => {
        if (json.success) {
          setFilterMeta({
            locations: json.locations || [],
            categories: json.categories || [],
            bookingTypes: json.bookingTypes || [],
            technicians: json.technicians || [],
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const fetchAppointments = useCallback(
    async (requestedDate: string, silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({ date: requestedDate });
        if (filterLoc !== "ALL") params.set("locCode", filterLoc);

        const response = await fetch(`/api/appointments?${params.toString()}`);
        const json = await response.json();

        if (!json.success) {
          showToast("Failed to load appointments", "error");
          return;
        }

        const seen = new Set<string>();
        const deduped = (json.data as Appointment[]).filter((appointment) => {
          if (seen.has(appointment.bookingID)) return false;
          seen.add(appointment.bookingID);
          return true;
        });

        setAppointments(deduped);
        setLastFetch(new Date());
      } catch {
        showToast("Network error — could not load appointments", "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filterLoc, showToast],
  );

  useEffect(() => {
    void fetchAppointments(date);
  }, [date, fetchAppointments]);

  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(
      () => void fetchAppointments(date, true),
      60000,
    );
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [date, fetchAppointments]);

  const handleStatusChange = useCallback(
    async (
      bookingID: string,
      locCode: string,
      status: Appointment["status"],
    ) => {
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.bookingID === bookingID
            ? { ...appointment, status }
            : appointment,
        ),
      );
      const labels: Record<string, string> = {
        confirmed: "Appointment confirmed",
        cancelled: "Appointment cancelled",
        ongoing: "Client checked in",
      };
      showToast(
        labels[status] || "Status updated",
        status === "cancelled" ? "error" : "success",
      );

      try {
        const response = await fetch("/api/appointments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingID,
            locCode,
            status,
            updatedBy: "ADMIN",
          }),
        });
        const json = await response.json();
        if (!json.success) {
          await fetchAppointments(date, true);
          showToast("Failed to update status", "error");
        }
      } catch {
        await fetchAppointments(date, true);
        showToast("Network error — status not saved", "error");
      }
    },
    [date, fetchAppointments, showToast],
  );

  const handleDragReschedule = useCallback(
    async (appointment: Appointment, provider: string, timeSlot: string) => {
      setAppointments((current) =>
        current.map((item) =>
          item.bookingID === appointment.bookingID
            ? { ...item, providerName: provider, techID: provider, timeSlot }
            : item,
        ),
      );
      showToast(`Rescheduled to ${timeSlot} · ${provider}`, "success");

      try {
        const response = await fetch("/api/appointments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingID: appointment.bookingID,
            locCode: appointment.locCode,
            date: appointment.date,
            timeSlot,
            techID: provider,
            updatedBy: "ADMIN",
          }),
        });
        const json = await response.json();
        if (!json.success) {
          await fetchAppointments(date, true);
          showToast("Failed to save reschedule", "error");
        }
      } catch {
        await fetchAppointments(date, true);
        showToast("Network error — reschedule not saved", "error");
      }
    },
    [date, fetchAppointments, showToast],
  );

  const handleSlotClick = useCallback(
    (provider: string, timeSlot: string) => {
      const params = new URLSearchParams({
        date,
        timeSlot,
        providerName: provider,
        techID: provider,
        location: filterLoc !== "ALL" ? filterLoc : "",
      });
      router.push(`/appointmentform?${params.toString()}`);
    },
    [date, filterLoc, router],
  );

  const handleReschedule = useCallback(
    (appointment: Appointment) => {
      const params = new URLSearchParams({
        reschedule: "true",
        bookingID: appointment.bookingID,
        locCode: appointment.locCode,
        cusCode: appointment.cusCode,
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone,
        clientEmail: appointment.clientEmail || "",
        providerName: appointment.providerName,
        techID: appointment.techID,
        serviceName: appointment.serviceName,
        serviceNames: appointment.serviceNames.join("||"),
        date: appointment.date,
        timeSlot: appointment.timeSlot,
        duration: String(appointment.duration),
        price: String(appointment.price),
        location: appointment.location,
        locCode2: appointment.locCode,
        status: appointment.status,
        mode: appointment.mode,
        gender: appointment.gender || "",
        notes: appointment.notes || "",
      });
      router.push(`/appointmentform?${params.toString()}`);
    },
    [router],
  );

  const handleGoToBill = useCallback(
    (appointment: Appointment) => {
      const params = new URLSearchParams({
        appointmentId: appointment.bookingID,
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone,
        clientEmail: appointment.clientEmail || "",
        providerName: appointment.providerName,
        serviceName: appointment.serviceName,
        date: appointment.date,
        timeSlot: appointment.timeSlot,
        duration: String(appointment.duration),
        price: String(appointment.price),
        location: appointment.location,
        status: appointment.status,
        mode: appointment.mode,
        gender: appointment.gender || "",
        notes: appointment.notes || "",
      });
      router.push(`/billing?${params.toString()}`);
    },
    [router],
  );

  const filtered = useMemo(
    () =>
      appointments.filter((appointment) => {
        if (
          filterLoc !== "ALL" &&
          appointment.locCode.trim().toUpperCase() !==
            filterLoc.trim().toUpperCase()
        ) {
          return false;
        }

        if (filterStatus !== "ALL" && appointment.status !== filterStatus) {
          return false;
        }

        if (
          filterCat !== "ALL" &&
          !appointment.categoryCodes?.some(
            (code) =>
              code.trim().toUpperCase() === filterCat.trim().toUpperCase(),
          )
        ) {
          return false;
        }

        if (filterMode !== "ALL") {
          // The API returns the real BookingTypeID now. Use it first so a
          // filter such as WI/WALKIN works even when the description changes.
          if (appointment.bookingTypeID) {
            if (
              appointment.bookingTypeID.trim().toUpperCase() !==
              filterMode.trim().toUpperCase()
            ) {
              return false;
            }
          } else {
            const bookingType = filterMeta.bookingTypes.find(
              (item) => item.BooikingTypeID === filterMode,
            );
            if (bookingType) {
              const description = bookingType.BookingTypeDes.toLowerCase();
              const walkIn =
                description.includes("walk") ||
                description.includes("wi") ||
                description.includes("without");
              if (walkIn && appointment.mode !== "without_confirmation") {
                return false;
              }
              if (!walkIn && appointment.mode === "without_confirmation") {
                return false;
              }
            }
          }
        }

        if (filterTech !== "ALL") {
          const technician = filterMeta.technicians.find(
            (item) => item.UserId === filterTech,
          );
          const matchingTechnician = appointment.techIDs?.some(
            (techID) =>
              techID.trim().toUpperCase() === filterTech.trim().toUpperCase(),
          );
          const matchesName =
            appointment.providerName.trim() ===
            (technician?.UserName || "").trim();

          if (
            !matchingTechnician &&
            !matchesName &&
            appointment.techID.trim().toUpperCase() !==
              filterTech.trim().toUpperCase()
          ) {
            return false;
          }
        }

        if (
          search &&
          !`${appointment.clientName} ${appointment.clientPhone} ${appointment.serviceName} ${appointment.providerName}`
            .toLowerCase()
            .includes(search.toLowerCase())
        ) {
          return false;
        }

        return true;
      }),
    [
      appointments,
      filterCat,
      filterLoc,
      filterMeta.bookingTypes,
      filterMeta.technicians,
      filterMode,
      filterStatus,
      filterTech,
      search,
    ],
  );

  const stats: Stats = {
    total: appointments.length,
    confirmed: appointments.filter(
      (appointment) => appointment.status === "confirmed",
    ).length,
    cancelled: appointments.filter(
      (appointment) => appointment.status === "cancelled",
    ).length,
    pending: appointments.filter(
      (appointment) => appointment.status === "pending",
    ).length,
    ongoing: appointments.filter(
      (appointment) => appointment.status === "ongoing",
    ).length,
  };

  const providers = useMemo(() => {
    const activeProviders = new Set(
      filtered.map((appointment) => appointment.providerName).filter(Boolean),
    );
    const allTechnicians = filterMeta.technicians
      .map((technician) => technician.UserName)
      .filter(Boolean);
    return Array.from(new Set([...activeProviders, ...allTechnicians])).sort();
  }, [filtered, filterMeta.technicians]);

  const hasActiveFilters =
    filterLoc !== "ALL" ||
    filterCat !== "ALL" ||
    filterMode !== "ALL" ||
    filterStatus !== "ALL" ||
    filterTech !== "ALL";

  return (
    <>
      <style>{CSS}</style>
      <ToastContainer toasts={toasts} />

      {selected && (
        <DetailModal
          appointment={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(id, locCode, status) => {
            setSelected(null);
            void handleStatusChange(id, locCode, status);
          }}
          onGoToBill={handleGoToBill}
          onReschedule={handleReschedule}
        />
      )}

      <div
        style={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          background: "#c2d4d4",
        }}
      >
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => {
            setNavKey(key);
            router.push(path);
          }}
          onLogout={() => router.push("/admin/login")}
        />

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              height: 56,
              flexShrink: 0,
              gap: 12,
              padding: "0 18px",
              borderBottom: "1px solid rgba(0,0,0,.06)",
              background: "#dae6e6",
              zIndex: 10,
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <span
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 11,
                  display: "flex",
                  transform: "translateY(-50%)",
                  opacity: 0.4,
                  pointerEvents: "none",
                }}
              >
                <Ico.Search />
              </span>
              <input
                className="srch"
                placeholder="Search client, service, provider..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />

            <div ref={notificationRef} style={{ position: "relative" }}>
              <button
                type="button"
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  padding: 4,
                  border: "none",
                  borderRadius: 8,
                  background: "none",
                  color: "#374151",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setNotificationOpen((current) => !current);
                  setProfileOpen(false);
                }}
              >
                <Ico.Bell />
                {stats.pending > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 1,
                      right: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 15,
                      height: 15,
                      padding: "0 3px",
                      border: "2px solid #dae6e6",
                      borderRadius: 99,
                      background: "#ef4444",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  >
                    {stats.pending > 9 ? "9+" : stats.pending}
                  </span>
                )}
              </button>
              {notificationOpen && (
                <NotificationPanel appointments={appointments} />
              )}
            </div>

            <div
              ref={profileRef}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                className="hdr-name"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: "#1f2937",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setProfileOpen((current) => !current);
                  setNotificationOpen(false);
                }}
              >
                MR. SAYO <Ico.ChevD />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setProfileOpen((current) => !current);
                  setNotificationOpen(false);
                }}
              >
                S
              </div>
              {profileOpen && (
                <ProfileMenu onLogout={() => router.push("/admin/login")} />
              )}
            </div>
          </header>

          <div
            className="main-body"
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              gap: 12,
              overflow: "auto",
              padding: "13px 15px",
            }}
          >
            <StatsRow
              stats={stats}
              onNewAppointment={() => router.push("/appointmentform")}
            />

            <div
              className="filters-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <select
                className="f-sel"
                value={filterCat}
                onChange={(event) => setFilterCat(event.target.value)}
              >
                <option value="ALL">All Services</option>
                {filterMeta.categories.map((category) => (
                  <option key={category.CatCode} value={category.CatCode}>
                    {category.CatDes}
                  </option>
                ))}
              </select>
              <select
                className="f-sel"
                value={filterLoc}
                onChange={(event) => setFilterLoc(event.target.value)}
              >
                <option value="ALL">All Branches</option>
                {filterMeta.locations.map((location) => (
                  <option key={location.LocCode} value={location.LocCode}>
                    {location.LocDes}
                  </option>
                ))}
              </select>
              <select
                className="f-sel"
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value)}
              >
                <option value="ALL">All Modes</option>
                {filterMeta.bookingTypes.map((type) => (
                  <option key={type.BooikingTypeID} value={type.BooikingTypeID}>
                    {type.BookingTypeDes}
                  </option>
                ))}
              </select>
              <select
                className="f-sel"
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
              >
                <option value="ALL">All Status</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="ongoing">Ongoing</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                className="f-sel"
                value={filterTech}
                onChange={(event) => setFilterTech(event.target.value)}
              >
                <option value="ALL">All Technicians</option>
                {filterMeta.technicians.map((technician) => (
                  <option key={technician.UserId} value={technician.UserId}>
                    {technician.UserName}
                  </option>
                ))}
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterLoc("ALL");
                    setFilterCat("ALL");
                    setFilterMode("ALL");
                    setFilterStatus("ALL");
                    setFilterTech("ALL");
                  }}
                  style={{
                    padding: "7px 12px",
                    border: "1px solid rgba(239,68,68,.2)",
                    borderRadius: 8,
                    background: "rgba(239,68,68,.08)",
                    color: "#b91c1c",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear Filters
                </button>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginLeft: "auto",
                }}
              >
                {lastFetch && (
                  <span style={{ color: "#9ca3af", fontSize: 11 }}>
                    Updated {fmtRelTime(lastFetch.toISOString())}
                  </span>
                )}
                <button
                  className="refresh-btn"
                  type="button"
                  onClick={() => void fetchAppointments(date, true)}
                >
                  <Ico.Refresh /> {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
                borderRadius: 12,
                background: "#deeaea",
                boxShadow: "0 1px 5px rgba(0,0,0,.08)",
              }}
            >
              <div
                className="toolbar-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  flexShrink: 0,
                  padding: "11px 14px 0",
                }}
              >
                <DateNav date={date} onChange={setDate} />
                <div
                  style={{
                    display: "flex",
                    gap: 2,
                    marginLeft: 4,
                    padding: 3,
                    borderRadius: 8,
                    background: "rgba(0,0,0,.07)",
                  }}
                >
                  <button
                    className={`view-btn${viewMode === "grid" ? " active" : ""}`}
                    type="button"
                    onClick={() => setViewMode("grid")}
                  >
                    ⊞ Grid
                  </button>
                  <button
                    className={`view-btn${viewMode === "list" ? " active" : ""}`}
                    type="button"
                    onClick={() => setViewMode("list")}
                  >
                    ≡ List
                  </button>
                </div>
                {isToday && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      border: "1px solid rgba(239,68,68,.3)",
                      borderRadius: 8,
                      background: "rgba(239,68,68,.1)",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#ef4444",
                        animation: "timelinePulse 2s ease-in-out infinite",
                      }}
                    />
                    <span
                      style={{
                        color: "#dc2626",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      LIVE
                    </span>
                  </div>
                )}
                <div style={{ flex: 1 }} />
                <div
                  style={{
                    display: "flex",
                    gap: 2,
                    flexShrink: 0,
                    padding: "3px 4px",
                    borderRadius: 9,
                    background: "#ccd8d8",
                  }}
                >
                  {(
                    [
                      { label: "Today", days: 0, key: "today" },
                      { label: "Tomorrow", days: 1, key: "tomorrow" },
                      { label: "Day After", days: 2, key: "dayafter" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      className={`period-tab${period === item.key ? " active" : ""}`}
                      type="button"
                      onClick={() => setDate(shiftDate(todayISO(), item.days))}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                style={{
                  height: 1,
                  flexShrink: 0,
                  marginTop: 10,
                  background: "rgba(30,58,64,.1)",
                }}
              />

              {loading ? (
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    flexDirection: "column",
                    gap: 10,
                    overflow: "hidden",
                    padding: 16,
                  }}
                >
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      key={item}
                      className="skeleton"
                      style={{ height: 72, borderRadius: 10 }}
                    />
                  ))}
                </div>
              ) : viewMode === "grid" ? (
                <div
                  className="fade-up"
                  style={{
                    display: "flex",
                    flex: 1,
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <ScheduleGrid
                    appointments={filtered}
                    providers={providers}
                    onAppointmentClick={setSelected}
                    onReschedule={handleDragReschedule}
                    onSlotClick={handleSlotClick}
                    showToast={showToast}
                    isToday={isToday}
                  />
                </div>
              ) : (
                <div
                  className="fade-up"
                  style={{ flex: 1, overflow: "auto", padding: "12px 13px" }}
                >
                  {filtered.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-ico">
                        <Ico.Inbox />
                      </div>
                      <p
                        style={{
                          color: "#6b7280",
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {search
                          ? "No results found"
                          : "No appointments for this date"}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: 12 }}>
                        {search
                          ? "Try different search terms"
                          : "Create a new booking to get started"}
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 9,
                      }}
                    >
                      {filtered.map((appointment) => (
                        <AppointmentCard
                          key={appointment.bookingID}
                          appointment={appointment}
                          onClick={() => setSelected(appointment)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
