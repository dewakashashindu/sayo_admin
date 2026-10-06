// scripts/verify-speciality-flow.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Runs the REAL src/lib/technicianSpecialities.ts against an in-memory stand-in
// for MySQL, and walks the exact flow a shopkeeper does:
//
//   Administration → Technician Specialities → create
//     → Users screen     → give one person several
//     → Item Master screen → give an item one
//     → delete a speciality → everything that referenced it is caught
//
// The fake database understands only the statements the app actually sends,
// and it stores CHAR(10) columns the way MySQL does — blank padded on the way
// in. That is deliberate: the RTRIM() calls in the real code are only correct
// if the padding is real, so a fake that quietly trimmed would prove nothing.
//
// Run:  node scripts/verify-speciality-flow.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(tmpdir(), "sayo-spec-flow");

/* ── 1. compile the real TypeScript down to runnable JS ──────────────────── */

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "package.json"), '{"type":"commonjs"}');

/** Transpile a repo .ts file and point its `@/lib/*` imports at the stubs. */
function build(file, rewrites) {
  const source = readFileSync(join(ROOT, file), "utf8");
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of Object.entries(rewrites)) js = js.split(from).join(to);
  const name = file.split("/").pop().replace(/\.ts$/, ".js");
  writeFileSync(join(OUT, name), js);
  return name;
}

/* ── 2. an in-memory stand-in for the three tables ───────────────────────── */

/** CHAR(10): MySQL right-pads with spaces and keeps them until RTRIM. */
const pad = (s) => s.padEnd(10, " ");
const rtrim = (s) => String(s).replace(/\s+$/, "");

/** Index of the n-th "?" in `text`, counting from zero. */
function nthIndex(text, ch, n) {
  let at = -1;
  for (let i = 0; i <= n; i++) at = text.indexOf(ch, at + 1);
  return at;
}

const MASTER = "tbl_technicianspecilities";
const ASSIGN = "tbl_technicianspecilityassignment";
const ITEM = "tbl_itemmaster";

class FakeDb {
  constructor({ itemColumn = "SpecAreaID", infoColumns = null, tables = null } = {}) {
    this.specialities = []; // { SpecAreaID, Specilities }  — padded, as stored
    this.assignments = []; // { UserID, SpecAreaID }        — padded, as stored
    this.items = new Map(); // itemCode -> { SpecAreaID }
    this.itemRows = []; // tbl_itemmaster rows, as stored
    this.itemColumn = itemColumn; // null simulates "ALTER TABLE not run yet"
    this.infoColumns = infoColumns; // null → a normal tbl_itemmaster
    /* Which tables exist, spelled exactly as the database spells them —
       case included, because that is the whole point on a Linux server. */
    this.tables = new Set(tables ?? [MASTER, ASSIGN, ITEM]);
    this.created = []; // tables the app had to create for itself
    this.log = [];
  }

  /** MySQL's words for a table it cannot find. */
  _noTable(name) {
    const e = new Error(`Table 'db.${name}' doesn't exist`);
    e.code = "P2021";
    throw e;
  }

  /** Reads the name between the backticks in `FROM \`x\`` and checks it. */
  _tableIn(sql) {
    const name = sql.match(/FROM `(\w+)`/)?.[1] ?? sql.match(/INTO `(\w+)`/)?.[1];
    if (!name) throw new Error(`fake db: no table in → ${sql}`);
    if (!this.tables.has(name)) this._noTable(name);
    return name;
  }

  /** The whole statement comes in as one tagged template; put it back
   *  together. A Prisma.join fragment is spliced into the SQL as one "?" per
   *  value, at the placeholder that belongs to it — position matters, because
   *  an earlier "?" in the same statement belongs to a different value. */
  _sql(strings, values) {
    let text = strings.join("?").replace(/\s+/g, " ").trim();
    const flat = [];
    let n = 0;
    for (const v of values) {
      if (v && typeof v === "object" && Array.isArray(v.__join)) {
        const at = nthIndex(text, "?", n);
        const frag = v.__join.map(() => "?").join(v.sep);
        text = text.slice(0, at) + frag + text.slice(at + 1);
        flat.push(...v.__join);
      } else {
        flat.push(v);
      }
      n++;
    }
    this.log.push(text);
    return { text, values: flat };
  }

