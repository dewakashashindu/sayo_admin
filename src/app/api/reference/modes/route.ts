// src/app/api/reference/modes/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Inventory → Reference → Modes : the three little lookup tables behind the
// booking and billing screens.
//
//   GET    /api/reference/modes?type=bookingType|paymentMode|paymentGroup
//   POST   /api/reference/modes?type=…   body { code?, values:{…} }
//   PUT    /api/reference/modes?type=…&code=…   body { values:{…} }
//   DELETE /api/reference/modes?type=…&code=…[&force=1]
//
// Why this is written against information_schema instead of a Prisma model:
// the three tables are LEGACY (Tbl_BookingTypes / Tbl_PaymentModes /
// Tbl_PaymentGroup) and their names and column names are not consistent
// between databases — the live view even joins `m.PayGroupID` to
// `g.PaygroupID`. The resolver below finds the real table and the real column
// spellings once (cached), and every write only touches columns that exist, so
// a slightly different legacy copy still works instead of throwing 500s.
//
// The char(1) flag columns are the other legacy wrinkle: some rows use 'Y'/'N'
// and some use '1'/'0'. The ON/OFF pair is detected per column from the data
// that is already there and reused on write, so new rows stay in the same
// dialect as the old ones.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const trim = (v: unknown) => String(v ?? "").trim();

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/* ─────────────────────────── what each tab is ─────────────────────────── */

type Kind = "bookingType" | "paymentMode" | "paymentGroup";

interface ColumnSpec {
  /** column name as the shop's table spells it (matched case-insensitively) */
  col: string;
  label: string;
  /** char(1)/char(n) legacy flag → stored as the detected ON pair */
  flag?: boolean;
  /** tinyint/bit switch */
  bit?: boolean;
  max?: number;
  hint?: string;
}

interface GroupRef {
  col: string;
  table: string;
  idColumn: string;
  descColumn: string;
}

interface Spec {
  table: string;          // logical name — resolved case-insensitively
  label: string;
  pk: string;             // primary key column
  codePrefix: string;     // BT / PM / PG
  codeMax: number;
  desc: ColumnSpec;
  columns: ColumnSpec[];  // everything the screen may edit (desc excluded)
  group?: GroupRef;
  /** delete guard: these (table, column) pairs mean "still in use" */
  usedIn: { table: string; column: string; label: string }[];
}

const SPECS: Record<Kind, Spec> = {
  bookingType: {
    table: "tbl_bookingtypes",
    label: "Booking Type",
    pk: "BookingTypeID|BooikingTypeID",
    codePrefix: "BT",
    codeMax: 10,
    desc: { col: "BookingTypeDes", label: "Booking Type", max: 50 },
    columns: [{ col: "Enabel", label: "Enable", bit: true }],
    usedIn: [{ table: "tbl_bookingheder", column: "BookingTypeID", label: "bookings" }],
  },
  paymentMode: {
    table: "tbl_paymentmodes",
    label: "Payment Mode",
    pk: "PayCode",
    codePrefix: "PM",
    codeMax: 10,
    desc: { col: "PayDes", label: "Payment Mode", max: 50 },
    columns: [
      /* the four "what kind of money is this" flags the billing screen reads */
      { col: "ZeroVal", label: "Zero Value", flag: true, hint: "no money changes hands (e.g. a free service)" },
      { col: "Cash", label: "Cash", flag: true },
      { col: "CreditCard", label: "Credit Card", flag: true },
      { col: "CREDIT", label: "Credit (on account)", flag: true },
      { col: "AdvPay", label: "Advance Payment", flag: true },
      { col: "COMPLEMENTRY", label: "Complementary", flag: true, hint: "the shop gives it, nothing to collect" },
      { col: "Voucher", label: "Voucher", bit: true },
      /* how it lands in the sales figures */
      { col: "DoNotShowInSales", label: "Do Not Show In Sales", flag: true },
      { col: "ADDDIDUCTTOSALES", label: "Add / Deduct To Sales", flag: true, hint: "spelled exactly like this in the legacy table" },
      { col: "OneOff", label: "One Off", flag: true },
      { col: "Other", label: "Other", bit: true },
      /* what the cashier must type */
      { col: "RmksNeed", label: "Remarks Needed", flag: true },
      { col: "Enable", label: "Enable", bit: true },
    ],
    group: {
      col: "PayGroupID",
      table: "tbl_paymentgroup",
      idColumn: "PayGroupID",
      descColumn: "PayGroup",
    },
    usedIn: [], // filled in below from the bill details table when it exists
  },
  paymentGroup: {
    table: "tbl_paymentgroup",
    label: "Payment Group",
    pk: "PayGroupID",
    codePrefix: "PG",
    codeMax: 10,
    desc: { col: "PayGroup", label: "Payment Group", max: 50 },
    columns: [{ col: "Enable", label: "Enable", bit: true }],
    usedIn: [{ table: "tbl_paymentmodes", column: "PayGroupID", label: "payment modes" }],
  },
};

