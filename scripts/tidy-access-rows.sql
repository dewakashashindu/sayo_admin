-- ═══════════════════════════════════════════════════════════════════════════
--  SAYO Admin — tidy the access rows (READ THIS FIRST, then run it)
--
--  After 2026-09-29 permissions work like this, and this script changes nothing
--  about that by itself:
--
--      Tbl_UserAccess_StdProfile   one PROFILE, keyed by its APF0000001 code,
--                                  the profile's name in the ApfDes column
--      Tbl_UserAuthorization       one PERSON's own rows: the union of the
--                                  profiles assigned to them (editable — the
--                                  "Customize" button on Assign Profiles)
--
--  Two kinds of OLD data can still be sitting there:
--
--    (a) rows keyed by a USER GROUP  — UserID = 'GRP0000003' in
--        Tbl_UserAccess_StdProfile. That was the old "a group has a profile"
--        model. The app ignores them (it only looks at UserID = 'APF…'), so
--        they are clutter you may delete. Step 2 below does it.
--
--    (b) rows of a PERSON that were written by the OLD model — UserID =
--        'USR0000001' with no 'APF' row. Those rows are LIVE: the panel uses
--        them as that person's access until somebody presses Save on
--        Assign Profiles for them. Step 3 lets you clear them person by person
--        (or line by line, by editing the WHERE).
--
--  Running this script twice is harmless, and a missing table is skipped
--  instead of stopping it.
--
--  HOW TO RUN: phpMyAdmin → your database → SQL tab → paste → Go
--              or:  mysql -u USER -p DBNAME < scripts/tidy-access-rows.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. The ApfDes column (the profile name) ───────────────────────────────
--    The application adds it by itself the first time it needs it. This does
--    the same thing for you, and says so when the SQL user may not ALTER — the
--    app then keeps the name in a '*NAME' row of the same table instead.
SET @has_apfdes := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'Tbl_UserAccess_StdProfile'
                      AND COLUMN_NAME = 'ApfDes');
SET @q := IF(@has_apfdes = 0,
  'ALTER TABLE Tbl_UserAccess_StdProfile ADD COLUMN ApfDes VARCHAR(100) NULL',
  'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;
SET @has_apfdes := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'Tbl_UserAccess_StdProfile'
                      AND COLUMN_NAME = 'ApfDes');
SELECT IF(@has_apfdes = 1,
          'ApfDes column: present — the app stores the profile name there',
          'ApfDes column: could not be added (no ALTER right?) — the app keeps the name in a *NAME row instead; nothing is broken') AS apfdes;

-- ── 1. WHAT IS IN THE TWO TABLES RIGHT NOW ────────────────────────────────
--    (a) the profiles that exist. '*' marks a profile whose name row is there
--        even though the ApfDes column could not be added.
SELECT RTRIM(UserID) AS profile_code,
       (SELECT RTRIM(n.ACCESS) FROM Tbl_UserAccess_StdProfile n
         WHERE RTRIM(n.UserID) = RTRIM(p.UserID) AND n.Module = 'APFNAME' LIMIT 1) AS profile_name,
       SUM(CASE WHEN Module NOT IN ('LOC','APF','APFNAME') THEN 1 ELSE 0 END) AS screen_rows,
       SUM(CASE WHEN Module = 'LOC' THEN 1 ELSE 0 END) AS branch_rows
FROM Tbl_UserAccess_StdProfile p
WHERE UserID LIKE 'APF%'
GROUP BY RTRIM(UserID)
ORDER BY 1;

--    (b) the OLD group-keyed rows (ignored by the app — safe to delete)
SELECT RTRIM(s.UserID) AS group_code,
       (SELECT RTRIM(g.GroupDes) FROM tbl_usergroups g
         WHERE CONVERT(RTRIM(g.GroupId) USING utf8mb4) COLLATE utf8mb4_general_ci
             = CONVERT(RTRIM(s.UserID) USING utf8mb4) COLLATE utf8mb4_general_ci
         LIMIT 1) AS group_name,
       COUNT(*) AS screen_rows
FROM Tbl_UserAccess_StdProfile s
WHERE s.UserID LIKE 'GRP%'
GROUP BY RTRIM(s.UserID)
ORDER BY 1;

--    (c) the people who have rows, and of which kind
SELECT RTRIM(u.UserID) AS user_id,
       (SELECT RTRIM(d.UserName) FROM tbl_userdetails d
         WHERE CONVERT(RTRIM(d.UserId) USING utf8mb4) COLLATE utf8mb4_general_ci
             = CONVERT(RTRIM(u.UserID) USING utf8mb4) COLLATE utf8mb4_general_ci
         LIMIT 1) AS user_name,
       SUM(CASE WHEN Module = 'APF' THEN 1 ELSE 0 END) AS assigned_profiles,
       SUM(CASE WHEN Module = 'LOC' THEN 1 ELSE 0 END) AS branch_rows,
       SUM(CASE WHEN Module NOT IN ('LOC','APF') THEN 1 ELSE 0 END) AS screen_rows
FROM Tbl_UserAuthorization u
GROUP BY RTRIM(u.UserID)
ORDER BY 1;

-- ── 2. Remove the OLD group-keyed profile rows (they are not profiles) ────
--    Preview first (the SELECT above), then un-comment this line:
-- DELETE FROM Tbl_UserAccess_StdProfile WHERE UserID LIKE 'GRP%';

-- ── 3. Remove a person's old rows so they start clean ─────────────────────
--    Do this ONE PERSON AT A TIME, and only for somebody you are also going to
--    set up on the Assign Profiles screen — while their rows are here they have
--    access. Un-comment and put the id in:
-- DELETE FROM Tbl_UserAuthorization WHERE RTRIM(UserID) = 'USR0000001';

--    …or clear every person's rows (they all start with no access; then give
--    each of them a profile on Assign Profiles):
-- DELETE FROM Tbl_UserAuthorization WHERE UserID LIKE 'USR%';

-- ── 4. If an earlier copy of the redesign was installed, drop its four tables.
--    They are not used by anything any more. Safe if they never existed.
DROP TABLE IF EXISTS Tbl_AccessProfile;
DROP TABLE IF EXISTS Tbl_AccessProfileAccess;
DROP TABLE IF EXISTS Tbl_AccessProfileLoc;
DROP TABLE IF EXISTS Tbl_UserProfileAssign;

-- ── 5. Optional: the old branch table ─────────────────────────────────────
--    Tbl_UserLocAccess is not read or written by the application any more
--    (branches live in the two tables above). Leave it alone if another program
--    still uses it — otherwise it can be emptied or dropped:
-- DELETE FROM Tbl_UserLocAccess;
-- DROP TABLE Tbl_UserLocAccess;

-- ── 6. What must be true afterwards ───────────────────────────────────────
SELECT RTRIM(UserID) AS profile_code,
       (SELECT RTRIM(n.ACCESS) FROM Tbl_UserAccess_StdProfile n
         WHERE RTRIM(n.UserID) = RTRIM(p.UserID) AND n.Module = 'APFNAME' LIMIT 1) AS profile_name
FROM Tbl_UserAccess_StdProfile p WHERE UserID LIKE 'APF%' GROUP BY RTRIM(UserID) ORDER BY 1;

SELECT RTRIM(UserID) AS user_id, RTRIM(FuncID) AS holds_profile
FROM Tbl_UserAuthorization WHERE Module = 'APF' ORDER BY 1, 2;

SELECT 'Tidy done ✓' AS done_;
