'use client';
// src/components/NoAccessHome.tsx
// Shown when somebody lands on a screen their access profile does not include.
//
// It does NOT have to be the end of the road: the signed-in person almost
// always has SOME screens open, so this lists them (in menu order) as buttons.
// That is what stops the panel looking broken after a sign-in that was "sent"
// to the dashboard by an old bookmark or by the login screen's default.
import React from 'react';
import Link from 'next/link';
import { allowedNavLeaves } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import { logoutAdmin } from '@/lib/logout';

export default function NoAccessHome({ screen }: { screen: string }) {
  const { perms, loaded, superAdmin } = useMyAccess();
  const leaves = allowedNavLeaves(perms, loaded, superAdmin);

  /* group them so the list reads like the sidebar, not like a wall of buttons */
  const byGroup = new Map<string, { label: string; path: string }[]>();
  for (const leaf of leaves) {
    if (!byGroup.has(leaf.group)) byGroup.set(leaf.group, []);
    byGroup.get(leaf.group)!.push({ label: leaf.label, path: leaf.path });
  }

  return (
    <div className="nah-page">
      <style>{CSS}</style>
      <div className="nah-card">
        <div className="nah-mark" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1e3a40" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="10" rx="2.5" />
            <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
          </svg>
        </div>
        <h1>No access to {screen}</h1>
        <p className="nah-sub">
          Your access profile does not include this screen. An administrator can grant it in{' '}
          <b>System Settings → User Settings → Access Profile Creation</b>, then it appears for you at
          once — you do not have to sign out.
        </p>

        {byGroup.size > 0 ? (
          <>
            <div className="nah-head">What you can open</div>
            <div className="nah-groups">
              {[...byGroup.entries()].map(([group, items]) => (
                <div key={group} className="nah-group">
                  <div className="nah-group-name">{group}</div>
                  <div className="nah-links">
                    {items.map((it) => (
                      <Link key={it.path} href={it.path} className="nah-link">{it.label}</Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="nah-none">
            You have <b>no access profile</b> yet, so no screen is open to you.
            <br />
            Ask your administrator to assign one on <b>Assign Profiles</b>.
          </div>
        )}

        <div className="nah-foot">
          {byGroup.size > 0 && (
            <span className="nah-foot-note">
              These are all the screens your access profile opens. Anything else, ask your administrator.
            </span>
          )}
          <button
            type="button"
            className="nah-signout"
            onClick={() => { void logoutAdmin().finally(() => window.location.assign('/admin-login')); }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .nah-page{min-height:100vh;background:#c2d4d4;display:flex;align-items:center;justify-content:center;padding:32px 16px;font-family:'Inter',system-ui,sans-serif}
  .nah-card{background:#eef4f4;border:1px solid rgba(30,58,64,0.10);border-radius:16px;box-shadow:0 10px 30px rgba(30,58,64,.14);max-width:720px;width:100%;padding:30px 34px 26px}
  .nah-mark{font-size:26px;line-height:1}
  .nah-card h1{margin:10px 0 6px;font-size:20px;font-weight:800;color:#16333a}
  .nah-sub{margin:0;font-size:13px;line-height:1.7;color:#3c5a60;max-width:600px}
  .nah-head{margin:22px 0 10px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5b6d72}
  .nah-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
  .nah-group{background:#fff;border:1px solid rgba(30,58,64,0.12);border-radius:12px;padding:12px 14px}
  .nah-group-name{font-size:11.5px;font-weight:800;color:#1e3a40;margin-bottom:9px}
  .nah-links{display:flex;flex-wrap:wrap;gap:8px}
  .nah-link{display:inline-flex;align-items:center;height:30px;padding:0 13px;border-radius:999px;background:#eaf3f2;border:1px solid rgba(30,58,64,0.18);color:#16333a;font-size:12px;font-weight:700;text-decoration:none}
  .nah-link:hover{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .nah-foot{margin-top:22px;padding-top:14px;border-top:1px solid rgba(30,58,64,0.12);display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
  .nah-foot-note{font-size:11.5px;color:#5b6d72}
  .nah-signout{height:32px;padding:0 16px;border-radius:8px;border:1px solid rgba(30,58,64,0.2);background:transparent;color:#16333a;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
  .nah-signout:hover{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .nah-none{margin-top:20px;font-size:13px;line-height:1.8;color:#8a2f2f;background:#fff5f5;border:1px dashed #f0a9a9;border-radius:12px;padding:14px 16px}
`;
