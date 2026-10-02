#!/usr/bin/env node
// scripts/create-upload-temp-tables.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Creates the seven Temp tables the Upload Data screen stages rows into.
//
//     node scripts/create-upload-temp-tables.mjs
//
// WHY BOTH THIS AND THE .sql FILE: some servers are easiest to reach with the
// mysql client, some are easiest through the app's own connection string. This
// reads DATABASE_URL from .env, so it works wherever the app itself works, and
// needs nothing installed. create-upload-temp-temp-tables.sql is the same thing
// for a SQL session — the two produce identical tables.
//
// SAFE TO RUN TWICE. Every table is created only if it is not already there,
// no master table is touched, and no row is read or written. Running this
// before the first upload just means the screen does not have to create the
// table itself on the way past.
//
// To also drop the tables again (this DOES lose anything waiting in them):
//     node scripts/create-upload-temp-tables.mjs --drop
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const DROP = process.argv.includes('--drop');

/** The seven Temp tables, in the order the app looks for them. */
const TABLES = [
  ['Suppliers',         'Tbl_SupplierMasterTemp'],
  ['Main Categories',   'Tbl_ItemCategory1Temp'],
  ['Sub Categories 1',  'Tbl_ItemCategory2Temp'],
  ['Sub Categories 2',  'Tbl_ItemCategory3Temp'],
  ['Sub Categories 3',  'Tbl_ItemCategory4Temp'],
  ['Item Master',       'Tbl_ItemMasterTemp'],
  ['Item Details',      'Tbl_ItemDetailTemp'],
];

/* ───────────────────────── read the connection string ───────────────────────── */

function readEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnv(), ...process.env };
const url = env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set, and there is no .env next to the project.');
  process.exit(1);
}

let cfg;
try {
  cfg = new URL(url);
} catch {
  console.error('DATABASE_URL is not a URL this script understands.');
  process.exit(1);
}
if (!/^mysql:/.test(cfg.protocol)) {
  console.error(`This script only knows how to talk to MySQL/TiDB, not ${cfg.protocol}`);
  process.exit(1);
}
const DB = decodeURIComponent(cfg.pathname.replace(/^\//, ''));
const where = `${decodeURIComponent(cfg.username)}@${cfg.hostname}:${cfg.port || 3306}/${DB}`;

let mysql;
try {
  ({ default: mysql } = await import('mysql2/promise'));
} catch {
  console.error('mysql2 is not installed. Either run scripts/create-upload-temp-tables.sql');
  console.error('through a mysql client, or run this inside the project where it is a dependency.');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: cfg.hostname,
  port: Number(cfg.port || 3306),
  user: decodeURIComponent(cfg.username),
  password: decodeURIComponent(cfg.password || ''),
  database: DB,
  multipleStatements: true,
});

/** A name is only ever one of ours, quoted here rather than trusted from input. */
const q = (n) => '`' + String(n).replace(/`/g, '``') + '`';

async function exists(name) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES'
    + ' WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)', [name]);
  return Number(rows[0].n) > 0;
}

async function columnCount(name) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS'
    + ' WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)', [name]);
  return Number(rows[0].n);
}

try {
  console.log(`\n  ${DROP ? 'Dropping' : 'Creating'} the Upload Data Temp tables in ${where}\n`);

  const sql = fs.readFileSync(path.join(here, 'create-upload-temp-tables.sql'), 'utf8');

  for (const [label, name] of TABLES) {
    if (DROP) {
      if (!(await exists(name))) { console.log(`  –  ${label.padEnd(18)} ${name} — not there`); continue; }
      await conn.query(`DROP TABLE ${q(name)}`);
      console.log(`  ✓  ${label.padEnd(18)} ${name} — dropped`);
      continue;
    }

    const before = await exists(name);
    if (before) {
      console.log(`  =  ${label.padEnd(18)} ${name} — already there, left alone`);
      continue;
    }
    // The statement comes from the checked-in .sql, but only the one table's
    // own block is ever run, so a stray statement in that file cannot be
    // executed by pointing it at a different name.
    const block = sql.split('CREATE TABLE IF NOT EXISTS').find(
      (b) => b.startsWith(` ${q(name)} (`),
    );
    if (!block) {
      console.error(`  ✗  ${label.padEnd(18)} ${name} — no CREATE found in the .sql file`);
      process.exitCode = 1;
      continue;
    }
    await conn.query('CREATE TABLE IF NOT EXISTS' + block.slice(0, block.indexOf(';') + 1));
    const cols = await columnCount(name);
    console.log(`  ✓  ${label.padEnd(18)} ${name} — created, ${cols} columns`);
  }

  const [have] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    + ' AND LOWER(TABLE_NAME) IN ('
    + TABLES.map(() => '?').join(', ') + ')',
    TABLES.map(([, n]) => n),
  );
  console.log(`\n  ${Number(have[0].n)} of ${TABLES.length} Temp tables are present.\n`);
  if (!DROP && Number(have[0].n) !== TABLES.length) process.exitCode = 1;
} catch (e) {
  console.error('\n  Could not finish:', e instanceof Error ? e.message : e, '\n');
  process.exitCode = 1;
} finally {
  await conn.end();
}
