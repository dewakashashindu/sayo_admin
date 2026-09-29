// src/lib/accessProfiles.ts
// ─────────────────────────────────────────────────────────────────────────────
// ACCESS PROFILES — named profiles, assigned to people.
//
// WHERE THE DATA LIVES (the shop's rule: only these two tables, no new ones)
//
//   Tbl_UserAccess_StdProfile   UserID = APF0000001 …  → one PROFICE's rows
//                               the name sits in the added ApfDes column
//   Tbl_UserAuthorization       UserID = USR0000001 …  → one PERSON's rows
//
// Row layout (FuncID / Module say what a row means):
//
//   a screen      FuncID = cipher(screen code)   Module = parent screen
//                 ACCESS = cipher("10110…")      Auth = 1 when it may be seen
//   a branch      FuncID = LOC0000001            Module = 'LOC'
//   assignment    FuncID = APF0000001            Module = 'APF'   (user table only)
//   the name      FuncID = '*NAME'               Module = 'APFNAME'
//                 ACCESS = the name in PLAIN text (not ciphered — so a SQL
//                 script or phpMyAdmin can read it). Written for every profile
//                 as well as the ApfDes column: the column is what the shop
//                 asked for and what the app reads first, the row keeps the
//                 name readable when the column could not be added at all.
//
//   Access Profile Creation  writes the PROFILE's rows
//   Assign Profiles          writes the PERSON's rows: the union of every
//                            profile they hold, which the admin may then adjust
//                            ("customize") — the person's rows, not the
//                            profile's, are what the panel reads at runtime.
//
// No profile assigned ⇒ the person has no rows ⇒ nothing at all (strict).
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { ALL_ACCESS_NODES, isKnownAccessKey } from "@/lib/accessCatalog";
import { cipher, decipher } from "@/lib/accessCipher";
import { ensureAuthTables, hasProfileNameColumn } from "@/lib/authTables";

export interface AccessProfileRow {
  apfCode: string;
  apfDes: string;
  /** how many people hold it */
  users: number;
  /** how many (screen, action) pairs it grants */
  keys: number;
}

export interface KeyPair {
  screenCode: string;
  actionCode: string;
}

/** How a row's Module column tells the three kinds apart. */
const MOD_LOC = "LOC";
const MOD_ASSIGN = "APF";
const MOD_NAME = "APFNAME";
const NAME_FUNCID = "*NAME";
const T_PROFILE = "Tbl_UserAccess_StdProfile";
const T_USER = "Tbl_UserAuthorization";

const trim = (v: unknown) => String(v ?? "").trim();
const nodeByCode = new Map(ALL_ACCESS_NODES.map((n) => [n.code, n]));
const keyOf = (k: KeyPair) => `${k.screenCode}.${k.actionCode}`;

interface RawRow {
  FuncID: string;
  ACCESS: string;
  Module: string;
  ApfDes?: string | null;
  UserID?: string;
}

/** Screen rows are the ones with a Module that is a catalog node ('RT' included). */
const isScreenRow = (r: RawRow) =>
  r.Module !== MOD_LOC && r.Module !== MOD_ASSIGN && r.Module !== MOD_NAME;

const isLocRow = (r: RawRow) => r.Module === MOD_LOC;

/* ─────────────────────────── reading rows ─────────────────────────── */