  async $queryRaw(strings, ...values) {
    const { text, values: v } = this._sql(strings, values);

    if (/information_schema\.TABLES/i.test(text)) {
      const m = text.match(/LOWER\(TABLE_NAME\) IN \(([^)]*)\)/i);
      const want = m ? (m[1].match(/\?/g) ?? []).length : 0;
      const asked = want ? v.slice(-want).map((s) => String(s).toLowerCase()) : [];
      return [...this.tables]
        .filter((t) => asked.includes(t.toLowerCase()))
        .map((t) => ({ TABLE_NAME: t }));
    }

    if (/information_schema\.COLUMNS/i.test(text)) {
      /* The IN list arrives as one placeholder per name (Prisma.join). The
         broken version sent the whole comma list as ONE value, which matches
         nothing — so this branch is what catches that coming back. */
      const m = text.match(/LOWER\(COLUMN_NAME\) IN \(([^)]*)\)/i);
      const wanted = m ? (m[1].match(/\?/g) ?? []).length : 0;
      const asked = wanted ? v.slice(-wanted).map((s) => String(s).toLowerCase()) : [];
      const have = this.infoColumns ?? [
        "loccode",
        "itemcode",
        "mof",
        ...(this.itemColumn ? [this.itemColumn.toLowerCase()] : []),
      ];
      return have.filter((c) => asked.includes(c)).map((c) => ({ COLUMN_NAME: c }));
    }

    throw new Error(`fake db: unhandled query → ${text}`);
  }

  /** Every statement the app sends with $executeRawUnsafe. */
  async $queryRawUnsafe(text) {
    this.log.push(text.replace(/\s+/g, " ").trim());
    const clean = text.replace(/\s+/g, " ").trim();

    if (new RegExp(`FROM \`${MASTER}\``, "i").test(clean) || clean.includes("`"+MASTER+"`")) {
      const name = this._tableIn(clean);
      if (name.toLowerCase() !== MASTER) return []; // a different table entirely
      return this.specialities
        .map((r) => ({ SpecAreaID: rtrim(r.SpecAreaID), Specilities: rtrim(r.Specilities) }))
        .sort(
          (a, b) =>
            a.Specilities.localeCompare(b.Specilities) || a.SpecAreaID.localeCompare(b.SpecAreaID),
        );
    }

    if (clean.includes("`" + ASSIGN + "`") || new RegExp("`" + ASSIGN + "`", "i").test(clean)) {
      const name = this._tableIn(clean);
      if (name.toLowerCase() !== ASSIGN) return [];
      return this.assignments
        .map((r) => ({ UserID: rtrim(r.UserID), SpecAreaID: rtrim(r.SpecAreaID) }))
        .sort((a, b) => a.SpecAreaID.localeCompare(b.SpecAreaID));
    }

    const col = clean.match(/RTRIM\(`(\w+)`\) AS SpecAreaID/)?.[1];
    if (col) {
      return this.itemRows
        .filter((r) => r[col] != null && rtrim(r[col]) !== "")
        .map((r) => ({
          LocCode: rtrim(r.LocCode),
          ItemCode: rtrim(r.ItemCode),
          SpecAreaID: rtrim(r[col]),
        }));
    }

    throw new Error(`fake db: unhandled unsafe query → ${clean}`);
  }

  async $executeRaw(strings, ...values) {
    const { text, values: v } = this._sql(strings, values);

    // DELETE FROM tbl_technicianspecilityassignment WHERE RTRIM(UserID) = ?
    if (/DELETE FROM tbl_technicianspecilityassignment/i.test(text)) {
      const id = rtrim(v[0]);
      const keep = this.assignments.filter((r) => rtrim(r.UserID) !== id);
      const gone = this.assignments.length - keep.length;
      this.assignments = keep;
      return gone;
    }

    // INSERT IGNORE INTO tbl_technicianspecilityassignment (UserID, SpecAreaID) VALUES (?,?)
    if (/INSERT IGNORE INTO tbl_technicianspecilityassignment/i.test(text)) {
      const [userId, code] = v;
      const dup = this.assignments.some(
        (r) => rtrim(r.UserID) === rtrim(userId) && rtrim(r.SpecAreaID) === rtrim(code),
      );
      if (!dup) {
        this.assignments.push({ UserID: pad(rtrim(userId)), SpecAreaID: pad(rtrim(code)) });
      }
      return 1;
    }

    throw new Error(`fake db: unhandled statement → ${text}`);
  }

  /** What the admin screen's INSERT (route.ts:189) does — same statement. */
  adminCreate(code, name) {
    this.log.push("INSERT INTO tbl_technicianspecilities (SpecAreaID, Specilities) VALUES (?,?)");
    this.specialities.push({ SpecAreaID: pad(code), Specilities: pad(name) });
  }

  adminDelete(code) {
    this.specialities = this.specialities.filter((r) => rtrim(r.SpecAreaID) !== code);
  }

  /** The item screen's write, under the column name the app resolved. */
  itemSave(itemCode, specCode) {
    if (!this.itemColumn) throw new Error("Unknown column 'SpecAreaID'");
    this.items.set(itemCode, { [this.itemColumn]: specCode });
  }

  /** The item rows, with a speciality column when the database has one. */
  addItem(locCode, itemCode, spec = "") {
    this.itemRows.push({
      LocCode: pad(locCode),
      ItemCode: pad(itemCode),
      SpecAreaID: spec ? pad(spec) : null,
    });
  }

  /** What prisma.$executeRawUnsafe does for the two statements the app sends
   *  with it: adding the column, and setting an item's speciality. */
  async $executeRawUnsafe(text, ...values) {
    this.log.push(text.replace(/\s+/g, " ").trim());

    if (/ALTER TABLE/i.test(text)) {
      this.alters = (this.alters ?? 0) + 1;
      if (this.alterFails) throw new Error("ALTER command was denied on this database");
      if (this.itemColumn) {
        const err = new Error("Duplicate column name 'SpecAreaID'");
        err.code = "P2010";
        throw err; // 1060 — a parallel request got there first
      }
      this.itemColumn = "SpecAreaID";
      return 0;
    }

    if (/CREATE TABLE IF NOT EXISTS/i.test(text)) {
      const name = text.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/)?.[1];
      if (!name) throw new Error(`fake db: no table name in → ${text}`);
      /* IF NOT EXISTS really means it: an existing table is left alone and
         nothing is reported as created. */
      if (!this.tables.has(name)) {
        this.created.push(name);
        this.tables.add(name);
      }
      return 0;
    }

    // DELETE FROM `<assignment table>` WHERE RTRIM(UserID) = ?
    if (/^DELETE FROM/i.test(text)) {
      const table = text.match(/DELETE FROM `(\w+)`/)?.[1];
      if (!this.tables.has(table)) this._noTable(table);
      const id = rtrim(values[0]);
      const keep = this.assignments.filter((r) => rtrim(r.UserID) !== id);
      const gone = this.assignments.length - keep.length;
      this.assignments = keep;
      return gone;
    }

    // INSERT IGNORE INTO `<assignment table>` (UserID, SpecAreaID) VALUES (?, ?)
    if (/INSERT IGNORE INTO/i.test(text)) {
      const table = text.match(/INTO `(\w+)`/)?.[1];
      if (!this.tables.has(table)) this._noTable(table);
      const [userId, code] = values;
      const dup = this.assignments.some(
        (r) => rtrim(r.UserID) === rtrim(userId) && rtrim(r.SpecAreaID) === rtrim(code),
      );
      if (!dup) {
        this.assignments.push({ UserID: pad(rtrim(userId)), SpecAreaID: pad(rtrim(code)) });
      }
      return 1;
    }

    if (/UPDATE tbl_itemmaster/i.test(text)) {
      const col = text.match(/SET `(\w+)` = \?/)?.[1];
      const scoped = /RTRIM\(LocCode\) = \?/.test(text);
      const [value, itemCode, locCode] = values;
      let n = 0;
      for (const r of this.itemRows) {
        if (rtrim(r.ItemCode) !== rtrim(itemCode)) continue;
        if (scoped && rtrim(r.LocCode) !== rtrim(locCode)) continue;
        r[col] = value === null ? null : String(value);
        n++;
      }
      return n;
    }

    throw new Error(`fake db: unhandled unsafe statement → ${text}`);
  }
}

