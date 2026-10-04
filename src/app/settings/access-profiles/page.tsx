'use client';
// Access Profile Creation — System Settings > User Settings > Access Profile Creation
//
// A profile is a NAMED object of its own (APF0000001 …), exactly like a user
// group is: type a name, Save, and the number is generated for you.
//
// 2026-09-29 — this screen used to edit "the profile of a user group". It no
// longer has anything to do with groups: the group dropdown is gone, and the
// "customize one user" mode (?user=…) is gone with it. A profile is written
// here and handed to people on Assign Profiles (System Settings → User Settings
// → Assign Profiles), where a person may hold several.
//
// Where it is saved: Tbl_UserAccess_StdProfile — UserID is the APF… code, the
// name rides along in the ApfDes column (see src/lib/accessProfiles.ts).
//
// Layout notes (2026-09-29, second pass — the shop sent a screenshot):
//   * the permission tree now lives in its own scrolling card, so Location
//     Access stays on screen instead of being pushed below the fold;
//   * every row is the same height, the name on the left and the action chips
//     on the right, wrapping only when a screen really has many actions;
//   * the profile list keeps its own scroll and shows clear empty states.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from "@/lib/useMyAccess";
import NoAccess from "@/components/NoAccess";
import AccessLoading from "@/components/AccessLoading";
import { ACCESS_TREE, ALL_ACCESS_KEYS, ALL_GROUP_CODES, PARENT_OF, type AccessNode } from '@/lib/accessCatalog';
import AccessProfilePrintSheet, { ACCESS_PROFILE_PRINT_CSS } from '@/components/AccessProfilePrintSheet';

interface ProfileRow { apfCode: string; apfDes: string; users: number; keys: number }
interface LocRow { locCode: string; locDes: string }
const key = (s: string, a: string) => `${s}.${a}`;