async function readRows(table: string, ownerId: string): Promise<RawRow[]> {
  /* ONLY the profile table has the ApfDes column — the person's table does not */
  const nameCol = table === T_PROFILE && hasProfileNameColumn() ? "ApfDes" : "NULL AS ApfDes";
  return prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT FuncID, ACCESS, Module, ${nameCol} FROM ${table} WHERE RTRIM(UserID) = ?`,
    ownerId,
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

/** Turn the flat list the screens send into screenCode → allowed action codes. */
export function collapseKeys(keys: { screenCode?: unknown; actionCode?: unknown }[]): Map<string, Set<string>> {
  const granted = new Map<string, Set<string>>();
  for (const k of keys) {
    const screenCode = trim(k?.screenCode);
    const actionCode = trim(k?.actionCode);
    if (!screenCode || !actionCode) continue;
    if (!isKnownAccessKey(screenCode, actionCode)) {
      throw new Error(`Unknown permission ${screenCode}.${actionCode}.`);
    }
    if (!granted.has(screenCode)) granted.set(screenCode, new Set());
    granted.get(screenCode)!.add(actionCode);
  }
  return granted;
}

/** Ciphered rows → the flat key list the screens understand. */
export function decodeRows(rows: { FuncID: string; ACCESS: string }[]): KeyPair[] {
  const keys: KeyPair[] = [];
  for (const r of rows) {
    const code = decipher(trim(r.FuncID));
    const node = nodeByCode.get(code);
    if (!node) continue; // a row for a screen that left the catalog — ignore
    const mask = decipher(trim(r.ACCESS)); // "10110" in catalog action order
    node.actions.forEach((actionCode, i) => {
      if (mask[i] === "1") keys.push({ screenCode: code, actionCode });
    });
  }
  return keys;
}

/** The multi-row INSERT body a save uses: one row per screen of the catalog. */
function screenSnapshotRows(ownerId: string, granted: Map<string, Set<string>>, apfDes: string | null) {
  const rowSql: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const node of ALL_ACCESS_NODES) {
    const allowed = granted.get(node.code);
    const mask = node.actions.map((a) => (allowed?.has(a) ? "1" : "0")).join("");
    const auth = allowed?.has("ACCESS") ? 1 : 0;
    rowSql.push(apfDes === null ? "(?, ?, ?, ?, ?)" : "(?, ?, ?, ?, ?, ?)");
    vals.push(
      ownerId,
      cipher(node.code).slice(0, 200),
      auth,
      node.parent.slice(0, 50),
      cipher(mask).slice(0, 50),
    );
    if (apfDes !== null) vals.push(apfDes.slice(0, 100));
  }
  return { rowSql: rowSql.join(","), vals };
}

/** INSERT one row per branch: FuncID is the location code, Module says 'LOC'. */
function locationRowSql(ownerId: string, locations: string[], apfDes: string | null) {
  const rowSql = locations.map(() => (apfDes === null ? "(?, ?, 1, 'LOC', '')" : "(?, ?, 1, 'LOC', '', ?)"));
  const vals: (string | null)[] = [];
  for (const loc of locations) {
    vals.push(ownerId, loc);
    if (apfDes !== null) vals.push(apfDes.slice(0, 100));
  }
  return { rowSql: rowSql.join(","), vals };
}

/** The '*NAME' row: the profile name readable in plain SQL (Module = 'APFNAME'). */
function nameRow(apfCode: string, name: string) {
  return {
    sql: `INSERT INTO ${T_PROFILE} (UserID, FuncID, Auth, Module, ACCESS) VALUES (?, ?, 0, ?, ?)`,
    args: [apfCode, NAME_FUNCID, MOD_NAME, name.slice(0, 50)],
  };
}

function insertSql(table: string, apfDes: string | null) {
  return apfDes === null
    ? `INSERT INTO ${table} (UserID, FuncID, Auth, Module, ACCESS) VALUES `
    : `INSERT INTO ${table} (UserID, FuncID, Auth, Module, ACCESS, ApfDes) VALUES `;
}

/* ─────────────────────────── profile registry ─────────────────────────── */

function loadProfileMeta(): Promise<Map<string, string>> {
  return (async () => {
    const nameCol = hasProfileNameColumn() ? "ApfDes" : "NULL AS ApfDes";
    const rows = await prisma.$queryRawUnsafe<{ UserID: string; FuncID: string; ACCESS: string; Module: string; ApfDes: string | null }[]>(
      `SELECT RTRIM(UserID) AS UserID, FuncID, ACCESS, Module, ${nameCol} FROM ${T_PROFILE} WHERE UserID LIKE 'APF%'`,
    );
    const out = new Map<string, string>();
    for (const r of rows) {
      const code = trim(r.UserID);
      if (!code) continue;
      const fromColumn = trim(r.ApfDes);
      /* column if it exists, else the '*NAME' row */
      if (fromColumn) out.set(code, fromColumn);
      else if (r.Module === MOD_NAME) out.set(code, trim(r.ACCESS));
      else if (!out.has(code)) out.set(code, "");
    }
    return out;
  })();
}

/** Every profile, with how many people hold it and how much it grants. */
export async function listProfiles(): Promise<AccessProfileRow[]> {
  await ensureAuthTables();
  const nameCol = hasProfileNameColumn() ? "ApfDes" : "NULL AS ApfDes";
  const rows = await prisma.$queryRawUnsafe<{ UserID: string; FuncID: string; ACCESS: string; Module: string; ApfDes: string | null }[]>(
    `SELECT RTRIM(UserID) AS UserID, FuncID, ACCESS, Module, ${nameCol} FROM ${T_PROFILE} WHERE UserID LIKE 'APF%'`,
  );
  const holders = await prisma.$queryRawUnsafe<{ FuncID: string; n: number }[]>(
    `SELECT RTRIM(FuncID) AS FuncID, COUNT(DISTINCT RTRIM(UserID)) AS n FROM ${T_USER} WHERE Module = ? GROUP BY RTRIM(FuncID)`,
    MOD_ASSIGN,
  ).catch(() => [] as { FuncID: string; n: number }[]);
  const usersByProfile = new Map(holders.map((h) => [trim(h.FuncID), Number(h.n || 0)]));

  const grouped = new Map<string, RawRow[]>();
  const names = new Map<string, string>();
  for (const r of rows) {
    const code = trim(r.UserID);
    if (!code) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code)!.push({ FuncID: r.FuncID, ACCESS: r.ACCESS, Module: r.Module, ApfDes: r.ApfDes });
    const name = trim(r.ApfDes) || (r.Module === MOD_NAME ? trim(r.ACCESS) : "");
    if (name) names.set(code, name);
  }

  return [...grouped.entries()]
    .map(([apfCode, list]) => ({
      apfCode,
      apfDes: names.get(apfCode) ?? "",
      users: usersByProfile.get(apfCode) ?? 0,
      keys: decodeRows(list.filter(isScreenRow)).length,
    }))
    .sort((a, b) => a.apfCode.localeCompare(b.apfCode));
}

/**
 * Every profile's ticks in one pass — the Assign Profiles screen needs them to
 * rebuild a person's ticks when a profile chip is added or removed.
 */
export async function allProfileAccess(): Promise<Map<string, { keys: string[]; locations: string[] }>> {
  await ensureAuthTables();
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT RTRIM(UserID) AS UserID, FuncID, ACCESS, Module FROM ${T_PROFILE} WHERE UserID LIKE 'APF%'`,
  ).catch(() => [] as RawRow[]);
  const grouped = new Map<string, { keys: Set<string>; locations: Set<string> }>();
  for (const r of rows) {
    const code = trim(r.UserID);
    if (!code) continue;
    if (!grouped.has(code)) grouped.set(code, { keys: new Set(), locations: new Set() });
    const bucket = grouped.get(code)!;
    if (isScreenRow(r)) {
      for (const k of decodeRows([r])) bucket.keys.add(keyOf(k));
    } else if (isLocRow(r) && trim(r.FuncID)) {
      bucket.locations.add(trim(r.FuncID));
    }
  }
  const out = new Map<string, { keys: string[]; locations: string[] }>();
  for (const [code, v] of grouped) {
    out.set(code, { keys: [...v.keys].sort(), locations: [...v.locations].sort() });
  }
  return out;
}

