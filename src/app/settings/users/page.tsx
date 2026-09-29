'use client';
// Users — System Settings > User Settings > Users
// Saves straight into tbl_userdetails; the group dropdown reads tbl_usergroups.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from "@/lib/useMyAccess";
import NoAccess from "@/components/NoAccess";
import AccessLoading from "@/components/AccessLoading";
import AccessProfilePrintSheet, { ACCESS_PROFILE_PRINT_CSS } from '@/components/AccessProfilePrintSheet';

interface UserRow {
  userId: string; logName: string; userName: string; groupId: string; groupDes: string;
  nic: string; contNo: string; email: string; workingLocID: string; enable: boolean; rmks: string;
  profiles: string[];            // access profile codes assigned on "Assign Profiles"
}
interface GroupOpt { groupId: string; groupDes: string }
interface LocOpt { LocCode: string; LocDes: string }

const EMPTY = {
  logName: '', userName: '', psw: '', psw2: '', groupId: '', nic: '', address: '',
  workingLocID: '', contNo: '', email: '', rmks: '', enable: true,
};
type FormState = typeof EMPTY;

function UsersPageContent() {
  const access = useMyAccess();
  const canNewUser = !access.enforce || access.has("USERS", "NEW_USER");
  const canCancelU = !access.enforce || access.has("USERS", "CANCEL");
  const canSaveU = !access.enforce || access.has("USERS", "SAVE");

  const router = useRouter();
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [locations, setLocations] = useState<LocOpt[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>('');   // '' = a new user is being typed
  const [form, setForm] = useState<FormState>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, gRes, lRes] = await Promise.all([
        fetch('/api/security/users', { cache: 'no-store' }),
        fetch('/api/security/groups', { cache: 'no-store' }),
        fetch('/api/locations', { cache: 'no-store' }),
      ]);
      const uJson = await uRes.json() as { success?: boolean; data?: UserRow[]; message?: string };
      const gJson = await gRes.json() as { success?: boolean; data?: GroupOpt[] };
      const lJson = await lRes.json() as { success?: boolean; data?: LocOpt[]; locations?: LocOpt[] };
      if (!uRes.ok || !uJson?.success) throw new Error(uJson?.message || 'Could not load the users');
      setUsers(uJson.data ?? []);
      if (gJson?.success) setGroups(gJson.data ?? []);
      const locRows = (lJson?.data ?? lJson?.locations ?? []) as LocOpt[];
      if (lJson?.success) setLocations(locRows);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the users', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.userId.toLowerCase().includes(q) || u.userName.toLowerCase().includes(q) ||
      u.logName.toLowerCase().includes(q) || u.groupDes.toLowerCase().includes(q));
  }, [users, search]);

  const current = users.find((u) => u.userId === selected) || null;
  const isNew = !selected;
  const dirty = useMemo(() => {
    if (isNew) return JSON.stringify(form) !== JSON.stringify(EMPTY);
    if (!current) return false;
    return (
      form.logName !== current.logName || form.userName !== current.userName ||
      form.groupId !== current.groupId || form.nic !== current.nic ||
      form.contNo !== current.contNo || form.email !== current.email ||
      form.workingLocID !== current.workingLocID || form.rmks !== current.rmks ||
      form.enable !== current.enable || form.psw !== ''
    );
  }, [form, current, isNew]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function pick(u: UserRow) {
    setSelected(u.userId);
    setForm({
      logName: u.logName, userName: u.userName, psw: '', psw2: '', groupId: u.groupId,
      nic: u.nic, address: '', workingLocID: u.workingLocID, contNo: u.contNo,
      email: u.email, rmks: u.rmks, enable: u.enable,
    });
  }
  const clear = () => { setSelected(''); setForm(EMPTY); };

  async function handleSave() {
    if (!form.logName.trim()) { showToast('Type the login name first', true); return; }
    if (!form.userName.trim()) { showToast('Type the user name first', true); return; }
    if (isNew && !form.psw.trim()) { showToast('Type a password first', true); return; }
    if (form.psw.trim() && form.psw !== form.psw2) { showToast('The two passwords do not match', true); return; }
    setBusy(true);
    try {
      const body = {
        logName: form.logName.trim(), userName: form.userName.trim(), groupId: form.groupId,
        nic: form.nic.trim(), address: form.address.trim(), workingLocID: form.workingLocID,
        contNo: form.contNo.trim(), email: form.email.trim(), rmks: form.rmks.trim(), enable: form.enable,
        ...(form.psw.trim() ? { psw: form.psw } : {}),
      };
      const res = isNew
        ? await fetch('/api/security/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, psw: form.psw }) })
        : await fetch(`/api/security/users/${encodeURIComponent(selected)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json() as { success?: boolean; data?: { userId: string }; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Save failed');
      showToast(isNew ? `User ${json.data?.userId} saved ✓` : 'User updated ✓');
      const keep = json.data?.userId || selected;
      clear();
      await load();
      if (keep) {
        const hit = (users.find((u) => u.userId === keep) ? true : false) || true;
        if (hit) setSelected(keep);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
    } finally {
      setBusy(false);
    }
  }

  const [printData, setPrintData] = useState<{ subject: string; keys: { screenCode: string; actionCode: string }[]; locations: string[] } | null>(null);
  /* What this person may do = every access profile assigned to them, added up.
     The old per-user "role customization" (and the button that opened it) is
     gone: profiles are created on Access Profile Creation and handed out on
     Assign Profiles. This button only PRINTS the result. */
  async function handlePrintAccess() {
    if (!current) return;
    try {
      const res = await fetch(`/api/security/users/${encodeURIComponent(current.userId)}/effective-access`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: { keys?: { screenCode: string; actionCode: string }[]; locations?: string[]; profiles?: string[] }; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the permissions');
      const gname = groups.find((g) => g.groupId === current.groupId)?.groupDes ?? current.groupId;
      const locLabels = locations
        .filter((l) => (json.data?.locations ?? []).map((x) => String(x).trim()).includes(l.LocCode.trim()))
        .map((l) => `${l.LocDes.trim()} (${l.LocCode.trim()})`);
      const profileLine = (json.data?.profiles ?? []).length > 0 ? (json.data?.profiles ?? []).join(', ') : 'none';
      setPrintData({
        subject: `User: ${current.userName} (${current.userId}) · Group: ${gname} (${current.groupId}) · Profiles: ${profileLine}`,
        keys: json.data?.keys ?? [],
        locations: locLabels,
      });
      setTimeout(() => window.print(), 60);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not print', true);
    }
  }

  async function handleDelete() {
    if (!current) { showToast('Select a user first', true); return; }
    if (!window.confirm(`Delete user ${current.userId} (${current.userName})?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/security/users/${encodeURIComponent(current.userId)}`, { method: 'DELETE' });
      const json = await res.json() as { success?: boolean; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not delete the user');
      showToast('User deleted ✓');
      clear();
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{ACCESS_PROFILE_PRINT_CSS}</style>
      <style>{CSS}</style>

      {printData && (
        <AccessProfilePrintSheet
          title="USER ACCESS (ALL PROFILES)"
          subject={printData.subject}
          keys={printData.keys}
          locations={printData.locations}
        />
      )}

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div className="shell">
        <AdminSidebar active="settings-users" onNav={(_key, path) => router.push(path)} onLogout={() => router.push('/admin-login')} />

        <div className="main">
          <header className="head">
            <h1>USERS</h1>
            <span className="head-note">{loading ? 'Loading…' : `${users.length} user(s)`}</span>
          </header>

          <div className="body">
            <aside className="panel">
              <div className="panel-search">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" />
              </div>
              {canNewUser && (
              <button className={`new-btn ${isNew ? 'on' : ''}`} onClick={clear}>+ New User</button>
              )}
              <div className="list">
                {loading && <div className="empty">Loading…</div>}
                {!loading && filtered.length === 0 && <div className="empty">No users yet — start with the form.</div>}
                {filtered.map((u) => (
                  <button key={u.userId} className={`row ${selected === u.userId ? 'on' : ''}`} onClick={() => pick(u)}>
                    <span className="row-id">{u.userId}</span>
                    <span className="row-mid">
                      <span className="row-name">{u.userName}</span>
                      <span className="row-sub">{u.logName}{u.groupDes ? ` · ${u.groupDes}` : ' · (no group)'}</span>
                    </span>
                    <span className={`chip ${u.profiles?.length ? 'ok' : 'warn'}`}>
                      {u.profiles?.length ? `${u.profiles.length} profile(s)` : 'No profile'}
                    </span>
                    <span className={`chip ${u.enable ? 'ok' : 'warn'}`}>{u.enable ? 'Enabled' : 'Disabled'}</span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="card">
              <div className="grid">
                <div className="fld">
                  <label>User ID</label>
                  <input className="mono" value={isNew ? '(assigned on save)' : selected} disabled />
                </div>
                <div className="fld">
                  <label>Login Name *</label>
                  <input value={form.logName} onChange={(e) => set({ logName: e.target.value })} placeholder="used at the login screen" />
                </div>
                <div className="fld">
                  <label>Full Name *</label>
                  <input value={form.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="shown on receipts / prints" />
                </div>
                <div className="fld">
                  <label>User Group</label>
                  <select value={form.groupId} onChange={(e) => set({ groupId: e.target.value })}>
                    <option value="">— choose a group —</option>
                    {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupDes} ({g.groupId})</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>Password {isNew ? '*' : ''}</label>
                  <input type="password" value={form.psw} onChange={(e) => set({ psw: e.target.value })}
                         placeholder={isNew ? 'type a password' : 'leave blank to keep the current one'} autoComplete="new-password" />
                </div>
                <div className="fld">
                  <label>Password Again {form.psw ? '*' : ''}</label>
                  <input type="password" value={form.psw2} onChange={(e) => set({ psw2: e.target.value })} autoComplete="new-password" />
                </div>
                <div className="fld">
                  <label>NIC</label>
                  <input value={form.nic} onChange={(e) => set({ nic: e.target.value })} />
                </div>
                <div className="fld">
                  <label>Contact No</label>
                  <input value={form.contNo} onChange={(e) => set({ contNo: e.target.value })} />
                </div>
                <div className="fld">
                  <label>Email</label>
                  <input value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </div>
                <div className="fld">
                  <label>Working Location</label>
                  <select value={form.workingLocID} onChange={(e) => set({ workingLocID: e.target.value })}>
                    <option value="">— any / head office —</option>
                    {locations.map((l) => <option key={l.LocCode} value={l.LocCode}>{l.LocDes} ({l.LocCode})</option>)}
                  </select>
                </div>
                <div className="fld wide">
                  <label>Address</label>
                  <input value={form.address} onChange={(e) => set({ address: e.target.value })} />
                </div>
                <div className="fld wide">
                  <label>Remarks</label>
                  <input value={form.rmks} onChange={(e) => set({ rmks: e.target.value })} />
                </div>
                <label className="check">
                  <input type="checkbox" checked={form.enable} onChange={(e) => set({ enable: e.target.checked })} />
                  <span>Enabled — the user can log in</span>
                </label>
                {!isNew && current && (
                  <div className="prof-note">
                    Access profiles: {current.profiles?.length
                      ? <b>{current.profiles.join(', ')}</b>
                      : <b className="prof-warn">none — this person can sign in but sees an empty panel</b>}
                    <span className="prof-sub"> — give them one on System Settings → User Settings → <b>Assign Profiles</b>. The group above only labels the person; it no longer carries permissions.</span>
                  </div>
                )}
              </div>

              <div className="actions">
                {canCancelU && (
                <button className="btn" onClick={clear} disabled={busy}>Clear</button>
                )}
                <div className="flex" />
                {!isNew && current && (
                  <button
                    className="btn"
                    onClick={() => router.push('/settings/assign-profiles')}
                    disabled={busy}
                    title="Access profiles are given to a person on System Settings → User Settings → Assign Profiles"
                  >
                    Assign Profiles
                  </button>
                )}
                {!isNew && current && (
                  <button className="btn" onClick={() => void handlePrintAccess()} disabled={busy} title="Print every permission this person gets from their assigned profiles">
                    Print Access
                  </button>
                )}
                {!isNew && (
                  <button className="btn danger" onClick={handleDelete} disabled={busy}>Delete</button>
                )}
                {canSaveU && (
                <button className="btn primary" onClick={() => void handleSave()} disabled={busy || !dirty}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                )}
              </div>
            </section>
          </div>
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
  .body{flex:1;display:flex;gap:12px;min-height:0}
  .panel{width:400px;flex-shrink:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0}
  .panel-search input{width:100%;height:38px;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:0 12px;font-size:13px;outline:none;font-family:inherit}
  .new-btn{height:38px;border:1.5px dashed rgba(30,58,64,0.35);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
  .new-btn.on{background:#1e3a40;color:#fff;border-color:#1e3a40}
  .list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
  .empty{text-align:center;color:#8496a0;font-size:12.5px;padding:26px 8px}
  .row{text-align:left;background:#fff;border:1px solid rgba(30,58,64,0.14);border-radius:11px;padding:9px 12px;display:grid;grid-template-columns:86px 1fr auto;gap:8px;align-items:center;cursor:pointer;font-family:inherit}
  .row:hover{border-color:#1e3a40}
  .row.on{border-color:#1e3a40;background:#eaf3f2;box-shadow:0 2px 10px rgba(30,58,64,0.10)}
  .row-id{font-family:ui-monospace,monospace;font-weight:800;color:#0b5cab;font-size:11.5px}
  .row-mid{display:flex;flex-direction:column;gap:2px;min-width:0}
  .row-name{font-weight:700;color:#1e3a40;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row-sub{font-size:11px;color:#8496a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chip{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:.03em}
  .chip.ok{background:#dcfce7;color:#166534}
  .chip.warn{background:#fee2e2;color:#b91c1c}
  .card{flex:1;min-width:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;gap:16px;height:max-content}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px;max-width:860px}
  .fld label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3c5a60;margin-bottom:6px}
  .fld input,.fld select{width:100%;height:38px;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:0 12px;font-size:13px;font-family:inherit;background:#fff}
  /* filled values read dark and solid — only placeholders stay light */
  .fld input,.fld select{color:#16333a;font-weight:600}
  .fld input::placeholder{color:#9fb0b4;font-weight:400}
  .fld input:disabled{background:#f2f6f6;color:#5b6d72}
  .fld.wide{grid-column:span 2}
  .mono{font-family:ui-monospace,monospace;font-weight:700}
  .check{display:flex;align-items:center;gap:9px;grid-column:span 2;font-size:13px;color:#1e3a40;font-weight:600;cursor:pointer}
  .check input{width:17px;height:17px;accent-color:#1e3a40}
  .prof-note{grid-column:span 2;font-size:12.5px;color:#3c5a60;background:#fff;border:1px solid rgba(30,58,64,0.12);border-radius:10px;padding:9px 12px;line-height:1.6}
  .prof-note b{color:#1e3a40}
  .prof-warn{color:#b91c1c}
  .prof-sub{color:#7d8f94}
  .actions{display:flex;gap:10px;align-items:center;border-top:1px solid rgba(30,58,64,0.12);padding-top:16px}
  .actions .flex{flex:1}
  .btn{height:38px;padding:0 18px;border:1px solid rgba(30,58,64,0.2);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.danger{background:#fff;border-color:#e2503c;color:#e2503c}
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e3a40;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .toast.err{background:#b91c1c}
  @media(max-width:900px){.panel{width:100%}.body{flex-direction:column}.grid{grid-template-columns:1fr}.fld.wide{grid-column:span 1}}
`;
export default function UsersPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}><AccessLoading /></div>;
  if (enforce && !(has("ADMINGRP", "ACCESS") && has("USERGEN", "ACCESS") && has("USERS", "ACCESS"))) return <NoAccess screen="Users" />;
  return <UsersPageContent />;
}
