'use client';
// User Groups — System Settings > User Settings > User Groups
// Saves straight into tbl_usergroups (GroupId char(10) PK, GroupDes).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

interface GroupRow { groupId: string; groupDes: string; users: number }

export default function UserGroupsPage() {
  const router = useRouter();
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>('');   // '' = a new group is being typed
  const [groupDes, setGroupDes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/security/groups', { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: GroupRow[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the groups');
      setGroups(json.data ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the groups', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.groupId.toLowerCase().includes(q) || g.groupDes.toLowerCase().includes(q));
  }, [groups, search]);

  const current = groups.find((g) => g.groupId === selected) || null;
  const isNew = !selected;
  const dirty = isNew ? groupDes.trim() !== '' : !!current && current.groupDes !== groupDes;

  const pick = (g: GroupRow) => { setSelected(g.groupId); setGroupDes(g.groupDes); };
  const clear = () => { setSelected(''); setGroupDes(''); };

  async function handleSave() {
    if (!groupDes.trim()) { showToast('Type the group name first', true); return; }
    setBusy(true);
    try {
      if (isNew) {
        const res = await fetch('/api/security/groups', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupDes: groupDes.trim() }),
        });
        const json = await res.json() as { success?: boolean; data?: GroupRow; message?: string };
        if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not save the group');
        showToast(`Group ${json.data?.groupId} saved ✓`);
        await load();
        if (json.data?.groupId) pick({ groupId: json.data.groupId, groupDes: groupDes.trim(), users: 0 });
      } else {
        const res = await fetch(`/api/security/groups/${encodeURIComponent(selected)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupDes: groupDes.trim() }),
        });
        const json = await res.json() as { success?: boolean; message?: string };
        if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not update the group');
        showToast('Group updated ✓');
        await load();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!current) { showToast('Select a group first', true); return; }
    if (!window.confirm(`Delete group ${current.groupId} (${current.groupDes})?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/security/groups/${encodeURIComponent(current.groupId)}`, { method: 'DELETE' });
      const json = await res.json() as { success?: boolean; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not delete the group');
      showToast('Group deleted ✓');
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
      <style>{CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div className="shell">
        <AdminSidebar active="settings-user-groups" onNav={(_key, path) => router.push(path)} onLogout={() => router.push('/admin-login')} />

        <div className="main">
          <header className="head">
            <h1>USER GROUPS</h1>
            <span className="head-note">{loading ? 'Loading…' : `${groups.length} group(s)`}</span>
          </header>

          <div className="body">
            <aside className="panel">
              <div className="panel-search">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search groups…" />
              </div>
              <button className={`new-btn ${isNew ? 'on' : ''}`} onClick={clear}>+ New Group</button>
              <div className="list">
                {loading && <div className="empty">Loading…</div>}
                {!loading && filtered.length === 0 && <div className="empty">No groups yet — start with the form.</div>}
                {filtered.map((g) => (
                  <button key={g.groupId} className={`row ${selected === g.groupId ? 'on' : ''}`} onClick={() => pick(g)}>
                    <span className="row-id">{g.groupId}</span>
                    <span className="row-des">{g.groupDes}</span>
                    <span className="row-users">{g.users} user(s)</span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="card">
              <div className="fld">
                <label>Group ID</label>
                <input className="mono" value={isNew ? '(assigned on save)' : selected} disabled />
              </div>
              <div className="fld">
                <label>Group Description</label>
                <input
                  value={groupDes}
                  onChange={(e) => setGroupDes(e.target.value)}
                  placeholder="e.g. Manager, Cashier, Store Keeper"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && dirty && !busy) void handleSave(); }}
                />
              </div>
              {!isNew && current && (
                <div className="hint">{current.users} user(s) belong to this group.</div>
              )}
              <div className="actions">
                <button className="btn" onClick={clear} disabled={busy}>Clear</button>
                <div className="flex" />
                {!isNew && (
                  <button className="btn danger" onClick={handleDelete} disabled={busy}>Delete</button>
                )}
                <button className="btn primary" onClick={() => void handleSave()} disabled={busy || !dirty}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
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
  .panel{width:380px;flex-shrink:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0}
  .panel-search input{width:100%;height:38px;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:0 12px;font-size:13px;outline:none;font-family:inherit}
  .new-btn{height:38px;border:1.5px dashed rgba(30,58,64,0.35);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
  .new-btn.on{background:#1e3a40;color:#fff;border-color:#1e3a40}
  .list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
  .empty{text-align:center;color:#8496a0;font-size:12.5px;padding:26px 8px}
  .row{text-align:left;background:#fff;border:1px solid rgba(30,58,64,0.14);border-radius:11px;padding:10px 12px;display:grid;grid-template-columns:96px 1fr auto;gap:8px;align-items:center;cursor:pointer;font-family:inherit}
  .row:hover{border-color:#1e3a40}
  .row.on{border-color:#1e3a40;background:#eaf3f2;box-shadow:0 2px 10px rgba(30,58,64,0.10)}
  .row-id{font-family:ui-monospace,monospace;font-weight:800;color:#0b5cab;font-size:12px}
  .row-des{font-weight:700;color:#1e3a40;font-size:13px}
  .row-users{font-size:11px;color:#8496a0}
  .card{flex:1;min-width:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:16px;height:max-content}
  .fld label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3c5a60;margin-bottom:6px}
  .fld input{width:100%;max-width:460px;height:40px;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;background:#fff}
  .fld input{color:#16333a;font-weight:600}
  .fld input::placeholder{color:#9fb0b4;font-weight:400}
  .fld input:disabled{background:#f2f6f6;color:#5b6d72}
  .mono{font-family:ui-monospace,monospace;font-weight:700}
  .hint{font-size:12px;color:#6b7280}
  .actions{display:flex;gap:10px;align-items:center;border-top:1px solid rgba(30,58,64,0.12);padding-top:16px}
  .actions .flex{flex:1}
  .btn{height:38px;padding:0 18px;border:1px solid rgba(30,58,64,0.2);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.danger{background:#fff;border-color:#e2503c;color:#e2503c}
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e3a40;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .toast.err{background:#b91c1c}
  @media(max-width:860px){.panel{width:100%}
    .body{flex-direction:column}}
`;
