// app/administration/specialities/page.tsx
//
// Technician Specialities — the master list behind
// tbl_technicianspecilities (SpecAreaID char(10), Specilities varchar(100)).
// This is the list technicians get picked from when a booking assigns them.
//
// The code is typed in by hand (the Add form offers the next free one). Nothing
// here reads Tbl_Serials — the row's primary key is yours to choose, so a
// database that already holds codes keeps working untouched.
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UserName from '@/components/UserName';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import NoAccess from '@/components/NoAccess';
import AccessLoading from '@/components/AccessLoading';

interface SpecRow {
  SpecAreaID: string;
  Specilities: string;
  AssignedCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  assigned?: number;
  suggestedCode?: string;
  total?: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const json = (await res.json()) as ApiResponse<T>;
    return { ...json, message: json.message };
  } catch {
    return { success: false, message: 'Network error — could not reach server' };
  }
}

const API = '/api/administration/specialities';
const MAX_NAME = 100;   // Specilities varchar(100)
const MAX_CODE = 10;    // SpecAreaID char(10)

/* ─────────────────────────────────────────
   PAGE CSS
───────────────────────────────────────── */
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width:32px; height:32px; border-radius:50%;
    border:3px solid rgba(30,58,64,0.15);
    border-top-color:#1e3a40; animation:spin 0.7s linear infinite;
  }

  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  .frm-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 11px; height:36px; font-family:'Inter',sans-serif;
    font-size:13px; color:#1f2937; background:#fff; outline:none; min-width:0;
    transition:border-color 0.15s, box-shadow 0.15s;
  }
  .frm-input:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:disabled { background:#f3f6f6; color:#6b7280; }
  .frm-label {
    font-size:11px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; display:block;
  }

  .btn-save, .btn-new, .btn-clear, .btn-danger, .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; white-space:nowrap;
  }
  .btn-save { background:#1e3a40; color:#fff; border:none; box-shadow:0 2px 8px rgba(30,58,64,0.25); }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); }
  .btn-new { background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none; }
  .btn-new:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 12px rgba(30,58,64,0.3); }
  .btn-clear { background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da; }
  .btn-clear:hover:not(:disabled) { background:#e5e7eb; }
  .btn-danger { background:#fef2f2; color:#b91c1c; border:1.5px solid #fecaca; }
  .btn-danger:hover:not(:disabled) { background:#fee2e2; }
  .btn-print { background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; }
  button:disabled { opacity:0.6; cursor:not-allowed; }

  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:9px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr h2 { color:#fff; font-size:13px; font-weight:700; letter-spacing:0.02em; }

  table.spc { width:100%; border-collapse:collapse; }
  table.spc thead th {
    background:#eef4f4; color:#4b5563; font-size:10.5px; font-weight:800;
    letter-spacing:0.07em; text-transform:uppercase; text-align:left;
    padding:9px 14px; border-bottom:1.5px solid #d8e4e6; white-space:nowrap;
  }
  table.spc tbody td {
    padding:8px 14px; border-bottom:1px solid #eef2f2;
    font-size:13px; color:#1f2937; vertical-align:middle;
  }
  table.spc tbody tr:last-child td { border-bottom:none; }
  table.spc tbody tr:hover { background:#f7fafa; }
  table.spc tbody tr.editing { background:#f0f9ff; }

  .code-chip {
    display:inline-block; font-family:ui-monospace,'SF Mono',Menlo,monospace;
    font-size:11.5px; font-weight:700; color:#1e3a40;
    background:#e5edee; border:1px solid #d4e0e1;
    border-radius:6px; padding:2px 8px; letter-spacing:0.03em;
  }
  .row-no { font-size:12px; font-weight:700; color:#9ca3af; width:46px; }
  .act-cell { width:1%; white-space:nowrap; }
  .act-cell button {
    background:none; border:none; cursor:pointer; padding:5px;
    display:inline-flex; border-radius:6px; color:#6b7280; transition:all 0.15s;
  }
  .act-cell button:hover:not(:disabled) { background:#f1f5f5; color:#1e3a40; }
  .act-cell button.danger:hover:not(:disabled) { background:#fee2e2; color:#b91c1c; }

  .empty {
    padding:44px 20px; text-align:center; color:#9ca3af; font-size:13px;
  }
  .empty strong { display:block; color:#4b5563; font-size:14px; font-weight:700; margin-bottom:4px; }

  .count-pill {
    background:rgba(255,255,255,0.18); color:#fff; border-radius:20px;
    padding:2px 10px; font-size:11px; font-weight:700;
  }
  .sum-card {
    background:#fff; border:1.5px solid #d8e4e6; border-radius:12px;
    padding:11px 16px; min-width:118px; flex-shrink:0;
  }
  .sum-card .k { font-size:10.5px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#6b7280; }
  .sum-card .v { font-size:21px; font-weight:800; color:#1e3a40; line-height:1.2; }

  .banner {
    border-radius:10px; padding:10px 14px; font-size:13px; font-weight:600;
    display:flex; align-items:center; gap:8px;
  }
  .banner-err { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }

  .toast {
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:12px 20px; border-radius:10px; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:600; color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation:fadeUp 0.25s ease both; max-width:380px;
  }
  .toast-success { background:#15803d; }
  .toast-error { background:#dc2626; }

  .add-row {
    display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap;
    padding:12px 14px; background:#f7fafa; border-bottom:1.5px solid #d8e4e6;
  }
  .add-row .grow { flex:1; min-width:200px; }

  @media(max-width:767px) {
    .toast { bottom:80px !important; right:12px !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
function IBell({ s = 21 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function ISearch({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IChevD({ s = 13 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function IPlus({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IRefresh({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>;
}
function ISave({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
}
function ITrash({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function IPencil({ s = 15 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
}
function IAlertCircle({ s = 16 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}
function ISparkle({ s = 18 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>;
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
function SpecialitiesPageContent() {
  const access = useMyAccess();
  const canSave = !access.enforce || access.has('ADSPEC', 'SAVE');
  const canDelete = !access.enforce || access.has('ADSPEC', 'DELETE');

  const router = useRouter();
  const [navKey, setNavKey] = useState('admin-specialities');
  const { toast, show: showToast } = useToast();

  const [rows, setRows] = useState<SpecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [nextCode, setNextCode] = useState('SPA0000001');

  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<string>('');   // SpecAreaID being renamed
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await apiFetch<SpecRow[]>(API);
      if (res.success && Array.isArray(res.data)) setRows(res.data);
      else setLoadError(res.message || 'Failed to load specialities');
      if (res.suggestedCode) setNextCode(res.suggestedCode);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.Specilities.toLowerCase().includes(s) || r.SpecAreaID.toLowerCase().includes(s));
  }, [rows, search]);

  const usedCount = useMemo(() => rows.filter((r) => r.AssignedCount > 0).length, [rows]);

  /* ── add ── */
  function openAdd() {
    setNewCode(nextCode);
    setNewName('');
    setAdding(true);
  }

  async function handleAdd() {
    const code = newCode.replace(/\s+/g, '').trim();
    const name = newName.replace(/\s+/g, ' ').trim();
    if (!code) { showToast('Type a code — it identifies the row.', 'error'); return; }
    if (code.length > MAX_CODE) { showToast(`The code column is char(${MAX_CODE}) — keep it to ${MAX_CODE} characters.`, 'error'); return; }
    if (!name) { showToast('Type a speciality name first.', 'error'); return; }
    if (name.length > MAX_NAME) { showToast(`Keep it ${MAX_NAME} characters or less.`, 'error'); return; }

    setSaving(true);
    const res = await apiFetch<SpecRow>(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SpecAreaID: code, Specilities: name }),
    });
    setSaving(false);
    if (!res.success) { showToast(res.message || 'Could not add the speciality', 'error'); return; }
    setNewName('');
    setAdding(false);
    showToast(`"${name}" added as ${code}.`);
    await load();
  }

  /* ── rename ── */
  function startEdit(r: SpecRow) {
    setEditing(r.SpecAreaID);
    setEditName(r.Specilities);
  }
  function cancelEdit() {
    setEditing('');
    setEditName('');
  }
  async function handleSaveEdit(code: string) {
    const name = editName.replace(/\s+/g, ' ').trim();
    if (!name) { showToast('The name cannot be empty.', 'error'); return; }
    setSaving(true);
    const res = await apiFetch<SpecRow>(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SpecAreaID: code, Specilities: name }),
    });
    setSaving(false);
    if (!res.success) { showToast(res.message || 'Could not rename the speciality', 'error'); return; }
    cancelEdit();
    showToast('Saved.');
    await load();
  }

  /* ── delete ──
     While technicians are still assigned the server refuses, so the first
     ask is a plain confirm and the second one says exactly what goes with it. */
  async function handleDelete(r: SpecRow) {
    if (r.AssignedCount > 0) {
      const n = r.AssignedCount;
      const ok = confirm(
        `"${r.Specilities}" is assigned to ${n} technician${n === 1 ? '' : 's'}.\n\n` +
        `Deleting it removes the speciality AND those ${n} assignment${n === 1 ? '' : 's'}.\n` +
        `This cannot be undone. Continue?`
      );
      if (!ok) return;
    } else if (!confirm(`Delete "${r.Specilities}" (${r.SpecAreaID})?`)) {
      return;
    }

    setSaving(true);
    const res = await apiFetch<{ SpecAreaID: string; removedAssignments: number }>(`${API}?force=1`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SpecAreaID: r.SpecAreaID, force: true }),
    });
    setSaving(false);
    if (!res.success) { showToast(res.message || 'Could not remove the speciality', 'error'); return; }
    const gone = Number(res.data?.removedAssignments ?? 0);
    showToast(gone > 0 ? `Removed, along with ${gone} assignment${gone === 1 ? '' : 's'}.` : 'Removed.');
    if (editing === r.SpecAreaID) cancelEdit();
    await load();
  }

  const HDR = '#dae6e6';

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
        <AdminSidebar active={navKey} onNav={(k, p) => { setNavKey(k); router.push(p); }} onLogout={() => router.push('/admin-login')} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', opacity: 0.4 }}><ISearch /></span>
              <input
                style={{ border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 38px', height: 40, width: 250, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937', background: '#fff', outline: 'none' }}
                placeholder="Search specialities…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search specialities"
              />
            </div>
            <button className="btn-clear" style={{ height: 40 }} onClick={() => void load()} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> : <IRefresh />}
              Refresh
            </button>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', padding: 4 }}><IBell /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}><UserName /></span>
              <IChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {access.initial || 'S'}
            </div>
          </header>

          {loadError && !loading && (
            <div style={{ padding: '10px 16px', flexShrink: 0 }}>
              <div className="banner banner-err">
                <IAlertCircle />
                <span style={{ fontWeight: 600 }}>{loadError}</span>
                <button className="btn-clear" style={{ marginLeft: 'auto', height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => void load()}>Retry</button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 13 }}>
            {/* summary */}
            <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap' }}>
              <div className="sum-card">
                <div className="k">Specialities</div>
                <div className="v">{rows.length}</div>
              </div>
              <div className="sum-card">
                <div className="k">In use</div>
                <div className="v">{usedCount}</div>
              </div>
              <div className="sum-card">
                <div className="k">Unused</div>
                <div className="v">{rows.length - usedCount}</div>
              </div>
            </div>

            {/* list */}
            <div className="sect-box fade-up">
              <div className="sect-hdr">
                <ISparkle s={15} />
                <h2>Technician Specialities</h2>
                <span className="count-pill">{filtered.length}</span>
                <div style={{ flex: 1 }} />
                {canSave && !adding && (
                  <button className="btn-new" style={{ height: 32, padding: '0 14px', fontSize: 12 }} onClick={openAdd}>
                    <IPlus s={13} /> Add Speciality
                  </button>
                )}
              </div>

              {adding && (
                <div className="add-row">
                  <div style={{ width: 130, flexShrink: 0 }}>
                    <label className="frm-label" htmlFor="new-code">Code</label>
                    <input
                      id="new-code"
                      className="frm-input"
                      autoFocus
                      maxLength={MAX_CODE}
                      placeholder="SPA0000001"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                    />
                  </div>
                  <div className="grow">
                    <label className="frm-label" htmlFor="new-spec">Speciality name</label>
                    <input
                      id="new-spec"
                      className="frm-input"
                      maxLength={MAX_NAME}
                      placeholder="e.g. Hair Colouring"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); }
                        if (e.key === 'Escape') { setAdding(false); setNewCode(''); setNewName(''); }
                      }}
                    />
                  </div>
                  <button className="btn-save" style={{ height: 36 }} onClick={() => void handleAdd()} disabled={saving}>
                    <ISave s={14} /> Save
                  </button>
                  <button className="btn-clear" style={{ height: 36 }} onClick={() => { setAdding(false); setNewCode(''); setNewName(''); }} disabled={saving}>
                    Cancel
                  </button>
                </div>
              )}

              {loading && rows.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 44 }}><div className="spinner" /></div>
              ) : filtered.length === 0 ? (
                <div className="empty">
                  <strong>{search ? 'No matching speciality' : 'No specialities yet'}</strong>
                  {search
                    ? 'Try another word — the list is filtered as you type.'
                    : 'Add the areas your technicians specialise in, e.g. Hair Cutting, Colouring, Facials.'}
                </div>
              ) : (
                <table className="spc">
                  <thead>
                    <tr>
                      <th style={{ width: 46 }}>#</th>
                      <th>Speciality</th>
                      <th style={{ width: 130 }}>Code</th>
                      <th style={{ width: 130 }}>Assigned</th>
                      <th className="act-cell" style={{ width: 92 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => {
                      const isEditing = editing === r.SpecAreaID;
                      return (
                        <tr key={r.SpecAreaID} className={isEditing ? 'editing' : undefined}>
                          <td className="row-no">{i + 1}</td>
                          <td>
                            {isEditing ? (
                              <input
                                className="frm-input"
                                autoFocus
                                maxLength={MAX_NAME}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); void handleSaveEdit(r.SpecAreaID); }
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                aria-label="Speciality name"
                              />
                            ) : (
                              <span style={{ fontWeight: 600 }}>{r.Specilities}</span>
                            )}
                          </td>
                          <td><span className="code-chip">{r.SpecAreaID}</span></td>
                          <td>
                            {r.AssignedCount > 0 ? (
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '2px 8px' }}>
                                {r.AssignedCount} technician{r.AssignedCount === 1 ? '' : 's'}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                            )}
                          </td>
                          <td className="act-cell">
                            {isEditing ? (
                              <>
                                <button onClick={() => void handleSaveEdit(r.SpecAreaID)} disabled={saving} title="Save" aria-label="Save"><ISave s={14} /></button>
                                <button onClick={cancelEdit} disabled={saving} title="Cancel" aria-label="Cancel"><IChevD s={14} /></button>
                              </>
                            ) : (
                              <>
                                {canSave && (
                                  <button onClick={() => startEdit(r)} title="Rename" aria-label={`Rename ${r.Specilities}`}><IPencil /></button>
                                )}
                                {canDelete && (
                                  <button className="danger" onClick={() => void handleDelete(r)} title="Remove" aria-label={`Remove ${r.Specilities}`}><ITrash /></button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <p style={{ fontSize: 11.5, color: '#5b7377', padding: '0 2px' }}>
              The code is typed by you — the Add form offers the next free one ({nextCode}) so you can usually just accept it.
              A saved code is never changed, because technicians are pointed at it. Removing a speciality that is still
              assigned also clears those assignments, and the screen asks before it does.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TechnicianSpecialitiesPage() {
  const { loaded, enforce, has } = useMyAccess();
  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4' }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !(has('ADMINGRP', 'ACCESS') && has('ADSPEC', 'ACCESS'))) {
    return <NoAccess screen="Technician Specialities" />;
  }
  return <SpecialitiesPageContent />;
}