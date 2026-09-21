-- scripts/create-Tbl_Transfer-mysql.sql
-- MySQL InnoDB port of the 6 transfer tables from the MSSQL script you sent (SCR_BILLING_21Sep2026).
-- Run:  mysql -h <host> -u <user> -p <db> < scripts/create-Tbl_Transfer-mysql.sql
-- Safe to run twice: DROP IF EXISTS first.

-- Lowercase / original casing support with MySQL Engine InnoDB
DROP TABLE IF EXISTS `tbl_transfernotedetail`;
DROP TABLE IF EXISTS `tbl_transfernoteheader`;
DROP TABLE IF EXISTS `tbl_transferreqdetail`;
DROP TABLE IF EXISTS `tbl_transferreqheder`;
DROP TABLE IF EXISTS `tbl_transferreturndetail`;
DROP TABLE IF EXISTS `tbl_transferreturnheader`;

-- 1. Tbl_TransferNoteDetail
CREATE TABLE `tbl_transfernotedetail` (
  `FromLocCode` char(10) NOT NULL,
  `ToLoc` char(10) NOT NULL,
  `TranNo` varchar(15) NOT NULL,
  `ItemCode` char(20) NOT NULL,
  `UnitID` char(15) NOT NULL,
  `CostPrice` double NOT NULL,
  `TRQTy` double NOT NULL,
  `TranQty` double NOT NULL,
  `ItemValue` double NOT NULL,
  `TranConfNo` varchar(15) NOT NULL,
  `NewItem` char(2) NOT NULL,
  `TranRtnQTY` double NOT NULL DEFAULT 0,
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `TranNo`, `ItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tbl_TransferNoteHeader
CREATE TABLE `tbl_transfernoteheader` (
  `FromLocCode` char(10) NOT NULL,
  `ToLoc` char(10) NOT NULL,
  `TranNo` varchar(15) NOT NULL,
  `TraDate` datetime NOT NULL,
  `GrossTotal` double NOT NULL,
  `DisVal` double NOT NULL,
  `Adjestment` double NOT NULL,
  `NetTotal` double NOT NULL,
  `UserID` char(10) NOT NULL,
  `Remarks` varchar(400) NOT NULL,
  `TxnDate` datetime NOT NULL,
  `SysSerialNo` double NOT NULL,
  `Confirmed` char(1) NOT NULL,
  `ConUserID` char(10) NOT NULL,
  `ConDatetime` datetime NOT NULL,
  `TReqNO` char(10) NOT NULL,
  `TakenForTransferRtn` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`FromLocCode`, `TranNo`, `ToLoc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tbl_TransferReqDetail
CREATE TABLE `tbl_transferreqdetail` (
  `FromLocCode` char(10) NOT NULL,
  `ToLoc` char(10) NOT NULL,
  `TRNo` varchar(50) NOT NULL,
  `ItemCode` varchar(20) NOT NULL,
  `UnitID` char(10) NOT NULL,
  `CostPrice` double NOT NULL,
  `TRQty` double NOT NULL,
  `ItemValue` double NOT NULL,
  `TransferConfNo` char(20) NOT NULL,
  `IssuedQTY` double NOT NULL DEFAULT 0,
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `TRNo`, `ItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tbl_TransferReqHeder  (legacy spelling Heder)
CREATE TABLE `tbl_transferreqheder` (
  `FromLocCode` char(10) NOT NULL,
  `ToLoc` char(10) NOT NULL,
  `TRNO` char(10) NOT NULL,
  `TRDate` datetime NOT NULL,
  `TRDueDate` datetime NOT NULL,
  `NetTotal` double NOT NULL,
  `UserID` char(10) NOT NULL,
  `Remarks` varchar(500) NOT NULL,
  `TxnDate` datetime NOT NULL,
  `SysSerialNo` double NOT NULL,
  `ConUserID` char(10) NOT NULL,
  `Confirmed` char(1) NOT NULL,
  `ConDatetime` datetime NOT NULL,
  `TakenForTransfer` char(1) NOT NULL DEFAULT 'N',
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `TRNO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tbl_TransferReturnDetail
CREATE TABLE `tbl_transferreturndetail` (
  `FromLocCode` char(10) NOT NULL,
  `ToLoc` char(10) NOT NULL,
  `TRtnNo` char(10) NOT NULL,
  `ItemCode` char(10) NOT NULL,
  `UnitID` char(10) NOT NULL,
  `CostPrice` double NOT NULL,
  `TNQty` double NOT NULL,
  `TranRtnQty` double NOT NULL,
  `ItemValue` double NOT NULL,
  `TranConfNo` char(10) NOT NULL,
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `TRtnNo`, `ItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tbl_TransferReturnHeader
CREATE TABLE `tbl_transferreturnheader` (
  `FromLocCode` char(10) NOT NULL,
  `ToLoc` char(10) NOT NULL,
  `TRtnNo` char(10) NOT NULL,
  `TRtnDate` datetime NOT NULL,
  `NetTotal` double NOT NULL,
  `UserID` char(10) NOT NULL,
  `Remarks` varchar(1000) NOT NULL,
  `TxnDate` datetime NOT NULL,
  `SysSerialNo` char(10) NOT NULL,
  `ConUserID` char(10) NOT NULL,
  `Confirmed` char(1) NOT NULL,
  `ConDatetime` datetime NOT NULL,
  `TNNO` char(10) NOT NULL,
  PRIMARY KEY (`FromLocCode`, `ToLoc`, `TRtnNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
