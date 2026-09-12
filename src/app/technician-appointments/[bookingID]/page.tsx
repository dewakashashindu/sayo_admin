// src/app/technician-appointments/[bookingID]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Technician's Appointments" — DETAIL screen.
// Opened by tapping a CHECKED-IN (ongoing) appointment from the list screen.
//
// Tabs:
//   1. Details        — client info + service + date/time + DONE button
//   2. Recipe         — ingredients (tbl_recipes) for each service in the booking
//   3. Add Technician — view assigned technicians + add helpers (sample UI)
//   4. Remarks        — booking notes + add a remark (sample UI)
//
// Route: /technician-appointments/[bookingID]?locCode=XX&date=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import {
  SAMPLE_RECIPES,
  TechAppointment,
  buildSampleAppointments,
  fmtDateLong,
  getLoggedInTechnicianName,
  todayISO,
} from "@/lib/technicianSample";

type TabKey = "details" | "recipe" | "technician" | "remarks";

interface FilterTechnician {
  UserId: string;
  UserName: string;
  WorkingLocID?: string;
}

interface RecipeRow {
  rowItemCode: string;
  rowItemDes: string;
  masterUnitID?: string;
  subUnitID: string;
  qty: number;
  itemCost: number;
}

interface SubUnit {
  id: string;
  des: string;
}

interface ItemOption {
  code: string;
  locCode: string;
  des: string;
  masterUnitID: string;
  retailPrice: number;
  serviceItem: boolean;
}

interface ServiceRecipe {
  itemCode: string;
  serviceName: string;
  providerName: string;
  startTime: string;
  endTime: string;
  rows: RecipeRow[];
  isSample: boolean;
  /** How many guests/rows share this same service (duplicate-safe display). */
  count: number;
  guessID: string;
  /** Rows came from Tbl_BookingServiceRecipe (what was actually used). */
  fromBooking: boolean;
}

interface ExtrasAddTech {
  guessID: string;
  serviceItemID: string;
  techID: string;
  techName: string;
}

interface ExtrasRecipeRow {
  guessID: string;
  serviceItemID: string;
  rawItemCode: string;
  rawItemDes: string;
  masterUnitID: string;
  subUnitID: string;
  qty: number;
  itemCost: number;
  retailPrice: number;
}

interface ExtrasState {
  checkedIn: boolean;
  billed: boolean;
  status: string;
  addTech: ExtrasAddTech[];
  recipe: ExtrasRecipeRow[];
}

