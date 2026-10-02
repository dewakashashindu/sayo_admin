// src/lib/uploadStaging.ts
// ─────────────────────────────────────────────────────────────────────────────
// Staging for Upload Data.
//
// A row that came out of a spreadsheet is NEVER written to the live table
// directly. It goes:
//     1. the file is read on the screen and previewed            (no database)
//     2. VERIFY asks the database about every row, cell by cell   (read only)
//     3. what survives is parked in the master's …Temp table      (write)
//     4. the shop reviews the whole batch in the Pending tab     (read only)
//     5. GO TO LIVE moves the batch into the real table           (write)
//
// So the worst a bad file can do is sit in a Temp table until somebody looks
// at it. Step 5 is the only one that changes a master screen's data, and it is
// a separate, deliberate press of a button.
//
// WHY A Temp TABLE PER MASTER rather than one holding table: the shape of a
// row is the master's own columns, and going live then means moving a row into
// a table it already matches. The four extra columns are only about the row's
// journey, not its content:
//
//     UpBatch    the upload this row belongs to, so a second file does not
//                silently mix with the first
//     UpFileRow  the row number in that file, so the shop can say "row 14"
//                instead of hunting
//     UpStatus   'new'     the key is not in the live table → INSERT
//                'update'  the key IS in the live table  → UPDATE
//     UpNote     what VERIFY found, shown in the Pending tab
//
// Flag/binary columns are a legacy problem: a column can be char(1) holding
// 'Y'/'N' or a tinyint holding 1/0, and which one is a property of the column,
// not of the file. Writing 'Yes' into a tinyint would be stored as 0 — a flag
// silently turned off. So the live column's own type decides, and the value is
// converted before it is stored. This is the same detection the Modes screen
// does (see api/reference/modes).
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { quoteIdent, quoteLiteral } from '@/lib/sqlIdent';
import type { Master } from './uploadMasters';
import type { VerifyResult, VerifiedCell, VerifiedRow, PendingBatch, CellVerdict } from './uploadTypes';

export type { VerifyResult, VerifiedCell, VerifiedRow, PendingBatch, CellVerdict } from './uploadTypes';

/* ─────────────────────────── tiny SQL helpers ─────────────────────────── */

const trim = (v: unknown) => String(v ?? '').trim();

/** `WHERE` a value matches ignoring case and padding — the shop's CHAR columns. */
function eq(col: string): string {
  return `UPPER(RTRIM(${quoteIdent(col)})) = UPPER(?)`;
}

/* ─────────────────────── the live column's own type ─────────────────────── */

export interface ColumnShape {
  actual: string;
  kind: 'text' | 'flag' | 'bit' | 'number' | 'date';
  maxLen: number;
  /** the column's own DDL type, so the Temp table copies it rather than guessing */
  ddl: string;
  /** for a flag: the pair that column actually speaks */
  on: string;
  off: string;
}

interface RawColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
  COLUMN_TYPE: string;
}

