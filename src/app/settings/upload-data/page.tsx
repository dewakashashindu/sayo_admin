// src/app/settings/upload-data/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// System Settings → Start-up Settings → Upload Data
//
// One page, two tabs at the top of it:
//
//   CHECK        load a file; it is checked cell by cell against the real
//                table the moment it is chosen
//   ADD TO LIVE  what is waiting in the Temp tables, and the button that moves
//                it into the real table
//
// The order matters, and it is the whole point of the screen. A row never
// reaches a master table by being loaded:
//
//   1. a file is chosen        the preview appears, and the check starts by
//                              itself — there is no VERIFY button to remember
//   2. cell by cell            each cell fills in the moment it has been
//                              compared with what the database holds
//   3. the shop, if it exists  a popup names the record, shows the database
//                              beside the file, and asks. Answer "no" and
//                              the whole thing stops — go and fix the file.
//   4. CONFIRM                 the rows that survived are parked in Temp
//   5. the next file           the screen is ready for the next file
//   6. ADD TO LIVE              the one button that writes to a real table
//
// So exactly one button in this screen changes a master screen's data, it is
// on the other tab, and it says so on its face.
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS, IChevDown } from '@/components/AdminSidebar';
import UserName from '@/components/UserName';
import {
  MASTERS, masterByKey, matchHeaders, missingColumns, toFlag,
  type Master, type MasterColumn,
} from '@/lib/uploadMasters';
import { readSpreadsheet } from '@/lib/xlsxReader';
import { useMyAccess } from '@/lib/useMyAccess';
import type {
  CellVerdict, GoLiveResponse, PendingBatch, PendingDetail, StageResponse, VerifiedRow,
} from '@/lib/uploadTypes';

type Tab = 'check' | 'live';
/** what the screen is doing. `checking` covers the whole cell-by-cell pass. */
type Phase = 'idle' | 'loading' | 'checking' | 'ready' | 'saving' | 'saved' | 'error';

interface PreviewRow {
  values: string[];   // aligned to master.columns, '' where the file had nothing
  issues: string[];   // problems this screen can see without the database
}

