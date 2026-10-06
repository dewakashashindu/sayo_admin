// src/lib/technicianSpecialities.ts
// ─────────────────────────────────────────────────────────────────────────────
// The one place that knows about the technician speciality tables.
//
//   tbl_technicianspecilities          SpecAreaID char(10), Specilities varchar(100)
//   tbl_technicianspecilityassignment  UserID char(10), SpecAreaID char(10)
//   tbl_itemmaster.SpecAreaID          the speciality ONE service belongs to
//
// Both tables are char(10) columns, and MySQL blank-pads a char on the way in,
// so "SPA0000001" and "SPA0000001    " are the same code but compare unequal as
// strings. Every read and every write below goes through RTRIM so that never
// turns into two rows.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forgetLegacyColumn, resolveLegacyColumn, resolveTableName } from "@/lib/legacyColumns";

export type SpecDb = Prisma.TransactionClient | PrismaClient;

const trim = (v: unknown) => String(v ?? "").trim();

/** The column tbl_itemmaster carries the speciality in. Created by
 *  scripts/add-itemmaster-specaareaid.sql. */
export const ITEM_SPEC_COLUMN = "SpecAreaID";

/* These surface in the UI, so they are written the way a user reads them — no
   table names, no column names, no script names. The technical detail goes to
   the server log, where the person who deployed the app will find it. */
export const SPECIALITIES_TABLE_HINT =
  "Technician specialities could not be loaded. Please try again.";

export const ITEM_SPEC_COLUMN_HINT =
  "The speciality could not be saved. Please try again.";

/* ── which tables, spelled how ─────────────────────────────────────────────
   MySQL on a Linux server treats table names as case sensitive, so these two
   were written down one way and may well exist on the shop's database another
   way. Asking information_schema once and remembering the answer means the
   screens below work on either, instead of quietly coming back empty. */

const MASTER_TABLE_SPELLINGS = [
  "tbl_technicianspecilities",
  "Tbl_TechnicianSpecilities",
];
const ASSIGNMENT_TABLE_SPELLINGS = [
  "tbl_technicianspecilityassignment",
  "Tbl_TechnicianSpecilityAssignment",
];

/** The name the speciality master list is really stored under. */
export async function masterTable(): Promise<string> {
  return (await resolveTableName(MASTER_TABLE_SPELLINGS)) ?? MASTER_TABLE_SPELLINGS[0];
}

/** The name the per-person assignments are really stored under. */
export async function assignmentTable(): Promise<string> {
  return (await resolveTableName(ASSIGNMENT_TABLE_SPELLINGS)) ?? ASSIGNMENT_TABLE_SPELLINGS[0];
}

/* Shared, so a burst of parallel requests runs one set of DDL and not twenty. */
let tableRepair: Promise<void> | null = null;

/**
 * Create the two tables when this database has neither of them.
 *
 * Both statements are `IF NOT EXISTS`, so on a database that already has them
 * this does nothing at all — it is the answer to "the screen is empty", not a
 * replacement for a real database. The column names and types match the ones
 * the rest of this file reads and writes.
 */