/* what uses a payment mode: the bill payment rows and the advance payment on a
   booking. Both are checked case-insensitively, and a table that is not in this
   database is simply skipped. */
SPECS.paymentMode.usedIn = [
  { table: "tbl_billpaytxn", column: "PayCode", label: "bills" },
  { table: "tbl_bookingheder", column: "AdvBookingPayMode", label: "bookings (advance payment)" },
];

function specOf(req: NextRequest): { kind: Kind; spec: Spec } | null {
  const type = trim(req.nextUrl.searchParams.get("type"));
  if (type === "bookingType" || type === "paymentMode" || type === "paymentGroup") {
    return { kind: type, spec: SPECS[type] };
  }
  return null;
}

/* ─────────────── table / column resolution (cached 60 s) ─────────────── */

interface TableMeta {
  /** the table name exactly as the database stores it */
  name: string;
  /** lower-case column name → { actual, type, maxLen, nullable, hasDefault } */
  columns: Map<string, ColMeta>;
}
interface ColMeta {
  actual: string;
  type: string;      // DATA_TYPE, lower case
  maxLen: number;    // from CHARACTER_MAXIMUM_LENGTH (0 when not a string)
  nullable: boolean;
  hasDefault: boolean;
  extra: string;
}

const metaCache = new Map<string, { at: number; meta: TableMeta | null }>();
const META_TTL = 60_000;
/* The route may only export HTTP verbs, so the caches live here and expire on
   their own; a table created in phpMyAdmin shows up within a minute (the
   screen's Retry button re-asks straight away after the TTL). */

async function tableMeta(logical: string): Promise<TableMeta | null> {
  const hit = metaCache.get(logical);
  if (hit && Date.now() - hit.at < META_TTL) return hit.meta;

  const rows = await prisma.$queryRaw<
    {
      TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string;
      CHAR_MAX: number | null; IS_NULLABLE: string; COLUMN_DEFAULT: string | null; EXTRA: string;
    }[]
  >`
    SELECT TABLE_NAME,
           COLUMN_NAME,
           LOWER(DATA_TYPE) AS DATA_TYPE,
           CHARACTER_MAXIMUM_LENGTH AS CHAR_MAX,
           IS_NULLABLE,
           COLUMN_DEFAULT,
           EXTRA
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = ${logical.toLowerCase()}
    ORDER BY ORDINAL_POSITION
  `.catch(() => []);

  let meta: TableMeta | null = null;
  if (rows.length) {
    const columns = new Map<string, ColMeta>();
    for (const r of rows) {
      columns.set(String(r.COLUMN_NAME).toLowerCase(), {
        actual: String(r.COLUMN_NAME),
        type: String(r.DATA_TYPE),
        maxLen: Number(r.CHAR_MAX ?? 0),
        nullable: String(r.IS_NULLABLE).toUpperCase() === "YES",
        hasDefault: r.COLUMN_DEFAULT !== null || String(r.EXTRA).includes("auto_increment"),
        extra: String(r.EXTRA ?? ""),
      });
    }
    meta = { name: String(rows[0].TABLE_NAME), columns };
  }
  metaCache.set(logical, { at: Date.now(), meta });
  return meta;
}

/** The real column for a logical one (null when the table does not have it).
 *  A logical name may list fallbacks with '|' — the same table is spelled a
 *  little differently from shop to shop (BookingTypeID / BooikingTypeID, the
 *  typo that lives in prisma/schema.prisma). The first spelling that the
 *  database actually has wins. */
