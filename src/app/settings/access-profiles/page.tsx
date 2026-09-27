'use client';
// Access Profiles — two modes:
//   A) GROUP mode: System Settings > User Settings > Access Profiles
//      Edits the group's profile → saves to Tbl_UserAccess_StdProfile.
//   B) USER mode:  …/access-profiles?user=USR...(opened from Users > Customize Role)
//      Edits that user's overrides → saves to Tbl_UserAuthorization ONLY
//      (StdProfile is never touched). Rows are seeded from the group profile.
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { ACCESS_TREE, ALL_ACCESS_KEYS, ALL_GROUP_CODES, type AccessNode } from '@/lib/accessCatalog';

interface GroupOpt { groupId: string; groupDes: string; users: number }
interface UserInfo { userId: string; userName: string; groupId: string }
const key = (s: string, a: string) => `${s}.${a}`;

function AccessProfilesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const userParam = (params.get('user') || '').trim();
  const userMode = userParam !== '';

  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [groupId, setGroupId] = useState('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(ALL_GROUP_CODES));
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const gres = await fetch('/api/security/groups', { cache: 'no-store' });
        const gjson = await gres.json() as { success?: boolean; data?: GroupOpt[]; message?: string };
        if (!gres.ok || !gjson?.success) throw new Error(gjson?.message || 'Could not load the groups');
        if (!alive) return;
        setGroups(gjson.data ?? []);

        if (userMode) {
          const res = await fetch(`/api/security/users/${encodeURIComponent(userParam)}`, { cache: 'no-store' });
          const json = await res.json() as { success?: boolean; data?: { userId: string; userName: string; groupId: string }; message?: string };
          if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not load the user');
          if (!alive) return;
          setUser(json.data);
          setGroupId(json.data.groupId);
        } else {
          if ((gjson.data ?? []).length > 0) setGroupId((gjson.data?.[0]?.groupId) ?? '');
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not load', true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMode, userParam, showToast]);

  const loadProfile = useCallback(async (gid: string) => {
    setProfileLoading(true);
    try {
      const url = userMode
        ? `/api/security/users/${encodeURIComponent(userParam)}/access`
        : `/api/security/groups/${encodeURIComponent(gid)}/access`;
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: { keys: { screenCode: string; actionCode: string }[]; seeded?: boolean }; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the profile');
      const s = new Set((json.data?.keys ?? []).map((k) => key(k.screenCode, k.actionCode)));
      setGranted(s);
      setLoaded(new Set(s));
      if (json.data?.seeded) {
        showToast("Starting point copied from the group's saved profile — adjust and Save", false);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the profile', true);
    } finally {
      setProfileLoading(false);
    }
  }, [showToast, userMode, userParam]);

  useEffect(() => {
    if (!userMode && groupId) void loadProfile(groupId);
  }, [groupId, loadProfile, userMode]);

  useEffect(() => {
    if (userMode && user) void loadProfile(user.userId);
  }, [user, loadProfile, userMode]);

  const dirty = useMemo(() => {
    if (granted.size !== loaded.size) return true;
    for (const k of granted) if (!loaded.has(k)) return true;
    return false;
  }, [granted, loaded]);

  const toggle = (screen: string, action: string) => {
    setGranted((prev) => {
      const next = new Set(prev);
      const k = key(screen, action);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const toggleCollapse = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const selectAll = () => setGranted(new Set(ALL_ACCESS_KEYS.map((k) => key(k.screenCode, k.actionCode))));
  const deselectAll = () => setGranted(new Set());
  const cancel = () => setGranted(new Set(loaded));

  async function handleSave() {
    setBusy(true);
    try {
      const keys = [...granted].map((k) => {
        const [screenCode, ...rest] = k.split('.');
        return { screenCode, actionCode: rest.join('.') };
      });
      const url = userMode
        ? `/api/security/users/${encodeURIComponent(userParam)}/access`
        : `/api/security/groups/${encodeURIComponent(groupId)}/access`;
      const res = await fetch(url, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      const json = await res.json() as { success?: boolean; data?: { granted: number }; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not save the profile');
      setLoaded(new Set(granted));
      showToast(
        userMode
          ? `User overrides saved ✓ (${json.data?.granted} permission(s)) — group profile untouched`
          : `Profile saved ✓ (${json.data?.granted} permission(s))`,
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
    } finally {
      setBusy(false);
    }
  }

  const disabled = profileLoading || (!userMode && !groupId) || (userMode && !user);
  const group = groups.find((g) => g.groupId === groupId);

  function ActionChips({ node }: { node: AccessNode }) {
    return (
      <div className="row-actions">
        {node.actions.map((a) => {
          const on = granted.has(key(node.code, a.code));
          return (
            <button
              type="button"
              key={a.code}
              className={`act ${on ? 'on' : ''}`}
              disabled={disabled}
              onClick={() => toggle(node.code, a.code)}
              title={on ? 'Allowed — click to stop allowing' : 'Not allowed — click to allow'}
            >
              <span className="tick">{on ? '✓' : ''}</span>
              {a.label}
            </button>
          );
        })}
      </div>
    );
  }

  function NodeRow({ node, depth }: { node: AccessNode; depth: number }) {
    const hasKids = !!node.children?.length;
    const open = !collapsed.has(node.code);
    return (
      <>
        <div className={`row ${hasKids ? 'grp' : 'leaf'}`} style={{ paddingLeft: 12 + depth * 22 }}>
          <button
            type="button"
            className="row-name"
            onClick={() => hasKids && toggleCollapse(node.code)}
            title={hasKids ? (open ? 'Collapse' : 'Expand') : node.name}
          >
            <span className={`chev ${hasKids ? (open ? 'open' : '') : 'none'}`}>▸</span>
            <span className="row-code">{node.code}</span>
            <span>{node.name}</span>
          </button>
          <ActionChips node={node} />
        </div>
        {hasKids && open && node.children!.map((c) => <NodeRow key={c.code} node={c} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div className="shell">
        <AdminSidebar active={userMode ? 'settings-users' : 'settings-access'} onNav={(_key, path) => router.push(path)} onLogout={() => router.push('/admin-login')} />

        <div className="main">
          <header className="head">
            <h1>ACCESS PROFILES</h1>
            {userMode && <span className="usermode-badge">User Overrides</span>}
            <span className="head-note">{granted.size} permission(s) ticked</span>
          </header>

          <div className="toolbar">
            {userMode ? (
              <div className="user-card">
                <div className="uc-label">Customizing role-based permissions for</div>
                <div className="uc-name">
                  {loading ? 'Loading…' : user ? user.userName : '—'}
                  {user && <span className="uc-id">({user.userId})</span>}
                </div>
                {user && (
                  <div className="uc-role">
                    belongs to role: <b>{groups.length ? (groups.find((g) => g.groupId === user.groupId)?.groupDes ?? user.groupId) : user.groupId}</b> ({user.groupId})
                    <span className="uc-note">— saves into <b>user-specific</b> rows; the group profile stays as it is</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="fld">
                <label>User Group</label>
                <select
                  value={groupId}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (dirty && !window.confirm('Unsaved changes — leave without saving?')) return;
                    setGroupId(next);
                  }}
                  disabled={loading || groups.length === 0}
                >
                  <option value="">{loading ? 'Loading groups…' : groups.length ? '— choose a group —' : '— create a group first (User Groups) —'}</option>
                  {groups.map((g) => (
                    <option key={g.groupId} value={g.groupId}>{g.groupDes} ({g.groupId}){g.users ? ` · ${g.users} user(s)` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex" />
            {userMode && (
              <button className="btn" onClick={() => router.push('/settings/users')}>← Back to Users</button>
            )}
            <button className="btn" onClick={selectAll} disabled={disabled || busy}>Select All</button>
            <button className="btn" onClick={deselectAll} disabled={disabled || busy}>DeSelect All</button>
            <button className="btn danger" onClick={cancel} disabled={!dirty || busy}>Cancel</button>
            <button className="btn primary" onClick={() => void handleSave()} disabled={!dirty || disabled || busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>

          {profileLoading && <div className="profile-note">loading…</div>}
          {!userMode && group && (
            <div className="profile-note">Editing profile for <b>{group.groupDes}</b> ({group.groupId})</div>
          )}

          <section className="card">
            {ACCESS_TREE.map((n) => <NodeRow key={n.code} node={n} depth={0} />)}
          </section>
        </div>
      </div>
    </>
  );
}

export default function AccessProfilesPage() {
  return (
    <Suspense fallback={null}>
      <AccessProfilesInner />
    </Suspense>
  );
}

const CSS = `
  .shell{display:flex;height:100vh;overflow:hidden;background:#c2d4d4;font-family:'Inter',system-ui,sans-serif}
  .main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:14px 16px 26px;gap:12px}
  .head{background:#dae6e6;height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 18px;gap:12px;border-bottom:1px solid rgba(0,0,0,0.06);border-radius:14px}
  .head h1{font-size:15px;font-weight:800;letter-spacing:.05em;color:#1e3a40;margin:0}
  .usermode-badge{background:#0b5cab;color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:4px 10px}
  .head-note{font-size:12px;color:#6b7280;margin-left:auto}
  .toolbar{background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px 16px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
  .toolbar .fld label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3c5a60;margin-bottom:6px}
  .toolbar .fld select{width:360px;max-width:100%;height:38px;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:0 12px;font-size:13px;font-family:inherit;background:#fff;color:#16333a;font-weight:600}
  .flex{flex:1}
  .user-card{line-height:1.5}
  .uc-label{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#5b6d72}
  .uc-name{font-size:16px;font-weight:800;color:#16333a}
  .uc-id{font-size:11px;color:#5b6d72;font-weight:600;margin-left:6px}
  .uc-role{font-size:12px;color:#3c5a60;margin-top:2px}
  .uc-role b{color:#1e3a40}
  .uc-note{font-size:11px;color:#8a9aa0}
  .profile-note{font-size:12.5px;color:#3c5a60;padding:0 4px}
  .profile-note b{color:#1e3a40}
  .card{background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:8px 10px}
  .row{display:flex;align-items:center;gap:16px;padding:7px 12px 7px;border-bottom:1px solid rgba(30,58,64,0.07);border-radius:9px}
  .row.grp{background:rgba(30,58,64,0.04)}
  .row-name{flex:1;min-width:230px;display:flex;align-items:center;gap:11px;background:none;border:none;padding:0;font:inherit;font-size:13px;font-weight:700;color:#16333a;cursor:pointer;text-align:left;font-family:inherit}
  .row.leaf .row-name{cursor:default;font-weight:600}
  .chev{color:#1e3a40;font-size:11px;width:14px;text-align:center;transition:transform .18s ease;flex-shrink:0}
  .chev.open{transform:rotate(90deg)}
  .chev.none{opacity:0}
  .row-code{font-family:ui-monospace,monospace;font-size:10.5px;font-weight:800;color:#0b5cab;background:#e2edf8;border-radius:5px;padding:2px 6px;letter-spacing:.03em;flex-shrink:0}
  .row-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}
  .act{display:inline-flex;align-items:center;gap:7px;height:29px;padding:0 12px;border-radius:999px;border:1px solid rgba(30,58,64,0.22);background:#fff;color:#5b6d72;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .act:disabled{opacity:.45;cursor:not-allowed}
  .act:hover{border-color:#1e3a40}
  .act.on{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .tick{display:inline-flex;width:13px;height:13px;border-radius:4px;border:1.5px solid rgba(30,58,64,0.4);background:#fff;color:#1e3a40;font-size:9px;align-items:center;justify-content:center;font-weight:900}
  .act.on .tick{background:#fff}
  .btn{height:36px;padding:0 16px;border:1px solid rgba(30,58,64,0.2);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.danger{background:#fff;border-color:#e2503c;color:#e2503c}
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e3a40;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .toast.err{background:#b91c1c}
`;
