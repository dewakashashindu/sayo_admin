"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UserName from "@/components/UserName";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import { useMyAccess } from "@/lib/useMyAccess";
import { logoutAdmin } from "@/lib/logout";
import NoAccess from "@/components/NoAccess";
import AccessLoading from "@/components/AccessLoading";
import { serviceLifecycleBadge } from "@/lib/serviceStatus";

interface BillingService {
  serviceIndex: number;
  itemCode: string;
  guessID: string;
  serviceName: string;
  providerName: string;
  techID: string;
  qty: number;
  price: number;
  lineTotal: number;
  startTime: string;
  endTime: string;
  checkedIn: boolean;
  done: boolean;
  cancelled: boolean;
  status: "cancelled" | "done" | "ongoing" | "confirmed";
}
interface BillingGuest {
  guessID: string;
  label: string;
  checkedIn: boolean;
  cancelled: boolean;
  doneTotal: number;
  services: BillingService[];
}
interface BillingBooking {
  bookingID: string;
  locCode: string;
  cusCode: string;
  clientName: string;
  clientPhone: string;
  date: string;
  status: string;
  mode: string;
  pax: number;
  doneTotal: number;
  grandTotal: number;
  doneCount: number;
  totalCount: number;
  guests: BillingGuest[];
}
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
  billed?: boolean;
  billedAt?: string;
  billNo?: string;
}