/* ── 3. boot the real helper against the fake ────────────────────────────── */

writeFileSync(
  join(OUT, "prisma.js"),
  "let db = null;\n" +
    "exports.setDb = (d) => { db = d; };\n" +
    'Object.defineProperty(exports, "prisma", { get: () => db });\n',
);

/* Prisma.join is the one piece of @prisma/client the helper files use. In the
   real client it splices one placeholder per value straight into the SQL; the
   stand-in returns a fragment and the fake database below expands it, so the
   two behave the same way. */
writeFileSync(
  join(OUT, "prismaClient.js"),
  "exports.Prisma = {\n" +
    "  join(values, sep = ',') { return { __join: values, sep }; },\n" +
    "};\n",
);

build("src/lib/legacyColumns.ts", {
  '"@/lib/prisma"': '"./prisma.js"',
  '"@prisma/client"': '"./prismaClient.js"',
});
const specFile = build("src/lib/technicianSpecialities.ts", {
  '"@/lib/prisma"': '"./prisma.js"',
  '"@/lib/legacyColumns"': '"./legacyColumns.js"',
});

const require = createRequire(join(OUT, "loader.cjs"));

/** Freshly required copy of the real module, bound to `db`.
 *  `fresh` drops the one-minute column cache so a second database really is
 *  asked again — that cache is the app working as intended, not a bug. */
