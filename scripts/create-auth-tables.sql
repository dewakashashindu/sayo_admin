-- ═══════════════════════════════════════════════════════════════════════════
--  SAYO Admin — the authentication / permission tables
--
--  2026-09-29: how access works now —
--    * a PROFILE is a named object (APF0000001 …). Its ticks live in
--      Tbl_UserAccess_StdProfile, keyed by the profile code, with the name in
--      the ApfDes column;
--    * a PERSON holds one or more profiles. Their own rows live in
--      Tbl_UserAuthorization: the union of those profiles, adjustable per person.
--  No new tables are created for any of this, and Tbl_UserLocAccess is left
--  alone. Nothing here removes data — see scripts/tidy-access-rows.sql.
--
--  WHEN YOU NEED THIS FILE
--    Usually you do not. The application creates these tables itself, once per
--    server start-up, the first time a feature needs them
--    (see src/lib/authTables.ts).
--
--    Run this file when the MySQL user in DATABASE_URL has NO CREATE
--    privilege (common on shared cPanel hosting) — then the app cannot make
--    its own tables and you will see, in the server log:
--        [authTables] could not create Tbl_…
--            → run scripts/create-auth-tables.sql in phpMyAdmin
--    Create them here once, with an account that does have the privilege, and
--    the message disappears.
--
--  HOW TO RUN
--    phpMyAdmin → select the SAYO database → SQL tab → paste this whole file →
--    Go.  (Or:  mysql -u USER -p DBNAME < scripts/create-auth-tables.sql )
--
--  SAFE TO RUN AGAIN — every statement is CREATE TABLE IF NOT EXISTS.
--
--  Column types and keys must stay in step with src/lib/authTables.ts.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The 6-digit code sent at admin sign-in (phase 2 of the two-step login).
--    One row per administrator; the code itself is bcrypt-hashed.
CREATE TABLE IF NOT EXISTS Tbl_AdminLoginOtp (
  UserId    CHAR(10)     NOT NULL PRIMARY KEY,
  OtpHash   VARCHAR(100) NOT NULL,
  ExpiresAt DATETIME     NOT NULL,
  Attempts  TINYINT      NOT NULL DEFAULT 0,
  CreatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. The staff "forgot password" codes (the plain /admin-login flow).
CREATE TABLE IF NOT EXISTS Tbl_PswReset (
  UserId    CHAR(10)     NOT NULL PRIMARY KEY,
  OtpHash   VARCHAR(100) NOT NULL,
  ExpiresAt DATETIME     NOT NULL,
  Attempts  TINYINT      NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. The booking customer's "forgot password" codes.
--    Keyed by e-mail address, because a customer may not have a profile yet.
CREATE TABLE IF NOT EXISTS Tbl_CustomerOtpReset (
  Email     VARCHAR(200) NOT NULL PRIMARY KEY,
  OtpHash   VARCHAR(100) NOT NULL,
  ExpiresAt DATETIME     NOT NULL,
  Attempts  TINYINT      NOT NULL DEFAULT 0,
  CreatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Sign-in / reset attempt counters.
--    In MySQL rather than in server memory, so restarting the app (or running
--    two copies of it) cannot wipe a limit that is in the middle of working.
--    The key is a SHA-256 of the value being counted, never the value itself,
--    so no IP address and no user name is stored.
CREATE TABLE IF NOT EXISTS Tbl_RateLimit (
  Bucket      VARCHAR(60)  NOT NULL,
  KeyHash     CHAR(64)     NOT NULL,
  Cnt         INT UNSIGNED NOT NULL DEFAULT 0,
  WindowStart DATETIME(3)  NOT NULL,
  PRIMARY KEY (Bucket, KeyHash),
  KEY Tbl_RateLimit_window_idx (WindowStart)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- NOTE on COLLATE: these tables are pinned to utf8mb4_unicode_ci — the collation
-- every table Prisma created for this app uses. On MariaDB 11 a bare
-- DEFAULT CHARSET=utf8mb4 means utf8mb4_uca1400_ai_ci, and comparing the two
-- families gives "Illegal mix of collations" (error 1267).

-- 5. THE PROFILES — one row per screen per profile. UserID carries the profile
--    code (APF0000001 …) and ApfDes carries the profile's name.
--    This is the table the shop already had; if it exists, this statement does
--    nothing (the app adds the ApfDes column by itself when it is missing).
CREATE TABLE IF NOT EXISTS Tbl_UserAccess_StdProfile (
  UserID CHAR(10)     NOT NULL,
  FuncID VARCHAR(200) NOT NULL,
  Auth   TINYINT(1)   NOT NULL DEFAULT 0,
  Module VARCHAR(50)  NOT NULL DEFAULT 'RT',
  ACCESS VARCHAR(50)  NOT NULL DEFAULT '',
  ApfDes VARCHAR(100) NULL,
  PRIMARY KEY (UserID, FuncID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5b. Only needed once, and only if the app could not do it (no ALTER right):
--     the profile NAME column. Run it by hand if the column is missing.
-- ALTER TABLE Tbl_UserAccess_StdProfile ADD COLUMN ApfDes VARCHAR(100) NULL;

-- 6. A PERSON'S OWN ROWS — the union of the profiles assigned to them, written
--    by Assign Profiles and adjustable per person. One row per screen, one per
--    branch (Module = 'LOC'), one per profile held (Module = 'APF').
CREATE TABLE IF NOT EXISTS Tbl_UserAuthorization (
  UserID CHAR(10)     NOT NULL,
  FuncID VARCHAR(200) NOT NULL,
  Auth   TINYINT(1)   NOT NULL DEFAULT 0,
  Module VARCHAR(50)  NOT NULL DEFAULT 'RT',
  ACCESS VARCHAR(50)  NOT NULL DEFAULT '',
  PRIMARY KEY (UserID, FuncID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Check: all six should be listed ──────────────────────────────────────
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('Tbl_AdminLoginOtp','Tbl_PswReset','Tbl_CustomerOtpReset',
                     'Tbl_RateLimit','Tbl_UserAccess_StdProfile','Tbl_UserAuthorization')
ORDER BY TABLE_NAME;
