'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface Category {
  catCode: string;
  catDes:  string;
  enable:  boolean;
}

type Level = '1' | '2' | '3' | '4';

function emptyCategory(): Category {
  return { catCode: '', catDes: '', enable: true };
}

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    display:inline-block; width:14px; height:14px;
    border:2px solid rgba(255,255,255,0.35);
    border-top-color:#fff; border-radius:50%;
    animation:spin 0.65s linear infinite; flex-shrink:0;
  }
  .spinner.dark { border-color:rgba(30,58,64,0.2); border-top-color:#1e3a40; }

  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(16px);} to{opacity:1;transform:translateX(-50%) translateY(0);} }
  .toast {
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    background:#1e3a40; color:#fff; padding:11px 26px; border-radius:10px;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600;
    z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.28);
    animation:toastIn 0.22s ease; white-space:nowrap;
  }
  .toast.err { background:#dc2626; }

  ::-webkit-scrollbar       { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(30,58,64,0.18); border-radius:4px; }

  .frm-input {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 11px; height:36px;
    font-family:'Inter',sans-serif; font-size:13px; color:#1f2937;
    background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-input:focus     { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:read-only { background:#f3f6f6; color:#6b7280; cursor:default; }

  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:9px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:18px; display:flex; flex-direction:column; gap:14px; }

  .frm-label {
    font-size:11px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.05em;
    margin-bottom:4px; display:block;
  }

  .chk-row {
    display:flex; align-items:center; gap:8px; cursor:pointer;
    padding:7px 10px; border-radius:8px; transition:background 0.12s; user-select:none;
    width:fit-content;
  }
  .chk-row:hover { background:rgba(30,58,64,0.05); }
  .chk-box {
    width:17px; height:17px; border-radius:4px; border:2px solid #9ca3af;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:all 0.15s; background:#fff;
  }
  .chk-box.checked { background:#1e3a40; border-color:#1e3a40; }
  .chk-label { font-size:13px; font-weight:500; color:#374151; }

  .btn-save {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 24px; height:40px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25);
  }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); }
  .btn-save:disabled { background:#9ca3af; cursor:not-allowed; }

  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover:not(:disabled) { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }
  .btn-new:disabled { opacity:0.5; cursor:not-allowed; }

  .btn-del {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#fff2f2; color:#dc2626; border:1.5px solid #fca5a5;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-del:hover:not(:disabled) { background:#fee2e2; border-color:#f87171; transform:translateY(-1px); }
  .btn-del:disabled { opacity:0.5; cursor:not-allowed; }

  .btn-clear {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#f3f4f6; color:#374151; border:1.5px solid #d1d9da;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-clear:hover { background:#e5e7eb; transform:translateY(-1px); }

  .btn-print {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s;
  }
  .btn-print:hover { background:#e0f2fe; transform:translateY(-1px); }

  .cat-list-item {
    display:flex; align-items:center; gap:10px; padding:9px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s;
    border:none; background:transparent; width:100%;
    text-align:left; font-family:'Inter',sans-serif;
  }
  .cat-list-item:hover  { background:rgba(30,58,64,0.06); }
  .cat-list-item.active { background:rgba(30,58,64,0.1); }

  .badge-active   { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-inactive { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626; }

  .tab-btn {
    padding:8px 18px; border:none; background:transparent; cursor:pointer;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:#6b7280;
    border-bottom:2.5px solid transparent; transition:all 0.15s; white-space:nowrap;
  }
  .tab-btn.active { color:#1e3a40; border-bottom-color:#1e3a40; }
  .tab-btn:hover:not(.active) { color:#374151; }

  .summary-card {
    background:linear-gradient(135deg,#1e3a40,#2a5260);
    border-radius:12px; padding:16px 20px;
  }

  @media(max-width:767px) {
    .left-panel { display:none !important; }
    .main-body  { padding-bottom:72px !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS — proper React components
───────────────────────────────────────── */
function IBell({ s = 21 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function ISearch({ s = 15 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IChevD({ s = 13 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function IPlus({ s = 16 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function ITrash({ s = 15 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function IPrint({ s = 15 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function ISave({ s = 15 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  );
}

function IRefresh({ s = 15 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
    </svg>
  );
}

function ICheck({ s = 11 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IGrid({ s = 18 }: { s?: number }): React.ReactElement {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

/* ─────────────────────────────────────────
   TOAST HOOK
───────────────────────────────────────── */
function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, err = false) => {
    if (ref.current) clearTimeout(ref.current);
    setToast({ msg, err });
    ref.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return { toast, show };
}

/* ─────────────────────────────────────────
   TAB CONFIG
───────────────────────────────────────── */
const TABS: { level: Level; label: string; title: string }[] = [
  { level: '1', label: 'Category 1',     title: 'CATEGORY MASTER DETAIL'        },
  { level: '2', label: 'Sub Category 1', title: 'SUB CATEGORY DETAIL — Level 1' },
  { level: '3', label: 'Sub Category 2', title: 'SUB CATEGORY DETAIL — Level 2' },
  { level: '4', label: 'Sub Category 3', title: 'SUB CATEGORY DETAIL — Level 3' },
];

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function CategoriesPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState('categories');
  const [search, setSearch] = useState('');
  const [level,  setLevel]  = useState<Level>('1');

  const [cats,     setCats]     = useState<Record<Level, Category[]>>({ '1': [], '2': [], '3': [], '4': [] });
  const [current,  setCurrent]  = useState<Category>(emptyCategory());
  const [isNew,    setIsNew]    = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { toast, show: showToast } = useToast();

  /* ── Load categories for a given level ── */
  const loadLevel = useCallback(async (lv: Level, selectCode?: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/categories?level=${lv}`);
      const json = await res.json() as { success: boolean; data: Category[] };
      if (!json.success) throw new Error('Load failed');

      setCats(prev => ({ ...prev, [lv]: json.data }));

      if (json.data.length > 0) {
        const target = selectCode
          ? (json.data.find(c => c.catCode === selectCode) ?? json.data[0])
          : json.data[0];
        setCurrent({ ...target });
        setIsNew(false);
      } else {
        setCurrent(emptyCategory());
        setIsNew(true);
      }
    } catch {
      showToast('Failed to load categories', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  /* Load all 4 levels on mount */
  useEffect(() => {
    (['1', '2', '3', '4'] as Level[]).forEach(lv => loadLevel(lv));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* When tab changes reset selection */
  useEffect(() => {
    const list = cats[level];
    if (list.length > 0) {
      setCurrent({ ...list[0] });
      setIsNew(false);
    } else {
      setCurrent(emptyCategory());
      setIsNew(true);
    }
    setSearch('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const currentList = cats[level];

  const filtered = useMemo(() =>
    currentList.filter(c =>
      c.catCode.toLowerCase().includes(search.toLowerCase()) ||
      c.catDes.toLowerCase().includes(search.toLowerCase())
    ), [currentList, search]);

  const original = useMemo(() => {
    if (isNew) return null;
    return currentList.find(c => c.catCode === current.catCode) ?? null;
  }, [currentList, current.catCode, isNew]);

  const isDirty = useMemo(() => {
    if (isNew) return current.catCode.trim() !== '' || current.catDes.trim() !== '';
    if (!original) return false;
    return JSON.stringify(current) !== JSON.stringify(original);
  }, [current, original, isNew]);

  function confirmDiscard(msg: string) {
    if (!isDirty) return true;
    return confirm(msg);
  }

  function upd<K extends keyof Category>(key: K, val: Category[K]) {
    setCurrent(p => ({ ...p, [key]: val }));
  }

  function handleNew() {
    if (!confirmDiscard('Discard unsaved changes and create a new category?')) return;
    setCurrent(emptyCategory());
    setIsNew(true);
  }

  function handleSelect(cat: Category) {
    if (cat.catCode === current.catCode && !isNew) return;
    if (!confirmDiscard('Discard unsaved changes?')) return;
    setCurrent({ ...cat });
    setIsNew(false);
  }

  function handleClear() {
    if (isNew) {
      setCurrent(emptyCategory());
    } else {
      const orig = currentList.find(c => c.catCode === current.catCode);
      if (orig) setCurrent({ ...orig });
    }
  }

  async function handleSave() {
    if (!current.catCode.trim()) { showToast('Category Code is required', true); return; }
    if (!current.catDes.trim())  { showToast('Category Description is required', true); return; }

    setSaving(true);
    try {
      const res = isNew
        ? await fetch('/api/categories', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ...current, level }),
          })
        : await fetch(`/api/categories/${level}/${encodeURIComponent(current.catCode)}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(current),
          });

      const json = await res.json() as { success: boolean; message?: string };
      if (!json.success) throw new Error(json.message ?? 'Save failed');

      showToast(isNew ? 'Category created ✓' : 'Saved successfully ✓');
      setIsNew(false);
      await loadLevel(level, current.catCode.trim().toUpperCase());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew || !current.catCode) return;
    if (!confirm(`Delete "${current.catDes}" (${current.catCode})?\nThis cannot be undone.`)) return;

    setDeleting(true);
    try {
      const res  = await fetch(`/api/categories/${level}/${encodeURIComponent(current.catCode)}`, { method: 'DELETE' });
      const json = await res.json() as { success: boolean; message?: string };
      if (!json.success) throw new Error(json.message ?? 'Delete failed');
      showToast('Deleted successfully');
      await loadLevel(level);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setDeleting(false);
    }
  }

  function handleNavigate(key: string, path: string) {
    if (!confirmDiscard('Leave page without saving?')) return;
    setNavKey(key);
    router.push(path);
  }
  function handleLogout() {
    if (!confirmDiscard('Leave without saving?')) return;
    router.push('/admin/login');
  }

  const busy         = saving || deleting;
  const PAGE         = '#c2d4d4';
  const HDR          = '#dae6e6';
  const activeTabCfg = TABS.find(t => t.level === level)!;
  const totalActive  = currentList.filter(c =>  c.enable).length;
  const totalInactive= currentList.filter(c => !c.enable).length;

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: PAGE }}>

        {/* ── SIDEBAR ── */}
        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* ── HEADER ── */}
          <header style={{
            background: HDR, height: 56, flexShrink: 0,
            display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12,
            borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10,
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: 0.4 }}>
                <ISearch />
              </span>
              <input
                aria-label="Search categories"
                style={{ border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 38px', height: 40, width: 260, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937', background: '#fff', outline: 'none' }}
                placeholder="Search categories…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
              aria-label="Notifications"
            >
              <IBell />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>MR. SAYO</span>
              <IChevD />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>
              S
            </div>
          </header>

          {/* ── BODY ── */}
          <div className="main-body" style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', gap: 13 }}>

            {/* ══ LEFT PANEL ══ */}
            <div
              className="left-panel"
              style={{ width: 248, flexShrink: 0, background: '#deeaea', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,0.08)' }}
            >
              {/* Panel header */}
              <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(30,58,64,0.1)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>
                    {activeTabCfg.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
                    {loading ? '…' : `${currentList.length} total`}
                  </span>
                </div>
                <button className="btn-new" style={{ width: '100%' }} onClick={handleNew} disabled={busy}>
                  <IPlus s={14} /> New Category
                </button>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                    <span className="spinner dark" />
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '2rem 0' }}>
                    No categories found
                  </p>
                )}
                {!loading && filtered.map(cat => (
                  <button
                    key={cat.catCode}
                    className={`cat-list-item ${current.catCode === cat.catCode && !isNew ? 'active' : ''}`}
                    onClick={() => handleSelect(cat)}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: cat.enable ? 'linear-gradient(135deg,#1e3a40,#2a5260)' : '#d1d5db',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: '#fff', fontSize: 11, fontWeight: 800,
                    }}>
                      {cat.catCode.slice(-2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cat.catDes}
                      </p>
                      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{cat.catCode}</p>
                      <span className={cat.enable ? 'badge-active' : 'badge-inactive'} style={{ marginTop: 3, display: 'inline-flex' }}>
                        {cat.enable ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ══ RIGHT PANEL ══ */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Form header bar */}
              <div style={{ background: '#1e3a40', borderRadius: '12px 12px 0 0', padding: '14px 18px', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {isNew ? 'New Category' : 'Edit Category'}
                  {isDirty && '  •  Unsaved changes'}
                </p>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                  {activeTabCfg.title}
                </p>
              </div>

              {/* Tabs */}
              <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', flexShrink: 0, overflowX: 'auto' }}>
                {TABS.map(t => (
                  <button
                    key={t.level}
                    className={`tab-btn ${level === t.level ? 'active' : ''}`}
                    onClick={() => {
                      if (!confirmDiscard('Discard unsaved changes and switch tab?')) return;
                      setLevel(t.level);
                    }}
                  >
                    {t.label}
                    {cats[t.level].length > 0 && (
                      <span style={{
                        marginLeft: 6,
                        background: level === t.level ? '#1e3a40' : '#e5e7eb',
                        color: level === t.level ? '#fff' : '#6b7280',
                        borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                      }}>
                        {cats[t.level].length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Form body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, background: '#e8f0f1' }}>

                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <span className="spinner dark" style={{ width: 28, height: 28 }} />
                  </div>
                )}

                {!loading && (
                  <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* ── Category Details Section ── */}
                    <div className="sect-box">
                      <div className="sect-hdr">
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                          <IGrid s={14} />
                        </span>
                        <span className="sect-hdr-title">
                          Category Details Level {level}
                        </span>
                      </div>
                      <div className="sect-body">

                        {/* Category Code */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label className="frm-label" htmlFor="cat-code">Category Code</label>
                          <input
                            id="cat-code"
                            className="frm-input"
                            value={current.catCode}
                            readOnly={!isNew}
                            onChange={e => upd('catCode', e.target.value.toUpperCase())}
                            placeholder={isNew ? 'e.g. CAT101' : ''}
                            maxLength={10}
                            style={{ maxWidth: 240 }}
                          />
                        </div>

                        {/* Category Description */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label className="frm-label" htmlFor="cat-des">Category Description</label>
                          <input
                            id="cat-des"
                            className="frm-input"
                            value={current.catDes}
                            onChange={e => upd('catDes', e.target.value)}
                            placeholder="e.g. Hair Care"
                            maxLength={50}
                          />
                        </div>

                        {/* Enable Checkbox */}
                        <div
                          className="chk-row"
                          onClick={() => upd('enable', !current.enable)}
                          role="checkbox"
                          aria-checked={current.enable}
                          tabIndex={0}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              upd('enable', !current.enable);
                            }
                          }}
                        >
                          <div className={`chk-box ${current.enable ? 'checked' : ''}`}>
                            {current.enable && <ICheck s={10} />}
                          </div>
                          <span className="chk-label">Enable</span>
                        </div>

                      </div>
                    </div>

                    {/* ── Summary Card ── */}
                    <div className="summary-card">
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                        Level {level} Summary
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        {[
                          { label: 'Total Categories', val: `${currentList.length}` },
                          { label: 'Active',           val: `${totalActive}`        },
                          { label: 'Inactive',         val: `${totalInactive}`      },
                        ].map(item => (
                          <div key={item.label}>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {item.label}
                            </p>
                            <p style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                              {item.val}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Quick view chips ── */}
                    {currentList.length > 0 && (
                      <div className="sect-box">
                        <div className="sect-hdr">
                          <span className="sect-hdr-title">
                            All {activeTabCfg.label} Categories
                          </span>
                        </div>
                        <div style={{ padding: '8px 14px 14px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            {currentList.map(cat => (
                              <button
                                key={cat.catCode}
                                onClick={() => handleSelect(cat)}
                                style={{
                                  padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                                  border: '1.5px solid',
                                  borderColor: current.catCode === cat.catCode && !isNew ? '#1e3a40' : '#d1d9da',
                                  background:  current.catCode === cat.catCode && !isNew ? '#1e3a40' : '#f3f6f6',
                                  color:       current.catCode === cat.catCode && !isNew ? '#fff'    : '#374151',
                                  cursor: 'pointer', transition: 'all 0.15s',
                                  opacity: cat.enable ? 1 : 0.5,
                                }}
                              >
                                {cat.catCode} — {cat.catDes}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* ── ACTION BAR ── */}
              <div style={{
                background: '#dce8e8',
                borderTop: '1.5px solid rgba(30,58,64,0.12)',
                padding: '12px 16px',
                display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center',
              }}>
                <button className="btn-clear" onClick={handleClear} disabled={busy}>
                  <IRefresh s={14} /> Clear
                </button>
                <button className="btn-print" onClick={() => window.print()} disabled={busy}>
                  <IPrint s={14} /> Print
                </button>
                <div style={{ flex: 1 }} />
                {!isNew && (
                  <button className="btn-del" onClick={handleDelete} disabled={busy}>
                    {deleting
                      ? <><span className="spinner" style={{ borderTopColor: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }} /> Deleting…</>
                      : <><ITrash s={14} /> Delete</>}
                  </button>
                )}
                <button className="btn-save" onClick={handleSave} disabled={busy}>
                  {saving
                    ? <><span className="spinner" /> Saving…</>
                    : <><ISave s={14} /> Save</>}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}