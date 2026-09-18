// scripts/check-legacy-tables.mjs
// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY. This script only ever runs SELECT / SHOW statements. It writes
// nothing to the database — no INSERT, no UPDATE, no CREATE, no ALTER, no DROP.
//
//     node scripts/check-legacy-tables.mjs
//
// WHY
//   The old desktop program (frmTxnGRN, frmStocks in VB6) keeps stock in its
//   own tables — Tbl_RowItems, Tbl_TxnMovement — and moves the cost of a
//   service through Tbl_Recipies / Tbl_Menuitems. The new GRN screen has to
//   write the same story into those tables, or the two programs will disagree
//   about stock and cost. Before a single line of that is written, this script
//   reports exactly which of those objects exist on YOUR server, which columns
//   they have, and what the existing rows look like (the data itself tells us
//   how the old program fills AddDeduct, TxnType, SysSerialId …).
//
// WHAT IT PRINTS
//   1. the server + database + lower_case_table_names (whether Tbl_X and tbl_x
//      are the same table on this machine)
//   2. every table and view the old GRN code touches — EXISTS / MISSING
//   3. the columns of each one that exists (name · type · null · default · key)
//   4. row counts, and a few real rows from the small tables (Tbl_Serials,
//      Tbl_TxnNumbers) so the number series can be matched exactly
//   5. the DISTINCT values already used in Tbl_TxnMovement (TxnType, AddDeduct)
//      and in Tbl_GRNHeader (Confirmed, GRNTYPE)
//   6. the definition of the views (Vw_RowItemMaster, Vw_GRNDETAILS …)
//   7. anything MISSING that the new GRN would need — listed at the end
//
// The same report is written to legacy-check-report.txt in the project folder.
// Send that file back and the GRN alignment can be written against facts.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

/* ── DATABASE_URL (same rules as scripts/add-po-grn-columns.mjs) ─────────── */

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

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set (checked the environment and .env).\n" +
      "Run this from the project folder (the one with package.json and .env in it).",
  );
  process.exit(1);
}

/* ── what we are looking for ─────────────────────────────────────────────── */

/** name → why it matters (used for the report) */
const TABLES = [
  ["Tbl_RowItems", "old stock master — StkBal (on hand) and RowCost (average cost) live here"],
  ["Tbl_TxnMovement", "old stock ledger — one row per receipt / issue, written by StocksAddition"],
  ["Tbl_Menuitems", "old service master — RowCost / CostPrice change when an item's cost changes"],
  ["Tbl_Recipies", "old recipe lines — Price is item cost × qty, summed into the menu item"],
  ["Tbl_GRNHeader", "old GRN header (should be the same table as tbl_grnheader)"],
  ["Tbl_GRNDetails", "old GRN lines (should be the same table as tbl_grndetails)"],
  ["Tbl_POHeader", "old PO header — the GRN save sets GRNed = 'Y' here"],
  ["Tbl_PODetails", "old PO lines — GRNQty / GRNNOs"],
  ["Tbl_Serials", "number series (GetSerialNo)"],
  ["Tbl_TxnNumbers", "document numbers (GetTxnNo) — where the old program gets GRN numbers"],
  ["tbl_itemmaster", "new item master — StockBalance, RawCost, Retailprice"],
  ["tbl_stocktxn", "new stock ledger"],
  ["tbl_recipes", "new recipe lines"],
  ["tbl_poheader", "new PO header"],
  ["tbl_podetails", "new PO lines"],
  ["tbl_grnheader", "new GRN header"],
  ["tbl_grndetails", "new GRN lines"],
  ["tbl_suppliermaster", "supplier master"],
  ["tbl_locationmaster", "location master"],
];

const VIEWS = [
  ["Vw_RowItemMaster", "the old program reads stock through this view"],
  ["Vw_GRNDETAILS", "used to decide if a GRN is new, editable or already saved"],
  ["Vw_GRNHeader", "GRN list in the old program"],
  ["Vw_PODetails", "PO lines in the old program"],
  ["Vw_ItemMaster", "item master in the old program"],
];

