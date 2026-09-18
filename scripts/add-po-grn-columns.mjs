// scripts/add-po-grn-columns.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Makes YOUR database match what the Purchase Order / GRN screens need.
//
//     node scripts/add-po-grn-columns.mjs
//
// WHY THIS IS NEEDED
//   Most databases already contain the four tables from the old desktop system
//   (tbl_poheader, tbl_podetails, tbl_grnheader, tbl_grndetails). Those tables
//   are 95% the same as the new screens expect, but a few columns are missing —
//   for example `tbl_podetails.LineNo` (the line number inside one PO) or
//   `tbl_grnheader.PONO` (which purchase order a receipt belongs to) or
//   `tbl_grndetails.BatchNo` (the batch number on the packet). When a
//   column is missing, MySQL refuses the save with
//       Unknown column 'LineNo' in 'INSERT INTO'
//   and the screen shows "…missing a column, so nothing was saved."
//
// WHAT IT DOES — and nothing else
//   • adds every missing column, exactly as scripts/add-po-grn-tables.sql
//     defines it (a column is never dropped, renamed or retyped)
//   • creates a table ONLY if it does not exist at all
//   • fills in LineNo for rows saved by the old system (1, 2, 3 … per document)
//   • if the received-quantity columns were missing, works out how much of each
//     purchase order has already been received from your existing confirmed GRNs
//   • prints what it found, what it added, and the keys of each table
//
//   Running it twice changes nothing. It changes no data in any other table.
//   It talks to MySQL directly — no Prisma, no rebuild, no restart needed.
//
// The connection string is DATABASE_URL, read from .env when it is not already
// set in the environment (the same variable the application uses).
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

/* ── 1. DATABASE_URL ─────────────────────────────────────────────────────── */

function loadEnvFile() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

loadEnvFile();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set (checked the environment and .env).\n" +
      "Add the same line your application uses, for example:\n" +
      "  DATABASE_URL=\"mysql://user:password@127.0.0.1:3306/sayosaloon\" node scripts/add-po-grn-columns.mjs",
  );
  process.exit(1);
}

/* ── 2. read the canonical table definitions ─────────────────────────────── */

const SQL_FILE = path.join(process.cwd(), "scripts", "add-po-grn-tables.sql");

if (!fs.existsSync(SQL_FILE)) {
  console.error(
    `Cannot find ${path.relative(process.cwd(), SQL_FILE)} — run this script from the project folder (the one that contains package.json).`,
  );
  process.exit(1);
}

/** Pull each CREATE TABLE out of the .sql file: the statement itself, its
 *  columns (name + definition) and its keys. One source of truth — the SQL. */
function parseDefinitions(text) {
  const tables = [];
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*ENGINE[^;]*;/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const statement = m[0];
    const columns = [];
    for (const raw of m[2].split("\n")) {
      const line = raw.replace(/--.*$/, "").trim().replace(/,$/, "").trim();
      if (!line) continue;
      if (/^(PRIMARY KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN KEY)\b/i.test(line)) continue;
      const cm = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
      if (!cm) continue;
      columns.push({ name: cm[1], def: cm[2].trim() });
    }
    if (columns.length) tables.push({ name, statement, columns });
  }
  return tables;
}

const DEFINITIONS = parseDefinitions(fs.readFileSync(SQL_FILE, "utf8"));
if (!DEFINITIONS.length) {
  console.error("Could not read the table definitions out of scripts/add-po-grn-tables.sql.");
  process.exit(1);
}

/* ── 3. work out what is missing, and add it ─────────────────────────────── */

const connection = await mysql.createConnection({ uri: url, multipleStatements: false });
const added = [];
const created = [];
let receivedColumnsWereMissing = false;

const norm = (v) => String(v).toLowerCase();

async function existingTables() {
  const [rows] = await connection.query("SHOW TABLES");
  return new Set(rows.map((r) => norm(Object.values(r)[0])));
}

async function columnsOf(table) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Map(rows.map((r) => [norm(r.Field), r.Field]));
}

/** Give rows that the old system saved a line number (1, 2, 3 … per document). */
async function backfillLineNo(table, docColumns, itemColumn) {
  const [docs] = await connection.query(
    `SELECT DISTINCT LocCode, ${docColumns} AS Doc FROM \`${table}\` WHERE ${docColumns} <> ''`,
  );
  let numbered = 0;
  for (const doc of docs) {
    const [rows] = await connection.query(
      `SELECT ${itemColumn} AS Item FROM \`${table}\`
        WHERE LocCode = ? AND ${docColumns} = ? AND (LineNo IS NULL OR LineNo = 0)
        ORDER BY ${itemColumn}`,
      [doc.LocCode, doc.Doc],
    );
    let n = 1;
    for (const row of rows) {
      await connection.query(
        `UPDATE \`${table}\` SET LineNo = ?
          WHERE LocCode = ? AND ${docColumns} = ? AND ${itemColumn} = ? AND (LineNo IS NULL OR LineNo = 0)`,
        [n, doc.LocCode, doc.Doc, row.Item],
      );
      n += 1;
      numbered += 1;
    }
  }
  return numbered;
}