interface ToastMsg {
  id: number;
  text: string;
  type: "success" | "error" | "info";
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: 'Inter', sans-serif; overflow: hidden; }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .fade-up { animation: fadeUp .2s ease both; }
  .skeleton { background: linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 8px; }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(30,58,64,.2); border-radius: 4px; }

  .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 99px; font-weight: 700; white-space: nowrap; text-transform: uppercase; padding: 3px 9px; font-size: 10px; letter-spacing: .05em; }
  .b-ok { background: rgba(34,197,94,.12); color: #15803d; }
  .b-pnd { background: rgba(245,158,11,.12); color: #b45309; }
  .b-can { background: rgba(239,68,68,.1); color: #b91c1c; }
  .b-ong { background: rgba(59,130,246,.12); color: #1d4ed8; }
  .b-pre { background: rgba(30,58,64,.08); color: #1e3a40; }
  .b-wlk { background: rgba(56,178,172,.1); color: #0f766e; }
  .live-dot-blue { display: inline-block; width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: #2563eb; }

  .tab-btn { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 6px; border: none; background: transparent; cursor: pointer; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 3px solid transparent; transition: all .15s; white-space: nowrap; }
  .tab-btn:hover { color: #1e3a40; background: rgba(30,58,64,.04); }
  .tab-btn.active { color: #1e3a40; font-weight: 800; border-bottom-color: #1e3a40; background: rgba(30,58,64,.05); }

  .toast { display: flex; align-items: center; gap: 9px; padding: 12px 22px; border-radius: 12px; background: #1e3a40; color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.25); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .toast.success { background: #15803d; }
  .toast.error { background: #b91c1c; }

  .info-box { padding: 9px 12px; border: 1px solid #e5eaeb; border-radius: 10px; background: #f8fafb; }
  .info-box .ib-label { color: #9ca3af; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
  .info-box .ib-value { margin-top: 3px; color: #1e3a40; font-size: 13px; font-weight: 700; word-break: break-word; }

  .btn-done { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 12px; border: none; border-radius: 12px; background: #1e3a40; color: #fff; font-family: 'Inter',sans-serif; font-size: 15px; font-weight: 800; cursor: pointer; transition: all .18s; }
  .btn-done:hover { background: #16292d; transform: translateY(-1px); }
  .btn-add { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border: none; border-radius: 10px; background: #1e3a40; color: #fff; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .btn-add:hover { background: #16292d; }
  .btn-add:disabled { background: #9ca3af; cursor: not-allowed; }
  .btn-remove { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 8px; background: rgba(239,68,68,.1); color: #b91c1c; cursor: pointer; flex-shrink: 0; }
  .btn-remove:hover { background: rgba(239,68,68,.2); }

  .f-sel { appearance: none; height: 42px; padding: 7px 30px 7px 12px; border: 1.5px solid #c8d6d8; border-radius: 10px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; }
  .f-sel:focus { border-color: #1e3a40; }
  .txt-area { width: 100%; border: 1.5px solid #c8d6d8; border-radius: 10px; padding: 10px 12px; font-family: 'Inter',sans-serif; font-size: 13px; color: #1f2937; outline: none; background: #fff; resize: vertical; line-height: 1.6; }
  .txt-area:focus { border-color: #1e3a40; }

  .recipe-tbl { width: 100%; border-collapse: collapse; }
  .recipe-tbl thead th { background: #1e3a40; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 8px 10px; text-align: left; white-space: nowrap; }
  .recipe-tbl tbody tr { border-bottom: 1px solid #e5eaeb; }
  .recipe-tbl tbody tr:last-child { border-bottom: none; }
  .recipe-tbl td { font-size: 12px; color: #1f2937; padding: 8px 10px; vertical-align: middle; }

  .f-inp { width: 100%; height: 42px; padding: 7px 12px; border: 1.5px solid #c8d6d8; border-radius: 10px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 600; }
  .f-inp:focus { border-color: #1e3a40; }
  .qty-inp { width: 72px; height: 34px; padding: 4px 8px; border: 1.5px solid #c8d6d8; border-radius: 8px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 600; }
  .qty-inp:focus { border-color: #1e3a40; }
  .mini-sel { height: 34px; padding: 4px 6px; border: 1.5px solid #c8d6d8; border-radius: 8px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 600; max-width: 140px; }
  .mini-sel:focus { border-color: #1e3a40; }
  .btn-edit { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border: 1.5px solid #1e3a40; border-radius: 8px; background: #fff; color: #1e3a40; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .btn-edit:hover { background: #f0f8f9; }
  .btn-edit:disabled { opacity: .45; cursor: not-allowed; }
  .btn-save { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: none; border-radius: 8px; background: #15803d; color: #fff; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .btn-save:hover { background: #166534; }
  .btn-save:disabled { background: #9ca3af; cursor: not-allowed; }
  .btn-cancel { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: 1.5px solid #c8d6d8; border-radius: 8px; background: #fff; color: #6b7280; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .btn-cancel:hover { background: #f3f4f6; }
  .suggest-wrap { position: relative; flex: 1; min-width: 0; }
  .suggest-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50; max-height: 220px; overflow: auto; background: #fff; border: 1.5px solid #c8d6d8; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
  .suggest-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: none; border-bottom: 1px solid #f0f4f4; background: #fff; cursor: pointer; text-align: left; font-family: 'Inter',sans-serif; }
  .suggest-item:last-child { border-bottom: none; }
  .suggest-item:hover { background: #f0f8f9; }
  .lock-note { display: flex; align-items: center; gap: 6px; color: #6b7280; font-size: 11px; font-weight: 600; margin-top: 6px; }

  .back-btn { display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; color: #1e3a40; font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 700; padding: 6px 10px; border-radius: 8px; }
  .back-btn:hover { background: rgba(0,0,0,0.05); }

  @media (max-width: 767px) { .main-body { padding-bottom: 72px !important; } .hdr-name { display: none !important; } }
  @media (max-width: 560px) { .tab-btn span.lbl { display: none; } .tab-btn { font-size: 12px; } .info-grid { grid-template-columns: 1fr !important; } }
`;

const Ico = {
  Back: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Doc: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Book: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  Users: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Chat: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Clock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  X: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ongoing")
    return (
      <span className="badge b-ong">
        <span className="live-dot-blue" /> Checked-in
      </span>
    );
  if (status === "confirmed") return <span className="badge b-ok">Confirmed</span>;
  if (status === "cancelled") return <span className="badge b-can">Cancelled</span>;
  return <span className="badge b-pnd">Pending</span>;
}

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div
      style={{
        position: "fixed", bottom: 24, left: "50%", zIndex: 99999,
        display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
        transform: "translateX(-50%)", pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : "ℹ "}
          {t.text}
        </div>
      ))}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-box">
      <p className="ib-label">{label}</p>
      <p className="ib-value">{value || "—"}</p>
    </div>
  );
}

function mapRecipeRow(r: Record<string, unknown>): RecipeRow {
  return {
    rowItemCode: String(r.rowItemCode || ""),
    rowItemDes: String(r.rowItemDes || ""),
    masterUnitID: String(r.masterUnitID || ""),
    subUnitID: String(r.subUnitID || ""),
    qty: Number(r.qty || 0),
    itemCost: Number(r.itemCost || 0),
  };
}

export default function TechnicianAppointmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const bookingID = decodeURIComponent(
    Array.isArray(params.bookingID) ? params.bookingID[0] : (params.bookingID as string) || "",
  );
  const locCode = (searchParams.get("locCode") || "").trim();
  const dateParam = (searchParams.get("date") || "").trim() || todayISO();

  const [techName, setTechName] = useState("");
  const [appt, setAppt] = useState<TechAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [tab, setTab] = useState<TabKey>("details");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastCounter = useRef(0);

  // Recipe tab state
  const [recipes, setRecipes] = useState<ServiceRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  // Add-technician tab state
  const [techDirectory, setTechDirectory] = useState<FilterTechnician[]>([]);
  const [techPick, setTechPick] = useState("");
  const [addedTechs, setAddedTechs] = useState<string[]>([]);
  const [extras, setExtras] = useState<ExtrasState | null>(null);

  // Additions (support techs / used materials) are only editable while the
  // client is checked in and the booking has not been billed yet.
  const canEditExtras =
    !!extras && extras.checkedIn && !extras.billed && appt?.status !== "done";

  // Load per-booking extras (add-tech + used materials) once the booking is known.
  useEffect(() => {
    const bookingID = appt?.bookingID;
    if (!bookingID) return;
    let active = true;
    fetch(`/api/bookings/${encodeURIComponent(bookingID)}/extras`)
      .then((r) => r.json())
      .then((json) => {
        if (!active || !json.success) return;
        setExtras({
          checkedIn: !!json.checkedIn,
          billed: !!json.billed,
          status: String(json.status || ""),
          addTech: Array.isArray(json.addTech) ? json.addTech : [],
          recipe: Array.isArray(json.recipe) ? json.recipe : [],
        });
        const names: string[] = Array.from(
          new Set(
            ((Array.isArray(json.addTech) ? json.addTech : []) as ExtrasAddTech[])
              .map((t) => (t.techName || "").trim())
              .filter(Boolean),
          ),
        );
        setAddedTechs(names);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [appt?.bookingID]);

  // Remarks tab state (booking remark is read-only; customer remark is editable)
  const [newRemark, setNewRemark] = useState("");
  const [custRmks, setCustRmks] = useState<string | null>(null);
  const [custName, setCustName] = useState("");
  const [rmksLoading, setRmksLoading] = useState(false);
  const [rmksSaving, setRmksSaving] = useState(false);

  // Recipe editing state
  const [subUnits, setSubUnits] = useState<SubUnit[]>([]);
  const [editingRecipe, setEditingRecipe] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<RecipeRow[]>([]);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [itemSearching, setItemSearching] = useState(false);

  // Technician name suggest dropdown
  const [showTechSuggest, setShowTechSuggest] = useState(false);

  const showToast = useCallback((text: string, type: ToastMsg["type"] = "info") => {
    const id = ++toastCounter.current;
    setToasts((c) => [...c, { id, text, type }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 2800);
  }, []);

  useEffect(() => {
    setTechName(getLoggedInTechnicianName());
  }, []);

  // Load the single appointment (via the existing day API, then pick by ID).
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // DB-driven + technician-scoped, same as the list screen.
        const p = new URLSearchParams({
          date: dateParam,
          technician: getLoggedInTechnicianName(),
        });
        if (locCode) p.set("locCode", locCode);
        const res = await fetch(`/api/appointments?${p.toString()}`);
        const json = await res.json();
        const list = (json?.data || []) as TechAppointment[];
        const found = list.find(
          (a) =>
            a.bookingID.trim().toUpperCase() === bookingID.trim().toUpperCase() &&
            (!locCode || a.locCode.trim().toUpperCase() === locCode.toUpperCase()),
        );
        if (found) {
          setAppt(found);
          setUsingSample(false);
          return;
        }
        throw new Error("not found in api");
      } catch {
        const sample = buildSampleAppointments().find(
          (a) =>
            a.bookingID.trim().toUpperCase() === bookingID.trim().toUpperCase() &&
            (!locCode || a.locCode.trim().toUpperCase() === locCode.toUpperCase()),
        );
        setAppt(sample || null);
        setUsingSample(true);
      } finally {
        setLoading(false);
      }
    }
    if (bookingID) void load();
  }, [bookingID, locCode, dateParam]);

  // Technician directory for the "Add Technician" tab.
  useEffect(() => {
    fetch("/api/appointments?meta=filters")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.technicians)) {
          setTechDirectory(j.technicians);
        }
      })
      .catch(() => undefined);
  }, []);

  // Load recipes when the Recipe tab opens.
  useEffect(() => {
    if (tab !== "recipe" || !appt) return;
    const current = appt;
    const services = current.serviceSchedule?.length
      ? current.serviceSchedule
      : current.serviceNames.map((name, i) => ({
          serviceIndex: i,
          itemCode: "",
          serviceName: name,
          providerName: current.providerName,
          startTime: current.timeSlot,
          endTime: "",
        }));
    if (services.length === 0) {
      setRecipes([]);
      return;
    }

    let cancelled = false;
    async function loadRecipes() {
      setRecipesLoading(true);
      // A booking can store the same service more than once (one row per
      // guest). Load each unique service only once and show a count instead
      // of fetching + rendering the same recipe many times.
      const uniqueServices: Array<(typeof services)[number] & { count: number }> = [];
      for (const svc of services) {
        const key = (svc.itemCode || `name:${svc.serviceName}`)
          .trim()
          .toUpperCase();
        const existing = uniqueServices.find(
          (entry) =>
            (entry.itemCode || `name:${entry.serviceName}`)
              .trim()
              .toUpperCase() === key,
        );
        if (existing) {
          existing.count += 1;
        } else {
          uniqueServices.push({ ...svc, count: 1 });
        }
      }
      const out: ServiceRecipe[] = [];
      for (const svc of uniqueServices) {
        const sample = svc.itemCode ? SAMPLE_RECIPES[svc.itemCode] : undefined;
        // Try the real API first (needs a real ItemCode + locCode).
        if (svc.itemCode && current.locCode) {
          try {
            const res = await fetch(
              `/api/recipes/${encodeURIComponent(svc.itemCode)}?locCode=${encodeURIComponent(current.locCode)}`,
            );
            const json = await res.json();
            if (Array.isArray(json.subUnits) && json.subUnits.length > 0) {
              setSubUnits(
                (json.subUnits as Array<Record<string, unknown>>).map((u) => ({
                  id: String(u.id || ""),
                  des: String(u.des || ""),
                })),
              );
            }
            if (json.success && Array.isArray(json.rows) && json.rows.length > 0) {
              out.push({
                itemCode: svc.itemCode,
                serviceName: svc.serviceName,
                providerName: svc.providerName,
                startTime: svc.startTime,
                endTime: svc.endTime,
                rows: (json.rows as Array<Record<string, unknown>>).map(mapRecipeRow),
                isSample: false,
                count: svc.count,
                guessID: (svc as { guessID?: string }).guessID?.trim() || "MAIN",
                fromBooking: false,
              });
              continue;
            }
          } catch {
            /* fall through to sample */
          }
        }
        // Fallback: sample recipe (or empty when nothing is known).
        out.push({
          itemCode: svc.itemCode,
          serviceName: svc.serviceName,
          providerName: svc.providerName,
          startTime: svc.startTime,
          endTime: svc.endTime,
          rows: sample ? sample.rows : [],
          isSample: true,
          count: svc.count,
          guessID: (svc as { guessID?: string }).guessID?.trim() || "MAIN",
          fromBooking: false,
        });
      }
      // Overlay what was actually used for THIS booking (saved by the
      // technician after check-in) on top of the default recipe.
      const bookingRows = extras?.recipe ?? [];
      if (bookingRows.length > 0) {
        for (const card of out) {
          const rows = bookingRows.filter(
            (r) => r.serviceItemID.trim() === card.itemCode.trim(),
          );
          if (rows.length > 0) {
            card.rows = rows.map((r) => ({
              rowItemCode: r.rawItemCode,
              rowItemDes: r.rawItemDes,
              masterUnitID: r.masterUnitID,
              subUnitID: r.subUnitID,
              qty: r.qty,
              itemCost: r.itemCost,
            }));
            card.isSample = false;
            card.fromBooking = true;
          }
        }
      }
      if (!cancelled) {
        setRecipes(out);
        setRecipesLoading(false);
      }
    }
    void loadRecipes();
    return () => {
      cancelled = true;
    };
  }, [tab, appt, extras]);

  // Load the customer-master remark (Tbl_CustomerMaster.Rmks) when Remarks opens.
  useEffect(() => {
    if (tab !== "remarks" || !appt || usingSample) return;
    const cus = (appt.cusCode || "").trim();
    if (!cus) return;
    let cancelled = false;
    async function loadRmks() {
      setRmksLoading(true);
      try {
        const res = await fetch(`/api/customers/${encodeURIComponent(cus)}/remarks`);
        const json = await res.json();
        if (!cancelled) {
          if (json.success) {
            setCustRmks(String(json.rmks || ""));
            setCustName(String(json.cusName || ""));
          } else {
            setCustRmks(null);
          }
        }
      } catch {
        if (!cancelled) setCustRmks(null);
      } finally {
        if (!cancelled) setRmksLoading(false);
      }
    }
    void loadRmks();
    return () => {
      cancelled = true;
    };
  }, [tab, appt, usingSample]);

  // Debounced stock-item search for the recipe "add ingredient" picker.
  useEffect(() => {
    if (!editingRecipe) return;
    const q = itemQuery.trim();
    if (!q) {
      setItemOptions([]);
      return;
    }
    const loc = (appt?.locCode || "").trim();
    const t = setTimeout(async () => {
      setItemSearching(true);
      try {
        const p = new URLSearchParams({ q });
        if (loc) p.set("locCode", loc);
        const res = await fetch(`/api/items/search?${p.toString()}`);
        const json = await res.json();
        setItemOptions(Array.isArray(json.items) ? (json.items as ItemOption[]) : []);
      } catch {
        setItemOptions([]);
      } finally {
        setItemSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [itemQuery, editingRecipe, appt]);

  const assignedTechs = useMemo(() => {
    if (!appt) return [];
    const names = (appt.serviceSchedule?.length
      ? appt.serviceSchedule.map((s) => s.providerName)
      : [appt.providerName]
    )
      .map((n) => (n || "").trim())
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [appt]);

  const allTechs = useMemo(() => {
    const names = techDirectory.map((t) => t.UserName.trim()).filter(Boolean);
    // Sample fallback so the dropdown works in demo mode too.
    const fallback = ["Amali Fernando", "Piumi", "Amaya", "Deepika", "Nihara", "Kaveesha"];
    return Array.from(new Set([...names, ...fallback])).sort();
  }, [techDirectory]);

  // Live suggestions while typing a technician name.
  const techSuggestions = useMemo(() => {
    const q = techPick.trim().toUpperCase();
    if (!q) return [];
    return allTechs
      .filter((n) => n.toUpperCase().includes(q) && n.toUpperCase() !== q)
      .slice(0, 8);
  }, [techPick, allTechs]);

  // Persist the supporting-technician set for every service row of the
  // booking (Tbl_BookingServiceItemAddTech).
  async function persistAddTech(names: string[]) {
    if (!appt) return;
    const pairs = Array.from(
      new Set(
        (appt.serviceSchedule ?? [])
          .filter((s) => (s.itemCode || "").trim())
          .map((s) => `${(s.guessID || "MAIN").trim()}|${s.itemCode.trim()}`),
      ),
    ).map((key) => {
      const [guessID, serviceItemID] = key.split("|");
      return { guessID, serviceItemID };
    });
    const addTech = names.flatMap((name) => {
      const tech = techDirectory.find((t) => t.UserName.trim() === name);
      if (!tech) return [];
      return pairs.map((pair) => ({
        ...pair,
        techID: tech.UserId.trim(),
      }));
    });
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(appt.bookingID)}/extras`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addTech }),
        },
      );
      const json = await res.json();
      if (!json.success) {
        showToast(json.message || "Failed to save technicians", "error");
      }
    } catch {
      showToast("Failed to save technicians", "error");
    }
  }

  function handleAddTechnician() {
    const name = techPick.trim();
    if (!name) return;
    if (!canEditExtras) {
      showToast(
        extras?.billed
          ? "Booking is already billed — additions are locked"
          : "Client must be checked in before adding technicians",
        "error",
      );
      return;
    }
    if (assignedTechs.includes(name) || addedTechs.includes(name)) {
      showToast(`${name} is already assigned`, "info");
      return;
    }
    if (!techDirectory.some((t) => t.UserName.trim() === name)) {
      showToast(`${name} was not found in the staff directory`, "error");
      return;
    }
    const next = addedTechs.includes(name) ? addedTechs : [...addedTechs, name];
    setAddedTechs(next);
    setTechPick("");
    void persistAddTech(next);
    showToast(`${name} added as supporting technician`, "success");
  }

  function handleRemoveTechnician(name: string) {
    const next = addedTechs.filter((n) => n !== name);
    setAddedTechs(next);
    if (canEditExtras) void persistAddTech(next);
  }

  // ── Recipe editing ──────────────────────────────────────────────
  function startEditRecipe(svc: ServiceRecipe) {
    setEditingRecipe(svc.itemCode);
    setEditRows(svc.rows.map((r) => ({ ...r })));
    setItemQuery("");
    setItemOptions([]);
  }

  function cancelEditRecipe() {
    setEditingRecipe(null);
    setEditRows([]);
    setItemQuery("");
    setItemOptions([]);
  }

  function updateEditRow(index: number, patch: Partial<RecipeRow>) {
    setEditRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeEditRow(index: number) {
    setEditRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addIngredientRow(item: ItemOption) {
    if (
      editRows.some(
        (r) => r.rowItemCode.trim().toUpperCase() === item.code.trim().toUpperCase(),
      )
    ) {
      showToast("That item is already in the recipe", "info");
      return;
    }
    setEditRows((prev) => [
      ...prev,
      {
        rowItemCode: item.code,
        rowItemDes: item.des,
        masterUnitID: item.masterUnitID,
        subUnitID: "",
        qty: 1,
        itemCost: 0,
      },
    ]);
    setItemQuery("");
    setItemOptions([]);
  }

  async function saveRecipe(svc: ServiceRecipe) {
    const loc = (appt?.locCode || "").trim();
    if (!svc.itemCode || !loc) {
      showToast("Cannot save: missing item code or location", "error");
      return;
    }
    const rows = editRows
      .filter((r) => r.rowItemCode.trim())
      .map((r) => ({
        rowItemCode: r.rowItemCode.trim(),
        masterUnitID: (r.masterUnitID || "").trim(),
        subUnitID: (r.subUnitID || "").trim(),
        qty: Number(r.qty) || 0,
        itemCost: Number(r.itemCost) || 0,
      }));

    // Checked-in & not billed: store what was ACTUALLY used for this booking
    // (Tbl_BookingServiceRecipe) instead of overwriting the default recipe.
    if (canEditExtras && appt) {
      setSavingRecipe(true);
      try {
        const res = await fetch(
          `/api/bookings/${encodeURIComponent(appt.bookingID)}/extras`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipeScope: [
                { guessID: svc.guessID || "MAIN", serviceItemID: svc.itemCode },
              ],
              recipe: rows.map((r) => ({
                guessID: svc.guessID || "MAIN",
                serviceItemID: svc.itemCode,
                rawItemCode: r.rowItemCode,
                masterUnitID: r.masterUnitID,
                subUnitID: r.subUnitID,
                qty: r.qty,
                itemCost: r.itemCost,
              })),
            }),
          },
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "save failed");
        setRecipes((prev) =>
          prev.map((p) =>
            p.itemCode === svc.itemCode && p.guessID === svc.guessID
              ? {
                  ...p,
                  rows: editRows
                    .filter((r) => r.rowItemCode.trim())
                    .map((r) => ({ ...r })),
                  isSample: false,
                  fromBooking: true,
                }
              : p,
          ),
        );
        setEditingRecipe(null);
        setEditRows([]);
        showToast("Saved for this booking", "success");
      } catch {
        showToast("Failed to save booking materials", "error");
      } finally {
        setSavingRecipe(false);
      }
      return;
    }

    setSavingRecipe(true);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(svc.itemCode)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locCode: loc, rows }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "save failed");
      // Re-read from the server so names/costs reflect the DB.
      const g = await fetch(
        `/api/recipes/${encodeURIComponent(svc.itemCode)}?locCode=${encodeURIComponent(loc)}`,
      );
      const gj = await g.json();
      const fresh: RecipeRow[] = Array.isArray(gj.rows)
        ? (gj.rows as Array<Record<string, unknown>>).map(mapRecipeRow)
        : rows.map((r) => ({
            rowItemCode: r.rowItemCode,
            rowItemDes: "",
            masterUnitID: r.masterUnitID,
            subUnitID: r.subUnitID,
            qty: r.qty,
            itemCost: r.itemCost,
          }));
      setRecipes((prev) =>
        prev.map((p) =>
          p.itemCode === svc.itemCode ? { ...p, rows: fresh, isSample: false } : p,
        ),
      );
      setEditingRecipe(null);
      setEditRows([]);
      showToast("Recipe saved", "success");
    } catch {
      showToast("Failed to save recipe", "error");
    } finally {
      setSavingRecipe(false);
    }
  }

  // ── Customer remarks (appended to Tbl_CustomerMaster.Rmks) ─────────────
  async function handleSaveRemark() {
    const text = newRemark.trim();
    if (!text) {
      showToast("Write a remark first", "error");
      return;
    }
    const cus = (appt?.cusCode || "").trim();
    if (!cus || usingSample) {
      showToast("Customer remarks need a real booking", "error");
      return;
    }
    setRmksSaving(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(cus)}/remarks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: text }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "save failed");
      setCustRmks(String(json.rmks || ""));
      setNewRemark("");
      showToast(
        json.truncated
          ? "Remark saved (oldest text trimmed to 400 chars)"
          : "Customer remark saved",
        "success",
      );
    } catch {
      showToast("Failed to save remark", "error");
    } finally {
      setRmksSaving(false);
    }
  }

  async function handleDone() {
    if (!appt) return;
    if (appt.status === "done") return;
    if (!extras?.checkedIn) {
      showToast("Client must be checked in before marking the work done", "error");
      return;
    }
    try {
      const res = await fetch(
        `/api/appointments/${encodeURIComponent(appt.bookingID)}/done`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.success) {
        showToast(json.message || "Failed to mark done", "error");
        return;
      }
      setAppt({ ...appt, status: "done" });
      showToast("Work completed — ready to bill", "success");
      setTimeout(() => router.push("/technician-appointments"), 700);
    } catch {
      showToast("Network error — please try again", "error");
    }
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "details", label: "Details", icon: <Ico.Doc /> },
    { key: "recipe", label: "Recipe", icon: <Ico.Book /> },
    { key: "technician", label: "Add Technician", icon: <Ico.Users /> },
    { key: "remarks", label: "Remarks", icon: <Ico.Chat /> },
  ];

  // A booking can store the same service once per guest. Collapse identical
  // rows (same service, provider and time window) into one row with a count
  // so a multi-guest walk-in does not render as twelve identical lines.
  const detailServices = (() => {
    const source = appt?.serviceSchedule?.length
      ? appt.serviceSchedule
      : (appt?.serviceNames ?? []).map((name, i) => ({
          serviceIndex: i,
          itemCode: "",
          serviceName: name,
          providerName: appt?.providerName ?? "",
          startTime: appt?.timeSlot ?? "",
          endTime: "",
        }));
    const out: {
      key: string;
      serviceName: string;
      providerName: string;
      startTime: string;
      endTime: string;
      count: number;
    }[] = [];
    for (const s of source) {
      const key = [
        s.itemCode ?? "",
        s.serviceName,
        s.providerName,
        s.startTime,
        s.endTime,
      ].join("|");
      const hit = out.find((entry) => entry.key === key);
      if (hit) {
        hit.count += 1;
      } else {
        out.push({
          key,
          serviceName: s.serviceName,
          providerName: s.providerName,
          startTime: s.startTime,
          endTime: s.endTime,
          count: 1,
        });
      }
    }
    return out;
  })();

  return (
    <>
      <style>{CSS}</style>
      <ToastContainer toasts={toasts} />

      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#c2d4d4" }}>
        <AdminSidebar
          active="tech-appointments"
          onNav={(_key, path) => router.push(path)}
          onLogout={() => router.push("/admin-login")}
        />

        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {/* HEADER */}
          <header
            style={{
              display: "flex", alignItems: "center", height: 56, flexShrink: 0,
              gap: 6, padding: "0 14px", borderBottom: "1px solid rgba(0,0,0,.06)",
              background: "#dae6e6", zIndex: 10,
            }}
          >
            <button className="back-btn" type="button" onClick={() => router.push("/technician-appointments")}>
              <Ico.Back /> Back
            </button>
            <div style={{ flex: 1 }} />
            {techName && (
              <div className="hdr-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#1f2937", fontSize: 14, fontWeight: 700 }}>{techName}</span>
                <div
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 34, height: 34, borderRadius: "50%",
                    background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                  }}
                >
                  {techName.trim().charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </header>

          {/* BODY */}
          <div className="main-body" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, overflow: "auto", padding: "13px 15px" }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760, margin: "0 auto", width: "100%" }}>
                <div className="skeleton" style={{ height: 120 }} />
                <div className="skeleton" style={{ height: 52 }} />
                <div className="skeleton" style={{ height: 220 }} />
              </div>
            ) : !appt ? (
              <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center", background: "#deeaea", borderRadius: 12, padding: 32 }}>
                <p style={{ color: "#1e3a40", fontSize: 16, fontWeight: 800 }}>Appointment not found</p>
                <p style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
                  Booking {bookingID} ({locCode || "?"}) could not be loaded.
                </p>
                <button className="btn-add" type="button" style={{ marginTop: 16 }} onClick={() => router.push("/technician-appointments")}>
                  Back to My Appointments
                </button>
              </div>
            ) : (
              <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Client banner */}
                <div
                  className="fade-up"
                  style={{
                    background: "linear-gradient(135deg,#1e3a40,#2a5260)", borderRadius: 12,
                    padding: "16px 18px", display: "flex", alignItems: "center", gap: 12,
                    boxShadow: "0 2px 8px rgba(0,0,0,.12)",
                  }}
                >
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(255,255,255,.15)", color: "#fff",
                      fontSize: 18, fontWeight: 800,
                    }}
                  >
                    {appt.clientName.trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "rgba(255,255,255,.55)", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
                      Booking {appt.bookingID}
                    </p>
                    <p style={{ color: "#fff", fontSize: 18, fontWeight: 800, marginTop: 2 }}>{appt.clientName}</p>
                    <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, marginTop: 2 }}>
                      {appt.serviceName}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                    <StatusBadge status={appt.status} />
                    {usingSample && <span className="badge b-wlk">Sample</span>}
                  </div>
                </div>

                {/* Tabs */}
                <div
                  className="fade-up"
                  style={{
                    background: "#deeaea", borderRadius: 12, overflow: "hidden",
                    boxShadow: "0 1px 5px rgba(0,0,0,.08)",
                  }}
                >
                  <div style={{ display: "flex", borderBottom: "1px solid rgba(30,58,64,.1)", background: "#d5e2e2" }}>
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`tab-btn${tab === t.key ? " active" : ""}`}
                        onClick={() => setTab(t.key)}
                      >
                        {t.icon}
                        <span className="lbl">{t.label}</span>
                      </button>
                    ))}
                  </div>

                  <div style={{ padding: "16px 16px 20px", background: "#fff" }}>
                    {/* ── TAB 1: DETAILS ─────────────────────────────── */}
                    {tab === "details" && (
                      <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <InfoBox label="Client" value={appt.clientName} />
                          <InfoBox label="Contact" value={appt.clientPhone} />
                          {appt.clientEmail && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <InfoBox label="Email" value={appt.clientEmail} />
                            </div>
                          )}
                          <InfoBox label="Date" value={fmtDateLong(appt.date)} />
                          <InfoBox label="Time" value={appt.timeSlot} />
                          <InfoBox label="Location" value={appt.location} />
                          <InfoBox label="Duration" value={`${appt.duration} mins`} />
                          <InfoBox label="Total Price" value={`LKR ${appt.price.toLocaleString()}`} />
                          <InfoBox label="Booking Mode" value={appt.mode === "without_confirmation" ? "Walk-in" : "Pre-booked"} />
                          {appt.gender && <InfoBox label="Gender" value={appt.gender} />}
                          {appt.checkInTime && <InfoBox label="Checked-in At" value={new Date(appt.checkInTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} />}
                        </div>

                        {/* Services + per-service schedule */}
                        <div style={{ padding: "10px 14px", border: "1px solid #c8dce0", borderRadius: 10, background: "#f0f8f9" }}>
                          <p style={{ marginBottom: 6, color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                            Services for this appointment
                          </p>
                          {detailServices.map((s, i, arr) => (
                            <div
                              key={s.key}
                              style={{
                                display: "flex", justifyContent: "space-between", gap: 10,
                                padding: "6px 0",
                                borderBottom: i < arr.length - 1 ? "1px solid #e5eeee" : "none",
                                color: "#1e3a40", fontSize: 13,
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {i + 1}. {s.serviceName}
                                {s.count > 1 && (
                                  <span style={{ color: "#64748b" }}> × {s.count}</span>
                                )}
                                <small style={{ display: "block", color: "#6b7280", fontSize: 11, fontWeight: 500 }}>
                                  {s.providerName}
                                </small>
                              </span>
                              <span style={{ whiteSpace: "nowrap", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                                <Ico.Clock /> {s.startTime}
                                {s.endTime ? ` – ${s.endTime}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>

                        {appt.notes && appt.notes.trim() && (
                          <div style={{ padding: "10px 14px", border: "1px solid #fde68a", borderRadius: 10, background: "#fffbeb", color: "#92400e", fontSize: 13, lineHeight: 1.6 }}>
                            <strong>Notes:</strong> {appt.notes}
                          </div>
                        )}

                        <button
                          className="btn-done"
                          type="button"
                          onClick={handleDone}
                          disabled={appt?.status === "done"}
                          style={
                            appt?.status === "done"
                              ? { opacity: 0.65, cursor: "not-allowed" }
                              : undefined
                          }
                        >
                          <Ico.Check />{" "}
                          {appt?.status === "done" ? "Done — ready to bill" : "Done"}
                        </button>
                      </div>
                    )}

                    {/* ── TAB 2: RECIPE ──────────────────────────────── */}
                    {tab === "recipe" && (
                      <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {!canEditExtras && (
                          <div
                            style={{
                              padding: "10px 14px",
                              border: "1px solid #fde68a",
                              borderRadius: 10,
                              background: "#fffbeb",
                              color: "#92400e",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {extras?.billed
                              ? "This booking is already billed — materials are locked."
                              : appt?.status === "done"
                                ? "Work marked as done — materials are locked."
                                : "Read-only until the client is checked in. After check-in you can record what was actually used."}
                          </div>
                        )}
                        {recipesLoading ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div className="skeleton" style={{ height: 60 }} />
                            <div className="skeleton" style={{ height: 120 }} />
                          </div>
                        ) : recipes.length === 0 ? (
                          <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                            No services found for this appointment.
                          </p>
                        ) : (
                          recipes.map((r, rIdx) => (
                            <div key={`${r.itemCode}-${r.serviceName}-${rIdx}`} style={{ border: "1px solid #c8dce0", borderRadius: 10, overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: "#f0f8f9", borderBottom: "1px solid #c8dce0" }}>
                                <span style={{ color: "#1e3a40", fontSize: 14, fontWeight: 800 }}>{r.serviceName}</span>
                                {r.itemCode && <span className="badge b-pre">{r.itemCode}</span>}
                                {r.isSample && <span className="badge b-wlk">Sample</span>}
                                {r.count > 1 && (
                                  <span className="badge b-pre">× {r.count} guests</span>
                                )}
                                {r.fromBooking && (
                                  <span className="badge b-ok">Used for this booking</span>
                                )}
                                <div style={{ flex: 1 }} />
                                <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600 }}>
                                  {r.startTime}{r.endTime ? ` – ${r.endTime}` : ""} · {r.providerName}
                                </span>
                                {editingRecipe === r.itemCode ? (
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button className="btn-cancel" type="button" onClick={cancelEditRecipe}>
                                      Cancel
                                    </button>
                                    <button
                                      className="btn-save"
                                      type="button"
                                      onClick={() => saveRecipe(r)}
                                      disabled={savingRecipe}
                                    >
                                      {savingRecipe ? "Saving…" : "Save"}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="btn-edit"
                                    type="button"
                                    onClick={() => startEditRecipe(r)}
                                    disabled={usingSample || !r.itemCode || !canEditExtras}
                                    title={
                                      usingSample
                                        ? "Sample mode — connect to the database to edit recipes"
                                        : !r.itemCode
                                          ? "No item code for this service"
                                          : !canEditExtras
                                            ? "Available after client check-in (until billed)"
                                            : "Edit this recipe"
                                    }
                                  >
                                    ✎ Edit
                                  </button>
                                )}
                              </div>
                              {editingRecipe === r.itemCode ? (
                                <div>
                                  {editRows.length === 0 ? (
                                    <p style={{ color: "#9ca3af", fontSize: 12, padding: "14px", textAlign: "center" }}>
                                      No ingredients yet — add the first one below.
                                    </p>
                                  ) : (
                                    <div style={{ overflowX: "auto" }}>
                                      <table className="recipe-tbl">
                                        <thead>
                                          <tr>
                                            <th>Ingredient</th>
                                            <th>Qty</th>
                                            <th>Unit</th>
                                            <th style={{ textAlign: "right" }}>Cost</th>
                                            <th style={{ width: 40 }} />
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {editRows.map((row, i) => {
                                            const unitOpts =
                                              row.subUnitID &&
                                              !subUnits.some((u) => u.id === row.subUnitID)
                                                ? [{ id: row.subUnitID, des: row.subUnitID }, ...subUnits]
                                                : subUnits;
                                            return (
                                              <tr key={`${row.rowItemCode}-${i}`}>
                                                <td>
                                                  <span style={{ fontWeight: 700, color: "#1e3a40" }}>
                                                    {row.rowItemDes || row.rowItemCode}
                                                  </span>
                                                  <small style={{ display: "block", color: "#6b7280", fontSize: 10 }}>
                                                    {row.rowItemCode}
                                                    {row.masterUnitID ? ` · master unit ${row.masterUnitID}` : ""}
                                                  </small>
                                                </td>
                                                <td>
                                                  <input
                                                    className="qty-inp"
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    value={row.qty}
                                                    onChange={(e) =>
                                                      updateEditRow(i, { qty: Number(e.target.value) || 0 })
                                                    }
                                                  />
                                                </td>
                                                <td>
                                                  <select
                                                    className="mini-sel"
                                                    value={row.subUnitID}
                                                    onChange={(e) => updateEditRow(i, { subUnitID: e.target.value })}
                                                  >
                                                    <option value="">— Unit —</option>
                                                    {unitOpts.map((u) => (
                                                      <option key={u.id} value={u.id}>
                                                        {u.des || u.id}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td style={{ textAlign: "right" }}>
                                                  <input
                                                    className="qty-inp"
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    value={row.itemCost}
                                                    onChange={(e) =>
                                                      updateEditRow(i, { itemCost: Number(e.target.value) || 0 })
                                                    }
                                                  />
                                                </td>
                                                <td>
                                                  <button
                                                    className="btn-remove"
                                                    type="button"
                                                    title="Remove line"
                                                    onClick={() => removeEditRow(i)}
                                                  >
                                                    <Ico.X />
                                                  </button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  {/* Add-ingredient picker */}
                                  <div style={{ padding: 12, borderTop: "1px solid #e5eaeb", background: "#f8fafb" }}>
                                    <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                                      Add ingredient
                                    </p>
                                    <div className="suggest-wrap">
                                      <input
                                        className="f-inp"
                                        placeholder="Type item code or name…"
                                        value={itemQuery}
                                        onChange={(e) => setItemQuery(e.target.value)}
                                      />
                                      {itemQuery.trim() && (itemSearching || itemOptions.length > 0) && (
                                        <div className="suggest-list">
                                          {itemSearching && (
                                            <div style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                                              Searching…
                                            </div>
                                          )}
                                          {itemOptions.map((o) => (
                                            <button
                                              key={o.code}
                                              type="button"
                                              className="suggest-item"
                                              onClick={() => addIngredientRow(o)}
                                            >
                                              <span
                                                style={{
                                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                                                  background: "#1e3a40", color: "#fff", fontSize: 11, fontWeight: 700,
                                                }}
                                              >
                                                {(o.des || o.code).charAt(0).toUpperCase()}
                                              </span>
                                              <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: "block", color: "#1e3a40", fontSize: 13, fontWeight: 700 }}>
                                                  {o.des}
                                                </span>
                                                <small style={{ color: "#6b7280", fontSize: 11 }}>
                                                  {o.code}
                                                  {o.masterUnitID ? ` · ${o.masterUnitID}` : ""}
                                                </small>
                                              </span>
                                              {o.serviceItem && <span className="badge b-pre">Service</span>}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : r.rows.length === 0 ? (
                                <p style={{ color: "#9ca3af", fontSize: 12, padding: "14px", textAlign: "center" }}>
                                  No recipe lines found for this service.
                                </p>
                              ) : (
                                <div style={{ overflowX: "auto" }}>
                                  <table className="recipe-tbl">
                                    <thead>
                                      <tr>
                                        <th>Item Code</th>
                                        <th>Ingredient</th>
                                        <th>Qty</th>
                                        <th>Unit</th>
                                        <th style={{ textAlign: "right" }}>Cost</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.rows.map((row, i) => (
                                        <tr key={`${row.rowItemCode}-${i}`}>
                                          <td style={{ fontWeight: 700, color: "#1e3a40" }}>{row.rowItemCode}</td>
                                          <td>{row.rowItemDes || "—"}</td>
                                          <td>{row.qty}</td>
                                          <td>{row.subUnitID || "—"}</td>
                                          <td style={{ textAlign: "right" }}>{row.itemCost.toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* ── TAB 3: ADD TECHNICIAN ──────────────────────── */}
                    {tab === "technician" && (
                      <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {!canEditExtras && (
                          <div
                            style={{
                              padding: "10px 14px",
                              border: "1px solid #fde68a",
                              borderRadius: 10,
                              background: "#fffbeb",
                              color: "#92400e",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {extras?.billed
                              ? "This booking is already billed — technicians are locked."
                              : appt?.status === "done"
                                ? "Work marked as done — technicians are locked."
                                : "Supporting technicians can be added after the client is checked in."}
                          </div>
                        )}
                        <div>
                          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                            Assigned technicians
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {assignedTechs.map((name) => (
                              <span
                                key={name}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 7,
                                  background: "#f0f8f9", border: "1px solid #c0d4d6",
                                  borderRadius: 8, padding: "6px 10px",
                                  color: "#1e3a40", fontSize: 13, fontWeight: 700,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 22, height: 22, borderRadius: "50%",
                                    background: "#1e3a40", color: "#fff", fontSize: 10,
                                  }}
                                >
                                  {name.charAt(0).toUpperCase()}
                                </span>
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>

                        {addedTechs.length > 0 && (
                          <div>
                            <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                              Added helpers (this session)
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {addedTechs.map((name) => (
                                <div
                                  key={name}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    background: "#f0fdf4", border: "1px solid rgba(34,197,94,.3)",
                                    borderRadius: 8, padding: "7px 10px",
                                    color: "#14532d", fontSize: 13, fontWeight: 700,
                                  }}
                                >
                                  <span style={{ flex: 1 }}>{name}</span>
                                  <button
                                    className="btn-remove"
                                    type="button"
                                    title="Remove"
                                    onClick={() => handleRemoveTechnician(name)}
                                  >
                                    <Ico.X />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{ height: 1, background: "#eef2f2" }} />

                        <div>
                          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                            Add another technician
                          </p>
                          <div style={{ display: "flex", gap: 8 }}>
                            <div className="suggest-wrap">
                              <input
                                className="f-inp"
                                placeholder="Type technician name…"
                                value={techPick}
                                onChange={(e) => {
                                  setTechPick(e.target.value);
                                  setShowTechSuggest(true);
                                }}
                                onFocus={() => setShowTechSuggest(true)}
                                onBlur={() => setTimeout(() => setShowTechSuggest(false), 150)}
                              />
                              {showTechSuggest && techSuggestions.length > 0 && (
                                <div className="suggest-list">
                                  {techSuggestions.map((name) => (
                                    <button
                                      key={name}
                                      type="button"
                                      className="suggest-item"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        setTechPick(name);
                                        setShowTechSuggest(false);
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                                          background: "#1e3a40", color: "#fff", fontSize: 11, fontWeight: 700,
                                        }}
                                      >
                                        {name.charAt(0).toUpperCase()}
                                      </span>
                                      <span style={{ color: "#1e3a40", fontSize: 13, fontWeight: 700 }}>
                                        {name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button className="btn-add" type="button" onClick={handleAddTechnician} disabled={!techPick.trim()}>
                              <Ico.Plus /> Add
                            </button>
                          </div>
                          <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 6 }}>
                            Sample UI — saving to the server will be wired when the supporting-technician API is ready.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ── TAB 4: REMARKS ─────────────────────────────── */}
                    {tab === "remarks" && (
                      <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                            Booking remark
                          </p>
                          {appt.notes && appt.notes.trim() ? (
                            <div style={{ padding: "10px 14px", border: "1px solid #fde68a", borderRadius: 10, background: "#fffbeb", color: "#92400e", fontSize: 13, lineHeight: 1.6 }}>
                              {appt.notes}
                            </div>
                          ) : (
                            <p style={{ color: "#9ca3af", fontSize: 12 }}>No remark was added at booking time.</p>
                          )}
                          <p className="lock-note">🔒 Added at booking time — cannot be changed here.</p>
                        </div>

                        <div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                            <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                              About this customer{custName ? ` — ${custName}` : ""}
                            </p>
                            <div style={{ flex: 1 }} />
                            {custRmks !== null && (
                              <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                                {custRmks.length}/400
                              </span>
                            )}
                          </div>
                          {usingSample ? (
                            <p style={{ color: "#9ca3af", fontSize: 12 }}>
                              Sample mode — customer remarks need a real booking.
                            </p>
                          ) : rmksLoading ? (
                            <div className="skeleton" style={{ height: 60 }} />
                          ) : custRmks === null ? (
                            <p style={{ color: "#9ca3af", fontSize: 12 }}>
                              Could not load customer remarks.
                            </p>
                          ) : custRmks ? (
                            <div style={{ padding: "10px 14px", border: "1px solid #c8dce0", borderRadius: 10, background: "#f0f8f9", color: "#1e3a40", fontSize: 13, lineHeight: 1.6 }}>
                              {custRmks}
                            </div>
                          ) : (
                            <p style={{ color: "#9ca3af", fontSize: 12 }}>
                              No remarks about this customer yet — add the first one below.
                            </p>
                          )}
                        </div>

                        <div style={{ height: 1, background: "#eef2f2" }} />

                        <div>
                          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                            Add a customer remark
                          </p>
                          <textarea
                            className="txt-area"
                            rows={3}
                            placeholder="e.g. Sensitive skin — use mild products only…"
                            value={newRemark}
                            onChange={(e) => setNewRemark(e.target.value)}
                            disabled={usingSample || rmksSaving}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <button
                              className="btn-add"
                              type="button"
                              onClick={handleSaveRemark}
                              disabled={usingSample || rmksSaving || !newRemark.trim()}
                            >
                              {rmksSaving ? "Saving…" : "Save Remark"}
                            </button>
                          </div>
                          <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 6 }}>
                            Saved to the customer record — appended after any existing remarks (max 400 chars).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
