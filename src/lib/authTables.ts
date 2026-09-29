// src/lib/authTables.ts
// ─────────────────────────────────────────────────────────────────────────────
// The authentication tables this app needs, created ONCE per server process.
//
// Before: every request that touched permissions ran three
// 2026-09-29 — the four permission tables are created with an explicit
// COLLATE=utf8mb4_unicode_ci. MariaDB 11 hands out utf8mb4_uca1400_ai_ci for a
// bare `DEFAULT CHARSET=utf8mb4`, while every table Prisma created for this app
// is utf8mb4_unicode_ci — joining the two families raises
// "Illegal mix of collations" (error 1267). Same collation = no surprise.
//
// `CREATE TABLE IF NOT EXISTS` statements (accessServer.ts) and the OTP routes
// created their own table on every call. That is a DDL round-trip on the hot
// path, and it silently needs the CREATE privilege — if the database user does
// not have it, sign-in fails in a confusing way.
//
// Now: the statements run once, the first time a feature needs them, and the
// result is remembered. scripts/create-auth-tables.sql holds the same SQL so the
// tables can be created up-front (recommended in production); if they already
// exist nothing here does any work.
//
// 2026-09-29 (2) — THE SHOP'S TWO TABLES ARE THE STORE.
//
// The first cut of this redesign invented four tables of its own
// (Tbl_AccessProfile / …Access / …Loc / Tbl_UserProfileAssign). The shop asked
// for those NOT to exist: writes have to land in the two tables the database
// already has, and nowhere else —
//
//     Tbl_UserAccess_StdProfile   one profile, keyed by its APF… code, the
//                                 profile NAME kept in the added ApfDes column
//     Tbl_UserAuthorization       one person's own rows: the union of the
//                                 profiles assigned to them (kept editable —
//                                 "customize"), their branches, and one row per
//                                 assigned profile (Module = 'APF')
//
// Both are created here if they are missing (a fresh database), and ApfDes is
// added to an existing table only when it is not there yet. A SQL user without
// ALTER rights is NOT fatal: the name then lives in one extra row of the same
// table (FuncID = '*NAME', Module = 'APFNAME') — see src/lib/accessProfiles.ts.
//
// Row layout the app writes:
//     a screen    FuncID = cipher(screen code)  Module = parent screen  ACCESS = cipher(mask)
//     a branch    FuncID = LocCode              Module = 'LOC'
//     assignment  FuncID = APF0000001           Module = 'APF'      (user table only)
//     the name    FuncID = '*NAME'              Module = 'APFNAME'  (only when no column)
//
import { prisma } from "@/lib/prisma";