/** The name of one profile ('' when it has none). */
export async function profileNameOf(apfCode: string): Promise<string> {
  const meta = await loadProfileMeta();
  return meta.get(trim(apfCode)) ?? "";
}

export async function profileExists(apfCode: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM ${T_PROFILE} WHERE RTRIM(UserID) = ?`,
    apfCode,
  ).catch(() => [] as { n: number }[]);
  return Number(rows[0]?.n || 0) > 0;
}

/** APF0000001, APF0000002 … — same numbering style as USR… / GRP… */
export async function nextProfileCode(): Promise<string> {
  const rows = await prisma.$queryRaw<{ m: string | null }[]>`
    SELECT MAX(CAST(REGEXP_REPLACE(RTRIM(UserID), '[^0-9]', '') AS UNSIGNED)) AS m
    FROM Tbl_UserAccess_StdProfile WHERE UserID LIKE 'APF%'
  `;
  const next = (Number(rows[0]?.m || 0) || 0) + 1;
  return `APF${String(next).padStart(7, "0")}`.slice(0, 10);
}

async function nameIsTaken(name: string, exceptCode = ""): Promise<boolean> {
  const meta = await loadProfileMeta();
  const wanted = name.toLowerCase();
  for (const [code, existing] of meta) {
    if (code === exceptCode) continue;
    if (existing.toLowerCase() === wanted) return true;
  }
  return false;
}

export async function createProfile(apfDes: string): Promise<AccessProfileRow> {
  const name = trim(apfDes).slice(0, 100);
  if (!name) throw new Error("Type the profile name first.");
  await ensureAuthTables();
  if (await nameIsTaken(name)) throw new Error(`A profile named '${name}' already exists.`);

  const apfCode = await nextProfileCode();
  /* an empty profile grants nothing — every screen row starts at 0, but the
     rows have to exist so the code and the name are visible in the table */
  const withColumn = hasProfileNameColumn();
  const snap = screenSnapshotRows(apfCode, new Map(), withColumn ? name : null);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(insertSql(T_PROFILE, withColumn ? name : null) + snap.rowSql, ...snap.vals);
      const nr = nameRow(apfCode, name);
      await tx.$executeRawUnsafe(nr.sql, ...nr.args);
    },
    { timeout: 30000, maxWait: 10000 },
  );
  return { apfCode, apfDes: name, users: 0, keys: 0 };
}

export async function renameProfile(apfCode: string, apfDes: string): Promise<void> {
  const name = trim(apfDes).slice(0, 100);
  if (!name) throw new Error("Type the profile name first.");
  await ensureAuthTables();
  if (await nameIsTaken(name, apfCode)) throw new Error(`A profile named '${name}' already exists.`);

  const withColumn = hasProfileNameColumn();
  const exists = await profileExists(apfCode);
  if (!exists) throw new Error(`Profile ${apfCode} was not found.`);

  const nr = nameRow(apfCode, name);
  await prisma.$transaction(
    async (tx) => {
      if (withColumn) {
        await tx.$executeRawUnsafe(
          `UPDATE ${T_PROFILE} SET ApfDes = ? WHERE RTRIM(UserID) = ?`,
          name,
          apfCode,
        );
      }
      await tx.$executeRawUnsafe(
        `DELETE FROM ${T_PROFILE} WHERE RTRIM(UserID) = ? AND Module = ?`,
        apfCode,
        MOD_NAME,
      );
      await tx.$executeRawUnsafe(nr.sql, ...nr.args);
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

/** How many people hold this profile (asked before a delete). */
export async function usersUsingProfile(apfCode: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(DISTINCT RTRIM(UserID)) AS n FROM ${T_USER} WHERE Module = ? AND RTRIM(FuncID) = ?`,
    MOD_ASSIGN,
    apfCode,
  ).catch(() => [] as { n: number }[]);
  return Number(rows[0]?.n || 0);
}

