-- ===========================================================================
-- create-upload-temp-tables.sql
--
-- Creates the seven Temp tables the Upload Data screen stages rows into.
--
--   tbl_suppliermaster  ->  Tbl_SupplierMasterTemp
--   tbl_itemcategory1   ->  Tbl_ItemCategory1Temp
--   tbl_itemcategory2   ->  Tbl_ItemCategory2Temp
--   tbl_itemcategory3   ->  Tbl_ItemCategory3Temp
--   tbl_itemcategory4   ->  Tbl_ItemCategory4Temp
--   tbl_itemmaster      ->  Tbl_ItemMasterTemp
--   tbl_itemdetail      ->  Tbl_ItemDetailTemp
--
-- A row that came out of a spreadsheet never goes straight into a master
-- table. It is parked in the matching Temp table first, sits in the ADD TO LIVE
-- tab until somebody looks at it, and only reaches the real table when that
-- button is pressed.
--
-- Each Temp table is a copy of its master table's columns, with the master
-- table's own types, plus four columns about the row's journey rather than its
-- content:
--
--   UpBatch    the upload this row belongs to, so two files cannot mix
--   UpFileRow  the row number in that file, so the shop can say "row 14"
--   UpStatus   'new' -> INSERT when it goes live, 'update' -> UPDATE
--   UpNote     what the check found, shown in the ADD TO LIVE tab
--
-- WHY THIS FILE IS SAFE TO RUN
--
--   * every statement is -- ===========================================================================
-- Suppliers
--   live table : tbl_suppliermaster
--   temp table : Tbl_SupplierMasterTemp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_SupplierMasterTemp` (
  `SupID` char(10) NOT NULL,
  `SupName` varchar(200) NOT NULL,
  `SuppAdd1` varchar(200) NOT NULL DEFAULT ' ',
  `ContactNO` varchar(100) NOT NULL DEFAULT ' ',
  `Emails` varchar(100) NOT NULL DEFAULT ' ',
  `Web` varchar(50) NOT NULL DEFAULT ' ',
  `DebtAmount` double NOT NULL DEFAULT 0,
  `CreateUser` varchar(50) NOT NULL DEFAULT '0',
  `CreateDatetime` datetime NOT NULL DEFAULT current_timestamp(),
  `Remarks` varchar(260) NOT NULL DEFAULT ' ',
  `Enable` tinyint(1) NOT NULL DEFAULT 1,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_suppliermaster';

-- ===========================================================================
-- Main Categories
--   live table : tbl_itemcategory1
--   temp table : Tbl_ItemCategory1Temp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_ItemCategory1Temp` (
  `CatCode` char(10) NOT NULL,
  `CatDes` varchar(50) NOT NULL,
  `Enable` tinyint(1) NOT NULL DEFAULT 1,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_itemcategory1';

-- ===========================================================================
-- Sub Categories 1
--   live table : tbl_itemcategory2
--   temp table : Tbl_ItemCategory2Temp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_ItemCategory2Temp` (
  `CatCode` char(10) NOT NULL,
  `CatDes` varchar(50) NOT NULL,
  `Enable` tinyint(1) NOT NULL DEFAULT 1,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_itemcategory2';

-- ===========================================================================
-- Sub Categories 2
--   live table : tbl_itemcategory3
--   temp table : Tbl_ItemCategory3Temp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_ItemCategory3Temp` (
  `CatCode` char(10) NOT NULL,
  `CatDes` varchar(50) NOT NULL,
  `Enable` tinyint(1) NOT NULL DEFAULT 1,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_itemcategory3';

-- ===========================================================================
-- Sub Categories 3
--   live table : tbl_itemcategory4
--   temp table : Tbl_ItemCategory4Temp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_ItemCategory4Temp` (
  `CatCode` char(10) NOT NULL,
  `CatDes` varchar(50) NOT NULL,
  `Enable` tinyint(1) NOT NULL DEFAULT 1,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_itemcategory4';

-- ===========================================================================
-- Item Master
--   live table : tbl_itemmaster
--   temp table : Tbl_ItemMasterTemp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_ItemMasterTemp` (
  `LocCode` char(10) NOT NULL,
  `ItemCode` char(15) NOT NULL,
  `ServiceItem` tinyint(1) NOT NULL DEFAULT 0,
  `MOF` char(1) NOT NULL DEFAULT 'O',
  `ItemDes` varchar(50) NOT NULL,
  `ItemPrintDes` varchar(50) NOT NULL DEFAULT ' ',
  `MasterUnitID` char(10) NOT NULL,
  `Category1` char(10) NOT NULL DEFAULT '',
  `Category2` char(10) NOT NULL DEFAULT '',
  `Category3` char(10) NOT NULL DEFAULT '',
  `Category4` char(10) NOT NULL DEFAULT '',
  `SupID` char(10) NOT NULL DEFAULT '0',
  `ROL` double NOT NULL DEFAULT 0,
  `ROQ` double NOT NULL DEFAULT 0,
  `MinQty` double NOT NULL DEFAULT 0,
  `MaxQty` double NOT NULL DEFAULT 0,
  `RawCost` double NOT NULL DEFAULT 0,
  `CostMarkup` double NOT NULL DEFAULT 0,
  `OverallCost` double NOT NULL DEFAULT 0,
  `SalesMargin` double NOT NULL DEFAULT 0,
  `StockBalance` double NOT NULL DEFAULT 0,
  `ExpiryItem` tinyint(1) NOT NULL DEFAULT 0,
  `Retailprice` double NOT NULL DEFAULT 0,
  `WSApp` tinyint(1) NOT NULL DEFAULT 0,
  `WSQty` double NOT NULL DEFAULT 0,
  `WSPrice` double NOT NULL DEFAULT 0,
  `PackedItem` tinyint(1) NOT NULL DEFAULT 0,
  `PackSize` double NOT NULL DEFAULT 0,
  `PackPrice` double NOT NULL DEFAULT 0,
  `SemiFinishedProd` tinyint(1) NOT NULL DEFAULT 0,
  `ItemPic` longblob NULL DEFAULT NULL,
  `SerDuration` int(11) NOT NULL DEFAULT 0,
  `CreateDate` datetime NOT NULL DEFAULT current_timestamp(),
  `CreateBy` char(10) NOT NULL DEFAULT '0',
  `UpdDate` datetime NOT NULL DEFAULT current_timestamp(),
  `UpdBy` char(10) NOT NULL DEFAULT '0',
  `Enable` tinyint(1) NOT NULL DEFAULT 1,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_itemmaster';

-- ===========================================================================
-- Item Details
--   live table : tbl_itemdetail
--   temp table : Tbl_ItemDetailTemp
-- ===========================================================================
CREATE TABLE IF NOT EXISTS `Tbl_ItemDetailTemp` (
  `LocCode` char(10) NOT NULL,
  `ItemCode` char(15) NOT NULL,
  `ExpiryDate` datetime NOT NULL,
  `ItemQty` double NOT NULL DEFAULT 0,
  `UpBatch`   varchar(36) NOT NULL COMMENT 'the upload this row belongs to',
  `UpFileRow` int NOT NULL DEFAULT 0 COMMENT 'the row number it was on in that file',
  `UpStatus`  varchar(10) NOT NULL DEFAULT 'new' COMMENT 'new = insert on Add to Live, update = change the live row',
  `UpNote`    varchar(255) NOT NULL DEFAULT '' COMMENT 'what the check found'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload Data: rows waiting to be added to tbl_itemdetail';

-- ===========================================================================
-- What to check afterwards. This should say 7.
-- ===========================================================================
-- SELECT COUNT(*) FROM information_schema.TABLES
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND LOWER(TABLE_NAME) IN (
--      'tbl_suppliermastertemp', 'tbl_itemcategory1temp', 'tbl_itemcategory2temp',
--      'tbl_itemcategory3temp', 'tbl_itemcategory4temp', 'tbl_itemmastertemp',
--      'tbl_itemdetailtemp');
--
-- To empty one without touching any master table:
--
--   DELETE FROM `Tbl_ItemCategory1Temp`;
--
-- Or take the tables away entirely, losing anything still waiting in them:
--
--   node scripts/create-upload-temp-tables.mjs --drop
-- ===========================================================================
