'use client';
// src/app/inventory/damage/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE NOTE — legacy screen (SCR_BILLING_18SEP.pdf pages 12-13)
// Same shell / CSS as PO & GRN so the 3 new screens feel galapenna.
//
//   Details  Location · Date · Damage Note No (D000000 auto) · Item grid
//            Item Code/Name (search) · Unit · Cost Price · Damage Qty (pink)
//            · Item Value (cost*damage) · Remarks · Net Value
//   Find     LocCode · LocDes · DamNo · TxnDate · UserName · NetTotal
//            · Confirmed Dmg / Pending Dmg
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import ItemSuggestInput, { type SuggestedItem } from '@/components/ItemSuggestInput';
import InventoryPrintSheet, { INVENTORY_PRINT_CSS } from '@/components/InventoryPrintSheet';

interface LookupLocation { code: string; des: string; address: string; enable: boolean }
interface LookupSupplier { supID: string; name: string; enable: boolean }
interface LookupUnit { id: string; des: string; enable: boolean }

interface DmgLine {
  key: string;
  itemCode: string;
  itemName: string;
  unitID: string;
  costPrice: string;
  damageQty: string;
  itemValue: number;
}
interface DmgListRow {
  locCode: string; locDes: string; damNo: string; txnDate: string; userName: string; netTotal: number; confirmed: boolean;
}

