// src/app/billing/dashboard/page.tsx
// "Billing Dashboard" — Billing ▸ Billing Dashboard (was "Appointment Dashboard").
//
// Lists every booking the technicians have marked DONE and that still has to be
// billed (tbl_bookingheder.Status = 'DONE' AND BillingTime IS NULL). Selecting a
// row opens the bill screen for that booking.
//
// Route: /billing/dashboard
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";

interface DoneBooking {
  bookingID: string;
  locCode: string;
  cusCode: string;
  clientName: string;
  clientPhone: string;
  date: string;
  timeSlot: string;
  status: string;
  mode: "walkin" | "pre_booked";
  pax: number;
  services: string[];
  techNames: string[];
  total: number;
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
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .fade-up { animation: fadeUp .2s ease both; }
  .pop-in { animation: popIn .18s cubic-bezier(.34,1.56,.64,1) both; }
  .skeleton { background: linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 8px; }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(30,58,64,.2); border-radius: 4px; }

  .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 99px; font-weight: 700; white-space: nowrap; text-transform: uppercase; padding: 3px 9px; font-size: 10px; letter-spacing: .05em; }
  .b-ok { background: rgba(34,197,94,.12); color: #15803d; }
  .b-done { background: rgba(139,92,246,.14); color: #6d28d9; }
  .b-pre { background: rgba(30,58,64,.08); color: #1e3a40; }
  .b-cash { background: rgba(37,99,235,.12); color: #1d4ed8; }
  .live-dot { display: inline-block; width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: #8b5cf6; }

  .srch { width: 260px; height: 40px; padding: 0 14px 0 38px; border: 1.5px solid #c0cbcc; border-radius: 10px; outline: none; background: #fff; color: #1f2937; font-family: 'Inter',sans-serif; font-size: 14px; }
  .srch:focus { border-color: #1e3a40; box-shadow: 0 0 0 3px rgba(30,58,64,.08); }
  .srch::placeholder { color: rgba(0,0,0,.35); }

  .toast { display: flex; align-items: center; gap: 9px; padding: 12px 22px; border-radius: 12px; background: #1e3a40; color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.25); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .toast.success { background: #15803d; }
  .toast.error { background: #b91c1c; }

  .bill-card { display: flex; flex-direction: column; gap: 9px; padding: 14px 15px; border: 1px solid #c8d6d8; border-radius: 12px; background: #fff; transition: box-shadow .18s, transform .15s; }
  .bill-card.clickable { cursor: pointer; }
  .bill-card.clickable:hover { box-shadow: 0 4px 16px rgba(30,58,64,.18); transform: translateY(-1px); }

  .stat-card { position: relative; display: flex; flex: 1 1 0; min-width: 120px; flex-direction: column; gap: 4px; overflow: hidden; padding: 13px 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.05); }
  .stat-card .sc-label { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; opacity: .7; }
  .stat-card .sc-value { color: #1f2937; font-size: 30px; font-weight: 800; line-height: 1.1; }

  .refresh-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1.5px solid rgba(30,58,64,.2); border-radius: 8px; background: rgba(30,58,64,.05); color: #1e3a40; font-family: 'Inter',sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; }
  .bill-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border: none; border-radius: 9px; background: #2563eb; color: #fff; font-family: 'Inter',sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .bill-btn:hover { background: #1d4ed8; }
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
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" />
    </svg>
  ),
  Receipt: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z" />
      <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="16" y2="13" />
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
  Inbox: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
};

function fmtDateLong(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(value: number): string {
  return `LKR ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 999 }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast pop-in ${t.type}`}>{t.text}</div>
      ))}
    </div>
  );
}

export default function BillingDashboardPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState("billing-dashboard");
  const [bookings, setBookings] = useState<DoneBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastCounter = useRef(0);
  /* Why the list could not be loaded — a database that cannot be reached, a
     server that is not running, … shown as a card instead of a bare toast. */
  const [loadError, setLoadError] = useState<
    { message: string; hint: string; host: string } | null
  >(null);

  const showToast = useCallback((text: string, type: ToastMsg["type"] = "info") => {
    const id = ++toastCounter.current;
    setToasts((c) => [...c, { id, text, type }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 2800);
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/billing/dashboard", { cache: "no-store" });
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) {
          /* The API explains a database outage (503 + hint). Keep that text so
             the screen can show why the list is empty instead of pretending
             there is nothing to bill. */
          setLoadError({
            message: json?.message || "Could not load the done bookings",
            hint: json?.hint || "",
            host: json?.host || "",
          });
          setBookings([]);
          return;
        }
        setLoadError(null);
        setBookings(json.data as DoneBooking[]);
      } catch {
        setLoadError({
          message:
            "Could not reach the server. Is the app still running (npm run dev / npm run start)?",
          hint: "Then open /api/health to check the database connection.",
          host: "",
        });
        setBookings([]);
        showToast("Could not load the done bookings", "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /* A bill-screen REVERT pushes a booking back to ONGOING, so it must leave
     this list without a manual Refresh: poll every 20 s and reload as soon as
     the tab is looked at again. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) =>
      `${b.bookingID} ${b.clientName} ${b.clientPhone} ${b.services.join(" ")} ${b.techNames.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [bookings, search]);

  const stats = useMemo(() => {
    const today = todayISO();
    return {
      total: filtered.length,
      today: filtered.filter((b) => b.date === today).length,
      value: filtered.reduce((sum, b) => sum + (Number(b.total) || 0), 0),
    };
  }, [filtered]);

  function openBill(booking: DoneBooking) {
    const params = new URLSearchParams({
      appointmentId: booking.bookingID,
      locCode: booking.locCode,
      clientName: booking.clientName,
      clientPhone: booking.clientPhone,
      providerName: booking.techNames[0] || "",
      serviceName: booking.services.join(", "),
      date: booking.date,
      timeSlot: booking.timeSlot,
      price: String(booking.total),
      location: booking.locCode,
      status: booking.status,
      mode: booking.mode,
    });
    router.push(`/billing?${params.toString()}`);
  }

  return (
    <>
      <style>{CSS}</style>
      <ToastContainer toasts={toasts} />

      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#c2d4d4" }}>
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => {
            setNavKey(key);
            router.push(path);
          }}
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
                placeholder="Search client, booking, service..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                }}
              >
                S
              </div>
              <div className="hdr-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ color: "#1f2937", fontSize: 14, fontWeight: 700 }}>MR. SAYO</span>
                <span style={{ color: "#6b7280", fontSize: 11 }}>Billing</span>
              </div>
            </div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, overflow: "auto", padding: "13px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ color: "#1e3a40", fontSize: 20, fontWeight: 800 }}>Billing Dashboard</h1>
              <span className="badge b-done"><span className="live-dot" /> Technician done · awaiting bill</span>
              <div style={{ flex: 1 }} />
              <button className="refresh-btn" type="button" onClick={() => void load(true)}>
                <Ico.Refresh /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#1e3a40,#2a5260)" }}>
                <div className="sc-label" style={{ color: "rgba(255,255,255,.6)" }}>Pending bills</div>
                <div className="sc-value" style={{ color: "#fff" }}>{stats.total}</div>
                <div style={{ color: "rgba(255,255,255,.45)", fontSize: 10, fontWeight: 500 }}>Work done, not billed</div>
              </div>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid rgba(139,92,246,.25)" }}>
                <div className="sc-label" style={{ color: "#6d28d9" }}><span className="live-dot" /> Done today</div>
                <div className="sc-value" style={{ color: "#4c1d95" }}>{stats.today}</div>
                <div style={{ color: "#7c3aed", fontSize: 10, fontWeight: 500 }}>{fmtDateLong(todayISO())}</div>
              </div>
              <div className="stat-card" style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "1px solid rgba(59,130,246,.3)" }}>
                <div className="sc-label" style={{ color: "#1d4ed8" }}>Value to bill</div>
                <div className="sc-value" style={{ color: "#1e3a8a", fontSize: 22 }}>{fmtMoney(stats.value)}</div>
                <div style={{ color: "#2563eb", fontSize: 10, fontWeight: 500 }}>Services total</div>
              </div>
            </div>

            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <p style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>
                Completed appointments
                <span style={{ color: "#6b7280", fontWeight: 500 }}> · {filtered.length} booking{filtered.length !== 1 ? "s" : ""} waiting for payment</span>
              </p>

              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 104 }} />)}
                </div>
              ) : loadError ? (
                /* The list is empty because something failed — say what, and
                   offer both a retry and the health page. */
                <div className="empty-state" style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
                  <p style={{ color: "#991b1b", fontSize: 14, fontWeight: 700 }}>{loadError.message}</p>
                  {loadError.host && (
                    <p style={{ color: "#7f1d1d", fontSize: 12, fontWeight: 600 }}>
                      Tried the database host: {loadError.host}
                    </p>
                  )}
                  {loadError.hint && (
                    <p style={{ color: "#b45309", fontSize: 12, fontWeight: 600, maxWidth: 460, textAlign: "center" }}>
                      {loadError.hint}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
                    <button className="bill-btn" type="button" onClick={() => void load()}>
                      <Ico.Refresh /> Try again
                    </button>
                    <button
                      className="bill-btn"
                      type="button"
                      onClick={() => window.open("/api/health", "_blank")}
                      title="Shows whether the database can be reached"
                    >
                      Check database
                    </button>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-ico"><Ico.Inbox /></div>
                  <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>No completed work waiting to be billed</p>
                  <p style={{ color: "#9ca3af", fontSize: 12 }}>Appointments appear here the moment a technician marks them Done</p>
                </div>
              ) : (
                filtered.map((b) => (
                  <div
                    key={`${b.locCode}|${b.bookingID}`}
                    className="bill-card clickable fade-up"
                    onClick={() => openBill(b)}
                    role="button"
                    title="Open the bill for this booking"
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ color: "#1e3a40", fontSize: 14, fontWeight: 700 }}>
                          {b.clientName}
                          <span style={{ color: "#9ca3af", fontWeight: 500 }}> · {b.clientPhone || "—"}</span>
                        </p>
                        <p style={{ marginTop: 2, color: "#374151", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b.services.length ? b.services.join(", ") : "Service"}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <span className="badge b-done"><span className="live-dot" /> Done</span>
                        <span style={{ color: "#1e3a40", fontSize: 13, fontWeight: 700 }}>{fmtMoney(Number(b.total) || 0)}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#374151", fontSize: 12, fontWeight: 600 }}>
                        <Ico.Cal size={13} /> {fmtDateLong(b.date)} · {b.timeSlot}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#6b7280", fontSize: 12 }}>
                        <Ico.Loc /> {b.locCode}
                      </span>
                      {b.techNames.length > 0 && (
                        <span className="badge b-pre">Technician: {b.techNames.join(", ")}</span>
                      )}
                      <span className="badge b-pre">{b.mode === "walkin" ? "Walk-in" : "Pre-booked"}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>Booking: {b.bookingID}</span>
                      <button
                        className="bill-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openBill(b);
                        }}
                      >
                        <Ico.Receipt /> Create Bill
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
