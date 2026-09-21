'use client';
// src/app/inventory/transfer/note/page.tsx
// TRANSFER NOTE — UI only (galapena PO wage)
// Legacy: Issue Requisition No / From Location / Transfer No (TN) / TR Date / To Location / TR Due Date
//         Item Code | Item Name | Unit | Cost Price | TR QTY | Transferred QTY | Item Value
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import ItemSuggestInput, { type SuggestedItem } from '@/components/ItemSuggestInput';
import TransferPrintSheet, { TRANSFER_PRINT_CSS } from '@/components/TransferPrintSheet';
import { poPrintClock, poPrintDate, poPrintRows, poPrintTotal, poPrintCopyLabel, poPrintValueColumns, type PoPrintCopy } from '@/lib/poPrint';
import { TRANSFER_PRINT_COPY_CHOICES } from '@/lib/transferPrint';

interface LookupLocation { code: string; des: string; address: string; enable: boolean }
interface LookupUnit { id: string; des: string; enable: boolean }
interface TrLine { key:string; itemCode:string; itemName:string; unitID:string; costPrice:string; trQty:string; transQty:string; itemValue:number; }
interface FindRow { fromCode:string; fromDes:string; toCode:string; toDes:string; trNo:string; trDate:string; }

let seq=0;
const newLine=():TrLine=>({key:`N${++seq}`,itemCode:'',itemName:'',unitID:'',costPrice:'',trQty:'',transQty:'',itemValue:0});
const money=(n:number)=> Number(n||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
function useToast(){ const [toast,setToast]=useState<{msg:string;err:boolean}|null>(null); const show=useCallback((m:string,e=false)=>{ setToast({msg:m,err:e}); setTimeout(()=>setToast(null),3800);},[]); return {toast,show}; }

export default function TransferNotePage(){
  const router=useRouter();
  const {toast,show}=useToast();
  const [tab,setTab]=useState<string>('details');
  const [locations,setLocations]=useState<LookupLocation[]>([]);
  const [units,setUnits]=useState<LookupUnit[]>([]);
  const [lookupNote,setLookupNote]=useState('Loading locations…');

  const [issueReq,setIssueReq]=useState('TC000006');
  const [fromLoc,setFromLoc]=useState('MILLA MIRISSA');
  const [transferNo,setTransferNo]=useState('TN000012');
  const [trDate,setTrDate]=useState('2026-09-18');
  const [toLoc,setToLoc]=useState('KITCHEN');
  const [trDue,setTrDue]=useState('2026-09-21');
  const [remarks,setRemarks]=useState('');
  const [lines,setLines]=useState<TrLine[]>([newLine(),newLine()]);
  const [confirmed,setConfirmed]=useState(false);
  const [dirty,setDirty]=useState(false);

  const [findRows,setFindRows]=useState<FindRow[]>([]);
  const [findQ,setFindQ]=useState('');
  const [findStatus,setFindStatus]=useState<string>('confirmed');
  const [listBusy,setListBusy]=useState(false);

  // Print / Email like PO
  const [company,setCompany]=useState<{name:string;address:string;phone:string}>({name:'',address:'',phone:''});
  const [printAsk,setPrintAsk]=useState(false);
  const [printJob,setPrintJob]=useState<{copy:PoPrintCopy; at:Date; nonce:number}|null>(null);
  const printNonce=React.useRef(0);
  const [mailAsk,setMailAsk]=useState(false);
  const [mailTo,setMailTo]=useState('');
  const [mailSubject,setMailSubject]=useState('');
  const [mailMessage,setMailMessage]=useState('');
  const [mailCopy,setMailCopy]=useState<PoPrintCopy>('standard');
  const [sending,setSending]=useState(false);
  const loadList = async()=>{
    try{
      const params=new URLSearchParams({status:findStatus, q:findQ, limit:'300'});
      if(fromLoc) params.set('fromLoc', fromLoc);
      if(toLoc) params.set('toLoc', toLoc);
      const res=await fetch(`/api/inventory/transfer/note?${params.toString()}`,{cache:'no-store'});
      const j=await res.json() as any;
      if(res.ok && j?.success && Array.isArray(j.data)){
        setFindRows(j.data.map((r:any)=>({fromCode:r.fromLocCode, fromDes:r.fromLocDes||r.fromLocCode, toCode:r.toLoc, toDes:r.toLocDes||r.toLoc, trNo:r.tranNo, trDate:String(r.traDate||'')} )));
      } else throw new Error(j?.message||'load failed');
    }catch{ setFindRows([]); }
  };
  useEffect(()=>{ if(tab==='find') void loadList(); },[tab, findStatus]);

  const [openReqs,setOpenReqs]=useState<string[]>([]);
  useEffect(()=>{ let a=true; (async()=>{ try{ const r=await fetch('/api/inventory/transfer/requisition?status=confirmed&limit=100',{cache:'no-store'}); const j=await r.json() as any; if(a && r.ok && j?.success && Array.isArray(j.data)){ setOpenReqs(j.data.map((x:any)=> String(x.trNo).trim()).filter(Boolean)); } }catch{} })(); return()=>{a=false}; },[]);
  useEffect(()=>{ let a=true; (async()=>{ try{ const r=await fetch('/api/inventory/lookups',{cache:'no-store'}); const j=await r.json() as any; if(!a) return; if(r.ok&&j?.success){ const locs=j.locations??[]; if(locs.length){ setLocations(locs); setUnits(j.units??[]); if(j.company?.name) setCompany(j.company); setLookupNote(`${locs.length} location(s) loaded`); } else throw new Error('empty'); } else throw new Error('fail'); } catch{ if(!a) return; setLocations([{code:'01',des:'MILLA MIRISSA',address:'',enable:true},{code:'03',des:'KITCHEN',address:'',enable:true},{code:'KITCHEN',des:'KITCHEN',address:'',enable:true}]); setUnits([{id:'KILOGRAM',des:'KILOGRAM',enable:true},{id:'KILOGRA',des:'KILOGRAM',enable:true}]); setLookupNote('Demo locations — API not reachable'); } })(); return()=>{a=false}; },[]);

  const netValue = useMemo(()=> lines.reduce((s,l)=> s+ (Number(l.costPrice)||0)*(Number(l.transQty)||0),0),[lines]);
  function patchLine(k:string,p:Partial<TrLine>){ setLines(prev=> prev.map(l=>{ if(l.key!==k) return l; const n={...l,...p} as TrLine; n.itemValue=(Number(n.costPrice)||0)*(Number(n.transQty)||0); return n; })); setDirty(true); }
  function pickItem(k:string,it:SuggestedItem){ patchLine(k,{itemCode:it.code,itemName:it.des,unitID:it.masterUnitID||'',costPrice:it.costPrice?String(it.costPrice):''}); }
  function addLine(){ setLines(p=>[...p,newLine()]); setDirty(true); }
  function removeLine(k:string){ setLines(p=> p.length===1 ? [newLine()] : p.filter(l=>l.key!==k)); setDirty(true); }
  async function handleSave(confirm=false){
    if(!fromLoc || !toLoc){ show('Choose From and To locations', true); return; }
    if(!issueReq){ show('Choose Issue Requisition No', true); return; }
    const valid = lines.filter(l=> (l.itemCode||'').trim() || (l.itemName||'').trim());
    if(valid.length===0){ show('Add at least one item', true); return; }
    if(valid.some(l=> !(Number(l.trQty)>0) || !(Number(l.transQty)>0))){ show('Enter TR QTY and Transferred QTY for each line', true); return; }
    try{
      const body = { tReqNo: issueReq, fromLocCode: fromLoc, toLoc: toLoc, traDate: trDate, trDueDate: trDue, remarks, confirm, lines: valid.map(l=>({ itemCode:l.itemCode||l.itemName, unitID:l.unitID, costPrice: Number(l.costPrice)||0, trQty: Number(l.trQty)||0, tranQty: Number(l.transQty)||0 })) };
      const res = await fetch('/api/inventory/transfer/note',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const j = await res.json() as any;
      if(!res.ok || !j?.success) throw new Error(j?.message||'Save failed');
      setTransferNo(j.data.tranNo); setConfirmed(j.data.confirmed); setDirty(false); show(j.message||'Saved ✓');
      void loadList();
    }catch(e:any){ show(e?.message||'Save failed', true); }
  }
  function handleClear(){ setLines([newLine(),newLine()]); setDirty(false); show('Cleared'); }
  function handleNav(k:string,p:string){ if(dirty && !confirm('Leave without saving?')) return; router.push(p); }

  const printableLines = lines.filter(l=> (l.itemCode||l.itemName).trim());
  function handlePrint(){
    if(printableLines.length===0){ show('Add at least one item before printing', true); return; }
    if(!transferNo){ show('Save the transfer note before printing', true); return; }
    setPrintAsk(true);
  }
  function startPrint(copy:PoPrintCopy){ setPrintAsk(false); setPrintJob({copy, at:new Date(), nonce: ++printNonce.current}); }
  React.useEffect(()=>{ if(!printJob) return; const id=window.setTimeout(()=>window.print(), 60); return()=> window.clearTimeout(id); },[printJob]);
  const printData = (()=> {
    const copy = printJob?.copy ?? 'standard';
    const cols = poPrintValueColumns(copy);
    const fromLocObj = locations.find(l=> l.des===fromLoc || l.code===fromLoc);
    const toLocObj = locations.find(l=> l.des===toLoc || l.code===toLoc);
    const at = printJob?.at ?? new Date();
    return {
      copy, cols, colCount: cols.costPrice ? 6 : 4,
      companyName: (company.name || fromLocObj?.des || 'SAYO').trim(),
      companyAddress: (company.address || fromLocObj?.address || '').trim(),
      companyPhone: (company.phone||'').trim(),
      branch: (fromLocObj?.des||'').trim(),
      fromCode: fromLocObj?.code || fromLoc.slice(0,10),
      fromName: fromLocObj?.des || fromLoc,
      toCode: toLocObj?.code || toLoc.slice(0,10),
      toName: toLocObj?.des || toLoc,
      docNo: transferNo || '(not saved)',
      docDate: poPrintDate(trDate),
      dueDate: poPrintDate(trDue),
      issueRef: issueReq,
      printDate: poPrintClock(at).date,
      printTime: poPrintClock(at).time,
      user: 'aura',
      rows: poPrintRows(printableLines.map(l=>({itemCode:l.itemCode, name:l.itemName, unitID:l.unitID, unitName: units.find(u=>u.id===l.unitID)?.des||l.unitID, costPrice:Number(l.costPrice)||0, poQty:Number(l.transQty)||0}))),
      total: poPrintTotal(printableLines.map(l=>({itemCode:l.itemCode,name:l.itemName,unitID:l.unitID,costPrice:Number(l.costPrice)||0, poQty:Number(l.transQty)||0}))),
      remarks: (remarks||'').trim(),
    };
  })();
  function openMailDialog(){
    if(printableLines.length===0){ show('Add at least one item before emailing', true); return; }
    if(!transferNo){ show('Save the note first (Save), then it can be emailed', true); return; }
    setMailTo(prev=> prev || '');
    setMailSubject(prev=> prev || `Transfer Note ${transferNo}`);
    setMailCopy(prev=> prev || 'standard');
    setMailAsk(true);
  }
  async function sendMail(){
    const to = mailTo.trim();
    if(!to){ show('Type the address to send to', true); return; }
    setSending(true);
    try{
      const res=await fetch(`/api/inventory/transfer/note/${encodeURIComponent(transferNo)}/email`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({fromLocCode: locations.find(l=>l.des===fromLoc)?.code || fromLoc, toLoc: locations.find(l=>l.des===toLoc)?.code || toLoc, copy: mailCopy, to, subject: mailSubject.trim(), message: mailMessage.trim()})
      });
      const j=await res.json() as any;
      if(!res.ok || !j?.success) throw new Error(j?.message||'Email failed');
      setMailAsk(false); show(j.message||'Emailed ✓');
    }catch(e:any){ show(e?.message||'Email failed', true); }
    finally{ setSending(false); }
  }


  const filteredFind = findRows.filter(r=> !findQ || r.trNo.includes(findQ) || r.fromDes.toLowerCase().includes(findQ.toLowerCase()));

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      <style>{TRANSFER_PRINT_CSS}</style>
      {toast && <div className={`toast ${toast.err?'err':''}`}>{toast.msg}</div>}
      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-tr-note" onNav={handleNav} onLogout={()=>router.push('/admin-login')} /></div>
        <div className="po-main">
          <header className="po-head no-print">
            <h1>TRANSFER NOTE</h1>
            <div className="po-tabs">
              <button className={tab==='find'?'on':''} onClick={()=>setTab('find')}>Find</button>
              <button className={tab==='details'?'on':''} onClick={()=>setTab('details')}>Details</button>
            </div>
            <div className="po-state">
              <span className="chip">{transferNo}</span>
              {confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>}
              {dirty && <span className="chip dim">unsaved</span>}
            </div>
          </header>

          {lookupNote && <div className="po-note no-print">{lookupNote} — Transfer Issue (TN) like legacy</div>}

          {tab==='find' && (
            <div className="po-card no-print">
              <div className="po-list-wrap">
                <table className="po-table">
                  <thead><tr><th>FromLocCode</th><th>LocDes</th><th>ToLoc</th><th>ToLocDes</th><th>TRANNO</th><th>TraDate</th></tr></thead>
                  <tbody>
                    {filteredFind.map(r=>(
                      <tr key={r.trNo} style={{background: r.trNo==='TN000010' ? '#eaffea' : r.trNo==='TN000011' ? '#fff8dc' : '#fff',cursor:'pointer'}} onClick={()=>{ setTransferNo(r.trNo); setFromLoc(r.fromDes); setToLoc(r.toDes); setTab('details'); show(`Transfer Note ${r.trNo} selected — lines from requisition will load on Save`); }}>
                        <td className="mono" style={{color:'#0b5cab'}}>{r.fromCode}</td>
                        <td style={{color:'#0b5cab'}}>{r.fromDes}</td>
                        <td style={{color:'#0b5cab'}}>{r.toCode}</td>
                        <td style={{color:'#0b5cab'}}>{r.toDes}</td>
                        <td className="mono" style={{color:'#0b5cab',textDecoration:'underline'}}>{r.trNo}</td>
                        <td style={{color:'#0b5cab'}}>{r.trDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="po-find">
                <label>Find Criteria</label>
                <input value={findQ} onChange={e=>setFindQ(e.target.value)} placeholder="TN number or location" />
                <label className="rad"><input type="radio" checked={findStatus==='confirmed'} onChange={()=>setFindStatus('confirmed')} /> Confirmed Issue Note</label>
                <label className="rad"><input type="radio" checked={findStatus==='pending'} onChange={()=>setFindStatus('pending')} /> Pending Issue Note</label>
                <button className="btn" onClick={()=>void loadList()}>Find</button>
              </div>
              <div style={{display:'flex',gap:8}}><button className="btn" style={{flex:1}}>Find</button><button className="btn" style={{flex:1}}>Details</button></div>
              <div className="po-note" style={{background:'#fff',border:'1px solid #000',padding:10}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px'}}>
                  <div><b>MILLA MIRISSA</b><div>ADD ADD</div></div>
                  <div style={{fontWeight:800}}>Transfer Note</div>
                  <div style={{fontSize:'10px',textAlign:'right'}}>Print Date : 21-Sep-2026<br/>Print Time : 9:53:52 am<br/>User : aura</div>
                </div>
                <div style={{display:'flex',gap:30,fontSize:'11px',marginTop:10}}><span>From <b>{fromLoc || '—'}</b></span><span>Transfer Note No <b>{transferNo || 'TN —'}</b></span><span>Tra Date <b>{trDate}</b></span></div>
                <div style={{display:'flex',gap:30,fontSize:'11px'}}><span>To <b>{toLoc || '—'}</b></span><span>Issue Req <b>{issueReq || '—'}</b></span></div>
                <table className="po-table" style={{marginTop:8}}>
                  <thead><tr><th>Item Code</th><th>Raw Item Description</th><th>Unit</th><th className="num">Cost Price</th><th className="num">Tran Qty</th><th className="num">Item Value</th><th>User Name</th></tr></thead>
                  <tbody>
                    {lines.filter(l=>l.itemCode||l.itemName).length===0 ? <tr><td colSpan={7} className="empty">No lines — select a note from above or add in Details</td></tr> : lines.filter(l=>l.itemCode||l.itemName).map(l=>(
                      <tr key={l.key}><td>{l.itemCode || '—'}</td><td>{l.itemName || '—'}</td><td>{l.unitID || '—'}</td><td className="num">{l.costPrice ? Number(l.costPrice).toLocaleString(): '—'}</td><td className="num">{l.transQty || '—'}</td><td className="num">{Number(l.itemValue||0).toLocaleString()}</td><td>aura</td></tr>
                    ))}
                    <tr><td colSpan={5} style={{textAlign:'right',fontWeight:700}}>Total Amount</td><td className="num" style={{fontWeight:800}}>{lines.reduce((s,l)=> s+Number(l.itemValue||0),0).toLocaleString()}</td><td></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==='details' && (
            <div className="po-card">
              <div className="po-form no-print" style={{gridTemplateColumns:'130px minmax(150px,1fr) 110px minmax(150px,1fr) 110px minmax(150px,1fr)'}}>
                <label>Issue Requisition No</label>
                <select value={issueReq} onChange={e=>setIssueReq(e.target.value)}>
                  {openReqs.length ? openReqs.map(tc=> <option key={tc} value={tc}>{tc}</option>) : <><option>TC000006</option><option>TC000005</option></>}
                </select>
                <label>From Location</label>
                <select value={fromLoc} onChange={e=>{setFromLoc(e.target.value); setDirty(true);}}>
                  {locations.length? locations.map(l=><option key={l.code} value={l.des}>{l.des}</option>) : <><option>MILLA MIRISSA</option><option>KITCHEN</option></>}
                </select>
                <label>Transfer No</label>
                <input value={transferNo} readOnly className="mono" style={{background:'#fff8dc',fontWeight:700}} />

                <label>TR Date</label>
                <input type="date" value={trDate} disabled style={{background:'#eef2f2'}} />
                <label>To Location</label>
                <select value={toLoc} onChange={e=>{setToLoc(e.target.value); setDirty(true);}}>
                  {locations.length? locations.map(l=><option key={l.code} value={l.des}>{l.des}</option>) : <><option>KITCHEN</option><option>MILLA MIRISSA</option></>}
                </select>
                <label>TR Due Date</label>
                <input type="date" value={trDue} onChange={e=>{setTrDue(e.target.value); setDirty(true);}} />
              </div>

              <div style={{textAlign:'center',fontWeight:800,letterSpacing:'0.04em',color:'#234a52',fontSize:'11px',textTransform:'uppercase',background:'#eef4f4',padding:'4px',border:'1px solid rgba(0,0,0,0.08)',borderBottom:'none'}}>Item Details</div>
              <div className="po-grid-wrap" style={{marginTop:0,borderTopLeftRadius:0,borderTopRightRadius:0}}>
                <table className="po-table">
                  <thead>
                    <tr>
                      <th style={{width:36}}>#</th>
                      <th style={{width:90}}>Item Code</th>
                      <th>Item Name</th>
                      <th style={{width:110}}>Unit</th>
                      <th style={{width:100}} className="num">Cost Price</th>
                      <th style={{width:90}} className="num">TR QTY</th>
                      <th style={{width:110}} className="num">Transferred QTY</th>
                      <th style={{width:110}} className="num">Item Value</th>
                      <th className="no-print" style={{width:36}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l,i)=>(
                      <tr key={l.key} style={i===0?{background:'#2244ff'}:{}}>
                        <td className="num" style={i===0?{background:'#2244ff',color:'#fff'}:{}}>{i===lines.length?'*':'▶'}</td>
                        <td style={i===0?{background:'#2244ff',color:'#fff'}:{}}>{l.itemCode || <span style={{color:'#999'}}>--</span>}</td>
                        <td style={i===0?{background:'#2244ff',color:'#fff'}:{}}>{i===0 ? l.itemName : <ItemSuggestInput locCode={fromLoc} value={l.itemName} onText={t=>patchLine(l.key,{itemName:t})} onPick={it=>pickItem(l.key,it)} />}</td>
                        <td><select value={l.unitID} onChange={e=>patchLine(l.key,{unitID:e.target.value})} style={i===0?{background:'#2244ff',color:'#fff'}:{}}><option value="">—</option>{units.map(u=><option key={u.id} value={u.id}>{u.des}</option>)} {!units.find(u=>u.id===l.unitID) && l.unitID && <option value={l.unitID}>{l.unitID}</option>}</select></td>
                        <td className="num"><input type="number" className="num" value={l.costPrice} onChange={e=>patchLine(l.key,{costPrice:e.target.value})} style={i===0?{background:'#2244ff',color:'#fff',textAlign:'right'}:{}} /></td>
                        <td className="num"><input type="number" className="num" value={l.trQty} onChange={e=>patchLine(l.key,{trQty:e.target.value})} style={i===0?{background:'#2244ff',color:'#fff'}:{background:'#eef2f2'}} disabled={i===0} /></td>
                        <td className="num" style={{background:'#fffde6'}}><input type="number" className="num" value={l.transQty} onChange={e=>patchLine(l.key,{transQty:e.target.value})} style={{background:'#fffde6'}} /></td>
                        <td className="num" style={i===0?{background:'#2244ff',color:'#fff'}:{}}>{money(l.itemValue)}</td>
                        <td className="no-print"><button className="x" onClick={()=>removeLine(l.key)}>✕</button></td>
                      </tr>
                    ))}
                    <tr><td className="num">*</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                  </tbody>
                </table>
              </div>

              <div className="po-form no-print" style={{gridTemplateColumns:'80px 1fr 90px 140px'}}>
                <label>Remarks</label>
                <textarea value={remarks} onChange={e=>{setRemarks(e.target.value); setDirty(true);}} rows={2} style={{border:'1px solid rgba(30,58,64,0.18)',borderRadius:7,padding:'8px 9px',fontFamily:'inherit',fontSize:'12.5px'}} placeholder="Remarks" />
                <label>Net Value</label>
                <input value={money(netValue)} readOnly className="num strong" style={{background:'#fff8dc',textAlign:'right',fontWeight:800}} />
              </div>

              <div className="po-actions no-print">
                <button className="btn" onClick={handleClear}>Clear</button>
                <button className="btn" onClick={()=>handleSave(true)}>Confirmation</button>
                <button className="btn" onClick={handlePrint}>Print</button>
                <button className="btn" onClick={openMailDialog}>Email</button>
                <button className="btn danger" onClick={()=>show('Delete — use API')}>Delete</button>
                <button className="btn primary" onClick={()=>handleSave(false)}>Save</button>
                <button className="btn" onClick={handleClear}>Cancel</button>
                <span className="hint" style={{marginLeft:'auto'}}>Net Value <b>{money(netValue)}</b></span>
              </div>

              <div style={{display:'flex',gap:8}} className="no-print">
                <button className="btn" style={{flex:1}} onClick={()=>setTab('find')}>Find</button>
                <button className="btn primary" style={{flex:1}} onClick={()=>setTab('details')}>Details</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {printAsk && (
        <div className="ask-back" onClick={()=>setPrintAsk(false)}>
          <div className="ask-card" onClick={e=>e.stopPropagation()}>
            <h2>Which copy do you want to print?</h2>
            <p>Standard shows cost, Supplier hides it.</p>
            <div className="ask-choices">
              {TRANSFER_PRINT_COPY_CHOICES.map(c=>(
                <button key={c.id} className="ask-choice" onClick={()=>startPrint(c.id as PoPrintCopy)}>
                  <span className="ask-choice-title">{c.label}</span>
                  <span className="ask-choice-hint">{c.hint}</span>
                </button>
              ))}
            </div>
            <div className="ask-foot"><button className="btn" onClick={()=>setPrintAsk(false)}>Cancel</button></div>
          </div>
        </div>
      )}
      {printJob && (
        <TransferPrintSheet
          title="Transfer Note"
          copy={printData.copy as any}
          copyLabel={poPrintCopyLabel(printData.copy as any)}
          cols={printData.cols}
          colCount={printData.colCount}
          companyName={printData.companyName}
          companyAddress={printData.companyAddress}
          companyPhone={printData.companyPhone}
          branch={printData.branch}
          fromCode={printData.fromCode}
          fromName={printData.fromName}
          toCode={printData.toCode}
          toName={printData.toName}
          docNo={printData.docNo}
          docDate={printData.docDate}
          dueDate={printData.dueDate}
          issueRef={printData.issueRef}
          printDate={printData.printDate}
          printTime={printData.printTime}
          user={printData.user}
          rows={printData.rows}
          total={printData.total}
          remarks={printData.remarks}
        />
      )}
      {mailAsk && (
        <div className="ask-back" onClick={()=>setMailAsk(false)}>
          <div className="ask-card mail-card" onClick={e=>e.stopPropagation()}>
            <h2>Email Transfer Note {transferNo}</h2>
            <div className="mail-field"><label>To</label><input value={mailTo} onChange={e=>setMailTo(e.target.value)} placeholder="name@example.com" /></div>
            <div className="mail-field"><label>Subject</label><input value={mailSubject} onChange={e=>setMailSubject(e.target.value)} /></div>
            <div className="mail-field"><label>Message</label><textarea value={mailMessage} onChange={e=>setMailMessage(e.target.value)} rows={4} placeholder="Optional covering note" /></div>
            <div className="mail-field"><label>Copy</label>
              <div className="mail-copies">
                {TRANSFER_PRINT_COPY_CHOICES.map(c=>(
                  <label key={c.id} className={`mail-radio ${mailCopy===c.id?'on':''}`}>
                    <input type="radio" checked={mailCopy===c.id} onChange={()=>setMailCopy(c.id as PoPrintCopy)} />
                    <span><b>{c.label}</b><span className="mail-radio-hint">{c.hint}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mail-attach">Attachment: {transferNo||'transfer'}.pdf — {printData.rows.length} line(s)</div>
            <div className="ask-foot"><button className="btn" onClick={()=>setMailAsk(false)} disabled={sending}>Cancel</button><button className="btn primary" onClick={sendMail} disabled={sending}>{sending?'Sending…':'Send Email'}</button></div>
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
  @media print{.no-print{display:none!important} html,body{background:#fff!important} .po-shell{display:block;height:auto} .po-main{overflow:visible;padding:0} .po-card{border:none;padding:0} .po-grid-wrap{max-height:none;overflow:visible;border:none}}

  /* ── "which copy?" dialog — from PO, exact match ── */
  .ask-back {
    position:fixed; inset:0; background:rgba(16,32,36,0.55); z-index:10000;
    display:flex; align-items:center; justify-content:center; padding:20px;
  }
  .ask-card {
    background:#fff; color:#1f2937; border-radius:14px; padding:20px 22px; width:min(680px,94vw);
    box-shadow:0 18px 50px rgba(0,0,0,0.32); display:flex; flex-direction:column; gap:12px;
  }
  .ask-card h2 { font-size:15px; font-weight:800; color:#16333a; letter-spacing:0.02em; }
  .ask-card p { font-size:12.5px; color:#42585e; }
  .ask-choices { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ask-choice {
    display:flex; flex-direction:column; gap:6px; text-align:left; cursor:pointer; font-family:inherit;
    border:1px solid rgba(30,58,64,0.22); border-radius:11px; background:#f3f8f8; padding:14px 15px;
  }
  .ask-choice:hover { background:#e6f0f0; border-color:#1e3a40; }
  .ask-choice-title { font-size:14px; font-weight:800; color:#16333a; }
  .ask-choice-hint { font-size:11.5px; color:#5b7176; line-height:1.45; }
  .ask-foot { display:flex; justify-content:flex-end; gap:8px; }
  .mail-card { width:min(760px,95vw); max-height:92vh; overflow:auto; }
  .mail-field { display:flex; flex-direction:column; gap:5px; }
  .mail-field > label { font-size:11px; font-weight:700; color:#3c5a60; text-transform:uppercase; letter-spacing:0.03em; }
  .mail-field input, .mail-field textarea {
    border:1px solid rgba(30,58,64,0.22); border-radius:8px; background:#fff; color:#1f2937;
    padding:8px 10px; font-size:12.5px; font-family:inherit; width:100%; color-scheme:light;
  }
  .mail-field textarea { resize:vertical; line-height:1.5; }
  .mail-copies { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .mail-radio {
    display:flex; gap:8px; align-items:flex-start; border:1px solid rgba(30,58,64,0.18);
    border-radius:9px; padding:9px 11px; background:#f6fafa; cursor:pointer; font-size:12px;
  }
  .mail-radio.on { border-color:#1e3a40; background:#e7f0f0; }
  .mail-radio input { margin-top:2px; accent-color:#1e3a40; }
  .mail-radio-hint { display:block; font-size:11px; color:#5b7176; margin-top:3px; line-height:1.4; }
  .mail-warn { font-size:11.5px; font-weight:600; color:#b45309; background:#fef3c7; border-radius:8px; padding:8px 10px; }
  .mail-hint { font-size:11.5px; color:#5b7176; }
  .mail-attach { font-size:11.5px; color:#3c5a60; background:#eef4f4; border-radius:8px; padding:8px 10px; }
  @media print {
    .no-print, .po-tabs, .po-note, .po-state, .po-shell, .toast, .ask-back { display:none !important; }
    html, body { background:#fff !important; height:auto; background-image:none !important; }
  }
`;