/** small tables: print their rows so the numbering can be matched exactly */
const PEEK = ["Tbl_Serials", "tbl_serials", "Tbl_TxnNumbers", "tbl_txnnumbers"];

/** columns that must exist for the GRN alignment (name → columns) */
const NEEDED_COLUMNS = {
  Tbl_RowItems: ["LocCode", "RowItemCode", "StkBal", "RowCost"],
  Tbl_TxnMovement: [
    "LocCode", "RowItemCode", "TxnNo", "TxnType", "TxnDate", "TxnDateTime",
    "PreQty", "TxnQty", "LastQty", "UserId", "SysSerialId", "Remarks",
    "AddDeduct", "TXNATETIMEMANUAL",
  ],
  Tbl_Menuitems: ["MenuItmID", "RowCost", "CostPrice", "CostMarkUp"],
  Tbl_Recipies: ["MenuItmID", "RowItemCode", "Qty", "Price", "LocCode"],
  Tbl_POHeader: ["LocCode", "PONO", "GRNed"],
  Tbl_GRNDetails: ["LocCode", "GRNNo", "ItemCode", "GRNQty", "FreeQty", "CostPrice"],
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

const out = [];
function say(line = "") {
  out.push(line);
  process.stdout.write(line + "\n");
}

function pad(text, width) {
  const s = String(text ?? "");
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

async function q(sql, params = []) {
  /* every statement this script runs goes through here — SELECT and SHOW only */
  const head = sql.trim().split(/\s+/)[0].toUpperCase();
  if (head !== "SELECT" && head !== "SHOW") {
    throw new Error(`Refused a non read-only statement: ${sql.slice(0, 40)}…`);
  }
  const [rows] = await conn.query(sql, params);
  return rows;
}

let conn;

/* ── main ────────────────────────────────────────────────────────────────── */

try {
  conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: false,
    dateStrings: true,
  });

  const [[ver]] = [await q("SELECT VERSION() AS v")];
  const dbName = (await q("SELECT DATABASE() AS d"))[0].d;
  const lct = (await q("SHOW VARIABLES LIKE 'lower_case_table_names'"))[0];

  say("════════════════════════════════════════════════════════════════════");
  say(" LEGACY / NEW TABLE CHECK — read only, nothing was written");
  say("════════════════════════════════════════════════════════════════════");
  say(` date            : ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  say(` MySQL           : ${ver.v}`);
  say(` database        : ${dbName}`);
  say(` lower_case_table_names = ${lct?.Value}  ${lct?.Value === "1" || lct?.Value === 1 ? "(Tbl_X and tbl_x ARE the same table here)" : "(Tbl_X and tbl_x are DIFFERENT names here)"}`);
  say("");

  /* ── 2/3. objects ─────────────────────────────────────────────────────── */

  const objectRows = await q(
    `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const byLower = new Map();
  for (const r of objectRows) byLower.set(String(r.TABLE_NAME).toLowerCase(), r);

  const found = [];              // one entry per name asked for (for the listing)
  const objects = new Map();     // real database name (lowercased) → the object, once
  const missing = [];

  /** Remember a table/view by the name the server actually stored, so a name
   *  asked for in a different case (Tbl_X vs tbl_x) is read only once. */
  function remember(name, why, hit) {
    const type = hit.TABLE_TYPE === "VIEW" ? "VIEW" : "table";
    say(`  ✔ ${pad(name, 18)} ${pad(type, 6)} ${type === "table" ? "" : ""}${why}`);
    found.push({ name, why, type, real: hit.TABLE_NAME });
    objects.set(String(hit.TABLE_NAME).toLowerCase(), {
      real: hit.TABLE_NAME,
      type,
      why,
    });
  }

  say("────────────────────────────── 1. tables the old GRN code uses ──────");
  for (const [name, why] of TABLES) {
    const hit = byLower.get(name.toLowerCase());
    if (hit) remember(name, why, hit);
    else {
      say(`  ✘ ${pad(name, 18)} MISSING             ${why}`);
      missing.push({ name, why });
    }
  }
  say("");

  say("────────────────────────────── 2. views the old program reads ───────");
  for (const [name, why] of VIEWS) {
    const hit = byLower.get(name.toLowerCase());
    if (hit) remember(name, why, hit);
    else {
      say(`  ✘ ${pad(name, 18)} MISSING             ${why}`);
      missing.push({ name, why });
    }
  }
  say("");

  const everyObject = [...objects.values()].sort((a, b) =>
    a.real.toLowerCase().localeCompare(b.real.toLowerCase()),
  );

  /* ── columns ──────────────────────────────────────────────────────────── */

  for (const { real, type } of everyObject) {
    const cols = await q(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_KEY
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [real],
    );
    say(`────────────────────────────── ${real}  (${type}, ${cols.length} columns)`);
    if (cols.length === 0) {
      say("   (no column rows found — see the definition below if it is a view)");
    }
    for (const c of cols) {
      say(
        `   ${pad(c.COLUMN_NAME, 20)} ${pad(c.COLUMN_TYPE, 24)}` +
          `${c.IS_NULLABLE === "NO" ? "NOT NULL" : "null    "} ` +
          `default=${c.COLUMN_DEFAULT === null ? "—" : String(c.COLUMN_DEFAULT).slice(0, 20)} ` +
          `${c.EXTRA || ""} ${c.COLUMN_KEY || ""}`.trimEnd(),
      );
    }
    say("");
  }

  /* ── 4. counts + small tables ─────────────────────────────────────────── */

  say("────────────────────────────── 3. how much is in them ───────────────");
  for (const { real } of everyObject) {
    try {
      const rows = await q(`SELECT COUNT(*) AS n FROM \`${real}\``);
      say(`  ${pad(real, 18)} ${String(rows[0].n).padStart(10)} rows`);
    } catch (e) {
      say(`  ${pad(real, 18)}        (cannot count: ${e.code || e.message})`);
    }
  }
  say("");

  for (const name of PEEK) {
    if (!byLower.has(name.toLowerCase())) continue;
    const real = byLower.get(name.toLowerCase()).TABLE_NAME;
    const rows = await q(`SELECT * FROM \`${real}\` LIMIT 40`);
    say(`────────────────────────────── ${real} — every row (max 40)`);
    if (rows.length === 0) {
      say("   (empty)");
    } else {
      say("   " + Object.keys(rows[0]).join(" | "));
      for (const r of rows) say("   " + Object.values(r).map((v) => String(v ?? "").slice(0, 40)).join(" | "));
    }
    say("");
  }

  /* ── 5. how the old rows actually look ────────────────────────────────── */

  say("────────────────────────────── 4. what the old rows say ──────────────");

  async function distinct(table, column, extraWhere = "") {
    const name = byLower.get(table.toLowerCase())?.TABLE_NAME;
    if (!name) return;
    try {
      const rows = await q(
        `SELECT \`${column}\` AS v, COUNT(*) AS n FROM \`${name}\` ${extraWhere} GROUP BY \`${column}\` ORDER BY n DESC LIMIT 15`,
      );
      say(
        `  ${table}.${column}: ` +
          (rows.length === 0
            ? "(no rows)"
            : rows.map((r) => `${JSON.stringify(r.v)}=${r.n}`).join("  ")),
      );
    } catch {
      /* the column or table is not there — already reported above */
    }
  }

  await distinct("Tbl_TxnMovement", "TxnType");
  await distinct("Tbl_TxnMovement", "AddDeduct");
  await distinct("Tbl_GRNHeader", "Confirmed");
  await distinct("Tbl_GRNHeader", "GRNTYPE");
  await distinct("Tbl_POHeader", "GRNed");
  await distinct("Tbl_GRNHeader", "SysSerialNo");
  say("");

  async function sample(table, orderBy, limit = 4) {
    const name = byLower.get(table.toLowerCase())?.TABLE_NAME;
    if (!name) return;
    try {
      /* order by the first of these columns the table actually has, so the
         report never fails on a column this database spells differently */
      const have = new Set(
        (
          await q(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [name],
          )
        ).map((r) => String(r.COLUMN_NAME).toLowerCase()),
      );
      const orderColumn =
        String(orderBy)
          .split(",")
          .map((c) => c.trim())
          .find((c) => have.has(c.toLowerCase())) ||
        [...have][0];
      if (!orderColumn) return;
      const rows = await q(
        `SELECT * FROM \`${name}\` ORDER BY \`${orderColumn}\` DESC LIMIT ${limit}`,
      );
      if (rows.length === 0) {
        say(`  ${table}: (empty)`);
        return;
      }
      say(`  ── ${table} — newest ${rows.length} by ${orderColumn}`);
      say("     " + Object.keys(rows[0]).join(" | "));
      for (const r of rows) {
        say("     " + Object.values(r).map((v) => String(v ?? "").slice(0, 32)).join(" | "));
      }
    } catch (e) {
      say(`  ${table}: (cannot read: ${e.code || e.message})`);
    }
  }

  await sample("Tbl_TxnMovement", "TxnDateTime, TxnDate, TxnNo");
  await sample("Tbl_RowItems", "RowItemCode, ItemCode", 3);
  await sample("Tbl_GRNHeader", "TxnDate, GRNDate, GRNNo", 3);
  say("");

  /* ── 6. view definitions ──────────────────────────────────────────────── */

  say("────────────────────────────── 5. how the views are built ────────────");
  for (const { real, type } of everyObject) {
    if (type !== "VIEW") continue;
    try {
      const rows = await q(`SHOW CREATE VIEW \`${real}\``);
      const def = Object.values(rows[0])[1] ?? rows[0]["Create View"];
      say(`  ── ${real}`);
      say("     " + String(def).replace(/\s+/g, " ").slice(0, 900));
      say("");
    } catch (e) {
      say(`  ${real}: (cannot read the definition: ${e.code || e.message})`);
    }
  }

  /* ── 7. the answer: what is missing ───────────────────────────────────── */

  say("────────────────────────────── 6. WHAT IS MISSING ────────────────────");
  if (missing.length === 0) {
    say("  nothing — every table and view above exists.");
  } else {
    for (const m of missing) say(`  ✘ ${m.name} — ${m.why}`);
  }

  const gaps = [];
  for (const [table, cols] of Object.entries(NEEDED_COLUMNS)) {
    const real = byLower.get(table.toLowerCase())?.TABLE_NAME;
    if (!real) continue;
    const have = (
      await q(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [real],
      )
    ).map((r) => String(r.COLUMN_NAME).toLowerCase());
    const lack = cols.filter((c) => !have.includes(c.toLowerCase()));
    if (lack.length > 0) gaps.push(`${real}: missing ${lack.join(", ")}`);
  }
  if (gaps.length > 0) {
    say("");
    say("  columns missing on tables that DO exist:");
    for (const g of gaps) say(`  ✘ ${g}`);
  }

  say("");
  say("════════════════════════════════════════════════════════════════════");
  say(" Nothing was changed. Send legacy-check-report.txt back.");

  fs.writeFileSync(
    path.join(process.cwd(), "legacy-check-report.txt"),
    out.join("\n") + "\n",
    "utf8",
  );
  console.log("\nreport written to: legacy-check-report.txt");
} catch (e) {
  console.error("\nthe check could not finish:", e.code || "", e.message);
  if (out.length > 0) console.error("\n(what it managed to read is above)");
  process.exitCode = 1;
} finally {
  if (conn) await conn.end().catch(() => {});
}
