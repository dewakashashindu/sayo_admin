// src/app/technician-appointments/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Technician's Appointments" — LIST screen (READ-ONLY).
//
// • Shows ONLY the appointments scheduled for the logged-in technician.
//   Demo: Amali Fernando (see SAMPLE_TECHNICIAN_NAME in @/lib/technicianSample).
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
  getLoggedInTechnicianName,
  isTechnicianAppointment,
  shiftDate,
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
  // Logged-in technician (demo falls back to Amali Fernando).
  const [techName] = useState<string>(() => getLoggedInTechnicianName());
  const [date, setDate] = useState(todayISO);
  const [search, setSearch] = useState("");
  const [appointments, setAppointments] = useState<TechAppointment[]>([]);
  const [techDirectory, setTechDirectory] = useState<FilterTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSample, setUsingSample] = useState(false);
  const [techNotFound, setTechNotFound] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastCounter = useRef(0);

  const showToast = useCallback((text: string, type: ToastMsg["type"] = "info") => {
    const id = ++toastCounter.current;
    setToasts((c) => [...c, { id, text, type }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 2800);
  }, []);

  // Technician directory → resolves display name to canonical UserId.
  useEffect(() => {
    fetch("/api/appointments?meta=filters")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.technicians)) setTechDirectory(j.technicians);
      })
      .catch(() => undefined);
  }, []);

  const fetchAppointments = useCallback(
    async (requestedDate: string, silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        // DB-driven: the API filters by technician server-side (TechID match).
        const params = new URLSearchParams({
          date: requestedDate,
          technician: techName,
        });
        const res = await fetch(`/api/appointments?${params.toString()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setAppointments(json.data as TechAppointment[]);
          setUsingSample(false);
          setTechNotFound(json.technician === null);
        } else {
          throw new Error("bad payload");
        }
      } catch {
        // Fallback: demo data (only when the API/DB is unreachable).
        setAppointments(buildSampleAppointments());
        setUsingSample(true);
        setTechNotFound(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [techName],
  );

  useEffect(() => {
    void fetchAppointments(date);
  }, [date, fetchAppointments]);

  const myUserId = useMemo(() => {
    const found = techDirectory.find(
      (t) => t.UserName.trim().toUpperCase() === techName.trim().toUpperCase(),
    );
    return found?.UserId;
  }, [techDirectory, techName]);

  // Only THIS technician's appointments for the selected date (read-only).
  const mine = useMemo(
    () =>
      appointments.filter((a) => {
        if (a.date !== date) return false;
        if (!isTechnicianAppointment(a, techName, myUserId)) return false;
        if (
          search &&
          !`${a.clientName} ${a.clientPhone} ${a.serviceName}`.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [appointments, date, techName, myUserId, search],
  );

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
            {/* Logged-in technician chip */}
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
                <span style={{ color: "#6b7280", fontSize: 11 }}>Technician</span>
              </div>
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, overflow: "auto", padding: "13px 15px" }}>
            {/* Title + sample banner */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ color: "#1e3a40", fontSize: 20, fontWeight: 800 }}>
                My Appointments
              </h1>
              <span className="badge b-pre">Read-only</span>
              {usingSample && <span className="badge b-wlk">Sample data · {techName}</span>}
              <div style={{ flex: 1 }} />
              <button className="refresh-btn" type="button" onClick={() => void fetchAppointments(date, true)}>
                <Ico.Refresh /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {techNotFound && !usingSample && (
              <div
                className="fade-up"
                style={{
                  padding: "10px 14px", border: "1px solid #fca5a5", borderRadius: 10,
                  background: "#fef2f2", color: "#991b1b", fontSize: 13, fontWeight: 600,
                }}
              >
                Technician “{techName}” was not found in the database — check the name in Staff/User details.
              </div>
            )}

            {/* Stats */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#1e3a40,#2a5260)" }}>
                <div className="sc-label" style={{ color: "rgba(255,255,255,.6)" }}>My Appointments</div>
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
                <span style={{ color: "#6b7280", fontWeight: 500 }}> · {mine.length} appointment{mine.length !== 1 ? "s" : ""} for {techName}</span>
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
                  <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>No appointments for you on this date</p>
                  <p style={{ color: "#9ca3af", fontSize: 12 }}>Scheduled bookings for {techName} will appear here</p>
                </div>
              ) : (
                mine.map((a) => {
                  const clickable = a.status === "ongoing";
                  const cancelled = a.status === "cancelled";
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
                          <Ico.Clock /> {a.timeSlot}
                          {a.duration > 0 && endLabel(a.timeSlot, a.duration) ? ` – ${endLabel(a.timeSlot, a.duration)}` : ""}
                          <span style={{ color: "#9ca3af", fontWeight: 500 }}>({a.duration} min)</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#6b7280", fontSize: 12 }}>
                          <Ico.Loc /> {a.location}
                        </span>
                        <span className="badge b-pre">{a.mode === "without_confirmation" ? "Walk-in" : "Pre-booked"}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ color: "#9ca3af", fontSize: 11 }}>Booking: {a.bookingID}</span>
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
