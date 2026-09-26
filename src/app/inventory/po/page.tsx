'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import ItemSuggestInput, { type SuggestedItem } from '@/components/ItemSuggestInput';
import PoPrintSheet, { PO_PRINT_CSS } from '@/components/PoPrintSheet';
import {
  groupRequirementsSupplierWise,
  requirementLines,
  supplierForSelection,
  suppliersOf,
  type RequirementGroup,
  type StockRequirement,
} from '@/lib/poRequirements';
import {
  PO_PRINT_COPY_CHOICES,
  poPrintClock,
  poPrintColumnCount,
  poPrintCopyLabel,
  poPrintDate,
  poPrintRows,
  poPrintTotal,
  poPrintValueColumns,
  type PoPrintCopy,
} from '@/lib/poPrint';

interface LookupLocation { code: string; des: string; address: string; enable: boolean }
interface LookupSupplier {
  supID: string; name: string; contact: string;
  /** the raw Emails column, exactly as the database holds it */
  emails: string;
  /** the first address on that column that is really an address */
  email: string;
  enable: boolean;
}
interface LookupUnit { id: string; des: string; enable: boolean }
interface LookupCompany { name: string; address: string; phone: string }

interface PoLine {
  key: string;
  itemCode: string;
  name: string;
  unitID: string;
  costPrice: string;
  poQty: string;
  receivedQty: number;
  openQty: number;
  grnNos: string;
}

interface PoListRow {
  poNo: string; locCode: string; locDes: string; poDate: string; dueDate: string;
  supID: string; supName: string; netTotal: number; confirmed: boolean;
  userID: string; remarks: string; lineCount: number; received: boolean;
}

/* the requirements tab speaks the shared vocabulary — the grouping, the
   single-supplier rule and the "ticked rows become the order lines" mapping all
   live in src/lib/poRequirements.ts so they can be tested on their own */
type Requirement = StockRequirement;

