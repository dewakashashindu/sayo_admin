// src/app/settings/upload-data/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// System Settings → Start-up Settings → Upload Data
//
// Load an Excel file of master data, look at what is in it, and only then
// decide. The screen has three states and says which one it is in on the right:
//
//   1. nothing chosen            → "Waiting for a file"
//   2. file picked               → "Loading…" then "Loaded — N rows"
//   3. Confirm pressed           → "Checking…" then the database comparison
//
// The columns under each header are the master's real table columns
// (uploadMasters.ts), so the header row doubles as the template for the file.
//
// A file that carries the header and no data rows is a normal thing to see —
// that is what one of the blank workbooks looks like once it comes back from
// the client — so the column strip stays on screen and says so plainly rather
// than falling back to the "choose a file" panel.
//
// THIS IS THE UI ONLY. Nothing is written to the database yet: Confirm runs
// the same state machine and reports that the write step is not connected, so
// the flow can be reviewed before any row is committed.
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS, IChevDown } from '@/components/AdminSidebar';
import UserName from '@/components/UserName';
import {
  MASTERS, masterByKey, matchHeaders, missingColumns, toFlag,
  type Master, type MasterColumn,
} from '@/lib/uploadMasters';
import { readSpreadsheet, isLegacyXls } from '@/lib/xlsxReader';

type Phase = 'idle' | 'loading' | 'loaded' | 'checking' | 'done' | 'error';

