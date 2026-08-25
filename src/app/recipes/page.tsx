'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface RecipeRow {
  id: number;
  menuItmID: string;
  rowItemCode: string;
  masterUnitID: string;
  subUnitID: string;
  qty: number;
  locCode: string;
  itemCost: number;
}

interface RecipeGroup {
  menuItmID: string;
  lineCount: number;
  totalCost: number;
}

interface MasterItem { code: string; des: string; }
interface RawItem { code: string; des: string; unit: string; cost: number; }
interface UnitItem { id: string; des: string; }
interface LocationItem { code: string; name: string; }

/* ─────────────────────────────────────────
   PAGE-LEVEL CSS
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
  .frm-input:disabled  { background:#f3f6f6; color:#9ca3af; cursor:not-allowed; }

  .frm-select {
    width:100%; border:1.5px solid #d1d9da; border-radius:8px;
    padding:0 26px 0 10px; height:34px;
    font-family:'Inter',sans-serif; font-size:12.5px; color:#1f2937;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 7px center;
    appearance:none; -webkit-appearance:none; outline:none; cursor:pointer;
    transition:border-color 0.15s,box-shadow 0.15s;
  }
  .frm-select:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-select.big   { height:36px; font-size:13px; padding:0 28px 0 11px; }

  .frm-cell-input {
    width:100%; border:1.5px solid transparent; border-radius:6px;
    padding:0 8px; height:32px; text-align:right;
    font-family:'Inter',sans-serif; font-size:12.5px; color:#1f2937;
    background:transparent; outline:none; transition:all 0.15s;
  }
  .frm-cell-input:hover { background:#fff; border-color:#d1d9da; }
  .frm-cell-input:focus { background:#fff; border-color:#1e3a40; box-shadow:0 0 0 2px rgba(30,58,64,0.08); }

  .sect-box { background:#fff; border:1.5px solid #d8e4e6; border-radius:12px; overflow:hidden; }
  .sect-hdr {
    background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%);
    padding:9px 14px; display:flex; align-items:center; gap:8px;
  }
  .sect-hdr-title { color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .sect-body { padding:14px; display:flex; flex-direction:column; gap:10px; }

  .frm-label {
    font-size:11px; font-weight:700; color:#4b5563;
    text-transform:uppercase; letter-spacing:0.05em;
    margin-bottom:4px; display:block;
  }

  .btn-save {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 24px; height:40px; border-radius:9px;
    background:#1e3a40; color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.25);
  }
  .btn-save:hover:not(:disabled) { background:#162e34; transform:translateY(-1px); box-shadow:0 4px 14px rgba(30,58,64,0.35); }
  .btn-save:disabled { background:#9ca3af; box-shadow:none; cursor:not-allowed; transform:none; }

  .btn-new {
    display:flex; align-items:center; justify-content:center; gap:7px;
    padding:0 18px; height:40px; border-radius:9px;
    background:linear-gradient(135deg,#1e3a40,#2a5260); color:#fff; border:none;
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 2px 8px rgba(30,58,64,0.2);
  }
  .btn-new:hover:not(:disabled) { background:linear-gradient(135deg,#162e34,#1e4050); transform:translateY(-1px); }
  .btn-new:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

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

  .btn-add-line {
    display:flex; align-items:center; justify-content:center; gap:6px;
    padding:0 14px; height:34px; border-radius:8px;
    background:#eef6f6; color:#1e3a40; border:1.5px dashed #9fbcbf;
    font-family:'Inter',sans-serif; font-size:12.5px; font-weight:700;
    cursor:pointer; transition:all 0.15s; width:100%;
  }
  .btn-add-line:hover { background:#dcecec; border-color:#1e3a40; }

  .btn-row-del {
    width:28px; height:28px; border-radius:7px; border:1.5px solid #fca5a5;
    background:#fff2f2; color:#dc2626;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:all 0.15s; flex-shrink:0;
  }
  .btn-row-del:hover { background:#fee2e2; border-color:#f87171; }

  .srv-list-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    border-radius:8px; cursor:pointer; transition:background 0.12s; border:none;
    background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif;
  }
  .srv-list-item:hover  { background:rgba(30,58,64,0.06); }
  .srv-list-item.active { background:rgba(30,58,64,0.1); }

  .badge-active { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d; }
  .badge-count  { display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:rgba(30,58,64,0.08);color:#1e3a40; }

  .ing-tbl { width:100%; border-collapse:collapse; }
  .ing-tbl th {
    background:#e8f0f1; padding:8px 8px; text-align:left;
    font-size:10.5px; font-weight:700; color:#374151; text-transform:uppercase;
    letter-spacing:0.04em; border-bottom:1.5px solid #d1d9da; white-space:nowrap;
  }
  .ing-tbl td { padding:6px 8px; border-bottom:1px solid #eef2f2; vertical-align:middle; font-size:12.5px; }
  .ing-tbl tr:last-child td { border-bottom:none; }
  .ing-tbl tr:hover td { background:#f6fafa; transition:background 0.1s; }

  @media(max-width:767px) {
    .left-panel { display:none !important; }
    .main-body  { padding-bottom:72px !important; }
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
const IBell      = ({ s = 21 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const ISearch    = ({ s = 15 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IChevD     = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IPlus      = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ITrash     = ({ s = 15 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IPrint     = ({ s = 15 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const ISave      = ({ s = 15 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IRefresh   = ({ s = 15 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>;
const ITag       = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const IFlask     = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v6.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/><line x1="7" y1="15" x2="17" y2="15"/></svg>;

/* ─────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────── */
function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="frm-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function SectBox({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sect-box">
      <div className="sect-hdr">
        {icon && <span style={{ color: 'rgba(255,255,255,0.7)' }}>{icon}</span>}
        <span className="sect-hdr-title">{title}</span>
      </div>
      <div className="sect-body">{children}</div>
    </div>
  );
}

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
   MAIN PAGE
