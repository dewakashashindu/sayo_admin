'use client';
// src/app/inventory/grn/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// GOOD RECEIVED NOTE — the legacy screen (SCR_BILLING.pdf pages 6, 7 and 9).
//
//   Details   PO Number (only CONFIRMED orders with something left to receive),
//             Location, Supplier, Sup Inv No, GRN No, GRN Date, the item grid
//             and the COST AND RETAIL PRICE popup, then the legacy button row
//             Clear · Confirmation · Print · Delete · Save · Cancel
//   Find      search saved receipts — Confirmed GRN / Pending GRN
//
//   A DIRECT GRN (the legacy “DIRECT GOOD RECIVED NOTE”, page 9) is the same
//   screen with “Direct GRN” chosen instead of a purchase order: no PO number,
//   GRNTYPE = 'DG', and the supplier is chosen by hand.
//
// WHAT CONFIRMATION DOES — and why it is a separate button:
//   nothing moves until it is pressed. Confirmation updates StockBalance, writes
//   the tbl_stocktxn ledger row, writes the quantity back onto the purchase
//   order and (only if the line asks for it) pushes the RetailPrice into
//   tbl_itemmaster — all in ONE transaction, server-side.
//
// LOCATIONS / SUPPLIERS come from GET /api/inventory/lookups: exactly what
// tbl_locationmaster / tbl_suppliermaster hold, RTRIM'd, nothing filtered out.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import ItemSuggestInput, { type SuggestedItem } from '@/components/ItemSuggestInput';
import {
  displayPhone,
  notifyMoney,
  smsPartCount,
  type NotifyContact,
} from '@/lib/grnNotify';
import {
  poEntryFields,
  poEntryProgress,
  queueAccept,
  queueRequeue,
  queueSkipFirst,
  type PoOpenForGrn,
} from '@/lib/grnPoEntry';

/* ── types ───────────────────────────────────────────────────────────────── */

interface LookupLocation { code: string; des: string; address: string; enable: boolean }
interface LookupSupplier { supID: string; name: string; contact: string; enable: boolean }
interface LookupUnit { id: string; des: string; enable: boolean }

interface OpenPo {
  poNo: string; supID: string; supName: string; poDate: string; dueDate: string;
  openLines: number; openValue: number;
}

interface GrnLine {
  key: string;
  itemCode: string;
  itemName: string;
  unitID: string;
  batchNo: string;
  costPrice: string;
  retailPrice: string;
  grnQty: string;
  freeQty: string;
  expDate: string;
  updItemPrice: boolean;
  stockBalance: number;
  poQty: number;
  alreadyReceived: number;
}

