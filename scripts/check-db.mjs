// scripts/check-db.mjs
// ─────────────────────────────────────────────────────────────────────────────
// “Can this machine reach the salon database?” — run it and read the answer.
//
//   node scripts/check-db.mjs
//
// It does three things, in order, and stops at the first failure so the cause is
// never ambiguous:
//
//   1. shows what DATABASE_URL points at (host:port, database, user — never the
//      password), read from .env / .env.local / the environment
//   2. opens a plain TCP connection to host:3306 with a 6 second timeout
//        ✗ “TCP connect failed”  → the network/firewall is blocking port 3306,
//          or the host name is wrong. It is NOT a password problem.
//        ✓ “TCP connect OK”      → the server is reachable; continue
//   3. runs `SELECT VERSION()` through Prisma with the real credentials
//        ✗ “login failed”        → user name or password is wrong (reset it in
//          the hosting panel and copy it again)
//        ✗ “denied for user”     → this internet connection is not allowed to
//          reach the database (enable remote access / add your IP)
//        ✓ latency + server version
//
// Nothing is written to the database — SELECT only.
// ─────────────────────────────────────────────────────────────────────────────
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/* ── 1. read .env without any dependency ─────────────────────────────────── */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

const loaded = [".env.local", ".env"].filter((name) =>
  loadEnvFile(path.join(root, name)),
);
console.log(`\n=== Database connection check ===\n`);
console.log(
  loaded.length
    ? `Read ${loaded.join(", ")}`
    : "No .env / .env.local found — using the environment variables of this shell.",
);

const url = process.env.DATABASE_URL || "";
if (!url) {
  console.log("\n✗ DATABASE_URL is not set.");
  console.log(
    "  Create a .env file in the project folder:\n" +
      "  DATABASE_URL=\"mysql://USER:PASSWORD@HOST:3306/DATABASE\"\n",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.log("\n✗ DATABASE_URL is not a valid URL.");
  console.log(
    "  It must look like  mysql://user:password@host:3306/database\n" +
      "  · no quotes or spaces, and an @ inside a password must be written %40\n",
  );
  process.exit(1);
}

const host = parsed.hostname;
const port = Number(parsed.port || 3306);
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
const user = decodeURIComponent(parsed.username);
const extra = parsed.searchParams.toString();

console.log(`\nTarget`);
console.log(`  host      : ${host}:${port}`);
console.log(`  database  : ${database || "(missing!)"}`);
console.log(`  user      : ${user || "(missing!)"}`);
console.log(`  password  : ${parsed.password ? "set (hidden)" : "MISSING"}`);
if (extra) console.log(`  options   : ${extra}`);

/* ── 2. plain TCP connect ────────────────────────────────────────────────── */
const started = Date.now();
const tcp = await new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  const done = (result) => {
    socket.destroy();
    resolve(result);
  };
  socket.setTimeout(6000);
  socket.once("connect", () => done({ ok: true, ms: Date.now() - started }));
  socket.once("timeout", () => done({ ok: false, error: "timed out after 6s" }));
  socket.once("error", (err) => done({ ok: false, error: err.code || err.message }));
});

