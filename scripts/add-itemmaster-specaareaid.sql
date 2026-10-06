-- scripts/add-itemmaster-specaareaid.sql
-- ------------------------------------------------------------------
-- Adds the one column that Item Master needs so a service can point at
-- a technician speciality (tbl_technicianspecilities).
--
-- Run this once in phpMyAdmin BEFORE deploying the updated code.
--
--   SpecAreaID  char(10) NULL   '' on every existing row — nothing breaks,
--                               no service is suddenly tied to a speciality
--
-- Safe to run twice: the second run finds the column and does nothing.
-- It never drops, renames or rewrites anything that is already there.
-- ------------------------------------------------------------------

-- MySQL before 8.0.29 needs the parentheses form of IF NOT EXISTS.
SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = 'tbl_itemmaster'
        AND LOWER(COLUMN_NAME) = 'specaareaid') > 0,
    'SELECT ''tbl_itemmaster.SpecAreaID already exists — nothing to do.'' AS message',
    'ALTER TABLE `tbl_itemmaster` ADD COLUMN `SpecAreaID` char(10) NULL DEFAULT NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── Confirm it worked ─────────────────────────────────────────────
-- The next screen you run should print, under the result:
--   SpecAreaID  YES
-- Anything else means the column is still not there.
SELECT IF(COUNT(*) > 0, 'SpecAreaID  YES', 'SpecAreaID  STILL MISSING') AS `SpecAreaID`,
       (SELECT COUNT(*) FROM `tbl_technicianspecilities`)                AS `Speciality rows`
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND LOWER(TABLE_NAME) = 'tbl_itemmaster'
   AND LOWER(COLUMN_NAME) = 'specaareaid';

-- The Speciality dropdown in Item Master reads the second number above.
-- If it is 0, add some on Administration → Technician Specialities first.

-- ── What the column means ────────────────────────────────────────
--   ''  / NULL  → the service belongs to no speciality
--   'SPA0000002' → the code from tbl_technicianspecilities
--
-- The app writes it through Item Master → Item Details → Speciality, and
-- never generates the value itself: the dropdown is built from the rows
-- you entered on Administration → Technician Specialities.

-- Optional: put your existing services under a speciality in one go.
-- Change the code, then uncomment and run.
--
-- UPDATE `tbl_itemmaster`
--    SET `SpecAreaID` = 'SPA0000002'
--  WHERE `ServiceItem` = 1
--    AND `ItemDes` LIKE '%Colour%';