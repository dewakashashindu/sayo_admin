'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import ItemSuggestInput, { type SuggestedItem } from '@/components/ItemSuggestInput';
import TransferPrintSheet, { TRANSFER_PRINT_CSS } from '@/components/TransferPrintSheet';
import {
  poPrintClock,
  poPrintCopyLabel,
  poPrintDate,
  poPrintRows,
  poPrintTotal,
  poPrintValueColumns,
  type PoPrintCopy,
} from '@/lib/poPrint';
import { TRANSFER_PRINT_COPY_CHOICES } from '@/lib/transferPrint';

interface LookupLocation { code: string; des: string; address: string; enable: boolean; mainLoc?: boolean }
interface LookupUnit { id: string; des: string; enable: boolean }
interface LookupCompany { name: string; address: string; phone: string }

interface InLine {
  key: string;
  itemCode: string;
  name: string;
  unitID: string;
  costPrice: string;
  irQty: string;
  issuedQty: string;
}

interface FindRow {
  inNo: string; fromLocCode: string; fromLocDes: string; toLoc: string; toLocDes: string;
  inDate: string; irNo: string; netTotal: number; confirmed: boolean;
}

interface ReqOption {
  irNo: string; fromLocCode: string; fromLocDes: string; toLoc: string; toLocDes: string;
}

let lineSeq = 0;
const newLine = (): InLine => ({
  key: `N${++lineSeq}`, itemCode: '', name: '', unitID: '', costPrice: '', irQty: '', issuedQty: '',
});

const money = (n: number) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayOf = (value: unknown) => String(value ?? '').slice(0, 10);
const lineValue = (cost: string, qty: string) => (Number(cost) || 0) * (Number(qty) || 0);

function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const show = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.setTimeout(() => setToast(null), 4200);
  }, []);
  return { toast, show };
}