function colOf(meta: TableMeta | null, logical: string): ColMeta | null {
  if (!meta) return null;
  for (const name of logical.split("|")) {
    const hit = meta.columns.get(name.trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** The name the screen should print for a logical column. */
function displayName(logical: string): string {
  return logical.split("|")[0].trim();
}

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "")}\``;
}

/* ─────────── flag dialect: does this column speak Y/N or 1/0? ─────────── */

const flagCache = new Map<string, { at: number; on: string; off: string }>();

async function flagPair(meta: TableMeta, column: string): Promise<{ on: string; off: string }> {
  const key = `${meta.name}.${column}`.toLowerCase();
  const hit = flagCache.get(key);
  if (hit && Date.now() - hit.at < META_TTL) return hit;

  const values = await prisma
    .$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT DISTINCT ${quoteIdent(column)} AS v FROM ${quoteIdent(meta.name)} LIMIT 50`,
    )
    .catch(() => [] as Record<string, unknown>[]);

  let pair = { on: "1", off: "0" };
  for (const row of values) {
    const v = trim(row.v).toUpperCase();
    if (v === "Y" || v === "T") {
      pair = { on: "Y", off: "N" };
      break;
    }
  }
  flagCache.set(key, { at: Date.now(), ...pair });
  return pair;
}

function isOn(value: unknown, pair: { on: string; off: string }): boolean {
  const v = trim(value).toUpperCase();
  if (!v) return false;
  if (v === "Y" || v === "T" || v === "1" || v === "TRUE") return true;
  if (v === "N" || v === "F" || v === "0" || v === "FALSE") return false;
  return v === pair.on.toUpperCase();
}

/* ───────────────────────── reading the rows ───────────────────────── */

interface Row {
  code: string;
  des: string;
  enable: boolean;
  values: Record<string, string | number | boolean | null>;
}

async function readRows(kind: Kind): Promise<{ rows: Row[]; meta: Record<string, unknown> }> {
  const spec = SPECS[kind];
  const meta = await tableMeta(spec.table);
  if (!meta) {
    throw new Error(
      `The table ${spec.table} does not exist in this database, so ${spec.label} records cannot be listed.`,
    );
  }
  const pk = colOf(meta, spec.pk);
  if (!pk) throw new Error(`${meta.name} has no ${displayName(spec.pk)} column.`);

  const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM ${quoteIdent(meta.name)} ORDER BY ${quoteIdent(pk.actual)}`,
  );

  const flagCols = spec.columns.filter((c) => c.flag && colOf(meta, c.col));
  const pairs = new Map<string, { on: string; off: string }>();
  for (const c of flagCols) {
    pairs.set(c.col.toLowerCase(), await flagPair(meta, colOf(meta, c.col)!.actual));
  }

  const rows: Row[] = raw.map((r) => {
    const values: Row['values'] = {};
    for (const c of spec.columns) {
      const col = colOf(meta, c.col);
      if (!col) continue;
      const v = r[col.actual];
      if (c.flag) {
        values[c.col] = isOn(v, pairs.get(c.col.toLowerCase())!);
      } else if (c.bit) {
        values[c.col] = Number(v ?? 0) === 1;
      } else {
        values[c.col] = v === null || v === undefined ? null : String(v);
      }
    }
    /* the group column lives outside spec.columns on purpose (it is a foreign
       key, not a flag) — it still has to travel with the row, or the dropdown
       would show "not grouped" for a mode that IS grouped and the next Save
       would quietly clear it. */
    if (spec.group) {
      const g = colOf(meta, spec.group.col);
      if (g) values[spec.group.col] = trim(r[g.actual]);
    }

    const descCol = colOf(meta, spec.desc.col);
    return {
      code: trim(r[pk.actual]),
      des: descCol ? trim(r[descCol.actual]) : "",
      enable: (() => {
        const en = colOf(meta, "Enable") ?? colOf(meta, "Enabel");
        if (!en) return true;
        const v = r[en.actual];
        return typeof v === "boolean" ? v : Number(v ?? 1) === 1;
      })(),
      values,
    };
  });

  /* what the screen should tell the user about columns this DB lacks */
  const missing = [spec.desc.col, ...spec.columns.map((c) => c.col)].filter(
    (c) => !colOf(meta, c),
  );

  return {
    rows,
    meta: {
      table: meta.name,
      primaryKey: pk.actual,
      missingColumns: missing,
      flagDialect: Object.fromEntries(
        [...pairs.entries()].map(([k, v]) => [k, { on: v.on, off: v.off }]),
      ),
    },
  };
}

