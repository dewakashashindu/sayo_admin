// src/app/technician-appointments/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Technician's Appointments" — LIST screen (READ-ONLY).
//
// • Shows the appointments of the technician this screen is used by. The
//   identity is resolved from ?technician= → the signed-in staff user →
//   this device → "All technicians" (see the resolution effect below).
// • "All technicians" is a real, labelled answer: it lists the whole day, so a
//   booking that the BILL screen pushed back from DONE to ONGOING (REVERT)
//   can never be hidden here by a name that does not match.
// • The list refreshes itself (20 s poll + whenever the tab is looked at), so a
//   revert done on another screen appears without pressing Refresh.
// • No edit / confirm / cancel / reschedule actions on this screen.
// • ONLY checked-in (ongoing) appointments are clickable → opens the detail
//   screen at /technician-appointments/[bookingID].
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import {
  SAMPLE_TECHNICIAN_NAME,
  TechAppointment,
  buildSampleAppointments,
  fmtDateLong,
  fmtDateNav,
  isTechnicianAppointment,
  readSavedTechnicianName,
  shiftDate,
  technicianIdentityMatches,
  todayISO,
} from "@/lib/technicianSample";

interface FilterTechnician {
  UserId: string;
  UserName: string;
  WorkingLocID?: string;
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
  @keyframes popIn { from { opacity: 0; transform: scale(.95) translateY(-6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes livePulseBlue { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,.45); } 70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .fade-up { animation: fadeUp .2s ease both; }
  .pop-in { animation: popIn .18s cubic-bezier(.34,1.56,.64,1) both; }
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

  .srch { width: 260px; height: 40px; padding: 0 14px 0 38px; border: 1.5px solid #c0cbcc; border-radius: 10px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 14px; }
  .srch:focus { border-color: #1e3a40; box-shadow: 0 0 0 3px rgba(30,58,64,.08); }
  .srch::placeholder { color: rgba(0,0,0,.35); }

  .nav-arr, .date-trigger, .period-tab { border: none; background: transparent; cursor: pointer; font-family: 'Inter',sans-serif; }
  .nav-arr { display: flex; align-items: center; padding: 5px 6px; border-radius: 7px; color: #1e3a40; }
  .nav-arr:hover, .date-trigger:hover { background: rgba(30,58,64,.08); }
  .date-trigger { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 8px; color: #1f2937; font-size: 15px; font-weight: 600; white-space: nowrap; cursor: default; }
  .period-tab { padding: 6px 14px; border-radius: 7px; color: #4b5563; font-size: 12px; font-weight: 500; white-space: nowrap; }
  .period-tab.active { background: #1e3a40; color: #fff; font-weight: 700; box-shadow: 0 1px 4px rgba(30,58,64,.35); }

  .toast { display: flex; align-items: center; gap: 9px; padding: 12px 22px; border-radius: 12px; background: #1e3a40; color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.25); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .toast.success { background: #15803d; }
  .toast.error { background: #b91c1c; }

  .tech-card { display: flex; flex-direction: column; gap: 9px; padding: 14px 15px; border: 1px solid #c8d6d8; border-radius: 12px; background: #fff; transition: box-shadow .18s, transform .15s; }
  .tech-card.clickable { cursor: pointer; border-color: rgba(59,130,246,.45); animation: livePulseBlue 2s infinite; }
  .tech-card.clickable:hover { box-shadow: 0 4px 16px rgba(37,99,235,.25); transform: translateY(-1px); }
  .tech-card.locked { opacity: .92; }
  .tech-card.cancelled-card { opacity: .6; background: #f8fafb; }

  .stat-card { position: relative; display: flex; flex: 1 1 0; min-width: 120px; flex-direction: column; gap: 4px; overflow: hidden; padding: 13px 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.05); }
  .stat-card .sc-label { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; opacity: .7; }
  .stat-card .sc-value { color: #1f2937; font-size: 30px; font-weight: 800; line-height: 1.1; }

  .refresh-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1.5px solid rgba(30,58,64,.2); border-radius: 8px; background: rgba(30,58,64,.05); color: #1e3a40; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; }
  .tech-pick { max-width: 200px; padding: 6px 9px; border: 1.5px solid rgba(30,58,64,.2); border-radius: 8px; background: #fff; color: #1e3a40; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #9ca3af; }
  .empty-ico { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: rgba(30,58,64,.08); }

  @media (max-width: 767px) { .main-body { padding-bottom: 72px !important; } .hdr-name { display: none !important; } }
  @media (max-width: 640px) { .toolbar-row { align-items: stretch !important; flex-direction: column; } .srch { width: 100% !important; } }
`;

const Ico = {
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ChevL: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevR: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Clock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Loc: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Cal: ({ size = 13 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Lock: ({ size = 11 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" />
    </svg>
  ),
  Inbox: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  Open: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
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
  if (status === "confirmed")
    return (
      <span className="badge b-ok">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
        Confirmed
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="badge b-can">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
        Cancelled
      </span>
    );
  return (
    <span className="badge b-pnd">
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
      Pending
    </span>
  );
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

function endLabel(timeSlot: string, duration: number): string {
  const m = timeSlot.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2]);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  const total = h * 60 + min + duration;
  const h24 = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${period}`;
}

export default function TechnicianAppointmentsPage() {
  const router = useRouter();
  /* Whose list is this? Resolved from ?technician= → the signed-in staff user
     → the name saved on this device → ALL. ALL is the safe default: it lists
     every technician's bookings of the day, which is exactly what makes a
     reverted booking impossible to hide. */
  const [techChoice, setTechChoice] = useState<string>("ALL");
  const [choiceResolved, setChoiceResolved] = useState(false);
  const [autoAll, setAutoAll] = useState(false);
  const [serverFiltered, setServerFiltered] = useState(false);
  const [techMissing, setTechMissing] = useState(false);
  const [dayRows, setDayRows] = useState(0);
  const [lastSync, setLastSync] = useState("");
  const [date, setDate] = useState(todayISO);
  const [search, setSearch] = useState("");
  const [appointments, setAppointments] = useState<TechAppointment[]>([]);
  const [techDirectory, setTechDirectory] = useState<FilterTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSample, setUsingSample] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastCounter = useRef(0);

  const showToast = useCallback((text: string, type: ToastMsg["type"] = "info") => {
    const id = ++toastCounter.current;
    setToasts((c) => [...c, { id, text, type }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 2800);
  }, []);

  // Technician directory → resolves a name to the canonical UserId.
  useEffect(() => {
    fetch("/api/appointments?meta=filters")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.technicians)) setTechDirectory(j.technicians);
      })
      .catch(() => undefined);
  }, []);

  /* ── who is this screen for? ──────────────────────────────────────────────
     1. ?technician=<UserId|name> in the URL (support / review),
     2. the signed-in staff user, when Staff/User details knows them,
     3. the technician saved on this device (older builds),
     4. ALL — the whole day. A technician name that matches nothing therefore
        shows the day's bookings instead of an empty screen. */
  useEffect(() => {
    if (choiceResolved || techDirectory.length === 0) return;
    let cancelled = false;

    const finish = (choice: string) => {
      if (cancelled) return;
      setTechChoice(choice);
      setChoiceResolved(true);
    };

    const savedChoice = () => {
      const saved = readSavedTechnicianName();
      const match = techDirectory.find((t) => technicianIdentityMatches(t, saved));
      return match ? match.UserId : "ALL";
    };

    if (typeof window !== "undefined") {
      const fromUrl = new URLSearchParams(window.location.search).get("technician") || "";
      const match = techDirectory.find((t) => technicianIdentityMatches(t, fromUrl));
      if (match) {
        finish(match.UserId);
        return;
      }
    }

    fetch("/api/auth/admin-me")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const me = (json?.user || {}) as { userId?: string; name?: string };
        const mine = techDirectory.find(
          (t) =>
            technicianIdentityMatches(t, me.userId || "") ||
            technicianIdentityMatches(t, me.name || ""),
        );
        finish(mine ? mine.UserId : savedChoice());
      })
      .catch(() => finish(savedChoice()));

    return () => {
      cancelled = true;
    };
  }, [techDirectory, choiceResolved]);

  const selectedTech = useMemo(
    () => techDirectory.find((t) => t.UserId === techChoice),
    [techDirectory, techChoice],
  );
  const chosenName = selectedTech?.UserName || techChoice;
  const viewAll = techChoice === "ALL" || autoAll;
  const techName = viewAll ? "All technicians" : chosenName;
  const myUserId = viewAll ? undefined : techChoice;

  const fetchAppointments = useCallback(
    async (requestedDate: string, silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        // DB-driven. The API narrows the day to this technician (TechID,
        // supporting technicians, provider name) — and without the parameter
        // it returns the whole day, which is what "All technicians" shows.
        const params = new URLSearchParams({ date: requestedDate });
        if (!viewAll) params.set("technician", chosenName);
        const res = await fetch(`/api/appointments?${params.toString()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setAppointments(json.data as TechAppointment[]);
          setUsingSample(false);
          const rowsOnDay = Number(json.dayRowCount ?? json.data.length) || 0;
          setServerFiltered(Boolean(json.filteredByTechnician));
          // "Not in Staff/User details" only when the day really has bookings.
          setTechMissing(!viewAll && !json.filteredByTechnician && rowsOnDay > 0);
          setDayRows(rowsOnDay);
          setLastSync(new Date().toLocaleTimeString());
        } else {
          throw new Error("bad payload");
        }
      } catch {
        // Fallback: demo data (only when the API/DB is unreachable).
        setAppointments(buildSampleAppointments());
        setUsingSample(true);
        setServerFiltered(false);
        setTechMissing(false);
        setDayRows(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [viewAll, chosenName],
  );

  useEffect(() => {
    void fetchAppointments(date);
  }, [date, fetchAppointments]);

  // Re-evaluate the fallback for every date.
  useEffect(() => {
    setAutoAll(false);
  }, [date]);

  /* The bill screen can push a booking back from DONE to ONGOING while this
     screen is open: keep the list fresh (20 s poll) and refresh again as soon
     as the tab is looked at, so no manual Refresh is needed after a revert. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchAppointments(date, true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [date, fetchAppointments]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") void fetchAppointments(date, true);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [date, fetchAppointments]);

  // Which rows belong to the selected technician? When the API already narrowed
  // the day its answer is trusted; otherwise the same matcher is applied here.
  const mine = useMemo(
    () =>
      appointments.filter((a) => {
        if (a.date !== date) return false;
        if (!viewAll && !serverFiltered && !isTechnicianAppointment(a, techName, myUserId))
          return false;
        if (
          search &&
          !`${a.clientName} ${a.clientPhone} ${a.serviceName}`.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [appointments, date, viewAll, serverFiltered, techName, myUserId, search],
  );

  /* A technician with nothing on this date must not stare at an empty screen
     while the day has bookings (a reverted booking sits on that day): fall back
     to the whole day once and say so. */
  useEffect(() => {
    if (
      choiceResolved &&
      !viewAll &&
      !loading &&
      !autoAll &&
      mine.length === 0 &&
      dayRows > 0
    ) {
      setAutoAll(true);
    }
  }, [choiceResolved, viewAll, loading, autoAll, mine, dayRows]);

  const stats = useMemo(
    () => ({
      total: mine.length,
      ongoing: mine.filter((a) => a.status === "ongoing").length,
      confirmed: mine.filter((a) => a.status === "confirmed").length,
      pending: mine.filter((a) => a.status === "pending").length,
    }),
    [mine],
  );

  function openDetail(a: TechAppointment) {
    if (a.status !== "ongoing") {
      showToast("Only checked-in appointments can be opened", "info");
      return;
    }
    const params = new URLSearchParams({
      locCode: a.locCode,
      date: a.date,
    });
    router.push(`/technician-appointments/${encodeURIComponent(a.bookingID)}?${params.toString()}`);
  }

  const isToday = date === todayISO();
  const period =
    date === todayISO() ? "today" : date === shiftDate(todayISO(), 1) ? "tomorrow" : date === shiftDate(todayISO(), 2) ? "dayafter" : "";

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
              gap: 12, padding: "0 18px", borderBottom: "1px solid rgba(0,0,0,.06)",
              background: "#dae6e6", zIndex: 10,
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: "50%", left: 11, display: "flex", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}>
                <Ico.Search />
              </span>
              <input
                className="srch"
                placeholder="Search client, service..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            {/* Whose list is this? Always visible, always switchable. */}
            <select
              className="tech-pick"
              value={viewAll ? "ALL" : techChoice}
              onChange={(e) => {
                setAutoAll(false);
                setTechChoice(e.target.value);
              }}
              title="Whose appointments to show"
            >
              <option value="ALL">All technicians</option>
              {techDirectory.map((t) => (
                <option key={t.UserId} value={t.UserId}>
                  {t.UserName}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              <div className="hdr-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ color: "#1f2937", fontSize: 14, fontWeight: 700 }}>{techName}</span>
                <span style={{ color: "#6b7280", fontSize: 11 }}>
                  {viewAll ? "Whole day" : "Technician"}
                </span>
              </div>
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, overflow: "auto", padding: "13px 15px" }}>
            {/* Title + sample banner */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ color: "#1e3a40", fontSize: 20, fontWeight: 800 }}>
                {viewAll ? "Appointments — All Technicians" : "My Appointments"}
              </h1>
              <span className="badge b-pre">Read-only</span>
              {usingSample && (
                <span className="badge b-wlk">Sample data · {SAMPLE_TECHNICIAN_NAME}</span>
              )}
              <div style={{ flex: 1 }} />
              {lastSync && (
                <span className="hdr-name" style={{ color: "#6b7280", fontSize: 11, fontWeight: 600 }}>
                  Updated {lastSync}
                </span>
              )}
              <button className="refresh-btn" type="button" onClick={() => void fetchAppointments(date, true)}>
                <Ico.Refresh /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {techMissing && !usingSample && (
              <div
                className="fade-up"
                style={{
                  padding: "10px 14px", border: "1px solid #fcd34d", borderRadius: 10,
                  background: "#fffbeb", color: "#92400e", fontSize: 13, fontWeight: 600,
                }}
              >
                “{chosenName}” is not in Staff/User details — showing every booking of the day instead.
              </div>
            )}
            {autoAll && !techMissing && !usingSample && (
              <div
                className="fade-up"
                style={{
                  padding: "10px 14px", border: "1px solid #bfdbfe", borderRadius: 10,
                  background: "#eff6ff", color: "#1e40af", fontSize: 13, fontWeight: 600,
                }}
              >
                No bookings for {chosenName} on this date — showing all technicians. Pick a name
                on the right to narrow the list again.
              </div>
            )}

            {/* Stats */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#1e3a40,#2a5260)" }}>
                <div className="sc-label" style={{ color: "rgba(255,255,255,.6)" }}>
                  {viewAll ? "All Technicians" : "My Appointments"}
                </div>
                <div className="sc-value" style={{ color: "#fff" }}>{stats.total}</div>
                <div style={{ color: "rgba(255,255,255,.45)", fontSize: 10, fontWeight: 500 }}>{fmtDateNav(date)}</div>
              </div>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "1px solid rgba(59,130,246,.3)" }}>
                <div className="sc-label" style={{ color: "#1d4ed8" }}><span className="live-dot-blue" /> Checked-in</div>
                <div className="sc-value" style={{ color: "#1e3a8a" }}>{stats.ongoing}</div>
                <div style={{ color: "#2563eb", fontSize: 10, fontWeight: 500 }}>Tap to open</div>
              </div>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid rgba(34,197,94,.25)" }}>
                <div className="sc-label" style={{ color: "#15803d" }}>Confirmed</div>
                <div className="sc-value" style={{ color: "#14532d" }}>{stats.confirmed}</div>
                <div style={{ color: "#16a34a", fontSize: 10, fontWeight: 500 }}>Upcoming</div>
              </div>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "1px solid rgba(245,158,11,.3)" }}>
                <div className="sc-label" style={{ color: "#b45309" }}>Pending</div>
                <div className="sc-value" style={{ color: "#78350f" }}>{stats.pending}</div>
                <div style={{ color: "#d97706", fontSize: 10, fontWeight: 500 }}>Awaiting confirmation</div>
              </div>
            </div>

            {/* Date toolbar */}
            <div
              className="toolbar-row"
              style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                background: "#deeaea", borderRadius: 12, padding: "10px 14px",
                boxShadow: "0 1px 5px rgba(0,0,0,.08)",
              }}
            >
              <button className="nav-arr" type="button" onClick={() => setDate(shiftDate(date, -1))}>
                <Ico.ChevL />
              </button>
              <span className="date-trigger">
                <Ico.Cal size={13} />
                <span>{fmtDateNav(date)}</span>
              </span>
              <button className="nav-arr" type="button" onClick={() => setDate(shiftDate(date, 1))}>
                <Ico.ChevR />
              </button>
              {isToday && (
                <span className="badge b-ong" style={{ marginLeft: 4 }}>
                  <span className="live-dot-blue" /> Today
                </span>
              )}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 2, flexShrink: 0, padding: "3px 4px", borderRadius: 9, background: "#ccd8d8" }}>
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

            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <p style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>
                {fmtDateLong(date)}
                <span style={{ color: "#6b7280", fontWeight: 500 }}>
                  {" "}· {mine.length} appointment{mine.length !== 1 ? "s" : ""}{" "}
                  {viewAll ? "across all technicians" : `for ${techName}`}
                </span>
              </p>

              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 96 }} />
                  ))}
                </div>
              ) : mine.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-ico"><Ico.Inbox /></div>
                  <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>
                    {viewAll
                      ? "No appointments on this date"
                      : `No appointments for ${chosenName} on this date`}
                  </p>
                  <p style={{ color: "#9ca3af", fontSize: 12 }}>
                    {viewAll
                      ? "Bookings scheduled for this date will appear here"
                      : "Bookings for this technician will appear here"}
                  </p>
                  {!viewAll && dayRows > 0 && (
                    <button
                      className="refresh-btn"
                      type="button"
                      onClick={() => setTechChoice("ALL")}
                    >
                      Show all technicians
                    </button>
                  )}
                </div>
              ) : (
                mine.map((a) => {
                  const clickable = a.status === "ongoing";
                  const cancelled = a.status === "cancelled";
                  /* Same time as inside the booking: the scheduled service
                     window, falling back to the header label. */
                  const startLabel = a.scheduleStartTime || a.timeSlot;
                  const endLabelText =
                    a.scheduleEndTime ||
                    (a.duration > 0 ? endLabel(startLabel, a.duration) : "");
                  return (
                    <div
                      key={`${a.locCode}|${a.bookingID}`}
                      className={`tech-card fade-up${clickable ? " clickable" : " locked"}${cancelled ? " cancelled-card" : ""}`}
                      onClick={() => openDetail(a)}
                      role={clickable ? "button" : undefined}
                      title={clickable ? "Open appointment" : "Opens after check-in"}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ color: "#1e3a40", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.serviceName}
                          </p>
                          <p style={{ marginTop: 2, color: "#374151", fontSize: 13, fontWeight: 600 }}>
                            {a.clientName}
                            <span style={{ color: "#9ca3af", fontWeight: 500 }}> · {a.clientPhone || "—"}</span>
                          </p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <StatusBadge status={a.status} />
                          <span style={{ color: "#1e3a40", fontSize: 13, fontWeight: 700 }}>
                            LKR {a.price.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#374151", fontSize: 12, fontWeight: 600 }}>
                          <Ico.Clock /> {startLabel}
                          {endLabelText ? ` – ${endLabelText}` : ""}
                          <span style={{ color: "#9ca3af", fontWeight: 500 }}>({a.duration} min)</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#6b7280", fontSize: 12 }}>
                          <Ico.Loc /> {a.location}
                        </span>
                        <span className="badge b-pre">{a.mode === "without_confirmation" ? "Walk-in" : "Pre-booked"}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ color: "#9ca3af", fontSize: 11 }}>
                          Booking: {a.bookingID}
                          {a.providerName ? ` · ${a.providerName}` : ""}
                        </span>
                        {clickable ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>
                            Tap to open <Ico.Open />
                          </span>
                        ) : cancelled ? (
                          <span style={{ color: "#b91c1c", fontSize: 11, fontWeight: 600 }}>Cancelled</span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                            <Ico.Lock /> Opens after check-in
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