if (!tcp.ok) {
  console.log(`\n✗ TCP connect to ${host}:${port} FAILED (${tcp.error}).`);
  console.log(
    [
      "",
      "  This is a NETWORK problem, not a password problem.",
      "",
      "  Check, in this order:",
      "   1. Is the host name still the one in your hosting panel? Shared-hosting",
      "      databases are moved between mysql####.site4now.net servers; the",
      "      phpMyAdmin link always shows the current one.",
      "   2. Is the database awake? On free hosting it is suspended after a while",
      "      — open phpMyAdmin once to wake it, then run this script again.",
      "   3. Is remote access switched on for the database (allow external /",
      "      remote MySQL, sometimes limited to a list of IP addresses)?",
      "   4. Is your own internet connection blocking port 3306? Try a mobile",
      "      hotspot — if it connects there, your ISP/router is the problem.",
      "",
      `  Test by hand:  ping ${host}`,
      `                 Test-NetConnection ${host} -Port ${port}      (PowerShell)`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`\n✓ TCP connect OK (${tcp.ms} ms) — the server is reachable.`);

/* ── 3. a real query through Prisma ──────────────────────────────────────── */
let PrismaClient;
try {
  ({ PrismaClient } = await import("@prisma/client"));
} catch {
  console.log(
    "\n! @prisma/client is not installed yet — run `npm install` and try again.\n",
  );
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const queryStart = Date.now();
  const rows = await Promise.race([
    prisma.$queryRaw`SELECT VERSION() AS v, DATABASE() AS db`,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("query timed out after 10s")), 10000),
    ),
  ]);
  const row = Array.isArray(rows) ? rows[0] : rows;
  console.log(`✓ Query OK (${Date.now() - queryStart} ms)`);
  console.log(`  server version : ${row?.v ?? "?"}`);
  console.log(`  connected db   : ${row?.db ?? "?"}`);

  /* The bill tables are what the billing screen needs. */
  const tables = await prisma.$queryRaw`
    SELECT TABLE_NAME AS name
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('tbl_billheader','tbl_billdetail','tbl_billpaytxn','tbl_billtaxes','tbl_taxes','tbl_serials')
  `;
  const found = (tables ?? []).map((t) => String(t.name));
  const needed = [
    "tbl_billheader",
    "tbl_billdetail",
    "tbl_billpaytxn",
    "tbl_billtaxes",
    "tbl_taxes",
    "tbl_serials",
  ];
  console.log("\nTables used by the bill screen");
  needed.forEach((name) => {
    console.log(`  ${found.includes(name) ? "✓" : "✗"} ${name}`);
  });
  if (!found.includes("tbl_serials")) {
    console.log(
      "  → tbl_serials is missing: run scripts/add-serials-table.sql (it seeds the INV series).",
    );
  }

  /* Every item-code column must be CHAR(15): item codes are the identity of a
     service/material and two of them can share their first 10 characters. */
  const codeCols = await prisma.$queryRaw`
    SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col, CHARACTER_MAXIMUM_LENGTH AS len
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         (TABLE_NAME = 'tbl_itemmaster'               AND COLUMN_NAME = 'ItemCode')
         OR (TABLE_NAME = 'tbl_itemdetail'             AND COLUMN_NAME = 'ItemCode')
         OR (TABLE_NAME = 'tbl_billdetail'             AND COLUMN_NAME = 'ItemID')
         OR (TABLE_NAME = 'tbl_bookingservicedetail'   AND COLUMN_NAME = 'ServiceItemID')
         OR (TABLE_NAME = 'Tbl_BookingServiceItemAddTech' AND COLUMN_NAME = 'ServiceItemID')
         OR (TABLE_NAME = 'Tbl_BookingServiceRecipe'   AND COLUMN_NAME IN ('ServiceItemID','RawItemCode'))
         OR (TABLE_NAME = 'tbl_recipes'                AND COLUMN_NAME IN ('MenuItmID','RowItemCode'))
       )
     ORDER BY TABLE_NAME, COLUMN_NAME
  `;
  console.log("\nItem-code columns (must be char(15))");
  const narrow = [];
  (codeCols ?? []).forEach((c) => {
    const len = Number(c.len) || 0;
    const ok = len >= 15;
    console.log(`  ${ok ? "✓" : "✗"} ${String(c.tbl)}.${String(c.col)} → char(${len})`);
    if (!ok) narrow.push(`${c.tbl}.${c.col}`);
  });
  if (narrow.length) {
    console.log("  → these still cut every item code to 10 characters:");
    console.log(`     ${narrow.join(", ")}`);
    console.log("     Run scripts/migrate-itemcode-char15.sql, then this check again.");
  }

  /* Rows written before the migration hold the old 10-character code. The app
     still resolves them; upgrading them makes every join exact. */
  try {
    const legacyRows = await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM tbl_bookingservicedetail WHERE CHAR_LENGTH(RTRIM(ServiceItemID)) < 15) AS bookings,
        (SELECT COUNT(*) FROM tbl_billdetail           WHERE CHAR_LENGTH(RTRIM(ItemID))       < 15) AS bills,
        (SELECT COUNT(*) FROM Tbl_BookingServiceRecipe WHERE CHAR_LENGTH(RTRIM(RawItemCode))  < 15) AS materials
    `;
    const row = Array.isArray(legacyRows) ? legacyRows[0] : legacyRows;
    const counts = {
      "booked services": Number(row?.bookings ?? 0),
      "billed lines": Number(row?.bills ?? 0),
      "recorded materials": Number(row?.materials ?? 0),
    };
    console.log("\nLegacy 10-character item codes still stored");
    let leftovers = 0;
    Object.entries(counts).forEach(([label, count]) => {
      leftovers += count;
      console.log(`  ${count === 0 ? "✓" : "!"} ${label.padEnd(19)} ${count}`);
    });
    if (leftovers > 0) {
      console.log(
        "  → optional: run scripts/migrate-itemcode-char15.sql STEP 2 to upgrade them " +
          "to the full code (the app resolves them either way).",
      );
    }
  } catch (err) {
    console.log(
      `\n! legacy item-code row check skipped: ${
        (err instanceof Error ? err.message : String(err)).split("\n")[0]
      }`,
    );
  }

  console.log("\nEverything the app needs is reachable.\n");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err?.code || "";
  console.log(`\n✗ Query FAILED${code ? ` (${code})` : ""}.`);
  console.log(`  ${message.split("\n").filter(Boolean).slice(0, 4).join("\n  ")}\n`);
  const authPlugin = /Unknown authentication plugin[\s`'""]*([a-z0-9_]+)/i.exec(message)?.[1];
  console.log(
    [
      authPlugin
        ? `  The server wants an authentication plugin Prisma cannot use (${authPlugin}).\n` +
          "  Fix it in phpMyAdmin → SQL:\n" +
          "    ALTER USER '" + user + "'@'%' IDENTIFIED WITH mysql_native_password BY 'your-password';\n" +
          "    FLUSH PRIVILEGES;\n" +
          "  then put the same password into DATABASE_URL."
        : code === "P1000"
        ? "  The host answered but refused the login → the user name or password is wrong."
        : code === "P1003"
          ? "  The database name does not exist on that server."
          : "  Check the user name, the password and the database name against the hosting panel.",
      "  Reset the database password in the panel and paste it into DATABASE_URL",
      "  (URL-encode special characters: @ → %40, # → %23, / → %2F).",
      "  With shared hosting it also helps to keep one connection only:",
      "    DATABASE_URL=\"mysql://user:pass@host:3306/db?connection_limit=1&connect_timeout=20\"",
      "",
    ].join("\n"),
  );
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