interface GrnListRow {
  grnNo: string; locCode: string; grnDate: string; supID: string; supName: string;
  supInvNo: string; poNo: string; grnType: string; grossTotal: number; discount: number;
  adjustment: number; netTotal: number; confirmed: boolean; userID: string; lineCount: number;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

let lineSeq = 0;
const newLine = (): GrnLine => ({
  key: `G${++lineSeq}`, itemCode: '', itemName: '', unitID: '', batchNo: '', costPrice: '', retailPrice: '',
  grnQty: '', freeQty: '', expDate: '', updItemPrice: false, stockBalance: 0, poQty: 0, alreadyReceived: 0,
});

const money = (n: number) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayOf = (value: unknown) => String(value ?? '').slice(0, 10);
const lineValue = (cost: string, qty: string, free: string) =>
  (Number(cost) || 0) * ((Number(qty) || 0) + (Number(free) || 0));

/* The Unit column shows the unit NAME and stores the unit code — exactly like
   the purchase order screen, and like the legacy sheet. */
const unitName = (units: LookupUnit[], id: string) => units.find((u) => u.id === id)?.des || '';

function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const show = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.setTimeout(() => setToast(null), 5000);
  }, []);
  return { toast, show };
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function GrnPage() {
  const router = useRouter();
  const { toast, show: showToast } = useToast();

  const [tab, setTab] = useState<'details' | 'find'>('details');

  const [locations, setLocations] = useState<LookupLocation[]>([]);
  const [suppliers, setSuppliers] = useState<LookupSupplier[]>([]);
  const [units, setUnits] = useState<LookupUnit[]>([]);
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const [lookupNote, setLookupNote] = useState('Loading locations and suppliers…');

  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [poErr, setPoErr] = useState('');

  const [direct, setDirect] = useState(false);
  const [locCode, setLocCode] = useState('');
  const [supID, setSupID] = useState('');
  const [poNo, setPoNo] = useState('');
  const [supInvNo, setSupInvNo] = useState('');
  const [grnDate, setGrnDate] = useState(dayOf(new Date().toISOString()));
  const [remarks, setRemarks] = useState('');
  const [discount, setDiscount] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [lines, setLines] = useState<GrnLine[]>([]);
  /* Against a purchase order the lines are NOT all put on the grid at once:
     the PO's open lines queue up here and the first one is presented on its own
     row. Add (or Skip) brings the next one forward — see src/lib/grnPoEntry.ts.
     A DIRECT GRN has no queue and keeps the plain empty grid. */
  const [poQueue, setPoQueue] = useState<GrnLine[]>([]);
  const [poLineCount, setPoLineCount] = useState(0);
  const [grnNo, setGrnNo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState('');

  const [popupKey, setPopupKey] = useState<string | null>(null);

  /* ── "tell the admin to confirm it" ────────────────────────────────────
     A saved GRN only moves stock once somebody presses Confirmation, and that
     person is often not at the counter. Saving therefore ends with this popup:
     pick who to tell, press Send, and they get an SMS. */
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyContacts, setNotifyContacts] = useState<NotifyContact[]>([]);
  const [notifyPick, setNotifyPick] = useState('');
  const [notifyOther, setNotifyOther] = useState('');
  const [notifyText, setNotifyText] = useState('');
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifyMissingEnv, setNotifyMissingEnv] = useState<string[]>([]);
  const [notifySending, setNotifySending] = useState(false);
  const [notifySentTo, setNotifySentTo] = useState('');

  /* the entry row: focus lands on Cost Price, Enter walks to the Add button,
     Enter again adds the line and the next one arrives — the store keeper
     never touches the mouse */
  const costRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);

  const [findQ, setFindQ] = useState('');
  const [findStatus, setFindStatus] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [list, setList] = useState<GrnListRow[]>([]);
  const [listBusy, setListBusy] = useState(false);

  /* ── locations / suppliers / units ─────────────────────────────────────── */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/inventory/lookups', { cache: 'no-store' });
        const json = await res.json() as {
          success?: boolean; locations?: LookupLocation[]; suppliers?: LookupSupplier[];
          units?: LookupUnit[]; errors?: Record<string, string>; message?: string;
        };
        if (!active) return;
        if (!res.ok || !json?.success) throw new Error(json?.message || `HTTP ${res.status}`);
        const locs = json.locations ?? [];
        const sups = json.suppliers ?? [];
        setLocations(locs);
        setSuppliers(sups);
        setUnits(json.units ?? []);
        setLookupErrors(json.errors ?? {});
        setLookupNote(`${locs.length} location(s) · ${sups.length} supplier(s) loaded from the database`);
        setLocCode((prev) => prev || locs[0]?.code || '');
        setSupID((prev) => prev || sups[0]?.supID || '');
      } catch (err) {
        if (!active) return;
        setLookupNote('');
        setLookupErrors({ all: err instanceof Error ? err.message : 'Could not load the lists' });
        showToast('Could not load locations / suppliers from the database', true);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── open purchase orders for the dropdown ─────────────────────────────── */
  const loadOpenPos = useCallback(async () => {
    if (!locCode) return;
    setPoErr('');
    try {
      const res = await fetch(`/api/inventory/grn/open-pos?locCode=${encodeURIComponent(locCode)}`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: OpenPo[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the confirmed purchase orders');
      setOpenPos(json.data ?? []);
    } catch (err) {
      setPoErr(err instanceof Error ? err.message : 'Could not load the confirmed purchase orders');
      setOpenPos([]);
    }
  }, [locCode]);

  useEffect(() => {
    if (!direct && tab === 'details') void loadOpenPos();
  }, [direct, tab, loadOpenPos]);

  /* ── GRN list (Find tab) ───────────────────────────────────────────────── */
  const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const params = new URLSearchParams({ status: findStatus });
      if (findQ.trim()) params.set('q', findQ.trim());
      const res = await fetch(`/api/inventory/grn?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json() as { success?: boolean; data?: GrnListRow[]; message?: string };
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the receipts');
      setList(json.data ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load the receipts', true);
      setList([]);
    } finally {
      setListBusy(false);
    }
  }, [findQ, findStatus, showToast]);

  useEffect(() => { if (tab === 'find') void loadList(); }, [tab, loadList]);

  /* ── pick a purchase order → load its open lines ───────────────────────── */
  async function choosePo(value: string) {
    setPoNo(value);
    setDirty(true);
    if (!value) { setLines([]); setPoQueue([]); setPoLineCount(0); return; }
    try {
      const res = await fetch(`/api/inventory/po/${encodeURIComponent(value)}?locCode=${encodeURIComponent(locCode)}`, { cache: 'no-store' });
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: {
          supID: string; confirmed: boolean;
          lines: { itemCode: string; itemName: string; unitID: string; costPrice: number; retailPrice: number;
                   poQty: number; receivedQty: number; openQty: number }[];
        };
      };
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not open the purchase order');
      setSupID(json.data.supID);
      /* One line at a time: everything still open goes into the queue, the grid
         stays empty until the store keeper adds a line. */
      setLines([]);
      setPoQueue(
        json.data.lines.map((l) => ({ key: `G${++lineSeq}`, ...poEntryFields(l as PoOpenForGrn) })),
      );
      setPoLineCount(json.data.lines.length);
      showToast(
        json.data.lines.length === 0
          ? `${value} has nothing left to receive`
          : `${value} loaded — line 1 of ${json.data.lines.length} is on the entry row, the quantity is what is still open`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open the purchase order', true);
    }
  }

  /* ── line editing ──────────────────────────────────────────────────────── */
  function patchLine(key: string, patch: Partial<GrnLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    /* the same key may be the row waiting on the entry row */
    setPoQueue((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function pickItem(key: string, item: SuggestedItem) {
    patchLine(key, {
      itemCode: item.code,
      itemName: item.des,
      unitID: item.masterUnitID || '',
      costPrice: item.costPrice ? String(item.costPrice) : '',
      retailPrice: item.retailPrice ? String(item.retailPrice) : '',
      grnQty: lines.find((l) => l.key === key)?.grnQty || '1',
    });
  }

  /* ── the entry row: Add, Skip, and the keyboard walk ──────────────────── */

  const entry = poQueue[0];

  const progress = poEntryProgress(poLineCount, poQueue.length);

  /** Add — the entry line joins the grid, the next PO line comes forward. */
  function acceptEntry() {
    if (!entry) return;
    const next = queueAccept(lines, poQueue, entry.key);
    setLines(next.lines);
    setPoQueue(next.queue);
    setDirty(true);
  }

  /** Skip — this line waits at the back of the queue. */
  function skipEntry() {
    if (poQueue.length === 0) return;
    setPoQueue(queueSkipFirst(poQueue));
  }

  /* Every new entry row starts on Cost Price, so the store keeper can type the
     price they were actually charged straight away. */
  useEffect(() => {
    if (!entry) return;
    const box = costRef.current;
    if (!box) return;
    box.focus();
    box.select();
  }, [entry?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Enter on any box of the entry row moves to Add; Enter there adds the line. */
  function entryKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addRef.current?.focus();
  }

  function addLine(fill?: Partial<GrnLine>) {
    setLines((prev) => [...prev, { ...newLine(), ...fill }]);
    setDirty(true);
  }

  function removeLine(key: string) {
    const gone = lines.find((l) => l.key === key);
    setLines((prev) => {
      const rest = prev.filter((l) => l.key !== key);
      return direct ? (rest.length === 0 ? [newLine()] : rest) : rest;
    });
    /* A line of the purchase order that is taken off the grid goes back to the
       front of the queue, so it can be added again. */
    if (gone && !direct && poNo) setPoQueue((prev) => queueRequeue(prev, gone));
    setDirty(true);
  }

  /* ── totals ────────────────────────────────────────────────────────────── */
  const totals = useMemo(() => {
    const gross = lines.reduce((sum, l) => sum + lineValue(l.costPrice, l.grnQty, l.freeQty), 0);
    const dis = Number(discount) || 0;
    const adj = Number(adjustment) || 0;
    return { gross, dis, adj, net: gross - dis + adj };
  }, [lines, discount, adjustment]);

  const popupLine = lines.find((l) => l.key === popupKey) ?? poQueue.find((l) => l.key === popupKey) ?? null;

  /* ── open a saved GRN ──────────────────────────────────────────────────── */
  async function openGrn(row: GrnListRow) {
    try {
      const res = await fetch(
        `/api/inventory/grn/${encodeURIComponent(row.grnNo)}?locCode=${encodeURIComponent(row.locCode)}`,
        { cache: 'no-store' },
      );
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: {
          grnNo: string; locCode: string; grnDate: string; supID: string; supInvNo: string; poNo: string;
          remarks: string; discount: number; adjustment: number; confirmed: boolean;
          lines: { itemCode: string; itemName: string; unitID: string; batchNo: string;
                   costPrice: number; retailPrice: number;
                   grnQty: number; freeQty: number; expDate: string | null; updItemPrice: boolean;
                   stockBalance: number }[];
        };
      };
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not open the receipt');
      const d = json.data;
      setGrnNo(d.grnNo);
      setLocCode(d.locCode);
      setSupID(d.supID);
      setPoNo(d.poNo);
      setDirect(!d.poNo);
      setSupInvNo(d.supInvNo);
      setGrnDate(dayOf(d.grnDate));
      setRemarks(d.remarks);
      setDiscount(d.discount ? String(d.discount) : '');
      setAdjustment(d.adjustment ? String(d.adjustment) : '');
      setConfirmed(Boolean(d.confirmed));
      setPoQueue([]);
      setPoLineCount(0);
      setLines(d.lines.map((l) => ({
        key: `G${++lineSeq}`,
        itemCode: l.itemCode,
        itemName: l.itemName,
        unitID: l.unitID,
        batchNo: l.batchNo ?? '',
        costPrice: String(l.costPrice ?? ''),
        retailPrice: String(l.retailPrice ?? ''),
        grnQty: String(l.grnQty ?? ''),
        freeQty: l.freeQty ? String(l.freeQty) : '',
        expDate: dayOf(l.expDate),
        updItemPrice: Boolean(l.updItemPrice),
        stockBalance: Number(l.stockBalance || 0),
        poQty: 0,
        alreadyReceived: 0,
      })));
      setDirty(false);
      setLastResult('');
      setTab('details');
      showToast(`GRN ${d.grnNo} loaded`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open the receipt', true);
    }
  }

  /* ── save ──────────────────────────────────────────────────────────────── */
  function payload() {
    return {
      locCode,
      poNo: direct ? '' : poNo,
      supID,
      supInvNo,
      grnDate,
      remarks,
      discount: discount === '' ? 0 : Number(discount),
      adjustment: adjustment === '' ? 0 : Number(adjustment),
      lines: lines
        .filter((l) => l.itemCode || l.itemName.trim())
        .map((l) => ({
          itemCode: l.itemCode || l.itemName.trim(),
          unitID: l.unitID,
          batchNo: l.batchNo.trim(),
          costPrice: l.costPrice === '' ? '' : Number(l.costPrice),
          retailPrice: l.retailPrice === '' ? '' : Number(l.retailPrice),
          grnQty: l.grnQty === '' ? 0 : Number(l.grnQty),
          freeQty: l.freeQty === '' ? 0 : Number(l.freeQty),
          expDate: l.expDate || '',
          updItemPrice: l.updItemPrice,
        })),
    };
  }

  async function handleSave(): Promise<boolean> {
    if (!locCode) { showToast('Choose a location first', true); return false; }
    if (direct && !supID) { showToast('Choose a supplier first', true); return false; }
    if (!direct && !poNo) { showToast('Choose a purchase order, or switch to Direct GRN', true); return false; }
    const body = payload();
    if (body.lines.length === 0) { showToast('Add at least one item line', true); return false; }

    /* The entry row is NOT part of the document until Add is pressed. Remember
       it and say so after the save, as the one message that stays on screen —
       a warning first would only be overwritten by the success toast. */
    const stillWaiting = entry ? entry.itemName : '';

    setSaving(true);
    try {
      const res = grnNo
        ? await fetch(`/api/inventory/grn/${encodeURIComponent(grnNo)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          })
        : await fetch('/api/inventory/grn', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, confirm: false }),
          });
      const json = await res.json() as {
        success?: boolean; message?: string; hint?: string; data?: { grnNo: string; netTotal: number };
      };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Save failed'));
      }
      const savedNo = json.data?.grnNo || grnNo;
      if (json.data?.grnNo) setGrnNo(json.data.grnNo);
      setDirty(false);
      showToast(
        stillWaiting
          ? `${json.message || 'Saved'} “${stillWaiting}” is still on the entry row, so it is NOT in this GRN — press Add if it arrived, then Save again.`
          : (json.message || 'Saved ✓'),
        Boolean(stillWaiting),
      );
      /* The receipt is stored, but the stock only moves when somebody presses
         Confirmation — so ask, right away, who should be told to do it. */
      if (savedNo) void openNotify(savedNo);
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /* ── confirmation: the moment stock moves ──────────────────────────────── */
  async function handleConfirm() {
    if (confirmed) { showToast('This receipt is already confirmed'); return; }
    setConfirming(true);
    try {
      if (dirty || !grnNo) {
        const ok = await handleSave();
        if (!ok) return;
      }
      const number = grnNo;
      if (!number) { showToast('Save the receipt before confirming it', true); return; }
      if (!confirm(
        `Confirm GRN ${number}?\n\nStock will be updated and the purchase order written back. ` +
        'A confirmed receipt can no longer be edited or deleted.',
      )) return;

      const res = await fetch(`/api/inventory/grn/${encodeURIComponent(number)}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locCode }),
      });
      const json = await res.json() as {
        success?: boolean; message?: string; hint?: string;
        data?: { lines: { itemName: string; received: number; free: number; newBalance: number | null; retailUpdated: boolean }[] };
      };
      if (!res.ok || !json?.success) {
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'Confirmation failed'));
      }
      setConfirmed(true);
      const moved = (json.data?.lines ?? [])
        .filter((l) => l.newBalance !== null)
        .map((l) => `${l.itemName}: +${l.received}${l.free ? ` (+${l.free} free)` : ''} → ${l.newBalance}`)
        .join(' · ');
      const retail = (json.data?.lines ?? []).filter((l) => l.retailUpdated).length;
      setLastResult(
        `${json.message}${moved ? ` ${moved}` : ''}${retail ? ` — ${retail} item price(s) updated` : ''}`,
      );
      showToast(json.message || 'Confirmed ✓');
      void loadOpenPos();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Confirmation failed', true);
    } finally {
      setConfirming(false);
    }
  }

  async function handleDelete() {
    if (!grnNo) { showToast('This receipt has not been saved yet'); return; }
    if (!confirm(`Delete GRN ${grnNo}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/inventory/grn/${encodeURIComponent(grnNo)}?locCode=${encodeURIComponent(locCode)}`,
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
    setLines(direct ? [newLine()] : []);
    setPoQueue([]);
    setPoLineCount(0);
    setSupInvNo('');
    setRemarks('');
    setDiscount('');
    setAdjustment('');
    setGrnNo('');
    setConfirmed(false);
    setDirty(false);
    setLastResult('');
    setPopupKey(null);
  }

  function handleCancel() {
    if (dirty && !confirm('Discard the unsaved changes?')) return;
    handleClear();
    showToast('Cleared');
  }

  function handleNavigate(key: string, path: string) {
    if (dirty && !confirm('Leave the page without saving the receipt?')) return;
    router.push(path);
  }

  /* ── tell an admin to come and confirm ─────────────────────────────────── */

  async function openNotify(forGrn = grnNo) {
    if (!forGrn) { showToast('Save the receipt first — then the admin can be told to confirm it', true); return; }
    if (confirmed) { showToast(`GRN ${forGrn} is already confirmed`, true); return; }
    setNotifyOpen(true);
    setNotifyLoading(true);
    setNotifyMsg('');
    setNotifySentTo('');
    try {
      const res = await fetch(
        `/api/inventory/grn/${encodeURIComponent(forGrn)}/notify?locCode=${encodeURIComponent(locCode)}`,
        { cache: 'no-store' },
      );
      const json = await res.json() as {
        success?: boolean; message?: string;
        data?: {
          contacts: NotifyContact[]; configured: boolean; missingEnv: string[];
          setupMessage: string; message: string; confirmed: boolean;
        };
      };
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.message || 'Could not load who to message');
      const d = json.data;
      setNotifyContacts(d.contacts ?? []);
      setNotifyMissingEnv(d.missingEnv ?? []);
      setNotifyMsg(d.setupMessage || '');
      setNotifyText((prev) => prev || d.message);
      setNotifyPick((prev) => prev || d.contacts?.[0]?.userId || '');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load who to message', true);
      setNotifyOpen(false);
    } finally {
      setNotifyLoading(false);
    }
  }

  async function sendNotify() {
    const chosen = notifyContacts.find((c) => c.userId === notifyPick);
    const other = notifyOther.trim();
    if (!chosen && !other) { showToast('Choose who to message, or type a mobile number', true); return; }
    setNotifySending(true);
    try {
      const res = await fetch(`/api/inventory/grn/${encodeURIComponent(grnNo)}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locCode,
          userId: chosen ? chosen.userId : '',
          to: chosen ? '' : other,
          message: notifyText.trim(),
        }),
      });
      const json = await res.json() as {
        success?: boolean; message?: string; missingEnv?: string[]; hint?: string;
        data?: { recipientName: string; masked: string; parts: number };
      };
      if (!res.ok || !json?.success) {
        if (json?.missingEnv?.length) setNotifyMissingEnv(json.missingEnv);
        throw new Error(json?.hint ? `${json.message} — ${json.hint}` : (json?.message || 'The message could not be sent'));
      }
      const who = json.data?.recipientName || json.data?.masked || 'the admin';
      setNotifySentTo(who);
      showToast(json.message || `SMS sent to ${who}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The message could not be sent', true);
    } finally {
      setNotifySending(false);
    }
  }

  const busy = saving || deleting || confirming;
  const locked = confirmed;

  /* ── markup ────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}

      <div className="po-shell">
        <div className="no-print"><AdminSidebar active="inv-grn" onNav={handleNavigate} onLogout={() => router.push('/admin-login')} /></div>

        <div className="po-main">
          <header className="po-head no-print">
            <h1>{direct ? 'DIRECT GOOD RECIVED NOTE' : 'GOOD RECIVED NOTE'}</h1>
            <div className="po-tabs">
              <button className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>Find</button>
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
            </div>
            <div className="po-state">
              {grnNo ? <span className="chip">{grnNo}</span> : <span className="chip dim">not saved yet</span>}
              {grnNo && (confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>)}
              {dirty && <span className="chip dim">unsaved changes</span>}
            </div>
          </header>

          {lookupNote && <div className="po-note no-print">{lookupNote}</div>}
          {Object.keys(lookupErrors).length > 0 && (
            <div className="po-error">
              <strong>Locations / suppliers could not all be read from the database.</strong>
              <ul>
                {Object.entries(lookupErrors).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
              </ul>
            </div>
          )}

          {/* ── FIND ─────────────────────────────────────────────────────── */}
          {tab === 'find' && (
            <div className="po-card no-print">
              <div className="po-find">
                <label>Find Criteria</label>
                <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder="GRN no, PO no, supplier or invoice" />
                <label className="rad">
                  <input type="radio" checked={findStatus === 'confirmed'} onChange={() => setFindStatus('confirmed')} /> Confirmed GRN
                </label>
                <label className="rad">
                  <input type="radio" checked={findStatus === 'pending'} onChange={() => setFindStatus('pending')} /> Pending GRN
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
                      <th>GRN No</th><th>Date</th><th>PO</th><th>Supplier</th><th>Sup Inv</th>
                      <th className="num">Net Total</th><th>Lines</th><th>Type</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr><td colSpan={10} className="empty">{listBusy ? 'Loading…' : 'No receipts matched'}</td></tr>
                    )}
                    {list.map((row) => (
                      <tr key={`${row.locCode}|${row.grnNo}`}>
                        <td className="mono">{row.grnNo}</td>
                        <td>{dayOf(row.grnDate)}</td>
                        <td className="mono">{row.poNo || '—'}</td>
                        <td>{row.supName || row.supID}</td>
                        <td>{row.supInvNo || '—'}</td>
                        <td className="num">{money(row.netTotal)}</td>
                        <td className="num">{row.lineCount}</td>
                        <td>{row.grnType === 'DG' ? 'Direct' : 'PO'}</td>
                        <td>{row.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip warn">Pending</span>}</td>
                        <td>
                          <button className="btn small" onClick={() => void openGrn(row)}>
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

          {/* ── DETAILS ──────────────────────────────────────────────────── */}
          {tab === 'details' && (
            <div className="po-card">
              <div className="po-form no-print">
                <label>Receipt</label>
                <div className="rad-row">
                  <label className="rad">
                    <input type="radio" checked={!direct} disabled={locked}
                      onChange={() => { setDirect(false); setLines([]); setPoQueue([]); setPoLineCount(0); setDirty(true); }} />
                    Against a purchase order
                  </label>
                  <label className="rad">
                    <input type="radio" checked={direct} disabled={locked}
                      onChange={() => { setDirect(true); setPoNo(''); setLines([newLine()]); setPoQueue([]); setPoLineCount(0); setDirty(true); }} />
                    Direct GRN
                  </label>
                </div>

                <label>PO Number</label>
                {direct ? (
                  <input value="Direct receipt — no purchase order" readOnly />
                ) : (
                  <select value={poNo} onChange={(e) => void choosePo(e.target.value)} disabled={locked}>
                    <option value="">— choose a confirmed order —</option>
                    {openPos.map((p) => (
                      <option key={p.poNo} value={p.poNo}>
                        {p.poNo} — {p.supName || p.supID} ({p.openLines} line(s) open)
                      </option>
                    ))}
                  </select>
                )}

                <label>Location</label>
                <select value={locCode} onChange={(e) => { setLocCode(e.target.value); setDirty(true); }} disabled={locked}>
                  <option value="">— choose —</option>
                  {locations.map((l) => (
                    <option key={l.code} value={l.code}>{l.code} — {l.des}{l.enable ? '' : ' (Inactive)'}</option>
                  ))}
                </select>

                <label>Supplier</label>
                <select value={supID} onChange={(e) => { setSupID(e.target.value); setDirty(true); }}
                  disabled={locked || !direct}>
                  <option value="">— choose —</option>
                  {suppliers.map((s) => (
                    <option key={s.supID} value={s.supID}>{s.supID} — {s.name}{s.enable ? '' : ' (Inactive)'}</option>
                  ))}
                </select>

                <label>Sup Inv No</label>
                <input value={supInvNo} disabled={locked} onChange={(e) => { setSupInvNo(e.target.value); setDirty(true); }} />

                <label>GRN No</label>
                <input value={grnNo} readOnly placeholder="issued on save" />

                <label>GRN Date</label>
                <input type="date" value={grnDate} disabled={locked} onChange={(e) => { setGrnDate(e.target.value); setDirty(true); }} />
              </div>

              {poErr && !direct && <div className="po-error no-print">{poErr}</div>}

              <div className="po-print-head">
                <div><b>{direct ? 'DIRECT GOOD RECIVED NOTE' : 'GOOD RECIVED NOTE'}</b> {grnNo || ''}</div>
                <div>
                  {poNo || ''} · {locations.find((l) => l.code === locCode)?.des || locCode} ·{' '}
                  {suppliers.find((s) => s.supID === supID)?.name || supID} · {grnDate}
                  {supInvNo ? ` · sup inv ${supInvNo}` : ''}
                </div>
              </div>

              {!direct && poNo && (
                <div className="po-note no-print entry-strip">
                  <b>{poNo}</b> · {progress.text}
                  {entry && <span className="entry-hint">Type the batch number and the price, then Enter → <b>Add</b> → Enter. The next line comes by itself.</span>}
                </div>
              )}

              <div className="po-grid-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th style={{ width: 205 }}>Item Code / Item Name</th>
                      <th style={{ width: 130 }}>Unit</th>
                      <th style={{ width: 110 }}>Batch No</th>
                      <th style={{ width: 100 }} className="num">Cost Price</th>
                      <th style={{ width: 100 }} className="num">Retail Price</th>
                      <th style={{ width: 95 }} className="num">GRN QTY</th>
                      <th style={{ width: 85 }} className="num">Free Qty</th>
                      <th style={{ width: 110 }} className="num">Item Value</th>
                      <th style={{ width: 130 }}>Exp Date</th>
                      <th className="no-print" style={{ width: 42 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={line.key}>
                        <td className="num">{i + 1}</td>
                        <td>
                          {direct ? (
                            <>
                              <ItemSuggestInput
                                locCode={locCode}
                                value={line.itemName}
                                disabled={locked}
                                onText={(text) => patchLine(line.key, { itemName: text, itemCode: '' })}
                                onPick={(item) => pickItem(line.key, item)}
                              />
                              {line.itemCode && <div className="code-hint">{line.itemCode}</div>}
                            </>
                          ) : (
                            <>
                              <div className="fixed-item">{line.itemName}</div>
                              <div className="code-hint">
                                {line.itemCode}
                                {line.poQty > 0 && ` · ordered ${line.poQty}, received ${line.alreadyReceived}`}
                              </div>
                            </>
                          )}
                        </td>
                        <td>
                          <select value={line.unitID} disabled={locked}
                            title={line.unitID ? `${unitName(units, line.unitID) || line.unitID} (${line.unitID})` : 'Unit'}
                            onChange={(e) => patchLine(line.key, { unitID: e.target.value })}>
                            <option value="">— unit —</option>
                            {line.unitID && !units.some((u) => u.id === line.unitID) && (
                              <option value={line.unitID}>{line.unitID} — not in unit master</option>
                            )}
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>{u.des || u.id}{u.enable ? '' : ' (Inactive)'}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input value={line.batchNo} disabled={locked} placeholder="from the packet"
                            onChange={(e) => patchLine(line.key, { batchNo: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" className="num" value={line.costPrice}
                            disabled={locked} placeholder="master"
                            onChange={(e) => patchLine(line.key, { costPrice: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" className="num" value={line.retailPrice}
                            disabled={locked} placeholder="master"
                            onChange={(e) => patchLine(line.key, { retailPrice: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.001" className="num" value={line.grnQty}
                            disabled={locked}
                            onChange={(e) => patchLine(line.key, { grnQty: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.001" className="num" value={line.freeQty}
                            disabled={locked}
                            onChange={(e) => patchLine(line.key, { freeQty: e.target.value })} />
                        </td>
                        <td className="num">{money(lineValue(line.costPrice, line.grnQty, line.freeQty))}</td>
                        <td>
                          <input type="date" value={line.expDate} disabled={locked}
                            onChange={(e) => patchLine(line.key, { expDate: e.target.value })} />
                        </td>
                        <td className="no-print">
                          <button className="x" title="COST AND RETAIL PRICE" disabled={locked}
                            onClick={() => setPopupKey(line.key)}>💲</button>
                          <button className="x" title="Remove line" disabled={locked}
                            onClick={() => removeLine(line.key)}>✕</button>
                        </td>
                      </tr>
                    ))}

                    {/* ── the line being received right now ──────────────────
                        One row only: it carries the Add button, and the moment
                        it is added the next line of the purchase order takes
                        its place with the cursor back on Cost Price. */}
                    {entry && (
                      <tr className="po-entry">
                        <td className="num">{lines.length + 1}</td>
                        <td>
                          <div className="fixed-item">{entry.itemName}</div>
                          <div className="code-hint">
                            {entry.itemCode}
                            {entry.poQty > 0 && ` · ordered ${entry.poQty}, already received ${entry.alreadyReceived}`}
                          </div>
                        </td>
                        <td>
                          <select value={entry.unitID} disabled={locked}
                            title={entry.unitID ? `${unitName(units, entry.unitID) || entry.unitID} (${entry.unitID})` : 'Unit'}
                            onChange={(e) => patchLine(entry.key, { unitID: e.target.value })}
                            onKeyDown={entryKeyDown}>
                            <option value="">— unit —</option>
                            {entry.unitID && !units.some((u) => u.id === entry.unitID) && (
                              <option value={entry.unitID}>{entry.unitID} — not in unit master</option>
                            )}
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>{u.des || u.id}{u.enable ? '' : ' (Inactive)'}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input value={entry.batchNo} disabled={locked} placeholder="from the packet"
                            onChange={(e) => patchLine(entry.key, { batchNo: e.target.value })}
                            onKeyDown={entryKeyDown} />
                        </td>
                        <td>
                          <input ref={costRef} type="number" min="0" step="0.01" className="num"
                            value={entry.costPrice} disabled={locked} placeholder="master"
                            onChange={(e) => patchLine(entry.key, { costPrice: e.target.value })}
                            onKeyDown={entryKeyDown} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" className="num" value={entry.retailPrice}
                            disabled={locked} placeholder="master"
                            onChange={(e) => patchLine(entry.key, { retailPrice: e.target.value })}
                            onKeyDown={entryKeyDown} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.001" className="num" value={entry.grnQty}
                            disabled={locked}
                            onChange={(e) => patchLine(entry.key, { grnQty: e.target.value })}
                            onKeyDown={entryKeyDown} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.001" className="num" value={entry.freeQty}
                            disabled={locked}
                            onChange={(e) => patchLine(entry.key, { freeQty: e.target.value })}
                            onKeyDown={entryKeyDown} />
                        </td>
                        <td className="num strong">{money(lineValue(entry.costPrice, entry.grnQty, entry.freeQty))}</td>
                        <td>
                          <input type="date" value={entry.expDate} disabled={locked}
                            onChange={(e) => patchLine(entry.key, { expDate: e.target.value })}
                            onKeyDown={entryKeyDown} />
                        </td>
                        <td className="no-print entry-actions">
                          <button ref={addRef} className="btn primary small add-btn" type="button"
                            disabled={locked} onClick={acceptEntry}
                            title="Enter also works">Add</button>
                          <button className="btn small" type="button" disabled={locked || poQueue.length < 2}
                            onClick={skipEntry} title="Not on this delivery — the next line comes forward">
                            Skip
                          </button>
                          <button className="x" title="COST AND RETAIL PRICE" disabled={locked}
                            onClick={() => setPopupKey(entry.key)}>💲</button>
                        </td>
                      </tr>
                    )}

                    {lines.length === 0 && !entry && (
                      <tr>
                        <td className="empty" colSpan={11}>
                          {direct
                            ? 'No lines yet — press + Add line.'
                            : poNo
                              ? `Nothing added yet — the lines of ${poNo} arrive on the entry row, one at a time.`
                              : 'Choose a purchase order above, or switch to Direct GRN.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="po-form no-print">
                <label>Remarks</label>
                <input value={remarks} disabled={locked} onChange={(e) => { setRemarks(e.target.value); setDirty(true); }} />
                <label>Discount</label>
                <input type="number" min="0" step="0.01" className="num" value={discount} disabled={locked}
                  onChange={(e) => { setDiscount(e.target.value); setDirty(true); }} />
                <label>Adjustment</label>
                <input type="number" min="0" step="0.01" className="num" value={adjustment} disabled={locked}
                  onChange={(e) => { setAdjustment(e.target.value); setDirty(true); }} />
                <label>Net Value</label>
                <input value={money(totals.net)} readOnly className="num strong" />
              </div>

              <div className="po-totals">
                <span>Gross Total <b>{money(totals.gross)}</b></span>
                <span>Discount <b>{money(totals.dis)}</b></span>
                <span>Adjustment <b>{money(totals.adj)}</b></span>
                <span>Net Value <b>{money(totals.net)}</b></span>
              </div>

              <div className="po-actions no-print">
                <button className="btn" onClick={() => addLine()} disabled={locked || !direct}>+ Add line</button>
                <button className="btn" onClick={handleClear} disabled={busy}>Clear</button>
                <button className="btn" onClick={() => void handleConfirm()} disabled={busy || confirmed}>
                  {confirming ? 'Confirming…' : 'Confirmation'}
                </button>
                <button className="btn" onClick={() => window.print()} disabled={busy}>Print</button>
                <button className="btn" onClick={() => void openNotify()} disabled={busy || !grnNo || confirmed}
                  title="SMS an admin so they can come and confirm this receipt">
                  Message Admin
                </button>
                <button className="btn danger" onClick={() => void handleDelete()} disabled={busy || !grnNo || confirmed}>
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

      {/* ── TELL AN ADMIN TO CONFIRM IT ───────────────────────────────────
          Opened by Save (the receipt is in, the stock has not moved yet) and by
          the Message Admin button. Pick a person — or type a number — and send. */}
      {notifyOpen && (
        <div className="modal-bg no-print" onClick={() => setNotifyOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">MESSAGE AN ADMIN TO CONFIRM</div>
            <div className="modal-sub">
              GRN <b>{grnNo}</b> is saved. Stock moves only when somebody presses{' '}
              <b>Confirmation</b> — send them a message and they can confirm it.
            </div>

            {notifyMsg && <div className="po-error">{notifyMsg}</div>}

            {notifyLoading ? (
              <div className="modal-sub">Loading who can be messaged…</div>
            ) : notifyContacts.length === 0 ? (
              <div className="po-note">
                No staff record has a mobile number yet — type the number below instead.
                (Staff numbers come from <b>tbl_userdetails.ContNo</b>.)
              </div>
            ) : (
              <div className="notify-list">
                {notifyContacts.map((c) => (
                  <label key={c.userId} className={`notify-row ${notifyPick === c.userId && !notifyOther.trim() ? 'on' : ''}`}>
                    <input
                      type="radio"
                      name="notify-to"
                      checked={notifyPick === c.userId && !notifyOther.trim()}
                      onChange={() => { setNotifyPick(c.userId); setNotifyOther(''); }}
                    />
                    <span className="notify-name">{c.name}</span>
                    <span className="notify-role">{c.isAdmin ? `${c.group} · can confirm` : c.group || 'staff'}</span>
                    <span className="notify-phone">{displayPhone(c.phone)}</span>
                  </label>
                ))}
              </div>
            )}

            <label htmlFor="notify-other">Or another mobile number</label>
            <input
              id="notify-other"
              value={notifyOther}
              placeholder="07XXXXXXXX"
              onChange={(e) => setNotifyOther(e.target.value)}
            />

            <label htmlFor="notify-text">Message ({smsPartCount(notifyText)} SMS part{smsPartCount(notifyText) === 1 ? '' : 's'})</label>
            <textarea
              id="notify-text"
              rows={5}
              value={notifyText}
              onChange={(e) => setNotifyText(e.target.value)}
            />

            {notifyMissingEnv.length > 0 && (
              <div className="notify-hint">
                Filled in later in the <b>.env</b> file: <b>{notifyMissingEnv.join(', ')}</b> — add
                them and restart the server, and this button will send.
              </div>
            )}

            <div className="modal-actions">
              {notifySentTo && <span className="notify-sent">Sent to {notifySentTo} ✓</span>}
              <button className="btn" onClick={() => setNotifyOpen(false)}>
                {notifySentTo ? 'Close' : 'Not now'}
              </button>
              <button className="btn primary" onClick={() => void sendNotify()} disabled={notifySending}>
                {notifySending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COST AND RETAIL PRICE (legacy popup, page 6) ─────────────────── */}
      {popupLine && (
        <div className="modal-bg no-print" onClick={() => setPopupKey(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">COST AND RETAIL PRICE</div>
            <div className="modal-sub">{popupLine.itemName} <span className="mono">{popupLine.itemCode}</span></div>

            <table className="po-table">
              <thead>
                <tr><th className="num">COST PRICE</th><th className="num">RETAIL PRICE</th><th className="num">Available QTY</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="num">
                    <input type="number" min="0" step="0.01" className="num" value={popupLine.costPrice}
                      onChange={(e) => patchLine(popupLine.key, { costPrice: e.target.value })} />
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="0.01" className="num" value={popupLine.retailPrice}
                      onChange={(e) => patchLine(popupLine.key, { retailPrice: e.target.value })} />
                  </td>
                  <td className="num strong">{popupLine.stockBalance}</td>
                </tr>
              </tbody>
            </table>

            <label className="rad modal-check">
              <input type="checkbox" checked={popupLine.updItemPrice}
                onChange={(e) => patchLine(popupLine.key, { updItemPrice: e.target.checked })} />
              Update the item master retail price with this value when the GRN is confirmed
            </label>

            <div className="modal-actions">
              <button className="btn primary" onClick={() => setPopupKey(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── page CSS ────────────────────────────────────────────────────────────── */

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  /* ── the screen must look the same whatever the OS theme is ──────────────
     app/globals.css flips --foreground to #ededed inside
     @media (prefers-color-scheme: dark), so on a machine that prefers dark
     mode every element WITHOUT an explicit colour came out near-white: the
     Item Value column, the words on the toolbar and the form controls were
     invisible on the white rows. So the scheme is pinned to light here and
     every text/input colour is written out instead of inherited. */
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

  .po-form { display:grid; grid-template-columns:120px minmax(170px,1fr) 110px minmax(150px,1fr); gap:9px 12px; align-items:center; }
  .po-form label { font-size:11.5px; font-weight:700; color:#3c5a60; text-transform:uppercase; letter-spacing:0.03em; }
  .po-form input, .po-form select {
    height:32px; border:1px solid rgba(30,58,64,0.18); border-radius:7px; background:#fff;
    padding:0 9px; font-size:12.5px; font-family:inherit; color:#1f2937; width:100%; color-scheme:light;
  }
  .po-form input:disabled, .po-form select:disabled { background:#e5ebeb; color:#7b8f92; }
  .po-form input.num { text-align:right; }
  .po-form input.num.strong { font-weight:800; color:#16333a; }

  .po-find { display:flex; flex-wrap:wrap; align-items:center; gap:9px 12px; }
  .po-find label { font-size:11.5px; font-weight:700; color:#3c5a60; text-transform:uppercase; letter-spacing:0.03em; }
  .po-find input:not([type=radio]) { height:32px; border:1px solid rgba(30,58,64,0.18); border-radius:7px; padding:0 9px; font-size:12.5px; font-family:inherit; min-width:240px; }
  .rad { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#1f2937; text-transform:none; }
  .rad-row { display:flex; gap:16px; align-items:center; }

  .po-grid-wrap, .po-list-wrap { border:1px solid rgba(0,0,0,0.08); border-radius:10px; overflow:auto; background:#fff; max-height:50vh; }
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
  .po-table input { width:100%; height:28px; border:1px solid rgba(30,58,64,0.16); border-radius:6px; padding:0 7px; font-size:12px; font-family:inherit; color:#1f2937; background-color:#fff; }
  .po-table input.num { text-align:right; }
  .po-table input:disabled { background:#eef2f2; color:#7b8f92; }
  .po-table select { width:100%; height:28px; border:1px solid rgba(30,58,64,0.16); border-radius:6px; padding:0 4px; font-size:12px; font-family:inherit; color:#1f2937; background-color:#fff; }
  .po-table select:disabled { background:#eef2f2; color:#7b8f92; }
  .fixed-item { font-size:12px; color:#1f2937; }
  .mono { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11.5px; font-weight:700; color:#1e3a40; }
  .code-hint { font-size:10px; color:#8595a0; margin-top:2px; font-family:ui-monospace, Menlo, monospace; }
  .strong { font-weight:800; color:#16333a; }

  /* ── the entry row (one PO line at a time) ─────────────────────────────── */
  .entry-strip { display:flex; flex-wrap:wrap; gap:6px 14px; align-items:baseline; }
  .entry-hint { font-weight:600; color:#3c5a60; }
  .po-table tr.po-entry td { background:#fff8e1; border-top:2px solid #f5a623; border-bottom:2px solid #f5a623; }
  .po-table tr.po-entry td:first-child { border-left:2px solid #f5a623; }
  .po-table tr.po-entry td:last-child { border-right:2px solid #f5a623; }
  .po-table tr.po-entry input { border-color:#f0b84b; background:#fffdf6; }
  .entry-actions { white-space:nowrap; }
  .add-btn { background:#f5a623; border-color:#e0961a; color:#fff; }
  .add-btn:hover:not(:disabled) { background:#e0961a; }

  .po-totals { display:flex; flex-wrap:wrap; gap:8px 22px; font-size:12px; color:#3c5a60; }
  .po-totals b { color:#16333a; font-size:13px; margin-left:4px; }

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
  .x { border:none; background:transparent; color:#b91c1c; font-size:13px; cursor:pointer; line-height:1; padding:4px 6px; border-radius:6px; }
  .x:hover:not(:disabled) { background:#fee2e2; }
  .x:disabled { opacity:0.4; cursor:not-allowed; }

  .modal-bg { position:fixed; inset:0; background:rgba(15,40,45,0.45); display:flex; align-items:center; justify-content:center; z-index:5000; padding:20px; }
  .modal { background:#fff; border-radius:14px; padding:16px; width:min(620px,94vw); box-shadow:0 24px 60px rgba(0,0,0,0.32); display:flex; flex-direction:column; gap:11px; }
  .modal-head { background:#f5a623; color:#fff; font-weight:800; letter-spacing:0.05em; font-size:14px; padding:9px 12px; border-radius:9px; }
  .modal-sub { font-size:12.5px; color:#1f2937; }
  .modal-check { font-size:12px; color:#3c5a60; }
  .modal-actions { display:flex; justify-content:flex-end; gap:8px; align-items:center; }
  .modal textarea {
    border:1px solid rgba(30,58,64,0.18); border-radius:7px; padding:8px 9px; font-size:12.5px;
    font-family:inherit; color:#1f2937; background:#fff; resize:vertical; width:100%;
  }
  .modal > label { font-size:11.5px; font-weight:700; color:#3c5a60; text-transform:uppercase; letter-spacing:0.03em; }
  .modal > input {
    height:32px; border:1px solid rgba(30,58,64,0.18); border-radius:7px; background:#fff;
    padding:0 9px; font-size:12.5px; font-family:inherit; color:#1f2937; width:100%;
  }
  .notify-list { display:flex; flex-direction:column; gap:6px; max-height:220px; overflow:auto; }
  .notify-row {
    display:grid; grid-template-columns:24px minmax(120px,1fr) minmax(110px,1fr) 120px; align-items:center;
    gap:8px; border:1px solid rgba(30,58,64,0.14); border-radius:9px; padding:7px 10px; cursor:pointer;
    font-size:12.5px; color:#1f2937; background:#fff;
  }
  .notify-row.on { border-color:#1e3a40; background:#eef4f4; }
  .notify-name { font-weight:700; color:#16333a; }
  .notify-role { font-size:11px; color:#5c7b81; }
  .notify-phone { text-align:right; font-family:ui-monospace, Menlo, monospace; font-size:11.5px; }
  .notify-hint { font-size:11.5px; color:#b45309; background:#fef3c7; border-radius:8px; padding:7px 10px; }
  .notify-sent { font-size:11.5px; font-weight:700; color:#15803d; margin-right:auto; }

  .po-print-head { display:none; }

  @media print {
    .no-print, .po-tabs, .po-note, .po-state { display:none !important; }
    .po-table tr.po-entry { display:none !important; }
    .modal-bg { display:none !important; }
    .po-shell { display:block; height:auto; background:#fff; }
    .po-main { overflow:visible; padding:0; }
    .po-card { border:none; padding:0; }
    .po-print-head { display:block; font-size:12px; margin-bottom:8px; }
    .po-grid-wrap { max-height:none; overflow:visible; border:none; }
    .po-table thead th { background:#eee; }
  }
`;
