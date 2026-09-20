-- scripts/create-Tbl_TxnMovement-mysql.sql
-- MySQL version of the SQL Server script you sent.
-- VB6 original was dbo.Tbl_TxnMovement on SQL Server (dbo.sysobjects check).
-- Sayo admin runs on MySQL (lower_case_table_names=1, so Tbl_TxnMovement = tbl_txnMovement = tbl_txnmovement).
-- This file creates the SAME table+columns for MySQL, so GRN's StocksAddition logic can write the old ledger too.
--
-- Run:  mysql -h <host> -u <user> -p <database> < scripts/create-Tbl_TxnMovement-mysql.sql
--   or: node -e "require('mysql2/promise') ..."
-- Safe to run twice: DROP IF EXISTS + CREATE IF NOT EXISTS

DROP TABLE IF EXISTS `Tbl_TxnMovement`;
-- For MySQL, DROP is case-sensitive only on some servers; also drop lowercase variant if it exists
DROP TABLE IF EXISTS `tbl_txnmovement`;

CREATE TABLE IF NOT EXISTS `Tbl_TxnMovement` (
  `LocCode`            char(15)      NOT NULL,
  `RowItemCode`        varchar(20)   NOT NULL,
  `TxnNo`              varchar(20)   NOT NULL,
  `TxnType`            varchar(100)  NOT NULL,
  `TxnDate`            datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `TxndateTime`        datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `PreQty`             double        NOT NULL,
  `TxnQty`             double        NOT NULL,
  `LastQty`            double        NOT NULL,
  `UserId`             varchar(20)   NOT NULL,
  `SysSerialId`        double        NOT NULL,
  `Remarks`            varchar(200)  NOT NULL DEFAULT '',
  `AddDeduct`          char(1)       NOT NULL,
  `TXNDATETIMEMANUAL`  datetime      NOT NULL,
  `SourceItemCode`     varchar(200)  NOT NULL DEFAULT '0',
  -- No PK in original SQL Server script, but MySQL/Prisma needs one for locking.
  -- We keep original (no PK) AND add indexes for the way frmStocks queries it.
  INDEX `idx_TxnMovement_Loc_Item` (`LocCode`, `RowItemCode`),
  INDEX `idx_TxnMovement_TxnNo` (`TxnNo`),
  INDEX `idx_TxnMovement_Type_Date` (`TxnType`, `TxnDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: Add a composite PK if you want Prisma to manage it directly
-- (Uncomment if you prefer a PK. Original VB code had no PK, so it's left without one by default)
-- ALTER TABLE `Tbl_TxnMovement` ADD PRIMARY KEY (`LocCode`, `RowItemCode`, `TxnNo`, `TxnType`, `TxndateTime`);
