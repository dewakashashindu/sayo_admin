-- scripts/migrate-itemcode-char15.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- ITEM CODES ARE CHAR(15) EVERYWHERE.
--
-- tbl_itemmaster.ItemCode has always been CHAR(15), but the detail tables were
-- CHAR(10) and stored only the FIRST 10 CHARACTERS of the code. Two items such
-- as ITM0000000001 and ITM0000000002 both stored "ITM0000000", so any lookup
-- that joined on the code could name and price the WRONG item (bookings,
-- technician materials, recipes, bills).
--
-- The application no longer cuts item codes to 10 characters. This script
-- widens the detail columns so the full code fits, then (optionally) upgrades
-- the rows that were written with the old 10-character value.
--
-- HOW TO RUN
--   phpMyAdmin → select the database → SQL tab → paste this file → Go
--   or:  mysql -h HOST -u USER -p DATABASE < scripts/migrate-itemcode-char15.sql
--
-- TAKE A BACKUP FIRST (the ALTERs themselves only widen a column and cannot
-- lose data, but the optional STEP 2 rewrites values):
--   mysqldump -h HOST -u USER -p DATABASE > backup-before-char15.sql
--
-- Safe to run more than once: STEP 1 is idempotent, STEP 2 only touches rows
-- that still hold a short code.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 — BEFORE: what the columns look like right now
-- ─────────────────────────────────────────────────────────────────────────────
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN
      ('ItemCode', 'ItemID', 'ServiceItemID', 'RawItemCode', 'MenuItmID', 'RowItemCode')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — widen every item-code column to CHAR(15)
--          Existing values are kept as they are (only padded with spaces).
-- ─────────────────────────────────────────────────────────────────────────────

-- booked services (the service the guest booked)
ALTER TABLE `tbl_bookingservicedetail`
  MODIFY COLUMN `ServiceItemID` CHAR(15) NOT NULL;

-- supporting technicians added after check-in
ALTER TABLE `Tbl_BookingServiceItemAddTech`
  MODIFY COLUMN `ServiceItemID` CHAR(15) NOT NULL;

-- materials a technician recorded for a booking
ALTER TABLE `Tbl_BookingServiceRecipe`
  MODIFY COLUMN `ServiceItemID` CHAR(15) NOT NULL,
  MODIFY COLUMN `RawItemCode`   CHAR(15) NOT NULL;

-- default recipe of a service / semi-finished item
ALTER TABLE `tbl_recipes`
  MODIFY COLUMN `MenuItmID`   CHAR(15) NOT NULL,
  MODIFY COLUMN `RowItemCode` CHAR(15) NOT NULL;

-- billed lines
ALTER TABLE `tbl_billdetail`
  MODIFY COLUMN `ItemID` CHAR(15) NOT NULL;

-- the item master itself (should already be CHAR(15) — this only makes sure)
ALTER TABLE `tbl_itemmaster`
  MODIFY COLUMN `ItemCode` CHAR(15) NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — (optional, recommended) upgrade the legacy 10-character rows
--
-- Rows written before the migration still hold the short code, e.g.
--   'ITM0000000' where the full code is 'ITM0000000002'.
-- The application can still resolve those, but ONLY while the prefix belongs to
-- exactly one item. This step replaces them with the full code, but only where
-- the match is unambiguous: a prefix shared by two items is left untouched
-- (STEP 3 shows those).
--
-- Run the PREVIEW first, then the six UPDATEs. Nothing here touches an item
-- master row — only the detail columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- PREVIEW: what would be upgraded, and what stays behind as ambiguous
SELECT
  'bookingservicedetail' AS table_name,
  d.LocCode,
  RTRIM(d.ServiceItemID) AS stored_code,
  COUNT(*) AS rows_held,
  (SELECT COUNT(DISTINCT RTRIM(i.ItemCode)) FROM tbl_itemmaster i
    WHERE RTRIM(i.LocCode) = RTRIM(d.LocCode)
      AND LEFT(RTRIM(i.ItemCode), 10) = RTRIM(d.ServiceItemID)) AS candidate_items
FROM tbl_bookingservicedetail d
WHERE CHAR_LENGTH(RTRIM(d.ServiceItemID)) < 15
GROUP BY d.LocCode, RTRIM(d.ServiceItemID)
UNION ALL
SELECT
  'bookingservicerecipe',
  r.LocCode,
  RTRIM(r.RawItemCode),
  COUNT(*),
  (SELECT COUNT(DISTINCT RTRIM(i.ItemCode)) FROM tbl_itemmaster i
    WHERE RTRIM(i.LocCode) = RTRIM(r.LocCode)
      AND LEFT(RTRIM(i.ItemCode), 10) = RTRIM(r.RawItemCode))
FROM Tbl_BookingServiceRecipe r
WHERE CHAR_LENGTH(RTRIM(r.RawItemCode)) < 15
GROUP BY r.LocCode, RTRIM(r.RawItemCode)
UNION ALL
SELECT
  'billdetail',
  b.LocCode,
  RTRIM(b.ItemID),
  COUNT(*),
  (SELECT COUNT(DISTINCT RTRIM(i.ItemCode)) FROM tbl_itemmaster i
    WHERE RTRIM(i.LocCode) = RTRIM(b.LocCode)
      AND LEFT(RTRIM(i.ItemCode), 10) = RTRIM(b.ItemID))