export default function IssueNotePage() {
  const router = useRouter();
  const { toast, show: showToast } = useToast();

  const [tab, setTab] = useState<'find' | 'details'>('details');

  /* dropdown data — straight from the database */
  const [locations, setLocations] = useState<LookupLocation[]>([]);
  const [units, setUnits] = useState<LookupUnit[]>([]);
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const [lookupNote, setLookupNote] = useState('Loading locations and units…');
  const [company, setCompany] = useState<LookupCompany>({ name: '', address: '', phone: '' });

  /* printing */
  const [printAsk, setPrintAsk] = useState(false);
  const [printJob, setPrintJob] = useState<{ copy: PoPrintCopy; at: Date; nonce: number } | null>(null);
  const printNonce = React.useRef(0);
  const [actor, setActor] = useState('');


  /* the document */
  const [issueReq, setIssueReq] = useState('');
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [inDate, setInDate] = useState(dayOf(new Date().toISOString()));
  const [irDate, setIrDate] = useState('');
  const [irDueDate, setIrDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<InLine[]>([newLine()]);
  const [inNo, setInNo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState('');

  /* find tab */
  const [findQ, setFindQ] = useState('');
  const [findStatus, setFindStatus] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [list, setList] = useState<FindRow[]>([]);
  const [listBusy, setListBusy] = useState(false);

  /* confirmed requisitions the note can be issued against */
  const [reqOptions, setReqOptions] = useState<ReqOption[]>([]);
  const [reqLoading, setReqLoading] = useState(false);

    useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/inventory/lookups', { cache: 'no-store' });
        const json = await res.json() as {
          success?: boolean; locations?: LookupLocation[]; units?: LookupUnit[];
          company?: LookupCompany; errors?: Record<string, string>; message?: string;
        };
        if (!active) return;
        if (!res.ok || !json?.success) throw new Error(json?.message || `HTTP ${res.status}`);
        const locs = json.locations ?? [];
        setLocations(locs);
        setUnits(json.units ?? []);
        if (json.company?.name) setCompany(json.company);
        setLookupErrors(json.errors ?? {});
        setLookupNote(`${locs.length} location(s) · ${(json.units ?? []).length} unit(s) loaded`);
        setFromLoc((prev) => prev || locs.find((l) => l.mainLoc && l.enable)?.code || '');
      } catch (err) {
        if (!active) return;
        setLookupNote('');
        setLookupErrors({ all: err instanceof Error ? err.message : 'Could not load the lists' });
        showToast('Could not load locations / units from the database', true);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/admin-me', { cache: 'no-store' });
        const json = await res.json() as { success?: boolean; user?: { username?: string; name?: string } };
        if (!active || !json?.success) return;
        setActor(json.user?.username || json.user?.name || '');
      } catch {
        /* the sheet simply prints an empty User line */
      }
    })();
    return () => { active = false; };
  }, []);

    const loadReqOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/issue/requisition?status=confirmed&limit=200', { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: any[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load requisitions');
      setReqOptions((json.data ?? []).map((r: any) => ({
        irNo: String(r.irNo ?? '').trim(),
        fromLocCode: String(r.fromLocCode ?? '').trim(),
        fromLocDes: String(r.fromLocDes ?? r.fromLocCode ?? '').trim(),
        toLoc: String(r.toLoc ?? '').trim(),
        toLocDes: String(r.toLocDes ?? r.toLoc ?? '').trim(),
      })).filter((r) => r.irNo));
    } catch {
      /* the dropdown simply stays empty — typing the note by hand still works */
    }
  }, []);

  useEffect(() => { void loadReqOptions(); }, [loadReqOptions]);

    const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const params = new URLSearchParams({ status: findStatus });
      if (findQ.trim()) params.set('q', findQ.trim());
      const res = await fetch(`/api/inventory/issue/note?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: any[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the issue notes');
      setList((json.data ?? []).map((r: any) => ({
        inNo: String(r.inNo ?? ''),
        fromLocCode: String(r.fromLocCode ?? ''),
        fromLocDes: String(r.fromLocDes ?? r.fromLocCode ?? ''),
        toLoc: String(r.toLoc ?? ''),
        toLocDes: String(r.toLocDes ?? r.toLoc ?? ''),
        inDate: dayOf(r.inDate),
        irNo: String(r.irNo ?? ''),
        netTotal: Number(r.netTotal || 0),
        confirmed: Boolean(r.confirmed),
      })));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load the issue notes', true);
      setList([]);
    } finally {
      setListBusy(false);
    }
  }, [findQ, findStatus, showToast]);

  useEffect(() => { if (tab === 'find') void loadList(); }, [tab, loadList]);

    function patchLine(key: string, patch: Partial<InLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function pickItem(key: string, item: SuggestedItem) {
    patchLine(key, {
      itemCode: item.code,
      name: item.des,
      unitID: item.masterUnitID || '',
      costPrice: item.costPrice ? String(item.costPrice) : '',
      irQty: lines.find((l) => l.key === key)?.irQty || '1',
      issuedQty: lines.find((l) => l.key === key)?.issuedQty || '1',
    });
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
    setDirty(true);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? [newLine()] : prev.filter((l) => l.key !== key)));
    setDirty(true);
  }

    const netValue = useMemo(
    () => lines.reduce((sum, l) => sum + lineValue(l.costPrice, l.issuedQty), 0),
    [lines],
  );

  const unitName = useCallback(
    (id: string) => units.find((u) => u.id === id)?.des || '',
    [units],
  );

    /* Same idea as the PO page's "Add selected to PO": the requisition's items
     become the note's lines and the From/To locations fill themselves in.     */
  async function loadFromRequisition(irNo: string) {
    setIssueReq(irNo);
    if (!irNo) return;
    if (confirmed) {
      showToast(`${inNo || 'This note'} is already confirmed — Clear to start a new note first`, true);
      return;
    }
    const opt = reqOptions.find((r) => r.irNo === irNo);
    const typed = lines.filter((l) => l.itemCode || l.name.trim());
    if (typed.length > 0) {
      if (!confirm(`Loading requisition ${irNo} will replace the ${typed.length} line(s) on the form. Continue?`)) return;
    }
    setReqLoading(true);
    try {
      const params = new URLSearchParams();
      if (opt?.fromLocCode) params.set('fromLoc', opt.fromLocCode);
      if (opt?.toLoc) params.set('toLoc', opt.toLoc);
      const res = await fetch(`/api/inventory/issue/requisition/${encodeURIComponent(irNo)}${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: {
          header: { fromLocCode: string; toLoc: string; irDate: string; irDueDate: string };
          lines: { itemCode: string; itemName: string; unitID: string; costPrice: number; irQty: number; issuedQty: number }[];
        };
      };
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not load the requisition');
      const h = json.data.header;
      // the issue note keeps the requisition's From/To — the stock physically
      // moves From -> To, so nothing is swapped here (unlike a transfer note).
      setFromLoc(h.fromLocCode);
      setToLoc(h.toLoc);
      setIrDate(dayOf(h.irDate));
      setIrDueDate(dayOf(h.irDueDate));
      setLines(json.data.lines.length
        ? json.data.lines.map((l) => ({
            key: `N${++lineSeq}`,
            itemCode: l.itemCode,
            name: l.itemName,
            unitID: l.unitID,
            costPrice: String(l.costPrice ?? ''),
            irQty: String(l.irQty ?? ''),
            // default the issued qty to what the requisition still owes
            issuedQty: String(Math.max(0, Number(l.irQty || 0) - Number(l.issuedQty || 0)) || ''),
          }))
        : [newLine()]);
      setDirty(true);
      showToast(`Requisition ${irNo} — ${json.data.lines.length} item(s) put on the note; locations filled in`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load the requisition', true);
    } finally {
      setReqLoading(false);
    }
  }

    async function openNote(row: FindRow) {
    try {
      const res = await fetch(
        `/api/inventory/issue/note/${encodeURIComponent(row.inNo)}?fromLoc=${encodeURIComponent(row.fromLocCode)}&toLoc=${encodeURIComponent(row.toLoc)}`,
        { cache: 'no-store' },
      );
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: {
          header: { inNo: string; fromLocCode: string; toLoc: string; inDate: string; irNo: string; irDate: string | null; irDueDate: string | null; remarks: string; confirmed: boolean };
          lines: { itemCode: string; itemName: string; unitID: string; costPrice: number; irQty: number; issuedQty: number }[];
        };
      };
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not open the issue note');
      const h = json.data.header;
      setIssueReq(h.irNo || '');
      setFromLoc(h.fromLocCode);
      setToLoc(h.toLoc);
      setInDate(dayOf(h.inDate));
      setIrDate(h.irDate ? dayOf(h.irDate) : '');
      setIrDueDate(h.irDueDate ? dayOf(h.irDueDate) : '');
      setRemarks(h.remarks || '');
      setInNo(h.inNo);
      setConfirmed(Boolean(h.confirmed));
      setLines(json.data.lines.length
        ? json.data.lines.map((l) => ({
            key: `N${++lineSeq}`,
            itemCode: l.itemCode,
            name: l.itemName,
            unitID: l.unitID,
            costPrice: String(l.costPrice ?? ''),
            irQty: String(l.irQty ?? ''),
            issuedQty: String(l.issuedQty ?? ''),
          }))
        : [newLine()]);
      setDirty(false);
      setLastResult('');
      setTab('details');
      showToast(`Issue Note ${h.inNo} loaded`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open the issue note', true);
    }
  }

    function payload() {
    return {
      irNo: issueReq,
      fromLocCode: fromLoc,
      toLoc,
      inDate,
      remarks,
      lines: lines
        .filter((l) => l.itemCode || l.name.trim())
        .map((l) => ({
          itemCode: l.itemCode || l.name.trim(),
          unitID: l.unitID,
          costPrice: l.costPrice === '' ? '' : Number(l.costPrice),
          irQty: l.irQty === '' ? 0 : Number(l.irQty),
          issuedQty: l.issuedQty === '' ? 0 : Number(l.issuedQty),
        })),
    };
  }

  async function handleSave(): Promise<boolean> {
    if (!issueReq) { showToast('Choose the Issue Requisition No first', true); return false; }
    if (!fromLoc || !toLoc) { showToast('Choose From and To locations first', true); return false; }
    if (fromLoc === toLoc) { showToast('From and To locations must be different', true); return false; }
    // the issue module works between MAIN locations only
    const fromIsMain = locations.find((l) => l.code === fromLoc)?.mainLoc;
    const toIsMain = locations.find((l) => l.code === toLoc)?.mainLoc;
    if (fromIsMain === false || toIsMain === false) { showToast('Issue notes run between main locations only', true); return false; }
    const body = payload();
    if (body.lines.length === 0) { showToast('Add at least one item line', true); return false; }
    if (body.lines.some((l) => !(Number(l.irQty) > 0))) { showToast('Enter IR QTY for each line', true); return false; }
    if (body.lines.some((l) => !(Number(l.issuedQty) > 0))) { showToast('Enter Issued QTY for each line', true); return false; }

    setSaving(true);
    try {
      const res = inNo
        ? await fetch(`/api/inventory/issue/note/${encodeURIComponent(inNo)}?fromLoc=${encodeURIComponent(fromLoc)}&toLoc=${encodeURIComponent(toLoc)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ irNo: body.irNo, inDate: body.inDate, remarks: body.remarks, lines: body.lines }),
          })
        : await fetch('/api/inventory/issue/note', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, confirm: false }),
          });
      const json = await res.json() as {
        success?: boolean; message?: string; hint?: string; data?: { inNo: string; netTotal: number };
      };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Save failed'));
      }
      if (json.data?.inNo) setInNo(json.data.inNo);
      setDirty(false);
      showToast(json.message || 'Saved ✓');
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', true);
      return false;
    } finally {
      setSaving(false);
    }
  }

    async function handleConfirm() {
    if (confirmed) { showToast('This issue note is already confirmed'); return; }
    setConfirming(true);
    try {
      /* Confirmation confirms what is on the screen: save first when needed. */
      if (dirty || !inNo) {
        const ok = await handleSave();
        if (!ok) return;
      }
      const number = inNo || '';
      if (!number) { showToast('Save the issue note before confirming it', true); return; }
      if (!confirm(`Confirm issue note ${number}?\nA confirmed note can no longer be edited or deleted.`)) return;

      const res = await fetch(`/api/inventory/issue/note/${encodeURIComponent(number)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromLocCode: fromLoc, toLoc }),
      });
      const json = await res.json() as { success?: boolean; message?: string; hint?: string };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Confirmation failed'));
      }
      setConfirmed(true);
      setLastResult(json.message || `Issue Note ${number} confirmed.`);
      showToast(json.message || 'Confirmed ✓');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Confirmation failed', true);
    } finally {
      setConfirming(false);
    }
  }

  async function handleDelete() {
    if (!inNo) { showToast('This issue note has not been saved yet'); return; }
    if (!confirm(`Delete issue note ${inNo}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/inventory/issue/note/${encodeURIComponent(inNo)}?fromLoc=${encodeURIComponent(fromLoc)}&toLoc=${encodeURIComponent(toLoc)}`,
        { method: 'DELETE' },
      );
      const json = await res.json() as { success?: boolean; message?: string; hint?: string };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Delete failed'));
      }
      showToast(json.message || 'Deleted');
      handleClear();
      if (tab === 'find') void loadList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setDeleting(false);
    }
  }

  function handleClear() {
    setLines([newLine()]);
    setRemarks('');
    setIssueReq('');
    setIrDate('');
    setIrDueDate('');
    setInNo('');
    setConfirmed(false);
    setDirty(false);
    setLastResult('');
  }

  function handleCancel() {
    if (dirty && !confirm('Discard the unsaved changes?')) return;
    handleClear();
    showToast('Cleared');
  }

  function handleNavigate(key: string, path: string) {
    if (dirty && !confirm('Leave the page without saving the issue note?')) return;
    router.push(path);
  }

    const printableLines = lines.filter((l) => l.itemCode || l.name.trim());

  function handlePrint() {
    if (printableLines.length === 0) { showToast('Add at least one item before printing', true); return; }
    setPrintAsk(true);
  }

  function startPrint(copy: PoPrintCopy) {
    setPrintAsk(false);
    setPrintJob({ copy, at: new Date(), nonce: ++printNonce.current });
  }

  useEffect(() => {
    if (!printJob) return;
    const id = window.setTimeout(() => window.print(), 60);
    return () => window.clearTimeout(id);
  }, [printJob]);


  const busy = saving || deleting || confirming;
  const locked = confirmed; // a confirmed note is read-only

  const printData = (() => {
    const copy = printJob?.copy ?? 'standard';
    const cols = poPrintValueColumns(copy);
    const fromLocObj = locations.find((l) => l.code === fromLoc);
    const toLocObj = locations.find((l) => l.code === toLoc);
    const at = printJob?.at ?? new Date();
    return {
      copy,
      cols,
      colCount: cols.costPrice ? 6 : 4,
      companyName: (company.name || 'SAYO BEAUTY').trim(),
      companyAddress: (company.address || fromLocObj?.address || '').trim(),
      companyPhone: (company.phone || '').trim(),
      branch: (fromLocObj?.des || '').trim(),
      fromCode: fromLocObj?.code || fromLoc,
      fromName: fromLocObj?.des || fromLoc,
      toCode: toLocObj?.code || toLoc,
      toName: toLocObj?.des || toLoc,
      docNo: inNo || '(not saved)',
      docDate: poPrintDate(inDate),
      dueDate: irDueDate ? poPrintDate(irDueDate) : undefined,
      issueRef: issueReq,
      printDate: poPrintClock(at).date,
      printTime: poPrintClock(at).time,
      user: actor,
      rows: poPrintRows(printableLines.map((l) => ({
        itemCode: l.itemCode,
        name: l.name,
        unitID: l.unitID,
        unitName: unitName(l.unitID),
        costPrice: Number(l.costPrice) || 0,
        poQty: Number(l.issuedQty) || 0,
      }))),
      total: poPrintTotal(printableLines.map((l) => ({
        itemCode: l.itemCode, name: l.name, unitID: l.unitID,
        costPrice: Number(l.costPrice) || 0, poQty: Number(l.issuedQty) || 0,
      }))),
      remarks: (remarks || '').trim(),
    };
  })();

    return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      <style>{TRANSFER_PRINT_CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-iss-note" onNav={handleNavigate} onLogout={() => router.push('/admin-login')} /></div>

        <div className="po-main">
          <header className="po-head no-print">
            <h1>ISSUE NOTE</h1>
            <div className="po-tabs">
              <button className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>Find</button>
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
            </div>
            <div className="po-state">
              {inNo ? <span className="chip">{inNo}</span> : <span className="chip dim">not saved yet</span>}
              {inNo && (confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>)}
              {dirty && <span className="chip dim">unsaved changes</span>}
            </div>
          </header>

          {lookupNote && <div className="po-note no-print" title={lookupNote}>{lookupNote}</div>}
          {Object.keys(lookupErrors).length > 0 && (
            <div className="po-error">
              <strong>Locations / units could not all be read from the database.</strong>
              <ul>
                {Object.entries(lookupErrors).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
              </ul>
            </div>
          )}

          {}
          {tab === 'find' && (
            <div className="po-card no-print">
              <div className="po-find">
                <label>Find Criteria</label>
                <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder="IN or requisition number" />
                <label className="rad">
                  <input type="radio" checked={findStatus === 'confirmed'} onChange={() => setFindStatus('confirmed')} /> Confirmed Issue Note
                </label>
                <label className="rad">
                  <input type="radio" checked={findStatus === 'pending'} onChange={() => setFindStatus('pending')} /> Pending Issue Note
                </label>
                <label className="rad">
                  <input type="radio" checked={findStatus === 'all'} onChange={() => setFindStatus('all')} /> All
                </label>
                <button className="btn" onClick={() => void loadList()} disabled={listBusy}>
                  {listBusy ? 'Loading…' : 'Find'}
                </button>
              </div>

              <div className="po-list-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th>Issue No</th><th>IN Date</th><th>From Location</th><th>To Location</th>
                      <th>Requisition</th><th className="num">Net Total</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr><td colSpan={8} className="empty">{listBusy ? 'Loading…' : 'No issue notes matched'}</td></tr>
                    )}
                    {list.map((row) => (
                      <tr key={`${row.fromLocCode}|${row.toLoc}|${row.inNo}`}>
                        <td className="mono">{row.inNo}</td>
                        <td>{row.inDate}</td>
                        <td>{row.fromLocDes || row.fromLocCode}</td>
                        <td>{row.toLocDes || row.toLoc}</td>
                        <td className="mono">{row.irNo || '—'}</td>
                        <td className="num">{money(row.netTotal)}</td>
                        <td>{row.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>}</td>
                        <td>
                          <button className="btn small" onClick={() => void openNote(row)}>
                            {dirty ? 'Open (discard)' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {}
          {tab === 'details' && (
            <div className="po-card">
              <div className="po-form no-print">
                <label>Issue Requisition No</label>
                <select
                  value={issueReq}
                  disabled={locked}
                  onChange={(e) => void loadFromRequisition(e.target.value)}
                >
                  <option value="">— choose —</option>
                  {issueReq && !reqOptions.some((r) => r.irNo === issueReq) && (
                    <option value={issueReq}>{issueReq} — the requisition on this note</option>
                  )}
                  {reqOptions.map((r) => (
                    <option key={`${r.fromLocCode}|${r.toLoc}|${r.irNo}`} value={r.irNo}>
                      {r.irNo} — {r.fromLocDes || r.fromLocCode} → {r.toLocDes || r.toLoc}
                    </option>
                  ))}
                </select>

                <label>Issue No</label>
                <input value={inNo} readOnly placeholder="issued on save" />

                <label>IR Date</label>
                <input value={irDate} readOnly placeholder="from the requisition" />

                <label>IR Due Date</label>
                <input value={irDueDate} readOnly placeholder="from the requisition" />

                <label>From Location</label>
                <select
                  value={fromLoc}
                  disabled={locked || !!inNo}
                  title={inNo ? 'Locations are part of the note’s key — Clear to start a new one' : undefined}
                  onChange={(e) => { setFromLoc(e.target.value); setDirty(true); }}
                >
                  <option value="">— choose —</option>
                  {locations.filter((l) => l.mainLoc).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.des} ({l.code}){l.enable ? '' : ' (Inactive)'}
                    </option>
                  ))}
                  {fromLoc && !locations.some((l) => l.code === fromLoc && l.mainLoc) && (
                    <option key={fromLoc} value={fromLoc}>
                      {locations.find((l) => l.code === fromLoc)?.des || 'saved location'} ({fromLoc})
                    </option>
                  )}
                </select>

                <label>To Location</label>
                <select
                  value={toLoc}
                  disabled={locked || !!inNo}
                  title={inNo ? 'Locations are part of the note’s key — Clear to start a new one' : undefined}
                  onChange={(e) => { setToLoc(e.target.value); setDirty(true); }}
                >
                  <option value="">— choose —</option>
                  {locations.filter((l) => l.mainLoc).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.des} ({l.code}){l.enable ? '' : ' (Inactive)'}
                    </option>
                  ))}
                  {toLoc && !locations.some((l) => l.code === toLoc && l.mainLoc) && (
                    <option key={toLoc} value={toLoc}>
                      {locations.find((l) => l.code === toLoc)?.des || 'saved location'} ({toLoc})
                    </option>
                  )}
                </select>

                <label>IN Date</label>
                <input type="date" value={inDate} disabled={locked} onChange={(e) => { setInDate(e.target.value); setDirty(true); }} />
              </div>

              {reqLoading && <div className="po-note no-print">Loading the requisition…</div>}

              <div className="po-grid-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th style={{ width: 260 }}>Item Code / Item Name</th>
                      <th style={{ width: 110 }}>Unit</th>
                      <th style={{ width: 110 }} className="num">Cost Price</th>
                      <th style={{ width: 100 }} className="num">IR QTY</th>
                      <th style={{ width: 130 }} className="num">Issued QTY</th>
                      <th style={{ width: 120 }} className="num">Item Value</th>
                      <th className="no-print" style={{ width: 42 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={line.key}>
                        <td className="num">{i + 1}</td>
                        <td>
                          <ItemSuggestInput
                            locCode={fromLoc}
                            value={line.name}
                            disabled={locked}
                            onText={(text) => patchLine(line.key, { name: text, itemCode: '' })}
                            onPick={(item) => pickItem(line.key, item)}
                          />
                          {line.itemCode && <div className="code-hint">{line.itemCode}</div>}
                        </td>
                        <td>
                          <select
                            value={line.unitID}
                            disabled={locked}
                            title={line.unitID ? `${unitName(line.unitID) || line.unitID} (${line.unitID})` : 'Unit'}
                            onChange={(e) => patchLine(line.key, { unitID: e.target.value })}
                          >
                            <option value="">— unit —</option>
                            {line.unitID && !units.some((u) => u.id === line.unitID) && (
                              <option value={line.unitID}>{line.unitID} — not in unit master</option>
                            )}
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.des || u.id}{u.enable ? '' : ' (Inactive)'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number" min="0" step="0.01" className="num"
                            value={line.costPrice} disabled={locked}
                            placeholder="master"
                            onChange={(e) => patchLine(line.key, { costPrice: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="number" min="0" step="0.001" className="num"
                            value={line.irQty} disabled={locked}
                            onChange={(e) => patchLine(line.key, { irQty: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="number" min="0" step="0.001" className="num"
                            value={line.issuedQty} disabled={locked}
                            onChange={(e) => patchLine(line.key, { issuedQty: e.target.value })}
                          />
                        </td>
                        <td className="num">{money(lineValue(line.costPrice, line.issuedQty))}</td>
                        <td className="no-print">
                          <button className="x" title="Remove line" disabled={locked} onClick={() => removeLine(line.key)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="po-form no-print">
                <label>Remarks</label>
                <input value={remarks} disabled={locked} onChange={(e) => { setRemarks(e.target.value); setDirty(true); }} />
                <label>Net Value</label>
                <input value={money(netValue)} readOnly className="num strong" />
              </div>

              <div className="po-actions no-print">
                <button className="btn" onClick={addLine} disabled={locked}>+ Add line</button>
                <button className="btn" onClick={handleClear} disabled={busy}>Clear</button>
                <button className="btn" onClick={() => void handleConfirm()} disabled={busy || confirmed}>
                  {confirming ? 'Confirming…' : 'Confirmation'}
                </button>
                <button className="btn" onClick={handlePrint} disabled={busy}>Print</button>
                <button className="btn danger" onClick={() => void handleDelete()} disabled={busy || !inNo || confirmed}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button className="btn primary" onClick={() => void handleSave()} disabled={busy || locked}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn" onClick={handleCancel} disabled={busy}>Cancel</button>
              </div>

              {lastResult && <div className="po-ok no-print">{lastResult}</div>}
            </div>
          )}
        </div>
      </div>

      {}
      {printAsk && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Print issue note">
          <div className="ask-card">
            <h2>Print Issue Note</h2>
            <p>
              {inNo ? <><span className="mono">{inNo}</span> — </> : null}
              which copy do you want to print?
            </p>
            <div className="ask-choices">
              {TRANSFER_PRINT_COPY_CHOICES.map((choice) => (
                <button key={choice.id} className="ask-choice" onClick={() => startPrint(choice.id)}>
                  <span className="ask-choice-title">{choice.label}</span>
                  <span className="ask-choice-hint">{choice.hint}</span>
                </button>
              ))}
            </div>
            <div className="ask-foot">
              <button className="btn" onClick={() => setPrintAsk(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}


      {}
      {printJob && (
        <div aria-hidden="true">
          <TransferPrintSheet
            title="Issue Note"
            copy={printData.copy}
            copyLabel={poPrintCopyLabel(printData.copy)}
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
            issueRef={printData.issueRef}
            printDate={printData.printDate}
            printTime={printData.printTime}
            user={printData.user}
            rows={printData.rows}
            total={printData.total}
            remarks={printData.remarks}
          />
        </div>
      )}
    </>
  );
}

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root { color-scheme:light; }
  html, body {
    height:100%; font-family:'Inter',sans-serif;
    color:#1f2937; background:#c2d4d4; color-scheme:light;
  }
  input, select, textarea, option, datalist { color:#1f2937; background-color:#fff; }
  input::placeholder, textarea::placeholder { color:#9ca3af; }
  input:disabled, select:disabled, textarea:disabled {
    background-color:#eef2f2; color:#7b8f92; -webkit-text-fill-color:#7b8f92;
  }

  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(16px);} to{opacity:1;transform:translateX(-50%) translateY(0);} }
  .toast {
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    background:#1e3a40; color:#fff; padding:11px 26px; border-radius:10px;
    font-size:13px; font-weight:600; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.28);
    animation:toastIn 0.22s ease; max-width:80vw; text-align:center;
  }
  .toast.err { background:#dc2626; }

  .po-shell { display:flex; height:100vh; overflow:hidden; background:#c2d4d4; }
  .po-main { flex:1; min-width:0; display:flex; flex-direction:column; overflow:auto; padding:14px 16px 26px; gap:12px; }

  .po-head { background:#dae6e6; border:1px solid rgba(0,0,0,0.07); border-radius:12px; padding:12px 14px; display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; }
  .po-head h1 { font-size:17px; letter-spacing:0.06em; color:#16333a; font-weight:800; }
  .po-tabs { display:flex; gap:6px; margin-left:auto; }
  .po-tabs button {
    border:1px solid rgba(30,58,64,0.22); background:#eef4f4; color:#1e3a40; border-radius:8px;
    padding:7px 14px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit;
  }
  .po-tabs button.on { background:#1e3a40; border-color:#1e3a40; color:#fff; }
  .po-state { display:flex; gap:6px; align-items:center; }

  .chip { font-size:10.5px; font-weight:700; padding:3px 8px; border-radius:999px; background:rgba(30,58,64,0.10); color:#1e3a40; }
  .chip.ok { background:#dcfce7; color:#15803d; }
  .chip.warn { background:#fef3c7; color:#b45309; }
  .chip.dim { background:rgba(30,58,64,0.06); color:#64748b; font-weight:600; }

  .po-note { font-size:11.5px; font-weight:600; color:#1e3a40; background:#e8f1f1; border-radius:8px; padding:7px 11px; }
  .po-error { font-size:12px; color:#b91c1c; background:#fee2e2; border:1px solid #fecaca; border-radius:10px; padding:9px 12px; }
  .po-error ul { margin:6px 0 0 16px; }
  .po-ok { font-size:12px; font-weight:600; color:#15803d; background:#dcfce7; border-radius:8px; padding:8px 12px; }

  .po-card { background:#eef4f4; border:1px solid rgba(0,0,0,0.06); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:12px; }

  .po-form { display:grid; grid-template-columns:120px minmax(160px,1fr) 110px minmax(140px,1fr); gap:9px 12px; align-items:center; }
  .po-form label { font-size:11.5px; font-weight:700; color:#3c5a60; text-transform:uppercase; letter-spacing:0.03em; }
  .po-form input, .po-form select {
    height:32px; border:1px solid rgba(30,58,64,0.18); border-radius:7px; background:#fff;
    padding:0 9px; font-size:12.5px; font-family:inherit; color:#1f2937; width:100%; color-scheme:light;
  }
  .po-form input:disabled, .po-form select:disabled { background:#e5ebeb; color:#7b8f92; }
  .po-form input.num.strong { font-weight:800; color:#16333a; }

  .po-find { display:flex; flex-wrap:wrap; align-items:center; gap:9px 12px; }
  .po-find label { font-size:11.5px; font-weight:700; color:#3c5a60; text-transform:uppercase; letter-spacing:0.03em; }
  .po-find input[type=text], .po-find input:not([type]) { height:32px; border:1px solid rgba(30,58,64,0.18); border-radius:7px; padding:0 9px; font-size:12.5px; font-family:inherit; min-width:220px; }
  .po-find .rad { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; text-transform:none; color:#1f2937; }
  .hint { font-size:11.5px; color:#64748b; }

  .po-grid-wrap, .po-list-wrap { border:1px solid rgba(0,0,0,0.08); border-radius:10px; overflow:auto; background:#fff; max-height:52vh; }
  .po-list-wrap { max-height:60vh; }

  .po-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .po-table thead th {
    position:sticky; top:0; background:#dfe9e9; color:#234a52; text-align:left; font-size:11px;
    text-transform:uppercase; letter-spacing:0.04em; padding:8px 9px; border-bottom:1px solid rgba(0,0,0,0.08); z-index:1;
  }
  .po-table td { padding:5px 9px; border-bottom:1px solid rgba(0,0,0,0.05); vertical-align:middle; color:#1f2937; background:#fff; }
  .po-table tr:nth-child(even) td { background:#f6fafa; }
  .po-table td.num, .po-table th.num { text-align:right; }
  .po-table td.empty { text-align:center; color:#8595a0; padding:22px; font-size:12.5px; }
  .po-table input, .po-table select { width:100%; height:28px; border:1px solid rgba(30,58,64,0.16); border-radius:6px; padding:0 7px; font-size:12px; font-family:inherit; color:#1f2937; background-color:#fff; color-scheme:light; }
  .po-table input.num { text-align:right; }
  .po-table input:disabled, .po-table select:disabled { background:#eef2f2; color:#7b8f92; }
  .mono { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11.5px; font-weight:700; color:#1e3a40; }
  .code-hint { font-size:10px; color:#8595a0; margin-top:2px; font-family:ui-monospace, Menlo, monospace; }
  .strong { font-weight:800; color:#16333a; }

  .po-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .btn {
    border:1px solid rgba(30,58,64,0.22); background:#fff; color:#1e3a40; border-radius:8px;
    padding:8px 14px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit;
  }
  .btn:hover:not(:disabled) { background:#e9f1f1; }
  .btn:disabled { opacity:0.55; cursor:not-allowed; }
  .btn.primary { background:#1e3a40; border-color:#1e3a40; color:#fff; }
  .btn.primary:hover:not(:disabled) { background:#16333a; }
  .btn.danger { border-color:#f3c7c7; color:#b91c1c; }
  .btn.danger:hover:not(:disabled) { background:#fee2e2; }
  .btn.small { padding:5px 10px; font-size:11.5px; }
  .x { border:none; background:transparent; color:#b91c1c; font-size:14px; cursor:pointer; line-height:1; padding:4px 6px; border-radius:6px; }
  .x:hover:not(:disabled) { background:#fee2e2; }
  .x:disabled { opacity:0.4; cursor:not-allowed; }

  /* ── "which copy?" dialog ───────────────────────────────────────────────── */
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

  /* ── the e-mail dialog ─────────────────────────────────────────────────── */
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