/** The list of payment groups for the dropdown on the Payment Modes tab. */
async function groupOptions(): Promise<{ code: string; des: string; enable: boolean }[]> {
  const ref = SPECS.paymentMode.group!;
  const meta = await tableMeta(ref.table);
  if (!meta) return [];
  const id = colOf(meta, ref.idColumn);
  const des = colOf(meta, ref.descColumn);
  if (!id) return [];
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM ${quoteIdent(meta.name)} ORDER BY ${quoteIdent(id.actual)}`,
  );
  return rows.map((r) => ({
    code: trim(r[id.actual]),
    des: des ? trim(r[des.actual]) : "",
    enable: (() => {
      const en = colOf(meta, "Enable");
      return en ? Number(r[en.actual] ?? 1) === 1 : true;
    })(),
  }));
}

/* ───────────────────────── writing the rows ───────────────────────── */

/** Coerce whatever the screen sent into the column's own type. */
function coerce(
  value: unknown,
  col: ColumnMetaInfo,
): string | number | null {
  if (col.flag) {
    return value === true || value === "true" || value === 1 || value === "1"
      ? col.pair.on
      : col.pair.off;
  }
  if (col.bit) return value === true || value === "true" || value === 1 || value === "1" ? 1 : 0;
  if (col.numeric) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  const s = String(value ?? "");
  return col.maxLen > 0 ? s.slice(0, col.maxLen) : s;
}
interface ColumnMetaInfo {
  actual: string;
  flag: boolean;
  bit: boolean;
  numeric: boolean;
  maxLen: number;
  pair: { on: string; off: string };
}

async function buildColumnInfo(
  meta: TableMeta,
  spec: Spec,
): Promise<{ info: Map<string, ColumnMetaInfo>; descInfo: ColumnMetaInfo }> {
  const pairs = new Map<string, { on: string; off: string }>();
  for (const c of spec.columns) {
    const col = colOf(meta, c.col);
    if (c.flag && col) pairs.set(c.col.toLowerCase(), await flagPair(meta, col.actual));
  }
  const make = (logical: string, flag: boolean, bit: boolean): ColumnMetaInfo | null => {
    const col = colOf(meta, logical);
    if (!col) return null;
    return {
      actual: col.actual,
      flag,
      bit,
      numeric: ["tinyint", "smallint", "int", "bigint", "decimal", "double", "float"].includes(col.type),
      maxLen: col.maxLen,
      pair: pairs.get(logical.toLowerCase()) ?? { on: "1", off: "0" },
    };
  };
  const info = new Map<string, ColumnMetaInfo>();
  for (const c of spec.columns) {
    const built = make(c.col, !!c.flag, !!c.bit);
    if (built) info.set(c.col.toLowerCase(), built);
  }
  const desc = make(spec.desc.col, false, false);
  if (!desc) throw new Error(`${meta.name} has no ${spec.desc.col} column.`);
  return { info, descInfo: desc };
}

async function codeTaken(meta: TableMeta, spec: Spec, code: string): Promise<boolean> {
  const pk = colOf(meta, spec.pk)!;
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT 1 AS n FROM ${quoteIdent(meta.name)}
      WHERE UPPER(RTRIM(${quoteIdent(pk.actual)})) = UPPER(?) LIMIT 1`,
    code,
  );
  return rows.length > 0;
}

function friendlyDbError(e: unknown, table: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const noDefault = msg.match(/Field '([^']+)' doesn't have a default value/i);
  if (noDefault) {
    return `${table}.${noDefault[1]} is a required column this screen does not fill in. Fill it in the database once (any value) and press Save again.`;
  }
  const cannotBeNull = msg.match(/Column '([^']+)' cannot be null/i);
  if (cannotBeNull) return `${table}.${cannotBeNull[1]} cannot be empty.`;
  const dup = msg.match(/Duplicate entry '([^']+)'/i);
  if (dup) return `The code "${dup[1]}" is already used.`;
  return msg;
}