/** Read one live table's column shapes. Table names are matched case-insensitively. */
export async function liveColumns(table: string): Promise<Map<string, ColumnShape>> {
  const out = new Map<string, ColumnShape>();
  const tables = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
    table,
  );
  if (!tables.length) return out;

  const cols = await prisma.$queryRawUnsafe<RawColumn[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)
      ORDER BY ORDINAL_POSITION`,
    table,
  );

  for (const c of cols) {
    const t = String(c.DATA_TYPE).toLowerCase();
    const name = String(c.COLUMN_NAME);
    out.set(name.toLowerCase(), {
      actual: name,
      kind:
        t === 'tinyint' || t === 'bit' || t === 'boolean' ? 'bit'
        : ['int', 'integer', 'bigint', 'smallint', 'decimal', 'double', 'float', 'numeric', 'real'].includes(t) ? 'number'
        : ['date', 'datetime', 'timestamp'].includes(t) ? 'date'
        : c.CHARACTER_MAXIMUM_LENGTH === 1 ? 'flag'
        : 'text',
      maxLen: Number(c.CHARACTER_MAXIMUM_LENGTH ?? 0),
      ddl: String(c.COLUMN_TYPE ?? 'varchar(255)'),
      on: '1', off: '0',
    });
  }
  return out;
}

/**
 * Does this char(1) flag column say Y/N, or 1/0? Decided by what is in it now.
 *
 * Memoised per table+column: the answer cannot change while a request is
 * running, and Go to Live asks this once per row, so without the cache a
 * 500-row file would issue 500 identical queries.
 */
const flagPairCache = new Map<string, { on: string; off: string }>();

async function flagPairOf(table: string, column: string, fallback: { on: string; off: string }) {
  const cacheKey = `${table.toLowerCase()}.${column.toLowerCase()}`;
  const hit = flagPairCache.get(cacheKey);
  if (hit) return hit;
  try {
    const rows = await prisma.$queryRawUnsafe<{ v: unknown }[]>(
      `SELECT DISTINCT ${quoteIdent(column)} AS v FROM ${quoteIdent(table)} LIMIT 50`,
    );
    for (const r of rows) {
      const v = trim(r.v).toUpperCase();
      if (v === 'Y' || v === 'T') {
        const pair = { on: 'Y', off: 'N' };
        flagPairCache.set(cacheKey, pair);
        return pair;
      }
    }
  } catch { /* an empty or unreadable table just keeps the 1/0 default */ }
  flagPairCache.set(cacheKey, fallback);
  return fallback;
}

/* ───────────────────────── the Temp table per master ───────────────────────── */

const STAGE_COLUMNS = [
  'UpBatch', 'UpFileRow', 'UpStatus', 'UpNote',
] as const;

/**
 * Create the master's Temp table if it is not there yet: the live table's own
 * columns, plus the four staging ones. Doing it from the live table's shape
 * means a master that gains a column gains it here too.
 *
 * Safe to call on every upload — it does nothing once the table exists.
 */
export async function ensureTempTable(master: Master): Promise<{ created: boolean; error?: string }> {
  const live = await liveColumns(master.table);
  if (!live.size) return { created: false, error: `${master.table} does not exist in this database.` };

  const exists = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
    master.tempTable,
  );
  if (Number(exists[0]?.n ?? 0) > 0) return { created: false };

  // Keep the live table's exact type for each column, so a flag that speaks
  // char(1) Y/N keeps speaking it in the Temp table.
  const defs: string[] = [];
  const flags: string[] = [];
  for (const [, shape] of live) {
    defs.push(`${quoteIdent(shape.actual)} ${columnTypeSql(shape)}`);
    if (shape.kind === 'flag') flags.push(shape.actual);
  }
  defs.push('`UpBatch` varchar(36) NOT NULL');
  defs.push('`UpFileRow` int NOT NULL DEFAULT 0');
  defs.push('`UpStatus` varchar(10) NOT NULL DEFAULT \'new\'');
  defs.push('`UpNote` varchar(255) NOT NULL DEFAULT \'\'');

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE ${quoteIdent(master.tempTable)} (\n  ${defs.join(',\n  ')}\n)
       ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    for (const f of flags) {
      const pair = await flagPairOf(master.table, f, { on: '1', off: '0' });
      if (pair.on === 'Y') {
        // default the flag to the "off" value this table already uses
        await prisma.$executeRawUnsafe(
          `ALTER TABLE ${quoteIdent(master.tempTable)}
              ALTER COLUMN ${quoteIdent(f)} SET DEFAULT ${quoteLiteral(pair.off)}`,
        ).catch(() => { /* best effort — the app writes every value explicitly */ });
      }
    }
    return { created: true };
  } catch (e) {
    return { created: false, error: friendly(e, master.tempTable) };
  }
}

/**
 * The DDL type for the Temp table's copy of a column.
 *
 * The live table's own COLUMN_TYPE is used verbatim rather than a guess, so a
 * decimal stays a decimal with its scale, an unsigned stays unsigned, and an
 * enum keeps its values. A Temp table that quietly narrowed a column would make
 * the staging area lie about what Go to Live is about to write.
 */
function columnTypeSql(shape: ColumnShape): string {
  return shape.ddl || 'varchar(255)';
}

function friendly(e: unknown, table: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/already exists/i.test(msg)) return `${table} already exists.`;
  if (/denied|permission/i.test(msg)) return `Not allowed to create ${table}.`;
  return `Could not prepare ${table}: ${msg.split('\n')[0].slice(0, 160)}`;
}

/* ───────────────────────────── value coercion ───────────────────────────── */

/**
 * Turn what the person typed into what the live column can hold.
 *
 * This is the step that stops "Yes" becoming 0 in a tinyint, and "2500.00"
 * being refused by a double. Returns the value plus a note when the file and
 * the column could not be reconciled, so the shop is told rather than surprised.
 */
export function coerceForColumn(
  raw: string,
  shape: ColumnShape,
  on: string,
  off: string,
): { value: string | number | Date; note?: string } {
  const v = trim(raw);

  if (shape.kind === 'flag') {
    if (v === '') return { value: off };
    const t = v.toLowerCase();
    if (['1', 'y', 'yes', 'true', 't', 'on'].includes(t)) return { value: on };
    if (['0', 'n', 'no', 'false', 'f', 'off'].includes(t)) return { value: off };
    return { value: off, note: `"${v}" is not a Yes/No — read as No.` };
  }
  if (shape.kind === 'bit') {
    if (v === '') return { value: 0 };
    const t = v.toLowerCase();
    if (['1', 'y', 'yes', 'true', 't', 'on'].includes(t)) return { value: 1 };
    if (['0', 'n', 'no', 'false', 'f', 'off'].includes(t)) return { value: 0 };
    // Same rule as the char(1) flag: say so rather than quietly writing a 0.
    return { value: 0, note: `"${v}" is not a Yes/No — read as No.` };
  }
  if (shape.kind === 'number') {
    if (v === '') return { value: 0 };
    // a file may carry "1,250.00" or "Rs 2500" — take the number out of it
    const cleaned = v.replace(/[^\d.\-]/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { value: 0, note: `"${v}" is not a number — read as 0.` };
    return { value: n };
  }
  if (shape.kind === 'date') {
    if (v === '') return { value: new Date(0) };
    const d = parseDate(v);
    if (!d) return { value: new Date(0), note: `"${v}" is not a date.` };
    return { value: d };
  }
  if (shape.maxLen > 0 && v.length > shape.maxLen) {
    return { value: v.slice(0, shape.maxLen), note: `Cut to ${shape.maxLen} characters.` };
  }
  return { value: v };
}

/** Excel writes dates several ways; take the first that makes a real date. */
function parseDate(v: string): Date | null {
  const s = trim(v);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    // an Excel serial date
    const n = Number(s);
    if (n > 20000 && n < 60000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ──────────────────────────── VERIFY: read only ──────────────────────────── */

/**
 * What the checker announces as it goes. The screen paints each cell the
 * moment its event arrives, so the grid fills in while the file is still being
 * checked rather than appearing all at once at the end.
 *
 *   cell  one cell of one row has been compared
 *   row   the whole row is done: is it new, or does it already exist
 *   done  the file is finished; here are the totals
 */
export type CheckEvent =
  | { t: 'cell'; r: number; c: string; v: string; from: string; verdict: CellVerdict; note?: string }
  | {
      t: 'row'; r: number; status: 'new' | 'update';
      key: Record<string, string>; problems: string[]; blocked: boolean;
    }
  | { t: 'done'; newCount: number; updateCount: number; problemCount: number };

/**
 * Compare every row of the file against the live table, one cell at a time,
 * handing each answer to `emit` as soon as it is known.
 *
 * READ ONLY. Nothing is written here. A row whose key is not in the database is
 * 'new' and every cell is 'new'; a row whose key IS there is 'update' and each
 * cell says whether the file would change it. The shop sees this and decides.
 *
 * The one thing that happens up front is a single query for every key in the
 * file. It has to be up front: whether a cell reads as "new" or "changes"
 * depends on whether the row exists at all, so the row's own cells cannot be
 * judged until that answer is in.
 */
export async function checkRows(
  master: Master,
  rows: { values: Record<string, string> }[],
  emit: (e: CheckEvent) => void | Promise<void> = () => {},
): Promise<VerifyResult> {
  const live = await liveColumns(master.table);
  if (!live.size) {
    return { master: master.key, rows: [], newCount: 0, updateCount: 0, problemCount: 0,
      fatal: `${master.table} does not exist in this database.` };
  }

  // Work out each flag column's dialect once, not once per cell.
  const pairs = new Map<string, { on: string; off: string }>();
  for (const col of master.columns) {
    const shape = live.get(col.name.toLowerCase());
    if (shape?.kind === 'flag') {
      pairs.set(col.name.toLowerCase(), await flagPairOf(master.table, shape.actual, { on: '1', off: '0' }));
    }
  }

  const missing = master.columns.filter((c) => !live.has(c.name.toLowerCase()));
  if (missing.length) {
    return { master: master.key, rows: [], newCount: 0, updateCount: 0, problemCount: 0,
      fatal: `${master.table} has no ${missing.map((m) => m.name).join(', ')} column.` };
  }

  // Every cell is converted to the column's own type FIRST, and the key lookup
  // uses those converted values — not the raw strings from the file.
  //
  // It has to be that way round. A key column can be a date: the file says
  // "2027-06-30", the column stores a datetime, and the database hands it back
  // as "2027-06-30 00:00:00". Comparing the file's text with the database's text
  // would call every one of those rows new, and the upload would then try to
  // INSERT on top of a row that is already there.
  const keyCols = master.keyColumns.map((k) => live.get(k.toLowerCase())!.actual);
  const typed = (raw: string, column: string): string => {
    const shape = live.get(column.toLowerCase())!;
    const pair = pairs.get(column.toLowerCase()) ?? { on: '1', off: '0' };
    return fmt(coerceForColumn(raw, shape, pair.on, pair.off).value);
  };
  const wanted = rows.map((r) => master.keyColumns.map((k) => typed(trim(r.values[k] ?? ''), k)));
  const existing = await fetchExisting(master, keyCols, wanted);

  const out: VerifiedRow[] = [];
  let newCount = 0, updateCount = 0, problemCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    /* The row number the SHOP has to look for, which is the number Excel shows
       down its left-hand edge. Row 1 of the sheet is the header, so the first
       line of data is row 2 — counting from 1 would send the person looking one
       row above the problem every single time. */
    const fileRow = i + 2;
    const key: Record<string, string> = {};
    const problems: string[] = [];
    master.keyColumns.forEach((k) => {
      const v = trim(row.values[k] ?? '');
      key[k] = v;
      if (!v) problems.push(`${k} is blank`);
      else if (v.length > live.get(k.toLowerCase())!.maxLen && live.get(k.toLowerCase())!.maxLen > 0) {
        problems.push(`${k} is longer than ${live.get(k.toLowerCase())!.maxLen} characters`);
      }
    });

    const current = existing.get(keySignature(wanted[i]));
    const status: 'new' | 'update' = current ? 'update' : 'new';
    if (current) updateCount++; else newCount++;

    // ── the cell-by-cell part: one answer handed over at a time ──
    const cells: VerifiedCell[] = [];
    for (const col of master.columns) {
      const shape = live.get(col.name.toLowerCase())!;
      const pair = pairs.get(col.name.toLowerCase()) ?? { on: '1', off: '0' };
      const raw = trim(row.values[col.name] ?? '');
      const { value, note } = coerceForColumn(raw, shape, pair.on, pair.off);
      const incoming = fmt(value);
      const from = current ? fmt(current[col.name]) : '';

      let verdict: CellVerdict;
      if (!raw) verdict = 'blank';
      else if (note) verdict = 'problem';
      else if (!current) verdict = 'new';
      else verdict = from.toLowerCase() === incoming.toLowerCase() ? 'same' : 'changed';

      const cell: VerifiedCell = { column: col.name, incoming: raw ? incoming : '', current: from, verdict, note };
      cells.push(cell);

      await emit({ t: 'cell', r: i, c: col.name, v: incoming, from, verdict, note });
    }

    // A key that collides inside the file itself is a real problem: two rows
    // claiming the same identity cannot both be right.
    const dupInFile = rows.slice(0, i).some((r) =>
      master.keyColumns.every((k) => trim(r.values[k] ?? '').toUpperCase() === key[k].toUpperCase()),
    );
    if (dupInFile) problems.push('Another row in this file has the same key');

    if (problems.length) problemCount++;
    out.push({ fileRow, key, status, cells, problems, blocked: problems.length > 0 });
    await emit({ t: 'row', r: i, status, key, problems, blocked: problems.length > 0 });
  }

  await emit({ t: 'done', newCount, updateCount, problemCount });
  return { master: master.key, rows: out, newCount, updateCount, problemCount };
}

/**
 * The same check, all at once, for callers that want the whole answer rather
 * than a running commentary — the tests, and anything on the server.
 */
export async function verifyRows(
  master: Master,
  rows: { values: Record<string, string> }[],
): Promise<VerifyResult> {
  return checkRows(master, rows);
}

function keySignature(parts: string[]): string {
  return parts.map((p) => p.trim().toUpperCase()).join('\u0000');
}

async function fetchExisting(
  master: Master,
  keyCols: string[],
  wanted: string[][],
): Promise<Map<string, Record<string, unknown>>> {
  const found = new Map<string, Record<string, unknown>>();
  if (!keyCols.length) return found;

  // De-duplicate the file's own keys so a repeated row does not become a
  // repeated tuple, then ask for all of them in one go.
  const seen = new Map<string, string[]>();
  for (const parts of wanted) {
    const sig = keySignature(parts);
    if (!seen.has(sig)) seen.set(sig, parts);
  }
  if (!seen.size) return found;

  // (a,b) IN ((?,?),(?,?),…) — chunked so a long file does not become a
  // statement the server refuses to prepare.
  //
  // The row constructor needs BARE column names: `(a, b) IN ((?,?))` is valid,
  // but `(a = ?) IN (…)` is not. Case and padding are matched by wrapping each
  // placeholder in UPPER() rather than the column, which keeps the shape legal.
  const tuple = `(${keyCols.map(() => 'UPPER(?)').join(', ')})`;
  const CHUNK = 200;
  const all = [...seen.values()];

  for (let i = 0; i < all.length; i += CHUNK) {
    const batch = all.slice(i, i + CHUNK);
    const args = batch.flat();
    const sql =
      `SELECT * FROM ${quoteIdent(master.table)}
        WHERE (${keyCols.map(quoteIdent).join(', ')})
          IN (${batch.map(() => tuple).join(', ')})`;
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...args);
    for (const r of rows) {
      found.set(keySignature(keyCols.map((c) => fmt(r[c]))), r);
    }
  }
  return found;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const d = v;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  return trim(v);
}

/* ───────────────────── stage a verified batch (write) ───────────────────── */

export interface StageOutcome {
  staged: number;
  skipped: number;
  errors: string[];
}

/**
 * Park verified rows in the Temp table. The batch id is generated here and
 * handed back so the Pending tab can show one upload as one group.
 */
export async function stageRows(
  master: Master,
  batch: string,
  rows: { fileRow: number; status: 'new' | 'update'; values: Record<string, string>; note: string }[],
): Promise<StageOutcome> {
  const made = await ensureTempTable(master);
  if (made.error) return { staged: 0, skipped: rows.length, errors: [made.error] };

  const live = await liveColumns(master.table);
  const outcome: StageOutcome = { staged: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const cols: string[] = [];
    const marks: string[] = [];
    const args: unknown[] = [];

    for (const col of master.columns) {
      const shape = live.get(col.name.toLowerCase());
      if (!shape) continue;
      const pair = shape.kind === 'flag'
        ? await flagPairOf(master.table, shape.actual, { on: '1', off: '0' })
        : { on: '1', off: '0' };
      const { value } = coerceForColumn(row.values[col.name] ?? '', shape, pair.on, pair.off);
      cols.push(quoteIdent(shape.actual));
      marks.push('?');
      args.push(value);
    }
    for (const extra of STAGE_COLUMNS) {
      cols.push(quoteIdent(extra));
      marks.push('?');
    }
    args.push(batch, row.fileRow, row.status, row.note.slice(0, 250));

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO ${quoteIdent(master.tempTable)} (${cols.join(', ')}) VALUES (${marks.join(', ')})`,
        ...args,
      );
      outcome.staged++;
    } catch (e) {
      outcome.skipped++;
      outcome.errors.push(`Row ${row.fileRow}: ${friendly(e, master.tempTable)}`);
    }
  }
  return outcome;
}