/** The people holding a profile — used to re-write their rows after a delete. */
async function profileHolders(apfCode: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ UserID: string }[]>(
    `SELECT DISTINCT RTRIM(UserID) AS UserID FROM ${T_USER} WHERE Module = ? AND RTRIM(FuncID) = ?`,
    MOD_ASSIGN,
    apfCode,
  ).catch(() => [] as { UserID: string }[]);
  return rows.map((r) => trim(r.UserID)).filter(Boolean);
}

/** Remove the profile, its rows, and the rights it gave to whoever held it. */
export async function deleteProfile(apfCode: string): Promise<void> {
  await ensureAuthTables();
  const holders = await profileHolders(apfCode);

  await prisma.$transaction(
    async (tx) => {
      const n = await tx.$executeRawUnsafe(`DELETE FROM ${T_PROFILE} WHERE RTRIM(UserID) = ?`, apfCode);
      await tx.$executeRawUnsafe(
        `DELETE FROM ${T_USER} WHERE Module = ? AND RTRIM(FuncID) = ?`,
        MOD_ASSIGN,
        apfCode,
      );
      if (Number(n) === 0) throw new Error(`Profile ${apfCode} was not found.`);
    },
    { timeout: 30000, maxWait: 10000 },
  );

  /* whoever was holding it keeps their other profiles — re-write their rows */
  for (const userId of holders) {
    const rest = await profileCodesOfUser(userId);
    await saveUserAssignments(userId, rest);
  }
}

