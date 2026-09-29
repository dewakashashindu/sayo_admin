'use client';
// Start-up Settings — System Settings > Start-up Settings
//
// 2026-09-29 — the menu entry existed but the page behind it did not (the link
// answered 404). This is the placeholder the shop asked for: the shape of the
// screen is here, and the settings it will hold are listed so nothing is
// forgotten. Nothing is written to the database yet — when the list of fields
// is settled, each one gets its row here and a Save that writes it.
import React from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import NoAccess from '@/components/NoAccess';
import AccessLoading from '@/components/AccessLoading';

const PLANNED: { group: string; items: string[] }[] = [
  {
    group: 'Defaults for new records',
    items: [
      'Default working location (branch) for a new user',
      'Default item category / unit on the item master',
      'Default booking type and service duration for online bookings',
    ],
  },
  {
    group: 'Numbers and documents',
    items: [
      'The series counters (Tbl_Serials): invoice, booking, PO, GRN … and their prefix/padding',
      'Whether a bill number may be reused after a revert',
      'Print header/footer text used on receipts and reports',
    ],
  },
  {
    group: 'Day-to-day behaviour',
    items: [
      'Session length (now the SESSION_HOURS setting in .env)',
      'How many minutes before an appointment the reminder SMS goes out',
      'Whether the panel shows a warning when a person has no access profile',
    ],
  },
  {
    group: 'Housekeeping',
    items: [
      'When to prune the sign-in attempt counters (Tbl_RateLimit)',
      'Automatic database backup reminder',
    ],
  },
];

function StartupSettingsContent() {
  const router = useRouter();
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{CSS}</style>
      <div className="shell">
        <AdminSidebar active="settings-startup" onNav={(_key, path) => router.push(path)} onLogout={() => router.push('/admin-login')} />
        <div className="main">
          <header className="head">
            <h1>START-UP SETTINGS</h1>
            <span className="head-note">placeholder — decide what goes here next</span>
          </header>

          <section className="card">
            <p className="lead">
              This screen is reserved for the settings that are decided once and then used everywhere. It is
              deliberately empty for now: nothing here is saved yet, and no other screen is affected by it.
            </p>
            <p className="lead small">
              Tell me which of the items below you want first (or add your own) and each one gets a field on this
              page, a <b>Save</b> button, and a row in the database — the way the rest of this panel works.
            </p>

            <div className="grid">
              {PLANNED.map((block) => (
                <div key={block.group} className="block">
                  <div className="block-title">{block.group}</div>
                  <ul>
                    {block.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <div className="note">
              Permissions: this screen answers to <b>SETUP.ACCESS</b> (see it) and <b>SETUP.SAVE</b> (change it) —
              both are tickable in <b>Access Profile Creation</b>.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const CSS = `
  .shell{display:flex;height:100vh;overflow:hidden;background:#c2d4d4;font-family:'Inter',system-ui,sans-serif}
  .main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:14px 16px 26px;gap:12px}
  .head{background:#dae6e6;height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 18px;gap:12px;border-bottom:1px solid rgba(0,0,0,0.06);border-radius:14px}
  .head h1{font-size:15px;font-weight:800;letter-spacing:.05em;color:#1e3a40;margin:0}
  .head-note{font-size:12px;color:#6b7280;margin-left:auto}
  .card{background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;gap:14px}
  .lead{margin:0;font-size:13.5px;color:#1e3a40;line-height:1.75;max-width:900px}
  .lead.small{color:#3c5a60;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
  .block{background:#fff;border:1px solid rgba(30,58,64,0.12);border-radius:12px;padding:14px 16px}
  .block-title{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5b6d72;margin-bottom:8px}
  .block ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
  .block li{font-size:12.8px;color:#1e3a40;line-height:1.5}
  .note{font-size:12px;color:#7d8f94;line-height:1.65}
  .note b{color:#3c5a60}
`;

export default function StartupSettingsPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}><AccessLoading /></div>;
  if (enforce && !(has("SYSSET", "ACCESS") && has("SETUP", "ACCESS"))) return <NoAccess screen="Start-up Settings" />;
  return <StartupSettingsContent />;
}