/** One checked cell, as the check streams it in. */
interface CheckedCell {
  incoming: string;
  current: string;
  verdict: CellVerdict;
  note?: string;
}

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  @keyframes veilIn { from { opacity:0; } to { opacity:1; } }
  @keyframes pulseRow { 0%,100% { background:rgba(255,255,255,1); } 50% { background:rgba(224,242,254,0.85); } }
  .spinner { width:15px; height:15px; border-radius:50%;
    border:2px solid rgba(30,58,64,0.18); border-top-color:#1e3a40;
    animation:spin 0.7s linear infinite; display:inline-block; vertical-align:-2px; }
  .spinner-lg { width:34px; height:34px; border-radius:50%;
    border:3px solid rgba(30,58,64,0.15); border-top-color:#1e3a40;
    animation:spin 0.8s linear infinite; }

  .up-btn { display:inline-flex; align-items:center; gap:7px; height:38px; padding:0 16px;
    border:none; border-radius:10px; background:#1e3a40; color:#fff; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; }
  .up-btn:hover:not(:disabled) { background:#16303a; }
  .up-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .up-btn-ghost { background:#fff; color:#1e3a40; border:1.5px solid #c0cbcc; }
  .up-btn-ghost:hover:not(:disabled) { background:#eef4f4; border-color:#8fa9ac; }
  .up-btn-go { background:#15803d; }
  .up-btn-go:hover:not(:disabled) { background:#166534; }

  .up-select { height:38px; padding:0 34px 0 12px; border-radius:10px; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:600; color:#1f2937; background:#fff; border:1.5px solid #c0cbcc;
    outline:none; cursor:pointer; appearance:none;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round'><polyline points='6 9 12 15 18 9'/></svg>");
    background-repeat:no-repeat; background-position:right 11px center; }
  .up-select:hover { border-color:#8fa9ac; }
  .up-select:disabled { opacity:0.5; cursor:not-allowed; }

  .up-panel { background:#deeaea; border-radius:12px; display:flex; flex-direction:column;
    overflow:hidden; box-shadow:0 1px 5px rgba(0,0,0,0.08); }

  .up-table-wrap { flex:1; overflow:auto; background:#e8f0f1; }
  .up-table { border-collapse:separate; border-spacing:0; width:100%; font-size:12px; }
  .up-table thead th { position:sticky; top:0; z-index:2; background:#1e3a40; color:#fff;
    text-align:left; padding:9px 12px; font-weight:700; font-size:11px; letter-spacing:0.04em;
    white-space:nowrap; border-right:1px solid rgba(255,255,255,0.08); }
  .up-table thead th small { display:block; font-weight:500; font-size:9.5px; color:rgba(255,255,255,0.5);
    letter-spacing:0; margin-top:2px; }
  .up-table thead th.up-key { background:#0f2830; }
  .up-table thead th.up-missing { background:#7c2d12; }
  .up-table tbody td { padding:7px 12px; border-bottom:1px solid rgba(30,58,64,0.07);
    white-space:nowrap; color:#1f2937; background:#fff; }
  .up-table tbody tr:nth-child(even) td { background:#f6fafa; }
  .up-table tbody td.up-num { text-align:right; font-variant-numeric:tabular-nums; }
  .up-flag { display:inline-flex; align-items:center; gap:5px; font-weight:700; font-size:11px;
    padding:1px 8px; border-radius:999px; }
  .up-flag-on  { background:rgba(22,163,74,0.12);  color:#15803d; }
  .up-flag-off { background:rgba(107,114,128,0.14); color:#6b7280; }
  .up-rownum { color:#9ca3af; font-weight:700; font-size:11px; background:#eef4f4 !important;
    text-align:right; font-variant-numeric:tabular-nums; position:sticky; left:0; z-index:1; }
  .up-bad { background:rgba(239,68,68,0.09) !important; }
  .up-verdict-same    { background:#f6fafa; }
  .up-verdict-changed { background:#fff7ed !important; box-shadow:inset 3px 0 0 #ea580c; }
  .up-verdict-new     { background:#f0fdf4 !important; }
  .up-verdict-problem { background:#fef2f2 !important; box-shadow:inset 3px 0 0 #dc2626; }
  .up-verdict-wait    { background:transparent; }
  .up-waiting { color:#cbd5e1; }
  .up-wait-dot { display:inline-block; width:5px; height:5px; border-radius:50%;
    background:#cbd5e1; vertical-align:middle; }
  .up-row-doing td { animation:pulseRow 0.9s ease-in-out infinite; }
  .up-row-state { display:inline-flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800;
    letter-spacing:0.03em; padding:1px 6px; border-radius:5px; }
  .up-st-new    { background:rgba(22,163,74,0.14);  color:#15803d; }
  .up-st-update { background:rgba(234,88,12,0.15);  color:#c2410c; }
  .up-st-wait   { background:rgba(148,163,184,0.18); color:#94a3b8; }

  .up-tab { background:none; border:none; cursor:pointer; font-family:'Inter',sans-serif;
    font-size:12.5px; font-weight:700; letter-spacing:0.06em; color:rgba(255,255,255,0.55);
    padding:11px 17px; border-bottom:2.5px solid transparent; display:inline-flex; align-items:center; gap:7px; }
  .up-tab:hover { color:rgba(255,255,255,0.85); }
  .up-tab-on { color:#fff; border-bottom-color:#fff; }
  .up-tab-badge { background:#f59e0b; color:#1f2937; border-radius:999px; padding:1px 7px;
    font-size:10px; font-weight:800; letter-spacing:0; }

  .up-veil { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center;
    background:rgba(238,244,244,0.82); animation:veilIn 0.15s ease-out; }
  .up-modal-veil { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center;
    background:rgba(15,40,48,0.55); padding:24px; animation:veilIn 0.15s ease-out; }
  .up-modal { background:#fff; border-radius:14px; max-width:920px; width:100%; max-height:86vh;
    display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.32);
    animation:fadeUp 0.18s ease-out; }

  .up-pill { display:inline-block; font-size:9.5px; font-weight:800; letter-spacing:0.04em;
    padding:1px 6px; border-radius:5px; }
  .up-pill-same { background:rgba(107,114,128,0.13); color:#6b7280; }
  .up-pill-changed { background:rgba(234,88,12,0.15); color:#c2410c; }
  .up-pill-new { background:rgba(22,163,74,0.14); color:#15803d; }
  .up-pill-blank { background:rgba(107,114,128,0.1); color:#9ca3af; }
  .up-pill-problem { background:rgba(220,38,38,0.13); color:#b91c1c; }

  ::-webkit-scrollbar       { width:9px; height:9px; }
  ::-webkit-scrollbar-track  { background:transparent; }
  ::-webkit-scrollbar-thumb  { background:rgba(30,58,64,0.22); border-radius:5px; }

  @media(max-width:767px) {
    .up-table-wrap { -webkit-overflow-scrolling:touch; }
    .main-body { padding-bottom:88px !important; }
  }
`;

function IBell() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function FlagMark({ on }: { on: boolean }) {
  return (
    <span className={`up-flag ${on ? 'up-flag-on' : 'up-flag-off'}`}>
      {on ? 'Yes' : 'No'}
    </span>
  );
}

const VERDICT_CLASS: Record<string, string> = {
  same: 'up-pill-same', changed: 'up-pill-changed', new: 'up-pill-new',
  blank: 'up-pill-blank', problem: 'up-pill-problem',
};
const VERDICT_WORD: Record<string, string> = {
  same: 'same', changed: 'changes', new: 'new', blank: 'blank', problem: 'problem',
};

export default function UploadDataPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const { loaded: accessLoaded, superAdmin } = useMyAccess();

  const [navKey, setNavKey] = useState('settings-uploaddata');
  const [tab, setTab] = useState<Tab>('check');

  const [masterKey, setMasterKey] = useState(MASTERS[0].key);
  const master: Master = useMemo(() => masterByKey(masterKey), [masterKey]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [missing, setMissing] = useState<MasterColumn[]>([]);
  /** master column index → index of that column in the file's header row */
  const [uploadedCols, setUploadedCols] = useState<(number | null)[]>([]);

  /** cell index → what the check found, filled in as the answers arrive */
  const [checked, setChecked] = useState<CheckedCell[]>([]);
  const [rowState, setRowState] = useState<{ status: 'new' | 'update' | 'wait';
    key: Record<string, string>; problems: string[] }[]>([]);
  const [doneRow, setDoneRow] = useState(-1);
  const [counts, setCounts] = useState({ newCount: 0, updateCount: 0, problemCount: 0 });

  /** rows the shop has agreed may overwrite what is already live */
  const [approved, setApproved] = useState<Set<number>>(new Set());
  /* The record the popup is about, and WHICH row it is. `at` is the position
     in the check; `fileRow` inside the row is the line in the Excel file. The
     two are different numbers and neither is used to derive the other — the
     first is an index into this check, the second is what the shop reads in
     their file. */
  const [conflict, setConflict] = useState<VerifiedRow | null>(null);
  const [conflictAt, setConflictAt] = useState(-1);
  const [staged, setStaged] = useState<StageResponse | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // The check belongs to the file that is on screen; a stale reply from a file
  // the shop has already replaced must not paint over the new one.
  const runId = useRef(0);

  // The same check result, held in refs as well as state. State updates are
  // asynchronous, so by the time the "you already have this" popup is built the
  // rendered cells would still be a render behind — and the popup has to show
  // the values that were actually compared. These are the source of truth for
  // anything that needs the finished result at once.
  const cellsRef = useRef<CheckedCell[]>([]);
  const rowsRef = useRef<{ status: 'new' | 'update' | 'wait';
    key: Record<string, string>; problems: string[] }[]>([]);
  const approvedRef = useRef<Set<number>>(new Set());

  const countPending = useCallback(async () => {
    try {
      const res = await fetch('/api/upload/pending', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setPendingCount((data.batches ?? []).reduce((n: number, b: PendingBatch) => n + b.rows, 0));
    } catch { /* the badge is a nicety; a failed count must not break the screen */ }
  }, []);

  useEffect(() => { void countPending(); }, [countPending]);

  const clearCheck = useCallback(() => {
    setConflictAt(-1);
    setChecked([]);
    setRowState([]);
    cellsRef.current = [];
    rowsRef.current = [];
    approvedRef.current = new Set();
    setDoneRow(-1);
    setCounts({ newCount: 0, updateCount: 0, problemCount: 0 });
    setApproved(new Set());
    setStaged(null);
  }, []);

  /** The popup for the row at index r, built from the finished check. */
  const conflictFor = useCallback((r: number): VerifiedRow => {
    const st = rowsRef.current[r] ?? { status: 'update' as const, key: {}, problems: [] };
    return {
      fileRow: r + 2,
      key: st.key,
      status: 'update',
      problems: st.problems,
      blocked: st.problems.length > 0,
      cells: master.columns.map((c, ci) => {
        const cell = cellsRef.current[r * master.columns.length + ci];
        return {
          column: c.name,
          incoming: cell?.incoming ?? '',
          current: cell?.current ?? '',
          verdict: cell?.verdict ?? 'same',
          note: cell?.note,
        };
      }),
    };
  }, [master]);

  const reset = useCallback(() => {
    setPhase('idle');
    setFileName('');
    setError(null);
    setRows([]);
    setMissing([]);
    setUploadedCols([]);
    clearCheck();
  }, [clearCheck]);

  const pickMaster = (key: string) => {
    setMasterKey(key);
    reset();
  };

  /* ─────────── the check: one cell at a time, straight off the wire ─────────── */

  const runCheck = useCallback(async (fileRows: PreviewRow[], cols: (number | null)[], mine: number) => {
    const colIndex = new Map(master.columns.map((c, i) => [c.name, i]));

    setPhase('checking');
    setError(null);
    cellsRef.current = new Array(master.columns.length * fileRows.length);
    rowsRef.current = fileRows.map(() => ({ status: 'wait' as const, key: {}, problems: [] }));
    approvedRef.current = new Set();
    setChecked(cellsRef.current);
    setRowState(rowsRef.current);
    setDoneRow(-1);
    setCounts({ newCount: 0, updateCount: 0, problemCount: 0 });

    const applyCell = (r: number, c: string, cell: CheckedCell) => {
      const ci = colIndex.get(c);
      if (ci === undefined) return;
      cellsRef.current[r * master.columns.length + ci] = cell;
      setChecked(cellsRef.current.slice());
    };

    try {
      const res = await fetch('/api/upload/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master: masterKey,
          rows: fileRows.map((r) => ({
            values: Object.fromEntries(master.columns.map((c, i) => [c.name, r.values[i]])),
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'The database could not be reached.');
      }

      // Newline-delimited JSON, read a line at a time as it lands. A parse
      // that is only half a line is held back until the rest of it arrives.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const summaries: { r: number; status: 'new' | 'update';
        key: Record<string, string>; problems: string[]; blocked: boolean }[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (mine !== runId.current) return;   // a newer file took over
        buf += decoder.decode(value, { stream: true });

        let at: number;
        while ((at = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, at).trim();
          buf = buf.slice(at + 1);
          if (!line) continue;
          const e = JSON.parse(line);

          if (e.t === 'cell') {
            applyCell(e.r, e.c, { incoming: e.v, current: e.from, verdict: e.verdict, note: e.note });
          } else if (e.t === 'row') {
            summaries.push(e);
            rowsRef.current[e.r] = { status: e.status, key: e.key, problems: e.problems };
            setDoneRow(e.r);
            setRowState(rowsRef.current.slice());
          } else if (e.t === 'done') {
            setCounts({ newCount: e.newCount, updateCount: e.updateCount, problemCount: e.problemCount });
          } else if (e.t === 'error') {
            throw new Error(e.message);
          }
        }
      }

      if (mine !== runId.current) return;

      // The check is finished. If the shop has not yet answered for a row that
      // is already live, ask now — the answer is the only thing standing
      // between the file and being saved.
      const nextClash = summaries.find((s) => s.status === 'update');
      if (nextClash) { setConflictAt(nextClash.r); setConflict(conflictFor(nextClash.r)); }
      setPhase('ready');
    } catch (e) {
      if (mine !== runId.current) return;
      setError((e as Error).message || 'Could not check this file.');
      setPhase('error');
    }
  }, [master, masterKey, conflictFor]);

  /* ─────────────────────── load: preview, then check it ─────────────────────── */

  const loadFile = async (file: File) => {
    const mine = ++runId.current;
    setFileName(file.name);
    setError(null);
    setPhase('loading');
    setRows([]);
    setMissing([]);
    clearCheck();

    try {
      const sheet = await readSpreadsheet(file);
      const [header, ...body] = sheet.rows;
      if (mine !== runId.current) return;

      if (!header || header.length === 0) {
        setError('That file has no rows.');
        setPhase('error');
        return;
      }

      const map = matchHeaders(header, master);
      const absent = missingColumns(header, master);

      if (absent.length === master.columns.length) {
        setError(`None of the ${master.label} columns were found in the first row of the file.`);
        setPhase('error');
        return;
      }

      /* A line with nothing in it is not a record.
         The reader already drops rows whose every cell is empty, but a sheet
         formatted with a numbering formula down the first column — which is
         exactly what the templates we handed out do — has a value in that cell
         and so survives, and then every one of those empty lines is reported as
         a row with a blank key. A file with 5 rows came back as 500. So the
         test is made here instead, against the columns that actually matter: a
         row counts only if something was typed into at least one of them. */
      const preview: PreviewRow[] = [];
      body.forEach((raw, at) => {
        const values = map.map((c) => (c === null ? '' : (raw[c] ?? '').trim()));
        if (values.every((v) => v === '')) return;

        const issues: string[] = [];
        master.keyColumns.forEach((key, i) => { if (!values[i]) issues.push(`${key} is blank`); });
        master.columns.forEach((col, i) => {
          const v = values[i];
          if (!v) return;
          if (col.kind === 'number' && v !== '' && Number.isNaN(Number(v.replace(/,/g, '')))) {
            issues.push(`${col.name} is not a number`);
          }
        });
        preview.push({ values, issues });
      });

      setUploadedCols(map);
      setMissing(absent);
      setRows(preview);

      // There is no VERIFY button: the file is checked as soon as it is read.
      if (absent.length === 0) await runCheck(preview, map, mine);
      else setPhase('ready');
    } catch (e) {
      if (mine !== runId.current) return;
      setError((e as Error).message || 'Could not read that file.');
      setPhase('error');
    }
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = ''; // let the same file be picked again
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  /* ───────────────────────── the "already exists" answer ───────────────────────── */

  const acceptUpdate = () => {
    if (!conflict) return;
    const next = new Set(approvedRef.current);
    next.add(conflictAt);
    approvedRef.current = next;
    setApproved(next);
    // Keep walking: a file can hit the same thing on twenty rows.
    let ask = -1;
    for (let i = 0; i < rowsRef.current.length; i++) {
      if (rowsRef.current[i].status === 'update' && !next.has(i)) { ask = i; break; }
    }
    setConflictAt(ask);
    setConflict(ask < 0 ? null : conflictFor(ask));
  };

  const declineUpdate = () => {
    setConflictAt(-1);
    setConflict(null);
    clearCheck();
    setPhase('ready');
    setError(
      'Nothing was saved. This record already exists in the database and you chose not to '
      + 'change it — open the Excel file, correct the row, and load it again.',
    );
  };

  /* ──────────────────────────── CONFIRM: park in Temp ──────────────────────────── */

  const saveBatch = async () => {
    setPhase('saving');
    setError(null);
    try {
      const res = await fetch('/api/upload/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master: masterKey,
          statuses: rowState.map((s) => (s.status === 'update' ? 'update' : 'new')),
          // Send what the check compared, not the raw cell: a Yes/No has
          // already been turned into what the column actually holds, and a date
          // has been read into one form.
          rows: rows.map((r, ri) => ({
            values: Object.fromEntries(master.columns.map((c, ci) => {
              const cell = cellsRef.current[ri * master.columns.length + ci];
              return [c.name, cell ? cell.incoming : r.values[ci]];
            })),
          })),
        }),
      });
      const data = (await res.json()) as StageResponse;
      if (!res.ok) throw new Error(data.error || 'This file could not be saved.');
      setStaged(data);
      setPhase('saved');
      void countPending();
    } catch (e) {
      setError((e as Error).message || 'Could not save this file.');
      setPhase('error');
    }
  };

  const badRows = rows.filter((r) => r.issues.length > 0).length;
  const unapproved = rowState.filter(
    (s, i) => s.status === 'update' && !approvedRef.current.has(i),
  ).length;
  const canSave = phase === 'ready' && rowState.length > 0
    && unapproved === 0 && counts.problemCount === 0 && badRows === 0;
  const busy = phase === 'loading' || phase === 'checking' || phase === 'saving';
  const checkedSoFar = checked.filter(Boolean).length;
  const totalCells = rows.length * master.columns.length;

  /* The super administrator and nobody else.
     Every /api/upload/* route answers this same question with
     requireSuperAdmin(), so this block is not the thing that keeps anybody out —
     it is the thing that says so plainly instead of letting somebody load the
     screen and only then find the buttons do nothing. */
  if (!accessLoaded || !superAdmin) {
    return (
      <>
        <style>{SIDEBAR_CSS}</style>
        <style>{PAGE_CSS}</style>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
          <AdminSidebar
            active={navKey}
            onNav={(k, p) => { setNavKey(k); router.push(p); }}
            onLogout={() => router.push('/admin-login')}
          />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            {!accessLoaded ? (
              <span className="spinner-lg" />
            ) : (
              <div style={{
                maxWidth: 460, background: '#fff', borderRadius: 14, padding: '30px 34px',
                textAlign: 'center', boxShadow: '0 8px 28px rgba(0,0,0,0.10)',
              }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e3a40' }}>
                  This screen is for the super administrator
                </h2>
                <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.65, marginTop: 11 }}>
                  Uploading a file writes rows into the master tables, so only the super
                  administrator may open it. Ask the super administrator to run this upload
                  for you.
                </p>
                <button
                  className="up-btn up-btn-ghost"
                  style={{ marginTop: 20, height: 34 }}
                  onClick={() => router.push('/dashboard')}
                >
                  Back to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
        <AdminSidebar
          active={navKey}
          onNav={(k, p) => { setNavKey(k); router.push(p); }}
          onLogout={() => router.push('/admin/login')}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* HEADER */}
          <header style={{
            background: '#dae6e6', height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
            padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 10,
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                style={{
                  border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px', height: 40,
                  width: 230, fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#1f2937',
                  background: '#fff', outline: 'none',
                }}
                placeholder="Search masters…"
                value=""
                onChange={() => {}}
                readOnly
              />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#374151',
              display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8,
            }}>
              <IBell />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}><UserName /></span>
              <IChevDown />
            </div>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#5a8a92,#3a6a72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              fontWeight: 700, fontSize: 14, flexShrink: 0,
            }}>S</div>
          </header>

          {/* BODY */}
          <div className="main-body" style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* the two tabs, at the top of this page */}
            <div style={{
              background: '#1e3a40', borderRadius: 12, flexShrink: 0, display: 'flex',
              alignItems: 'center', boxShadow: '0 1px 5px rgba(0,0,0,0.08)', overflow: 'hidden',
            }}>
              <button className={`up-tab ${tab === 'check' ? 'up-tab-on' : ''}`} onClick={() => setTab('check')}>
                CHECK
              </button>
              <button className={`up-tab ${tab === 'live' ? 'up-tab-on' : ''}`} onClick={() => setTab('live')}>
                ADD TO LIVE
                {pendingCount > 0 && <span className="up-tab-badge">{pendingCount}</span>}
              </button>
              <div style={{ flex: 1 }} />
              <p style={{
                color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500, padding: '0 16px',
                textAlign: 'right', lineHeight: 1.4, maxWidth: 460,
              }}>
                {tab === 'check'
                  ? 'A file is checked the moment it is loaded. Checking never writes anything.'
                  : 'The only place an uploaded row reaches a master table.'}
              </p>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 13, minHeight: 0 }}>

            {tab === 'check' ? (
              <>
                {/* LEFT */}
                <div className="up-panel" style={{ width: 300, flexShrink: 0 }}>
                  <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(30,58,64,0.1)', flexShrink: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(30,58,64,0.55)' }}>
                      Start-up Settings
                    </p>
                    <p style={{ fontSize: 19, fontWeight: 800, color: '#1e3a40', marginTop: 2 }}>
                      UPLOAD DATA
                    </p>
                  </div>

                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
                    <div>
                      <label htmlFor="up-master" style={{
                        display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: '#6b7280', marginBottom: 7,
                      }}>Master</label>
                      <select
                        id="up-master"
                        className="up-select"
                        style={{ width: '100%' }}
                        value={masterKey}
                        onChange={(e) => pickMaster(e.target.value)}
                        disabled={busy}
                      >
                        {MASTERS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                      <p style={{ fontSize: 11.5, color: '#6b7280', marginTop: 8, lineHeight: 1.5 }}>
                        {master.blurb}
                      </p>
                    </div>

                    <div style={{ height: 1, background: 'rgba(30,58,64,0.1)' }} />

                    <div>
                      <label htmlFor="up-file" style={{
                        display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: '#6b7280', marginBottom: 7,
                      }}>File</label>
                      <input
                        ref={fileInput}
                        id="up-file"
                        type="file"
                        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={onFileChosen}
                        style={{ display: 'none' }}
                      />
                      <button
                        className="up-btn"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => fileInput.current?.click()}
                        disabled={busy}
                      >
                        {phase === 'loading' && <span className="spinner" style={{ borderTopColor: '#fff' }} />}
                        LOAD
                      </button>
                      <p style={{
                        fontSize: 11.5, color: fileName ? '#1e3a40' : '#9ca3af', marginTop: 9,
                        wordBreak: 'break-all', lineHeight: 1.5,
                      }}>
                        {fileName || 'No file chosen yet. .xlsx or .csv from this device.'}
                      </p>
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>
                        Choose a file and it is checked straight away — cell by cell — against
                        the real table. Nothing is saved until you press CONFIRM.
                      </p>
                    </div>

                    {rows.length > 0 && (
                      <>
                        <div style={{ height: 1, background: 'rgba(30,58,64,0.1)' }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Stat n={rows.length} label="rows" tone="#1e3a40" />
                          <Stat n={master.columns.length - missing.length} label="columns" tone="#1e3a40" />
                          <Stat n={missing.length} label="missing" tone={missing.length ? '#b45309' : '#15803d'} />
                          <Stat n={badRows} label="to check" tone={badRows ? '#b91c1c' : '#15803d'} />
                        </div>
                      </>
                    )}

                    {(phase === 'ready' || phase === 'saved') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ height: 1, background: 'rgba(30,58,64,0.1)' }} />
                        <Stat n={counts.newCount} label="new rows" tone="#15803d" />
                        <Stat n={counts.updateCount} label="already in DB"
                          tone={counts.updateCount ? '#c2410c' : '#15803d'} />
                        <Stat n={counts.problemCount} label="with problems"
                          tone={counts.problemCount ? '#b91c1c' : '#15803d'} />
                      </div>
                    )}

                    {error && (
                      <div style={{
                        background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10,
                        padding: '10px 12px', fontSize: 11.5, color: '#991b1b', lineHeight: 1.55,
                      }}>{error}</div>
                    )}

                    {phase === 'saved' && staged && (
                      <div style={{
                        background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10,
                        padding: '10px 12px', fontSize: 11.5, color: '#166534', lineHeight: 1.55,
                      }}>
                        <strong>{staged.staged} row{staged.staged === 1 ? '' : 's'} saved</strong> to
                        the pending list. The {master.label} table has not been touched yet.
                        <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                          <button className="up-btn" style={{ height: 30, fontSize: 12 }}
                            onClick={() => fileInput.current?.click()}>
                            LOAD THE NEXT FILE
                          </button>
                          <button className="up-btn up-btn-ghost" style={{ height: 30, fontSize: 12 }}
                            onClick={() => setTab('live')}>
                            GO TO ADD TO LIVE
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT */}
                <div className="up-panel" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <div style={{
                    background: '#1e3a40', padding: '0 18px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}>
                    <div style={{ minWidth: 0, padding: '12px 0 10px' }}>
                      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {master.label}
                      </p>
                      <p style={{ color: '#fff', fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                        {master.columns.length} COLUMNS
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginLeft: 10 }}>
                          checked one cell at a time against {master.table}
                        </span>
                      </p>
                    </div>

                    <div style={{ flex: 1 }} />

                    <StatusPill phase={phase} count={rows.length} missing={missing}
                      error={error} done={checkedSoFar} total={totalCells}
                      newCount={counts.newCount} updateCount={counts.updateCount} />

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        className="up-btn up-btn-ghost"
                        onClick={() => fileInput.current?.click()}
                        disabled={busy}
                        style={{ height: 34 }}
                      >
                        Change file
                      </button>
                      <button
                        className="up-btn up-btn-go"
                        onClick={saveBatch}
                        disabled={!canSave}
                        style={{ height: 34 }}
                        title={canSave
                          ? 'Save these rows to the pending list'
                          : counts.problemCount > 0 ? 'Some rows have problems — fix them and load the file again'
                          : unapproved > 0 ? 'Answer the question about the existing records first'
                          : badRows > 0 ? 'Some rows have a blank key or a bad number'
                          : 'Load a file first'}
                      >
                        {phase === 'saving' && <span className="spinner" style={{ borderTopColor: '#fff' }} />}
                        CONFIRM
                      </button>
                    </div>
                  </div>

                  <StepStrip phase={phase} saved={!!staged} />

                  {counts.problemCount > 0 && phase !== 'checking' && (
                    <div style={{
                      flexShrink: 0, background: '#fef2f2', borderBottom: '1px solid #fecaca',
                      padding: '10px 18px', maxHeight: 130, overflowY: 'auto',
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: '#991b1b' }}>
                        {counts.problemCount} row{counts.problemCount === 1 ? '' : 's'} cannot be saved — the numbers below are the rows in your Excel file
                      </p>
                      <ul style={{ margin: '4px 0 0 16px', fontSize: 11.5, color: '#991b1b', lineHeight: 1.6 }}>
                        {rowState.map((s, i) => s.problems.length > 0 && (
                          <li key={i}>
                            {/* the Excel row number — the number shown down
                                Excel's own left-hand edge */}
                            <strong>Row {i + 2}</strong>
                            {Object.values(s.key).filter(Boolean).length > 0 &&
                              ` (${Object.entries(s.key).filter(([, v]) => v)
                                .map(([k, v]) => `${k} ${v}`).join(', ')})`}
                            {' — '}{s.problems.join('; ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div
                    className="up-table-wrap"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                  >
                    {rows.length === 0 ? (
                      <div style={{
                        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', color: '#9ca3af', gap: 10, padding: 24, textAlign: 'center',
                      }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <p style={{ fontSize: 13 }}>
                          {phase === 'error' ? (error ?? 'Could not read that file.')
                            : phase === 'loading' ? 'Reading the file…'
                            : 'Press LOAD and choose an Excel file from this device.'}
                        </p>
                        <p style={{ fontSize: 11.5, maxWidth: 430, lineHeight: 1.6 }}>
                          Drop the file here instead if that is easier. The first row of the file is
                          read as the header, so it must carry these {master.columns.length} column
                          names. As soon as it is read, every cell is checked against{' '}
                          {master.table} — nothing is written at this stage.
                        </p>
                      </div>
                    ) : (
                      <table className="up-table">
                        <thead>
                          <tr>
                            <th className="up-rownum" style={{ position: 'sticky', left: 0, top: 0, zIndex: 3 }}>#</th>
                            <th style={{ minWidth: 96 }}>In the database</th>
                            {master.columns.map((col, i) => {
                              const inFile = uploadedCols[i] !== null;
                              const isKey = master.keyColumns.includes(col.name);
                              return (
                                <th
                                  key={col.name}
                                  className={[isKey ? 'up-key' : '', inFile ? '' : 'up-missing'].filter(Boolean).join(' ')}
                                >
                                  {col.name}
                                  {!inFile && <small>not in file</small>}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, r) => {
                            const st = rowState[r];
                            const isLive = st?.status === 'update';
                            const isDoing = phase === 'checking' && r === doneRow + 1;
                            return (
                              <tr key={r} className={isDoing ? 'up-row-doing' : ''}>
                                {/* the Excel row number, which is what the shop
                                    will look for in the file itself */}
                                <td className="up-rownum">{r + 2}</td>
                                <td>
                                  {!st || st.status === 'wait' ? (
                                    <span className="up-row-state up-st-wait">
                                      <span className="up-wait-dot" /> checking
                                    </span>
                                  ) : (
                                    <span className={`up-row-state ${isLive ? 'up-st-update' : 'up-st-new'}`}>
                                      {isLive ? 'EXISTS' : 'NEW'}
                                    </span>
                                  )}
                                </td>
                                {row.values.map((v, c) => {
                                  const col = master.columns[c];
                                  const blank = uploadedCols[c] === null;
                                  const cell = checked[r * master.columns.length + c];
                                  const tone = !cell ? '' : `up-verdict-${cell.verdict}`;
                                  return (
                                    <td
                                      key={col.name}
                                      className={[
                                        col.kind === 'number' ? 'up-num' : '',
                                        row.issues.length > 0 ? 'up-bad' : '',
                                        tone,
                                      ].filter(Boolean).join(' ')}
                                      style={blank ? { background: 'rgba(107,114,128,0.06)', color: '#9ca3af' } : undefined}
                                      title={[
                                        ...row.issues,
                                        ...(cell?.note ? [cell.note] : []),
                                        ...(cell && cell.verdict === 'changed' ? [`In the database now: ${cell.current || '(blank)'}`] : []),
                                        ...(!cell ? ['not checked yet'] : []),
                                      ].join(' · ')}
                                    >
                                      {blank ? '—'
                                        : !cell
                                          ? <span className="up-waiting"><span className="up-wait-dot" /></span>
                                          : cell.verdict === 'blank'
                                            ? <span style={{ color: '#cbd5e1' }}>empty</span>
                                            : col.kind === 'flag'
                                              ? <FlagMark on={toFlag(cell.incoming)} />
                                              : cell.incoming === ''
                                                ? <span style={{ color: '#cbd5e1' }}>empty</span>
                                                : cell.incoming}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {phase === 'checking' && (
                    <div className="up-veil">
                      <div style={{
                        background: '#fff', borderRadius: 14, padding: '26px 34px', textAlign: 'center',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.14)', display: 'flex',
                        flexDirection: 'column', alignItems: 'center', gap: 13, minWidth: 300,
                      }}>
                        <span className="spinner-lg" />
                        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e3a40' }}>
                          Checking cell by cell…
                        </p>
                        <p style={{ fontSize: 12, color: '#6b7280', maxWidth: 330, lineHeight: 1.6 }}>
                          Each cell is being compared with {master.table}. The grid behind this
                          is filling in as the answers come back. Nothing is being changed.
                        </p>
                        <div style={{ width: 300 }}>
                          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', background: '#1e3a40', borderRadius: 999,
                              width: `${totalCells ? Math.round((checkedSoFar / totalCells) * 100) : 0}%`,
                              transition: 'width 0.15s linear',
                            }} />
                          </div>
                          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6, fontWeight: 700 }}>
                            {checkedSoFar} of {totalCells} cells checked
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <LiveTab onBack={() => setTab('check')} onChanged={countPending} />
            )}
            </div>
          </div>
        </div>
      </div>

      {conflict && (
        <ConflictPopup
          master={master}
          row={conflict}
          onAccept={acceptUpdate}
          onDecline={declineUpdate}
        />
      )}
    </>
  );
}

/* ───────────────────────────── the status pill ───────────────────────────── */

function StatusPill({ phase, count, missing, error, done, total, newCount, updateCount }: {
  phase: Phase; count: number; missing: MasterColumn[]; error: string | null;
  done: number; total: number; newCount: number; updateCount: number;
}) {
  const text: Record<Phase, string> = {
    idle:     'Waiting for a file',
    loading:  'Reading the file…',
    checking: `Checking — ${done} of ${total} cells`,
    ready:    `Checked — ${newCount} new, ${updateCount} already in the database`,
    saving:   'Saving to the pending list…',
    saved:    'Saved — waiting in ADD TO LIVE',
    error:    error ?? 'Could not read the file',
  };
  const tone: Record<Phase, { bg: string; fg: string; spin?: boolean }> = {
    idle:     { bg: '#f3f4f6', fg: '#6b7280' },
    loading:  { bg: '#e0f2fe', fg: '#0369a1', spin: true },
    checking: { bg: '#e0f2fe', fg: '#0369a1', spin: true },
    ready:    { bg: '#fef3c7', fg: '#b45309' },
    saving:   { bg: '#e0f2fe', fg: '#0369a1', spin: true },
    saved:    { bg: '#dcfce7', fg: '#15803d' },
    error:    { bg: '#fee2e2', fg: '#b91c1c' },
  };
  const s = tone[phase];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}>
      {missing.length > 0 && (phase === 'ready' || phase === 'loading') && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#9a3412', background: '#ffedd5',
          border: '1px solid #fdba74', borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap',
        }}>
          {missing.length} column{missing.length === 1 ? '' : 's'} not in the file
        </span>
      )}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700,
        color: s.fg, background: s.bg, borderRadius: 999, padding: '7px 14px', whiteSpace: 'nowrap',
        maxWidth: 430, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {s.spin && <span className="spinner" />}
        {text[phase]}
      </span>
    </div>
  );
}

/* ─────────────────────── the four steps, always visible ─────────────────────── */

function StepStrip({ phase, saved }: { phase: Phase; saved: boolean }) {
  const done = (n: number) => {
    if (n === 1) return phase !== 'idle' && phase !== 'loading' && phase !== 'error';
    if (n === 2) return phase === 'ready' || phase === 'saving' || phase === 'saved' || saved;
    if (n === 3) return saved;
    return false;
  };
  const live = (n: number) => {
    if (n === 1) return phase === 'loading';
    if (n === 2) return phase === 'checking';
    if (n === 3) return phase === 'saving' || phase === 'saved';
    return false;
  };
  const steps = [
    { n: 1, label: 'Load the file' },
    { n: 2, label: 'Checked cell by cell' },
    { n: 3, label: 'Confirm — saved to Temp' },
    { n: 4, label: 'Add to Live' },
  ];

  return (
    <div style={{
      flexShrink: 0, display: 'flex', gap: 0, background: '#e8f0f1',
      borderBottom: '1px solid rgba(30,58,64,0.1)', padding: '0 18px',
    }}>
      {steps.map((s, i) => (
        <div
          key={s.n}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0',
            marginRight: 14, fontSize: 11.5, fontWeight: 700,
            color: done(s.n) ? '#15803d' : live(s.n) ? '#0369a1' : '#9ca3af',
          }}
        >
          <span style={{
            width: 19, height: 19, borderRadius: '50%', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
            background: done(s.n) ? '#15803d' : live(s.n) ? '#e0f2fe' : '#e2e8f0',
            color: done(s.n) ? '#fff' : live(s.n) ? '#0369a1' : '#9ca3af',
            border: live(s.n) ? '1.5px solid #0369a1' : 'none',
          }}>
            {done(s.n) ? '✓' : s.n}
          </span>
          {s.label}
          {i < steps.length - 1 && (
            <span style={{ width: 22, height: 1, background: 'rgba(30,58,64,0.18)', marginLeft: 6 }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────── the popup: this record is already in the database ─────────────── */

function ConflictPopup({ master, row, onAccept, onDecline }: {
  master: Master; row: VerifiedRow;
  onAccept: () => void; onDecline: () => void;
}) {
  const changed = row.cells.filter((c) => c.verdict === 'changed' || c.verdict === 'problem');
  const shown = changed.length ? changed : row.cells.filter((c) => c.verdict === 'blank');
  // A row can already be live and still match the file exactly. There is then
  // nothing to decide — but the shop still has to be told it is already there,
  // so the popup stays and simply says so.
  const identical = changed.length === 0 && row.cells.length > 0;
  const banner = identical ? '#0f766e' : '#b45309';

  return (
    <div className="up-modal-veil">
      <div className="up-modal" role="dialog" aria-modal="true">
        <div style={{
          background: banner, color: '#fff', padding: '16px 22px', display: 'flex',
          alignItems: 'flex-start', gap: 13, flexShrink: 0,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            {identical ? (
              <><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></>
            ) : (
              <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
            )}
          </svg>
          <div>
            <h2 style={{ fontSize: 16.5, fontWeight: 800, lineHeight: 1.35 }}>
              This record already exists in the database
            </h2>
            <p style={{ fontSize: 12.5, opacity: 0.94, marginTop: 5, lineHeight: 1.55 }}>
              Row {row.fileRow} of the Excel file has the same{' '}
              {master.keyColumns.join(' + ')} as a row that is already live in{' '}
              <strong>{master.table}</strong>. It was not written to anything.
              {identical && ' Every column already matches, so nothing would change.'}
            </p>
          </div>
        </div>

        <div style={{
          padding: '13px 22px', background: '#fffbeb', borderBottom: '1px solid #fde68a',
          display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0,
        }}>
          {master.keyColumns.map((k) => (
            <div key={k} style={{
              background: '#fff', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 12px',
            }}>
              <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: '#92400e', textTransform: 'uppercase' }}>
                {k} — already in the database
              </p>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e3a40', marginTop: 2, fontFamily: 'ui-monospace,monospace' }}>
                {row.key[k] || '(blank)'}
              </p>
            </div>
          ))}
        </div>

        <div style={{ overflow: 'auto', flex: 1, background: '#f8fafb' }}>
          {row.cells.length > 0 && (
            <table className="up-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ background: '#334155', minWidth: 170 }}>Column</th>
                  <th style={{ background: '#334155', minWidth: 200 }}>In the database now</th>
                  <th style={{ background: '#334155', minWidth: 200 }}>In your Excel file</th>
                  <th style={{ background: '#334155', minWidth: 110 }}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {(shown.length ? shown : row.cells).map((c) => (
                  <tr key={c.column}>
                    <td style={{ fontWeight: 700, color: '#1e3a40' }}>{c.column}</td>
                    <td style={{ fontFamily: 'ui-monospace,monospace', color: '#475569' }}>
                      {c.current === '' ? <span style={{ color: '#cbd5e1' }}>(blank)</span> : c.current}
                    </td>
                    <td style={{
                      fontFamily: 'ui-monospace,monospace', fontWeight: 700,
                      color: c.verdict === 'changed' || c.verdict === 'problem' ? '#c2410c' : '#1f2937',
                    }}>
                      {c.incoming === '' ? <span style={{ color: '#cbd5e1' }}>(blank)</span> : c.incoming}
                    </td>
                    <td>
                      <span className={`up-pill ${VERDICT_CLASS[c.verdict]}`}>
                        {VERDICT_WORD[c.verdict] ?? c.verdict}
                      </span>
                      {c.note && <span style={{ fontSize: 11, color: '#b91c1c' }}>{c.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {row.problems.length > 0 && (
            <div style={{ padding: '12px 22px', background: '#fee2e2', borderTop: '1px solid #fecaca' }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#991b1b' }}>This row cannot be saved:</p>
              <ul style={{ margin: '5px 0 0 17px', fontSize: 12, color: '#991b1b', lineHeight: 1.6 }}>
                {row.problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div style={{
          padding: '16px 22px', borderTop: '1px solid rgba(30,58,64,0.12)', background: '#fff',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1e3a40', marginBottom: 4 }}>
            What should happen to this record?
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.55, marginBottom: 13 }}>
            {identical
              ? 'There is nothing to change, so this row is simply kept as it is. The rest '
                + 'of the file can still be saved.'
              : 'If you keep the database version, nothing is saved at all — not this row and '
                + 'not any other row in the file. Go back to your Excel file, change the row, and '
                + 'load it again.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              className="up-btn up-btn-ghost"
              style={{ color: '#b45309', borderColor: '#f59e0b', background: '#fff' }}
              onClick={onDecline}
            >
              KEEP THE DATABASE VERSION
              <span style={{ fontWeight: 500, opacity: 0.8 }}>— cancel the upload</span>
            </button>
            <button
              className="up-btn"
              style={identical ? { background: '#0f766e' } : { background: '#b45309' }}
              onClick={onAccept}
            >
              {identical ? 'CONTINUE' : 'UPDATE THE DATABASE'}
              <span style={{ fontWeight: 500, opacity: 0.85 }}>
                {identical ? '— nothing to change' : '— use my Excel values'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── the ADD TO LIVE tab ───────────────────── */

function LiveTab({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [batches, setBatches] = useState<PendingBatch[] | null>(null);
  const [open, setOpen] = useState<PendingDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/upload/pending', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not read the pending list.');
      setBatches(data.batches ?? []);
    } catch (e) {
      setBatches([]);
      setNote({ tone: 'bad', text: (e as Error).message });
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const openBatch = async (batch: string) => {
    setNote(null);
    try {
      const res = await fetch(`/api/upload/pending?batch=${encodeURIComponent(batch)}`, { cache: 'no-store' });
      const data: PendingDetail = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not read that file.');
      setOpen(data);
    } catch (e) {
      setNote({ tone: 'bad', text: (e as Error).message });
    }
  };

  const goLive = async (batch: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/upload/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch }),
      });
      const data: GoLiveResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not move this file.');
      setNote({
        tone: 'ok',
        text: `${data.inserted} new row${data.inserted === 1 ? '' : 's'} added, `
          + `${data.updated} existing row${data.updated === 1 ? '' : 's'} updated in the master table. `
          + 'The Temp table has been cleared of it.',
      });
      setOpen(null);
      await reload();
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const discard = async (batch: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/upload/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch, discard: true }),
      });
      const data: GoLiveResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not clear that file.');
      setNote({ tone: 'ok', text: 'That file was thrown away. The master table was not touched.' });
      setOpen(null);
      await reload();
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const total = batches?.reduce((n, b) => n + b.rows, 0) ?? 0;

  return (
    <>
      <div className="up-panel" style={{ width: 300, flexShrink: 0 }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(30,58,64,0.1)', flexShrink: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(30,58,64,0.55)' }}>
            Start-up Settings
          </p>
          <p style={{ fontSize: 19, fontWeight: 800, color: '#1e3a40', marginTop: 2 }}>
            UPLOAD DATA
          </p>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 7 }}>
              What is waiting
            </p>
            <p style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.55 }}>
              Rows you confirmed are waiting here in a Temp table, not in the master table.
              Pressing <strong>Add to Live</strong> moves them across and then clears them
              out of the Temp table.
            </p>
          </div>

          <div style={{ height: 1, background: 'rgba(30,58,64,0.1)' }} />
          <Stat n={total} label="rows waiting" tone={total ? '#b45309' : '#15803d'} />

          {note && (
            <div style={{
              background: note.tone === 'ok' ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${note.tone === 'ok' ? '#86efac' : '#fca5a5'}`,
              borderRadius: 10, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.55,
              color: note.tone === 'ok' ? '#166534' : '#991b1b',
            }}>{note.text}</div>
          )}

          <button className="up-btn up-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => void reload()}>
            Refresh
          </button>
          <button className="up-btn up-btn-ghost" style={{ justifyContent: 'center' }} onClick={onBack}>
            Back to Check
          </button>
        </div>
      </div>

      <div className="up-panel" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{
          background: '#1e3a40', padding: '13px 18px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Waiting to be added
            </p>
            <p style={{ color: '#fff', fontSize: 17, fontWeight: 800, marginTop: 2 }}>
              {total} ROW{total === 1 ? '' : 'S'} PENDING
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginLeft: 10 }}>
                in the Temp tables — the master tables are untouched
              </span>
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <button className="up-btn up-btn-ghost" onClick={onBack} style={{ height: 34 }}>Back to Check</button>
        </div>

        <div className="up-table-wrap">
          {batches === null ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b7280' }}>
              <span className="spinner" /> Reading the Temp tables…
            </div>
          ) : open ? (
            <>
              <div style={{
                flexShrink: 0, background: '#fff', padding: '11px 18px', display: 'flex', alignItems: 'center',
                gap: 12, borderBottom: '1px solid rgba(30,58,64,0.1)', flexWrap: 'wrap',
              }}>
                <button className="up-btn up-btn-ghost" style={{ height: 32 }} onClick={() => setOpen(null)}>
                  ‹ All files
                </button>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1e3a40' }}>
                    {open.master.label} — {open.rows.length} row{open.rows.length === 1 ? '' : 's'}
                  </p>
                  <p style={{ fontSize: 11, color: '#6b7280', fontFamily: 'ui-monospace,monospace' }}>
                    {open.master.tempTable} → {open.master.table}
                  </p>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  className="up-btn up-btn-ghost"
                  style={{ height: 32, color: '#b45309', borderColor: '#f59e0b', background: '#fff' }}
                  disabled={busy}
                  onClick={() => void discard(open.batch)}
                >
                  Throw away
                </button>
                <button
                  className="up-btn up-btn-go"
                  style={{ height: 32 }}
                  disabled={busy}
                  onClick={() => void goLive(open.batch)}
                >
                  {busy && <span className="spinner" style={{ borderTopColor: '#fff' }} />}
                  ADD TO LIVE
                </button>
              </div>
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table className="up-table">
                  <thead>
                    <tr>
                      <th className="up-rownum" style={{ position: 'sticky', left: 0, top: 0, zIndex: 3 }}>#</th>
                      <th style={{ background: '#334155', minWidth: 92 }}>Will be</th>
                      {open.master.columns.map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {open.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="up-rownum">{r.UpFileRow ?? i + 1}</td>
                        <td>
                          <span className={`up-pill ${r.UpStatus === 'update' ? 'up-pill-changed' : 'up-pill-new'}`}
                            style={{ marginRight: 0 }}>
                            {r.UpStatus === 'update' ? 'UPDATE' : 'INSERT'}
                          </span>
                        </td>
                        {open.master.columns.map((c) => (
                          <td key={c}>{r[c] === '' || r[c] === undefined
                            ? <span style={{ color: '#cbd5e1' }}>empty</span> : r[c]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : batches.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, color: '#9ca3af', padding: 24, textAlign: 'center',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <p style={{ fontSize: 13 }}>Nothing is waiting.</p>
              <p style={{ fontSize: 11.5, maxWidth: 400, lineHeight: 1.6 }}>
                Load a file on the Check tab. Once it has been checked and you press CONFIRM,
                the rows will sit here until you press Add to Live.
              </p>
            </div>
          ) : (
            <table className="up-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Master</th>
                  <th style={{ textAlign: 'right' }}>Rows</th>
                  <th style={{ textAlign: 'right' }}>New</th>
                  <th style={{ textAlign: 'right' }}>Already in DB</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batches.map((b, i) => (
                  <tr key={b.batch}>
                    {/* The shop counts its files: "the first one", "the second
                        one". The id the database ties the rows together with is
                        not something anyone has to read, so it stays out of
                        sight. The same goes for the Temp -> master table names:
                        the master is named two columns along. */}
                    <td className="up-rownum" style={{ fontWeight: 800 }}>{i + 1}</td>
                    <td style={{ fontWeight: 700 }}>{b.masterLabel}</td>
                    <td className="up-num" style={{ fontWeight: 800 }}>{b.rows}</td>
                    <td className="up-num"><span className="up-pill up-pill-new" style={{ marginRight: 0 }}>{b.newRows}</span></td>
                    <td className="up-num"><span className="up-pill up-pill-changed" style={{ marginRight: 0 }}>{b.updateRows}</span></td>
                    <td>
                      <button
                        className="up-btn up-btn-ghost"
                        style={{ height: 28, fontSize: 11 }}
                        onClick={() => void openBatch(b.batch)}
                      >
                        Review &amp; Add to Live
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {busy && (
          <div className="up-veil">
            <div style={{
              background: '#fff', borderRadius: 14, padding: '26px 34px', textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.14)', display: 'flex',
              flexDirection: 'column', alignItems: 'center', gap: 13,
            }}>
              <span className="spinner-lg" />
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e3a40' }}>Adding to the master table…</p>
              <p style={{ fontSize: 12, color: '#6b7280', maxWidth: 330, lineHeight: 1.6 }}>
                Each row is inserted if it is new and updated if it is already there. The
                Temp table is cleared once the batch has landed.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,0.65)', borderRadius: 9, padding: '8px 6px',
      textAlign: 'center', border: '1px solid rgba(30,58,64,0.1)',
    }}>
      <p style={{ fontSize: 16, fontWeight: 800, color: tone, lineHeight: 1 }}>{n}</p>
      <p style={{ fontSize: 9.5, fontWeight: 700, color: '#6b7280', marginTop: 3, letterSpacing: '0.04em' }}>
        {label}
      </p>
    </div>
  );
}