/* ─────────────────────── one profile's contents ─────────────────────── */

export async function loadProfile(apfCode: string): Promise<{ keys: KeyPair[]; locations: string[] }> {
  await ensureAuthTables();
  const rows = await readRows(T_PROFILE, apfCode);
  return {
    keys: decodeRows(rows.filter(isScreenRow)),
    locations: rows.filter(isLocRow).map((r) => trim(r.FuncID)).filter(Boolean).sort(),
  };
}

/**
 * Write the whole profile in one go (a full snapshot, exactly like before).
 * Returns how many (screen, action) pairs were granted.
 */
export async function saveProfile(
  apfCode: string,
  granted: Map<string, Set<string>>,
  locations: string[],
): Promise<number> {
  await ensureAuthTables();
  const meta = await loadProfileMeta();
  if (!meta.has(apfCode)) throw new Error(`Profile ${apfCode} was not found.`);
  const name = meta.get(apfCode) ?? "";
  const withColumn = hasProfileNameColumn();
  const locs = [...new Set(locations.map((l) => trim(l).slice(0, 10)).filter(Boolean))];

  const snap = screenSnapshotRows(apfCode, granted, withColumn ? name : null);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM ${T_PROFILE} WHERE RTRIM(UserID) = ?`, apfCode);
      await tx.$executeRawUnsafe(insertSql(T_PROFILE, withColumn ? name : null) + snap.rowSql, ...snap.vals);
      if (locs.length) {
        const l = locationRowSql(apfCode, locs, withColumn ? name : null);
        await tx.$executeRawUnsafe(insertSql(T_PROFILE, withColumn ? name : null) + l.rowSql, ...l.vals);
      }
      const nr = nameRow(apfCode, name);
      await tx.$executeRawUnsafe(nr.sql, ...nr.args);
    },
    { timeout: 30000, maxWait: 10000 },
  );
  return [...granted.values()].reduce((n, s) => n + s.size, 0);
}

/* ───────────────────────── who holds what ───────────────────────── */

/** userId → the profile codes assigned to them (only people who have some). */
export async function assignmentsByUser(): Promise<Map<string, string[]>> {
  await ensureAuthTables();
  const rows = await prisma.$queryRawUnsafe<{ UserID: string; FuncID: string }[]>(
    `SELECT RTRIM(UserID) AS UserID, RTRIM(FuncID) AS FuncID FROM ${T_USER} WHERE Module = ? ORDER BY RTRIM(FuncID)`,
    MOD_ASSIGN,
  ).catch(() => [] as { UserID: string; FuncID: string }[]);
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const userId = trim(r.UserID);
    const apfCode = trim(r.FuncID);
    if (!userId || !apfCode) continue;
    if (!out.has(userId)) out.set(userId, []);
    out.get(userId)!.push(apfCode);
  }
  return out;
}

export async function profileCodesOfUser(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ FuncID: string }[]>(
    `SELECT RTRIM(FuncID) AS FuncID FROM ${T_USER} WHERE RTRIM(UserID) = ? AND Module = ? ORDER BY RTRIM(FuncID)`,
    userId,
    MOD_ASSIGN,
  ).catch(() => [] as { FuncID: string }[]);
  return rows.map((r) => trim(r.FuncID)).filter(Boolean);
}

/** The union of what a set of profiles grants: keys and branches. */
async function unionOfProfiles(
  apfCodes: string[],
): Promise<{ granted: Map<string, Set<string>>; keys: Set<string>; locations: string[] }> {
  const granted = new Map<string, Set<string>>();
  const keys = new Set<string>();
  const locations = new Set<string>();
  if (apfCodes.length === 0) return { granted, keys, locations: [] };
  const ph = apfCodes.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT RTRIM(UserID) AS UserID, FuncID, ACCESS, Module FROM ${T_PROFILE} WHERE RTRIM(UserID) IN (${ph})`,
    ...apfCodes,
  );
  const screenRows: RawRow[] = [];
  for (const r of rows) {
    if (isScreenRow(r)) screenRows.push(r);
    else if (isLocRow(r)) {
      const code = trim(r.FuncID);
      if (code) locations.add(code);
    }
  }
  for (const r of screenRows) {
    const code = decipher(trim(r.FuncID));
    const node = nodeByCode.get(code);
    if (!node) continue;
    const mask = decipher(trim(r.ACCESS));
    node.actions.forEach((actionCode, i) => {
      if (mask[i] !== "1") return;
      keys.add(`${code}.${actionCode}`);
      if (!granted.has(code)) granted.set(code, new Set());
      granted.get(code)!.add(actionCode);
    });
  }
  return { granted, keys, locations: [...locations].sort() };
}

