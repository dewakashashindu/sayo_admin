'use client';
// SUPPLIER RETURN NOTE — cumulative returns with Tbl_GRNDetails.RETQTY
// Return qty can be split across multiple SRNs: GRNQty=10, first SRN 5, next 2, etc.
// On Confirm: StockBalance -= returnQty, Tbl_TxnMovement insert, GRN RETQTY/RETVAL updated.
// Print slips like PURCHASE ORDER (InventoryPrintSheet) + Email to Supplier like PO.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import InventoryPrintSheet, { INVENTORY_PRINT_CSS } from '@/components/InventoryPrintSheet';
import { PO_PRINT_COPY_CHOICES, poPrintCopyLabel, poPrintValueColumns, type PoPrintCopy } from '@/lib/poPrint';

interface LookupLocation { code: string; des: string; address: string; enable: boolean }
interface LookupSupplier { supID: string; name: string; contact: string; emails: string; email: string; enable: boolean }
interface LookupUnit { id: string; des: string; enable: boolean }

interface SrnLine {
  key: string;
  itemCode: string;
  itemName: string;
  unitID: string;
  costPrice: string;
  grnQty: number;
  retQty: number;
  remainingQty: number;
  returnQty: string;
  itemValue: number;
}

interface SrnListRow { srnNo: string; locCode: string; srnDate: string; supID: string; supName: string; txndate: string; netTotal: number; confirmed: boolean; userName: string; }
interface OpenGrnOpt { grnNo: string; supID: string; supName: string; grnDate: string; netTotal: number }

