-- ════════════════════════════════════════════════════════════════
-- Fix: /api/recipes POST failed with P2000
--   "The provided value for the column is too long for the column's
--    type. Column: MenuItmID"
--
-- Root cause: tbl_recipes.MenuItmID is CHAR(10), but item codes
-- (tbl_itemmaster.ItemCode) are up to 15 characters, e.g.
-- ITM000000000002.
--
-- Run this on BOTH databases (local MySQL and TiDB cloud),
-- or run `npm run db:push:all` after applying the schema patch
-- (use this SQL if db push asks for confirmation / fails).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE tbl_recipes
  DROP PRIMARY KEY,
  MODIFY COLUMN MenuItmID CHAR(15) NOT NULL,
  ADD PRIMARY KEY (MenuItmID, RowItemCode, LocCode);
