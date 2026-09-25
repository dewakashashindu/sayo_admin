'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import InventoryPrintSheet, { INVENTORY_PRINT_CSS } from '@/components/InventoryPrintSheet';
import { poPrintValueColumns, type PoPrintCopy } from '@/lib/poPrint';

interface LookupLocation { code: string; des: string; address: string; enable: boolean }
interface LookupUnit { id: string; des: string; enable: boolean }
interface CatOpt { code: string; des: string; enable: boolean }

interface ReconLine {
  key: string;
  itemCode: string;
  itemName: string;
  unitID: string;
  systemQty: number;
  phyQty: string;
  applica: boolean;
  costPrice: number;
  itemValue: number;
}
interface ReconListRow {
  recNo: string; locCode: string; recDate: string; userName: string; netValue: number; confirmed: boolean;
}

let lineSeq = 0;
const money = (n: number) => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const recalc = (l: ReconLine): number => {
  if (!l.applica) return 0;
  const phy = Number(l.phyQty) || 0;
  const diff = phy - l.systemQty;
  return diff * (Number(l.costPrice) || 0);
};
function dayOf(v: unknown) { return String(v ?? '').slice(0, 10); }

function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const show = useCallback((msg: string, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 4200); }, []);
  return { toast, show };
}

export default function ReconPage() {
  const router = useRouter();
  const { toast, show: showToast } = useToast();
  const [tab, setTab] = useState<'find' | 'details'>('details');

  const [locations, setLocations] = useState<LookupLocation[]>([]);
  const [units, setUnits] = useState<LookupUnit[]>([]);
  const [cats1, setCats1] = useState<CatOpt[]>([]);
  const [cats2, setCats2] = useState<CatOpt[]>([]);
  const [cats3, setCats3] = useState<CatOpt[]>([]);
  const [cats4, setCats4] = useState<CatOpt[]>([]);
  const [lookupNote, setLookupNote] = useState('Loading locations…');
  const [company,setCompany]=useState<{name:string;address:string;phone:string}>({name:'SAYO',address:'',phone:''});
  const [printAsk,setPrintAsk]=useState(false);
  const [printJob,setPrintJob]=useState<{copy:PoPrintCopy;at:Date}|null>(null);
  const [actor,setActor]=useState('');
  const [mailAsk,setMailAsk]=useState(false);
  const [mailTo,setMailTo]=useState('');
  const [mailCopy,setMailCopy]=useState<PoPrintCopy>('standard');
  const [mailSubject,setMailSubject]=useState('');
  const [mailMessage,setMailMessage]=useState('');
  const [mailSending,setMailSending]=useState(false);

  const [locCode, setLocCode] = useState('');
  // Main Cat removed — 4 subs only: Sub cat1→Category1, Sub cat2→Category2, Sub cat3→Category3, Sub cat4→Category4
  const [sub1, setSub1] = useState('');
  const [sub2, setSub2] = useState('');
  const [sub3, setSub3] = useState('');
  const [sub4, setSub4] = useState('');
  const [recNo, setRecNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<ReconLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [printDate] = useState(() => new Date());

  const [list, setList] = useState<ReconListRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [findStatus, setFindStatus] = useState<'all' | 'confirmed' | 'pending'>('confirmed');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/inventory/lookups', { cache: 'no-store' });
        const j = (await res.json()) as any;
        if (!active) return;
        if (!res.ok || !j?.success) throw new Error(j?.message || `HTTP ${res.status}`);
        const locs = j.locations ?? [];
        setLocations(locs); setUnits(j.units ?? []);
        if(j.company) setCompany({name:j.company.name||'SAYO',address:j.company.address||'',phone:j.company.phone||''});
        setLookupNote(`${locs.length} location(s) loaded`);
        setLocCode((prev) => prev || locs[0]?.code || '');
        // categories — 4 masters, CatDes shown, Code stored
        const fetchCat = async (level: string) => {
          try {
            const r = await fetch(`/api/categories?level=${level}`, { cache: 'no-store' });
            const d = (await r.json()) as any;
            if (r.ok && d?.success && Array.isArray(d.data)) {
              return d.data
                .filter((x: any) => x.enable !== false)
                .map((x: any) => ({ code: String(x.catCode ?? x.code ?? '').trim(), des: String(x.catDes ?? x.des ?? '').trim(), enable: true }));
            }
          } catch {}
          return [];
        };
        const [c1, c2, c3, c4] = await Promise.all([fetchCat('1'), fetchCat('2'), fetchCat('3'), fetchCat('4')]);
        if (!active) return;
        // fallback when tables empty — keep screenshot FRUITS example
        setCats1(c1.length ? c1 : [{ code: 'FRUITS', des: 'FRUITS', enable: true }]);
        setCats2(c2.length ? c2 : []);
        setCats3(c3.length ? c3 : []);
        setCats4(c4.length ? c4 : []);
      } catch { if (active) { setLookupNote(''); showToast('Could not load locations', true); } }
    })();
    return () => { active = false; };
  }, [showToast]);

  useEffect(()=>{ let a=true; (async()=>{ try{ const r=await fetch('/api/auth/admin-me',{cache:'no-store'}); const j=await r.json() as any; if(!a||!j?.success) return; setActor(j.user?.username||j.user?.name||''); }catch{} })(); return()=>{a=false}; },[]);

  const unitName = (id: string) => units.find((u) => u.id === id)?.des || id || '—';

  async function handleLoad() {
    if (!locCode) { showToast('Choose a location first', true); return; }
    setLoadingLines(true);
    try {
      const params = new URLSearchParams({ locCode, limit: '800' });
      if (sub1) params.set('sub1', sub1);
      if (sub2) params.set('sub2', sub2);
      if (sub3) params.set('sub3', sub3);
      if (sub4) params.set('sub4', sub4);
      const res = await fetch(`/api/inventory/recon/load?${params.toString()}`, { cache: 'no-store' });
      const j = (await res.json()) as any;
      if (!res.ok || !j?.success) throw new Error(j?.message || 'load failed');
      if (!Array.isArray(j.data) || j.data.length === 0) { showToast('No items matched those categories', true); setLines([]); return; }
      setLines(
        j.data.map((r: any) => ({
          key: `C${++lineSeq}`,
          itemCode: String(r.itemCode ?? '').trim(),
          itemName: String(r.itemName ?? r.itemCode ?? '').trim(),
          unitID: String(r.unitID ?? '').trim(),
          systemQty: Number(r.systemQty) || 0,
          phyQty: String(Number(r.systemQty) || 0),
          applica: false,
          costPrice: Number(r.costPrice) || 0,
          itemValue: 0,
        }))
      );
      showToast(`${j.data.length} item(s) loaded — enter Physical Qty and tick Applica`);
    } catch (e: any) {
      showToast(e?.message || 'Could not load items', true);
    } finally { setLoadingLines(false); }
  }

  function patchLine(key: string, patch: Partial<ReconLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const nxt = { ...l, ...patch } as ReconLine;
        nxt.itemValue = recalc(nxt);
        return nxt;
      })
    );
    setDirty(true);
  }

  const netValue = useMemo(() => lines.reduce((s, l) => s + l.itemValue, 0), [lines]);
  const applicaCount = useMemo(() => lines.filter((l) => l.applica).length, [lines]);

  const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const res = await fetch(`/api/inventory/recon?status=${findStatus}&q=${encodeURIComponent(findQ)}${locCode ? `&locCode=${encodeURIComponent(locCode)}` : ''}`, { cache: 'no-store' });
      const j = (await res.json()) as any;
      if (res.ok && j?.success) { setList(j.data ?? []); return; }
      throw new Error('no api');
    } catch {
      setList([]);
    } finally { setListBusy(false); }
  }, [findQ, findStatus, locCode]);
  useEffect(() => { if (tab === 'find') void loadList(); }, [tab, loadList]);

  async function openRecon(row: ReconListRow) {
    setRecNo(row.recNo); setLocCode(row.locCode); setConfirmed(row.confirmed);
    try {
      const res = await fetch(`/api/inventory/recon/${encodeURIComponent(row.recNo)}?locCode=${encodeURIComponent(row.locCode)}`, { cache: 'no-store' });
      const j = (await res.json()) as any;
      if (res.ok && j?.success && j.data) {
        const h = j.data.header; setRemarks(h.remarks || ''); setConfirmed(h.confirmed);
        setLines(
          (j.data.lines ?? []).map((r: any) => ({
            key: `C${++lineSeq}`,
            itemCode: r.itemCode, itemName: r.itemName, unitID: r.unitID,
            systemQty: Number(r.systemQty) || 0, phyQty: String(r.phyQty ?? r.systemQty ?? 0),
            applica: true, costPrice: Number(r.costPrice) || 0, itemValue: Number(r.itemValue) || 0,
          }))
        );
        setDirty(false); setTab('details'); showToast(`Reconciliation ${row.recNo.trim()} loaded`);
        return;
      }
      throw new Error('fallback');
    } catch {
      setLines([]);
      setTab('details');
      showToast(`Recon ${row.recNo.trim()} — could not load lines`, true);
    }
  }

  async function handleSave(): Promise<boolean> {
    if (!locCode) { showToast('Choose a location first', true); return false; }
    if (lines.length === 0) { showToast('Press Load first', true); return false; }
    if (applicaCount === 0) { showToast('Tick Applica for at least one line you want to adjust', true); return false; }
    setSaving(true);
    try {
      const body = {
        locCode,
        recDate: new Date().toISOString().slice(0, 10),
        remarks,
        lines: lines.map((l) => ({ itemCode: l.itemCode, unitID: l.unitID, costPrice: l.costPrice, systemQty: l.systemQty, phyQty: Number(l.phyQty) || 0, applica: l.applica })),
        confirm: false,
      };
      const res = await fetch('/api/inventory/recon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await res.json()) as any;
      if (!res.ok || !j?.success) throw new Error(j?.message || 'Save failed');
      const savedNo = String(j.data?.recNo ?? '').trim();
      if (savedNo) setRecNo(savedNo);
      setDirty(false); showToast(j.message || `Saved ✓ — ${savedNo}`);
      return true;
    } catch (e: any) { showToast(e?.message || 'Save failed', true); return false; } finally { setSaving(false); }
  }

  async function handleConfirm() {
    if (confirmed) { showToast('Already confirmed'); return; }
    if (applicaCount === 0) { showToast('Tick Applica for at least one line', true); return; }
    const totalNote = `${applicaCount} line(s) Applicable — StockBalance will be set to Physical Qty`;
    // fresh document — save & confirm in one atomic request (avoids stale recNo race)
    if (!recNo.trim()) {
      if (!locCode) { showToast('Choose a location first', true); return; }
      if (!confirm(`Confirm Stock Reconciliation (new)? ${totalNote}. Cannot be undone.`)) return;
      setConfirming(true);
      try {
        const body = {
          locCode, recDate: new Date().toISOString().slice(0, 10), remarks,
          lines: lines.map((l) => ({ itemCode: l.itemCode, unitID: l.unitID, costPrice: l.costPrice, systemQty: l.systemQty, phyQty: Number(l.phyQty) || 0, applica: l.applica })),
          confirm: true,
        };
        const r2 = await fetch('/api/inventory/recon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j2 = (await r2.json()) as any;
        if (!r2.ok || !j2?.success) throw new Error(j2?.message || 'Confirm failed');
        setRecNo(String(j2.data?.recNo ?? '').trim()); setConfirmed(true); setDirty(false); showToast(j2.message || 'Confirmed ✓ — stock updated');
      } catch (e: any) { showToast(e?.message || 'Confirm failed', true); } finally { setConfirming(false); }
      return;
    }
    if (!confirm(`Confirm Stock Reconciliation ${recNo.trim()}? ${totalNote}. Cannot be undone.`)) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/inventory/recon/${encodeURIComponent(recNo.trim())}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locCode }) });
      const j = (await res.json()) as any;
      if (!res.ok || !j?.success) throw new Error(j?.message || 'Confirm failed');
      setConfirmed(true); setDirty(false); showToast(j.message || 'Confirmed ✓ — stock updated');
    } catch (e: any) { showToast(e?.message || 'Confirm failed', true); } finally { setConfirming(false); }
  }

  function handleClear() { setLines([]); setRecNo(''); setConfirmed(false); setDirty(false); setRemarks(''); }
  function handleCancel() { if (dirty && !confirm('Discard changes?')) return; handleClear(); showToast('Cleared'); }
  function handleNav(k: string, p: string) { if (dirty && !confirm('Leave without saving?')) return; router.push(p); }

    const printableLines = lines.filter(l=> l.applica);
  function handlePrint(){
    if(printableLines.length===0){ showToast('Tick Applica for at least one line before printing',true); return; }
    if(!recNo.trim()){ showToast('Save first, then print',true); return; }
    setPrintAsk(true);
  }
  function startPrint(copy:PoPrintCopy){ setPrintAsk(false); setPrintJob({copy, at:new Date()}); }
  React.useEffect(()=>{ if(!printJob) return; const id=window.setTimeout(()=>window.print(),60); return()=>window.clearTimeout(id); },[printJob as any]);

    function openMailDialog(){
    if(printableLines.length===0){ showToast('Tick Applica for at least one line before emailing',true); return; }
    if(!recNo.trim()){ showToast('Save the Recon first, then it can be emailed',true); return; }
    setMailTo(prev=> prev||'');
    setMailSubject(prev=> prev||`Stock Reconciliation Note ${recNo.trim()} — ${locDes}`);
    setMailCopy(prev=> prev||'standard');
    setMailAsk(true);
  }
  async function sendMail(){
    const to=mailTo.trim(); if(!to){ showToast('Type the address to send to',true); return; }
    setMailSending(true);
    try{
      const res=await fetch(`/api/inventory/recon/${encodeURIComponent(recNo.trim())}/email`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ locCode, copy: mailCopy, to, subject: mailSubject.trim(), message: mailMessage.trim() }) });
      const j=await res.json() as any;
      if(!res.ok||!j?.success) throw new Error(j?.message||'Email failed');
      setMailAsk(false); showToast(j.message||'Emailed ✓');
    }catch(e:any){ showToast(e?.message||'Email failed',true); } finally{ setMailSending(false); }
  }

  const busy = saving || confirming;
  const locked = confirmed;
  const locDes = locations.find((l) => l.code === locCode)?.des || locCode;
  const printRows=lines.filter(l=>l.applica).map(l=>({ itemCode:l.itemCode, name:l.itemName, unit:unitName(l.unitID), qty:String(Number(l.phyQty)||0), costPrice: money(l.costPrice), itemValue: money(l.itemValue) }));

  return (
    <>
      <style>{SIDEBAR_CSS}</style><style>{INVENTORY_PRINT_CSS}</style>
      <style>{PAGE_CSS}</style>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-recon" onNav={handleNav} onLogout={() => router.push('/admin-login')} /></div>
        <div className="po-main">
          <header className="po-head no-print">
            <h1>STOCK RECONCILIATION NOTE</h1>
            <div className="po-tabs">
              <button className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>Find</button>
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
            </div>
            <div className="po-state">
              {recNo ? <span className="chip">{recNo.trim()}</span> : <span className="chip dim">not saved yet</span>}
              {recNo && (confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>)}
              {dirty && <span className="chip dim">unsaved changes</span>}
            </div>
          </header>

          {lookupNote && <div className="po-note no-print">{lookupNote}</div>}

          {tab === 'find' && (
            <div className="po-card no-print">
              <div className="po-list-wrap">
                <table className="po-table">
                  <thead><tr><th>RecNo</th><th>LocCode</th><th>Recdate</th><th>UserName</th><th className="num">NetValue</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {list.length === 0 && <tr><td colSpan={7} className="empty">{listBusy ? 'Loading…' : 'No reconciliations matched — save one from Details'}</td></tr>}
                    {list.map((r) => (
                      <tr key={`${r.locCode}|${r.recNo}`}>
                        <td className="mono" style={{ color: '#0b5cab' }}>{r.recNo.trim()}</td>
                        <td style={{ color: '#0b5cab' }}>{r.locCode.trim()}</td>
                        <td style={{ color: '#0b5cab' }}>{dayOf(r.recDate)}</td>
                        <td style={{ color: '#0b5cab' }}>{r.userName}</td>
                        <td className="num" style={{ color: '#0b5cab' }}>{money(r.netValue)}</td>
                        <td>{r.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>}</td>
                        <td><button className="btn small" onClick={() => void openRecon(r)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="po-find">
                <label>Find Criteria</label>
                <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder="Rec no" />
                <label className="rad"><input type="radio" checked={findStatus === 'confirmed'} onChange={() => setFindStatus('confirmed')} /> Confirmed Rec.</label>
                <label className="rad"><input type="radio" checked={findStatus === 'pending'} onChange={() => setFindStatus('pending')} /> Pending Rec.</label>
                <label className="rad"><input type="radio" checked={findStatus === 'all'} onChange={() => setFindStatus('all')} /> All</label>
                <button className="btn" onClick={() => void loadList()} disabled={listBusy}>{listBusy ? 'Loading…' : 'Find'}</button>
              </div>
            </div>
          )}

          {tab === 'details' && (
            <div className="po-card">
              {}
              <div className="po-print-head">
                <div><b>STOCK RECONCILIATION NOTE</b> {recNo.trim() || ''}</div>
                <div>{locDes} · {printDate.toLocaleDateString()} · {confirmed ? 'Confirmed' : 'Pending'} · Rec. No {recNo.trim() || '(new)'}</div>
                <div>Sub cat1: {cats1.find((c) => c.code === sub1)?.des || sub1 || '— all —'} · Sub cat2: {cats2.find((c) => c.code === sub2)?.des || sub2 || '— all —'} · Sub cat3: {cats3.find((c) => c.code === sub3)?.des || sub3 || '— all —'} · Sub cat4: {cats4.find((c) => c.code === sub4)?.des || sub4 || '— all —'}</div>
              </div>

              <div className="po-form no-print" style={{ gridTemplateColumns: '110px minmax(150px,1fr) 90px minmax(130px,1fr) 90px minmax(130px,1fr)' }}>
                <label>Location</label>
                <select value={locCode} onChange={(e) => { setLocCode(e.target.value); setDirty(true); }} disabled={locked}>
                  <option value="">— choose —</option>
                  {locations.map((l) => <option key={l.code} value={l.code}>{l.code} — {l.des}{l.enable ? '' : ' (Inactive)'}</option>)}
                </select>
                <label>Sub cat1</label>
                <select value={sub1} onChange={(e) => setSub1(e.target.value)} disabled={locked}>
                  <option value="">— all —</option>
                  {cats1.map((c) => <option key={`c1-${c.code}`} value={c.code}>{c.des}</option>)}
                </select>
                <label>Sub cat2</label>
                <select value={sub2} onChange={(e) => setSub2(e.target.value)} disabled={locked}>
                  <option value="">— all —</option>
                  {cats2.map((c) => <option key={`c2-${c.code}`} value={c.code}>{c.des}</option>)}
                </select>

                <label>Sub cat3</label>
                <select value={sub3} onChange={(e) => setSub3(e.target.value)} disabled={locked}>
                  <option value="">— all —</option>
                  {cats3.map((c) => <option key={`c3-${c.code}`} value={c.code}>{c.des}</option>)}
                </select>
                <label>Sub cat4</label>
                <select value={sub4} onChange={(e) => setSub4(e.target.value)} disabled={locked}>
                  <option value="">— all —</option>
                  {cats4.map((c) => <option key={`c4-${c.code}`} value={c.code}>{c.des}</option>)}
                </select>

                <label>Rec. No</label>
                <input value={recNo.trim()} readOnly placeholder="issued on save" className="mono" style={{ background: '#fff8dc' }} />
                <div style={{ gridColumn: 'span 4', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <input value={remarks} onChange={(e) => { setRemarks(e.target.value); setDirty(true); }} placeholder="Remarks" disabled={locked} style={{ flex: 1, height: 32, border: '1px solid rgba(30,58,64,0.18)', borderRadius: 7, padding: '0 9px' }} />
                  <button className="btn primary" onClick={() => void handleLoad()} disabled={loadingLines || locked} style={{ minWidth: 140 }}>
                    {loadingLines ? 'Loading…' : 'Load'}
                  </button>
                </div>
              </div>

              <div className="po-grid-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th style={{ width: 90 }}>Item Code</th>
                      <th>Item Name</th>
                      <th style={{ width: 95 }}>Unit</th>
                      <th style={{ width: 105 }} className="num">System Qty</th>
                      <th style={{ width: 115 }} className="num">Phy Qty</th>
                      <th style={{ width: 85 }}>Applica</th>
                      <th style={{ width: 105 }} className="num">Cost Price</th>
                      <th style={{ width: 120 }} className="num">Item Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && <tr><td colSpan={9} className="empty">{loadingLines ? 'Loading…' : 'Choose categories and press Load — System Qty comes from StockBalance'}</td></tr>}
                    {lines.map((l, i) => (
                      <tr key={l.key}>
                        <td className="num">{i + 1}</td>
                        <td className="mono">{l.itemCode}</td>
                        <td>{l.itemName}</td>
                        <td>{unitName(l.unitID)}</td>
                        <td className="num" style={{ background: '#e8eef3' }}>{l.systemQty}</td>
                        <td className="num" style={{ background: locked ? '#eef2f2' : '#8ecaff' }}>
                          <input type="number" step="0.01" className="num" value={l.phyQty} disabled={locked}
                            style={{ background: locked ? '#eef2f2' : '#8ecaff', borderColor: '#4a90d9', fontWeight: 700 }}
                            onChange={(e) => patchLine(l.key, { phyQty: e.target.value })} />
                        </td>
                        <td style={{ background: '#7ed185', textAlign: 'center' }}>
                          <input type="checkbox" checked={l.applica} disabled={locked}
                            onChange={(e) => patchLine(l.key, { applica: e.target.checked })}
                            style={{ width: 16, height: 16, accentColor: '#1e3a40' }} />
                        </td>
                        <td className="num">{money(l.costPrice)}</td>
                        <td className="num" style={{ background: l.applica ? '#fff8dc' : '#f6fafa' }}>{money(l.itemValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="po-actions no-print" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="hint">{lines.length} item(s) · {applicaCount} Applicable · Difference = Phy − System · {confirmed ? 'Locked (confirmed)' : 'Only Applica lines move stock on Confirmation'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#3c5a60', textTransform: 'uppercase' }}>Net Value</label>
                  <input value={money(netValue)} readOnly className="num strong" style={{ width: 140, height: 32, border: '1px solid rgba(30,58,64,0.18)', borderRadius: 7, padding: '0 9px', textAlign: 'right', fontWeight: 800, background: '#fff8dc' }} />
                </div>
              </div>

              <div className="po-actions no-print">
                <button className="btn" onClick={handleClear} disabled={busy}>Clear</button>
                <button className="btn" onClick={() => void handleConfirm()} disabled={busy || confirmed}>{confirming ? 'Confirming…' : 'Confirmation'}</button>
                <button className="btn" onClick={() => handlePrint()} disabled={busy||!recNo.trim()}>Print</button>
                <button className="btn" onClick={()=> void openMailDialog()} disabled={busy||!recNo.trim()||mailSending} title="Email this Recon as PDF">{mailSending?'Sending…':'Email'}</button>
                <button className="btn primary" onClick={() => void handleSave()} disabled={busy || locked}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="btn" onClick={handleCancel} disabled={busy}>Cancel</button>
              </div>

              {applicaCount > 0 && <div className="po-note no-print">{applicaCount} line(s) ticked Applicable — only these will set StockBalance = Phy Qty when you press Confirmation. No other master field changes.</div>}
              {printJob && <InventoryPrintSheet title="Stock Reconciliation Note" docNo={recNo.trim()} docDate={new Date().toLocaleDateString()} printDate={printJob.at.toLocaleDateString()} printTime={printJob.at.toLocaleTimeString()} user={actor||'admin'} companyName={company.name} companyAddress={company.address} companyPhone={company.phone} branch={locDes} partnerLabel="Location" partnerCode={locCode} partnerName={locDes} partnerAddress={locations.find(l=>l.code===locCode)?.address||''} columns={(() => { const c = poPrintValueColumns(printJob.copy); return {code:'ItemCode',des:'Item Description',unit:'Unit',qty:'Phy Qty',cost: c.costPrice ? 'Cost Price' : undefined as any, value: c.itemValue ? 'Item Value' : undefined as any } as any; })()} rows={printRows.map(r=>({ ...r, costPrice: poPrintValueColumns(printJob.copy).costPrice ? r.costPrice : '', itemValue: poPrintValueColumns(printJob.copy).itemValue ? r.itemValue : '' }))} totalLabel="Net Value" total={poPrintValueColumns(printJob.copy).total ? money(netValue) : ''} remarks={remarks} />}
              {printJob && <div className="no-print" style={{textAlign:'right'}}><button className="btn primary" onClick={()=>window.print()}>Print now</button> <button className="btn" onClick={()=>setPrintJob(null)}>Close preview</button></div>}
            </div>
          )}
        </div>
      </div>
      {/* internal note — no supplier copy, confirm only */}
      {printAsk && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Print Recon">
          <div className="ask-card">
            <h2>Print Stock Reconciliation Note</h2>
            <p><span className="mono">{recNo.trim()}</span> — COLOMBO MAIN BRANCH · {new Date().toLocaleDateString()} · {confirmed ? 'Confirmed' : 'Pending'}</p>
            <p style={{fontSize:'11.5px',color:'#5b7176'}}>There is no supplier copy for a Stock Reconciliation Note — only the standard copy is printed, unlike for a GRN/PO.</p>
            <div className="ask-choices" style={{gridTemplateColumns:'1fr'}}>
              <button className="ask-choice" onClick={()=> startPrint('standard' as PoPrintCopy)}>
                <span className="ask-choice-title">Standard Copy — Print</span>
                <span className="ask-choice-hint">Item code · item name · unit · Phy Qty · cost price · item value · Net Value — the salon's internal copy (same paper as PO/GRN)</span>
              </button>
            </div>
            <div className="ask-foot"><button className="btn" onClick={()=> setPrintAsk(false)}>Cancel</button></div>
          </div>
        </div>
      )}
      {mailAsk && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Email Recon">
          <div className="ask-card mail-card">
            <h2>Email Stock Reconciliation Note</h2>
            <p><span className="mono">{recNo.trim()}</span> at <b>{locDes}</b> as a PDF.</p>
            <div className="mail-field"><label htmlFor="mail-to">To</label><input id="mail-to" value={mailTo} onChange={e=>setMailTo(e.target.value)} placeholder="recipient@example.com" spellCheck={false} /></div>
            <div className="mail-field"><label style={{fontSize:'11px',fontWeight:700,color:'#3c5a60',textTransform:'uppercase',letterSpacing:'0.03em'}}>Copy to send</label><div className="mail-copies" style={{gridTemplateColumns:'1fr'}}><label className="mail-radio on"><input type="radio" checked readOnly /><span><b>Standard Copy</b><span className="mail-radio-hint">Internal note — supplier copy na, cost/value included like PO/GRN standard</span></span></label></div></div>
            <div className="mail-field"><label htmlFor="mail-subject">Subject</label><input id="mail-subject" value={mailSubject} onChange={e=>setMailSubject(e.target.value)} /></div>
            <div className="mail-field"><label htmlFor="mail-message">Message</label><textarea id="mail-message" rows={4} value={mailMessage} onChange={e=>setMailMessage(e.target.value)} placeholder="Leave empty for standard note (Recon number, date, line count)." /></div>
            <div className="mail-attach">Attachment: <b>{(recNo.trim()||'recon-note').trim()}.pdf</b> · {printableLines.length} line(s) · {mailCopy==='supplier'?'no prices':'net '+money(netValue)}</div>
            <div className="ask-foot"><button className="btn" onClick={()=> setMailAsk(false)} disabled={mailSending}>Cancel</button><button className="btn primary" onClick={()=> void sendMail()} disabled={mailSending||!mailTo.trim()}>{mailSending?'Sending…':'Send Email'}</button></div>
          </div>
        </div>
      )}
    </>
  );
}

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{color-scheme:light}
  html,body{height:100%;font-family:'Inter',sans-serif;color:#1f2937;background:#c2d4d4;color-scheme:light}
  input,select,textarea,option{color:#1f2937;background:#fff}
  input::placeholder,textarea::placeholder{color:#9ca3af}
  input:disabled,select:disabled,textarea:disabled{background:#eef2f2;color:#7b8f92;-webkit-text-fill-color:#7b8f92}
  @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  .toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1e3a40;color:#fff;padding:11px 26px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.28);animation:toastIn 0.22s ease;max-width:80vw;text-align:center}
  .toast.err{background:#dc2626}
  .po-shell{display:flex;height:100vh;overflow:hidden;background:#c2d4d4}
  .po-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:14px 16px 26px;gap:12px}
  .po-head{background:#dae6e6;border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
  .po-head h1{font-size:17px;letter-spacing:0.06em;color:#16333a;font-weight:800}
  .po-tabs{display:flex;gap:6px;margin-left:auto}
  .po-tabs button{border:1px solid rgba(30,58,64,0.22);background:#eef4f4;color:#1e3a40;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
  .po-tabs button.on{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .po-state{display:flex;gap:6px;align-items:center}
  .chip{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(30,58,64,0.10);color:#1e3a40}
  .chip.ok{background:#dcfce7;color:#15803d}
  .chip.warn{background:#fef3c7;color:#b45309}
  .chip.dim{background:rgba(30,58,64,0.06);color:#64748b;font-weight:600}
  .po-note{font-size:11.5px;font-weight:600;color:#1e3a40;background:#e8f1f1;border-radius:8px;padding:7px 11px}
  .po-error{font-size:12px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:10px;padding:9px 12px}
  .po-card{background:#eef4f4;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:12px}
  .po-form{display:grid;grid-template-columns:110px minmax(150px,1fr) 90px minmax(130px,1fr) 90px minmax(130px,1fr);gap:9px 12px;align-items:center}
  .po-form label{font-size:11.5px;font-weight:700;color:#3c5a60;text-transform:uppercase;letter-spacing:0.03em}
  .po-form input,.po-form select{height:32px;border:1px solid rgba(30,58,64,0.18);border-radius:7px;background:#fff;padding:0 9px;font-size:12.5px;font-family:inherit;color:#1f2937;width:100%;color-scheme:light}
  .po-form input:disabled,.po-form select:disabled{background:#e5ebeb;color:#7b8f92}
  .po-form input.num.strong{font-weight:800;color:#16333a}
  .po-find{display:flex;flex-wrap:wrap;align-items:center;gap:9px 12px;margin-top:4px}
  .po-find label{font-size:11.5px;font-weight:700;color:#3c5a60;text-transform:uppercase;letter-spacing:0.03em}
  .po-find input{height:32px;border:1px solid rgba(30,58,64,0.18);border-radius:7px;padding:0 9px;font-size:12.5px;font-family:inherit;min-width:220px}
  .rad{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;text-transform:none;color:#1f2937}
  .hint{font-size:11.5px;color:#64748b}
  .po-grid-wrap,.po-list-wrap{border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:auto;background:#fff;max-height:52vh}
  .po-list-wrap{max-height:60vh}
  .po-table{width:100%;border-collapse:collapse;font-size:12.5px}
  .po-table thead th{position:sticky;top:0;background:#dfe9e9;color:#234a52;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;padding:8px 9px;border-bottom:1px solid rgba(0,0,0,0.08);z-index:1}
  .po-table td{padding:5px 9px;border-bottom:1px solid rgba(0,0,0,0.05);vertical-align:middle;color:#1f2937;background:#fff}
  .po-table tr:nth-child(even) td{background:#f6fafa}
  .po-table td.num,.po-table th.num{text-align:right}
  .po-table td.empty{text-align:center;color:#8595a0;padding:22px;font-size:12.5px}
  .po-table input,.po-table select{width:100%;height:28px;border:1px solid rgba(30,58,64,0.16);border-radius:6px;padding:0 7px;font-size:12px;font-family:inherit;color:#1f2937;background:#fff;color-scheme:light}
  .po-table input.num{text-align:right}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;font-weight:700;color:#1e3a40}
  .strong{font-weight:800;color:#16333a}
  .po-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .btn{border:1px solid rgba(30,58,64,0.22);background:#fff;color:#1e3a40;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn:hover:not(:disabled){background:#e9f1f1}
  .btn:disabled{opacity:0.55;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.primary:hover:not(:disabled){background:#16333a}
  .btn.small{padding:5px 10px;font-size:11.5px}
  .po-print-head{display:none}
  .po-print-only{display:none}
  .pp-table{width:100%;border-collapse:collapse;font-size:11.5px}
  .pp-table th{background:#dbe9ff;padding:5px 6px;text-align:left;font-size:10.5px}
  .pp-table td{padding:4px 6px;border-bottom:1px solid #eee}
  
    .ask-back{position:fixed;inset:0;background:rgba(16,32,36,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
  .ask-card{background:#fff;color:#1f2937;border-radius:14px;padding:20px 22px;width:min(680px,94vw);box-shadow:0 18px 50px rgba(0,0,0,0.32);display:flex;flex-direction:column;gap:12px}
  .ask-card h2{font-size:15px;font-weight:800;color:#16333a;letter-spacing:0.02em}
  .ask-card p{font-size:12.5px;color:#42585e}
  .ask-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ask-choice{display:flex;flex-direction:column;gap:6px;text-align:left;cursor:pointer;font-family:inherit;border:1px solid rgba(30,58,64,0.22);border-radius:11px;background:#f3f8f8;padding:14px 15px}
  .ask-choice:hover{background:#e6f0f0;border-color:#1e3a40}
  .ask-choice-title{font-size:14px;font-weight:800;color:#16333a}
  .ask-choice-hint{font-size:11.5px;color:#5b7176;line-height:1.45}
  .ask-foot{display:flex;justify-content:flex-end;gap:8px}
  .mail-card{width:min(760px,95vw);max-height:92vh;overflow:auto}
  .mail-field{display:flex;flex-direction:column;gap:5px}
  .mail-field > label{font-size:11px;font-weight:700;color:#3c5a60;text-transform:uppercase;letter-spacing:0.03em}
  .mail-field input,.mail-field textarea{border:1px solid rgba(30,58,64,0.22);border-radius:8px;background:#fff;color:#1f2937;padding:8px 10px;font-size:12.5px;font-family:inherit;width:100%;color-scheme:light}
  .mail-field textarea{resize:vertical;line-height:1.5}
  .mail-copies{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .mail-radio{display:flex;gap:8px;align-items:flex-start;border:1px solid rgba(30,58,64,0.18);border-radius:9px;padding:9px 11px;background:#f6fafa;cursor:pointer;font-size:12px}
  .mail-radio.on{border-color:#1e3a40;background:#e7f0f0}
  .mail-radio input{margin-top:2px;accent-color:#1e3a40}
  .mail-radio-hint{display:block;font-size:11px;color:#5b7176;margin-top:3px;line-height:1.4}
  .mail-warn{font-size:11.5px;font-weight:600;color:#b45309;background:#fef3c7;border-radius:8px;padding:8px 10px}
  .mail-hint{font-size:11.5px;color:#5b7176}
  .mail-attach{font-size:11.5px;color:#3c5a60;background:#eef4f4;border-radius:8px;padding:8px 10px}

  @media print{.no-print{display:none!important} html,body{background:#fff!important} .po-shell{display:block;height:auto} .po-main{overflow:visible;padding:0} .po-card{border:none;padding:0} .po-grid-wrap{max-height:none;overflow:visible;border:none} .po-print-head{display:block;font-size:12px;margin-bottom:8px} .po-print-only{display:block}}
`;