/** A person's stored rows → keys, branches and the profiles they hold. */
async function readUserAccess(userId: string): Promise<{
  profileCodes: string[];
  keys: Set<string>;
  locations: string[];
}> {
  const rows = await readRows(T_USER, userId);
  const keys = new Set<string>();
  const locations: string[] = [];
  const profileCodes: string[] = [];
  for (const r of rows) {
    if (isScreenRow(r)) {
      for (const k of decodeRows([r])) keys.add(keyOf(k));
    } else if (isLocRow(r)) {
      const code = trim(r.FuncID);
      if (code) locations.push(code);
    } else if (r.Module === MOD_ASSIGN) {
      const code = trim(r.FuncID);
      if (code) profileCodes.push(code);
    }
  }
  return { profileCodes, keys, locations: locations.sort() };
}

/** One query for every person's rows — the Assign Profiles screen uses this. */
export async function accessOverviewByUser(): Promise<
  Map<string, { profileCodes: string[]; keys: number; locations: string[]; customized: boolean }>
> {
  await ensureAuthTables();
  const rows = await prisma.$queryRawUnsafe<{ UserID: string; FuncID: string; ACCESS: string; Module: string }[]>(
    `SELECT RTRIM(UserID) AS UserID, FuncID, ACCESS, Module FROM ${T_USER}`,
  ).catch(() => []);
  const grouped = new Map<string, RawRow[]>();
  for (const r of rows) {
    const userId = trim(r.UserID);
    if (!userId) continue;
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId)!.push({ FuncID: r.FuncID, ACCESS: r.ACCESS, Module: r.Module, ApfDes: null });
  }
  const unionCache = new Map<string, { keys: Set<string>; locations: string[] }>();
  const out = new Map<string, { profileCodes: string[]; keys: number; locations: string[]; customized: boolean }>();

  for (const [userId, list] of grouped) {
    const profileCodes: string[] = [];
    const keys = new Set<string>();
    const locations: string[] = [];
    for (const r of list) {
      if (isScreenRow(r)) for (const k of decodeRows([r])) keys.add(keyOf(k));
      else if (isLocRow(r) && trim(r.FuncID)) locations.push(trim(r.FuncID));
      else if (r.Module === MOD_ASSIGN && trim(r.FuncID)) profileCodes.push(trim(r.FuncID));
    }
    profileCodes.sort();
    const unionKey = profileCodes.join("|");
    let union = unionCache.get(unionKey);
    if (!union) {
      union = await unionOfProfiles(profileCodes);
      unionCache.set(unionKey, union);
    }
    const sameLocations =
      union.locations.length === locations.length && union.locations.every((l, i) => l === [...locations].sort()[i]);
    const customized = keys.size !== union.keys.size || [...keys].some((k) => !union.keys.has(k)) || !sameLocations;
    out.set(userId, { profileCodes, keys: keys.size, locations: locations.sort(), customized });
  }
  return out;
}

