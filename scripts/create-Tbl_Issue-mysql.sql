-- scripts/create-Tbl_Issue-mysql.sql
-- Issue module tables (Issue Requisition Note IR000001 / Issue Note IN000001).
-- MySQL InnoDB port of the VB6 MSSQL script (Tbl_IssueReqHeder/Detail,
-- Tbl_IssueNoteHeder/Detail) — names and columns follow the legacy tables.
-- Run:  mysql -h <host> -u <user> -p <db> < scripts/create-Tbl_Issue-mysql.sql
-- Safe to run twice: DROP IF EXISTS first.
--
-- Semantics (same shape as the transfer chain, NO location swap):
--   IRN confirm  -> Confirmed='Y' only (no stock movement, like a requisition)
--   IN  confirm  -> stock leaves FromLoc (txn "IO") and lands at ToLoc (txn "II"),
--                   tbl_issuereqdetail.IssuedQTY accumulates, and when every IRQty
--                   is issued the requisition gets TakenForIssue='1'.

-- Lowercase / original casing support with MySQL Engine InnoDB
DROP TABLE IF EXISTS `tbl_issuenotedetail`;
DROP TABLE IF EXISTS `tbl_issuenoteheder`;
DROP TABLE IF EXISTS `tbl_issuereqdetail`;
DROP TABLE IF EXISTS `tbl_issuereqheder`;

-- 1. Tbl_IssueReqHeder — Issue Requisition header
CREATE TABLE `tbl_issuereqheder` (
  `FromLocCode`    char(10) NOT NULL,
  `ToLoc`          char(10) NOT NULL,
  `IRNO`           char(10) NOT NULL,
  `IRDate`         datetime NOT NULL,
  `IRDueDate`      datetime NOT NULL,
  `NetTotal`       double NOT NULL,
  `UserID`         char(10) NOT NULL,
  `Remarks`        varchar(500) NOT NULL,
  `TxnDate`        datetime NOT NULL,
  `SysSerialNo`    double NOT NULL,
  `ConUserID`      char(10) NOT NULL,
  `Confirmed`      char(1) NOT NULL,
  `ConDatetime`    datetime NOT NULL,
  `TakenForIssue`  char(1) NOT NULL DEFAULT 'N',
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `IRNO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tbl_IssueReqDetail — IR QTY requested; IssuedQTY fills as notes confirm
CREATE TABLE `tbl_issuereqdetail` (
  `FromLocCode`    char(10) NOT NULL,
  `ToLoc`          char(10) NOT NULL,
  `IRNo`           varchar(50) NOT NULL,
  `ItemCode`       varchar(20) NOT NULL,
  `UnitID`         char(10) NOT NULL,
  `CostPrice`      double NOT NULL,
  `IRQty`          double NOT NULL,
  `ItemValue`      double NOT NULL,
  `DirectPOConfNo` char(20) NOT NULL,
  `IssuedQTY`      double NOT NULL DEFAULT 0,
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `IRNo`, `ItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tbl_IssueNoteHeder — Issue Note header (IR Date / Due Date live on the requisition)
CREATE TABLE `tbl_issuenoteheder` (
  `FromLocCode`    char(10) NOT NULL,
  `ToLoc`          char(10) NOT NULL,
  `INNO`           varchar(50) NOT NULL,
  `INDate`         datetime NOT NULL,
  `NetTotal`       double NOT NULL,
  `UserID`         char(10) NOT NULL,
  `Remarks`        varchar(500) NOT NULL,
  `TxnDate`        datetime NOT NULL,
  `SysSerialNo`    double NOT NULL,
  `ConUserID`      char(10) NOT NULL,
  `Confirmed`      char(1) NOT NULL,
  `ConDatetime`    datetime NOT NULL,
  `IRNO`           char(10) NOT NULL DEFAULT '0',
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `INNO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tbl_IssueNoteDetail — IR QTY vs IN QTY; ItemValue = CostPrice x INQty
CREATE TABLE `tbl_issuenotedetail` (
  `FromLocCode`    char(10) NOT NULL,
  `ToLoc`          char(10) NOT NULL,
  `INNo`           char(10) NOT NULL,
  `ItemCode`       char(10) NOT NULL,
  `UnitID`         char(10) NOT NULL,
  `CostPrice`      double NOT NULL,
  `IRQty`          double NOT NULL,
  `INQty`          double NOT NULL,
  `ItemValue`      double NOT NULL,
  `DirectPOConfNo` char(10) NOT NULL,
  `NewItem`        char(2) NOT NULL DEFAULT ' ',
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `INNo`, `ItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Serial counters (auto-created on first use, seeded here for clarity)
--    tbl_serials.SeriCode is char(10): blank-padded keys like 'IR        '.
INSERT IGNORE INTO `tbl_serials` (`SeriCode`, `SeriNo`, `SeriDate`)
VALUES ('IR        ', '0000000', NULL), ('IN        ', '0000000', NULL);
