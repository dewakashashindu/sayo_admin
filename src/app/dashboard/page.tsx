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

interface DashboardStats {
  totalToday:     number;
  totalPending:   number;
  totalConfirmed: number;
  totalWalkin:    number;
}

interface DashboardData {
  date:      string;
  stats:     DashboardStats;
  providers: string[];
  timeSlots: string[];
  grid:      Record<string, Record<string, string>>;
}

/* ─────────────────────────────────────────
   DESIGN TOKENS  (light admin theme)
───────────────────────────────────────── */
const tokens = {
  color: {
    bg:          '#f4f6f9',
    sidebarBg:   '#ffffff',
    border:      '#e3e8ef',
    navActiveBg: '#e8b93f',
    navActiveTx: '#1a1a1a',
    navIdleTx:   '#6b7280',
    textDark:    '#1c1f26',
    textMuted:   '#8b95a5',
    accentBlue:  '#9db8dd',
    accentBlueD: '#7b93b8',
    cardGray:    '#7f8fa4',
    cardGrayD:   '#6b7c93',
    tableHeadBg: '#8ba3c7',
    tableBorder: '#b8c8e0',
    frameBorder: '#9db8dd',
    green:       '#22c55e',
    red:         '#ef4444',
    gold:        '#c99a2e',
  },
  font: { family: "'Inter', sans-serif" },
} as const;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function formatFriendlyDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:${tokens.color.bg};}

  @keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .reveal-up{animation:fadeInUp 0.45s cubic-bezier(0.16,1,0.3,1) both;}

  .nav-item{
    display:flex;align-items:center;gap:0.6rem;
    padding:0.7rem 1.1rem;border-radius:0.5rem;
    font-family:Inter,sans-serif;font-size:0.78rem;font-weight:700;
    letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;
    transition:all 0.2s;
  }
  .nav-item-active{background:${tokens.color.navActiveBg};color:${tokens.color.navActiveTx};}
  .nav-item-idle{color:${tokens.color.navIdleTx};}
  .nav-item-idle:hover{background:#f1f3f6;}

  .stat-card{
    border-radius:0.9rem;padding:1.4rem 1.5rem;
    display:flex;flex-direction:column;justify-content:space-between;
    min-height:96px;color:#fff;
    box-shadow:0 4px 14px rgba(0,0,0,0.08);
    transition:transform 0.2s;
  }
  .stat-card:hover{transform:translateY(-2px);}

  .sched-wrap{
    border:3px solid ${tokens.color.frameBorder};
    border-radius:1.1rem;padding:1rem;background:#fff;
  }
  .sched-table{width:100%;border-collapse:separate;border-spacing:0;}
  .sched-table th{
    background:${tokens.color.tableHeadBg};color:#fff;
    font-family:Inter,sans-serif;font-size:0.72rem;font-weight:700;
    letter-spacing:0.05em;text-transform:uppercase;
    padding:0.6rem 0.4rem;text-align:center;
    border-right:1px solid rgba(255,255,255,0.25);
  }
  .sched-table th:first-child{border-top-left-radius:0.6rem;}
  .sched-table th:last-child{border-top-right-radius:0.6rem;border-right:none;}
  .sched-table td{
    border:1px solid ${tokens.color.tableBorder};
    padding:0.5rem 0.4rem;text-align:center;
    font-family:Inter,sans-serif;font-size:0.68rem;color:${tokens.color.textDark};
    height:38px;vertical-align:middle;
  }
  .sched-table td.time-col{
    font-weight:700;background:#f8fafc;color:${tokens.color.textMuted};
  }
  .sched-table td.booked{
    background:rgba(239,68,68,0.08);color:#b91c1c;font-weight:600;
  }
  .sched-table td.empty{color:#cbd5e1;}

  .avatar-circle{
    width:2.4rem;height:2.4rem;border-radius:50%;
    background:linear-gradient(135deg,#9db8dd,#7b93b8);
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:700;font-size:0.9rem;font-family:Inter,sans-serif;
    flex-shrink:0;
  }
  .bell-btn{
    width:2.2rem;height:2.2rem;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    background:#f1f3f6;color:${tokens.color.textMuted};
    cursor:pointer;position:relative;transition:background 0.2s;
  }
  .bell-btn:hover{background:#e6e9ee;}
  .bell-dot{
    position:absolute;top:0.35rem;right:0.4rem;
    width:0.4rem;height:0.4rem;border-radius:50%;background:${tokens.color.red};
  }

  .date-pill{
    display:inline-flex;align-items:center;gap:0.4rem;
    background:#fff;border:1.5px solid ${tokens.color.border};
    border-radius:0.6rem;padding:0.4rem 0.75rem;
    font-family:Inter,sans-serif;font-size:0.78rem;color:${tokens.color.textDark};
    cursor:pointer;
  }
  .date-pill input{border:none;outline:none;background:transparent;font-family:Inter,sans-serif;font-size:0.78rem;color:${tokens.color.textDark};cursor:pointer;}

  .spinner{
    width:1.4rem;height:1.4rem;border:2.5px solid rgba(0,0,0,0.08);
    border-top-color:${tokens.color.gold};border-radius:50%;
    animation:spin 0.7s linear infinite;
  }

  @media(max-width:900px){
    .sidebar{display:none !important;}
    .main-content{margin-left:0 !important;}
  }
  @media(max-width:640px){
    .stat-grid{grid-template-columns:1fr !important;}
    .sched-table{font-size:0.6rem;}
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const Ico = {
  Grid: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Mail: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  Bell: ({ s = 16 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Calendar: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  ),
  Clock: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Users: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Walk: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2" />
      <path d="m15 8-4 1-2 4 3 2v5h2v-6l-2-2 1-2" />
      <path d="m9 21-1-5 3-2" />
    </svg>
  ),
  Check: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Refresh: ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
};

/* ─────────────────────────────────────────
   STAT CARD
───────────────────────────────────────── */
function StatCard({
  icon, label, value, bg,
}: {
  icon: React.ReactNode; label: string; value: number | string; bg: string;
}) {
  return (
    <div className="stat-card" style={{ background: bg }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <span style={{
          fontFamily: tokens.font.family, fontSize:'0.68rem', fontWeight:700,
          letterSpacing:'0.08em', textTransform:'uppercase', opacity:0.85,
        }}>
          {label}
        </span>
        <span style={{ opacity:0.9 }}>{icon}</span>
      </div>
      <span style={{ fontFamily: tokens.font.family, fontSize:'1.9rem', fontWeight:800 }}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function AdminDashboardPage() {
  const router = useRouter();

  const [admin, setAdmin]           = useState<AdminUser | null>(null);
  const [activeNav, setActiveNav]   = useState<'dashboard' | 'enquiry'>('dashboard');
  const [date, setDate]             = useState(todayISO());
  const [data, setData]             = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  /* ── Auth check (adjust key/redirect to your admin auth) ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('admin');
    if (!raw) {
      // fallback demo admin so page still renders if you haven't wired admin auth yet
      setAdmin({ name: 'Mr.Sonic', email: 'admin@sayo.com' });
      return;
    }
    try {
      setAdmin(JSON.parse(raw));
    } catch {
      setAdmin({ name: 'Mr.Sonic', email: 'admin@sayo.com' });
    }
  }, [router]);

  /* ── Fetch dashboard data ── */
  const fetchDashboard = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/admin/dashboard?date=${d}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.message || 'Failed to load dashboard.');
      }
    } catch {
      setError('Network error while loading dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(date);
  }, [date, fetchDashboard]);

  const firstName = admin?.name?.split(' ')[0]?.split('.').pop() || admin?.name || 'Admin';

  return (
    <>
      <style>{globalCss}</style>
      <div style={{ minHeight:'100vh', background: tokens.color.bg, display:'flex', fontFamily: tokens.font.family }}>

        {/* ══ SIDEBAR ══ */}
        <aside className="sidebar" style={{
          width:'240px', background: tokens.color.sidebarBg,
          borderRight:`1px solid ${tokens.color.border}`,
          minHeight:'100vh', flexShrink:0, padding:'1.6rem 1.1rem',
        }}>
          <div style={{ marginBottom:'2.2rem' }}>
            <h1 style={{
              fontSize:'0.82rem', fontWeight:800, letterSpacing:'0.04em',
              color: tokens.color.textDark, fontFamily: tokens.font.family,
            }}>
              SAYO ADMIN PORTAL
            </h1>
            <div style={{ height:'1px', background: tokens.color.border, marginTop:'1rem' }} />
          </div>

          <nav style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
            <div
              className={`nav-item ${activeNav === 'dashboard' ? 'nav-item-active' : 'nav-item-idle'}`}
              onClick={() => setActiveNav('dashboard')}
            >
              <Ico.Grid s={13} /> Dashboard
            </div>
            <div
              className={`nav-item ${activeNav === 'enquiry' ? 'nav-item-active' : 'nav-item-idle'}`}
              onClick={() => setActiveNav('enquiry')}
            >
              <Ico.Mail s={13} /> Enquiry
            </div>
          </nav>
        </aside>

        {/* ══ MAIN CONTENT ══ */}
        <main className="main-content" style={{ flex:1, padding:'clamp(1.2rem,3vw,2.2rem)' }}>

          {/* ── Top Bar ── */}
          <div className="reveal-up" style={{
            display:'flex', justifyContent:'space-between', alignItems:'flex-start',
            marginBottom:'1.6rem', flexWrap:'wrap', gap:'1rem',
          }}>
            <div>
              <p style={{ fontSize:'0.7rem', color: tokens.color.textMuted, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'0.2rem' }}>
                Welcome back
              </p>
              <h2 style={{ fontSize:'1.7rem', fontWeight:800, color: tokens.color.textDark, lineHeight:1.2 }}>
                Hello<br />Mr.{firstName.toUpperCase()}
              </h2>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:'0.9rem' }}>
              <label className="date-pill">
                <Ico.Calendar s={13} />
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </label>

              <button
                onClick={() => fetchDashboard(date)}
                className="bell-btn"
                title="Refresh"
                style={{ border:'none' }}
              >
                <Ico.Refresh s={13} />
              </button>

              <div className="bell-btn">
                <Ico.Bell s={16} />
                <span className="bell-dot" />
              </div>

              <div className="avatar-circle">
                {firstName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <div style={{ height:'1px', background: tokens.color.border, marginBottom:'1.8rem' }} />

          {loading && !data ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'4rem 0', gap:'0.7rem' }}>
              <span className="spinner" />
              <span style={{ color: tokens.color.textMuted, fontSize:'0.85rem' }}>Loading dashboard…</span>
            </div>
          ) : error ? (
            <div style={{
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)',
              borderRadius:'0.7rem', padding:'1rem 1.2rem', color:'#b91c1c', fontSize:'0.85rem',
            }}>
              ⚠ {error}
            </div>
          ) : data && (
            <>
              {/* ── STAT CARDS ── */}
              <div className="stat-grid reveal-up" style={{
                display:'grid', gridTemplateColumns:'repeat(2, 1fr)',
                gap:'1.1rem', marginBottom:'2rem', maxWidth:'560px',
              }}>
                <StatCard
                  icon={<Ico.Calendar s={16} />}
                  label="Today's Bookings"
                  value={data.stats.totalToday}
                  bg={tokens.color.accentBlue}
                />
                <StatCard
                  icon={<Ico.Clock s={16} />}
                  label="Pending"
                  value={data.stats.totalPending}
                  bg={tokens.color.cardGray}
                />
                <StatCard
                  icon={<Ico.Check s={16} />}
                  label="Confirmed"
                  value={data.stats.totalConfirmed}
                  bg={tokens.color.cardGrayD}
                />
                <StatCard
                  icon={<Ico.Walk s={16} />}
                  label="Walk-ins"
                  value={data.stats.totalWalkin}
                  bg={tokens.color.accentBlueD}
                />
              </div>

              <div style={{ height:'1px', background: tokens.color.border, marginBottom:'1.8rem', maxWidth:'900px' }} />

              {/* ── SCHEDULE GRID ── */}
              <div className="reveal-up" style={{ marginBottom:'1rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.9rem', flexWrap:'wrap', gap:'0.5rem' }}>
                  <h3 style={{ fontSize:'0.95rem', fontWeight:700, color: tokens.color.textDark }}>
                    Today&apos;s Schedule
                  </h3>
                  <span style={{ fontSize:'0.75rem', color: tokens.color.textMuted }}>
                    {formatFriendlyDate(data.date)}
                  </span>
                </div>

                {data.providers.length === 0 ? (
                  <div style={{
                    background:'#fff', border:`1.5px dashed ${tokens.color.border}`,
                    borderRadius:'0.9rem', padding:'2.5rem', textAlign:'center',
                    color: tokens.color.textMuted, fontSize:'0.85rem',
                  }}>
                    No bookings scheduled for this date.
                  </div>
                ) : (
                  <div className="sched-wrap" style={{ overflowX:'auto' }}>
                    <table className="sched-table">
                      <thead>
                        <tr>
                          <th style={{ minWidth:'80px' }}>Time</th>
                          {data.providers.map(p => (
                            <th key={p} style={{ minWidth:'100px' }}>{p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.timeSlots.map(slot => (
                          <tr key={slot}>
                            <td className="time-col">{slot}</td>
                            {data.providers.map(p => {
                              const cell = data.grid[slot]?.[p];
                              return (
                                <td key={p} className={cell ? 'booked' : 'empty'}>
                                  {cell || '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}