function loadSpec(db, { fresh = false } = {}) {
  if (fresh) {
    delete require.cache[join(OUT, specFile)];
    delete require.cache[join(OUT, "legacyColumns.js")];
  }
  require(join(OUT, "prisma.js")).setDb(db);
  const m = require(join(OUT, specFile));
  /* Bound once, by the key the real module actually exports, so a long name
     cannot be mistyped again anywhere below. */
  return {
    mod: m,
    readByUser: m.specialtiesByUser,
    column: m.itemSpecColumn,
    ensure: m.ensureItemSpecColumn,
    map: () => m.itemSpecMap(db),
    write: (locCode, itemCode, code) => m.writeItemSpec(db, locCode, itemCode, code),
    key: m.itemSpecKey,
    safeCol: m.safeColumnName,
    set: m.setUserSpecialities,
    clear: m.clearUserSpecialities,
    list: m.listSpecialities,
    norm: m.normalizeSpecCodes,
    unknown: m.unknownSpecCodes,
    Err: m.UnknownSpecialityError,
  };
}

/** The real legacyColumns module, freshly loaded and pointed at `db`. */
function legacyColsOf(db) {
  require(join(OUT, "prisma.js")).setDb(db);
  delete require.cache[join(OUT, "legacyColumns.js")];
  const m = require(join(OUT, "legacyColumns.js"));
  return { resolve: m.resolveLegacyColumn, table: m.resolveLegacyTable };
}