interface PreviewRow {
  values: string[];   // aligned to master.columns, '' where the file had nothing
  issues: string[];   // human-readable problems with this row
}

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width:15px; height:15px; border-radius:50%;
    border:2px solid rgba(30,58,64,0.18); border-top-color:#1e3a40;
    animation:spin 0.7s linear infinite; display:inline-block; vertical-align:-2px; }

  .up-btn { display:inline-flex; align-items:center; gap:7px; height:38px; padding:0 16px;
    border:none; border-radius:10px; background:#1e3a40; color:#fff; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; }
  .up-btn:hover:not(:disabled) { background:#16303a; }
  .up-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .up-btn-ghost { background:#fff; color:#1e3a40; border:1.5px solid #c0cbcc; }
  .up-btn-ghost:hover:not(:disabled) { background:#eef4f4; border-color:#8fa9ac; }

  .up-select { height:38px; padding:0 34px 0 12px; border-radius:10px; font-family:'Inter',sans-serif;
    font-size:13px; font-weight:600; color:#1f2937; background:#fff; border:1.5px solid #c0cbcc;
    outline:none; cursor:pointer; appearance:none;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round'><polyline points='6 9 12 15 18 9'/></svg>");
    background-repeat:no-repeat; background-position:right 11px center; }
  .up-select:hover { border-color:#8fa9ac; }

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

  ::-webkit-scrollbar       { width:9px; height:9px; }
  ::-webkit-scrollbar-track  { background:transparent; }
  ::-webkit-scrollbar-thumb  { background:rgba(30,58,64,0.22); border-radius:5px; }
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

/** The status block on the right of the header row. */
function StatusPill({ phase, count, missing, error }: {
  phase: Phase; count: number; missing: MasterColumn[]; error: string | null;
}) {
  const map: Record<Phase, { text: string; bg: string; fg: string; spin?: boolean }> = {
    idle:     { text: 'Waiting for a file',      bg: '#f3f4f6', fg: '#6b7280' },
    loading:  { text: 'Loading…',                 bg: '#e0f2fe', fg: '#0369a1', spin: true },
    loaded:   { text: `Loaded — ${count} row${count === 1 ? '' : 's'}`,
                                             bg: '#dcfce7', fg: '#15803d' },
    checking: { text: 'Checking against the database…', bg: '#e0f2fe', fg: '#0369a1', spin: true },
    done:     { text: 'Checked',                  bg: '#fef3c7', fg: '#b45309' },
    error:    { text: error ?? 'Could not read the file', bg: '#fee2e2', fg: '#b91c1c' },
  };
  const s = map[phase];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {missing.length > 0 && phase === 'loaded' && (
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
      }}>
        {s.spin && <span className="spinner" />}
        {s.text}
      </span>
    </div>
  );
}

export default function UploadDataPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [navKey, setNavKey] = useState('settings-uploaddata');
  const [masterKey, setMasterKey] = useState(MASTERS[0].key);
  const master: Master = useMemo(() => masterByKey(masterKey), [masterKey]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [missing, setMissing] = useState<MasterColumn[]>([]);
  /** master column index → index of that column in the file's header row */
  const [uploadedCols, setUploadedCols] = useState<(number | null)[]>([]);

  const reset = useCallback(() => {
    setPhase('idle');
    setFileName('');
    setError(null);
    setRows([]);
    setMissing([]);
    setUploadedCols([]);
  }, []);

  /** Switching master invalidates whatever was loaded — the columns differ. */
  const pickMaster = (key: string) => {
    setMasterKey(key);
    reset();
  };

  const loadFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setPhase('loading');
    setRows([]);
    setMissing([]);

    try {
      const sheet = await readSpreadsheet(file);
      const [header, ...body] = sheet.rows;

      if (!header || header.length === 0) {
        setError('That file has no rows.');
        setPhase('error');
        return;
      }

      const map = matchHeaders(header, master);
      const absent = missingColumns(header, master);

      if (absent.length === master.columns.length) {
        setError(
          `None of the ${master.label} columns were found in the first row of the file.`,
        );
        setPhase('error');
        return;
      }

      const preview: PreviewRow[] = body.map((raw) => {
        const values = map.map((at) => (at === null ? '' : (raw[at] ?? '').trim()));
        const issues: string[] = [];

        master.keyColumns.forEach((key, i) => {
          if (!values[i]) issues.push(`${key} is blank`);
        });
        master.columns.forEach((col, i) => {
          const v = values[i];
          if (!v) return;
          if (col.kind === 'number' && v !== '' && Number.isNaN(Number(v.replace(/,/g, '')))) {
            issues.push(`${col.name} is not a number`);
          }
        });

        return { values, issues };
      });

      setUploadedCols(map);
      setMissing(absent);
      setRows(preview);
      setPhase('loaded');
    } catch (e) {
      setError((e as Error).message || 'Could not read that file.');
      setPhase('error');
    }
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = ''; // let the same file be picked again
  };

  /** Dropping a file anywhere on the panel loads it too. */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const confirm = () => {
    setPhase('checking');
    // The write/check endpoint is not connected yet — this step reports that
    // honestly instead of pretending the rows were compared.
    window.setTimeout(() => setPhase('done'), 900);
  };

  const badRows = rows.filter((r) => r.issues.length > 0).length;

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
                  border: '1.5px solid #c0cbcc', borderRadius: 10, padding: '0 14px 0 14px', height: 40,
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
          <div style={{ flex: 1, overflow: 'hidden', padding: '13px 15px', display: 'flex', gap: 13 }}>

            {/* LEFT — what and which file */}
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
                  }}>
                    Master
                  </label>
                  <select
                    id="up-master"
                    className="up-select"
                    style={{ width: '100%' }}
                    value={masterKey}
                    onChange={(e) => pickMaster(e.target.value)}
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
                  }}>
                    File
                  </label>

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
                    disabled={phase === 'loading'}
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
                </div>

                {phase === 'loaded' && (
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

                {phase === 'done' && (
                  <div style={{
                    background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10,
                    padding: '10px 12px', fontSize: 11.5, color: '#92400e', lineHeight: 1.55,
                  }}>
                    The database step is not connected on this screen yet, so nothing was
                    written and nothing was compared. The {rows.length} loaded row
                    {rows.length === 1 ? '' : 's'} above is exactly what would be sent.
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — the columns and the rows */}
            <div className="up-panel" style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                background: '#1e3a40', padding: '13px 18px', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {master.label}
                  </p>
                  <p style={{ color: '#fff', fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                    {master.columns.length} COLUMNS
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginLeft: 10,
                    }}>
                      these are the columns this master is written with
                    </span>
                  </p>
                </div>

                <div style={{ flex: 1 }} />

                <StatusPill phase={phase} count={rows.length} missing={missing} error={error} />

                <button
                  className="up-btn up-btn-ghost"
                  onClick={() => fileInput.current?.click()}
                  disabled={phase === 'loading'}
                  style={{ height: 34 }}
                >
                  Change file
                </button>
                <button
                  className="up-btn"
                  onClick={confirm}
                  disabled={phase !== 'loaded'}
                  style={{ height: 34 }}
                >
                  CONFIRM
                </button>
              </div>

              <div
                className="up-table-wrap"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
              >
                {rows.length === 0 && phase !== 'loaded' ? (
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
                    <p style={{ fontSize: 11.5, maxWidth: 420, lineHeight: 1.6 }}>
                      Drop the file here instead if that is easier. The first row of the file is
                      read as the header, so it must carry these {master.columns.length} column names.
                    </p>
                  </div>
                ) : (
                  <table className="up-table">
                    <thead>
                      <tr>
                        <th className="up-rownum" style={{ position: 'sticky', left: 0, top: 0, zIndex: 3 }}>#</th>
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
                      {rows.map((row, r) => (
                        <tr key={r}>
                          <td className="up-rownum">{r + 1}</td>
                          {row.values.map((v, c) => {
                            const col = master.columns[c];
                            const blank = uploadedCols[c] === null;
                            return (
                              <td
                                key={col.name}
                                className={[
                                  col.kind === 'number' ? 'up-num' : '',
                                  row.issues.length > 0 ? 'up-bad' : '',
                                ].filter(Boolean).join(' ')}
                                style={blank ? { background: 'rgba(107,114,128,0.06)', color: '#9ca3af' } : undefined}
                                title={row.issues.join(' · ')}
                              >
                                {blank ? '—' : col.kind === 'flag'
                                  ? <FlagMark on={toFlag(v)} />
                                  : v === '' ? <span style={{ color: '#cbd5e1' }}>empty</span> : v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
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
