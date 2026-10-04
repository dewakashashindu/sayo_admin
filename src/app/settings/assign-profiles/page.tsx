'use client';
// Assign Profiles — System Settings > User Settings > Assign Profiles
//
// Pick a person on the left; give them one or MORE access profiles on the
// right. Their rights are the union of every profile they hold — and they can
// be adjusted for that person alone ("Customize"), because what the panel reads
// at runtime is the PERSON's rows in Tbl_UserAuthorization, not the profile.
//
//   Save  →  Tbl_UserAuthorization, one row per screen, one per branch, and one
//            per profile held (Module = 'APF' — the chips you see here).
//
// Gated by its own permissions: ASSIGNP.ACCESS (see the screen) and ASSIGNP.SAVE
// (change who holds what). Until a profile grants ASSIGNP.ACCESS, only the
// hidden super administrator can open this screen — that is on purpose.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from "@/lib/useMyAccess";
import NoAccess from "@/components/NoAccess";
import AccessLoading from "@/components/AccessLoading";
import { ACCESS_TREE, ALL_ACCESS_KEYS, ALL_GROUP_CODES, PARENT_OF, type AccessNode } from '@/lib/accessCatalog';
import AccessProfilePrintSheet, { ACCESS_PROFILE_PRINT_CSS } from '@/components/AccessProfilePrintSheet';

interface UserRow {
  userId: string; logName: string; userName: string; groupId: string; groupDes: string;
  enable: boolean; profiles: string[]; keyCount: number; locations: string[]; customized: boolean;
}
interface ProfileOpt {
  apfCode: string; apfDes: string; users: number; keyCount: number;
  keys: string[]; locations: string[];
}
interface LocOpt { LocCode: string; LocDes: string }

const key = (s: string, a: string) => `${s}.${a}`;
const parseKey = (k: string) => {
  const i = k.indexOf('.');
  return { screenCode: k.slice(0, i), actionCode: k.slice(i + 1) };
};