───────────────────────────────────────── */
export default function RecipesPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState('recipes');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [menuItems, setMenuItems] = useState<MasterItem[]>([]);
  const [rawItems, setRawItems] = useState<RawItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [subUnits, setSubUnits] = useState<UnitItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);

  const [curMenuItmID, setCurMenuItmID] = useState<string>('');
  const [curLines,     setCurLines]     = useState<RecipeRow[]>([]);
  const [isNewRecipe, setIsNewRecipe] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const nextLineIdRef = useRef(1);
  const { toast, show: showToast } = useToast();

  const menuDes = useCallback((code: string) => {
    return menuItems.find(m => m.code === code)?.des ?? code;
  }, [menuItems]);

  const loadRecipes = useCallback(async (selectID?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/recipes');
      const json = await res.json() as {
        success: boolean;
        recipes: RecipeRow[];
        menuItems: MasterItem[];
        rawItems: RawItem[];
        units: UnitItem[];
        subUnits: UnitItem[];
        locations: LocationItem[];
      };
      if (!json.success) throw new Error('Failed to load recipes');

      setRows(json.recipes);
      setMenuItems(json.menuItems);
      setRawItems(json.rawItems);
      setUnits(json.units);
      setSubUnits(json.subUnits);
      setLocations(json.locations);

      nextLineIdRef.current = json.recipes.length > 0 ? Math.max(...json.recipes.map(r => r.id)) + 1 : 1;

      // Group unique menu items
      const uniqueMenus = Array.from(new Set(json.recipes.map(r => r.menuItmID)));
      if (uniqueMenus.length > 0) {
        const targetID = selectID && uniqueMenus.includes(selectID) ? selectID : uniqueMenus[0];
        setCurMenuItmID(targetID);
        setCurLines(json.recipes.filter(r => r.menuItmID === targetID).map(r => ({ ...r })));
        setIsNewRecipe(false);
      } else if (json.menuItems.length > 0) {
        setCurMenuItmID(json.menuItems[0].code);
        setCurLines([]);
        setIsNewRecipe(true);
      }
    } catch {
      showToast('Failed to load recipes from database', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadRecipes(); }, [loadRecipes]);

  /* Grouped list */
  const groups: RecipeGroup[] = useMemo(() => {
    const map = new Map<string, RecipeGroup>();
    rows.forEach(r => {
      const g = map.get(r.menuItmID) ?? { menuItmID: r.menuItmID, lineCount: 0, totalCost: 0 };
      g.lineCount += 1;
      g.totalCost += r.qty * r.itemCost;
      map.set(r.menuItmID, g);
    });
    return Array.from(map.values());
  }, [rows]);

  const filteredGroups = useMemo(() =>
    groups.filter(g =>
      menuDes(g.menuItmID).toLowerCase().includes(search.toLowerCase()) ||
      g.menuItmID.toLowerCase().includes(search.toLowerCase())
    ), [groups, search, menuDes]);

  const availableMenuItems = useMemo(() =>
    menuItems.filter(m => !groups.some(g => g.menuItmID === m.code) || m.code === curMenuItmID),
  [groups, menuItems, curMenuItmID]);

  const originalLines = useMemo(() =>
    rows.filter(r => r.menuItmID === curMenuItmID),
  [rows, curMenuItmID]);

  const isDirty = useMemo(() => {
    if (isNewRecipe) return curLines.length > 0 || curMenuItmID !== '';
    return JSON.stringify(curLines) !== JSON.stringify(originalLines);
  }, [curLines, originalLines, isNewRecipe, curMenuItmID]);

  function confirmDiscard(msg: string) {
    if (!isDirty) return true;
    return confirm(msg);
  }

  function handleSelectGroup(menuItmID: string) {
    if (menuItmID === curMenuItmID && !isNewRecipe) return;
    if (!confirmDiscard('Discard unsaved changes and switch recipe?')) return;
    setCurMenuItmID(menuItmID);
    setCurLines(rows.filter(r => r.menuItmID === menuItmID).map(r => ({ ...r })));
    setIsNewRecipe(false);
  }

  function handleNewRecipe() {
    if (!confirmDiscard('Discard unsaved changes and create a new recipe?')) return;
    const firstAvailable = menuItems.find(m => !groups.some(g => g.menuItmID === m.code));
    setCurMenuItmID(firstAvailable?.code ?? (menuItems[0]?.code || ''));
    setCurLines([]);
    setIsNewRecipe(true);
  }

  function addLine() {
    const id = nextLineIdRef.current++;
    const defRaw = rawItems[0];
    setCurLines(p => [...p, {
      id,
      menuItmID: curMenuItmID,
      rowItemCode:  defRaw?.code  ?? '',
      masterUnitID: defRaw?.unit  ?? (units[0]?.id || 'UNT03'),
      subUnitID:    subUnits[0]?.id    ?? '',
      qty: 1,
      locCode:  locations[0]?.code ?? '01',
      itemCost: defRaw?.cost ?? 0,
    }]);
  }

  function removeLine(id: number) {
    setCurLines(p => p.filter(l => l.id !== id));
  }

  function updLine<K extends keyof RecipeRow>(id: number, key: K, val: RecipeRow[K]) {
    setCurLines(p => p.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [key]: val };
      if (key === 'rowItemCode') {
        const raw = rawItems.find(r => r.code === val);
        if (raw) {
          updated.masterUnitID = raw.unit;
          updated.itemCost     = raw.cost;
        }
      }
      return updated;
    }));
  }

  async function handleSave() {
    if (!curMenuItmID) { showToast('Please select a Menu Item', true); return; }
    if (curLines.length === 0) { showToast('Add at least one ingredient line', true); return; }
    for (const l of curLines) {
      if (!l.rowItemCode) { showToast('Every line requires a Raw Item', true); return; }
      if (l.qty <= 0)     { showToast('Quantity must be greater than 0', true); return; }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItmID: curMenuItmID,
          lines: curLines,
        }),
      });
      const json = await res.json() as { success: boolean; message?: string };
      if (!json.success) throw new Error(json.message ?? 'Save failed');

      showToast('Recipe saved successfully ✓');
      setIsNewRecipe(false);
      await loadRecipes(curMenuItmID);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecipe() {
    if (!curMenuItmID || isNewRecipe) return;
    if (!confirm(`Delete the entire recipe for "${menuDes(curMenuItmID)}"? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(curMenuItmID)}`, { method: 'DELETE' });
      const json = await res.json() as { success: boolean; message?: string };
      if (!json.success) throw new Error(json.message ?? 'Delete failed');

      showToast('Recipe deleted successfully');
      await loadRecipes();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setDeleting(false);
    }
  }

  function handleClear() {
    if (isNewRecipe) {
      setCurLines([]);
    } else {
      setCurLines(rows.filter(r => r.menuItmID === curMenuItmID).map(r => ({ ...r })));
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

  const totalCost = curLines.reduce((sum, l) => sum + l.qty * l.itemCost, 0);
  const PAGE = '#c2d4d4';
  const HDR  = '#dae6e6';
  const busy = saving || deleting;

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && (
        <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: PAGE }}>
        <AdminSidebar active={navKey} onNav={handleNavigate} onLogout={handleLogout} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <header style={{ background: HDR, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: 0.4 }}>
                <ISearch />
              </span>
              <input
                aria-label="Search recipes"
                style={{ border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 38px', height: 40, width: 260, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937', background: '#fff', outline: 'none' }}
                placeholder="Search recipes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }} aria-label="Notifications">
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

          <div className="main-body" style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', gap: 13 }}>
            {/* LEFT PANEL */}
            <div className="left-panel" style={{ width: 260, flexShrink: 0, background: '#deeaea', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(30,58,64,0.1)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40' }}>Recipes</span>
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
                    {loading ? '…' : `${groups.length} total`}
                  </span>
                </div>
                <button className="btn-new" style={{ width: '100%' }} onClick={handleNewRecipe} disabled={busy}>
                  <IPlus s={14} /> New Recipe
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                    <span className="spinner dark" />
                  </div>
                )}
                {!loading && filteredGroups.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '2rem 0' }}>
                    No recipes found
                  </p>
                )}
                {!loading && filteredGroups.map(g => (
                  <button
                    key={g.menuItmID}
                    className={`srv-list-item ${curMenuItmID === g.menuItmID && !isNewRecipe ? 'active' : ''}`}
                    onClick={() => handleSelectGroup(g.menuItmID)}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#1e3a40,#2a5260)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                      <IFlask s={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a40', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {menuDes(g.menuItmID)}
                      </p>
                      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{g.menuItmID}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                        <span className="badge-count">{g.lineCount} ingredient{g.lineCount !== 1 ? 's' : ''}</span>
                        <span className="badge-active">Rs. {g.totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ background: '#1e3a40', borderRadius: '12px 12px 0 0', padding: '14px 18px', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {isNewRecipe ? 'New Recipe' : 'Edit Recipe'}
                  {isDirty && '  •  Unsaved changes'}
                </p>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                  RECIPE / BILL OF MATERIALS
                </p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 13, background: '#e8f0f1' }}>
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <span className="spinner dark" style={{ width: 28, height: 28 }} />
                  </div>
                )}

                {!loading && (
                  <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    <SectBox title="Recipe Header" icon={<ITag s={14} />}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                        <FieldRow label="Menu Item (MenuItmID) *" htmlFor="rcp-menu">
                          <select
                            id="rcp-menu"
                            className="frm-select big"
                            value={curMenuItmID}
                            disabled={!isNewRecipe}
                            onChange={e => setCurMenuItmID(e.target.value)}
                          >
                            <option value="">-- Select Menu Item --</option>
                            {availableMenuItems.map(m => (
                              <option key={m.code} value={m.code}>{m.code} - {m.des}</option>
                            ))}
                          </select>
                        </FieldRow>
                        <FieldRow label="Total Ingredients" htmlFor="rcp-count">
                          <input id="rcp-count" className="frm-input" value={curLines.length} readOnly />
                        </FieldRow>
                      </div>
                      {!isNewRecipe && (
                        <p style={{ fontSize: 11, color: '#9ca3af' }}>
                          * Menu Item cannot be changed for an existing recipe — delete and re-create if needed.
                        </p>
                      )}
                    </SectBox>

                    <SectBox title="Ingredient Lines" icon={<IFlask s={14} />}>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="ing-tbl">
                          <thead>
                            <tr>
                              <th style={{ width: 26 }}>#</th>
                              <th style={{ minWidth: 170 }}>Raw Item (RowItemCode)</th>
                              <th style={{ minWidth: 100 }}>Master Unit</th>
                              <th style={{ minWidth: 100 }}>Sub Unit</th>
                              <th style={{ width: 80, textAlign: 'right' }}>Qty</th>
                              <th style={{ minWidth: 130 }}>Location (LocCode)</th>
                              <th style={{ width: 100, textAlign: 'right' }}>Item Cost</th>
                              <th style={{ width: 100, textAlign: 'right' }}>Line Total</th>
                              <th style={{ width: 36 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {curLines.length === 0 && (
                              <tr>
                                <td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: '18px 0' }}>
                                  No ingredient lines yet — click &quot;Add Ingredient Line&quot; below.
                                </td>
                              </tr>
                            )}
                            {curLines.map((l, idx) => (
                              <tr key={l.id}>
                                <td style={{ color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                                <td>
                                  <select className="frm-select" value={l.rowItemCode} onChange={e => updLine(l.id, 'rowItemCode', e.target.value)}>
                                    {rawItems.map(r => <option key={r.code} value={r.code}>{r.des}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <select className="frm-select" value={l.masterUnitID} onChange={e => updLine(l.id, 'masterUnitID', e.target.value)}>
                                    {units.map(u => <option key={u.id} value={u.id}>{u.des}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <select className="frm-select" value={l.subUnitID} onChange={e => updLine(l.id, 'subUnitID', e.target.value)}>
                                    <option value="">--</option>
                                    {subUnits.map(s => <option key={s.id} value={s.id}>{s.des}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    className="frm-cell-input"
                                    type="number" min={0} step="0.01"
                                    value={l.qty}
                                    onChange={e => updLine(l.id, 'qty', Number(e.target.value))}
                                  />
                                </td>
                                <td>
                                  <select className="frm-select" value={l.locCode} onChange={e => updLine(l.id, 'locCode', e.target.value)}>
                                    {locations.map(loc => <option key={loc.code} value={loc.code}>{loc.name}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    className="frm-cell-input"
                                    type="number" min={0} step="0.01"
                                    value={l.itemCost}
                                    onChange={e => updLine(l.id, 'itemCost', Number(e.target.value))}
                                  />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e3a40' }}>
                                  {(l.qty * l.itemCost).toFixed(2)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button className="btn-row-del" onClick={() => removeLine(l.id)} title="Remove line">
                                    <ITrash s={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button className="btn-add-line" onClick={addLine}>
                        <IPlus s={14} /> Add Ingredient Line
                      </button>
                    </SectBox>

                    <div style={{ background: 'linear-gradient(135deg,#1e3a40,#2a5260)', borderRadius: 12, padding: '16px 18px' }}>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                        Recipe Cost Summary
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'Ingredient Lines', val: `${curLines.length}` },
                          { label: 'Total Recipe Cost', val: `Rs. ${totalCost.toFixed(2)}` },
                          { label: 'Avg Cost / Line',   val: curLines.length ? `Rs. ${(totalCost / curLines.length).toFixed(2)}` : 'Rs. 0.00' },
                        ].map(item => (
                          <div key={item.label}>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                            <p style={{ color: '#fff', fontSize: 16, fontWeight: 800, marginTop: 3 }}>{item.val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ background: '#dce8e8', borderTop: '1.5px solid rgba(30,58,64,0.12)', padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-clear" onClick={handleClear} disabled={busy}>
                  <IRefresh s={14} /> Clear
                </button>
                <button className="btn-print" onClick={() => window.print()} disabled={busy}>
                  <IPrint s={14} /> Print
                </button>
                <div style={{ flex: 1 }} />
                {!isNewRecipe && (
                  <button className="btn-del" onClick={handleDeleteRecipe} disabled={busy}>
                    {deleting
                      ? <><span className="spinner" style={{ borderTopColor: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }} /> Deleting…</>
                      : <><ITrash s={14} /> Delete Recipe</>}
                  </button>
                )}
                <button className="btn-save" onClick={handleSave} disabled={!curMenuItmID || busy}>
                  {saving
                    ? <><span className="spinner" /> Saving…</>
                    : <><ISave s={14} /> Save Recipe</>}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}