FROM tbl_billdetail b
WHERE CHAR_LENGTH(RTRIM(b.ItemID)) < 15
GROUP BY b.LocCode, RTRIM(b.ItemID);
-- candidate_items = 1 → STEP 2 can upgrade that row
-- candidate_items > 1 → two items share the prefix; the row is left as it is
--                       (the app still resolves it, and shows the stored code)

-- booked services
UPDATE `tbl_bookingservicedetail` d
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(d.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(d.ServiceItemID)
SET d.ServiceItemID = m.full_code
WHERE CHAR_LENGTH(RTRIM(d.ServiceItemID)) < 15;

-- supporting technicians
UPDATE `Tbl_BookingServiceItemAddTech` a
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(a.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(a.ServiceItemID)
SET a.ServiceItemID = m.full_code
WHERE CHAR_LENGTH(RTRIM(a.ServiceItemID)) < 15;

-- recorded materials — the service and the material code
UPDATE `Tbl_BookingServiceRecipe` r
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(r.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(r.ServiceItemID)
SET r.ServiceItemID = m.full_code
WHERE CHAR_LENGTH(RTRIM(r.ServiceItemID)) < 15;

UPDATE `Tbl_BookingServiceRecipe` r
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(r.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(r.RawItemCode)
SET r.RawItemCode = m.full_code
WHERE CHAR_LENGTH(RTRIM(r.RawItemCode)) < 15;

-- default recipes — the service (MenuItmID) and the ingredient (RowItemCode)
UPDATE `tbl_recipes` rc
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(rc.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(rc.MenuItmID)
SET rc.MenuItmID = m.full_code
WHERE CHAR_LENGTH(RTRIM(rc.MenuItmID)) < 15;

UPDATE `tbl_recipes` rc
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(rc.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(rc.RowItemCode)
SET rc.RowItemCode = m.full_code
WHERE CHAR_LENGTH(RTRIM(rc.RowItemCode)) < 15;

-- billed lines
UPDATE `tbl_billdetail` b
JOIN (
  SELECT LocCode, LEFT(RTRIM(ItemCode), 10) AS short_code, MIN(RTRIM(ItemCode)) AS full_code
  FROM tbl_itemmaster
  GROUP BY LocCode, LEFT(RTRIM(ItemCode), 10)
  HAVING COUNT(DISTINCT RTRIM(ItemCode)) = 1
) m
  ON  RTRIM(m.LocCode)     = RTRIM(b.LocCode)
  AND RTRIM(m.short_code)  = RTRIM(b.ItemID)
SET b.ItemID = m.full_code
WHERE CHAR_LENGTH(RTRIM(b.ItemID)) < 15;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — AFTER: what is left, and every code that is still short
--
-- A short code is not an error: the app resolves it through its prefix. It
-- means two items share that prefix, so a new item code should be chosen for
-- the newer item (Settings → Items → change code) if you want a clean join.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN
      ('ItemCode', 'ItemID', 'ServiceItemID', 'RawItemCode', 'MenuItmID', 'RowItemCode')
ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT 'left_short: bookingservicedetail' AS check_name, COUNT(*) AS rows_left
FROM tbl_bookingservicedetail WHERE CHAR_LENGTH(RTRIM(ServiceItemID)) < 15
UNION ALL
SELECT 'left_short: addtech', COUNT(*)
FROM Tbl_BookingServiceItemAddTech WHERE CHAR_LENGTH(RTRIM(ServiceItemID)) < 15
UNION ALL
SELECT 'left_short: bookingrecipe.service', COUNT(*)
FROM Tbl_BookingServiceRecipe WHERE CHAR_LENGTH(RTRIM(ServiceItemID)) < 15
UNION ALL
SELECT 'left_short: bookingrecipe.material', COUNT(*)
FROM Tbl_BookingServiceRecipe WHERE CHAR_LENGTH(RTRIM(RawItemCode)) < 15
UNION ALL
SELECT 'left_short: recipes.menu', COUNT(*)
FROM tbl_recipes WHERE CHAR_LENGTH(RTRIM(MenuItmID)) < 15
UNION ALL
SELECT 'left_short: recipes.row', COUNT(*)
FROM tbl_recipes WHERE CHAR_LENGTH(RTRIM(RowItemCode)) < 15
UNION ALL
SELECT 'left_short: billdetail', COUNT(*)
FROM tbl_billdetail WHERE CHAR_LENGTH(RTRIM(ItemID)) < 15;

-- Item codes that collide on their first 10 characters — the ones behind the
-- rows above. Give the newer item a distinct code to make every row joinable.
SELECT
  RTRIM(LocCode) AS LocCode,
  LEFT(RTRIM(ItemCode), 10) AS shared_prefix,
  COUNT(*) AS items_sharing_it,
  GROUP_CONCAT(RTRIM(ItemCode) ORDER BY ItemCode SEPARATOR ', ') AS item_codes
FROM tbl_itemmaster
GROUP BY RTRIM(LocCode), LEFT(RTRIM(ItemCode), 10)
HAVING COUNT(*) > 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — restart the application (npm run build / restart) so the new code
--          that writes full CHAR(15) codes is the code that runs.
-- ─────────────────────────────────────────────────────────────────────────────