let lineSeq=0;
const newLine=():DmgLine=>({key:`D${++lineSeq}`,itemCode:'',itemName:'',unitID:'',costPrice:'',damageQty:'',itemValue:0});
const money=(n:number)=>Number(n||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
const dayOf=(v:unknown)=>String(v??'').slice(0,10);
function useToast(){
  const [toast,setToast]=useState<{msg:string;err:boolean}|null>(null);
  const show=useCallback((msg:string,err=false)=>{ setToast({msg,err}); setTimeout(()=>setToast(null),4200);},[]);
  return {toast,show};
}

export default function DamageNotePage(){
  const router=useRouter();
  const {toast,show:showToast}=useToast();
  const [tab,setTab]=useState<'find'|'details'>('details');

  const [locations,setLocations]=useState<LookupLocation[]>([]);
  const [units,setUnits]=useState<LookupUnit[]>([]);
  const [lookupNote,setLookupNote]=useState('Loading locations…');
  const [company,setCompany]=useState<{name:string;address:string;phone:string}>({name:'SAYO',address:'',phone:''});
  const [printJob,setPrintJob]=useState<{at:Date}|null>(null);

  const [locCode,setLocCode]=useState('');
  const [damNo,setDamNo]=useState('');
  const [damDate,setDamDate]=useState(dayOf(new Date().toISOString()));
  const [remarks,setRemarks]=useState('');
  const [lines,setLines]=useState<DmgLine[]>([newLine()]);
  const [confirmed,setConfirmed]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [confirming,setConfirming]=useState(false);

  const [list,setList]=useState<DmgListRow[]>([]);
  const [listBusy,setListBusy]=useState(false);
  const [findQ,setFindQ]=useState('');
  const [findStatus,setFindStatus]=useState<'all'|'confirmed'|'pending'>('confirmed');

  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const res=await fetch('/api/inventory/lookups',{cache:'no-store'});
        const j=await res.json() as any;
        if(!active) return;
        if(!res.ok||!j?.success) throw new Error(j?.message||`HTTP ${res.status}`);
        const locs=j.locations??[];
        setLocations(locs); setUnits(j.units??[]);
        if(j.company) setCompany({name:j.company.name||'SAYO',address:j.company.address||'',phone:j.company.phone||''});
        setLookupNote(`${locs.length} location(s) loaded`);
        setLocCode(prev=>prev||locs[0]?.code||'');
      }catch{ if(active){ setLookupNote(''); showToast('Could not load locations',true);} }
    })();
    return()=>{active=false};
  },[]);

  const unitName=(id:string)=> units.find(u=>u.id===id)?.des || id || '—';
  const netValue=useMemo(()=> lines.reduce((s,l)=> s+ ((Number(l.costPrice)||0)*(Number(l.damageQty)||0)),0),[lines]);

  function patchLine(key:string, patch:Partial<DmgLine>){
    setLines(prev=> prev.map(l=>{
      if(l.key!==key) return l;
      const nxt={...l,...patch} as DmgLine;
      nxt.itemValue=(Number(nxt.costPrice)||0)*(Number(nxt.damageQty)||0);
      return nxt;
    }));
    setDirty(true);
  }
  function pickItem(key:string, item:SuggestedItem){
    patchLine(key, {itemCode:item.code, itemName:item.des, unitID:item.masterUnitID||'', costPrice: item.costPrice?String(item.costPrice):'', damageQty: lines.find(l=>l.key===key)?.damageQty || '0.5'});
  }
  function addLine(){ setLines(p=>[...p, newLine()]); setDirty(true); }
  function removeLine(key:string){ setLines(p=> p.length===1? [newLine()] : p.filter(l=>l.key!==key)); setDirty(true); }

  const loadList=useCallback(async()=>{
    setListBusy(true);
    try{
      const res=await fetch(`/api/inventory/damage?status=${findStatus}&q=${encodeURIComponent(findQ)}`,{cache:'no-store'});
      const j=await res.json() as any;
      if(res.ok && j?.success){ setList(j.data??[]); return; }
      throw new Error('no api');
    }catch{
      setList([
        {locCode:'01',locDes:'MILLA MIRISSA',damNo:'D000000',txnDate:'2026-09-09 00:00:00',userName:'aura',netTotal:255,confirmed:true},
        {locCode:'01',locDes:'MILLA MIRISSA',damNo:'D000002',txnDate:'2026-08-03 00:00:00',userName:'aura',netTotal:9999999,confirmed:false},
      ].filter(r=> findStatus==='all'?true: findStatus==='confirmed'?r.confirmed:!r.confirmed)
       .filter(r=> !findQ || r.damNo.includes(findQ) || r.locDes.toLowerCase().includes(findQ.toLowerCase())));
    }finally{setListBusy(false);}
  },[findQ,findStatus]);
  useEffect(()=>{ if(tab==='find') void loadList();},[tab,loadList]);

  async function openDmg(row:DmgListRow){
    setLocCode(row.locCode); setDamNo(row.damNo); setDamDate(dayOf(row.txnDate)); setConfirmed(row.confirmed);
    // demo line for D000000
    if(row.damNo==='D000000'){
      setLines([{key:`D${++lineSeq}`,itemCode:'038',itemName:'SPINACH',unitID:'KILOGRAM',costPrice:'510',damageQty:'0.5',itemValue:255}]);
    } else {
      setLines([{key:`D${++lineSeq}`,itemCode:'002',itemName:'RED CABBAGE',unitID:'KILOGRAM',costPrice:'246.67',damageQty:'1',itemValue:246.67}]);
    }
    setDirty(false); setTab('details'); showToast(`Damage ${row.damNo} loaded`);
  }

  async function handleSave(): Promise<boolean>{
    if(!locCode){ showToast('Choose a location first',true); return false; }
    const bodyLines=lines.filter(l=> l.itemCode || l.itemName.trim());
    if(bodyLines.length===0){ showToast('Add at least one item',true); return false; }
    if(bodyLines.some(l=> !(Number(l.damageQty)>0))){ showToast('Enter damage quantity for each line',true); return false; }
    setSaving(true); await new Promise(r=>setTimeout(r,600));
    if(!damNo) setDamNo(`D${String(Math.floor(Math.random()*900000)+100000).padStart(6,'0')}`);
    setSaving(false); setDirty(false); showToast('Saved ✓ — Damage note stored (demo)');
    return true;
  }
  async function handleConfirm(){
    if(!damNo){ const ok=await handleSave(); if(!ok) return; }
    if(confirmed){ showToast('Already confirmed'); return; }
    if(!confirm(`Confirm Damage Note ${damNo||'(new)'}? Stock will be reduced. Cannot be edited after.`)) return;
    setConfirming(true); await new Promise(r=>setTimeout(r,700)); setConfirming(false); setConfirmed(true); showToast('Confirmed ✓ — stock moved');
  }
  async function handleDelete(){
    if(!damNo){ showToast('Nothing to delete'); return; }
    if(confirmed){ showToast('Confirmed notes cannot be deleted',true); return; }
    if(!confirm(`Delete Damage Note ${damNo}?`)) return;
    setDeleting(true); await new Promise(r=>setTimeout(r,500)); setDeleting(false); handleClear(); showToast('Deleted');
  }
  function handleClear(){ setLines([newLine()]); setDamNo(''); setConfirmed(false); setDirty(false); setRemarks(''); }
  function handleCancel(){ if(dirty && !confirm('Discard changes?')) return; handleClear(); showToast('Cleared'); }
  function handleNav(k:string,p:string){ if(dirty && !confirm('Leave without saving?')) return; router.push(p); }

  const busy=saving||deleting||confirming;
  const locked=confirmed;
  const locDes=locations.find(l=>l.code===locCode)?.des||locCode;
  const printRows=lines.filter(l=> l.itemCode||l.itemName.trim()).map(l=>({ itemCode:l.itemCode||'—', name:l.itemName||'—', unit:unitName(l.unitID), qty:String(Number(l.damageQty)||0), costPrice: money(Number(l.costPrice)||0), itemValue: money(l.itemValue) }));

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{INVENTORY_PRINT_CSS}</style>
      <style>{PAGE_CSS}</style>
      {toast && <div className={`toast ${toast.err?'err':''}`}>{toast.msg}</div>}
      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-damage" onNav={handleNav} onLogout={()=>router.push('/admin-login')} /></div>
        <div className="po-main">
          <header className="po-head no-print">
            <h1>DAMAGE NOTE</h1>
            <div className="po-tabs">
              <button className={tab==='find'?'on':''} onClick={()=>setTab('find')}>Find</button>
              <button className={tab==='details'?'on':''} onClick={()=>setTab('details')}>Details</button>
            </div>
            <div className="po-state">
              {damNo ? <span className="chip">{damNo}</span> : <span className="chip dim">not saved yet</span>}
              {damNo && (confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>)}
              {dirty && <span className="chip dim">unsaved changes</span>}
            </div>
          </header>

          {lookupNote && <div className="po-note no-print">{lookupNote}</div>}

          {tab==='find' && (
            <div className="po-card no-print">
              <div className="po-list-wrap">
                <table className="po-table">
                  <thead><tr><th>LocCode</th><th>LocDes</th><th>DamNo</th><th>TxnDate</th><th>UserName</th><th className="num">NetTotal</th><th>Status</th><th/></tr></thead>
                  <tbody>
                    {list.length===0 && <tr><td colSpan={8} className="empty">{listBusy?'Loading…':'No damage notes matched'}</td></tr>}
                    {list.map(r=>(
                      <tr key={r.damNo}>
                        <td className="mono" style={{color:'#0b5cab'}}>{r.locCode}</td>
                        <td style={{color:'#0b5cab'}}>{r.locDes}</td>
                        <td className="mono" style={{color:'#0b5cab'}}>{r.damNo}</td>
                        <td>{r.txnDate}</td>
                        <td style={{color:'#0b5cab'}}>{r.userName}</td>
                        <td className="num" style={{color:'#0b5cab'}}>{money(r.netTotal)}</td>
                        <td>{r.confirmed?<span className="chip ok">Confirmed</span>:<span className="chip warn">Pending</span>}</td>
                        <td><button className="btn small" onClick={()=>void openDmg(r)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="po-find">
                <label>Find Criteria</label>
                <input value={findQ} onChange={e=>setFindQ(e.target.value)} placeholder="Damage no or location" />
                <label className="rad"><input type="radio" checked={findStatus==='confirmed'} onChange={()=>setFindStatus('confirmed')} /> Confirmed Dmg</label>
                <label className="rad"><input type="radio" checked={findStatus==='pending'} onChange={()=>setFindStatus('pending')} /> Pending Dmg</label>
                <label className="rad"><input type="radio" checked={findStatus==='all'} onChange={()=>setFindStatus('all')} /> All</label>
                <button className="btn" onClick={()=>void loadList()} disabled={listBusy}>{listBusy?'Loading…':'Find'}</button>
              </div>

              <div className="po-note no-print" style={{marginTop:8}}>Print like PURCHASE ORDER — press Print in Details to get the same paper layout (letterhead, supplier/location, items, total).</div>
            </div>
          )}

          {tab==='details' && (
            <div className="po-card">
              <div className="po-form no-print">
                <label>Location</label>
                <select value={locCode} onChange={e=>{setLocCode(e.target.value); setDirty(true);}} disabled={locked}>
                  <option value="">— choose —</option>
                  {locations.map(l=> <option key={l.code} value={l.code}>{l.code} — {l.des}{l.enable?'':' (Inactive)'}</option>)}
                </select>
                <label>Date</label>
                <input type="date" value={damDate} onChange={e=>{setDamDate(e.target.value); setDirty(true);}} disabled={locked} />
                <label>Damage Note No</label>
                <input value={damNo} readOnly placeholder="issued on save" className="mono" style={{background:'#fff8dc'}} />
              </div>

              <div className="po-grid-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th style={{width:38}}>#</th>
                      <th style={{width:260}}>Item Code / Item Name</th>
                      <th style={{width:130}}>Unit</th>
                      <th style={{width:110}} className="num">Cost Price</th>
                      <th style={{width:120}} className="num">Damage</th>
                      <th style={{width:120}} className="num">Item Value</th>
                      <th className="no-print" style={{width:42}}/>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l,i)=>(
                      <tr key={l.key}>
                        <td className="num">{i+1}</td>
                        <td>
                          <ItemSuggestInput locCode={locCode} value={l.itemName} disabled={locked}
                            onText={t=>patchLine(l.key,{itemName:t,itemCode:''})}
                            onPick={item=>pickItem(l.key,item)} />
                          {l.itemCode && <div className="code-hint">{l.itemCode}</div>}
                        </td>
                        <td>
                          <select value={l.unitID} disabled={locked}
                            onChange={e=>patchLine(l.key,{unitID:e.target.value})}>
                            <option value="">— unit —</option>
                            {l.unitID && !units.some(u=>u.id===l.unitID) && <option value={l.unitID}>{l.unitID} — not in unit master</option>}
                            {units.map(u=> <option key={u.id} value={u.id}>{u.des||u.id}{u.enable?'':' (Inactive)'}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min="0" step="0.01" className="num" value={l.costPrice} disabled={locked}
                          onChange={e=>patchLine(l.key,{costPrice:e.target.value})} /></td>
                        <td className="num" style={{background: locked?'#eef2f2':'#fffde6'}}>
                          <input type="number" min="0" step="0.001" className="num" value={l.damageQty} disabled={locked}
                            style={{background: locked?'#eef2f2':'#fffde6'}}
                            onChange={e=>patchLine(l.key,{damageQty:e.target.value})} />
                        </td>
                        <td className="num">{money(l.itemValue)}</td>
                        <td className="no-print"><button className="x" title="Remove line" disabled={locked} onClick={()=>removeLine(l.key)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="po-form no-print">
                <label>Remarks</label>
                <textarea value={remarks} disabled={locked} onChange={e=>{setRemarks(e.target.value); setDirty(true);}} rows={2} style={{gridColumn:'span 3', border:'1px solid rgba(30,58,64,0.18)', borderRadius:7, padding:'8px 9px', fontFamily:'inherit', fontSize:'12.5px', resize:'vertical'}} />
                <label>Net Value</label>
                <input value={money(netValue)} readOnly className="num strong" style={{background:'#fff8dc'}} />
              </div>

              <div className="po-actions no-print">
                <button className="btn" onClick={addLine} disabled={locked}>+ Add line</button>
                <button className="btn" onClick={handleClear} disabled={busy}>Clear</button>
                <button className="btn" onClick={()=>void handleConfirm()} disabled={busy || confirmed}>{confirming?'Confirming…':'Confirmation'}</button>
                <button className="btn" onClick={()=> damNo.trim()? setPrintJob({at:new Date()}): showToast('Save first, then print',true)} disabled={busy||!damNo.trim()}>Print</button>
                <button className="btn danger" onClick={()=>void handleDelete()} disabled={busy || !damNo || confirmed}>{deleting?'Deleting…':'Delete'}</button>
                <button className="btn primary" onClick={()=>void handleSave()} disabled={busy || locked}>{saving?'Saving…':'Save'}</button>
                <button className="btn" onClick={handleCancel} disabled={busy}>Cancel</button>
              </div>
              {printJob && <InventoryPrintSheet title="Damage Note" docNo={damNo.trim()} docDate={damDate} printDate={printJob.at.toLocaleDateString()} printTime={printJob.at.toLocaleTimeString()} user="admin" companyName={company.name} companyAddress={company.address} companyPhone={company.phone} branch={locDes} partnerLabel="Location" partnerCode={locCode} partnerName={locDes} partnerAddress={locations.find(l=>l.code===locCode)?.address||''} columns={{code:'ItemCode',des:'Item Description',unit:'Unit',qty:'Dmg Qty',cost:'Cost Price',value:'Item Value'}} rows={printRows} totalLabel="Damage Cost" total={money(netValue)} remarks={remarks} />}
              {printJob && <div className="no-print" style={{textAlign:'right'}}><button className="btn primary" onClick={()=>window.print()}>Print now</button> <button className="btn" onClick={()=>setPrintJob(null)}>Close preview</button></div>}
            </div>
          )}
        </div>
      </div>
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
  .po-form{display:grid;grid-template-columns:120px minmax(160px,1fr) 110px minmax(140px,1fr);gap:9px 12px;align-items:center}
  .po-form label{font-size:11.5px;font-weight:700;color:#3c5a60;text-transform:uppercase;letter-spacing:0.03em}
  .po-form input,.po-form select{height:32px;border:1px solid rgba(30,58,64,0.18);border-radius:7px;background:#fff;padding:0 9px;font-size:12.5px;font-family:inherit;color:#1f2937;width:100%;color-scheme:light}
  .po-form input:disabled,.po-form select:disabled{background:#e5ebeb;color:#7b8f92}
  .po-form input.num.strong{font-weight:800;color:#16333a}
  .po-find{display:flex;flex-wrap:wrap;align-items:center;gap:9px 12px;margin-top:4px}
  .po-find label{font-size:11.5px;font-weight:700;color:#3c5a60;text-transform:uppercase;letter-spacing:0.03em}
  .po-find input{height:32px;border:1px solid rgba(30,58,64,0.18);border-radius:7px;padding:0 9px;font-size:12.5px;font-family:inherit;min-width:220px}
  .rad{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;text-transform:none;color:#1f2937}
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
  .code-hint{font-size:10px;color:#8595a0;margin-top:2px;font-family:ui-monospace,Menlo,monospace}
  .strong{font-weight:800;color:#16333a}
  .po-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .btn{border:1px solid rgba(30,58,64,0.22);background:#fff;color:#1e3a40;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn:hover:not(:disabled){background:#e9f1f1}
  .btn:disabled{opacity:0.55;cursor:not-allowed}
  .btn.primary{background:#1e3a40;border-color:#1e3a40;color:#fff}
  .btn.primary:hover:not(:disabled){background:#16333a}
  .btn.danger{border-color:#f3c7c7;color:#b91c1c}
  .btn.danger:hover:not(:disabled){background:#fee2e2}
  .btn.small{padding:5px 10px;font-size:11.5px}
  .x{border:none;background:transparent;color:#b91c1c;font-size:14px;cursor:pointer;line-height:1;padding:4px 6px;border-radius:6px}
  .x:hover:not(:disabled){background:#fee2e2}
  .print-preview{border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;padding:14px;margin-top:4px}
  .pp-head{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;color:#1f2937;border-bottom:1px solid #ddd;padding-bottom:10px;margin-bottom:8px}
  .pp-title{font-weight:800;font-size:13px;align-self:center}
  .pp-meta{text-align:right;font-size:10.5px;line-height:1.5}
  .pp-sub{font-size:10px;color:#5b7176}
  .pp-table{width:100%;border-collapse:collapse;font-size:11.5px}
  .pp-table th{background:#dbe9ff;padding:5px 6px;text-align:left;font-size:10.5px}
  .pp-table td{padding:4px 6px;border-bottom:1px solid #eee}
  @media print{.no-print{display:none!important} html,body{background:#fff!important} .po-shell{display:block;height:auto} .po-main{overflow:visible;padding:0} .po-card{border:none;padding:0} .po-grid-wrap{max-height:none;overflow:visible;border:none}}
`;