let lineSeq = 0;
const newLine = (): PoLine => ({
  key: `L${++lineSeq}`, itemCode: '', name: '', unitID: '', costPrice: '', poQty: '',
  receivedQty: 0, openQty: 0, grnNos: '',
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

export default function PurchaseOrderPage() {
  const router = useRouter();
  const { toast, show: showToast } = useToast();

  const [tab, setTab] = useState<'find' | 'details' | 'req'>('details');

  /* dropdown data — straight from the database */
  const [locations, setLocations] = useState<LookupLocation[]>([]);
  const [suppliers, setSuppliers] = useState<LookupSupplier[]>([]);
  const [units, setUnits] = useState<LookupUnit[]>([]);
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const [lookupNote, setLookupNote] = useState('Loading locations and suppliers…');
  const [lookupsReady, setLookupsReady] = useState(false);
  /* the letterhead of the printed sheet (falls back to the branch, then SAYO) */
  const [company, setCompany] = useState<LookupCompany>({ name: '', address: '', phone: '' });

  /* printing — the legacy screen offered two copies, so the Print button asks */
  const [printAsk, setPrintAsk] = useState(false);
  const [printJob, setPrintJob] = useState<{ copy: PoPrintCopy; at: Date; nonce: number } | null>(null);
  const printNonce = useRef(0);
  /* who is signed in — printed as "User" like the legacy sheet */
  const [actor, setActor] = useState('');

  /* emailing the sheet to the supplier (the PDF is built by the server) */
  const [mailAsk, setMailAsk] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailCopy, setMailCopy] = useState<PoPrintCopy>('supplier');
  const [mailSubject, setMailSubject] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [sending, setSending] = useState(false);

  /* the document */
  const [locCode, setLocCode] = useState('');
  const [supID, setSupID] = useState('');
  const [poDate, setPoDate] = useState(dayOf(new Date().toISOString()));
  const [dueDate, setDueDate] = useState(dayOf(new Date().toISOString()));
  const [deliAdd, setDeliAdd] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<PoLine[]>([newLine()]);
  const [poNo, setPoNo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState('');

  /* find tab */
  const [findQ, setFindQ] = useState('');
  const [findStatus, setFindStatus] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [list, setList] = useState<PoListRow[]>([]);
  const [listBusy, setListBusy] = useState(false);

  /* requirements tab */
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqErr, setReqErr] = useState('');
  /* which requirement rows are ticked (keyed by ItemCode) — ticks are the only
     thing that decides what goes on the order */
  const [picked, setPicked] = useState<Record<string, boolean>>({});

    useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/inventory/lookups', { cache: 'no-store' });
        const json = await res.json() as {
          success?: boolean; locations?: LookupLocation[]; suppliers?: LookupSupplier[];
          units?: LookupUnit[]; company?: LookupCompany;
          errors?: Record<string, string>; message?: string;
        };
        if (!active) return;
        if (!res.ok || !json?.success) throw new Error(json?.message || `HTTP ${res.status}`);
        const locs = json.locations ?? [];
        const sups = json.suppliers ?? [];
        setLocations(locs);
        setSuppliers(sups);
        setUnits(json.units ?? []);
        if (json.company?.name) setCompany(json.company);
        setLookupErrors(json.errors ?? {});
        setLookupsReady(true);
        setLookupNote(`${locs.length} location(s) · ${sups.length} supplier(s) loaded`);
        setLocCode((prev) => prev || locs[0]?.code || '');
        setSupID((prev) => prev || sups[0]?.supID || '');
      } catch (err) {
        if (!active) return;
        setLookupsReady(true);
        setLookupNote('');
        setLookupErrors({ all: err instanceof Error ? err.message : 'Could not load the lists' });
        showToast('Could not load locations / suppliers from the database', true);
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

    const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const params = new URLSearchParams({ status: findStatus });
      if (findQ.trim()) params.set('q', findQ.trim());
      const res = await fetch(`/api/inventory/po?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: PoListRow[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the orders');
      setList(json.data ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load the orders', true);
      setList([]);
    } finally {
      setListBusy(false);
    }
  }, [findQ, findStatus, showToast]);

  useEffect(() => { if (tab === 'find') void loadList(); }, [tab, loadList]);

    const loadReqs = useCallback(async () => {
    if (!locCode) return;
    setReqBusy(true);
    setReqErr('');
    try {
      const res = await fetch(`/api/inventory/stock-requirements?locCode=${encodeURIComponent(locCode)}`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: Requirement[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load stock requirements');
      setReqs(json.data ?? []);
      setPicked({}); // a fresh list means fresh ticks
    } catch (err) {
      setReqErr(err instanceof Error ? err.message : 'Could not load stock requirements');
      setReqs([]);
      setPicked({});
    } finally {
      setReqBusy(false);
    }
  }, [locCode, showToast]);

  useEffect(() => { if (tab === 'req') void loadReqs(); }, [tab, loadReqs]);

    function patchLine(key: string, patch: Partial<PoLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function pickItem(key: string, item: SuggestedItem) {
    const unit = item.masterUnitID || units.find((u) => u.id === item.masterUnitID)?.id || '';
    patchLine(key, {
      itemCode: item.code,
      name: item.des,
      unitID: unit,
      costPrice: item.costPrice ? String(item.costPrice) : '',
      poQty: lines.find((l) => l.key === key)?.poQty || '1',
    });
  }

  function addLine(fill?: Partial<PoLine>) {
    setLines((prev) => [...prev, { ...newLine(), ...fill }]);
    setDirty(true);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? [newLine()] : prev.filter((l) => l.key !== key)));
    setDirty(true);
  }

    const netValue = useMemo(
    () => lines.reduce((sum, l) => sum + lineValue(l.costPrice, l.poQty), 0),
    [lines],
  );

    /* tbl_unitmaster holds the unit NAME (UnitDes) next to the code
     (MasterUnitID). The screen shows the name; tbl_podetails keeps the code,
     exactly like the legacy screen did. */
  const unitName = useCallback(
    (id: string) => units.find((u) => u.id === id)?.des || '',
    [units],
  );

    /* One block per supplier (the supplier the item master points at), each
     block keeping the order the API returned: worst shortage first. */
  const reqGroups = useMemo<RequirementGroup[]>(
    () => groupRequirementsSupplierWise(reqs),
    [reqs],
  );

  const pickedRows = useMemo(() => reqs.filter((r) => picked[r.itemCode]), [reqs, picked]);
  const allPicked = reqs.length > 0 && pickedRows.length === reqs.length;

  function togglePick(itemCode: string) {
    setPicked((prev) => ({ ...prev, [itemCode]: !prev[itemCode] }));
  }

  function toggleGroup(group: RequirementGroup, on: boolean) {
    setPicked((prev) => {
      const next = { ...prev };
      for (const r of group.rows) next[r.itemCode] = on;
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setPicked(on ? Object.fromEntries(reqs.map((r) => [r.itemCode, true])) : {});
  }

    /* The order grid is REPLACED by the ticked items: what you selected in
     Current Stock Requirements is what the purchase order shows. The Location
     is the one the requirements were read for, the Supplier is the one the
     ticked items belong to — both fill themselves in. */
  function addRequirementsToPo(rows: Requirement[]) {
    if (rows.length === 0) { showToast('Tick the items you want on the order first', true); return; }
    if (!locCode) { showToast('Choose a location on this tab first', true); return; }
    if (confirmed) {
      showToast(`${poNo || 'This order'} is already confirmed — press Clear to start a new order, then add these items`, true);
      return;
    }

    /* A purchase order is addressed to ONE supplier. Ticking items from two
       suppliers cannot auto-fill the header, so it is reported instead of
       quietly picking one of them. */
    const supplier = supplierForSelection(rows);
    if (supplier === null) {
      showToast(
        `The ticked items come from ${suppliersOf(rows).length} suppliers — one purchase order is for one supplier. Tick items from a single supplier (or use the tick box on the supplier's row heading).`,
        true,
      );
      return;
    }

    const typed = lines.filter((l) => l.itemCode || l.name.trim());
    if (typed.length > 0 || poNo) {
      const what = [
        typed.length > 0 ? `replace the ${typed.length} line(s) on the form` : '',
        poNo ? `overwrite saved order ${poNo}` : '',
      ].filter(Boolean).join(' and ');
      if (!confirm(`Adding the ${rows.length} selected item(s) will ${what}. Continue?`)) return;
    }

    /* the order grid becomes EXACTLY the ticked rows (suggested quantity, and
       the master cost price as an editable starting point) */
    setLines(requirementLines(rows).map((line) => ({ ...newLine(), ...line })));
    if (supplier) setSupID(supplier);
    setPicked({});
    setDirty(true);
    setTab('details');

    const supLabel = supplier ? (rows[0].supName || supplier) : '';
    showToast(supLabel
      ? `${rows.length} item(s) put on the order — supplier ${supLabel} and location ${locCode} filled in`
      : `${rows.length} item(s) put on the order — these items carry no supplier, choose one on the form`);
  }

    async function openOrder(row: PoListRow) {
    try {
      const res = await fetch(
        `/api/inventory/po/${encodeURIComponent(row.poNo)}?locCode=${encodeURIComponent(row.locCode)}`,
        { cache: 'no-store' },
      );
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: {
          poNo: string; locCode: string; supID: string; poDate: string; dueDate: string;
          deliAdd: string; remarks: string; confirmed: boolean;
          lines: { itemCode: string; itemName: string; unitID: string; costPrice: number; poQty: number;
                   receivedQty: number; openQty: number; grnNos: string }[];
        };
      };
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not open the order');
      const d = json.data;
      setLocCode(d.locCode);
      setSupID(d.supID);
      setPoDate(dayOf(d.poDate));
      setDueDate(dayOf(d.dueDate));
      setDeliAdd(d.deliAdd);
      setRemarks(d.remarks);
      setPoNo(d.poNo);
      setConfirmed(Boolean(d.confirmed));
      setLines(d.lines.map((l) => ({
        key: `L${++lineSeq}`,
        itemCode: l.itemCode,
        name: l.itemName,
        unitID: l.unitID,
        costPrice: String(l.costPrice ?? ''),
        poQty: String(l.poQty ?? ''),
        receivedQty: Number(l.receivedQty || 0),
        openQty: Number(l.openQty || 0),
        grnNos: l.grnNos || '',
      })));
      setDirty(false);
      setLastResult('');
      setTab('details');
      showToast(`Purchase order ${d.poNo} loaded`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open the order', true);
    }
  }

    function payload() {
    return {
      locCode,
      supID,
      poDate,
      dueDate,
      deliAdd,
      remarks,
      lines: lines
        .filter((l) => l.itemCode || l.name.trim())
        .map((l) => ({
          itemCode: l.itemCode || l.name.trim(),
          unitID: l.unitID,
          costPrice: l.costPrice === '' ? '' : Number(l.costPrice),
          poQty: l.poQty === '' ? 0 : Number(l.poQty),
        })),
    };
  }

  async function handleSave(): Promise<boolean> {
    if (!locCode) { showToast('Choose a location first', true); return false; }
    if (!supID) { showToast('Choose a supplier first', true); return false; }
    const body = payload();
    if (body.lines.length === 0) { showToast('Add at least one item line', true); return false; }

    setSaving(true);
    try {
      const res = poNo
        ? await fetch(`/api/inventory/po/${encodeURIComponent(poNo)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          })
        : await fetch('/api/inventory/po', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, confirm: false }),
          });
      const json = await res.json() as {
        success?: boolean; message?: string; hint?: string;
        data?: { poNo: string; netTotal: number };
      };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Save failed'));
      }
      if (json.data?.poNo) setPoNo(json.data.poNo);
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
    if (confirmed) { showToast('This order is already confirmed'); return; }
    setConfirming(true);
    try {
      /* Confirmation confirms what is on the screen: save first when needed. */
      if (dirty || !poNo) {
        const ok = await handleSave();
        if (!ok) return;
      }
      const number = poNo || '';
      if (!number) { showToast('Save the order before confirming it', true); return; }
      if (!confirm(`Confirm purchase order ${number}?\nA confirmed order can no longer be edited or deleted.`)) return;

      const res = await fetch(`/api/inventory/po/${encodeURIComponent(number)}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locCode }),
      });
      const json = await res.json() as { success?: boolean; message?: string; hint?: string };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Confirmation failed'));
      }
      setConfirmed(true);
      setLastResult(json.message || `Purchase order ${number} confirmed.`);
      showToast(json.message || 'Confirmed ✓');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Confirmation failed', true);
    } finally {
      setConfirming(false);
    }
  }

  async function handleDelete() {
    if (!poNo) { showToast('This order has not been saved yet'); return; }
    if (!confirm(`Delete purchase order ${poNo}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/inventory/po/${encodeURIComponent(poNo)}?locCode=${encodeURIComponent(locCode)}`,
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
    setDeliAdd('');
    setPoNo('');
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
    if (dirty && !confirm('Leave the page without saving the order?')) return;
    router.push(path);
  }

    /* The Print button does not print straight away: the legacy screen printed
     two different sheets, so the operator is asked which copy is wanted.
       Standard Copy — code · name · unit · qty · cost price · value · Total
       Supplier Copy — code · name · unit · qty  (no money at all)            */
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

    /* The same sheet the Print button makes is attached as a PDF — the server
     draws it from the saved order, so the file is the order in the database,
     not whatever is on the screen at that moment. */
  const supplierEmail = (suppliers.find((s) => s.supID === supID)?.email || '').trim();

  function openMailDialog() {
    if (printableLines.length === 0) { showToast('Add at least one item before emailing', true); return; }
    if (!supID) { showToast('Choose the supplier first — the order is emailed to them', true); return; }
    if (!poNo) { showToast('Save the order first (Save), then it can be emailed', true); return; }
    setMailTo((prev) => prev || supplierEmail);
    setMailSubject((prev) => prev || `Purchase Order ${poNo}`);
    setMailCopy((prev) => prev || 'supplier');
    setMailAsk(true);
  }

  async function sendMail() {
    const to = mailTo.trim();
    if (!to) { showToast('Type the address to send the order to', true); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/inventory/po/${encodeURIComponent(poNo)}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locCode,
          copy: mailCopy,
          to,
          subject: mailSubject.trim(),
          message: mailMessage.trim(),
        }),
      });
      const json = await res.json() as {
        success?: boolean; message?: string; ignored?: string[]; data?: { to: string; fileName: string };
      };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'The order could not be emailed');
      setMailAsk(false);
      showToast(json.message || 'Emailed ✓');
      if (json.ignored?.length) {
        showToast(`Sent — but “${json.ignored.join(', ')}” on the supplier record is not an e-mail address and was left out`, true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The order could not be emailed', true);
    } finally {
      setSending(false);
    }
  }

  const busy = saving || deleting || confirming;
  const locked = confirmed; // a confirmed order is read-only

  /* the lines the sheet prints — the ones that carry an item */
  const printableLines = lines.filter((l) => l.itemCode || l.name.trim());

  /* everything the printed sheet needs, in one place (plain work — the sheet is
     only mounted while a print job exists, and the wall-clock time is frozen in
     the job so a re-render can never change what is about to be printed) */
  const printData = (() => {
    const copy = printJob?.copy ?? 'standard';
    const cols = poPrintValueColumns(copy);
    const location = locations.find((l) => l.code === locCode);
    const supplier = suppliers.find((s) => s.supID === supID);
    const at = printJob?.at ?? new Date();
    return {
      copy,
      cols,
      colCount: poPrintColumnCount(copy),
      companyName: (company.name || 'SAYO BEAUTY').trim(),
      companyAddress: (company.address || location?.address || '').trim(),
      companyPhone: (company.phone || '').trim(),
      branch: (location?.des || '').trim(),
      supplierCode: (supplier?.supID || supID || '').trim(),
      supplierName: (supplier?.name || '').trim(),
      supplierContact: (supplier?.contact || '').trim(),
      /* supplier address: the local copy already carries it, so the sheet
         prints the Delivery Address line when it has one */
      supplierAddress: (deliAdd || '').trim(),
      poNo: poNo || '(not saved)',
      poDate: poPrintDate(poDate),
      dueDate: poPrintDate(dueDate),
      printDate: poPrintClock(at).date,
      printTime: poPrintClock(at).time,
      user: actor,
      rows: poPrintRows(printableLines.map((l) => ({
        itemCode: l.itemCode,
        name: l.name,
        unitID: l.unitID,
        unitName: unitName(l.unitID),
        costPrice: Number(l.costPrice) || 0,
        poQty: Number(l.poQty) || 0,
      }))),
      total: poPrintTotal(printableLines.map((l) => ({
        itemCode: l.itemCode, name: l.name, unitID: l.unitID,
        costPrice: Number(l.costPrice) || 0, poQty: Number(l.poQty) || 0,
      }))),
      deliAdd: (deliAdd || '').trim(),
      remarks: (remarks || '').trim(),
    };
  })();

    return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      <style>{PO_PRINT_CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-po" onNav={handleNavigate} onLogout={() => router.push('/admin-login')} /></div>

        <div className="po-main">
          <header className="po-head no-print">
            <h1>PURCHASE ORDER</h1>
            <div className="po-tabs">
              <button className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>Find</button>
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
              <button className={tab === 'req' ? 'on' : ''} onClick={() => setTab('req')}>Current Stock Requirements</button>
            </div>
            <div className="po-state">
              {poNo ? <span className="chip">{poNo}</span> : <span className="chip dim">not saved yet</span>}
              {poNo && (confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>)}
              {dirty && <span className="chip dim">unsaved changes</span>}
            </div>
          </header>

          {lookupNote && <div className="po-note no-print" title={lookupNote}>{lookupNote}</div>}
          {Object.keys(lookupErrors).length > 0 && (
            <div className="po-error">
              <strong>Locations / suppliers could not all be read from the database.</strong>
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
                <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder="PO no or supplier" />
                <label className="rad">
                  <input type="radio" checked={findStatus === 'confirmed'} onChange={() => setFindStatus('confirmed')} /> Confirmed PO
                </label>
                <label className="rad">
                  <input type="radio" checked={findStatus === 'pending'} onChange={() => setFindStatus('pending')} /> Pending PO
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
                      <th>PO No</th><th>PO Date</th><th>Supplier</th><th>Location</th>
                      <th className="num">Net Total</th><th>Lines</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr><td colSpan={8} className="empty">{listBusy ? 'Loading…' : 'No purchase orders matched'}</td></tr>
                    )}
                    {list.map((row) => (
                      <tr key={`${row.locCode}|${row.poNo}`}>
                        <td className="mono">{row.poNo}</td>
                        <td>{dayOf(row.poDate)}</td>
                        <td>{row.supName || row.supID}</td>
                        <td>{row.locDes || row.locCode}</td>
                        <td className="num">{money(row.netTotal)}</td>
                        <td className="num">{row.lineCount}</td>
                        <td>{row.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>}</td>
                        <td>
                          <button className="btn small" onClick={() => void openOrder(row)}>
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
                <label>Location</label>
                <select value={locCode} onChange={(e) => { setLocCode(e.target.value); setDirty(true); }} disabled={locked}>
                  <option value="">— choose —</option>
                  {locations.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.des} ({l.code}){l.enable ? '' : ' (Inactive)'}
                    </option>
                  ))}
                </select>

                <label>Supplier</label>
                <select value={supID} onChange={(e) => { setSupID(e.target.value); setDirty(true); }} disabled={locked}>
                  <option value="">— choose —</option>
                  {suppliers.map((s) => (
                    <option key={s.supID} value={s.supID}>
                      {s.supID} — {s.name}{s.enable ? '' : ' (Inactive)'}
                    </option>
                  ))}
                </select>

                <label>PO Date</label>
                <input type="date" value={poDate} onChange={(e) => { setPoDate(e.target.value); setDirty(true); }} disabled={locked} />

                <label>PO Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDirty(true); }} disabled={locked} />

                <label>PO No</label>
                <input value={poNo} readOnly placeholder="issued on save" />
              </div>

              {/* the printed sheets used to be squeezed out of this screen —
                  now they are their own component (PoPrintSheet), so there is
                  nothing to print from the form itself. */}

              <div className="po-grid-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th style={{ width: 260 }}>Item Code / Item Name</th>
                      <th style={{ width: 110 }}>Unit</th>
                      <th style={{ width: 110 }} className="num">Cost Price</th>
                      <th style={{ width: 100 }} className="num">PO QTY</th>
                      <th style={{ width: 120 }} className="num">Item Value</th>
                      {poNo && <th style={{ width: 110 }} className="num">Received</th>}
                      <th className="no-print" style={{ width: 42 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={line.key}>
                        <td className="num">{i + 1}</td>
                        <td>
                          <ItemSuggestInput
                            locCode={locCode}
                            value={line.name}
                            disabled={locked}
                            onText={(text) => patchLine(line.key, { name: text, itemCode: '' })}
                            onPick={(item) => pickItem(line.key, item)}
                          />
                          {line.itemCode && <div className="code-hint">{line.itemCode}</div>}
                        </td>
                        <td>
                          {/* the unit NAME is what is read; the code is what is
                              stored in tbl_podetails.UnitID */}
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
                            value={line.poQty} disabled={locked}
                            onChange={(e) => patchLine(line.key, { poQty: e.target.value })}
                          />
                        </td>
                        <td className="num">{money(lineValue(line.costPrice, line.poQty))}</td>
                        {poNo && (
                          <td className="num">
                            {line.receivedQty}
                            {line.grnNos && <div className="code-hint">{line.grnNos}</div>}
                          </td>
                        )}
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
                <label>Delivery Address</label>
                <input value={deliAdd} disabled={locked} onChange={(e) => { setDeliAdd(e.target.value); setDirty(true); }} />
                <label>Net Value</label>
                <input value={money(netValue)} readOnly className="num strong" />
              </div>

              <div className="po-actions no-print">
                <button className="btn" onClick={() => addLine()} disabled={locked}>+ Add line</button>
                <button className="btn" onClick={handleClear} disabled={busy}>Clear</button>
                <button className="btn" onClick={() => void handleConfirm()} disabled={busy || confirmed}>
                  {confirming ? 'Confirming…' : 'Confirmation'}
                </button>
                <button className="btn" onClick={handlePrint} disabled={busy}>Print</button>
                <button
                  className="btn"
                  onClick={openMailDialog}
                  disabled={busy || sending}
                  title={
                    supplierEmail
                      ? `Email this order to ${supplierEmail}`
                      : 'Email this order to the supplier as a PDF (the supplier has no address on its record yet)'
                  }
                >
                  {sending ? 'Sending…' : 'Email to Supplier'}
                </button>
                <button className="btn danger" onClick={() => void handleDelete()} disabled={busy || !poNo || confirmed}>
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

          {}
          {tab === 'req' && (
            <div className="po-card no-print">
              <div className="po-find">
                <label>Location</label>
                <select value={locCode} onChange={(e) => setLocCode(e.target.value)}>
                  <option value="">— choose —</option>
                  {locations.map((l) => (
                    <option key={l.code} value={l.code}>{l.des} ({l.code}){l.enable ? '' : ' (Inactive)'}</option>
                  ))}
                </select>
                <button className="btn" onClick={() => void loadReqs()} disabled={reqBusy || !locCode}>
                  {reqBusy ? 'Loading…' : 'Refresh'}
                </button>
                <button className="btn primary" onClick={() => addRequirementsToPo(pickedRows)} disabled={pickedRows.length === 0}>
                  Add selected to PO ({pickedRows.length})
                </button>
                <button className="btn" onClick={() => setPicked({})} disabled={pickedRows.length === 0}>
                  Clear ticks
                </button>
                <span className="hint">
                  Grouped supplier-wise · tick one item, or a whole supplier · only what you add goes on the purchase order
                </span>
              </div>

              {reqErr && <div className="po-error">{reqErr}</div>}

              {pickedRows.length > 0 && (
                <div className="po-note">
                  {pickedRows.length} item(s) ticked
                  {suppliersOf(pickedRows).length > 1
                    ? ' — from more than one supplier: add them supplier by supplier (one purchase order carries one supplier).'
                    : ` — ${pickedRows.reduce((s, r) => s + r.suggestedQty, 0)} unit(s) suggested in total.`}
                </div>
              )}

              <div className="po-list-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th className="ck">
                        <input
                          type="checkbox"
                          checked={allPicked}
                          disabled={reqs.length === 0}
                          title="Tick every item"
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                      </th>
                      <th>Item</th><th>Unit</th><th className="num">Stock</th><th className="num">ROL</th>
                      <th className="num">ROQ</th><th className="num">Short</th><th className="num">Suggested</th>
                      <th>Supplier</th><th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.length === 0 && (
                      <tr><td colSpan={10} className="empty">
                        {reqBusy ? 'Loading…' : 'Nothing is below its reorder level at this location'}
                      </td></tr>
                    )}
                    {reqGroups.map((group) => {
                      const groupPicked = group.rows.every((r) => picked[r.itemCode]);
                      const groupCount = group.rows.filter((r) => picked[r.itemCode]).length;
                      return (
                        <React.Fragment key={`g|${group.supID || 'none'}`}>
                          <tr className="po-group">
                            <td className="ck">
                              <input
                                type="checkbox"
                                checked={groupPicked}
                                title={`Tick every ${group.supName} item`}
                                onChange={(e) => toggleGroup(group, e.target.checked)}
                              />
                            </td>
                            <td colSpan={9}>
                              <span className="sup-name">{group.supName}</span>
                              <span className="hint">
                                {' '}· {group.rows.length} item(s) to order
                                {groupCount > 0 ? ` · ${groupCount} ticked` : ''} ·{' '}
                                {group.rows.reduce((s, r) => s + r.suggestedQty, 0)} unit(s) suggested
                              </span>
                            </td>
                          </tr>
                          {group.rows.map((r) => (
                            <tr key={r.itemCode}>
                              <td className="ck">
                                <input
                                  type="checkbox"
                                  checked={Boolean(picked[r.itemCode])}
                                  onChange={() => togglePick(r.itemCode)}
                                />
                              </td>
                              <td><span className="mono">{r.itemCode}</span> {r.itemName}{r.enable ? '' : ' (Inactive)'}</td>
                              <td title={r.unitID}>{unitName(r.unitID) || r.unitID || '—'}</td>
                              <td className="num">{r.stockBalance}</td>
                              <td className="num">{r.rol}</td>
                              <td className="num">{r.roq}</td>
                              <td className="num">{r.shortage}</td>
                              <td className="num strong">{r.suggestedQty}</td>
                              <td>{r.supName || r.supID || '—'}</td>
                              <td className="no-print">
                                <button className="btn small" onClick={() => addRequirementsToPo([r])}>
                                  Add to PO
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {}
      {printAsk && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Print purchase order">
          <div className="ask-card">
            <h2>Print Purchase Order</h2>
            <p>
              {poNo ? <><span className="mono">{poNo}</span> — </> : null}
              which copy do you want to print?
            </p>
            <div className="ask-choices">
              {PO_PRINT_COPY_CHOICES.map((choice) => (
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
      {mailAsk && (
        <div className="ask-back no-print" role="dialog" aria-modal="true" aria-label="Email purchase order">
          <div className="ask-card mail-card">
            <h2>Email Purchase Order</h2>
            <p>
              <span className="mono">{poNo}</span> goes to{' '}
              <b>{suppliers.find((s) => s.supID === supID)?.name || supID}</b> as a PDF attachment.
            </p>

            <div className="mail-field">
              <label htmlFor="mail-to">To</label>
              <input
                id="mail-to"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                placeholder="supplier@example.com"
                spellCheck={false}
              />
            </div>
            {!supplierEmail && !mailTo.trim() && (
              <div className="mail-warn">
                This supplier has no e-mail address on its record — type one here, or put it on the
                supplier in the Suppliers screen.
              </div>
            )}
            {supplierEmail && mailTo.trim() && mailTo.trim() !== supplierEmail && (
              <div className="mail-hint">
                The supplier's own record has <b>{supplierEmail}</b> — this order will go to the address above.
              </div>
            )}

            <div className="mail-field">
              <label>Copy to send</label>
              <div className="mail-copies">
                {PO_PRINT_COPY_CHOICES.map((choice) => (
                  <label key={choice.id} className={`mail-radio ${mailCopy === choice.id ? 'on' : ''}`}>
                    <input
                      type="radio"
                      name="mail-copy"
                      checked={mailCopy === choice.id}
                      onChange={() => setMailCopy(choice.id)}
                    />
                    <span>
                      <b>{choice.label}</b>
                      <span className="mail-radio-hint">{choice.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mail-field">
              <label htmlFor="mail-subject">Subject</label>
              <input id="mail-subject" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
            </div>

            <div className="mail-field">
              <label htmlFor="mail-message">Message</label>
              <textarea
                id="mail-message"
                rows={4}
                value={mailMessage}
                onChange={(e) => setMailMessage(e.target.value)}
                placeholder="Leave empty to send the standard covering note (order number, dates, line count)."
              />
            </div>

            <div className="mail-attach">
              Attachment: <b>{(poNo || 'purchase-order').trim()}.pdf</b> ·{' '}
              {printableLines.length} item line(s) · {mailCopy === 'supplier' ? 'no prices on this copy' : `total ${poPrintTotal(printableLines.map((l) => ({
                itemCode: l.itemCode, name: l.name, unitID: l.unitID,
                costPrice: Number(l.costPrice) || 0, poQty: Number(l.poQty) || 0,
              })))}`}
            </div>

            <div className="ask-foot">
              <button className="btn" onClick={() => setMailAsk(false)} disabled={sending}>Cancel</button>
              <button className="btn primary" onClick={() => void sendMail()} disabled={sending || !mailTo.trim()}>
                {sending ? 'Sending…' : 'Send to Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── THE PRINTED SHEET (hidden on screen; only paper sees it) ─────── */}
      {printJob && (
        <div aria-hidden="true">
          <PoPrintSheet
            copy={printData.copy}
            copyLabel={poPrintCopyLabel(printData.copy)}
            cols={printData.cols}
            colCount={printData.colCount}
            companyName={printData.companyName}
            companyAddress={printData.companyAddress}
            companyPhone={printData.companyPhone}
            branch={printData.branch}
            supplierCode={printData.supplierCode}
            supplierName={printData.supplierName}
            supplierAddress={printData.supplierAddress || printData.supplierContact}
            poNo={printData.poNo}
            poDate={printData.poDate}
            dueDate={printData.dueDate}
            printDate={printData.printDate}
            printTime={printData.printTime}
            user={printData.user}
            rows={printData.rows}
            total={printData.total}
            deliAdd={printData.deliAdd}
            remarks={printData.remarks}
          />
        </div>
      )}
    </>
  );
}

/* ── page CSS ────────────────────────────────────────────────────────────── */

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
  .po-table th.ck, .po-table td.ck { width:34px; max-width:34px; text-align:center; padding:5px 4px; }
  .po-table .ck input[type=checkbox] { width:15px; height:15px; margin:0; accent-color:#1e3a40; cursor:pointer; }
  .po-table tr.po-group td { background:#e2ecec !important; border-bottom:1px solid rgba(30,58,64,0.14); }
  .sup-name { font-size:12px; font-weight:800; color:#16333a; letter-spacing:0.01em; }
  .po-table tr.po-group .hint { font-weight:600; }
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
    /* only the sheet prints: the screen, the dialog, the toasts and the
       toolbar stay out. The sheet itself — and the zero page margin that keeps
       the browser's own header and footer off the paper — come from
       PO_PRINT_CSS. */
    .no-print, .po-tabs, .po-note, .po-state, .po-shell, .toast, .ask-back { display:none !important; }
    html, body { background:#fff !important; height:auto; background-image:none !important; }
  }
`;
