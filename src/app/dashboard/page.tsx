// app/admin/dashboard/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface AdminUser {
  name:  string;
  email: string;
}

interface ServiceItem {
  name:     string;
  price:    string;
  duration: string;
  category: string;
}

interface ProviderItem {
  name: string;
  role: string;
}

interface Booking {
  BookingId:    number;
  UserId:       number;
  BookingMode:  string;
  Gender:       string;
  Location:     string;
  Categories:   string;
  TotalDuration:number;
  TotalPrice:   number;
  BookingDate:  string;
  TimeSlot:     string;
  SpecialNotes: string | null;
  Status:       string;
  CreatedAt:    string;
  services:     ServiceItem[];
  providers:    ProviderItem[];
}

interface GridCell {
  service:   string;
  bookingId: number;
  status:    string;
}

interface DashboardStats {
  totalToday:     number;
  totalPending:   number;
  totalConfirmed: number;
  totalWalkin:    number;
  totalCancelled: number;
}

interface DashboardData {
  date:      string;
  stats:     DashboardStats;
  providers: string[];
  timeSlots: string[];
  grid:      Record<string, Record<string, GridCell>>;
  bookings:  Booking[];
}

/* ─────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────── */
const C = {
  bg:           '#f4f6f9',
  sidebarBg:    '#ffffff',
  border:       '#e3e8ef',
  navActiveBg:  '#e8b93f',
  navActiveTx:  '#1a1a1a',
  navIdleTx:    '#6b7280',
  textDark:     '#1c1f26',
  textMuted:    '#8b95a5',
  blue:         '#9db8dd',
  blueD:        '#7b93b8',
  gray:         '#7f8fa4',
  grayD:        '#6b7c93',
  tableHead:    '#8ba3c7',
  tableBorder:  '#b8c8e0',
  frameBorder:  '#9db8dd',
  green:        '#22c55e',
  red:          '#ef4444',
  gold:         '#c99a2e',
  orange:       '#f59e0b',
  font:         "'Inter', sans-serif",
} as const;

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:${C.bg};}

  @keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .reveal-up{animation:fadeInUp 0.45s cubic-bezier(0.16,1,0.3,1) both;}

  .nav-item{
    display:flex;align-items:center;gap:0.6rem;
    padding:0.7rem 1.1rem;border-radius:0.5rem;
    font-family:Inter,sans-serif;font-size:0.78rem;font-weight:700;
    letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;
    transition:all 0.2s;border:none;background:none;width:100%;text-align:left;
  }
  .nav-item-active{background:${C.navActiveBg};color:${C.navActiveTx};}
  .nav-item-idle{color:${C.navIdleTx};}
  .nav-item-idle:hover{background:#f1f3f6;}

  .stat-card{
    border-radius:0.9rem;padding:1.4rem 1.5rem;
    display:flex;flex-direction:column;justify-content:space-between;
    min-height:96px;color:#fff;
    box-shadow:0 4px 14px rgba(0,0,0,0.08);
    transition:transform 0.2s,box-shadow 0.2s;
  }
  .stat-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,0.12);}

  /* ── Schedule table ── */
  .sched-wrap{
    border:3px solid ${C.frameBorder};
    border-radius:1.1rem;padding:0.8rem;background:#fff;overflow-x:auto;
  }
  .sched-table{width:100%;border-collapse:separate;border-spacing:0;}
  .sched-table th{
    background:${C.tableHead};color:#fff;
    font-family:Inter,sans-serif;font-size:0.7rem;font-weight:700;
    letter-spacing:0.05em;text-transform:uppercase;
    padding:0.65rem 0.5rem;text-align:center;
    border-right:1px solid rgba(255,255,255,0.2);
  }
  .sched-table th:first-child{border-top-left-radius:0.6rem;}
  .sched-table th:last-child{border-top-right-radius:0.6rem;border-right:none;}
  .sched-table td{
    border:1px solid ${C.tableBorder};
    padding:0.45rem 0.4rem;text-align:center;
    font-family:Inter,sans-serif;font-size:0.67rem;color:${C.textDark};
    height:36px;vertical-align:middle;transition:background 0.15s;
  }
  .sched-table tr:hover td{background:rgba(157,184,221,0.06);}
  .sched-table td.time-col{
    font-weight:700;background:#f8fafc;color:${C.textMuted};min-width:78px;
  }
  .sched-table td.booked-confirmed{
    background:rgba(34,197,94,0.1);color:#15803d;font-weight:600;
  }
  .sched-table td.booked-pending{
    background:rgba(245,158,11,0.1);color:#b45309;font-weight:600;
  }
  .sched-table td.booked-walkin{
    background:rgba(157,184,221,0.18);color:#3b5f8a;font-weight:600;
  }
  .sched-table td.empty{color:#cbd5e1;font-size:0.75rem;}

  /* ── Bookings table ── */
  .bk-table-wrap{
    border:2px solid ${C.frameBorder};border-radius:1.1rem;
    background:#fff;overflow:hidden;
  }
  .bk-table{width:100%;border-collapse:collapse;}
  .bk-table thead tr{background:${C.tableHead};}
  .bk-table thead th{
    color:#fff;font-family:Inter,sans-serif;font-size:0.68rem;
    font-weight:700;letter-spacing:0.05em;text-transform:uppercase;
    padding:0.8rem 0.9rem;text-align:left;white-space:nowrap;
    border-right:1px solid rgba(255,255,255,0.15);
  }
  .bk-table thead th:last-child{border-right:none;}
  .bk-table tbody tr{border-bottom:1px solid ${C.border};transition:background 0.15s;}
  .bk-table tbody tr:last-child{border-bottom:none;}
  .bk-table tbody tr:hover{background:#f8fbff;}
  .bk-table tbody td{
    font-family:Inter,sans-serif;font-size:0.72rem;color:${C.textDark};
    padding:0.75rem 0.9rem;vertical-align:middle;
  }

  /* ── Badges ── */
  .badge{
    display:inline-flex;align-items:center;gap:0.25rem;
    padding:0.22rem 0.55rem;border-radius:99px;
    font-family:Inter,sans-serif;font-size:0.63rem;font-weight:700;
    letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;
  }
  .badge-confirmed{background:rgba(34,197,94,0.12);color:#15803d;}
  .badge-pending{background:rgba(245,158,11,0.12);color:#92400e;}
  .badge-cancelled{background:rgba(239,68,68,0.1);color:#b91c1c;}
  .badge-walkin{background:rgba(157,184,221,0.2);color:#2d5f8a;}
  .badge-mode-confirmed{background:rgba(139,163,199,0.15);color:#4a6fa5;}
  .badge-mode-walkin{background:rgba(167,139,250,0.15);color:#5b21b6;}

  /* ── Misc ── */
  .avatar-circle{
    width:2.4rem;height:2.4rem;border-radius:50%;
    background:linear-gradient(135deg,${C.blue},${C.blueD});
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:700;font-size:0.9rem;font-family:Inter,sans-serif;
    flex-shrink:0;
  }
  .icon-btn{
    width:2.2rem;height:2.2rem;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    background:#f1f3f6;color:${C.textMuted};
    cursor:pointer;position:relative;transition:background 0.2s;
    border:none;
  }
  .icon-btn:hover{background:#e6e9ee;}
  .bell-dot{
    position:absolute;top:0.35rem;right:0.4rem;
    width:0.4rem;height:0.4rem;border-radius:50%;background:${C.red};
  }
  .date-pill{
    display:inline-flex;align-items:center;gap:0.4rem;
    background:#fff;border:1.5px solid ${C.border};
    border-radius:0.6rem;padding:0.4rem 0.75rem;
    font-family:Inter,sans-serif;font-size:0.78rem;color:${C.textDark};
    cursor:pointer;
  }
  .date-pill input{
    border:none;outline:none;background:transparent;
    font-family:Inter,sans-serif;font-size:0.78rem;color:${C.textDark};cursor:pointer;
  }
  .spinner{
    width:1.4rem;height:1.4rem;border:2.5px solid rgba(0,0,0,0.08);
    border-top-color:${C.gold};border-radius:50%;
    animation:spin 0.7s linear infinite;
  }
  .tab-btn{
    padding:0.45rem 1.1rem;border-radius:0.5rem;border:1.5px solid ${C.border};
    font-family:Inter,sans-serif;font-size:0.72rem;font-weight:700;
    letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;
    transition:all 0.18s;background:#fff;color:${C.textMuted};
  }
  .tab-btn:hover{border-color:${C.blue};color:${C.blueD};}
  .tab-btn-active{
    background:${C.tableHead};color:#fff;border-color:${C.tableHead};
  }
  .service-chip{
    display:inline-flex;align-items:center;gap:0.2rem;
    padding:0.15rem 0.45rem;border-radius:99px;
    font-size:0.6rem;font-family:Inter,sans-serif;font-weight:600;
    background:rgba(157,184,221,0.15);color:#3b5f8a;
    white-space:nowrap;
  }
  .tooltip-wrap{position:relative;display:inline-block;}
  .tooltip-wrap:hover .tooltip-box{display:block;}
  .tooltip-box{
    display:none;position:absolute;z-index:99;
    bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);
    background:#1c1f26;color:#fff;border-radius:0.4rem;
    padding:0.4rem 0.6rem;font-size:0.62rem;font-family:Inter,sans-serif;
    white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.2);
    pointer-events:none;
  }
  .tooltip-box::after{
    content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);
    border:4px solid transparent;border-top-color:#1c1f26;
  }
  .filter-select{
    border:1.5px solid ${C.border};border-radius:0.5rem;padding:0.38rem 0.7rem;
    font-family:Inter,sans-serif;font-size:0.72rem;color:${C.textDark};
    background:#fff;cursor:pointer;outline:none;
  }
  .filter-select:focus{border-color:${C.blue};}

  @media(max-width:900px){
    .sidebar{display:none !important;}
    .main-content{margin-left:0 !important;}
  }
  @media(max-width:640px){
    .stat-grid{grid-template-columns:1fr 1fr !important;}
  }
`;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function friendlyDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}
function friendlyDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
}

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const Ico = {
  Grid:    ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Mail:    ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Bell:    ({ s=16 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Calendar:({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Clock:   ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Users:   ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Walk:    ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2"/><path d="m15 8-4 1-2 4 3 2v5h2v-6l-2-2 1-2"/><path d="m9 21-1-5 3-2"/></svg>,
  Check:   ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Refresh: ({ s=13 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Table:   ({ s=14 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>,
  X:       ({ s=10 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Location:({ s=11 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Person:  ({ s=11 }:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
};

/* ─────────────────────────────────────────
   STAT CARD
───────────────────────────────────────── */
function StatCard({ icon, label, value, bg }: {
  icon: React.ReactNode; label: string; value: number; bg: string;
}) {
  return (
    <div className="stat-card" style={{ background: bg }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <span style={{
          fontFamily: C.font, fontSize:'0.67rem', fontWeight:700,
          letterSpacing:'0.08em', textTransform:'uppercase', opacity:0.85,
        }}>
          {label}
        </span>
        <span style={{ opacity:0.85 }}>{icon}</span>
      </div>
      <span style={{ fontFamily: C.font, fontSize:'2rem', fontWeight:800, lineHeight:1 }}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; dot: string }> = {
    confirmed:  { cls:'badge badge-confirmed', label:'Confirmed', dot:C.green },
    pending:    { cls:'badge badge-pending',   label:'Pending',   dot:C.orange },
    cancelled:  { cls:'badge badge-cancelled', label:'Cancelled', dot:C.red },
  };
  const cfg = map[status?.toLowerCase()] ?? { cls:'badge badge-pending', label: status, dot: C.orange };
  return (
    <span className={cfg.cls}>
      <span style={{ width:5, height:5, borderRadius:'50%', background: cfg.dot, display:'inline-block' }} />
      {cfg.label}
    </span>
  );
}

/* ─────────────────────────────────────────
   MODE BADGE
───────────────────────────────────────── */
function ModeBadge({ mode }: { mode: string }) {
  if (mode === 'without_confirmation') {
    return <span className="badge badge-mode-walkin">Walk-in</span>;
  }
  return <span className="badge badge-mode-confirmed">Pre-booked</span>;
}

/* ─────────────────────────────────────────
   BOOKING DETAIL MODAL
───────────────────────────────────────── */
function BookingModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
        zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center',
        padding:'1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:'#fff', borderRadius:'1.1rem', maxWidth:'540px', width:'100%',
          maxHeight:'90vh', overflow:'auto',
          boxShadow:'0 24px 60px rgba(0,0,0,0.18)',
          fontFamily: C.font,
        }}
      >
        {/* Header */}
        <div style={{
          background: C.tableHead, padding:'1.1rem 1.4rem',
          borderRadius:'1.1rem 1.1rem 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div>
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' }}>
              Booking Details
            </p>
            <p style={{ color:'#fff', fontSize:'1.1rem', fontWeight:800, marginTop:'0.15rem' }}>
              #{booking.BookingId}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" style={{ background:'rgba(255,255,255,0.2)', color:'#fff' }}>
            <Ico.X s={11} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:'1.3rem 1.4rem', display:'flex', flexDirection:'column', gap:'1rem' }}>

          {/* Badges row */}
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
            <StatusBadge status={booking.Status} />
            <ModeBadge mode={booking.BookingMode} />
            <span className="badge" style={{ background:'rgba(100,116,139,0.1)', color:'#475569' }}>
              <Ico.Person s={10} /> {booking.Gender}
            </span>
            <span className="badge" style={{ background:'rgba(100,116,139,0.1)', color:'#475569' }}>
              <Ico.Location s={10} /> {booking.Location}
            </span>
          </div>

          {/* Date & Time */}
          <Row label="Date & Time">
            <Ico.Calendar s={12} />
            {friendlyDate(booking.BookingDate)} &nbsp;·&nbsp;
            <Ico.Clock s={12} />
            {booking.TimeSlot}
          </Row>

          {/* User */}
          <Row label="Customer ID">
            <span style={{ fontWeight:700 }}>#{booking.UserId}</span>
          </Row>

          {/* Providers */}
          <div>
            <Label>Providers</Label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem', marginTop:'0.4rem' }}>
              {booking.providers.map((p, i) => (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:'0.4rem',
                  background:'rgba(139,163,199,0.12)', borderRadius:'0.5rem',
                  padding:'0.3rem 0.6rem',
                }}>
                  <div style={{
                    width:22, height:22, borderRadius:'50%',
                    background:`linear-gradient(135deg,${C.blue},${C.blueD})`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#fff', fontSize:'0.6rem', fontWeight:700,
                  }}>
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontSize:'0.72rem', fontWeight:700, color: C.textDark }}>{p.name}</p>
                    <p style={{ fontSize:'0.6rem', color: C.textMuted }}>{p.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <Label>Services</Label>
            <div style={{ marginTop:'0.4rem', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              {booking.services.map((s, i) => (
                <div key={i} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  background:'#f8fafc', border:`1px solid ${C.border}`,
                  borderRadius:'0.5rem', padding:'0.5rem 0.75rem',
                }}>
                  <div>
                    <p style={{ fontSize:'0.75rem', fontWeight:700, color: C.textDark }}>{s.name}</p>
                    <p style={{ fontSize:'0.62rem', color: C.textMuted, marginTop:'0.1rem' }}>
                      {s.category} · {s.duration}
                    </p>
                  </div>
                  <span style={{ fontSize:'0.75rem', fontWeight:700, color: C.blueD }}>
                    {s.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.6rem',
          }}>
            <InfoBox label="Total Duration" value={`${booking.TotalDuration} min`} />
            <InfoBox label="Total Price" value={`LKR ${booking.TotalPrice.toLocaleString()}`} />
          </div>

          {/* Notes */}
          {booking.SpecialNotes && (
            <div>
              <Label>Special Notes</Label>
              <div style={{
                marginTop:'0.4rem', background:'rgba(245,158,11,0.06)',
                border:'1px solid rgba(245,158,11,0.25)', borderRadius:'0.5rem',
                padding:'0.6rem 0.8rem', fontSize:'0.72rem', color:'#78350f',
                lineHeight:1.5,
              }}>
                {booking.SpecialNotes}
              </div>
            </div>
          )}

          {/* Created At */}
          <Row label="Created At">
            {friendlyDateTime(booking.CreatedAt)}
          </Row>

        </div>
      </div>
    </div>
  );
}

/* small helpers */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.07em',
      textTransform:'uppercase', color: C.textMuted,
    }}>
      {children}
    </p>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
      <Label>{label}</Label>
      <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.75rem', color: C.textDark, fontWeight:500 }}>
        {children}
      </div>
    </div>
  );
}
function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background:'#f8fafc', border:`1px solid ${C.border}`,
      borderRadius:'0.5rem', padding:'0.6rem 0.75rem',
    }}>
      <p style={{ fontSize:'0.62rem', color: C.textMuted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {label}
      </p>
      <p style={{ fontSize:'0.9rem', fontWeight:800, color: C.textDark, marginTop:'0.15rem' }}>
        {value}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────
   BOOKINGS TABLE
───────────────────────────────────────── */
function BookingsTable({ bookings }: { bookings: Booking[] }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter,   setModeFilter]   = useState('all');
  const [selected,     setSelected]     = useState<Booking | null>(null);

  const filtered = bookings.filter((b) => {
    const sOk = statusFilter === 'all' || b.Status === statusFilter;
    const mOk = modeFilter   === 'all'
      || (modeFilter === 'walkin'    && b.BookingMode === 'without_confirmation')
      || (modeFilter === 'prebooked' && b.BookingMode === 'confirmed');
    return sOk && mOk;
  });

  return (
    <>
      {selected && (
        <BookingModal booking={selected} onClose={() => setSelected(null)} />
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:'0.6rem', marginBottom:'0.9rem', flexWrap:'wrap' }}>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          className="filter-select"
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
        >
          <option value="all">All Modes</option>
          <option value="prebooked">Pre-booked</option>
          <option value="walkin">Walk-in</option>
        </select>

        <span style={{
          marginLeft:'auto', fontSize:'0.7rem', color: C.textMuted,
          display:'flex', alignItems:'center', fontFamily: C.font, fontWeight:600,
        }}>
          {filtered.length} booking{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bk-table-wrap" style={{ overflowX:'auto' }}>
        <table className="bk-table">
          <thead>
            <tr>
              <th>#ID</th>
              <th>Time</th>
              <th>Customer</th>
              <th>Location</th>
              <th>Providers</th>
              <th>Services</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Mode</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign:'center', padding:'2rem', color: C.textMuted }}>
                  No bookings match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.BookingId}>
                  {/* ID */}
                  <td>
                    <span style={{ fontWeight:700, color: C.blueD }}>
                      #{b.BookingId}
                    </span>
                  </td>

                  {/* Time */}
                  <td>
                    <span style={{ display:'flex', alignItems:'center', gap:'0.3rem', fontWeight:600 }}>
                      <Ico.Clock s={11} /> {b.TimeSlot}
                    </span>
                  </td>

                  {/* Customer */}
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.1rem' }}>
                      <span style={{ fontWeight:600 }}>#{b.UserId}</span>
                      <span style={{ color: C.textMuted, fontSize:'0.63rem' }}>
                        <Ico.Person s={10} /> {b.Gender}
                      </span>
                    </div>
                  </td>

                  {/* Location */}
                  <td>
                    <span style={{ display:'flex', alignItems:'center', gap:'0.25rem', color: C.textMuted }}>
                      <Ico.Location s={10} /> {b.Location}
                    </span>
                  </td>

                  {/* Providers */}
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
                      {b.providers.map((p, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                          <div style={{
                            width:18, height:18, borderRadius:'50%',
                            background:`linear-gradient(135deg,${C.blue},${C.blueD})`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'#fff', fontSize:'0.55rem', fontWeight:700, flexShrink:0,
                          }}>
                            {p.name.charAt(0)}
                          </div>
                          <span style={{ fontSize:'0.7rem', fontWeight:600 }}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* Services */}
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
                      {b.services.map((s, i) => (
                        <span key={i} className="service-chip">{s.name}</span>
                      ))}
                    </div>
                  </td>

                  {/* Duration */}
                  <td style={{ fontWeight:600, whiteSpace:'nowrap' }}>
                    {b.TotalDuration} min
                  </td>

                  {/* Price */}
                  <td style={{ fontWeight:700, color: C.blueD, whiteSpace:'nowrap' }}>
                    LKR {b.TotalPrice.toLocaleString()}
                  </td>

                  {/* Mode */}
                  <td><ModeBadge mode={b.BookingMode} /></td>

                  {/* Status */}
                  <td><StatusBadge status={b.Status} /></td>

                  {/* View */}
                  <td>
                    <button
                      onClick={() => setSelected(b)}
                      style={{
                        background: C.tableHead, color:'#fff', border:'none',
                        borderRadius:'0.4rem', padding:'0.3rem 0.65rem',
                        fontSize:'0.62rem', fontWeight:700, cursor:'pointer',
                        fontFamily: C.font, letterSpacing:'0.04em',
                        transition:'opacity 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity='0.8')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity='1')}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   SCHEDULE GRID
───────────────────────────────────────── */
function ScheduleGrid({
  timeSlots, providers, grid,
}: {
  timeSlots: string[];
  providers: string[];
  grid: Record<string, Record<string, GridCell>>;
}) {
  if (providers.length === 0) {
    return (
      <div style={{
        background:'#fff', border:`1.5px dashed ${C.border}`,
        borderRadius:'0.9rem', padding:'2.5rem', textAlign:'center',
        color: C.textMuted, fontSize:'0.85rem',
      }}>
        No bookings scheduled for this date.
      </div>
    );
  }

  function cellClass(cell: GridCell | undefined) {
    if (!cell) return 'empty';
    if (cell.status === 'confirmed') return 'booked-confirmed';
    if (cell.status === 'pending') return 'booked-pending';
    return 'booked-walkin';
  }

  return (
    <div className="sched-wrap">
      <table className="sched-table">
        <thead>
          <tr>
            <th style={{ minWidth:78 }}>Time</th>
            {providers.map((p) => (
              <th key={p} style={{ minWidth:100 }}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr key={slot}>
              <td className="time-col">{slot}</td>
              {providers.map((p) => {
                const cell = grid[slot]?.[p];
                return (
                  <td key={p} className={cellClass(cell)}>
                    {cell
                      ? (
                        <div className="tooltip-wrap">
                          <span>{cell.service}</span>
                          <div className="tooltip-box">#{cell.bookingId} · {cell.status}</div>
                        </div>
                      )
                      : '—'
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function AdminDashboardPage() {
  const router = useRouter();

  const [admin,     setAdmin]     = useState<AdminUser | null>(null);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'enquiry'>('dashboard');
  const [activeTab, setActiveTab] = useState<'schedule' | 'bookings'>('schedule');
  const [date,      setDate]      = useState(todayISO());
  const [data,      setData]      = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  /* auth */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('admin');
    try { setAdmin(raw ? JSON.parse(raw) : { name:'Mr.Sonic', email:'admin@sayo.com' }); }
    catch { setAdmin({ name:'Mr.Sonic', email:'admin@sayo.com' }); }
  }, [router]);

  /* fetch */
  const fetchDashboard = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard?date=${d}`);
      const json = await res.json();
      if (json.success) setData(json);
      else setError(json.message || 'Failed to load dashboard.');
    } catch {
      setError('Network error while loading dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(date); }, [date, fetchDashboard]);

  const firstName = admin?.name?.split(' ').pop()?.split('.').pop() || 'Admin';

  /* ── Revenue summary for the day ── */
  const totalRevenue = data?.bookings
    ?.filter((b) => b.Status !== 'cancelled')
    .reduce((s, b) => s + b.TotalPrice, 0) ?? 0;

  return (
    <>
      <style>{globalCss}</style>
      <div style={{ minHeight:'100vh', background: C.bg, display:'flex', fontFamily: C.font }}>

        {/* ══ SIDEBAR ══ */}
        <aside className="sidebar" style={{
          width:240, background: C.sidebarBg,
          borderRight:`1px solid ${C.border}`,
          minHeight:'100vh', flexShrink:0, padding:'1.6rem 1.1rem',
        }}>
          <div style={{ marginBottom:'2.2rem' }}>
            <h1 style={{
              fontSize:'0.82rem', fontWeight:800,
              letterSpacing:'0.04em', color: C.textDark,
            }}>
              SAYO ADMIN PORTAL
            </h1>
            <div style={{ height:1, background: C.border, marginTop:'1rem' }} />
          </div>

          <nav style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
            {([
              { key:'dashboard', icon:<Ico.Grid s={13}/>, label:'Dashboard' },
              { key:'enquiry',   icon:<Ico.Mail s={13}/>, label:'Enquiry' },
            ] as const).map(({ key, icon, label }) => (
              <button
                key={key}
                className={`nav-item ${activeNav === key ? 'nav-item-active' : 'nav-item-idle'}`}
                onClick={() => setActiveNav(key)}
              >
                {icon} {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ══ MAIN ══ */}
        <main className="main-content" style={{ flex:1, padding:'clamp(1.2rem,3vw,2.2rem)', minWidth:0 }}>

          {/* Top Bar */}
          <div className="reveal-up" style={{
            display:'flex', justifyContent:'space-between',
            alignItems:'flex-start', marginBottom:'1.6rem',
            flexWrap:'wrap', gap:'1rem',
          }}>
            <div>
              <p style={{
                fontSize:'0.7rem', color: C.textMuted, fontWeight:600,
                letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'0.2rem',
              }}>
                Welcome back
              </p>
              <h2 style={{ fontSize:'1.7rem', fontWeight:800, color: C.textDark, lineHeight:1.2 }}>
                Hello, {firstName.toUpperCase()}
              </h2>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:'0.8rem', flexWrap:'wrap' }}>
              <label className="date-pill">
                <Ico.Calendar s={13} />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>

              <button
                className="icon-btn"
                title="Refresh"
                onClick={() => fetchDashboard(date)}
                style={{ border:'none' }}
              >
                {loading ? <span className="spinner" style={{ width:13, height:13, borderWidth:2 }} /> : <Ico.Refresh s={13} />}
              </button>

              <div className="icon-btn">
                <Ico.Bell s={16} />
                <span className="bell-dot" />
              </div>

              <div className="avatar-circle">
                {firstName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <div style={{ height:1, background: C.border, marginBottom:'1.6rem' }} />

          {/* Loading */}
          {loading && !data && (
            <div style={{
              display:'flex', alignItems:'center',
              justifyContent:'center', padding:'4rem 0', gap:'0.7rem',
            }}>
              <span className="spinner" />
              <span style={{ color: C.textMuted, fontSize:'0.85rem' }}>Loading dashboard…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)',
              borderRadius:'0.7rem', padding:'1rem 1.2rem',
              color:'#b91c1c', fontSize:'0.85rem', marginBottom:'1rem',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Content */}
          {!loading && data && (
            <>
              {/* ── STAT CARDS ── */}
              <div className="stat-grid reveal-up" style={{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))',
                gap:'1rem', marginBottom:'1.8rem',
              }}>
                <StatCard
                  icon={<Ico.Calendar s={16}/>}
                  label="Today's Bookings"
                  value={data.stats.totalToday}
                  bg={C.blue}
                />
                <StatCard
                  icon={<Ico.Clock s={16}/>}
                  label="Pending"
                  value={data.stats.totalPending}
                  bg={C.gray}
                />
                <StatCard
                  icon={<Ico.Check s={16}/>}
                  label="Confirmed"
                  value={data.stats.totalConfirmed}
                  bg={C.grayD}
                />
                <StatCard
                  icon={<Ico.Walk s={16}/>}
                  label="Walk-ins"
                  value={data.stats.totalWalkin}
                  bg={C.blueD}
                />
                <StatCard
                  icon={<Ico.Users s={16}/>}
                  label="Revenue"
                  value={totalRevenue}
                  bg="linear-gradient(135deg,#c99a2e,#a97e22)"
                />
              </div>

              {/* Date label */}
              <div style={{
                fontSize:'0.72rem', color: C.textMuted,
                marginBottom:'1rem', fontWeight:600,
              }}>
                Showing data for&nbsp;
                <span style={{ color: C.textDark, fontWeight:700 }}>
                  {friendlyDate(data.date)}
                </span>
              </div>

              {/* ── TAB SWITCHER ── */}
              <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.1rem' }}>
                <button
                  className={`tab-btn ${activeTab === 'schedule' ? 'tab-btn-active' : ''}`}
                  onClick={() => setActiveTab('schedule')}
                >
                  <span style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
                    <Ico.Grid s={12} /> Schedule
                  </span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'bookings' ? 'tab-btn-active' : ''}`}
                  onClick={() => setActiveTab('bookings')}
                >
                  <span style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
                    <Ico.Table s={12} /> Bookings ({data.bookings.length})
                  </span>
                </button>
              </div>

              {/* ── SCHEDULE TAB ── */}
              {activeTab === 'schedule' && (
                <div className="reveal-up">
                  {/* Legend */}
                  <div style={{
                    display:'flex', gap:'1rem', marginBottom:'0.8rem',
                    flexWrap:'wrap', fontSize:'0.65rem', fontFamily: C.font,
                  }}>
                    {[
                      { color:'rgba(34,197,94,0.12)',   text:'Confirmed',  border:'#22c55e' },
                      { color:'rgba(245,158,11,0.12)',  text:'Pending',    border:'#f59e0b' },
                      { color:'rgba(157,184,221,0.2)',  text:'Walk-in',    border:'#9db8dd' },
                    ].map(({ color, text, border }) => (
                      <span key={text} style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                        <span style={{
                          width:12, height:12, borderRadius:3,
                          background:color, border:`1px solid ${border}`,
                          display:'inline-block',
                        }}/>
                        <span style={{ color: C.textMuted, fontWeight:600 }}>{text}</span>
                      </span>
                    ))}
                  </div>

                  <ScheduleGrid
                    timeSlots={data.timeSlots}
                    providers={data.providers}
                    grid={data.grid}
                  />
                </div>
              )}

              {/* ── BOOKINGS TAB ── */}
              {activeTab === 'bookings' && (
                <div className="reveal-up">
                  <BookingsTable bookings={data.bookings} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}