export async function ensureSpecialityTables(): Promise<void> {
  if (tableRepair) return tableRepair;
  const run = (async () => {
    for (const create of [
      `CREATE TABLE IF NOT EXISTS \`${await masterTable()}\` (
         \`SpecAreaID\`  char(10)     NOT NULL DEFAULT '',
         \`Specilities\` varchar(100) NOT NULL DEFAULT '',
         PRIMARY KEY (\`SpecAreaID\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`${await assignmentTable()}\` (
         \`UserID\`     char(10) NOT NULL DEFAULT '',
         \`SpecAreaID\` char(10) NOT NULL DEFAULT '',
         PRIMARY KEY (\`UserID\`, \`SpecAreaID\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ]) {
      try {
        await prisma.$executeRawUnsafe(create);
      } catch (e) {
        console.error(
          "[Technician Specialities] could not create a missing table. " +
            "Run scripts/add-technician-specialities.sql as an administrator. " +
            "Original error:",
          e,
        );
        return;
      }
    }
    console.info(
      "[Technician Specialities] the speciality tables were created on this database.",
    );
  })();
  tableRepair = run.finally(() => {
    tableRepair = null;
  });
  return tableRepair;
}

export interface Speciality {
  SpecAreaID: string;
  Specilities: string;
}

/** What a speciality shows as: its name, or its code when the name is blank. */
export function specialityLabel(s: { SpecAreaID: string; Specilities: string }): string {
  return s.Specilities || s.SpecAreaID;
}

export function missingSpecialitiesTable(e: unknown): boolean {
  const msg = String((e as { message?: string } | undefined)?.message ?? e);
  return /tbl_technicianspecilities|doesn't exist|ER_NO_SUCH_TABLE|1146|P2021/i.test(msg);
}

/** What the server log says when a screen cannot save a speciality. */
export function logSpecialitiesSetupProblem(e: unknown, screen: string): void {
  console.error(
    `[${screen}] specialty tables are not set up on this database — ` +
      `run scripts/add-technician-specialities.sql. Original error:`,
    e,
  );
}

/** Same, for the one column Item Master needs. */
export function logItemSpecColumnProblem(screen: string): void {
  console.error(
    `[${screen}] tbl_itemmaster.SpecAreaID is missing on this database — ` +
      `run scripts/add-itemmaster-specaareaid.sql, then restart the app.`,
  );
}

/**
 * Every speciality, A→Z.
 *
 * The table name is worked out from the live database first, because asking
 * for the wrong spelling fails on a case-sensitive server. If the table really
 * is not there, it is created and the read is retried once — a screen that
 * says "none yet" when the table is missing under a different name is exactly
 * the bug this guards against.
 */
export async function listSpecialities(db: SpecDb = prisma): Promise<Speciality[]> {
  const table = await masterTable();
  const read = async () => {
    const rows = await db.$queryRawUnsafe<Speciality[]>(
      `SELECT RTRIM(SpecAreaID)  AS SpecAreaID,
              RTRIM(Specilities) AS Specilities
         FROM \`${table}\`
        ORDER BY RTRIM(Specilities) ASC, RTRIM(SpecAreaID) ASC`,
    );
    return rows.map((r) => ({ SpecAreaID: trim(r.SpecAreaID), Specilities: trim(r.Specilities) }));
  };

  try {
    return await read();
  } catch (e) {
    if (!missingSpecialitiesTable(e)) throw e;
    await ensureSpecialityTables();
    try {
      return await read();
    } catch (second) {
      if (!missingSpecialitiesTable(second)) throw second;
      logSpecialitiesSetupProblem(second, "listSpecialities");
      return [];
    }
  }
}

/**
 * The request body may carry one code or several, and callers are inconsistent
 * about the field name. Accept all of it and hand back a clean, unique,
 * correctly-padded list.
 */
export function normalizeSpecCodes(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map(trim)
    : String(value ?? "")
        .split(/[,;|]/)
        .map(trim);

  const out: string[] = [];
  for (const code of raw) {
    // "" and "0" both mean "not chosen" — "0" is what the other master columns
    // in this app store for an empty code.
    if (!code || code === "0") continue;
    if (code.length > 10) throw new Error(`Speciality code "${code}" is longer than 10 characters.`);
    const padded = code.toUpperCase();
    if (!out.includes(padded)) out.push(padded);
  }
  return out;
}

/** Which of these codes are not in the speciality list — [] means all are fine. */
export async function unknownSpecCodes(db: SpecDb, codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];
  const known = new Set((await listSpecialities(db)).map((s) => s.SpecAreaID.toUpperCase()));
  return codes.filter((c) => !known.has(c.toUpperCase()));
}

/* ── who does what ───────────────────────────────────────────────────────── */

export async function specialtiesByUser(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const table = await assignmentTable();

  const read = async () => {
    const rows = await prisma.$queryRawUnsafe<{ UserID: string; SpecAreaID: string }[]>(
      `SELECT RTRIM(UserID) AS UserID, RTRIM(SpecAreaID) AS SpecAreaID
         FROM \`${table}\`
        ORDER BY RTRIM(SpecAreaID)`,
    );
    for (const r of rows) {
      const userId = trim(r.UserID);
      const code = trim(r.SpecAreaID);
      if (!userId || !code) continue;
      if (!out.has(userId)) out.set(userId, []);
      out.get(userId)!.push(code);
    }
  };

  try {
    await read();
  } catch (e) {
    if (!missingSpecialitiesTable(e)) throw e;
    /* Not a spelling problem after all — the table really is absent. Build it
       and read once more, so people who already saved a speciality see it. */
    await ensureSpecialityTables();
    out.clear();
    try {
      await read();
    } catch (second) {
      if (!missingSpecialitiesTable(second)) throw second;
      logSpecialitiesSetupProblem(second, "specialtiesByUser");
    }
  }
  return out;
}

/**
 * A speciality code that is not in the master list. Carries the codes so the
 * route can answer 409 with them and the screen can drop them from the form —
 * a plain Error would become a 500 and leave the user stuck re-picking.
 */
export class UnknownSpecialityError extends Error {
  readonly unknown: string[];
  constructor(unknown: string[]) {
    super(
      `${unknown.length === 1 ? "A speciality" : "Some specialities"} ` +
        `${unknown.map((c) => `"${c}"`).join(", ")} ` +
        `${unknown.length === 1 ? "is" : "are"} no longer in the list. ` +
        `Reload this page and pick again.`,
    );
    this.name = "UnknownSpecialityError";
    this.unknown = unknown;
  }
}

/**
 * Replace one person's specialities with exactly `codes`.
 *
 * Delete-then-insert inside the caller's transaction, so a user is never left
 * with half a set if the save fails half way. `db` is the shared client when
 * there is no surrounding transaction to join.
 */
export async function setUserSpecialities(
  db: SpecDb,
  userId: string,
  codes: string[],
): Promise<void> {
  const id = trim(userId).slice(0, 10);
  if (!id) return;

  const unknown = await unknownSpecCodes(db, codes);
  if (unknown.length > 0) throw new UnknownSpecialityError(unknown);

  await ensureSpecialityTables();
  const table = await assignmentTable();

  await db.$executeRawUnsafe(
    `DELETE FROM \`${table}\` WHERE RTRIM(UserID) = ?`,
    id,
  );

  for (const code of codes) {
    await db.$executeRawUnsafe(
      `INSERT IGNORE INTO \`${table}\` (UserID, SpecAreaID) VALUES (?, ?)`,
      id.padEnd(10, " "),
      code.padEnd(10, " "),
    );
  }
}

export async function clearUserSpecialities(db: SpecDb, userId: string): Promise<void> {
  const id = trim(userId).slice(0, 10);
  if (!id) return;
  await ensureSpecialityTables();
  const table = await assignmentTable();
  await db.$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE RTRIM(UserID) = ?`, id);
}

/* ── tbl_itemmaster.SpecAreaID ───────────────────────────────────────────── */

/** The column names this database has been known to use for it, best first. */
const ITEM_SPEC_CANDIDATES = [ITEM_SPEC_COLUMN, "SpecArea", "Specilities"];

/**
 * The real column name on THIS database, or null when the ALTER TABLE has not
 * been run yet. Resolved from information_schema and remembered for a minute,
 * so the Item Master screen keeps working on a database that does not have the
 * column instead of dying on "Unknown column".
 */
export async function itemSpecColumn(): Promise<string | null> {
  return resolveLegacyColumn("tbl_itemmaster", ITEM_SPEC_CANDIDATES);
}

/** 1060 — another request added the column a moment before this one did. */
function duplicateColumn(e: unknown): boolean {
  const code = (e as { code?: unknown; message?: string })?.code;
  return code === "P2010" || /duplicate column|1060/i.test(String((e as { message?: string })?.message ?? e));
}

/** A column name is only ever put into SQL text after this check. Every value
 *  that reaches here comes from the candidate list above, but nothing that is
 *  about to be pasted into a statement is taken on trust. */
export function safeColumnName(name: string | null | undefined): name is string {
  return typeof name === "string" && /^[A-Za-z0-9_]+$/.test(name);
}

/* Shared between the callers below so a burst of parallel saves runs one
   ALTER, not twenty. Cleared as soon as it settles. */
let columnRepair: Promise<string | null> | null = null;

/**
 * Make sure tbl_itemmaster can hold a speciality, adding the column the first
 * time this database is asked and has not got it.
 *
 * Adding one nullable char(10) is harmless — no existing row changes, nothing
 * is written — so there is no reason to leave Item Master dead on a shop that
 * has not run the SQL by hand. scripts/add-itemmaster-specaareaid.sql is still
 * there for whoever prefers to do it in phpMyAdmin, and running it after this
 * has already done the work simply finds the column and does nothing.
 */
export async function ensureItemSpecColumn(): Promise<string | null> {
  const found = await itemSpecColumn();
  if (found) return found;

  if (!columnRepair) {
    const run = (async () => {
      try {
        await prisma.$executeRawUnsafe(
          "ALTER TABLE `tbl_itemmaster` ADD COLUMN `SpecAreaID` char(10) NULL DEFAULT NULL",
        );
        console.info(
          "[Item Master] added the speciality column to tbl_itemmaster — " +
            "an administrator can still run scripts/add-itemmaster-specaareaid.sql, " +
            "it will find the column and do nothing.",
        );
      } catch (e) {
        // Losing the race against a parallel request is the same good news.
        if (!duplicateColumn(e)) {
          console.error(
            "[Item Master] could not add the speciality column to tbl_itemmaster. " +
              "Run scripts/add-itemmaster-specaareaid.sql as an administrator. Original error:",
            e,
          );
        }
      }
      // Whatever happened, ask again rather than believing the one-minute
      // "not there" answer we cached a moment ago.
      forgetLegacyColumn("tbl_itemmaster", ITEM_SPEC_CANDIDATES);
      return itemSpecColumn();
    })();
    columnRepair = run.finally(() => {
      columnRepair = null;
    });
  }
  return columnRepair;
}

/* ── reading and writing the item column without Prisma ───────────────────
   The name of this column is worked out from the live database, because two
   shops spell it differently, so it cannot be a Prisma model field — Prisma
   would have to be regenerated for every spelling, and until that happens it
   answers "Unknown field SpecAreaID" and the whole Item Master screen fails.
   Reading and writing it with raw SQL keeps the screen working whatever the
   schema happens to say, and whatever the column is really called. */

export const itemSpecKey = (locCode: string, itemCode: string): string =>
  `${locCode.trim().toUpperCase()}|${itemCode.trim().toUpperCase()}`;

/** Every item's current speciality, keyed by itemSpecKey. Empty when the
 *  column is not there — an empty map simply means "nothing has one". */
export async function itemSpecMap(db: SpecDb = prisma): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const column = await itemSpecColumn();
  if (!safeColumnName(column)) return out;
  try {
    const rows = await db.$queryRawUnsafe<{ LocCode: string; ItemCode: string; SpecAreaID: string }[]>(
      `SELECT RTRIM(LocCode) AS LocCode, RTRIM(ItemCode) AS ItemCode,
              RTRIM(\`${column}\`) AS SpecAreaID
         FROM tbl_itemmaster
        WHERE \`${column}\` IS NOT NULL AND RTRIM(\`${column}\`) <> ''`,
    );
    for (const r of rows) {
      const code = trim(r.SpecAreaID);
      if (code) out.set(itemSpecKey(String(r.LocCode), String(r.ItemCode)), code);
    }
  } catch (e) {
    console.error("[Item Master] could not read the specialities on the items:", e);
  }
  return out;
}

/** Set (or clear) the speciality on every location row of one item. An empty
 *  `code` writes an empty value rather than leaving the old one behind.
 *
 *  `locCode` narrows it to a single location row; leave it out to set the
 *  speciality on that item in every location at once, which is what saving
 *  from Item Master does — one service, one speciality, wherever it is stocked. */
export async function writeItemSpec(
  db: SpecDb,
  locCode: string,
  itemCode: string,
  code: string,
): Promise<void> {
  const column = await itemSpecColumn();
  if (!safeColumnName(column)) return;

  const value = code ? code.padEnd(10, " ") : null;
  const where = locCode
    ? "WHERE RTRIM(ItemCode) = ? AND RTRIM(LocCode) = ?"
    : "WHERE RTRIM(ItemCode) = ?";
  const params: unknown[] = locCode ? [value, itemCode.trim(), locCode.trim()] : [value, itemCode.trim()];

  await db.$executeRawUnsafe(
    `UPDATE tbl_itemmaster SET \`${column}\` = ? ${where}`,
    ...(params as never[]),
  );
}