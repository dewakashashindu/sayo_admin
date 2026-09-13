-- ═══════════════════════════════════════════════════════════════════════════
--  Tbl_Serials — central serial-number counters
--  ---------------------------------------------------------------------------
--  Auto-generated codes (booking IDs, customer codes, …) take their next
--  number from this table instead of being calculated inside the API code.
--
--    SeriCode  prefix of the series   "BK"  = booking ID
--                                     "CUS" = customer code
--    SeriNo    the LAST ISSUED number, e.g. "0000007"
--    SeriDate  the date the counter was last used
--
--  When a record is created the app:
--    1. reads SeriNo for that SeriCode        -> 7
--    2. adds one                              -> 8
--    3. uses  <SeriCode> + <padded number>    -> "BK0000008"
--    4. writes "0000008" back, SeriDate = today
--
--  SAFE TO RUN MORE THAN ONCE. Creating the table, seeding the counters and
--  backfilling are all idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Table ────────────────────────────────────────────────────────────────
-- SeriCode is the primary key: the allocator must not be able to create two
-- counters for the same series, and it turns the row lock into a PK lookup.
CREATE TABLE IF NOT EXISTS tbl_serials (
  SeriCode  CHAR(10) NOT NULL,
  SeriNo    CHAR(10) NOT NULL DEFAULT '0000000',
  SeriDate  DATE     NULL,
  PRIMARY KEY (SeriCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2. Seed the two series in use ───────────────────────────────────────────
-- Starts at 0, so the first number issued is 1 (BK0000001 / CUS0000001).
-- INSERT IGNORE never overwrites a counter that is already running.
INSERT IGNORE INTO tbl_serials (SeriCode, SeriNo, SeriDate) VALUES
  ('BK',  '0000000', NULL),
  ('CUS', '0000000', NULL);


-- ── 3. Backfill when the database already holds data ────────────────────────
-- Raise each counter to the highest number already stored, so the allocator
-- can never hand out a code that a row is already using. Only ever moves the
-- counter forward — a running counter is never lowered.

-- 3a. Bookings — highest BK number across the header and both detail tables.
UPDATE tbl_serials s
  JOIN (
    SELECT COALESCE(MAX(n), 0) AS highest
      FROM (
        SELECT MAX(CAST(SUBSTRING(TRIM(BookingID), 3) AS UNSIGNED)) AS n
          FROM tbl_bookingheder
         WHERE TRIM(BookingID) REGEXP '^BK[0-9]+$'
        UNION ALL
        SELECT MAX(CAST(SUBSTRING(TRIM(BookingID), 3) AS UNSIGNED)) AS n
          FROM tbl_bookingservicedetail
         WHERE TRIM(BookingID) REGEXP '^BK[0-9]+$'
        UNION ALL
        SELECT MAX(CAST(SUBSTRING(TRIM(BookingID), 3) AS UNSIGNED)) AS n
          FROM tbl_bookingtxndetail
         WHERE TRIM(BookingID) REGEXP '^BK[0-9]+$'
      ) AS u
  ) AS m
   SET s.SeriNo = LPAD(m.highest, 7, '0')
 WHERE s.SeriCode = 'BK'
   AND m.highest > CAST(TRIM(s.SeriNo) AS UNSIGNED);

-- 3b. Customers — highest CUS number in tbl_customermaster.
UPDATE tbl_serials s
  JOIN (
    SELECT COALESCE(MAX(CAST(SUBSTRING(TRIM(CusCode), 4) AS UNSIGNED)), 0) AS highest
      FROM tbl_customermaster
     WHERE TRIM(CusCode) REGEXP '^CUS[0-9]+$'
  ) AS m
   SET s.SeriNo = LPAD(m.highest, 7, '0')
 WHERE s.SeriCode = 'CUS'
   AND m.highest > CAST(TRIM(s.SeriNo) AS UNSIGNED);


-- ── 4. Verify ───────────────────────────────────────────────────────────────
SELECT SeriCode, SeriNo, SeriDate FROM tbl_serials ORDER BY SeriCode;


-- ═══════════════════════════════════════════════════════════════════════════
--  SQL Server / MS-SQL version of step 1 (the original definition this was
--  modelled on). Use this if you create the table by hand on MS-SQL.
--
--  CREATE TABLE [dbo].[Tbl_Serials](
--      [SeriCode] [char](10) NOT NULL,
--      [SeriNo]   [char](10) NOT NULL,
--      [SeriDate] [date]     NULL,
--   CONSTRAINT [PK_Tbl_Serials] PRIMARY KEY CLUSTERED ([SeriCode] ASC)
--  ) ON [PRIMARY];
-- ═══════════════════════════════════════════════════════════════════════════