/** How much of each PO line has already arrived, from the confirmed GRNs. */
async function backfillReceived() {
  const [res] = await connection.query(`
    UPDATE tbl_podetails d
    SET d.GRNQty = COALESCE((
          SELECT SUM(g.GRNQty) FROM tbl_grndetails g
            JOIN tbl_grnheader h
              ON h.LocCode = g.LocCode AND h.GRNNo = g.GRNNo
           WHERE UPPER(h.Confirmed) = 'Y'
             AND RTRIM(g.PONO) = RTRIM(d.PONo)
             AND RTRIM(g.ItemCode) = RTRIM(d.ItemCode)), 0),
        d.GRNNOs = COALESCE((
          SELECT GROUP_CONCAT(DISTINCT g.GRNNo SEPARATOR ', ') FROM tbl_grndetails g
            JOIN tbl_grnheader h
              ON h.LocCode = g.LocCode AND h.GRNNo = g.GRNNo
           WHERE UPPER(h.Confirmed) = 'Y'
             AND RTRIM(g.PONO) = RTRIM(d.PONo)
             AND RTRIM(g.ItemCode) = RTRIM(d.ItemCode)), '')
    WHERE d.GRNQty = 0
  `);
  return res.affectedRows ?? 0;
}

async function keysOf(table) {
  const [rows] = await connection.query(`SHOW INDEX FROM \`${table}\``);
  const byKey = new Map();
  for (const r of rows) {
    const key = r.Key_name;
    if (!byKey.has(key)) byKey.set(key, { unique: Number(r.Non_unique) === 0, columns: [] });
    byKey.get(key).columns.push(r.Column_name);
  }
  return byKey;
}

try {
  const [dbRow] = await connection.query("SELECT DATABASE() AS db");
  console.log(`Database : ${dbRow[0]?.db ?? "?"}`);
  console.log(`Blueprint: scripts/add-po-grn-tables.sql\n`);

  const presentTables = await existingTables();
  const notes = [];

  for (const def of DEFINITIONS) {
    if (!presentTables.has(norm(def.name))) {
      await connection.query(def.statement);
      created.push(def.name);
      console.log(`✓ ${def.name} — created (it did not exist yet)`);
      if (def.name === "tbl_podetails" || def.name === "tbl_grndetails") notes.push(`${def.name}: empty, so nothing to number`);
      continue;
    }

    const have = await columnsOf(def.name);
    const missing = def.columns.filter((c) => !have.has(norm(c.name)));

    if (!missing.length) {
      console.log(`· ${def.name} — complete (${def.columns.length} columns)`);
    } else {
      console.log(`▼ ${def.name} — ${missing.length} column(s) missing:`);
      for (const col of missing) {
        await connection.query(`ALTER TABLE \`${def.name}\` ADD COLUMN \`${col.name}\` ${col.def}`);
        added.push(`${def.name}.${col.name}`);
        console.log(`    + ${col.name}  ${col.def}`);
      }
    }

    /* line numbers for rows written by the old system */
    if (missing.some((c) => norm(c.name) === "lineno")) {
      const docColumn = def.name === "tbl_podetails" ? "PONo" : "GRNNo";
      try {
        const n = await backfillLineNo(def.name, docColumn, "ItemCode");
        console.log(`    → numbered ${n} existing row(s) 1, 2, 3 …`);
      } catch (err) {
        console.log(`    ! could not number the existing rows: ${err.message}`);
      }
    }

    /* remember whether the received-quantity columns had to be added — the
       backfill below needs tbl_grndetails.PONO to exist first, and that may be
       added by a later pass over the tables. */
    if (def.name === "tbl_podetails" && missing.some((c) => norm(c.name) === "grnqty")) {
      receivedColumnsWereMissing = true;
    }
  }

  /* the serial counters, so PO / GRN numbers can be issued */
  if (presentTables.has("tbl_serials")) {
    const [r] = await connection.query(
      `INSERT IGNORE INTO tbl_serials (SeriCode, SeriNo, SeriDate) VALUES ('PO','0000000',NULL),('GRN','0000000',NULL)`,
    );
    if (r.affectedRows) console.log(`✓ tbl_serials — added the PO and GRN counters`);
    else console.log(`· tbl_serials — PO and GRN counters already there`);
  } else {
    console.log(`! tbl_serials is missing — run scripts/add-serials-table.sql first`);
  }

  /* the already-received quantities, now that every table has its columns */
  if (receivedColumnsWereMissing) {
    console.log("");
    try {
      const [hasPono] = await connection.query(
        `SELECT COUNT(*) AS n FROM tbl_grndetails WHERE RTRIM(PONO) <> ''`,
      );
      if (Number(hasPono[0]?.n || 0) === 0) {
        console.log(
          "note: your existing GRN lines do not say which purchase order they came from,\n" +
            "      so the old PO lines cannot be marked as received automatically. New receipts\n" +
            "      are tracked from now on.",
        );
      } else {
        const n = await backfillReceived();
        console.log(`✓ worked out the already-received quantities for ${n} purchase-order line(s) from your confirmed GRNs`);
      }
    } catch (err) {
      console.log(`! could not work out the received quantities: ${err.message}`);
    }
  }

  /* what the keys of the line tables allow */
  console.log("");
  for (const t of ["tbl_podetails", "tbl_grndetails"]) {
    if (!(await existingTables()).has(t)) continue;
    for (const [name, key] of await keysOf(t)) {
      const label = name === "PRIMARY" ? "primary key" : key.unique ? "unique key" : "index";
      console.log(`  ${t} ${label}: ${key.columns.join(" + ")}`);
      if (key.unique && key.columns.some((c) => norm(c) === "itemcode") && name !== "PRIMARY") {
        notes.push(
          `${t} has a unique key on ${key.columns.join(" + ")} — the SAME item can appear only once per document.`,
        );
      }
    }
  }

  console.log("");
  if (created.length) console.log(`Tables created : ${created.join(", ")}`);
  if (added.length) console.log(`Columns added  : ${added.length}`);
  else if (!created.length) console.log("Nothing to change — your tables already match the screens.");
  if (notes.length) {
    console.log("");
    for (const n of notes) console.log(`note: ${n}`);
  }
  console.log("\nDone. Start the app and save a purchase order again.");
} catch (err) {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