let lineSeq = 0;
const money = (n: number) => Number(n||0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayOf = (v: unknown) => String(v ?? '').slice(0,10);
function useToast(){ const [t,s]=useState<{msg:string;err:boolean}|null>(null); const show=useCallback((m:string,e=false)=>{s({msg:m,err:e}); setTimeout(()=>s(null),4500);},[]); return {toast:t,show} }

export default function SupplierReturnPage(){
  const router=useRouter(); const {toast,show:showToast}=useToast();
  const [tab,setTab]=useState<'find'|'details'>('details');
  const [locations,setLocations]=useState<LookupLocation[]>([]); const [suppliers,setSuppliers]=useState<LookupSupplier[]>([]); const [units,setUnits]=useState<LookupUnit[]>([]);
  const [lookupNote,setLookupNote]=useState('Loading locations and suppliers…'); const [company,setCompany]=useState<{name:string;address:string;phone:string}>({name:'SAYO',address:'',phone:''});
  const [locCode,setLocCode]=useState(''); const [supID,setSupID]=useState(''); const [supInvNo,setSupInvNo]=useState(''); const [grnNo,setGrnNo]=useState(''); const [srnNo,setSrnNo]=useState(''); const [srnDate,setSrnDate]=useState(dayOf(new Date().toISOString())); const [remarks,setRemarks]=useState(''); const [lines,setLines]=useState<SrnLine[]>([]); const [confirmed,setConfirmed]=useState(false); const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false); const [deleting,setDeleting]=useState(false); const [confirming,setConfirming]=useState(false);
  const [openGrns,setOpenGrns]=useState<OpenGrnOpt[]>([]); const [grnErr,setGrnErr]=useState('');
  const [list,setList]=useState<SrnListRow[]>([]); const [listBusy,setListBusy]=useState(false); const [findQ,setFindQ]=useState(''); const [findStatus,setFindStatus]=useState<'all'|'confirmed'|'pending'>('all');
  const [printAsk,setPrintAsk]=useState(false);
  const [printJob,setPrintJob]=useState<{copy:PoPrintCopy;at:Date}|null>(null);
  const [mailOpen,setMailOpen]=useState(false); const [mailTo,setMailTo]=useState(''); const [mailCopy,setMailCopy]=useState<PoPrintCopy>('standard'); const [mailSubject,setMailSubject]=useState(''); const [mailMessage,setMailMessage]=useState(''); const [mailSending,setMailSending]=useState(false);
  const [actor,setActor]=useState('');

  useEffect(()=>{ let a=true;(async()=>{ try{ const r=await fetch('/api/inventory/lookups',{cache:'no-store'}); const j=await r.json() as any; if(!a) return; if(!r.ok||!j?.success) throw new Error(); const locs=j.locations??[]; const sups=j.suppliers??[]; setLocations(locs); setSuppliers(sups); setUnits(j.units??[]); if(j.company){ setCompany({name:j.company.name||'SAYO BEAUTY',address:j.company.address||'',phone:j.company.phone||''}); } setLookupNote(`${locs.length} location(s) · ${sups.length} supplier(s)`); setLocCode(p=>p||locs[0]?.code||''); }catch{ if(a){ setLookupNote(''); showToast('Could not load lookups',true);} } })(); return()=>{a=false}; },[showToast]);

  useEffect(()=>{ let a=true; (async()=>{ try{ const r=await fetch('/api/auth/admin-me',{cache:'no-store'}); const j=await r.json() as any; if(!a||!j?.success) return; setActor(j.user?.username||j.user?.name||''); }catch{} })(); return()=>{a=false}; },[]);

  const loadGrns=useCallback(async()=>{ if(!locCode) return; setGrnErr(''); try{ const r=await fetch(`/api/inventory/grn?status=confirmed&locCode=${encodeURIComponent(locCode)}&limit=400`,{cache:'no-store'}); const j=await r.json() as any; if(r.ok&&j?.success&&Array.isArray(j.data)){ const opts:OpenGrnOpt[]=j.data.map((x:any)=>({grnNo:x.grnNo, supID:x.supID, supName:x.supName, grnDate:x.grnDate, netTotal:x.netTotal})); setOpenGrns(opts); if(opts.length===0) setGrnErr('No confirmed GRNs at this location'); }else{ setOpenGrns([]); setGrnErr(j?.message||'Could not load GRNs'); } }catch(e:any){ setOpenGrns([]); setGrnErr(e?.message||'Could not load GRNs'); } },[locCode]);
  useEffect(()=>{ if(tab==='details') void loadGrns(); },[tab,loadGrns]);

  async function chooseGrn(v:string){
    setGrnNo(v); setDirty(true);
    if(!v){ setLines([]); setSupInvNo(''); return; }
    const meta=openGrns.find(o=>o.grnNo===v); if(meta) setSupID(meta.supID);
    try{
      const r=await fetch(`/api/inventory/grn/${encodeURIComponent(v)}?locCode=${encodeURIComponent(locCode)}`,{cache:'no-store'});
      const j=await r.json() as any;
      if(r.ok&&j?.success&&j.data?.lines){
        setLines(j.data.lines.map((l:any)=>{ const grnQty=Number(l.grnQty||0); const retQty=Number(l.retQty||0); const remaining=Math.max(0, grnQty - retQty); return { key:`R${++lineSeq}`, itemCode:l.itemCode, itemName:l.itemName, unitID:l.unitID||'', costPrice:String(l.costPrice??''), grnQty, retQty, remainingQty: remaining, returnQty:'0', itemValue:0 } }));
        if(j.data.supID) setSupID(j.data.supID);
        if(j.data.supInvNo) setSupInvNo(j.data.supInvNo);
        const hint = j.data.lines.some((l:any)=> Number(l.retQty)>0) ? ' (some qty already returned)' : '';
        showToast(`${v} loaded${hint} — Remaining = GRN - Already Returned · set Return Qty ≤ Remaining`);
        return;
      }
      throw new Error(j?.message||'GRN not found');
    }catch(e:any){ showToast(e?.message||`Could not open ${v}`,true); setLines([]); }
  }

  const unitName=(id:string)=> units.find(u=>u.id===id)?.des || id || '—';
  const returnTotal=useMemo(()=> lines.reduce((s,l)=> s + (Number(l.costPrice)||0)*(Number(l.returnQty)||0),0),[lines]);
  const hasReturn=useMemo(()=> lines.some(l=> Number(l.returnQty)>0),[lines]);

  function patchLine(key:string, patch:Partial<SrnLine>){
    setLines(prev=> prev.map(l=>{
      if(l.key!==key) return l;
      const nxt={...l,...patch} as SrnLine;
      const qty=Number(nxt.returnQty)||0;
      if(qty - nxt.remainingQty > 1e-6){ showToast(`Return qty cannot exceed remaining ${nxt.remainingQty} (GRN ${nxt.grnQty} - already returned ${nxt.retQty})`,true); nxt.returnQty=String(nxt.remainingQty); }
      if(qty<0) nxt.returnQty='0';
      nxt.itemValue=(Number(nxt.costPrice)||0)*(Number(nxt.returnQty)||0);
      return nxt;
    })); setDirty(true);
  }

  const loadList=useCallback(async()=>{ setListBusy(true); try{ const r=await fetch(`/api/inventory/supplier-return?status=${findStatus}&q=${encodeURIComponent(findQ)}&locCode=${locCode?encodeURIComponent(locCode):''}`,{cache:'no-store'}); const j=await r.json() as any; if(r.ok&&j?.success){ setList(j.data??[]); return; } setList([]); }catch{ setList([]);} finally{ setListBusy(false);} },[findQ,findStatus,locCode]);
  useEffect(()=>{ if(tab==='find') void loadList(); },[tab,loadList]);

  async function openSrn(row:SrnListRow){
    try{
      const r=await fetch(`/api/inventory/supplier-return/${encodeURIComponent(row.srnNo)}?locCode=${encodeURIComponent(row.locCode)}`,{cache:'no-store'});
      const j=await r.json() as any;
      if(r.ok&&j?.success&&j.data){
        const h=j.data.header; setSrnNo(h.srnNo); setLocCode(h.locCode); setSupID(h.supID); setSrnDate(dayOf(h.srnDate)); setRemarks(h.remarks||''); setSupInvNo(h.supInvNo||''); setConfirmed(h.confirmed);
        // lines are returns; need to reload GRN to know remaining, but for view just show return qty
        setLines((j.data.lines??[]).map((l:any)=>({ key:`R${++lineSeq}`, itemCode:l.itemCode, itemName:l.itemName, unitID:l.unitID, costPrice:String(l.costPrice??''), grnQty:Number(l.grnQty||0), retQty:0, remainingQty: Number(l.grnQty||0), returnQty:String(l.returnQty||0), itemValue:Number(l.itemValue||0) })));
        // try to refetch GRN retQty for context
        try{
          const grnCandidates = await fetch(`/api/inventory/grn?status=confirmed&locCode=${encodeURIComponent(h.locCode)}&limit=200`,{cache:'no-store'}).then(x=>x.json());
          // keep as is
        }catch{}
        setDirty(false); setTab('details'); showToast(`SRN ${row.srnNo.trim()} loaded`);
        return;
      }
      throw new Error();
    }catch{ showToast('Could not open SRN',true); }
  }

  async function handleSave():Promise<boolean>{
    if(!locCode){ showToast('Choose a location first',true); return false; }
    if(!grnNo){ showToast('Choose a GRN first',true); return false; }
    if(lines.length===0){ showToast('No items to return',true); return false; }
    if(!hasReturn){ showToast('Enter at least one Return Qty',true); return false; }
    setSaving(true);
    try{
      const body={ locCode, grnNo, srnDate, supInvNo, remarks, lines: lines.filter(l=> Number(l.returnQty)>0).map(l=>({ itemCode:l.itemCode, unitID:l.unitID, costPrice:Number(l.costPrice)||0, grnQty:l.grnQty, returnQty:Number(l.returnQty)||0 })), confirm:false };
      const r=await fetch('/api/inventory/supplier-return',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const j=await r.json() as any;
      if(!r.ok||!j?.success) throw new Error(j?.message||'Save failed');
      if(j.data?.srnNo) setSrnNo(j.data.srnNo);
      setDirty(false); showToast(j.message||`Saved ✓ — ${j.data?.srnNo||''}`); void loadGrns();
      return true;
    }catch(e:any){ showToast(e?.message||'Save failed',true); return false; } finally{ setSaving(false); }
  }

  async function handleConfirm(){
    if(lines.length && !hasReturn){ showToast('Enter Return Qty first',true); return; }
    // fresh document — save & confirm in one go
    if(!srnNo.trim()){
      if(!locCode||!grnNo){ showToast('Choose location and GRN first',true); return; }
      if(!confirm(`Confirm Supplier Return for GRN ${grnNo}? Stock will be reduced by the return qty and the GRN's returned totals will be updated. Cannot be undone.`)) return;
      setConfirming(true);
      try{
        const body={ locCode, grnNo, srnDate, supInvNo, remarks, lines: lines.filter(l=> Number(l.returnQty)>0).map(l=>({ itemCode:l.itemCode, unitID:l.unitID, costPrice:Number(l.costPrice)||0, grnQty:l.grnQty, returnQty:Number(l.returnQty)||0 })), confirm:true };
        const r=await fetch('/api/inventory/supplier-return',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
        const j=await r.json() as any;
        if(!r.ok||!j?.success) throw new Error(j?.message||'Confirm failed');
        setSrnNo(j.data.srnNo); setConfirmed(true); setDirty(false); showToast(j.message||'Confirmed ✓ — stock reduced, GRN updated');
        setPrintJob({copy:'standard', at:new Date()});
      }catch(e:any){ showToast(e?.message||'Confirm failed',true); } finally{ setConfirming(false); }
      return;
    }
    if(confirmed){ showToast('Already confirmed'); return; }
    if(!confirm(`Confirm SRN ${srnNo.trim()}? Stock and GRN will be updated. Cannot be undone.`)) return;
    setConfirming(true);
    try{
      const r=await fetch(`/api/inventory/supplier-return/${encodeURIComponent(srnNo.trim())}/confirm`,{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({locCode})});
      const j=await r.json() as any;
      if(!r.ok||!j?.success) throw new Error(j?.message||'Confirm failed');
      setConfirmed(true); setDirty(false); showToast(j.message||'Confirmed ✓ — stock reduced'); setPrintJob({copy:'standard', at:new Date()});
    }catch(e:any){ showToast(e?.message||'Confirm failed',true); } finally{ setConfirming(false); }
  }

  async function handleDelete(){
    if(!srnNo){ showToast('Nothing to delete'); return; }
    if(confirmed){ showToast('Confirmed returns cannot be deleted',true); return; }
    if(!confirm(`Delete SRN ${srnNo.trim()}?`)) return;
    setDeleting(true);
    try{
      const r=await fetch(`/api/inventory/supplier-return/${encodeURIComponent(srnNo.trim())}?locCode=${encodeURIComponent(locCode)}`,{method:'DELETE'});
      const j=await r.json() as any;
      if(!r.ok||!j?.success) throw new Error(j?.message||'Delete failed');
      showToast(j.message||'Deleted'); handleClear(); void loadList();
    }catch(e:any){ showToast(e?.message||'Delete failed',true); } finally{ setDeleting(false); }
  }

  function handleClear(){ setLines([]); setGrnNo(''); setSrnNo(''); setConfirmed(false); setDirty(false); setRemarks(''); setSupInvNo(''); }
  function handleCancel(){ if(dirty && !confirm('Discard unsaved changes?')) return; handleClear(); showToast('Cleared'); }
  function handleNav(k:string,p:string){ if(dirty && !confirm('Leave without saving?')) return; router.push(p); }

    function handlePrint(){
    if(printRows.length===0){ showToast('Add at least one return qty before printing',true); return; }
    if(!srnNo.trim()){ showToast('Save first, then print',true); return; }
    setPrintAsk(true);
  }
  function startPrint(copy:PoPrintCopy){ setPrintAsk(false); setPrintJob({copy, at:new Date()}); }
  // auto print after sheet mounts (like PO)
  React.useEffect(()=>{ if(!printJob) return; const id=window.setTimeout(()=>window.print(),60); return()=>window.clearTimeout(id); },[printJob]);

    function openMailFull(){
    if(printRows.length===0){ showToast('Add at least one return before emailing',true); return; }
    if(!srnNo.trim()){ showToast('Save the SRN first, then it can be emailed',true); return; }
    const supMail = (sup as any)?.emails || (sup as any)?.email || supplierEmail;
    setMailTo(prev=> prev || (supMail||'').split(/[;,]/)[0]?.trim() || '');
    setMailSubject(prev=> prev || `Supplier Return Note ${srnNo.trim()} — ${sup?.name||supID}`);
    setMailCopy(prev=> prev||'standard');
    setMailMessage(prev=> prev||'');
    setMailOpen(true);
  }

  const busy=saving||deleting||confirming; const locked=confirmed;
  const sup=suppliers.find(s=>s.supID===supID); const locDes=locations.find(l=>l.code===locCode)?.des||locCode;
  const printRows=lines.filter(l=> Number(l.returnQty)>0).map(l=>({ itemCode:l.itemCode, name:l.itemName, unit:unitName(l.unitID), qty:String(Number(l.returnQty)||0), costPrice: money(Number(l.costPrice)||0), itemValue: money(l.itemValue) }));
  const supplierEmail=sup?.email||'';

  // legacy openMail kept alias via openMailFull
  async function sendMail(){
    if(!srnNo.trim()) return;
    const to=mailTo.trim(); if(!to){ showToast('Enter a supplier email',true); return; }
    setMailSending(true);
    try{
      const r=await fetch(`/api/inventory/supplier-return/${encodeURIComponent(srnNo.trim())}/email`,{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({locCode, to, copy: mailCopy, subject: mailSubject.trim(), message: mailMessage.trim()})});
      const j=await r.json() as any;
      if(!r.ok||!j?.success) throw new Error(j?.message||'Email failed');
      showToast(j.message||`Emailed to ${to} ✓`); setMailOpen(false);
    }catch(e:any){ showToast(e?.message||'Email failed',true); } finally{ setMailSending(false); }
  }
  // alias for new dialog button
  const sendMailEnhanced = sendMail;
  // legacy alias kept for previous code
  const openMail = openMailFull;

  return (
    <>
      <style>{SIDEBAR_CSS}</style><style>{INVENTORY_PRINT_CSS}</style><style>{PAGE_CSS}</style>
      {toast && <div className={`toast ${toast.err?'err':''}`}>{toast.msg}</div>}
      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-srn" onNav={handleNav} onLogout={()=>router.push('/admin-login')} /></div>
        <div className="po-main">
          <header className="po-head no-print">
            <h1>SUPPLIER RETURN NOTE</h1>
            <div className="po-tabs"><button className={tab==='find'?'on':''} onClick={()=>setTab('find')}>Find</button><button className={tab==='details'?'on':''} onClick={()=>setTab('details')}>Details</button></div>
            <div className="po-state">{srnNo? <span className="chip">{srnNo.trim()}</span>:<span className="chip dim">not saved yet</span>}{srnNo&&(confirmed? <span className="chip ok">Confirmed</span>:<span className="chip warn">Pending</span>)}{dirty&& <span className="chip dim">unsaved changes</span>}</div>
          </header>
          {lookupNote && <div className="po-note no-print">{lookupNote}</div>}
          {tab==='find' && (
            <div className="po-card no-print">
              <div className="po-find"><label>Find Criteria</label><input value={findQ} onChange={e=>setFindQ(e.target.value)} placeholder="SRN no or supplier" /><label className="rad"><input type="radio" checked={findStatus==='confirmed'} onChange={()=>setFindStatus('confirmed')} /> Confirmed Returns</label><label className="rad"><input type="radio" checked={findStatus==='pending'} onChange={()=>setFindStatus('pending')} /> Pending Return</label><label className="rad"><input type="radio" checked={findStatus==='all'} onChange={()=>setFindStatus('all')} /> All</label><button className="btn" onClick={()=>void loadList()} disabled={listBusy}>{listBusy?'Loading…':'Find'}</button></div>
              <div className="po-list-wrap"><table className="po-table"><thead><tr><th>SRNNo</th><th>LocCode</th><th>SRNDate</th><th>SupID</th><th>SupName</th><th>Txndate</th><th className="num">Net Total</th><th>Status</th><th/></tr></thead><tbody>{list.length===0 && <tr><td colSpan={9} className="empty">{listBusy?'Loading…':'No returns matched'}</td></tr>}{list.map(r=>(<tr key={`${r.srnNo}|${r.txndate}`}><td className="mono" style={{color:'#0b5cab'}}>{r.srnNo.trim()}</td><td>{r.locCode.trim()}</td><td className="mono" style={{color:'#0b5cab'}}>{dayOf(r.srnDate)}</td><td className="mono" style={{color:'#0b5cab'}}>{r.supID.trim()}</td><td>{r.supName||'—'}</td><td>{dayOf(r.txndate)}</td><td className="num">{r.netTotal?money(r.netTotal):'—'}</td><td>{r.confirmed?<span className="chip ok">Confirmed</span>:<span className="chip warn">Pending</span>}</td><td><button className="btn small" onClick={()=>void openSrn(r)}>Open</button></td></tr>))}</tbody></table></div>
            </div>
          )}
          {tab==='details' && (
            <div className="po-card">
              <div className="po-form no-print">
                <label>Location</label><select value={locCode} onChange={e=>{setLocCode(e.target.value); setDirty(true);}} disabled={locked}><option value="">— choose —</option>{locations.map(l=><option key={l.code} value={l.code}>{l.des} ({l.code}){l.enable?'':' (Inactive)'}</option>)}</select>
                <label>GRN No.</label><select value={grnNo} onChange={e=>void chooseGrn(e.target.value)} disabled={locked}><option value="">— choose a confirmed GRN —</option>{openGrns.map(o=><option key={o.grnNo} value={o.grnNo}>{o.grnNo} — {o.supName||o.supID} ({dayOf(o.grnDate)})</option>)}</select>
                <label>SRN No</label><input value={srnNo.trim()} readOnly placeholder="issued on save" className="mono" style={{background:'#fff8dc'}} />
                <label>Supplier</label><select value={supID} disabled><option value="">— set by the GRN —</option>{suppliers.map(s=><option key={s.supID} value={s.supID}>{s.supID} — {s.name}</option>)}</select>
                <label>Sup Inv No</label><input value={supInvNo} onChange={e=>{setSupInvNo(e.target.value); setDirty(true);}} disabled={locked} />
                <label>SRN Date</label><input type="date" value={srnDate} onChange={e=>{setSrnDate(e.target.value); setDirty(true);}} disabled={locked} />
              </div>
              {grnErr && <div className="po-error no-print">{grnErr}</div>}
              {grnNo && <div className="po-note no-print">Return Qty must not exceed the remaining quantity (GRN Qty − already returned). Multiple returns against one GRN are allowed; confirming moves the stock back to the supplier and updates the GRN's returned quantities.</div>}
              <div className="po-grid-wrap">
                <table className="po-table">
                  <thead><tr><th style={{width:38}}>#</th><th style={{width:98}}>Item Code</th><th>Item Name</th><th style={{width:110}}>Unit</th><th style={{width:105}} className="num">Cost Price</th><th style={{width:85}} className="num">GRN QTY</th><th style={{width:95}} className="num">Returned</th><th style={{width:95}} className="num">Remaining</th><th style={{width:110}} className="num">Return Qty</th><th style={{width:120}} className="num">Item Value</th></tr></thead>
                  <tbody>
                    {lines.length===0 && <tr><td colSpan={10} className="empty">{grnNo?'No lines — this GRN has no items':'Choose a GRN above to load its items'}</td></tr>}
                    {lines.map((l,i)=>(
                      <tr key={l.key}>
                        <td className="num">{i+1}</td><td className="mono">{l.itemCode}</td><td>{l.itemName}</td><td>{unitName(l.unitID)}</td><td className="num">{l.costPrice}</td>
                        <td className="num" style={{background:'#fff8dc'}}>{l.grnQty}</td>
                        <td className="num" style={{background:'#fef3c7'}}>{l.retQty}</td>
                        <td className="num" style={{background:'#dcfce7',fontWeight:700}}>{l.remainingQty}</td>
                        <td className="num" style={{background:'#f3d9ff'}}><input type="number" min="0" max={l.remainingQty} step="0.01" className="num" value={l.returnQty} disabled={locked||l.remainingQty===0} style={{background: locked?'#eef2f2': l.remainingQty===0?'#fee2e2':'#f3d9ff', borderColor:'#c9a6ff'}} onChange={e=>patchLine(l.key,{returnQty:e.target.value})} /></td>
                        <td className="num" style={{background:'#fffde6'}}>{money(l.itemValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="po-form no-print"><label>Remarks</label><textarea value={remarks} disabled={locked} onChange={e=>{setRemarks(e.target.value); setDirty(true);}} rows={2} style={{gridColumn:'span 3', border:'1px solid rgba(30,58,64,0.18)', borderRadius:7, padding:'8px 9px', fontFamily:'inherit', fontSize:'12.5px', resize:'vertical'}} /><label>Return Total</label><input value={money(returnTotal)} readOnly className="num strong" style={{background:'#fff8dc'}} /></div>
              <div className="po-actions no-print">
                <button className="btn" onClick={handleClear} disabled={busy}>Clear</button>
                <button className="btn" onClick={()=>void handleConfirm()} disabled={busy||confirmed}>{confirming?'Confirming…':'Confirmation'}</button>
                <button className="btn" onClick={()=> handlePrint()} disabled={busy||!srnNo.trim()}>Print</button>
                <button className="btn" onClick={()=> openMailFull()} disabled={busy||!srnNo.trim()} title={supplierEmail?`Email to ${supplierEmail}`:'Email to supplier as PDF'}>{mailSending?'Sending…':'Email to Supplier'}</button>
                <button className="btn danger" onClick={()=>void handleDelete()} disabled={busy||!srnNo||confirmed}>{deleting?'Deleting…':'Delete'}</button>
                <button className="btn primary" onClick={()=>void handleSave()} disabled={busy||locked}>{saving?'Saving…':'Save'}</button>
                <button className="btn" onClick={handleCancel} disabled={busy}>Cancel</button>
              </div>
              {printJob && (
                <>
                  <InventoryPrintSheet title="Supplier Return Note" docNo={srnNo.trim()} docDate={srnDate} printDate={printJob.at.toLocaleDateString()} printTime={printJob.at.toLocaleTimeString()} user={actor||sup?.name||'admin'} companyName={company.name} companyAddress={company.address} companyPhone={company.phone} branch={locDes} partnerLabel="Supplier" partnerCode={supID} partnerName={sup?.name||supID} partnerAddress={sup ? `${sup.name} · ${sup.contact}`: ''} columns={(() => { const c = poPrintValueColumns(printJob.copy); return {code:'ItemCode', des:'Item Description', unit:'Unit', qty:'SRN Qty', cost: c.costPrice ? 'Cost Price' : undefined as any, value: c.itemValue ? 'ItemValue' : undefined as any } as any; })()} rows={printRows.map(r=>({ ...r, costPrice: poPrintValueColumns(printJob.copy).costPrice ? r.costPrice : '', itemValue: poPrintValueColumns(printJob.copy).itemValue ? r.itemValue : '' }))} totalLabel="Net Total" total={poPrintValueColumns(printJob.copy).total ? money(returnTotal) : ''} deliAdd={grnNo?`GRN: ${grnNo}`:''} remarks={remarks} />
                  <div className="no-print" style={{textAlign:'right', marginTop:8}}><button className="btn primary" onClick={()=>window.print()}>Print now</button> <button className="btn" onClick={()=>setPrintJob(null)}>Close preview</button></div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {printAsk && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Print SRN">
          <div className="ask-card">
            <h2>Print Supplier Return Note</h2>
            <p>{srnNo? <><span className="mono">{srnNo.trim()}</span> — </>:null} which copy do you want to print?</p>
            <div className="ask-choices">
              {PO_PRINT_COPY_CHOICES.map(choice=> (
                <button key={choice.id} className="ask-choice" onClick={()=> startPrint(choice.id as PoPrintCopy)}>
                  <span className="ask-choice-title">{choice.label}</span>
                  <span className="ask-choice-hint">{choice.hint}</span>
                </button>
              ))}
            </div>
            <div className="ask-foot"><button className="btn" onClick={()=> setPrintAsk(false)}>Cancel</button></div>
          </div>
        </div>
      )}
      {mailOpen && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Email SRN" onClick={()=>setMailOpen(false)}>
          <div className="ask-card mail-card" onClick={e=>e.stopPropagation()}>
            <h2>Email Supplier Return Note</h2>
            <p><span className="mono">{srnNo.trim()}</span> goes to <b>{sup?.name||supID}</b> as a PDF.</p>
            <div className="mail-field"><label htmlFor="mail-to">To</label><input id="mail-to" value={mailTo} onChange={e=>setMailTo(e.target.value)} placeholder="supplier@example.com" spellCheck={false} /></div>
            {!supplierEmail && !mailTo.trim() && <div className="mail-warn">This supplier has no e-mail on its record — type one here.</div>}
            {supplierEmail && mailTo.trim() && mailTo.trim()!==supplierEmail && <div className="mail-hint">Supplier record has <b>{supplierEmail}</b> — will go to address above.</div>}
            <div className="mail-field"><label>Copy to send</label><div className="mail-copies">{PO_PRINT_COPY_CHOICES.map(choice=> (
              <label key={choice.id} className={`mail-radio ${mailCopy===choice.id?'on':''}`}><input type="radio" name="mail-copy" checked={mailCopy===choice.id} onChange={()=> setMailCopy(choice.id as PoPrintCopy)} /><span><b>{choice.label}</b><span className="mail-radio-hint">{choice.hint}</span></span></label>
            ))}</div></div>
            <div className="mail-field"><label htmlFor="mail-subject">Subject</label><input id="mail-subject" value={mailSubject} onChange={e=>setMailSubject(e.target.value)} /></div>
            <div className="mail-field"><label htmlFor="mail-message">Message</label><textarea id="mail-message" rows={4} value={mailMessage} onChange={e=>setMailMessage(e.target.value)} placeholder="Leave empty for standard note (SRN number, date, line count)." /></div>
            <div className="mail-attach">Attachment: <b>{(srnNo.trim()||'srn').trim()}.pdf</b> · {printRows.length} line(s) · {mailCopy==='supplier'?'no prices':'total '+money(returnTotal)}</div>
            <div className="ask-foot"><button className="btn" onClick={()=> setMailOpen(false)} disabled={mailSending}>Cancel</button><button className="btn primary" onClick={()=> void sendMailEnhanced()} disabled={mailSending||!mailTo.trim()}>{mailSending?'Sending…':'Send to Supplier'}</button></div>
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
  .po-form{display:grid;grid-template-columns:120px minmax(160px,1fr) 110px minmax(140px,1fr);gap:9px 12px;align-items:center}
  .po-form label{font-size:11.5px;font-weight:700;color:#3c5a60;text-transform:uppercase;letter-spacing:0.03em}
  .po-form input,.po-form select{height:32px;border:1px solid rgba(30,58,64,0.18);border-radius:7px;background:#fff;padding:0 9px;font-size:12.5px;font-family:inherit;color:#1f2937;width:100%;color-scheme:light}
  .po-form input:disabled,.po-form select:disabled{background:#e5ebeb;color:#7b8f92}
  .po-form input.num.strong{font-weight:800;color:#16333a}
  .po-find{display:flex;flex-wrap:wrap;align-items:center;gap:9px 12px}
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
  .ask-back{position:fixed;inset:0;background:rgba(15,40,45,0.45);display:flex;align-items:center;justify-content:center;z-index:5000;padding:20px}
  .ask-box{background:#fff;border-radius:14px;padding:16px;width:min(520px,94vw);display:flex;flex-direction:column;gap:10px}
  .ask-box h2{font-size:14px;font-weight:800;color:#16333a}
  .ask-sub{font-size:12.5px;color:#1f2937}
  .ask-actions{display:flex;justify-content:flex-end;gap:8px}
  
  /* ── "which copy?" + email dialogs (like PO) ─────────────────────────── */
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

  @media print{.no-print{display:none!important} .po-shell{display:block;height:auto} .po-main{overflow:visible;padding:0} .po-card{border:none;padding:0;background:transparent!important} .po-grid-wrap{display:none!important}}
`;