function AccessProfilesInner() {
  const access = useMyAccess();
  const canPrintP       = !access.enforce || access.has("ACCESSP", "PRINT");
  const canSelectAll    = !access.enforce || access.has("ACCESSP", "SELECT_ALL");
  const canDeselectAll  = !access.enforce || access.has("ACCESSP", "DESELECT_ALL");
  const canCancelP      = !access.enforce || access.has("ACCESSP", "CANCEL");
  const canSaveP        = !access.enforce || access.has("ACCESSP", "SAVE");
  const router = useRouter();

  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');        // '' = a new profile is being typed
  const [apfDes, setApfDes] = useState('');
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<LocRow[]>([]);
  const [locs, setLocs] = useState<Set<string>>(new Set());
  const [loadedLocs, setLoadedLocs] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(ALL_GROUP_CODES));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/security/access-profiles', { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: ProfileRow[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the access profiles');
      setProfiles(json.data ?? []);
      setLoadError('');
      return json.data ?? [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load the access profiles';
      setLoadError(msg);
      showToast(msg, true);
      return [];
    }
  }, [showToast]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lres = await fetch('/api/locations', { cache: 'no-store' });
        const ljson = await lres.json() as { success?: boolean; data?: { LocCode: string; LocDes: string }[] };
        if (alive && ljson?.success) {
          setLocations((ljson.data ?? []).map((r) => ({ locCode: r.LocCode.trim(), locDes: r.LocDes.trim() })));
        }
        await loadProfiles();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadProfiles]);

  const loadProfile = useCallback(async (apfCode: string) => {
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/security/access-profiles/${encodeURIComponent(apfCode)}/access`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: { keys?: { screenCode: string; actionCode: string }[]; locations?: string[] }; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the profile');
      const s = new Set((json.data?.keys ?? []).map((k) => key(k.screenCode, k.actionCode)));
      setGranted(s);
      setLoaded(new Set(s));
      const ls = new Set((json.data?.locations ?? []).map((l) => String(l).trim()));
      setLocs(ls);
      setLoadedLocs(new Set(ls));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the profile', true);
    } finally {
      setProfileLoading(false);
    }
  }, [showToast]);

  const isNew = selected === '';

  function pick(p: ProfileRow) {
    if (dirty && !window.confirm('Unsaved changes — leave without saving?')) return;
    setSelected(p.apfCode);
    setApfDes(p.apfDes);
    void loadProfile(p.apfCode);
  }

  function startNew() {
    if (dirty && !window.confirm('Unsaved changes — leave without saving?')) return;
    setSelected('');
    setApfDes('');
    setGranted(new Set());
    setLoaded(new Set());
    setLocs(new Set());
    setLoadedLocs(new Set());
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.apfCode.toLowerCase().includes(q) || p.apfDes.toLowerCase().includes(q));
  }, [profiles, search]);

  const current = profiles.find((p) => p.apfCode === selected) || null;

  const dirty = useMemo(() => {
    if (isNew) return apfDes.trim() !== '' || granted.size > 0 || locs.size > 0;
    if (!current) return false;
    if (current.apfDes !== apfDes) return true;
    if (granted.size !== loaded.size) return true;
    for (const k of granted) if (!loaded.has(k)) return true;
    if (locs.size !== loadedLocs.size) return true;
    for (const l of locs) if (!loadedLocs.has(l)) return true;
    return false;
  }, [apfDes, current, granted, loaded, locs, loadedLocs, isNew]);

  const toggle = (screen: string, action: string) => {
    setGranted((prev) => {
      const next = new Set(prev);
      const k = key(screen, action);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
        // anything ticked below ⇒ the chain above it must get Access too
        let p = PARENT_OF[screen];
        while (p && p !== 'RT') {
          next.add(key(p, 'ACCESS'));
          p = PARENT_OF[p];
        }
      }
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
  const cancel = () => {
    if (isNew) { startNew(); return; }
    setApfDes(current?.apfDes ?? '');
    setGranted(new Set(loaded));
    setLocs(new Set(loadedLocs));
  };

  const toggleLoc = (code: string) => {
    setLocs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  function keyPayload() {
    return [...granted].map((k) => {
      const [screenCode, ...rest] = k.split('.');
      return { screenCode, actionCode: rest.join('.') };
    });
  }

  async function saveProfile(nextApfCode: string) {
    const res = await fetch(`/api/security/access-profiles/${encodeURIComponent(nextApfCode)}/access`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: keyPayload(), locations: [...locs] }),
    });
    const json = await res.json() as { success?: boolean; data?: { granted: number }; message?: string };
    if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not save the profile');
    setLoaded(new Set(granted));
    setLoadedLocs(new Set(locs));
    return json.data?.granted ?? 0;
  }

  async function handleSave() {
    const name = apfDes.trim();
    if (!name) { showToast('Type the profile name first', true); return; }
    setBusy(true);
    try {
      if (isNew) {
        /* one Save for the admin: the profile is created, gets its number, and
           takes the ticks that are on the screen right now */
        const res = await fetch('/api/security/access-profiles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apfDes: name }),
        });
        const json = await res.json() as { success?: boolean; data?: { apfCode: string }; message?: string };
        if (!res.ok || !json?.success || !json.data?.apfCode) throw new Error(json?.message || 'Could not create the profile');
        const apfCode = json.data.apfCode;
        const count = await saveProfile(apfCode);
        showToast(`Profile ${apfCode} created ✓ (${count} permission(s))`);
        const rows = await loadProfiles();
        setSelected(apfCode);
        setApfDes(rows.find((r) => r.apfCode === apfCode)?.apfDes ?? name);
      } else {
        if (current && current.apfDes !== name) {
          const res = await fetch(`/api/security/access-profiles/${encodeURIComponent(selected)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apfDes: name }),
          });
          const json = await res.json() as { success?: boolean; message?: string };
          if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not rename the profile');
        }
        const count = await saveProfile(selected);
        showToast(`Profile saved ✓ (${count} permission(s))`);
        await loadProfiles();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (isNew || !current) { showToast('Choose a profile first', true); return; }
    const holders = current.users;
    const warn = holders > 0
      ? `Profile "${current.apfDes}" (${current.apfCode}) is assigned to ${holders} user(s). Deleting it takes those rights away from them. Continue?`
      : `Delete profile "${current.apfDes}" (${current.apfCode})?`;
    if (!window.confirm(warn)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/security/access-profiles/${encodeURIComponent(current.apfCode)}?force=1`, { method: 'DELETE' });
      const json = await res.json() as { success?: boolean; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not delete the profile');
      showToast('Profile deleted ✓');
      startNew();
      await loadProfiles();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', true);
    } finally {
      setBusy(false);
    }
  }

  const [printData, setPrintData] = useState<{ subject: string; keys: { screenCode: string; actionCode: string }[]; locations: string[] } | null>(null);
  function handlePrint() {
    const locLabels = locations.filter((l) => locs.has(l.locCode)).map((l) => `${l.locDes} (${l.locCode})`);
    setPrintData({
      subject: `${isNew ? 'New profile' : `${apfDes} (${selected})`}${isNew ? '' : ` · held by ${current?.users ?? 0} user(s)`}`,
      keys: keyPayload(),
      locations: locLabels,
    });
    setTimeout(() => window.print(), 60);
  }

  const disabled = profileLoading || (isNew ? false : !current);
  const roleLine = isNew
    ? 'A new profile — every screen starts unticked. Name it and press Save.'
    : `Editing ${apfDes} (${selected}) · held by ${current?.users ?? 0} user(s) · ${current?.keys ?? 0} permission(s) saved`;

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
              disabled={disabled || busy}
              onClick={() => toggle(node.code, a.code)}
              title={on ? `${node.name} — ${a.label}: allowed (click to remove)` : `${node.name} — ${a.label}: not allowed`}
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
        <div
          className={`row ${hasKids ? 'grp' : 'leaf'}`}
          style={{ paddingLeft: 10 + depth * 18 }}
        >
          <button
            type="button"
            className="row-name"
            onClick={() => hasKids && toggleCollapse(node.code)}
            title={hasKids ? (open ? 'Collapse' : 'Expand') : node.code}
          >
            <span className={`chev ${hasKids ? (open ? 'open' : '') : 'none'}`}>▸</span>
            <span className="row-label">{node.name}</span>
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
      <style>{ACCESS_PROFILE_PRINT_CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      {printData && (
        <AccessProfilePrintSheet
          title="ACCESS PROFILE"
          subject={printData.subject}
          keys={printData.keys}
          locations={printData.locations}
        />
      )}

      <div className="shell">
        <AdminSidebar active="settings-access" onNav={(_key, path) => router.push(path)} onLogout={() => router.push('/admin-login')} />

        <div className="main">
          <header className="head">
            <h1>ACCESS PROFILE CREATION</h1>
            <span className="head-note">{loading ? 'Loading…' : `${profiles.length} profile(s)`}</span>
          </header>

          <div className="body">
            <aside className="panel">
              <div className="panel-search">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search profiles…"
                  autoComplete="off"
                  spellCheck={false}
                />
                {search && (
                  <button type="button" className="panel-clear" onClick={() => setSearch('')} title="Clear the search">×</button>
                )}
              </div>
              {canSaveP && (
                <button className={`new-btn ${isNew ? 'on' : ''}`} onClick={startNew} disabled={busy}>+ New Profile</button>
              )}
              <div className="count-line">
                {loading ? ' ' : search
                  ? `${filtered.length} of ${profiles.length} shown`
                  : `${profiles.length} profile(s)`}
              </div>
              <div className="list">
                {loading && <div className="empty">Loading…</div>}
                {!loading && loadError && (
                  <div className="empty err">
                    {loadError}
                    <button className="retry" onClick={() => void loadProfiles()}>Try again</button>
                  </div>
                )}
                {!loading && !loadError && profiles.length === 0 && (
                  <div className="empty">
                    No profiles yet.<br />Press <b>+ New Profile</b>, name it and Save — then hand it to
                    somebody on <b>Assign Profiles</b>.
                  </div>
                )}
                {!loading && !loadError && profiles.length > 0 && filtered.length === 0 && (
                  <div className="empty">No profile matches “{search}”.</div>
                )}
                {filtered.map((p) => (
                  <button key={p.apfCode} className={`prow ${selected === p.apfCode ? 'on' : ''}`} onClick={() => pick(p)} disabled={busy}>
                    <span className="prow-id">{p.apfCode}</span>
                    <span className="prow-mid">
                      <span className="prow-name">{p.apfDes || '(no name)'}</span>
                      <span className="prow-sub">{p.keys} permission(s) · {p.users} user(s)</span>
                    </span>
                    {p.users > 0
                      ? <span className="pchip ok">In use</span>
                      : <span className="pchip warn">Unused</span>}
                  </button>
                ))}
              </div>
            </aside>

            <section className="card">
              {/* ── who is being edited, and the one Save that writes it ── */}
              <div className="toolbar">
                <div className="fld grow">
                  <label>{isNew ? 'New profile name' : 'Profile name'}</label>
                  <input
                    className="name-input"
                    value={apfDes}
                    onChange={(e) => setApfDes(e.target.value)}
                    placeholder="e.g. Receptionist — Colombo"
                    disabled={busy}
                  />
                </div>
                <div className="fld">
                  <label>Profile code</label>
                  <input className="mono code-input" value={isNew ? '(assigned on save)' : selected} disabled />
                </div>
                <div className="toolbar-btns">
                  {canPrintP && (
                    <button className="btn" onClick={handlePrint} disabled={busy}>Print</button>
                  )}
                  {canSelectAll && (
                    <button className="btn" onClick={selectAll} disabled={disabled || busy}>Select All</button>
                  )}
                  {canDeselectAll && (
                    <button className="btn" onClick={deselectAll} disabled={disabled || busy}>DeSelect All</button>
                  )}
                  {canCancelP && (
                    <button className="btn danger" onClick={cancel} disabled={!dirty || busy}>Cancel</button>
                  )}
                  {canSaveP && !isNew && (
                    <button className="btn danger" onClick={() => void handleDelete()} disabled={busy}>Delete</button>
                  )}
                  {canSaveP && (
                    <button className="btn primary" onClick={() => void handleSave()} disabled={!dirty || busy}>
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                  )}
                </div>
              </div>

              <div className="profile-note">
                <span>{roleLine}</span>
                <span className="profile-sub">
                  The <b>Assign Profiles</b> screen is where a profile is given to people — one person may hold several,
                  and their rights add up.
                </span>
              </div>

              {/* ── the permission tree, in its own scroll box ── */}
              <section className="block">
                <div className="block-head">
                  <span>Permissions</span>
                  <span className="block-note">
                    {granted.size} ticked{profileLoading ? ' · loading…' : ''}
                  </span>
                </div>
                <div className="tree">
                  {ACCESS_TREE.map((n) => <NodeRow key={n.code} node={n} depth={0} />)}
                </div>
              </section>

              {/* ── branches ── */}
              <section className="block">
                <div className="block-head">
                  <span>Location Access</span>
                  <span className="block-note">{locs.size} of {locations.length} allowed</span>
                </div>
                {locations.length === 0 && <div className="loc-empty">No locations found yet — create them in Location Master.</div>}
                <div className="loc-grid">
                  {locations.map((l) => {
                    const on = locs.has(l.locCode);
                    return (
                      <button
                        type="button"
                        key={l.locCode}
                        className={`loc-chip ${on ? 'on' : ''}`}
                        disabled={disabled || busy}
                        onClick={() => toggleLoc(l.locCode)}
                        title={on ? 'Allowed — click to stop allowing' : 'Not allowed — click to allow'}
                      >
                        <span className="tick">{on ? '✓' : ''}</span>
                        {l.locDes} ({l.locCode})
                      </button>
                    );
                  })}
                </div>
              </section>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function AccessProfilesPageContent() {
  return (
    <React.Suspense fallback={null}>
      <AccessProfilesInner />
    </React.Suspense>
  );
}

const CSS = `
  .shell{display:flex;height:100vh;overflow:hidden;background:#c2d4d4;font-family:'Inter',system-ui,sans-serif}
  .main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:14px 16px 22px;gap:12px}
  .head{background:#dae6e6;height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 18px;gap:12px;border-bottom:1px solid rgba(0,0,0,0.06);border-radius:14px}
  .head h1{font-size:15px;font-weight:800;letter-spacing:.05em;color:#1e3a40;margin:0}
  .head-note{font-size:12px;color:#6b7280;margin-left:auto}
  .body{flex:1;display:flex;gap:12px;min-height:0}

  /* ── left: the profile list ── */
  .panel{width:330px;flex-shrink:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0;max-height:100%}
  .panel-search{position:relative}
  .panel-search input{width:100%;height:38px;border:1px solid rgba(30,58,64,0.20);border-radius:9px;padding:0 34px 0 12px;font-size:13px;outline:none;font-family:inherit;background:#fff;color:#16333a}
  .panel-search input::placeholder{color:#8fa3a8}
  .panel-search input::-webkit-search-cancel-button,
  .panel-search input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;display:none}
  .panel-search input:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,0.10)}
  .panel-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:24px;height:24px;border:none;border-radius:999px;background:rgba(30,58,64,.10);color:#1e3a40;font-size:14px;line-height:1;cursor:pointer;font-family:inherit}
  .panel-clear:hover{background:#1e3a40;color:#fff}
  .new-btn{height:38px;border:1.5px dashed rgba(30,58,64,0.35);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
  .new-btn.on{background:#1e3a40;color:#fff;border-color:#1e3a40}
  .count-line{font-size:11px;color:#7d8f94;font-weight:700;letter-spacing:.03em;padding:0 2px}
  .list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px}
  .empty{text-align:center;color:#8496a0;font-size:12.5px;line-height:1.6;padding:22px 8px}
  .empty.err{color:#b91c1c;background:#fff5f5;border:1px dashed #f0a9a9;border-radius:10px}
  .retry{display:block;margin:10px auto 0;height:30px;padding:0 14px;border:1px solid #e2503c;border-radius:8px;background:#fff;color:#b91c1c;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}
  .prow{text-align:left;background:#fff;border:1px solid rgba(30,58,64,0.14);border-radius:11px;padding:9px 12px;display:grid;grid-template-columns:88px 1fr auto;gap:8px;align-items:center;cursor:pointer;font-family:inherit}
  .prow:hover{border-color:#1e3a40}
  .prow.on{border-color:#1e3a40;background:#eaf3f2;box-shadow:0 2px 10px rgba(30,58,64,0.10)}
  .prow:disabled{opacity:.6;cursor:not-allowed}
  .prow-id{font-family:ui-monospace,monospace;font-weight:800;color:#0b5cab;font-size:11.5px}
  .prow-mid{display:flex;flex-direction:column;gap:2px;min-width:0}
  .prow-name{font-weight:700;color:#1e3a40;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .prow-sub{font-size:11px;color:#8496a0}
  .pchip{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:.03em;white-space:nowrap}
  .pchip.ok{background:#dcfce7;color:#166534}
  .pchip.warn{background:#fef3c7;color:#92400e}

  /* ── right: the editor ── */
  .card{flex:1;min-width:0;background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;min-height:0}
  .toolbar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
  .fld{display:flex;flex-direction:column}
  .fld.grow{flex:0 1 420px;min-width:220px}
  .fld label{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#3c5a60;margin-bottom:6px}
  .fld input{height:38px;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:0 12px;font-size:13px;font-family:inherit;background:#fff;color:#16333a;font-weight:600;width:100%}
  .fld input:disabled{background:#f2f6f6;color:#5b6d72;font-weight:600}
  .fld .code-input{min-width:190px}
  .mono{font-family:ui-monospace,monospace;font-weight:700}
  .toolbar-btns{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
  .profile-note{font-size:12.5px;color:#3c5a60;padding:0 2px;display:flex;flex-direction:column;gap:3px}
  .profile-sub{font-size:11.5px;color:#7d8f94}

  /* ── the permission tree ── */
  .block{background:#fff;border:1px solid rgba(30,58,64,0.12);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-height:0}
  .block-head{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#3c5a60}
  .block-note{margin-left:auto;font-size:10.5px;font-weight:600;letter-spacing:.02em;text-transform:none;color:#8a9aa0}
  .tree{overflow-y:auto;max-height:44vh;border-top:1px solid rgba(30,58,64,0.08);padding-top:4px}
  .row{display:flex;align-items:center;gap:14px;min-height:38px;padding:5px 10px;border-radius:8px}
  .row.grp{background:rgba(30,58,64,0.05);margin-top:3px}
  .row.leaf{background:#fbfdfd}
  .row:hover{background:#eef4f4}
  .row.grp:hover{background:rgba(30,58,64,0.09)}
  .row-name{flex:1;min-width:190px;display:flex;align-items:center;gap:10px;background:none;border:none;padding:0;font:inherit;font-size:12.8px;font-weight:800;color:#16333a;cursor:pointer;text-align:left;font-family:inherit}
  .row.leaf .row-name{cursor:default;font-weight:600;color:#26454c}
  .row-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chev{color:#1e3a40;font-size:11px;width:12px;text-align:center;transition:transform .18s ease;flex-shrink:0}
  .chev.open{transform:rotate(90deg)}
  .chev.none{opacity:0}
  .row-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;flex-shrink:0}
  .act{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border-radius:999px;border:1px solid rgba(30,58,64,0.22);background:#fff;color:#5b6d72;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
  .act:disabled{opacity:.45;cursor:not-allowed}
  .act:hover{border-color:#1e3a40}
  .act.on{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .tick{display:inline-flex;width:13px;height:13px;border-radius:4px;border:1.5px solid rgba(30,58,64,0.4);background:#fff;color:#1e3a40;font-size:9px;align-items:center;justify-content:center;font-weight:900;flex-shrink:0}
  .act.on .tick{background:#fff}

  /* ── branches ── */
  .loc-empty{font-size:12px;color:#8a9aa0}
  .loc-grid{display:flex;flex-wrap:wrap;gap:8px}
  .loc-chip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:999px;border:1px solid rgba(30,58,64,0.22);background:#fff;color:#5b6d72;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
  .loc-chip:disabled{opacity:.45;cursor:not-allowed}
  .loc-chip:hover{border-color:#1e3a40}
  .loc-chip.on{background:#1e3a40;border-color:#1e3a40;color:#fff}

  /* ── buttons + toast ── */
  .btn{height:36px;padding:0 15px;border:1px solid rgba(30,58,64,0.2);border-radius:9px;background:#fff;color:#1e3a40;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.danger{background:#fff;border-color:#e2503c;color:#e2503c}
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e3a40;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .toast.err{background:#b91c1c}
  @media(max-width:1080px){.panel{width:100%}.body{flex-direction:column}.card{min-height:0}}
  @media(max-width:767px){.main{padding-bottom:88px!important}.panel{max-height:240px}}
`;

export default function AccessProfilesPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}><AccessLoading /></div>;
  /* 2026-09-30 — ACCESSP.ACCESS alone opens this screen (SYSSET.ACCESS was a
     key the tree never offered, so a non-super user could never reach it). */
  if (enforce && !(has("ACCESSP", "ACCESS") || has("SYSSET", "ACCESS")))
    return <NoAccess screen="Access Profile Creation" />;
  return <AccessProfilesPageContent />;
}