/* ───────────────────────────── the Pending tab ───────────────────────────── */

export async function pendingBatches(): Promise<PendingBatch[]> {
  const { MASTERS } = await import('./uploadMasters');
  const out: PendingBatch[] = [];

  for (const m of MASTERS) {
    const has = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
      m.tempTable,
    );
    if (!Number(has[0]?.n ?? 0)) continue;

    // One grouped query answers every batch of this master at once.
    const grouped = await prisma.$queryRawUnsafe<
      { UpBatch: string; n: number; upd: number }[]
    >(
      `SELECT UpBatch, COUNT(*) AS n,
              SUM(CASE WHEN UpStatus = 'update' THEN 1 ELSE 0 END) AS upd
         FROM ${quoteIdent(m.tempTable)}
        GROUP BY UpBatch
        ORDER BY UpBatch DESC`,
    );
    for (const r of grouped) {
      const total = Number(r.n ?? 0);
      const updates = Number(r.upd ?? 0);
      out.push({
        batch: String(r.UpBatch),
        masterKey: m.key,
        masterLabel: m.label,
        tempTable: m.tempTable,
        liveTable: m.table,
        rows: total,
        newRows: total - updates,
        updateRows: updates,
      });
    }
  }
  return out;
}

export async function pendingRows(batch: string) {
  const { MASTERS } = await import('./uploadMasters');
  for (const m of MASTERS) {
    const has = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
      m.tempTable,
    );
    if (!Number(has[0]?.n ?? 0)) continue;
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${quoteIdent(m.tempTable)} WHERE UpBatch = ? ORDER BY UpFileRow`,
      batch,
    );
    if (rows.length) return { master: m, rows };
  }
  return null;
}

/* ─────────────────────── GO TO LIVE: the only real write ─────────────────────── */

export interface GoLiveOutcome {
  inserted: number;
  updated: number;
  failed: number;
  errors: string[];
}

/**
 * Move one batch from its Temp table into the live table: INSERT where the key
 * is new, UPDATE where it already exists. Then the batch is cleared from Temp,
 * so a second press cannot do it twice.
 */
export async function goLive(batch: string): Promise<GoLiveOutcome> {
  const found = await pendingRows(batch);
  if (!found) return { inserted: 0, updated: 0, failed: 0, errors: ['That batch is no longer waiting.'] };

  const { master, rows } = found;
  const live = await liveColumns(master.table);
  if (!live.size) {
    return { inserted: 0, updated: 0, failed: rows.length, errors: [`${master.table} does not exist.`] };
  }
  const keyCols = master.keyColumns.map((k) => live.get(k.toLowerCase())!.actual);
  const out: GoLiveOutcome = { inserted: 0, updated: 0, failed: 0, errors: [] };

  for (const row of rows) {
    // Every column is converted to the live column's own type once, and the
    // key is matched using those converted values. A key that is a date comes
    // back out of the Temp table as text; matching that text against a datetime
    // would miss the row and turn an UPDATE into a duplicate-key INSERT.
    const typed: Record<string, unknown> = {};
    const pairs = new Map<string, { on: string; off: string }>();
    for (const col of master.columns) {
      const shape = live.get(col.name.toLowerCase());
      if (!shape) continue;
      if (shape.kind === 'flag') {
        pairs.set(col.name.toLowerCase(), await flagPairOf(master.table, shape.actual, { on: '1', off: '0' }));
      }
    }

    const insertCols: string[] = [];
    const insertArgs: unknown[] = [];
    const setParts: string[] = [];
    const setArgs: unknown[] = [];

    for (const col of master.columns) {
      const shape = live.get(col.name.toLowerCase());
      if (!shape) continue;
      const pair = pairs.get(col.name.toLowerCase()) ?? { on: '1', off: '0' };
      const { value } = coerceForColumn(String(row[shape.actual] ?? ''), shape, pair.on, pair.off);
      typed[shape.actual] = value;
      insertCols.push(quoteIdent(shape.actual));
      insertArgs.push(value);
      if (!keyCols.includes(shape.actual)) {
        setParts.push(`${quoteIdent(shape.actual)} = ?`);
        setArgs.push(value);
      }
    }

    const keyVals = keyCols.map((c) => typed[c]);
    const keySql = keyCols.map(eq).join(' AND ');

    const current = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${quoteIdent(master.table)} WHERE ${keySql}`,
      ...keyVals,
    );

    try {
      if (current.length) {
        if (!setParts.length) { out.updated++; continue; }
        await prisma.$executeRawUnsafe(
          `UPDATE ${quoteIdent(master.table)} SET ${setParts.join(', ')} WHERE ${keySql}`,
          ...setArgs,
          ...keyVals,
        );
        out.updated++;
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO ${quoteIdent(master.table)} (${insertCols.join(', ')})
            VALUES (${insertCols.map(() => '?').join(', ')})`,
          ...insertArgs,
        );
        out.inserted++;
      }
    } catch (e) {
      out.failed++;
      out.errors.push(friendly(e, master.table));
    }
  }

  // Only clear the batch once it has landed, so a failure can be retried.
  if (!out.failed) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${quoteIdent(master.tempTable)} WHERE UpBatch = ?`, batch,
    );
  }
  return out;
}

/** Throw a staged batch away without touching the live table. */
export async function discardBatch(batch: string): Promise<boolean> {
  const found = await pendingRows(batch);
  if (!found) return false;
  await prisma.$executeRawUnsafe(
    `DELETE FROM ${quoteIdent(found.master.tempTable)} WHERE UpBatch = ?`, batch,
  );
  return true;
}

/** A fresh id for one upload. */
export function newBatchId(): string {
  return 'UP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}
