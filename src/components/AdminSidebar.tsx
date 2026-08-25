// E:\sayo_admin\sayo-admin\src\components\AdminSidebar.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
export interface AdminSidebarProps {
  active: string;
  onNav: (key: string, path: string) => void;
  onLogout: () => void;
}

interface SubItem {
  key: string;
  label: string;
  path: string;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactElement;
  path?: string;
  children?: SubItem[];
}

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
export function IGrid()      { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>; }
export function ICal()       { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
export function IDollar()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
export function IBox()       { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
export function IUsers()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
export function IChart()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>; }
export function IGear()      { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
export function ILogout()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
export function ITruck()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>; }
export function IHeart()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>; }
export function IBook()      { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }
export function IStar()      { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
export function IChevRight() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
export function IChevDown()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }

/* ─────────────────────────────────────────
   NAV STRUCTURE
───────────────────────────────────────── */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <IGrid />,
    path: '/dashboard',
  },
  {
    key: 'appointments',
    label: 'Appointments',
    icon: <ICal />,
    path: '/appointment',
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: <IDollar />,
    children: [
      { key: 'billing-dashboard',    label: 'Appointment Dashboard', path: '/appointment'    },
      { key: 'billing-transactions', label: 'Transactions',          path: '/billing/transactions' },
      { key: 'billing-reports',      label: 'Reports',               path: '/billing/reports'      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory Control',
    icon: <IBox />,
    children: [
      { key: 'inv-location',   label: 'Location Master', path: '/locations'   },
      { key: 'inv-categories', label: 'Categories',      path: '/categories' },
      { key: 'inv-items',      label: 'Item Master',     path: '/service'      },
      
      { key: 'inv-units',      label: 'Unit Master',     path: '/units'      },
      { key: 'inv-suppliers',  label: 'Supplier Master', path: '/suppliers'  },
      { key: 'inv-po',         label: 'Purchase Orders', path: '/inventory/po'         },
      { key: 'inv-grn',        label: 'GRN / DGRN',      path: '/inventory/grn'        },
      { key: 'inv-srn',        label: 'SRN',             path: '/inventory/srn'        },
      { key: 'inv-damage',     label: 'Damage',          path: '/inventory/damage'     },
      { key: 'inv-transfer',   label: 'Transfer',        path: '/inventory/transfer'   },
      { key: 'inv-issue',      label: 'Issue',           path: '/inventory/issue'      },
      { key: 'inv-recon',      label: 'Stock Recon.',    path: '/inventory/recon'      },
      { key: 'inv-reports',    label: 'Reports',         path: '/inventory/reports'    },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: <IHeart />,
    children: [
      { key: 'crm-stats',     label: 'Customer Statistics', path: '/crm/statistics' },
      { key: 'crm-enquiry',   label: 'Enquiry & Report',    path: '/crm/enquiry'    },
      { key: 'crm-customers', label: 'Customer Mgmt',       path: '/crm/customers'  },
      { key: 'crm-feedback',  label: 'Feedback Mgmt',       path: '/crm/feedback'   },
      { key: 'crm-notes',     label: 'Notes & Allergies',   path: '/crm/notes'      },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    icon: <IUsers />,
    children: [
      { key: 'admin-schedules', label: 'Staff Schedules',   path: '/administration/schedules' },
      { key: 'admin-hours',     label: 'Operational Hours', path: '/administration/hours'     },
    ],
  },
  {
    key: 'promo',
    label: 'Promo Management',
    icon: <IStar />,
    children: [
      { key: 'promo-coupons',   label: 'Coupons / Vouchers', path: '/promo/coupons'   },
      { key: 'promo-packages',  label: 'Promo Packages',     path: '/promo/packages'  },
      { key: 'promo-rewards',   label: 'Reward Points',      path: '/promo/rewards'   },
      { key: 'promo-discounts', label: 'Discount Circles',   path: '/promo/discounts' },
      { key: 'promo-greetings', label: 'Special Greetings',  path: '/promo/greetings' },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    icon: <IBook />,
    children: [
      { key: 'acc-salary',  label: 'Staff Salary',   path: '/accounting/salary'  },
      { key: 'acc-raw',     label: 'Raw Items',      path: '/accounting/raw'     },
      { key: 'acc-other',   label: 'Other Expenses', path: '/accounting/other'   },
      { key: 'acc-revenue', label: 'Revenue',        path: '/accounting/revenue' },
    ],
  },
  {
    key: 'settings',
    label: 'System Settings',
    icon: <IGear />,
    children: [
      { key: 'settings-startup', label: 'Start-up Settings', path: '/settings/startup' },
      { key: 'settings-users',   label: 'User Settings',     path: '/settings/users'   },
    ],
  },
  {
    key: 'reports',
    label: 'Reports (Overall)',
    icon: <IChart />,
    path: '/reports',
  },
];

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
export const SIDEBAR_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  .sb-nav-scroll::-webkit-scrollbar        { width:4px; }
  .sb-nav-scroll::-webkit-scrollbar-track  { background:transparent; }
  .sb-nav-scroll::-webkit-scrollbar-thumb  { background:rgba(255,255,255,0.15); border-radius:4px; }

  .sb-grip {
    position:absolute; right:-13px; top:50%; transform:translateY(-50%);
    width:13px; height:48px;
    background:linear-gradient(180deg,#243c44 0%,#1a2e36 100%);
    border:1px solid rgba(255,255,255,0.1); border-left:none;
    border-radius:0 8px 8px 0;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:3px;
    cursor:pointer; z-index:50;
    transition:background 0.18s,width 0.15s;
  }
  .sb-grip:hover { background:linear-gradient(180deg,#2e4a52 0%,#223840 100%); width:15px; }
  .sb-grip-line  { width:5px; height:1.5px; border-radius:99px; background:rgba(255,255,255,0.5); }

  .sb-group-btn {
    width:100%; border:none; background:transparent; cursor:pointer;
    font-family:'Inter',sans-serif;
    display:flex; align-items:center;
    border-radius:9px;
    transition:background 0.15s,color 0.15s;
  }
  .sb-group-btn:hover { background:rgba(255,255,255,0.07); }
  .sb-group-btn.active { background:rgba(255,255,255,0.13); }

  .sb-group-btn.icon-mode {
    width:44px; height:44px; justify-content:center; padding:0;
    color:rgba(255,255,255,0.45);
  }
  .sb-group-btn.icon-mode:hover  { color:rgba(255,255,255,0.85); }
  .sb-group-btn.icon-mode.active { color:#fff; }

  .sb-group-btn.row-mode {
    height:40px; padding:0 10px; gap:10px;
    color:rgba(255,255,255,0.5);
  }
  .sb-group-btn.row-mode:hover  { color:rgba(255,255,255,0.9); }
  .sb-group-btn.row-mode.active { color:#fff; }

  .sb-sub-btn {
    width:100%; border:none; background:transparent; cursor:pointer;
    font-family:'Inter',sans-serif; font-size:12px; font-weight:500;
    display:flex; align-items:center; gap:8px;
    height:32px; border-radius:7px;
    padding:0 10px 0 28px;
    color:rgba(255,255,255,0.45);
    transition:background 0.13s,color 0.13s;
    text-align:left;
  }
  .sb-sub-btn:hover  { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.85); }
  .sb-sub-btn.active { background:rgba(255,255,255,0.11); color:#fff; }

  .sb-children {
    overflow:hidden;
    transition:max-height 0.28s cubic-bezier(.4,0,.2,1), opacity 0.22s ease;
  }

  .sb-dot {
    width:5px; height:5px; border-radius:50%;
    background:#7dd3d8; flex-shrink:0;
  }

  .sb-desktop { display:flex; flex-direction:column; }

  .mob-nav {
    display:none;
    position:fixed; bottom:0; left:0; right:0; z-index:100;
    background:linear-gradient(180deg,#1a2e35 0%,#111e24 100%);
    height:64px;
    align-items:center; justify-content:flex-start;
    padding:0 6px;
    border-top:1px solid rgba(255,255,255,0.07);
    box-shadow:0 -4px 20px rgba(0,0,0,0.25);
    overflow-x:auto; overflow-y:hidden;
  }
  .mob-nav::-webkit-scrollbar { height:0; }
  .mob-btn {
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:3px; padding:6px 10px;
    border:none; background:transparent;
    color:rgba(255,255,255,0.4); cursor:pointer;
    border-radius:8px; transition:all 0.18s; min-width:52px;
    flex-shrink:0;
  }
  .mob-btn.active { color:#fff; background:rgba(255,255,255,0.1); }
  .mob-btn:hover  { color:rgba(255,255,255,0.75); }
  .mob-lbl {
    font-size:9px; font-weight:600;
    letter-spacing:0.02em;
    font-family:'Inter',sans-serif;
    white-space:nowrap;
  }

  @media(max-width:767px) {
    .sb-desktop { display:none !important; }
    .mob-nav    { display:flex !important; }
    .main-body  { padding-bottom:72px !important; }
    .hdr-name   { display:none !important; }
  }
  @media(max-width:480px) {
    .main-body  { padding:10px 10px 72px !important; }
    .hdr-inner  { padding:0 12px !important; height:52px !important; }
  }
`;

/* ─────────────────────────────────────────
   HELPER
───────────────────────────────────────── */
function activeGroupKey(activeKey: string): string {
  for (const g of NAV_GROUPS) {
    if (g.key === activeKey) return g.key;
    if (g.children?.some(c => c.key === activeKey)) return g.key;
  }
  return '';
}

/* ─────────────────────────────────────────
   DESKTOP SIDEBAR
───────────────────────────────────────── */
function DesktopSidebar({ active, onNav, onLogout }: AdminSidebarProps) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    const ag = activeGroupKey(active);
    if (ag) init[ag] = true;
    return init;
  });

  const W = open ? 210 : 64;

  function toggleGroup(key: string) {
    if (!open) {
      setOpen(true);
      setExpanded({ [key]: true });
      return;
    }
    setExpanded(p => ({ ...p, [key]: !p[key] }));
  }

  const ag = activeGroupKey(active);

  return (
    <aside
      className="sb-desktop"
      style={{
        width: W, minWidth: W, height: '100vh',
        background: 'linear-gradient(180deg,#1c2f37 0%,#111e25 100%)',
        flexShrink: 0, position: 'relative', overflow: 'visible',
        zIndex: 20,
        transition: 'width 0.24s cubic-bezier(.4,0,.2,1),min-width 0.24s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/* Logo */}
      <div style={{
        display: 'flex',
        justifyContent: open ? 'flex-start' : 'center',
        padding: open ? '12px 14px 6px' : '12px 0 6px',
        flexShrink: 0,
      }}>
        <Image src="/sayologo.png" alt="Sayo" width={40} height={40} style={{ objectFit: 'contain' }} />
      </div>

      {/* Scrollable nav */}
      <div
        className="sb-nav-scroll"
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: open ? '4px 8px' : '4px 0',
          display: 'flex', flexDirection: 'column',
          alignItems: open ? 'stretch' : 'center',
          gap: 1,
        }}
      >
        {NAV_GROUPS.map((group) => {
          const isGroupActive = ag === group.key;
          const isExpanded    = !!expanded[group.key];
          const isDirect      = !group.children;

          if (!open) {
            return (
              <button
                key={group.key}
                title={group.label}
                className={`sb-group-btn icon-mode ${isGroupActive ? 'active' : ''}`}
                onClick={() =>
                  isDirect && group.path
                    ? onNav(group.key, group.path)
                    : toggleGroup(group.key)
                }
              >
                {group.icon}
              </button>
            );
          }

          return (
            <div key={group.key}>
              <button
                className={`sb-group-btn row-mode ${isGroupActive ? 'active' : ''}`}
                onClick={() =>
                  isDirect && group.path
                    ? onNav(group.key, group.path)
                    : toggleGroup(group.key)
                }
                style={{ justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', width: 18, justifyContent: 'center', flexShrink: 0 }}>
                    {group.icon}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {group.label}
                  </span>
                </span>
                {!isDirect && (
                  <span style={{ display: 'flex', alignItems: 'center', opacity: 0.5 }}>
                    {isExpanded ? <IChevDown /> : <IChevRight />}
                  </span>
                )}
                {isDirect && isGroupActive && <span className="sb-dot" />}
              </button>

              {!isDirect && group.children && (
                <div
                  className="sb-children"
                  style={{
                    maxHeight: isExpanded ? `${group.children.length * 36}px` : '0px',
                    opacity:   isExpanded ? 1 : 0,
                  }}
                >
                  <div style={{ paddingBottom: 4 }}>
                    {group.children.map(child => (
                      <button
                        key={child.key}
                        className={`sb-sub-btn ${active === child.key ? 'active' : ''}`}
                        onClick={() => onNav(child.key, child.path)}
                      >
                        <span style={{
                          width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                          background: active === child.key
                            ? '#7dd3d8'
                            : 'rgba(255,255,255,0.25)',
                        }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {child.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Logout */}
      <div style={{
        padding: open ? '6px 8px' : '6px 0',
        display: 'flex', flexDirection: 'column',
        alignItems: open ? 'stretch' : 'center',
        flexShrink: 0,
      }}>
        {open ? (
          <button
            className="sb-group-btn row-mode"
            onClick={onLogout}
            style={{ color: '#f87171' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', width: 18, justifyContent: 'center', flexShrink: 0 }}>
                <ILogout />
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Logout</span>
            </span>
          </button>
        ) : (
          <button
            className="sb-group-btn icon-mode"
            onClick={onLogout}
            title="Logout"
            style={{ color: '#f87171' }}
          >
            <ILogout />
          </button>
        )}
      </div>

      {/* Grip */}
      <div className="sb-grip" onClick={() => setOpen(o => !o)}>
        <div className="sb-grip-line" />
        <div className="sb-grip-line" />
        <div className="sb-grip-line" />
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────
   MOBILE BOTTOM NAV
───────────────────────────────────────── */
function MobileNav({ active, onNav, onLogout }: AdminSidebarProps) {
  const ag = activeGroupKey(active);

  return (
    <nav className="mob-nav">
      {NAV_GROUPS.map(g => (
        <button
          key={g.key}
          className={`mob-btn ${ag === g.key ? 'active' : ''}`}
          onClick={() =>
            g.path
              ? onNav(g.key, g.path)
              : onNav(g.key, g.children?.[0]?.path ?? '/')
          }
        >
          {g.icon}
          <span className="mob-lbl">{g.label}</span>
        </button>
      ))}
      <button className="mob-btn" onClick={onLogout} style={{ color: '#f87171' }}>
        <ILogout />
        <span className="mob-lbl">Logout</span>
      </button>
    </nav>
  );
}

/* ─────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────── */
export default function AdminSidebar(props: AdminSidebarProps) {
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <DesktopSidebar {...props} />
      <MobileNav      {...props} />
    </>
  );
}