const TABLES: { name: string; sql: string }[] = [
  {
    name: "Tbl_AdminLoginOtp",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_AdminLoginOtp (
      UserId    CHAR(10)     NOT NULL PRIMARY KEY,
      OtpHash   VARCHAR(100) NOT NULL,
      ExpiresAt DATETIME     NOT NULL,
      Attempts  TINYINT      NOT NULL DEFAULT 0,
      CreatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: "Tbl_PswReset",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_PswReset (
      UserId    CHAR(10)     NOT NULL PRIMARY KEY,
      OtpHash   VARCHAR(100) NOT NULL,
      ExpiresAt DATETIME     NOT NULL,
      Attempts  TINYINT      NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: "Tbl_CustomerOtpReset",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_CustomerOtpReset (
      Email     VARCHAR(200) NOT NULL PRIMARY KEY,
      OtpHash   VARCHAR(100) NOT NULL,
      ExpiresAt DATETIME     NOT NULL,
      Attempts  TINYINT      NOT NULL DEFAULT 0,
      CreatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: "Tbl_RateLimit",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_RateLimit (
      Bucket      VARCHAR(60)  NOT NULL,
      KeyHash     CHAR(64)     NOT NULL,
      Cnt         INT UNSIGNED NOT NULL DEFAULT 0,
      WindowStart DATETIME(3)  NOT NULL,
      PRIMARY KEY (Bucket, KeyHash),
      KEY Tbl_RateLimit_window_idx (WindowStart)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    /* ── the shop's access tables — the only permission store ────────────── */
    name: "Tbl_UserAccess_StdProfile",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_UserAccess_StdProfile (
      UserID CHAR(10)     NOT NULL,
      FuncID VARCHAR(200) NOT NULL,
      Auth   TINYINT(1)   NOT NULL DEFAULT 0,
      Module VARCHAR(50)  NOT NULL DEFAULT 'RT',
      ACCESS VARCHAR(50)  NOT NULL DEFAULT '',
      ApfDes VARCHAR(100) NULL,
      PRIMARY KEY (UserID, FuncID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "Tbl_UserAuthorization",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_UserAuthorization (
      UserID CHAR(10)     NOT NULL,
      FuncID VARCHAR(200) NOT NULL,
      Auth   TINYINT(1)   NOT NULL DEFAULT 0,
      Module VARCHAR(50)  NOT NULL DEFAULT 'RT',
      ACCESS VARCHAR(50)  NOT NULL DEFAULT '',
      PRIMARY KEY (UserID, FuncID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];

/** Does Tbl_UserAccess_StdProfile carry the ApfDes column? null = not checked. */
let profileNameColumn: boolean | null = null;

/**
 * Make sure the profile-NAME column exists. Databases built before this change
 * do not have it, so it is added once; if the SQL user may not ALTER, we say so
 * and the app keeps working (the name goes into a '*NAME' row instead).
 */
async function ensureProfileNameColumn(): Promise<boolean> {
  if (profileNameColumn !== null) return profileNameColumn;
  try {
    const rows = await prisma.$queryRaw<{ n: number | bigint }[]>`
      SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Tbl_UserAccess_StdProfile'
        AND COLUMN_NAME = 'ApfDes'
    `;
    if (Number(rows[0]?.n || 0) > 0) {
      profileNameColumn = true;
      return true;
    }
    await prisma.$executeRawUnsafe(
      "ALTER TABLE Tbl_UserAccess_StdProfile ADD COLUMN ApfDes VARCHAR(100) NULL",
    );
    profileNameColumn = true;
    console.log("[authTables] added Tbl_UserAccess_StdProfile.ApfDes (profile names)");
  } catch (err) {
    console.warn(
      `[authTables] could not add Tbl_UserAccess_StdProfile.ApfDes: ${
        err instanceof Error ? err.message : String(err)
      } — profile names will be kept in a '*NAME' row of the same table instead.`,
    );
    profileNameColumn = false;
  }
  return profileNameColumn;
}

/** True once ensureAuthTables() has run and the column is there. */
export function hasProfileNameColumn(): boolean {
  return profileNameColumn === true;
}

let pending: Promise<boolean> | null = null;
let ready = false;
/** When the last attempt failed, so a database outage does not cost seven
    failing statements on every single request (the log fills up and each
    request waits for its own connection timeout). */
let retryAfter = 0;
const RETRY_COOLDOWN_MS = 30_000;

async function createAll(): Promise<boolean> {
  let allOk = true;
  for (const table of TABLES) {
    try {
      await prisma.$executeRawUnsafe(table.sql);
    } catch (err) {
      allOk = false;
      console.error(
        `[authTables] could not create ${table.name}: ${err instanceof Error ? err.message : String(err)}\n` +
          "            → run scripts/create-auth-tables.sql in phpMyAdmin (the SQL user may not have CREATE rights).",
      );
    }
  }
  if (allOk) {
    await ensureProfileNameColumn();
    ready = true;
    retryAfter = 0;
  } else {
    retryAfter = Date.now() + RETRY_COOLDOWN_MS;
  }
  return allOk;
}

/**
 * Make sure the auth tables exist. Safe to `await` on every request: after the
 * first successful run this is a resolved promise and costs nothing.
 * A failed attempt is NOT cached for ever — the next call retries once the
 * database recovers.
 */
export function ensureAuthTables(): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  /* a recent failure: do not try again yet, just say "not ready" — the routes
     answer with their normal error message instead of piling up DDL attempts */
  if (retryAfter && Date.now() < retryAfter) return Promise.resolve(false);
  if (!pending) {
    pending = createAll().finally(() => {
      if (!ready) pending = null;
    });
  }
  return pending;
}

/** Tests / scripts: forget the cached result. */
export function resetAuthTablesCache(): void {
  ready = false;
  pending = null;
  retryAfter = 0;
  profileNameColumn = null;
}
