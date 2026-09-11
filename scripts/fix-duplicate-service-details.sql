-- ============================================================================
-- fix-duplicate-service-details.sql
-- Cleans duplicate rows in tbl_bookingservicedetail (same service stored many
-- times for one booking/guest — e.g. the "Hair Color Dark Brown 60ml x12"
-- case in booking BK00000004).
--
-- The app's Prisma schema declares the primary key as
--   (LocCode, BookingID, GuessID, ServiceItemID)
-- so duplicates should be impossible. If your legacy database table was
-- created without that key, old writes could store repeated identical rows.
--
-- Run with:  mysql -u <user> -p <database> < scripts/fix-duplicate-service-details.sql
-- (or paste into phpMyAdmin / HeidiSQL step by step)
-- ============================================================================

-- STEP 1 — Preview: which bookings have duplicate service rows?
SELECT LocCode, BookingID, GuessID, ServiceItemID, COUNT(*) AS duplicate_rows
FROM tbl_bookingservicedetail
GROUP BY LocCode, BookingID, GuessID, ServiceItemID
HAVING COUNT(*) > 1;

-- STEP 2 — Keep one collapsed copy of every duplicated group.
DROP TABLE IF EXISTS tmp_bookingservicedetail_dedup;
CREATE TABLE tmp_bookingservicedetail_dedup AS
SELECT
  LocCode,
  BookingID,
  GuessID,
  ServiceItemID,
  MAX(Qty)               AS Qty,
  MAX(ItemPrice)         AS ItemPrice,
  MAX(TechID)            AS TechID,
  MIN(ScheduleIndex)     AS ScheduleIndex,
  MIN(ScheduleStartMin)  AS ScheduleStartMin,
  MAX(ScheduleEndMin)    AS ScheduleEndMin
FROM tbl_bookingservicedetail
GROUP BY LocCode, BookingID, GuessID, ServiceItemID
HAVING COUNT(*) > 1;

-- STEP 3 — Delete ALL rows of those duplicated groups ...
DELETE d
FROM tbl_bookingservicedetail d
JOIN tmp_bookingservicedetail_dedup t
  ON  d.LocCode       = t.LocCode
  AND d.BookingID     = t.BookingID
  AND d.GuessID       = t.GuessID
  AND d.ServiceItemID = t.ServiceItemID;

-- STEP 4 — ... and re-insert the single collapsed copy.
INSERT INTO tbl_bookingservicedetail
  (LocCode, BookingID, GuessID, ServiceItemID, Qty, ItemPrice, TechID,
   ScheduleIndex, ScheduleStartMin, ScheduleEndMin)
SELECT
  LocCode, BookingID, GuessID, ServiceItemID, Qty, ItemPrice, TechID,
  ScheduleIndex, ScheduleStartMin, ScheduleEndMin
FROM tmp_bookingservicedetail_dedup;

DROP TABLE tmp_bookingservicedetail_dedup;

-- STEP 5 — Verify: this should now return zero rows.
SELECT LocCode, BookingID, GuessID, ServiceItemID, COUNT(*) AS duplicate_rows
FROM tbl_bookingservicedetail
GROUP BY LocCode, BookingID, GuessID, ServiceItemID
HAVING COUNT(*) > 1;

-- STEP 6 (recommended, one-time) — add the missing primary key so the
-- database itself rejects duplicates from now on:
--
-- ALTER TABLE tbl_bookingservicedetail
--   ADD PRIMARY KEY (LocCode, BookingID, GuessID, ServiceItemID);
--
-- Only run this AFTER step 5 returns zero rows. If your table already has
-- this key the statement will fail harmlessly.