/* ─────────────────────────── GET ─────────────────────────── */

export async function GET(req: NextRequest) {
  const asked = specOf(req);
  if (!asked) return err('Query param "type" must be bookingType, paymentMode or paymentGroup');
  const guard = await requireAdminAccess(req, { screen: "MODES", action: "ACCESS" });
  if (!guard.ok) return guard.response;

  try {
    const { rows, meta } = await readRows(asked.kind);
    const groups = asked.kind === "paymentMode" ? await groupOptions() : [];
    return NextResponse.json({
      success: true,
      data: rows,
      /* No suggested code: the shop names its own codes, so the form opens
         blank. The field is kept in the payload so the UI does not change. */
      meta: { ...meta, suggestedCode: "", groups },
    });
  } catch (e) {
    console.error(`GET /api/reference/modes?type=${asked.kind}`, e);
    return err(e instanceof Error ? e.message : "Failed to read the records", 500);
  }
}

/* ─────────────────────────── POST (create) ─────────────────────────── */

export async function POST(req: NextRequest) {
  const asked = specOf(req);
  if (!asked) return err('Query param "type" must be bookingType, paymentMode or paymentGroup');
  const guard = await requireAdminAccess(req, { screen: "MODES", action: "SAVE" });
  if (!guard.ok) return guard.response;

  const { spec } = asked;
  try {
    const meta = await tableMeta(spec.table);
    if (!meta) return err(`The table ${spec.table} does not exist in this database.`, 404);
    const pk = colOf(meta, spec.pk);
    if (!pk) return err(`${meta.name} has no ${displayName(spec.pk)} column.`);

    const body = (await req.json().catch(() => ({}))) as { code?: unknown; values?: Record<string, unknown> };
    const values = body.values ?? {};
    const desc = trim(values[spec.desc.col] ?? values["des"]);
    if (!desc) return err(`${spec.desc.label} is required.`);
    if (spec.desc.max && desc.length > spec.desc.max) {
      return err(`${spec.desc.label} must be ${spec.desc.max} characters or less.`);
    }

    /* Typed in, not numbered for the shop — see the note in api/locations.
       A blank code is a mistake, not a request for the next free number. */
    const code = trim(body.code).toUpperCase();
    if (!code) return err(`${spec.label} code is required.`);
    if (code.length > spec.codeMax) {
      return err(`${spec.label} code must be ${spec.codeMax} characters or less — "${code}" is ${code.length}.`);
    }
    if (await codeTaken(meta, spec, code)) return err(`The code "${code}" is already used.`, 409);

    const { info, descInfo } = await buildColumnInfo(meta, spec);
    const cols = [pk.actual];
    const marks = ["?"];
    const args: (string | number | null)[] = [code];

    cols.push(descInfo.actual);
    marks.push("?");
    args.push(coerce(desc, descInfo));

    for (const [key, column] of info) {
      const specCol = spec.columns.find((c) => c.col.toLowerCase() === key)!;
      cols.push(column.actual);
      marks.push("?");
      args.push(coerce(values[specCol.col], column));
    }

    if (spec.group) {
      const gCol = colOf(meta, spec.group.col);
      if (gCol) {
        cols.push(gCol.actual);
        marks.push("?");
        args.push(trim(values[spec.group.col]) || "0");
      }
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO ${quoteIdent(meta.name)} (${cols.map(quoteIdent).join(", ")}) VALUES (${marks.join(", ")})`,
      ...args,
    );
    const { rows } = await readRows(asked.kind);
    return ok({ code, rows }, 201);
  } catch (e) {
    console.error("POST /api/reference/modes", e);
    return err(friendlyDbError(e, spec.table), 500);
  }
}

/* ─────────────────────────── PUT (update) ─────────────────────────── */

export async function PUT(req: NextRequest) {
  const asked = specOf(req);
  if (!asked) return err('Query param "type" must be bookingType, paymentMode or paymentGroup');
  const guard = await requireAdminAccess(req, { screen: "MODES", action: "SAVE" });
  if (!guard.ok) return guard.response;

  const { spec } = asked;
  try {
    const meta = await tableMeta(spec.table);
    if (!meta) return err(`The table ${spec.table} does not exist in this database.`, 404);
    const pk = colOf(meta, spec.pk);
    if (!pk) return err(`${meta.name} has no ${displayName(spec.pk)} column.`);

    const code = trim(req.nextUrl.searchParams.get("code"));
    if (!code) return err("Query param \"code\" is required.");

    const body = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const values = body.values ?? {};
    const desc = trim(values[spec.desc.col] ?? values["des"]);
    if (!desc) return err(`${spec.desc.label} is required.`);

    const { info, descInfo } = await buildColumnInfo(meta, spec);
    const sets: string[] = [`${quoteIdent(descInfo.actual)} = ?`];
    const args: (string | number | null)[] = [coerce(desc, descInfo)];
    for (const [key, column] of info) {
      const specCol = spec.columns.find((c) => c.col.toLowerCase() === key)!;
      sets.push(`${quoteIdent(column.actual)} = ?`);
      args.push(coerce(values[specCol.col], column));
    }
    if (spec.group) {
      const gCol = colOf(meta, spec.group.col);
      if (gCol) {
        sets.push(`${quoteIdent(gCol.actual)} = ?`);
        args.push(trim(values[spec.group.col]) || "0");
      }
    }
    args.push(code);

    const changed = await prisma.$executeRawUnsafe(
      `UPDATE ${quoteIdent(meta.name)} SET ${sets.join(", ")}
        WHERE UPPER(RTRIM(${quoteIdent(pk.actual)})) = UPPER(?)`,
      ...args,
    );
    if (Number(changed) === 0) return err(`${spec.label} "${code}" was not found.`, 404);

    const { rows } = await readRows(asked.kind);
    return ok({ code, rows });
  } catch (e) {
    console.error("PUT /api/reference/modes", e);
    return err(friendlyDbError(e, spec.table), 500);
  }
}

/* ─────────────────────────── DELETE ─────────────────────────── */

async function usageOf(kind: Kind, code: string): Promise<string[]> {
  const spec = SPECS[kind];
  const found: string[] = [];
  for (const ref of spec.usedIn) {
    const meta = await tableMeta(ref.table);
    if (!meta) continue;
    const col = colOf(meta, ref.column);
    if (!col) continue;
    const rows = await prisma
      .$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT COUNT(*) AS n FROM ${quoteIdent(meta.name)}
          WHERE UPPER(RTRIM(${quoteIdent(col.actual)})) = UPPER(?) LIMIT 1`,
        code,
      )
      .catch(() => [] as Record<string, unknown>[]);
    if (Number(rows[0]?.n ?? 0) > 0) found.push(ref.label);
  }
  return found;
}