/* ── 4. the walk-through ─────────────────────────────────────────────────── */

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`   \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`   \x1b[31m✗ ${label}\x1b[0m${detail ? `\n       ${detail}` : ""}`);
  }
};
const step = (n, text) => console.log(`\n\x1b[1m${n}. ${text}\x1b[0m`);

const db = new FakeDb();
const spec = loadSpec(db);

step(1, "Administration → create three specialities");
db.adminCreate("SPC0000001", "Air Conditioner");
db.adminCreate("SPC0000002", "Refrigerator");
db.adminCreate("SPC0000003", "Washing Machine");

const master = await spec.list(db);
check("all three readable from tbl_technicianspecilities", master.length === 3, `got ${master.length}`);
check(
  "names come back un-padded",
  master.map((s) => s.Specilities).join("|") === "Air Conditioner|Refrigerator|Washing Machine",
  JSON.stringify(master.map((s) => s.Specilities)),
);
check(
  "codes come back trimmed from CHAR(10)",
  master.every((s) => s.SpecAreaID === s.SpecAreaID.trim()),
);

step(2, "Users screen → give one person three specialities");
await spec.set(db, "U001", ["SPC0000001", "SPC0000002", "SPC0000003"]);
let mine = (await spec.readByUser()).get("U001") ?? [];
check("all three saved to tbl_technicianspecilityassignment", mine.length === 3, JSON.stringify(mine));

step(3, "Save again with only two — replace, never duplicate");
await spec.set(db, "U001", ["SPC0000002", "SPC0000003"]);
mine = (await spec.readByUser()).get("U001") ?? [];
check("the dropped one is gone", mine.length === 2, JSON.stringify(mine));
check("no duplicate rows", new Set(mine).size === mine.length, JSON.stringify(mine));
check("the kept two survived", mine.join(",") === "SPC0000002,SPC0000003", JSON.stringify(mine));

step(4, "Press Save again with the same two — idempotent");
await spec.set(db, "U001", ["SPC0000002", "SPC0000003"]);
mine = (await spec.readByUser()).get("U001") ?? [];
check("still exactly two rows", mine.length === 2, JSON.stringify(mine));

step(5, "Whatever the screen sends is cleaned before it is stored");
check(
  "duplicates and case collapse",
  spec.norm(["SPC0000001", "spc0000001", " SPC0000001 "]).join(",") === "SPC0000001",
  JSON.stringify(spec.norm(["SPC0000001", "spc0000001", " SPC0000001 "])),
);
check(
  'blank and "0" mean "not chosen"',
  spec.norm(["", "0", "  ", "SPC0000002"]).join(",") === "SPC0000002",
);
check(
  "a comma-joined string from an older client still parses",
  spec.norm("SPC0000001, SPC0000002").join(",") === "SPC0000001,SPC0000002",
);
let tooLong = "";
try {
  spec.norm(["ABCDEFGHIJK"]);
} catch (e) {
  tooLong = e.message;
}
check("an 11-character code is refused before it reaches the database", tooLong !== "", tooLong);

step(6, "A speciality deleted on Administration is caught everywhere");
db.adminDelete("SPC0000001");
check(
  "the list shrinks for every screen",
  (await spec.list(db)).length === 2,
  `got ${(await spec.list(db)).length}`,
);
check(
  "unknownSpecCodes names the missing one",
  (await spec.unknown(db, ["SPC0000002", "SPC0000001"])).join(",") === "SPC0000001",
);
let userErr = null;
try {
  await spec.set(db, "U002", ["SPC0000003", "SPC0000001"]);
} catch (e) {
  userErr = e;
}
check("saving a user with it throws", userErr instanceof spec.Err);
check(
  "the error carries the code, so the screen can drop that chip",
  (userErr?.unknown ?? []).join(",") === "SPC0000001",
  JSON.stringify(userErr?.unknown),
);
check("nothing was written for that user", !(await spec.readByUser()).has("U002"));

step(7, "That failure can never half-apply a save");
db.log.length = 0;
try {
  await spec.set(db, "U002", ["SPC0000001"]);
} catch {
  /* expected */
}
check(
  "the check runs before any DELETE",
  !db.log.some((s) => /^DELETE/i.test(s)),
  db.log.join("\n       "),
);

step(8, "Item Master → give an item one speciality");
const column = await spec.column();
check("the column was found on this database", column === "SpecAreaID", String(column));
const [wanted] = spec.norm("SPC0000002");
check("the chosen code is valid", (await spec.unknown(db, [wanted])).length === 0);
db.itemSave("AC-001", wanted);
check("saved to tbl_itemmaster.SpecAreaID", db.items.get("AC-001").SpecAreaID === "SPC0000002");

step(9, "A database where the ALTER TABLE has not been run yet");
const bare = new FakeDb({ itemColumn: null });
for (const s of db.specialities) bare.adminCreate(rtrim(s.SpecAreaID), rtrim(s.Specilities));
const bareSpec = loadSpec(bare, { fresh: true });
check("the column is reported missing instead of throwing", (await bareSpec.column()) === null);
check(
  "the picker is still full — the list never depended on the column",
  (await bareSpec.list(bare)).length === 2,
  `got ${(await bareSpec.list(bare)).length}`,
);

step(10, "Item Master sets its own storage up — no SQL to run by hand");
const fresh = new FakeDb({ itemColumn: null });
fresh.adminCreate("SPC0000002", "Refrigerator");
const autoSpec = loadSpec(fresh, { fresh: true });
check("before: the column really is missing", fresh.itemColumn === null, String(fresh.itemColumn));
const ensured = await autoSpec.ensure();
check("one call is enough", ensured === "SpecAreaID", String(ensured));
check("after: it exists", fresh.itemColumn === "SpecAreaID", String(fresh.itemColumn));
check(
  "exactly one ALTER was issued",
  fresh.alters === 1,
  `alters=${fresh.alters}`,
);
check("asking again does not repeat the ALTER", (await autoSpec.ensure()) === "SpecAreaID" && fresh.alters === 1);

step(11, "Several people opening Item Master at once still run one ALTER");
const burst = new FakeDb({ itemColumn: null });
burst.adminCreate("SPC0000002", "Refrigerator");
const burstSpec = loadSpec(burst, { fresh: true });
await Promise.all([burstSpec.ensure(), burstSpec.ensure(), burstSpec.ensure(), burstSpec.ensure()]);
check("one ALTER for four simultaneous callers", burst.alters === 1, `alters=${burst.alters}`);
check("and the column is there", burst.itemColumn === "SpecAreaID");

step(12, "If the database refuses the change, it still does not crash");
const locked = new FakeDb({ itemColumn: null });
locked.adminCreate("SPC0000002", "Refrigerator");
locked.alterFails = true;
const lockedSpec = loadSpec(locked, { fresh: true });
let threw = false;
let result;
try {
  result = await lockedSpec.ensure();
} catch {
  threw = true;
}
check("no exception escapes", !threw);
check("it reports the column as unavailable", result === null, String(result));
check(
  "and the speciality list still reads fine",
  (await lockedSpec.list(locked)).length === 1,
);

step(13, "Finding a column by name — the bug that hid a column that was there");
{
  /* Every candidate at once, bound as separate placeholders. The broken
     version sent "a,b,c" as ONE value, so `IN (?)` matched nothing and a
     column that was really there was reported missing. */
  const found = await legacyColsOf(db).resolve("tbl_itemmaster", [
    "SpecArea",
    "Specilities",
    "SpecAreaID",
  ]);
  check("a name that is third in the list is still found", found === "SpecAreaID", `got ${found}`);

  /* The exact shape the dashboard asks for, where the real spelling is the
     second candidate. */
  const odd = new FakeDb({ itemColumn: null, infoColumns: ["bookingtypeid"] });
  check(
    "the second spelling wins over the first",
    (await legacyColsOf(odd).resolve("tbl_bookingtypes", ["BooookingTypeID", "BookingTypeID"])) ===
      "BookingTypeID",
  );

  const absent = await legacyColsOf(db).resolve("tbl_itemmaster", ["NotAColumn1", "NotAColumn2"]);
  check("genuinely absent names report null, not a guess", absent === null, String(absent));

  const injected = await legacyColsOf(db).resolve("tbl_itemmaster", [
    "LocCode; DROP TABLE x",
    "LocCode",
  ]);
  check("a name with punctuation in it is refused", injected === "LocCode", String(injected));
}

step(14, "Item specialities without Prisma — no schema change, no regenerate");
{
  const shop = new FakeDb({ itemColumn: "SpecAreaID" });
  shop.adminCreate("SPC0000001", "Air Conditioner");
  shop.adminCreate("SPC0000002", "Refrigerator");
  shop.addItem("LOC0000001", "AC-001", "SPC0000001");
  shop.addItem("LOC0000002", "AC-001", "SPC0000001");
  shop.addItem("LOC0000001", "RF-002"); // never picked one
  const s = loadSpec(shop, { fresh: true });

  const before = await s.map();
  check(
    "a picked speciality is read back for every location",
    before.get(s.key("LOC0000001", "AC-001")) === "SPC0000001" &&
      before.get(s.key("LOC0000002", "AC-001")) === "SPC0000001",
    JSON.stringify([...before]),
  );
  check("an item with no pick is simply absent, not an error", !before.has(s.key("LOC0000001", "RF-002")));
  check("CHAR(10) padding does not leak into the value", ![...before.values()].some((v) => v !== v.trim()));

  await s.write("", "AC-001", "SPC0000002");
  const after = await s.map();
  check(
    "saving changes it in every location at once",
    after.get(s.key("LOC0000001", "AC-001")) === "SPC0000002" &&
      after.get(s.key("LOC0000002", "AC-001")) === "SPC0000002",
    JSON.stringify([...after]),
  );
  check("the other item was left alone", !after.has(s.key("LOC0000001", "RF-002")));
  check(
    "the stored value is blank-padded, the way CHAR(10) really stores it",
    shop.itemRows[0].SpecAreaID === "SPC0000002".padEnd(10, " "),
    JSON.stringify(shop.itemRows[0].SpecAreaID),
  );

  await s.write("", "AC-001", "");
  check("clearing it removes the row from the read", !(await s.map()).has(s.key("LOC0000001", "AC-001")));

  await s.write("LOC0000001", "AC-001", "SPC0000001");
  const scoped = await s.map();
  check(
    "narrowing to one location touches only that row",
    scoped.get(s.key("LOC0000001", "AC-001")) === "SPC0000001" &&
      !scoped.has(s.key("LOC0000002", "AC-001")),
    JSON.stringify([...scoped]),
  );

  check("a column name with punctuation is refused", s.safeCol("Spec; DROP TABLE x") === false);
  check("a real column name is accepted", s.safeCol("SpecAreaID") === true);
  check("a missing name is refused", s.safeCol(null) === false);
}

step(15, "A database where the column could not be created at all");
{
  const bare2 = new FakeDb({ itemColumn: null });
  bare2.adminCreate("SPC0000002", "Refrigerator");
  bare2.addItem("LOC0000001", "RF-002");
  const s2 = loadSpec(bare2, { fresh: true });
  check("reading the map is empty rather than an exception", (await s2.map()).size === 0);
  await s2.write("", "RF-002", "SPC0000002"); // must not throw
  check("writing is a no-op instead of an error", (await s2.map()).size === 0);
}

step(16, "A database that spells the tables with capital letters");
{
  /* This is the one that produced an empty chip list: the table exists, the
     screen asks for the all-lowercase name, and a Linux server says no. */
  const shop = new FakeDb({
    tables: ["Tbl_TechnicianSpecilities", "Tbl_TechnicianSpecilityAssignment", ITEM],
  });
  shop.adminCreate("SPC0000001", "Barbering");
  shop.adminCreate("SPC0000002", "Facials");
  const s = loadSpec(shop, { fresh: true });

  check("the master list is found under its real spelling", (await s.list(shop)).length === 2);
  await s.set(shop, "U003", ["SPC0000001", "SPC0000002"]);
  const read = (await s.readByUser()).get("U003") ?? [];
  check("and a person's picks come back", read.length === 2, JSON.stringify(read));
  check("nothing had to be created to make that work", shop.created.length === 0, JSON.stringify(shop.created));
}

step(17, "A database that has neither table at all");
{
  const empty = new FakeDb({ tables: [ITEM] });
  const s = loadSpec(empty, { fresh: true });
  check("the master list reads as empty rather than throwing", (await s.list(empty)).length === 0);
  check(
    "and both tables were created instead",
    empty.created.includes(MASTER) && empty.created.includes(ASSIGN),
    JSON.stringify(empty.created),
  );

  const s2 = loadSpec(empty, { fresh: true });
  empty.adminCreate("SPC0000001", "Barbering");
  await s2.set(empty, "U004", ["SPC0000001"]);
  check(
    "a save then works, and the pick reads back",
    ((await s2.readByUser()).get("U004") ?? []).join(",") === "SPC0000001",
    JSON.stringify([...(await s2.readByUser()).get("U004") ?? []]),
  );
  check("and it was not created a second time", empty.created.length === 2, JSON.stringify(empty.created));
}

step(18, "The booking page's tabs, services and staff all come from one list");
{
  const bcFile = build("src/lib/bookingCatalog.ts", {});
  const bc = require(join(OUT, bcFile));

  const catalog = bc.buildCatalogFromApi({
    success: true,
    empty: false,
    locations: [{ code: "LOC0000001", name: "Colombo Main" }],
    /* Entered on Administration in this order: Waxing, then Hair Cutting. */
    categories: ["SPC0000009", "SPC0000004"],
    categoryNames: { SPC0000009: "Waxing", SPC0000004: "Hair Cutting" },
    services: [
      { name: "Hair Color Dark Brown 60ml", category: "SPC0000004", itemCode: "ITM1", locCode: "LOC0000001", price: "LKR 1,756.8", duration: "45 min", durationMin: 45, gender: "other" },
      { name: "HAIR CUT - LADIES", category: "SPC0000004", itemCode: "ITM2", locCode: "LOC0000001", price: "LKR 2,500", duration: "45 min", durationMin: 45, gender: "other" },
      { name: "WAXING - ARMS", category: "SPC0000009", itemCode: "ITM3", locCode: "LOC0000001", price: "LKR 900", duration: "20 min", durationMin: 20, gender: "other" },
    ],
    providers: {
      "Colombo Main": [
        { name: "Amali", role: "Senior hair", avatar: "A", expertise: ["SPC0000004"], techID: "USR0000003" },
        { name: "Dilani", role: "Wax specialist", avatar: "D", expertise: ["SPC0000009", "SPC0000004"], techID: "USR0000005" },
      ],
    },
  });

  check("tabs keep the order the specialities were entered in", catalog.categories.join(",") === "SPC0000009,SPC0000004", catalog.categories.join(","));
  check("a tab reads as the shop's own name", bc.categoryLabel(catalog.categoryNames, "SPC0000004") === "Hair Cutting");
  check("an unknown code falls back to itself, never to a guess", bc.categoryLabel(catalog.categoryNames, "NOPE") === "NOPE");
  check("services are bucketed under their speciality", catalog.servicesByCategory.SPC0000004.length === 2);

  /* Picking a tab narrows the services, and the staff who can do them are the
     ones whose own list contains that speciality. */
  const tab = "SPC0000004";
  const services = catalog.services.filter((s) => s.category === tab);
  const provs = catalog.providersByLocation["Colombo Main"].filter((p) => p.expertise.includes(tab));
  check("choosing a tab shows only its services", services.length === 2, String(services.length));
  check("and only the staff who hold that speciality", provs.map((p) => p.name).join(",") === "Amali,Dilani", provs.map((p) => p.name).join(","));
  check("a different tab shows its own staff only",
    catalog.providersByLocation["Colombo Main"].filter((p) => p.expertise.includes("SPC0000009")).map((p) => p.name).join(",") === "Dilani");

  check("an empty catalog is reported as empty, not faked",
    bc.buildCatalogFromApi({ success: true, empty: true, locations: [], categories: [] }) === null);
  check("a payload with no services is not turned into one",
    bc.buildCatalogFromApi({ success: true, empty: false, locations: [{ code: "L", name: "L" }], categories: [], services: [], categoryNames: {} }) === null);
}

/* ── summary ─────────────────────────────────────────────────────────────── */
console.log(
  `\n\x1b[1m${fail === 0 ? "\x1b[32mall good" : "\x1b[31mproblem"}\x1b[0m — ${pass} passed, ${fail} failed\n`,
);
rmSync(OUT, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