function AssignProfilesContent() {
  const access = useMyAccess();
  /* The five buttons each have their own chip on the ASSIGNP node of the
     profile tree (Access Profile Creation). Super admin / not-yet-loaded
     screens keep today's behaviour. */
  const can = (action: string) => !access.enforce || access.has("ASSIGNP", action);
  const canSave = can("SAVE");
  const canAddProfile = can("ADD_PROFILE");
  const canCustomize = can("CUSTOMIZE");
  const canPrint = can("PRINT");
  const canRemoveAll = can("REMOVE_ALL");

  const router = useRouter();
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [locations, setLocations] = useState<LocOpt[]>([]);
  const [search, setSearch] = useState('');
  const [onlyWithout, setOnlyWithout] = useState(false);
  const [selected, setSelected] = useState('');
  const [picked, setPicked] = useState<string[]>([]);       // the chips on screen
  const [saved, setSaved] = useState<string[]>([]);         // what the database holds
  const [treeKeys, setTreeKeys] = useState<Set<string>>(new Set());   // this person's ticks
  const [treeLocs, setTreeLocs] = useState<Set<string>>(new Set());
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set());
  const [loadedLocs, setLoadedLocs] = useState<Set<string>>(new Set());
  const [showTree, setShowTree] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(ALL_GROUP_CODES));
  const [picking, setPicking] = useState(false);            // the multi-select popup
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  /* ── data ───────────────────────────────────────────────────────────── */

  /* ── 🐞 the search box ────────────────────────────────────────────────
     The shop reported "typing in the search shows nothing". Two causes were
     possible and both are handled now:
       1. the list never arrived (a failed query was swallowed by a catch and
          the panel just showed "No users match") — a failure is now SHOWN, with
          the server's own message and a Try again button;
       2. the filtering itself — it now happens on the server as well (?q=), so
          the rows are narrowed in SQL and the browser only draws what came back.
     The client-side filter stays on top, so the list reacts instantly while the
     round-trip is in flight. */
  const load = useCallback(async (keepSelection = true, q = '') => {
    setLoading(true);
    try {
      const [aRes, lRes] = await Promise.all([
        fetch(`/api/security/assign-profiles${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' }),
        fetch('/api/locations', { cache: 'no-store' }),
      ]);
      const aJson = await aRes.json() as {
        success?: boolean; message?: string;
        data?: { users?: UserRow[]; profiles?: ProfileOpt[] };
      };
      if (!aRes.ok || !aJson?.success) throw new Error(aJson?.message || 'Could not load this screen');
      setUsers(aJson.data?.users ?? []);
      setProfiles(aJson.data?.profiles ?? []);
      setLoadError('');
      const lJson = await lRes.json() as { success?: boolean; data?: LocOpt[] };
      if (lJson?.success) setLocations(lJson.data ?? []);
      if (!keepSelection) { setSelected(''); setPicked([]); setSaved([]); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load this screen';
      setLoadError(msg);
      showToast(msg, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(false); }, [load]);

  /* typing in the box asks the server again (250 ms after the last keystroke) */
  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => { void load(true, q); }, 250);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [search]);

  /** The ticks the person has in the database right now (their own rows). */
  const loadUserTicks = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/security/users/${encodeURIComponent(userId)}/effective-access`, { cache: 'no-store' });
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: { keys?: { screenCode: string; actionCode: string }[]; locations?: string[]; profiles?: string[] };
      };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the ticks');
      const ks = new Set((json.data?.keys ?? []).map((k) => key(k.screenCode, k.actionCode)));
      const ls = new Set((json.data?.locations ?? []).map((l) => String(l).trim()));
      setTreeKeys(new Set(ks));
      setLoadedKeys(new Set(ks));
      setTreeLocs(new Set(ls));
      setLoadedLocs(new Set(ls));
      setSaved([...(json.data?.profiles ?? [])]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the ticks', true);
    }
  }, [showToast]);

  const current = users.find((u) => u.userId === selected) || null;

  function pick(u: UserRow) {
    if (dirty && !window.confirm('Unsaved changes — leave without saving?')) return;
    setSelected(u.userId);
    setPicked([...u.profiles]);
    setSaved([...u.profiles]);
    setShowTree(false);
    void loadUserTicks(u.userId);
  }

  /* ── what the chips alone would give (the "plain union") ─────────────── */

  const union = useMemo(() => {
    const keys = new Set<string>();
    const locs = new Set<string>();
    for (const code of picked) {
      const p = profiles.find((x) => x.apfCode === code);
      for (const k of p?.keys ?? []) keys.add(k);
      for (const l of p?.locations ?? []) locs.add(l);
    }
    return { keys, locs };
  }, [picked, profiles]);

  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const isCustom = !same(treeKeys, union.keys) || !same(treeLocs, union.locs);

  const dirty = useMemo(() => {
    if (picked.length !== saved.length) return true;
    const s = new Set(saved);
    if (picked.some((c) => !s.has(c))) return true;
    if (!same(treeKeys, loadedKeys)) return true;
    if (!same(treeLocs, loadedLocs)) return true;
    return false;
  }, [picked, saved, treeKeys, loadedKeys, treeLocs, loadedLocs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (onlyWithout && u.profiles.length > 0) return false;
      if (!q) return true;
      return (
        u.userId.toLowerCase().includes(q) || u.userName.toLowerCase().includes(q) ||
        u.logName.toLowerCase().includes(q) || u.groupDes.toLowerCase().includes(q)
      );
    });
  }, [users, search, onlyWithout]);

  const nameOf = useCallback(
    (code: string) => profiles.find((p) => p.apfCode === code)?.apfDes ?? code,
    [profiles],
  );

  /* ── editing the ticks ───────────────────────────────────────────────── */

  const toggleKey = (screen: string, action: string) => {
    setTreeKeys((prev) => {
      const next = new Set(prev);
      const k = key(screen, action);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
        /* anything ticked below ⇒ the chain above it must get Access too */
        let p = PARENT_OF[screen];
        while (p && p !== 'RT') {
          next.add(key(p, 'ACCESS'));
          p = PARENT_OF[p];
        }
      }
      return next;
    });
  };
  const toggleLoc = (code: string) => {
    setTreeLocs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };
  const resetToProfiles = () => {
    setTreeKeys(new Set(union.keys));
    setTreeLocs(new Set(union.locs));
    showToast('Ticks rebuilt from the selected profiles');
  };
  const toggleCollapse = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  /* ── saving / printing ───────────────────────────────────────────────── */

  async function handleSave() {
    if (!current) { showToast('Choose a user first', true); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/security/assign-profiles/${encodeURIComponent(current.userId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apfCodes: picked,
          keys: [...treeKeys].map(parseKey),
          locations: [...treeLocs],
        }),
      });
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: { profiles?: number; keys?: number; locations?: number; customized?: boolean };
      };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not save');
      setSaved([...picked]);
      setLoadedKeys(new Set(treeKeys));
      setLoadedLocs(new Set(treeLocs));
      showToast(
        picked.length === 0 && treeKeys.size === 0
          ? `${current.userName} now has NO access — they will see an empty panel`
          : `${current.userName} ✓ ${json.data?.profiles ?? picked.length} profile(s) · ${json.data?.keys ?? treeKeys.size} permission(s)` +
            (json.data?.customized ? ' (customized)' : ''),
      );
      await load();           // the list's counts + this person's row
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
    } finally {
      setBusy(false);
    }
  }

  const [printData, setPrintData] = useState<{ subject: string; keys: { screenCode: string; actionCode: string }[]; locations: string[] } | null>(null);
  async function handlePrint() {
    if (!current) { showToast('Choose a user first', true); return; }
    setBusy(true);
    try {
      /* the server resolves what the panel itself would allow — saved rows only */
      const res = await fetch(`/api/security/users/${encodeURIComponent(current.userId)}/effective-access`, { cache: 'no-store' });
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: { keys?: { screenCode: string; actionCode: string }[]; locations?: string[]; profiles?: string[] };
      };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the permissions');
      const allowed = (json.data?.locations ?? []).map((x) => String(x).trim());
      const locLabels = locations
        .filter((l) => allowed.includes(l.LocCode.trim()))
        .map((l) => `${l.LocDes.trim()} (${l.LocCode.trim()})`);
      const codes = json.data?.profiles ?? [];
      const profileLine = codes.length > 0 ? codes.map((c) => `${nameOf(c)} (${c})`).join(', ') : 'none';
      setPrintData({
        subject: `${current.userName} (${current.userId}) · ${current.groupDes || 'no group'} · profiles: ${profileLine}`,
        keys: json.data?.keys ?? [],
        locations: locLabels,
      });
      setTimeout(() => window.print(), 60);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not print', true);
    } finally {
      setBusy(false);
    }
  }

  /* ── the permission tree (only shown under "Customize") ──────────────── */

  /* The chips are stored in mask order (ACCESS and Save first, for every
     profile saved before 2026-09-30); they are SHOWN in the order the shop
     asked for. */
  const CHIP_ORDER: Record<string, string[]> = {
    ASSIGNP: ["ACCESS", "ADD_PROFILE", "CUSTOMIZE", "PRINT", "REMOVE_ALL", "SAVE"],
  };
  function orderedActions(node: AccessNode) {
    const order = CHIP_ORDER[node.code];
    if (!order) return node.actions;
    const rank = (code: string) => {
      const i = order.indexOf(code);
      return i === -1 ? order.length : i;
    };
    return [...node.actions].sort((a, b) => rank(a.code) - rank(b.code));
  }

  function ActionChips({ node }: { node: AccessNode }) {
    return (
      <div className="row-actions">
        {orderedActions(node).map((a) => {
          const on = treeKeys.has(key(node.code, a.code));
          return (
            <button
              type="button"
              key={a.code}
              className={`act ${on ? 'on' : ''}`}
              disabled={busy}
              onClick={() => toggleKey(node.code, a.code)}
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
    const open = hasKids ? !collapsed.has(node.code) : false;
    return (
      <>
        <div className={`row ${hasKids ? 'grp' : 'leaf'}`} style={{ paddingLeft: 12 + depth * 22 }}>
          <button
            type="button"
            className="row-name"
            onClick={() => hasKids && toggleCollapse(node.code)}
            title={hasKids ? (open ? 'Collapse' : 'Expand') : node.code}
          >
            <span className={`chev ${hasKids ? (open ? 'open' : '') : 'none'}`}>▸</span>
            <span>{node.name}</span>
          </button>
          <ActionChips node={node} />
        </div>
        {hasKids && open && node.children!.map((c) => <NodeRow key={c.code} node={c} depth={depth + 1} />)}
      </>
    );
  }

  /* ── the screen ──────────────────────────────────────────────────────── */

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{ACCESS_PROFILE_PRINT_CSS}</style>
      <style>{CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      {printData && (
        <AccessProfilePrintSheet title="USER ACCESS (ALL PROFILES)" subject={printData.subject} keys={printData.keys} locations={printData.locations} />
      )}

      {picking && (
        <div className="modal-back" onClick={() => setPicking(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>Add access profiles</h2>
              <span className="modal-sub">{current ? current.userName : ''} — tick as many as you need, then Done</span>
            </header>
            <div className="modal-list">
              {profiles.length === 0 && (
                <div className="empty">No profiles exist yet — create one in <b>Access Profile Creation</b>.</div>
              )}
              {profiles.map((p) => {
                const on = picked.includes(p.apfCode);
                return (
                  <label key={p.apfCode} className={`pick ${on ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...picked, p.apfCode]
                          : picked.filter((c) => c !== p.apfCode);
                        setPicked(next);
                        /* keep the ticks in step with the chips … */
                        const keys = new Set<string>();
                        const locs = new Set<string>();
                        for (const code of next) {
                          const prof = profiles.find((x) => x.apfCode === code);
                          for (const k of prof?.keys ?? []) keys.add(k);
                          for (const l of prof?.locations ?? []) locs.add(l);
                        }
                        /* … but never throw away ticks the admin ticked by hand */
                        const handTicked = !same(treeKeys, union.keys) || !same(treeLocs, union.locs);
                        if (handTicked) {
                          setTreeKeys((prev) => new Set([...keys, ...prev]));
                          setTreeLocs((prev) => new Set([...locs, ...prev]));
                        } else {
                          setTreeKeys(keys);
                          setTreeLocs(locs);
                        }
                      }}
                    />
                    <span className="pick-mid">
                      <span className="pick-name">{p.apfDes}</span>
                      <span className="pick-sub">{p.apfCode} · {p.keyCount} permission(s) · held by {p.users} user(s)</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <footer className="modal-foot">
              <button className="btn" onClick={() => setPicking(false)}>Done</button>
            </footer>
          </div>
        </div>
      )}

      <div className="shell">
        <AdminSidebar active="settings-assign" onNav={(_key, path) => router.push(path)} onLogout={() => router.push('/admin-login')} />

        <div className="main">
          <header className="head">
            <h1>ASSIGN PROFILES</h1>
            <span className="head-note">
              {loading ? 'Loading…' : `${users.length} user(s) · ${profiles.length} profile(s)`}
            </span>
          </header>

          <div className="body">
            <aside className="panel">
              <div className="panel-search">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users…"
                  autoComplete="off"
                  spellCheck={false}
                />
                {search && (
                  <button type="button" className="panel-clear" onClick={() => setSearch('')} title="Clear the search">×</button>
                )}
              </div>
              <label className="filter">
                <input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} />
                <span>Only people with no profile</span>
              </label>
              <div className="count-line">
                {loading ? ' ' : search.trim()
                  ? `${filtered.length} of ${users.length} shown`
                  : `${users.length} user(s)`}
              </div>
              <div className="list">
                {loading && <div className="empty">Loading…</div>}
                {!loading && loadError && (
                  <div className="empty err">
                    {loadError}
                    <button className="retry" onClick={() => void load(true, search.trim())}>Try again</button>
                  </div>
                )}
                {!loading && !loadError && users.length === 0 && (
                  <div className="empty">
                    {search.trim() ? (
                      <>
                        No user matches “{search.trim()}”.
                        <br />
                        <button className="retry" onClick={() => { setSearch(''); void load(true, ''); }}>
                          Clear the search
                        </button>
                      </>
                    ) : onlyWithout ? (
                      'Everyone already holds at least one profile ✓'
                    ) : (
                      <>No users to assign yet.<br />Create them in <b>Administration → User Creation → Users</b>.</>
                    )}
                  </div>
                )}
                {!loading && !loadError && users.length > 0 && filtered.length === 0 && (
                  <div className="empty">
                    {onlyWithout && !search.trim()
                      ? 'Everyone already holds at least one profile ✓'
                      : <>No user matches “{search}”.</>}
                  </div>
                )}
                {filtered.map((u) => (
                  <button key={u.userId} className={`prow ${selected === u.userId ? 'on' : ''}`} onClick={() => pick(u)} disabled={busy}>
                    <span className="prow-id">{u.userId}</span>
                    <span className="prow-mid">
                      <span className="prow-name">{u.userName}</span>
                      <span className="prow-sub">{u.logName}{u.groupDes ? ` · ${u.groupDes}` : ' · (no group)'}</span>
                    </span>
                    {u.profiles.length > 0
                      ? <span className="pchip ok">{u.profiles.length} profile(s)</span>
                      : u.keyCount > 0
                        ? <span className="pchip custom">Own ticks</span>
                        : <span className="pchip warn">None</span>}
                  </button>
                ))}
              </div>
            </aside>

            <section className="card">
              {!current && (
                <div className="hint">
                  Choose a person on the left, then press <b>+ Add Profile</b> to give them one or more access profiles.
                  <div className="hint-sub">
                    A profile is created on the <b>Access Profile Creation</b> screen (System Settings → User Settings).
                    What a person may do is the <b>sum of every profile</b> they hold; with none, they can do nothing.
                    Use <b>Customize</b> afterwards if that one person needs one extra screen (or one less).
                  </div>
                </div>
              )}

              {current && (
                <>
                  <div className="user-head">
                    <div>
                      <div className="uh-label">Access profiles for</div>
                      <div className="uh-name">{current.userName} <span className="uh-id">({current.userId})</span></div>
                      <div className="uh-sub">
                        login <b>{current.logName}</b> · group <b>{current.groupDes || '—'}</b>
                        {' · '}
                        <span className={current.enable ? 'ok-txt' : 'warn-txt'}>{current.enable ? 'enabled' : 'disabled'}</span>
                      </div>
                    </div>
                    <div className="flex" />
                    <div className="count">
                      <div className="count-num">{picked.length}</div>
                      <div className="count-lbl">profile(s)</div>
                    </div>
                    <div className="count">
                      <div className="count-num">{treeKeys.size}</div>
                      <div className="count-lbl">permission(s)</div>
                    </div>
                  </div>

                  <div className="chips">
                    {picked.length === 0 && treeKeys.size === 0 && (
                      <div className="no-chip">No access profile assigned — this person cannot use the panel.</div>
                    )}
                    {picked.length === 0 && treeKeys.size > 0 && (
                      <div className="own-chip">No profile assigned — this person keeps their own saved ticks ({treeKeys.size}).</div>
                    )}
                    {picked.map((code) => {
                      const p = profiles.find((x) => x.apfCode === code);
                      return (
                        <span key={code} className="achip">
                          <span className="achip-name">{p?.apfDes ?? code}</span>
                          <span className="achip-code">{code}</span>
                          <button
                            type="button"
                            className="achip-x"
                            title="Remove this profile"
                            disabled={busy}
                            onClick={() => setPicked((prev) => prev.filter((c) => c !== code))}
                          >×</button>
                        </span>
                      );
                    })}
                    {isCustom && <span className="custom-chip" title="This person's ticks are not just the sum of their profiles">Customized</span>}
                  </div>

                  <div className="actions">
                    {canAddProfile && (
                      <button className="btn" onClick={() => setPicking(true)} disabled={busy || profiles.length === 0}>
                        + Add Profile
                      </button>
                    )}
                    {canCustomize && (
                      <button className={`btn ${showTree ? 'primary' : ''}`} onClick={() => setShowTree((v) => !v)} disabled={busy}>
                        {showTree ? 'Hide Ticks' : 'Customize'}
                      </button>
                    )}
                    {isCustom && (
                      <button className="btn" onClick={resetToProfiles} disabled={busy} title="Throw away the hand-ticked changes and use the profiles again">
                        Reset to Profiles
                      </button>
                    )}
                    {canPrint && (
                      <button className="btn" onClick={() => void handlePrint()} disabled={busy}>Print Access</button>
                    )}
                    <div className="flex" />
                    {canRemoveAll && (
                      <button className="btn danger" disabled={busy || (!dirty)} onClick={() => { setPicked([]); setTreeKeys(new Set()); setTreeLocs(new Set()); }}>
                        Remove All
                      </button>
                    )}
                    {canSave && (
                      <button className="btn primary" onClick={() => void handleSave()} disabled={busy || !dirty}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>

                  {showTree && (
                    <>
                      <section className="tree">
                        {ACCESS_TREE.map((n) => <NodeRow key={n.code} node={n} depth={0} />)}
                      </section>
                      <section className="tree loc-box">
                        <div className="loc-head">Location Access<span className="loc-note">{treeLocs.size} of {locations.length} allowed</span></div>
                        {locations.length === 0 && <div className="loc-empty">No locations found yet — create them in Location Master.</div>}
                        <div className="loc-grid">
                          {locations.map((l) => {
                            const on = treeLocs.has(l.LocCode.trim());
                            return (
                              <button
                                type="button"
                                key={l.LocCode}
                                className={`loc-chip ${on ? 'on' : ''}`}
                                disabled={busy}
                                onClick={() => toggleLoc(l.LocCode.trim())}
                              >
                                <span className="tick">{on ? '✓' : ''}</span>
                                {l.LocDes} ({l.LocCode})
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    </>
                  )}

                </>
              )}
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
  .panel{width:360px;flex-shrink:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0}
  .panel-search{position:relative}
  .panel-search input{width:100%;height:38px;border:1px solid rgba(30,58,64,0.20);border-radius:9px;padding:0 34px 0 12px;font-size:13px;outline:none;font-family:inherit;background:#fff;color:#16333a}
  .panel-search input::placeholder{color:#8fa3a8}
  .panel-search input::-webkit-search-cancel-button,
  .panel-search input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;display:none}
  .panel-search input:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,0.10)}
  .panel-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:24px;height:24px;border:none;border-radius:999px;background:rgba(30,58,64,.10);color:#1e3a40;font-size:14px;line-height:1;cursor:pointer;font-family:inherit}
  .panel-clear:hover{background:#1e3a40;color:#fff}
  .count-line{font-size:11px;color:#7d8f94;font-weight:700;letter-spacing:.03em;padding:0 2px}
  .filter{display:flex;align-items:center;gap:8px;font-size:12px;color:#3c5a60;font-weight:600;padding:0 2px}
  .filter input{width:16px;height:16px;accent-color:#1e3a40}
  .list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
  .empty{text-align:center;color:#8496a0;font-size:12.5px;line-height:1.6;padding:22px 8px}
  .empty.err{color:#b91c1c;background:#fff5f5;border:1px dashed #f0a9a9;border-radius:10px}
  .retry{display:block;margin:10px auto 0;height:30px;padding:0 14px;border:1px solid #e2503c;border-radius:8px;background:#fff;color:#b91c1c;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}
  .prow{text-align:left;background:#fff;border:1px solid rgba(30,58,64,0.14);border-radius:11px;padding:9px 12px;display:grid;grid-template-columns:86px 1fr auto;gap:8px;align-items:center;cursor:pointer;font-family:inherit}
  .prow:hover{border-color:#1e3a40}
  .prow.on{border-color:#1e3a40;background:#eaf3f2;box-shadow:0 2px 10px rgba(30,58,64,0.10)}
  .prow:disabled{opacity:.6;cursor:not-allowed}
  .prow-id{font-family:ui-monospace,monospace;font-weight:800;color:#0b5cab;font-size:11.5px}
  .prow-mid{display:flex;flex-direction:column;gap:2px;min-width:0}
  .prow-name{font-weight:700;color:#1e3a40;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .prow-sub{font-size:11px;color:#8496a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pchip{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:.03em;white-space:nowrap}
  .pchip.ok{background:#dcfce7;color:#166534}
  .pchip.warn{background:#fee2e2;color:#b91c1c}
  .pchip.custom{background:#fef3c7;color:#92400e}
  .card{flex:1;min-width:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
  .hint{font-size:13.5px;color:#3c5a60;line-height:1.7}
  .hint-sub{font-size:12.5px;color:#7d8f94;margin-top:6px}
  .user-head{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}
  .uh-label{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#5b6d72}
  .uh-name{font-size:17px;font-weight:800;color:#16333a}
  .uh-id{font-size:11.5px;color:#5b6d72;font-weight:600;margin-left:4px}
  .uh-sub{font-size:12px;color:#3c5a60;margin-top:2px}
  .uh-sub b{color:#1e3a40}
  .ok-txt{color:#166534;font-weight:700}
  .warn-txt{color:#b91c1c;font-weight:700}
  .count{text-align:center;background:#fff;border:1px solid rgba(30,58,64,0.14);border-radius:11px;padding:6px 14px;min-width:96px}
  .count-num{font-size:19px;font-weight:800;color:#1e3a40;line-height:1.1}
  .count-lbl{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#7d8f94}
  .chips{display:flex;flex-wrap:wrap;gap:9px;min-height:40px;align-items:center}
  .no-chip{font-size:12.5px;color:#b91c1c;font-weight:600;background:#fff5f5;border:1px dashed #f0a9a9;border-radius:10px;padding:9px 12px}
  .own-chip{font-size:12.5px;color:#92400e;font-weight:600;background:#fffbeb;border:1px dashed #f5d97a;border-radius:10px;padding:9px 12px}
  .achip{display:inline-flex;align-items:center;gap:9px;height:36px;padding:0 6px 0 13px;border-radius:999px;background:#1e3a40;color:#fff;font-size:12.5px;font-weight:700}
  .achip-code{font-family:ui-monospace,monospace;font-size:10.5px;opacity:.7}
  .achip-x{width:22px;height:22px;border-radius:999px;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:14px;line-height:1;cursor:pointer;font-family:inherit}
  .achip-x:hover{background:#e2503c}
  .custom-chip{font-size:11px;font-weight:800;letter-spacing:.04em;padding:5px 11px;border-radius:999px;background:#fef3c7;color:#92400e;border:1px solid #f5d97a}
  .actions{display:flex;gap:10px;align-items:center;border-top:1px solid rgba(30,58,64,0.12);padding-top:14px;flex-wrap:wrap}
  .flex{flex:1}
  .btn{height:36px;padding:0 16px;border:1px solid rgba(30,58,64,0.2);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.danger{background:#fff;border-color:#e2503c;color:#e2503c}
  .tree{background:#fff;border:1px solid rgba(30,58,64,0.12);border-radius:12px;padding:6px 10px;max-height:44vh;overflow-y:auto}
  .loc-box{max-height:none}
  .row{display:flex;align-items:center;gap:14px;min-height:38px;padding:5px 10px;border-radius:8px}
  .row.grp{background:rgba(30,58,64,0.04)}
  .row-name{flex:1;min-width:210px;display:flex;align-items:center;gap:11px;background:none;border:none;padding:0;font:inherit;font-size:12.5px;font-weight:700;color:#16333a;cursor:pointer;text-align:left;font-family:inherit}
  .row.leaf .row-name{cursor:default;font-weight:600}
  .chev{color:#1e3a40;font-size:11px;width:14px;text-align:center;transition:transform .18s ease;flex-shrink:0}
  .chev.open{transform:rotate(90deg)}
  .chev.none{opacity:0}
  .row-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}
  .act{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border-radius:999px;border:1px solid rgba(30,58,64,0.22);background:#fff;color:#5b6d72;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .act:disabled{opacity:.45;cursor:not-allowed}
  .act:hover{border-color:#1e3a40}
  .act.on{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .tick{display:inline-flex;width:13px;height:13px;border-radius:4px;border:1.5px solid rgba(30,58,64,0.4);background:#fff;color:#1e3a40;font-size:9px;align-items:center;justify-content:center;font-weight:900}
  .act.on .tick{background:#fff}
  .loc-head{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#3c5a60;display:flex;align-items:center;gap:10px}
  .loc-note{font-size:10.5px;font-weight:600;color:#8a9aa0;letter-spacing:.02em;text-transform:none}
  .loc-empty{font-size:12px;color:#8a9aa0;padding:10px 4px 2px}
  .loc-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .loc-chip{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(30,58,64,0.22);background:#fff;color:#5b6d72;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .loc-chip:disabled{opacity:.45;cursor:not-allowed}
  .loc-chip:hover{border-color:#1e3a40}
  .loc-chip.on{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .loc-chip .tick{display:inline-flex;width:13px;height:13px;border-radius:4px;border:1.5px solid rgba(30,58,64,0.4);background:#fff;color:#1e3a40;font-size:9px;align-items:center;justify-content:center;font-weight:900}
  .modal-back{position:fixed;inset:0;background:rgba(12,28,32,.45);display:flex;align-items:center;justify-content:center;z-index:120}
  .modal{background:#eef4f4;border-radius:16px;width:min(680px,92vw);max-height:82vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden}
  .modal-head{padding:16px 20px;border-bottom:1px solid rgba(30,58,64,.12)}
  .modal-head h2{margin:0;font-size:15px;font-weight:800;color:#1e3a40;letter-spacing:.03em}
  .modal-sub{font-size:12px;color:#5b6d72}
  .modal-list{padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
  .pick{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(30,58,64,.14);border-radius:11px;padding:10px 13px;cursor:pointer}
  .pick.on{border-color:#1e3a40;background:#eaf3f2}
  .pick input{width:17px;height:17px;accent-color:#1e3a40}
  .pick-mid{display:flex;flex-direction:column;gap:2px}
  .pick-name{font-weight:700;color:#1e3a40;font-size:13px}
  .pick-sub{font-size:11px;color:#8496a0}
  .modal-foot{padding:12px 20px;border-top:1px solid rgba(30,58,64,.12);display:flex;justify-content:flex-end}
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e3a40;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .toast.err{background:#b91c1c}
  @media(max-width:1000px){.panel{width:100%}.body{flex-direction:column}}
  @media(max-width:767px){.main{padding-bottom:88px!important}.panel{max-height:240px}}
`;

export default function AssignProfilesPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}><AccessLoading /></div>;
  /* 2026-09-30 — ASSIGNP.ACCESS alone opens this screen. It used to also need
     SYSSET.ACCESS, a key the profile tree never offered, so a non-super user
     could never reach it however many chips they were given. SYSSET.ACCESS is
     still accepted, so nothing that worked before stops working. */
  if (enforce && !(has("ASSIGNP", "ACCESS") || has("SYSSET", "ACCESS")))
    return <NoAccess screen="Assign Profiles" />;
  return <AssignProfilesContent />;
}