export async function DELETE(req: NextRequest) {
  const asked = specOf(req);
  if (!asked) return err('Query param "type" must be bookingType, paymentMode or paymentGroup');
  const guard = await requireAdminAccess(req, { screen: "MODES", action: "DELETE" });
  if (!guard.ok) return guard.response;

  const { kind, spec } = asked;
  try {
    const meta = await tableMeta(spec.table);
    if (!meta) return err(`The table ${spec.table} does not exist in this database.`, 404);
    const pk = colOf(meta, spec.pk);
    if (!pk) return err(`${meta.name} has no ${displayName(spec.pk)} column.`);

    const code = trim(req.nextUrl.searchParams.get("code"));
    if (!code) return err("Query param \"code\" is required.");
    const force = req.nextUrl.searchParams.get("force") === "1";

    const used = await usageOf(kind, code);
    if (used.length > 0 && !force) {
      return err(
        `${spec.label} "${code}" is used by ${used.join(", ")}. Deleting it would leave those records pointing at nothing. ` +
          "Send ?force=1 to delete it anyway.",
        409,
      );
    }

    const changed = await prisma.$executeRawUnsafe(
      `DELETE FROM ${quoteIdent(meta.name)} WHERE UPPER(RTRIM(${quoteIdent(pk.actual)})) = UPPER(?)`,
      code,
    );
    if (Number(changed) === 0) return err(`${spec.label} "${code}" was not found.`, 404);

    const { rows } = await readRows(kind);
    return ok({ code, rows });
  } catch (e) {
    console.error("DELETE /api/reference/modes", e);
    return err(friendlyDbError(e, spec.table), 500);
  }
}
