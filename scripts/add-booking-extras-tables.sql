-- ============================================================================
-- add-booking-extras-tables.sql
-- Creates the two tables used by the technician workstation (post check-in):
--   1. Tbl_BookingServiceItemAddTech  — supporting technicians per service
--   2. Tbl_BookingServiceRecipe       — materials actually used per booking
-- Run once:  mysql -u <user> -p <database> < scripts/add-booking-extras-tables.sql
-- Safe to re-run? NO — use IF NOT EXISTS guard below if unsure.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `Tbl_BookingServiceItemAddTech` (
  `LocCode` CHAR(10) NOT NULL,
  `BookingID` CHAR(10) NOT NULL,
  `GuessID` CHAR(10) NOT NULL,
  `ServiceItemID` CHAR(10) NOT NULL,
  `TechID` CHAR(10) NOT NULL,
  PRIMARY KEY (`LocCode`, `BookingID`, `GuessID`, `ServiceItemID`, `TechID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `Tbl_BookingServiceRecipe` (
  `LocCode` CHAR(10) NOT NULL,
  `BookingID` CHAR(10) NOT NULL,
  `GuessID` CHAR(10) NOT NULL,
  `ServiceItemID` CHAR(10) NOT NULL,
  `RawItemCode` CHAR(10) NOT NULL,
  `MasterUnitID` CHAR(10) NOT NULL DEFAULT ' ',
  `SubUnitID` CHAR(10) NOT NULL,
  `QTY` DOUBLE NOT NULL,
  `ItemCost` DOUBLE NOT NULL,
  PRIMARY KEY (`LocCode`, `BookingID`, `GuessID`, `ServiceItemID`, `RawItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