/**
 * Replace a person's rows.
 *   apfCodes  — the profiles they hold (validated)
 *   custom    — the ticks the admin just set for THIS person. When omitted the
 *               union of the profiles is written; when given, the person's own
 *               (customized) ticks are written instead.
 */
export async function saveUserAssignments(
  userId: string,
  apfCodes: string[],
  custom?: { keys?: KeyPair[]; locations?: string[] },
): Promise<{ profiles: number; keys: number; locations: number; customized: boolean }> {
  await ensureAuthTables();
  const wanted = [...new Set(apfCodes.map((c) => trim(c).slice(0, 10)).filter(Boolean))];

  if (wanted.length > 0) {
    const meta = await loadProfileMeta();
    const missing = wanted.filter((c) => !meta.has(c));
    if (missing.length) throw new Error(`Profile ${missing.join(", ")} was not found.`);
  }

  const union = await unionOfProfiles(wanted);
  const granted = custom?.keys ? collapseKeys(custom.keys) : null;
  const keys = granted
    ? new Set([...granted.entries()].flatMap(([screen, actions]) => [...actions].map((a) => `${screen}.${a}`)))
    : union.keys;
  const locations = custom?.locations
    ? [...new Set(custom.locations.map((l) => trim(l).slice(0, 10)).filter(Boolean))].sort()
    : union.locations;

  const customized =
    keys.size !== union.keys.size ||
    [...keys].some((k) => !union.keys.has(k)) ||
    locations.length !== union.locations.length ||
    locations.some((l, i) => l !== union.locations[i]);

  /* the rows are the person's own: write one per screen, one per branch, and
     one per profile they hold (Module = 'APF' — the chips on the screen) */
  const snap = screenSnapshotRows(userId, granted ?? union.granted, null);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM ${T_USER} WHERE RTRIM(UserID) = ?`, userId);
      await tx.$executeRawUnsafe(insertSql(T_USER, null) + snap.rowSql, ...snap.vals);
      if (locations.length) {
        const l = locationRowSql(userId, locations, null);
        await tx.$executeRawUnsafe(insertSql(T_USER, null) + l.rowSql, ...l.vals);
      }
      if (wanted.length) {
        await tx.$executeRawUnsafe(
          `INSERT INTO ${T_USER} (UserID, FuncID, Auth, Module, ACCESS) VALUES ${wanted
            .map(() => "(?, ?, 1, ?, '')")
            .join(",")}`,
          ...wanted.flatMap((code) => [userId, code, MOD_ASSIGN]),
        );
      }
    },
    { timeout: 60000, maxWait: 15000 },
  );

  return { profiles: wanted.length, keys: keys.size, locations: locations.length, customized };
}

/** Everything the person has is deleted (used when the user itself is deleted). */
export async function clearUserAssignments(userId: string): Promise<void> {
  await ensureAuthTables();
  await prisma.$executeRawUnsafe(`DELETE FROM ${T_USER} WHERE RTRIM(UserID) = ?`, userId);
}

/* ─────────────────── what a person may actually do ─────────────────── */

/**
 * What this person may do — read from THEIR rows (Tbl_UserAuthorization).
 * No rows ⇒ empty (strict: the panel shows "no access profile assigned").
 */
export async function resolveUserAccess(
  userId: string,
): Promise<{ profileCodes: string[]; keys: Set<string>; locations: string[] }> {
  const empty = { profileCodes: [] as string[], keys: new Set<string>(), locations: [] as string[] };
  if (!userId) return empty;
  await ensureAuthTables();
  /* no silent catch here on purpose: if the rows cannot be read, that is a real
     problem and the caller must see it (an empty bag would just look like
     "no access assigned") */
  const access = await readUserAccess(userId);
  return { profileCodes: access.profileCodes, keys: access.keys, locations: access.locations };
}
