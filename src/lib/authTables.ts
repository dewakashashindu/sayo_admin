// src/lib/authTables.ts
// ─────────────────────────────────────────────────────────────────────────────
// The authentication tables this app needs, created ONCE per server process.
//
// Before: every request that touched permissions ran three
// `CREATE TABLE IF NOT EXISTS` statements (accessServer.ts) and the OTP routes
// created their own table on every call. That is a DDL round-trip on the hot
// path, and it silently needs the CREATE privilege — if the database user does
// not have it, sign-in fails in a confusing way.
//
// Now: the statements run once, the first time a feature needs them, and the
// result is remembered. scripts/create-auth-tables.sql holds the same SQL so the
// tables can be created up-front (recommended in production); if they already
// exist nothing here does any work.
// ─────────────────────────────────────────────────────────────────────────────

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
    name: "Tbl_UserAuthorization",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_UserAuthorization (
      UserID  CHAR(10)     NOT NULL,
      FuncID  VARCHAR(200) NOT NULL,
      Auth    TINYINT(1)   NOT NULL DEFAULT 0,
      Module  VARCHAR(50)  NOT NULL DEFAULT 'RT',
      ACCESS  VARCHAR(50)  NOT NULL DEFAULT '',
      PRIMARY KEY (UserID, FuncID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: "Tbl_UserAccess_StdProfile",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_UserAccess_StdProfile (
      UserID  CHAR(10)     NOT NULL,
      FuncID  VARCHAR(200) NOT NULL,
      Auth    TINYINT(1)   NOT NULL DEFAULT 0,
      Module  VARCHAR(50)  NOT NULL DEFAULT 'RT',
      ACCESS  VARCHAR(50)  NOT NULL DEFAULT '',
      PRIMARY KEY (UserID, FuncID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: "Tbl_UserLocAccess",
    sql: `CREATE TABLE IF NOT EXISTS Tbl_UserLocAccess (
      OwnerId CHAR(10) NOT NULL,
      LocCode CHAR(10) NOT NULL,
      Allow   CHAR(1)  NOT NULL DEFAULT 'Y',
      PRIMARY KEY (OwnerId, LocCode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
];

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
}