type DashTab = "pending" | "completed";
interface ToastMsg { id: number; text: string; type: "success" | "error" | "info" }

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: 'Inter', sans-serif; overflow: hidden; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(5px);} to { opacity: 1; transform: none;} }
  @keyframes popIn { from { opacity: 0; transform: scale(.95) translateY(-6px);} to { opacity: 1; transform: scale(1) translateY(0);} }
  @keyframes shimmer { 0% { background-position: 200% 0;} 100% { background-position: -200% 0;} }
  .fade-up { animation: fadeUp .2s ease both; }
  .pop-in { animation: popIn .18s cubic-bezier(.34,1.56,.64,1) both; }
  .skeleton { background: linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 8px; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(30,58,64,.2); border-radius: 4px; }

  .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 99px; font-weight: 700; white-space: nowrap; text-transform: uppercase; padding: 3px 9px; font-size: 10px; letter-spacing: .05em; }
  .b-green { background: rgba(34,197,94,.12); color: #15803d; }
  .b-blue { background: rgba(59,130,246,.12); color: #1d4ed8; }
  .b-violet { background: rgba(139,92,246,.14); color: #6d28d9; }
  .b-red { background: rgba(239,68,68,.12); color: #b91c1c; }
  .b-pre { background: rgba(30,58,64,.08); color: #1e3a40; }

  .dash-tabs { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border-radius: 10px; background: rgba(30,58,64,.08); }
  .dash-tab { border: none; background: transparent; cursor: pointer; padding: 7px 14px; border-radius: 8px; color: #4b5563; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .dash-tab.active { background: #1e3a40; color: #fff; font-weight: 700; }
  .dash-tab .count { display: inline-flex; min-width: 18px; justify-content: center; margin-left: 6px; padding: 0 6px; border-radius: 99px; background: rgba(30,58,64,.12); color: #1e3a40; font-size: 11px; font-weight: 800; }
  .dash-tab.active .count { background: rgba(255,255,255,.18); color: #fff; }

  .srch { width: 260px; height: 40px; padding: 0 14px 0 38px; border: 1.5px solid #c0cbcc; border-radius: 10px; outline: none; background: #fff; color: #1f2937; font-size: 14px; }
  .srch::placeholder { color: rgba(0,0,0,.35); }
  .toast { display: flex; align-items: center; gap: 9px; padding: 12px 22px; border-radius: 12px; background: #1e3a40; color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; }
  .toast.success { background: #15803d; } .toast.error { background: #b91c1c; }

  .acc { border: 1px solid #c8d6d8; border-radius: 12px; background: #fff; overflow: hidden; }
  .acc-hdr { display: flex; align-items: center; gap: 10px; width: 100%; padding: 13px 15px; border: none; background: #fff; cursor: pointer; text-align: left; }
  .acc-hdr:hover { background: #f6fafb; }
  .acc-body { border-top: 1px solid #e2ecef; background: #fbfdfd; padding: 12px 15px; display: flex; flex-direction: column; gap: 12px; }
  .chev { transition: transform .18s; flex-shrink: 0; color: #6b7280; }
  .chev.open { transform: rotate(180deg); }

  .guest-sec { border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; overflow: hidden; }
  .guest-hdr { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(30,58,64,.05); font-size: 12px; font-weight: 700; color: #1e3a40; }
  .svc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 9px 12px; border-top: 1px solid #eef3f4; }
  .svc-row.cancelled { opacity: .55; background: #fef2f2; }

  .btn { border: none; border-radius: 8px; padding: 6px 11px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: 'Inter',sans-serif; }
  .btn.cancel { background: rgba(239,68,68,.1); color: #b91c1c; }
  .btn.cancel:hover { background: rgba(239,68,68,.2); }
  .btn.resched { background: rgba(37,99,235,.1); color: #1d4ed8; }
  .btn.resched:hover { background: rgba(37,99,235,.2); }
  .bill-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 15px; border: none; border-radius: 9px; background: #2563eb; color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .bill-btn:hover { background: #1d4ed8; }
  .bill-btn:disabled { opacity: .5; cursor: not-allowed; }
  .bill-btn.ghost { background: #fff; color: #1e3a40; border: 1.5px solid rgba(30,58,64,.25); }
  .refresh-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1.5px solid rgba(30,58,64,.2); border-radius: 8px; background: rgba(30,58,64,.05); color: #1e3a40; font-size: 12px; font-weight: 600; cursor: pointer; }
  .stat-card { position: relative; display: flex; flex: 1 1 0; min-width: 120px; flex-direction: column; gap: 4px; overflow: hidden; padding: 13px 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.05); }
  .stat-card .sc-label { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; opacity: .7; }
  .stat-card .sc-value { color: #1f2937; font-size: 30px; font-weight: 800; line-height: 1.1; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #9ca3af; }
  .empty-ico { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: rgba(30,58,64,.08); }
  @media (max-width: 767px) { .main-body { padding-bottom: 88px !important; } .hdr-name { display: none !important; } .srch { width: min(100%,220px) !important; } }
`;

const Ico = {
  Search: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>),
  Refresh: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>),
  Receipt: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/></svg>),
  Clock: () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>),
  Chev: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>),
  Inbox: () => (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>),
};

function fmtMoney(v: number): string {
  return `LKR ${v.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDateLong(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function todayISO(): string { return new Date().toISOString().split("T")[0]; }

function StatusBadge({ status }: { status: BillingService["status"] }) {
  const badge = serviceLifecycleBadge(status);
  const cls = badge.tone === "red" ? "b-red" : badge.tone === "violet" ? "b-violet" : badge.tone === "blue" ? "b-blue" : "b-green";
  return <span className={`badge ${cls}`}>{badge.label}</span>;
}

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 999 }}>
      {toasts.map((t) => <div key={t.id} className={`toast pop-in ${t.type}`}>{t.text}</div>)}
    </div>
  );
}

export default function BillingDashboardPage() {
  const router = useRouter();
  const { loaded, enforce, has } = useMyAccess();
  const [navKey, setNavKey] = useState("billing-dashboard");
  const [tab, setTab] = useState<DashTab>("pending");
  const [bookings, setBookings] = useState<BillingBooking[]>([]);
  const [completed, setCompleted] = useState<DoneBooking[]>([]);
  const [migrationPending, setMigrationPending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /* Flexible partial billing: the set of DONE service rows the cashier has
     ticked. Only the ticked services go onto the generated bill. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toastCounter = useRef(0);

  const showToast = useCallback((text: string, type: ToastMsg["type"] = "info") => {
    const id = ++toastCounter.current;
    setToasts((c) => [...c, { id, text, type }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, doneRes] = await Promise.all([
        fetch("/api/billing/services", { cache: "no-store" }),
        fetch("/api/billing/dashboard", { cache: "no-store" }),
      ]);
      const svcJson = await svcRes.json().catch(() => null);
      const doneJson = await doneRes.json().catch(() => null);
      if (svcJson?.success) {
        setBookings(Array.isArray(svcJson.bookings) ? svcJson.bookings : []);
        setMigrationPending(!!svcJson.migrationPending);
      } else setBookings([]);
      setCompleted(Array.isArray(doneJson?.completed) ? doneJson.completed : []);
    } catch {
      showToast("Could not load the billing dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) =>
      `${b.bookingID} ${b.clientName} ${b.clientPhone} ${b.guests.map((g) => g.services.map((s) => s.serviceName).join(" ")).join(" ")}`
        .toLowerCase().includes(q),
    );
  }, [bookings, search]);

  const stats = useMemo(() => ({
    total: filtered.length,
    doneValue: filtered.reduce((s, b) => s + b.doneTotal, 0),
    doneServices: filtered.reduce((s, b) => s + b.doneCount, 0),
  }), [filtered]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ---- partial-billing selection helpers ---- */
  const svcKey = (b: BillingBooking, s: BillingService) =>
    `${b.bookingID}|${s.guessID}|${s.serviceIndex}|${s.itemCode}`;
  const doneServicesOf = (b: BillingBooking) =>
    b.guests.flatMap((g) => g.services).filter((s) => s.status === "done");
  const activeCountOf = (b: BillingBooking) =>
    b.guests
      .flatMap((g) => g.services)
      .filter((s) => s.status === "ongoing" || s.status === "confirmed").length;
  function setMany(keys: string[], on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      keys.forEach((k) => (on ? n.add(k) : n.delete(k)));
      return n;
    });
  }
  function toggleSvc(b: BillingBooking, s: BillingService) {
    const k = svcKey(b, s);
    setMany([k], !selected.has(k));
  }
  function toggleGuest(b: BillingBooking, g: BillingGuest) {
    const keys = g.services.filter((s) => s.status === "done").map((s) => svcKey(b, s));
    if (keys.length === 0) return;
    setMany(keys, !keys.every((k) => selected.has(k)));
  }
  function toggleAllDone(b: BillingBooking) {
    const keys = doneServicesOf(b).map((s) => svcKey(b, s));
    if (keys.length === 0) return;
    setMany(keys, !keys.every((k) => selected.has(k)));
  }
  const selectedDoneOf = (b: BillingBooking) =>
    doneServicesOf(b).filter((s) => selected.has(svcKey(b, s)));

  async function actOnService(b: BillingBooking, s: BillingService, action: "cancel" | "uncancel") {
    const key = `${b.bookingID}|${s.serviceIndex}|${s.itemCode}`;
    setBusy(key);
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(b.bookingID)}/service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, guessID: s.guessID, itemCode: s.itemCode, serviceIndex: s.serviceIndex }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        showToast(action === "cancel" ? `${s.serviceName} cancelled` : `${s.serviceName} restored`, "success");
        await load();
      } else showToast(json?.message || "Action failed", "error");
    } catch {
      showToast("Could not reach the server", "error");
    } finally { setBusy(null); }
  }

  function reschedule(b: BillingBooking, s: BillingService) {
    const params = new URLSearchParams({ reschedule: "true", bookingID: b.bookingID, locCode: b.locCode, date: b.date, serviceIndex: String(s.serviceIndex) });
    router.push(`/appointmentform?${params.toString()}`);
  }

  /* Bill ONLY the ticked services — the price and the service list on the
     /billing screen are built from the selected subset, not the whole done
     total, so partial / per-guest bills are possible. */
  function createBill(b: BillingBooking, chosen: BillingService[]) {
    const params = new URLSearchParams({
      appointmentId: b.bookingID,
      locCode: b.locCode,
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      providerName: chosen[0]?.providerName || "",
      serviceName: chosen.map((s) => s.serviceName).join(", "),
      date: b.date,
      price: String(chosen.reduce((t, s) => t + s.lineTotal, 0)),
      location: b.locCode,
      status: b.status,
      mode: b.mode,
    });
    router.push(`/billing?${params.toString()}`);
  }

  if (!loaded) return (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}><AccessLoading /></div>);
  if (enforce && !(has("BILLGRP", "ACCESS") && has("BILLDASH", "ACCESS"))) return <NoAccess screen="the Billing Dashboard" />;
  const canCreateBill = !enforce || has("BILLDASH", "CREATE_BILL");

  return (
    <>
      <style>{CSS}</style>
      <ToastContainer toasts={toasts} />
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#c2d4d4" }}>
        <AdminSidebar active={navKey} onNav={(k, p) => { setNavKey(k); router.push(p); }} onLogout={() => { void logoutAdmin().finally(() => router.push("/admin-login")); }} />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <header style={{ display: "flex", alignItems: "center", height: 56, flexShrink: 0, gap: 12, padding: "0 18px", borderBottom: "1px solid rgba(0,0,0,.06)", background: "#dae6e6", zIndex: 10 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: "50%", left: 11, display: "flex", transform: "translateY(-50%)", opacity: .4, pointerEvents: "none" }}><Ico.Search /></span>
              <input className="srch" placeholder="Search client, booking, service..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div style={{ flex: 1 }} />
            <div className="hdr-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
              <span style={{ color: "#1f2937", fontSize: 14, fontWeight: 700 }}><UserName /></span>
              <span style={{ color: "#6b7280", fontSize: 11 }}>Billing</span>
            </div>
          </header>

          <div className="main-body" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, overflow: "auto", padding: "13px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ color: "#1e3a40", fontSize: 20, fontWeight: 800 }}>Billing Dashboard</h1>
              <div className="dash-tabs" role="tablist">
                <button type="button" className={`dash-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>To bill<span className="count">{bookings.length}</span></button>
                <button type="button" className={`dash-tab ${tab === "completed" ? "active" : ""}`} onClick={() => setTab("completed")}>Completed<span className="count">{completed.length}</span></button>
              </div>
              <div style={{ flex: 1 }} />
              <button className="refresh-btn" type="button" onClick={() => void load()}><Ico.Refresh /> Refresh</button>
            </div>

            {migrationPending && tab === "pending" && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12.5, fontWeight: 600 }}>
                Per-service Done/Cancel columns are not in the database yet — run <code>scripts/migrate-add-service-status-mysql.sql</code> in phpMyAdmin to unlock them.
              </div>
            )}

            {tab === "pending" ? (
              <>
                <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
                  <div className="stat-card" style={{ background: "linear-gradient(135deg,#1e3a40,#2a5260)" }}>
                    <div className="sc-label" style={{ color: "rgba(255,255,255,.6)" }}>Bookings on floor</div>
                    <div className="sc-value" style={{ color: "#fff" }}>{stats.total}</div>
                  </div>
                  <div className="stat-card" style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid rgba(139,92,246,.25)" }}>
                    <div className="sc-label" style={{ color: "#6d28d9" }}>Done services</div>
                    <div className="sc-value" style={{ color: "#4c1d95" }}>{stats.doneServices}</div>
                  </div>
                  <div className="stat-card" style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "1px solid rgba(59,130,246,.3)" }}>
                    <div className="sc-label" style={{ color: "#1d4ed8" }}>Ready to bill</div>
                    <div className="sc-value" style={{ color: "#1e3a8a", fontSize: 22 }}>{fmtMoney(stats.doneValue)}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {loading ? (
                    [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 70 }} />)
                  ) : filtered.length === 0 ? (
                    <div className="empty-state"><div className="empty-ico"><Ico.Inbox /></div><p style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>No bookings on the floor</p></div>
                  ) : (
                    filtered.map((b) => {
                      const id = `${b.locCode}|${b.bookingID}`;
                      const open = expanded.has(id);
                      const chosen = selectedDoneOf(b);
                      const selectedTotal = chosen.reduce((t, s) => t + s.lineTotal, 0);
                      const allDone = doneServicesOf(b);
                      const activeCount = activeCountOf(b);
                      const billBlocked = activeCount > 0;
                      const billDisabled = billBlocked || chosen.length === 0;
                      return (
                        <div key={id} className="acc fade-up">
                          <button type="button" className="acc-hdr" onClick={() => toggle(id)} aria-expanded={open}>
                            <span className={`chev ${open ? "open" : ""}`}><Ico.Chev /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ color: "#1e3a40", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {b.clientName}<span style={{ color: "#9ca3af", fontWeight: 500 }}> · {b.clientPhone || "—"}</span>
                              </p>
                              <p style={{ marginTop: 1, color: "#6b7280", fontSize: 11.5, fontWeight: 600 }}>Booking: {b.bookingID} · {b.doneCount}/{b.totalCount} done</p>
                            </div>
                            <span className="badge b-pre">{b.guests.length > 1 ? `${b.guests.length} guests` : "Single"}</span>
                            <span style={{ color: "#1e3a40", fontSize: 13.5, fontWeight: 800 }}>{fmtMoney(b.doneTotal)}</span>
                          </button>

                          {open && (
                            <div className="acc-body">
                              {b.guests.map((g) => (
                                <div key={g.guessID} className="guest-sec">
                                  <div className="guest-hdr">
                                    {g.services.some((s) => s.status === "done") && (
                                      <input
                                        type="checkbox"
                                        aria-label={`Select all done services of ${g.label}`}
                                        checked={g.services.filter((s) => s.status === "done").every((s) => selected.has(svcKey(b, s)))}
                                        onChange={() => toggleGuest(b, g)}
                                        style={{ width: 15, height: 15, accentColor: "#6d28d9", cursor: "pointer", flexShrink: 0 }}
                                      />
                                    )}
                                    {g.label}
                                    {g.checkedIn && <span className="badge b-blue">Checked-in</span>}
                                    {g.cancelled && <span className="badge b-red">Cancelled</span>}
                                    <span style={{ marginLeft: "auto", color: "#6d28d9", fontWeight: 800 }}>{fmtMoney(g.doneTotal)}</span>
                                  </div>
                                  {g.services.map((s) => (
                                    <div key={`${s.serviceIndex}|${s.itemCode}`} className={`svc-row ${s.cancelled ? "cancelled" : ""}`}>
                                      {s.status === "done" && (
                                        <input
                                          type="checkbox"
                                          aria-label={`Select ${s.serviceName} for billing`}
                                          checked={selected.has(svcKey(b, s))}
                                          onChange={() => toggleSvc(b, s)}
                                          style={{ width: 15, height: 15, accentColor: "#6d28d9", cursor: "pointer", flexShrink: 0 }}
                                        />
                                      )}
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ color: "#1e3a40", fontSize: 13, fontWeight: 700, textDecoration: s.cancelled ? "line-through" : "none" }}>
                                          {s.serviceName}{s.qty > 1 ? ` × ${s.qty}` : ""}
                                        </p>
                                        <p style={{ color: "#6b7280", fontSize: 11.5 }}>
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Ico.Clock /> {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}</span> · {s.providerName}
                                        </p>
                                      </div>
                                      <span style={{ color: "#1e3a40", fontSize: 13, fontWeight: 700 }}>{fmtMoney(s.lineTotal)}</span>
                                      <StatusBadge status={s.status} />
                                      {(s.status === "ongoing" || s.status === "confirmed") && (
                                        <>
                                          <button className="btn cancel" disabled={busy !== null} onClick={() => void actOnService(b, s, "cancel")}>Cancel</button>
                                          <button className="btn resched" onClick={() => reschedule(b, s)}>Reschedule</button>
                                        </>
                                      )}
                                      {s.cancelled && (
                                        <button className="btn resched" disabled={busy !== null} onClick={() => void actOnService(b, s, "uncancel")}>Restore</button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ))}

                              {billBlocked && (
                                <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12, fontWeight: 600 }}>
                                  {activeCount} service{activeCount > 1 ? "s" : ""} still on-going — the technician must mark them
                                  Done (or Cancel them) before a bill can be created.
                                </div>
                              )}

                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#374151", fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
                                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: allDone.length ? "pointer" : "default", color: "#1e3a40" }}>
                                    <input
                                      type="checkbox"
                                      aria-label="Select all done services"
                                      checked={allDone.length > 0 && chosen.length === allDone.length}
                                      onChange={() => toggleAllDone(b)}
                                      disabled={allDone.length === 0}
                                      style={{ width: 15, height: 15, accentColor: "#6d28d9", cursor: "pointer" }}
                                    />
                                    Select all done
                                  </label>
                                  <span>
                                    Selected: <strong style={{ color: "#6d28d9" }}>{fmtMoney(selectedTotal)}</strong>
                                    <span style={{ color: "#9ca3af", fontWeight: 500 }}> · {chosen.length}/{allDone.length} done</span>
                                  </span>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>full value {fmtMoney(b.grandTotal)}</span>
                                </div>
                                {canCreateBill && (
                                  <button
                                    className="bill-btn"
                                    disabled={billDisabled}
                                    onClick={() => createBill(b, chosen)}
                                    title={
                                      billBlocked
                                        ? "On-going services must be done or cancelled first"
                                        : chosen.length === 0
                                          ? "Tick the services to bill"
                                          : `Bill the ${chosen.length} selected service(s)`
                                    }
                                  >
                                    <Ico.Receipt /> Create Bill
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {completed.length === 0 ? (
                  <div className="empty-state"><div className="empty-ico"><Ico.Inbox /></div><p style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>No billed appointments yet</p></div>
                ) : (
                  completed.map((c) => (
                    <div key={`${c.locCode}|${c.bookingID}`} className="acc fade-up">
                      <button type="button" className="acc-hdr" onClick={() => router.push(`/billing?appointmentId=${encodeURIComponent(c.bookingID)}&locCode=${encodeURIComponent(c.locCode)}&billed=1`)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: "#1e3a40", fontSize: 14, fontWeight: 700 }}>{c.clientName}<span style={{ color: "#9ca3af", fontWeight: 500 }}> · {c.clientPhone || "—"}</span></p>
                          <p style={{ marginTop: 1, color: "#6b7280", fontSize: 11.5 }}>Booking: {c.bookingID} · {fmtDateLong(c.date)}</p>
                        </div>
                        <span className="badge b-green">Billed</span>
                        <span style={{ color: "#1e3a40", fontSize: 13.5, fontWeight: 800 }}>{fmtMoney(Number(c.total) || 0)}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
