-- scripts/add-location-main-sub.sql
-- Legacy MySQL port of Tbl_LocationMaster: Main Location / Sub Location columns.
-- The /api/locations endpoint also adds these automatically the first time it
-- runs, so this script is only needed if you prefer doing it by hand:
--   mysql -h <host> -u <user> -p <db> < scripts/add-location-main-sub.sql

ALTER TABLE `tbl_locationmaster`
  ADD COLUMN `MainLoc`     tinyint(1) NOT NULL DEFAULT 0,  -- 1 = this is a Main Location
  ADD COLUMN `SubLoc`      tinyint(1) NOT NULL DEFAULT 0,  -- 1 = this is a Sub Location
  ADD COLUMN `MainLocCode` char(10)   NOT NULL DEFAULT ''; -- SubLoc=1 → the Main Location it sits under

-- Optional: mark the head-office branch as the main location
-- UPDATE `tbl_locationmaster` SET `MainLoc` = 1 WHERE `LocCode` = 'LOC0000001';
