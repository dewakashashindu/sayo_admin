-- MySQL port of MSSQL SRN / Damage / Recon DDL + Views
-- Covers: Tbl_DamageDetails, Tbl_DamageHeder, Tbl_SRNDetails, Tbl_SRNHeader,
--         Tbl_ReconcilDetails, Tbl_ReconcilHeder (+ MySQL views mapped to
--         tbl_locationmaster / tbl_suppliermaster / tbl_unitmaster / tbl_itemmaster / tbl_userdetails)
-- Run after tbl_locationmaster, tbl_suppliermaster, tbl_unitmaster, tbl_itemmaster, tbl_userdetails exist.
-- Safe to re-run: DROP ... IF EXISTS. Charset utf8mb4 matches db_acd689_sayo dump.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES — drop first (child before header)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `tbl_damagedetails`;
DROP TABLE IF EXISTS `tbl_damageheder`;
DROP TABLE IF EXISTS `tbl_srndetails`;
DROP TABLE IF EXISTS `tbl_srnheader`;
DROP TABLE IF EXISTS `tbl_reconcildetails`;
DROP TABLE IF EXISTS `tbl_reconcilheder`;

-- Damage
CREATE TABLE `tbl_damagedetails` (
  `LocCode`    char(10)    NOT NULL,
  `DamNo`      char(10)    NOT NULL,
  `ItemCode`   char(15)    NOT NULL,
  `UnitId`     char(10)    NOT NULL,
  `CostPrice`  double      NOT NULL DEFAULT 0,
  `DmgQty`     double      NOT NULL DEFAULT 0,
  `ItemValue`  double      NOT NULL DEFAULT 0,
  `DmgConfNo`  char(10)    NOT NULL DEFAULT '',
  PRIMARY KEY (`LocCode`,`DamNo`,`ItemCode`),
  KEY `idx_dam_item` (`ItemCode`),
  KEY `idx_dam_unit` (`UnitId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_damageheder` (
  `LocCode`      char(10)    NOT NULL,
  `DamNo`        char(10)    NOT NULL,
  `NetTotal`     double      NOT NULL DEFAULT 0,
  `UserId`       char(10)    NOT NULL DEFAULT '',
  `Remarks`      varchar(400) NOT NULL DEFAULT '',
  `TxnDate`      datetime    NOT NULL DEFAULT '1900-01-01 00:00:00',
  `TxndateTime`  datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `SysSerialNo`  double      NOT NULL DEFAULT 0,
  `Confirmed`    char(1)     NOT NULL DEFAULT 'N',
  `ConUserID`    char(10)    NOT NULL DEFAULT '',
  `ConDatetime`  datetime    NOT NULL DEFAULT '1900-01-01 00:00:00',
  PRIMARY KEY (`LocCode`,`DamNo`),
  KEY `idx_dam_hdr_date` (`TxnDate`),
  KEY `idx_dam_hdr_conf` (`Confirmed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SRN
CREATE TABLE `tbl_srndetails` (
  `LocCode`         char(10)    NOT NULL,
  `SRNNo`           varchar(15) NOT NULL,
  `ItemCode`        char(20)    NOT NULL,
  `UnitID`          char(15)    NOT NULL,
  `CostPrice`       double      NOT NULL DEFAULT 0,
  `SRNQty`          double      NOT NULL DEFAULT 0,
  `ItemValue`       double      NOT NULL DEFAULT 0,
  `DirectSRNConfNo` varchar(15) NOT NULL DEFAULT '',
  `GRNQty`          double      NOT NULL DEFAULT 0,
  PRIMARY KEY (`LocCode`,`SRNNo`,`ItemCode`),
  KEY `idx_srn_item` (`ItemCode`),
  KEY `idx_srn_unit` (`UnitID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_srnheader` (
  `LocCode`     char(10)    NOT NULL,
  `SRNNO`       varchar(15) NOT NULL,
  `SRNDate`     datetime    NOT NULL DEFAULT '1900-01-01 00:00:00',
  `SupID`       char(10)    NOT NULL DEFAULT '',
  `SupInvNo`    varchar(20) NOT NULL DEFAULT '',
  `NetTotal`    double      NOT NULL DEFAULT 0,
  `UserID`      char(10)    NOT NULL DEFAULT '',
  `Remarks`     varchar(400) NOT NULL DEFAULT '',
  `TxnDate`     datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `SysSerialNo` double      NOT NULL DEFAULT 0,
  `Confirmed`   char(1)     NOT NULL DEFAULT 'N',
  `ConUserID`   char(10)    NOT NULL DEFAULT '',
  `ConDatetime` datetime    NOT NULL DEFAULT '1900-01-01 00:00:00',
  `SRNTYPE`     char(2)     NOT NULL DEFAULT 'SR',
  PRIMARY KEY (`LocCode`,`SRNNO`),
  KEY `idx_srn_sup` (`SupID`),
  KEY `idx_srn_date` (`SRNDate`),
  KEY `idx_srn_conf` (`Confirmed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recon
CREATE TABLE `tbl_reconcildetails` (
  `LocCode`      char(10)    NOT NULL,
  `RecNo`        char(10)    NOT NULL,
  `ItemCode`     varchar(15) NOT NULL,
  `UnitId`       char(10)    NOT NULL,
  `CostPrice`    double      NOT NULL DEFAULT 0,
  `SysQty`       double      NOT NULL DEFAULT 0,
  `RecQty`       double      NOT NULL DEFAULT 0,
  `RecItemValue` double      NOT NULL DEFAULT 0,
  `RecConfNo`    char(10)    NOT NULL DEFAULT '',
  PRIMARY KEY (`LocCode`,`RecNo`,`ItemCode`),
  KEY `idx_rec_item` (`ItemCode`),
  KEY `idx_rec_unit` (`UnitId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_reconcilheder` (
  `LocCode`      char(10)    NOT NULL,
  `RecNo`        char(10)    NOT NULL,
  `RecDate`      datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `TxnDateTime`  datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `UserId`       char(10)    NOT NULL DEFAULT '',
  `Remarks`      varchar(400) NOT NULL DEFAULT '',
  `NetValue`     double      NOT NULL DEFAULT 0,
  `SysSerialNo`  double      NOT NULL DEFAULT 0,
  `Confirmed`    char(1)     NOT NULL DEFAULT 'N',
  `ConDatetime`  datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ConUserID`    char(10)    NOT NULL DEFAULT '',
  PRIMARY KEY (`LocCode`,`RecNo`),
  KEY `idx_rec_hdr_date` (`RecDate`),
  KEY `idx_rec_hdr_conf` (`Confirmed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS — MySQL port of dbo.Vw_* (mapped to MySQL table names)
-- Tbl_RowItems → tbl_itemmaster (ItemDes), Tbl_SupplierDetails → tbl_suppliermaster,
-- Tbl_Unit → tbl_unitmaster, Tbl_UserDetails → tbl_userdetails
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS `Vw_SRNDetails`;
DROP VIEW IF EXISTS `Vw_SRNSummery`;
DROP VIEW IF EXISTS `Vw_DamageDetails`;
DROP VIEW IF EXISTS `Vw_DamageHeder`;
DROP VIEW IF EXISTS `Vw_DamageSummery`;
DROP VIEW IF EXISTS `Vw_Reconcilliation`;

CREATE VIEW `Vw_SRNDetails` AS
SELECT
  d.`LocCode`,
  lm.`LocDes`,
  d.`SRNNo`,
  d.`ItemCode`,
  COALESCE(im.`ItemDes`, d.`ItemCode`) AS `RowItmDes`,
  d.`UnitID`,
  COALESCE(um.`UnitDes`, d.`UnitID`)    AS `UnitDes`,
  d.`CostPrice`,
  d.`SRNQty`,
  d.`ItemValue`,
  d.`DirectSRNConfNo`,
  h.`SRNDate`,
  h.`SupID`,
  COALESCE(s.`SupName`, h.`SupID`) AS `SupName`,
  h.`SupInvNo`,
  h.`NetTotal`,
  h.`UserID`,
  COALESCE(u.`UserName`, h.`UserID`) AS `UserName`,
  h.`Remarks`,
  h.`TxnDate`,
  h.`SysSerialNo`,
  h.`Confirmed`,
  h.`ConUserID`,
  COALESCE(cu.`UserName`, h.`ConUserID`) AS `CONFIRMEDUSER`,
  h.`ConDatetime`,
  h.`SRNTYPE`,
  d.`GRNQty`
FROM `tbl_srndetails` d
JOIN `tbl_srnheader` h ON h.`LocCode`=d.`LocCode` AND h.`SRNNO`=d.`SRNNo`
LEFT JOIN `tbl_itemmaster` im ON im.`LocCode`=d.`LocCode` AND im.`ItemCode`=d.`ItemCode`
LEFT JOIN `tbl_unitmaster` um ON um.`MasterUnitID`=d.`UnitID`
LEFT JOIN `tbl_suppliermaster` s ON s.`SupID`=h.`SupID`
LEFT JOIN `tbl_userdetails` u ON u.`UserId`=h.`UserID`
LEFT JOIN `tbl_userdetails` cu ON cu.`UserId`=h.`ConUserID`
LEFT JOIN `tbl_locationmaster` lm ON lm.`LocCode`=d.`LocCode`;

CREATE VIEW `Vw_SRNSummery` AS
SELECT
  h.`LocCode`, lm.`LocDes`, h.`SRNNO`, h.`SRNDate`, h.`SupID`,
  COALESCE(s.`SupName`, h.`SupID`) AS `SupName`,
  h.`SupInvNo`, h.`NetTotal`, h.`UserID`,
  COALESCE(u.`UserName`, h.`UserID`) AS `UserName`,
  h.`Remarks`, h.`TxnDate`, h.`SysSerialNo`, h.`Confirmed`,
  h.`ConUserID`, h.`ConDatetime`, h.`SRNTYPE`
FROM `tbl_srnheader` h
LEFT JOIN `tbl_locationmaster` lm ON lm.`LocCode`=h.`LocCode`
LEFT JOIN `tbl_suppliermaster` s ON s.`SupID`=h.`SupID`
LEFT JOIN `tbl_userdetails` u ON u.`UserId`=h.`UserID`;

CREATE VIEW `Vw_DamageDetails` AS
SELECT
  d.`LocCode`, lm.`LocDes`, d.`DamNo`, d.`ItemCode`, d.`UnitId`,
  COALESCE(um.`UnitDes`, d.`UnitId`) AS `UnitDes`,
  d.`CostPrice`, d.`DmgQty`, d.`ItemValue`, d.`DmgConfNo`,
  hd.`NetTotal`, hd.`Remarks`, hd.`TxnDate`, hd.`TxndateTime`,
  hd.`SysSerialNo`, hd.`Confirmed`, hd.`UserId`,
  COALESCE(u.`UserName`, hd.`UserId`) AS `UserName`,
  COALESCE(im.`ItemDes`, d.`ItemCode`) AS `RowItmDes`
FROM `tbl_damagedetails` d
JOIN `tbl_damageheder` hd ON hd.`LocCode`=d.`LocCode` AND hd.`DamNo`=d.`DamNo`
LEFT JOIN `tbl_unitmaster` um ON um.`MasterUnitID`=d.`UnitId`
LEFT JOIN `tbl_itemmaster` im ON im.`LocCode`=d.`LocCode` AND im.`ItemCode`=d.`ItemCode`
LEFT JOIN `tbl_locationmaster` lm ON lm.`LocCode`=d.`LocCode`
LEFT JOIN `tbl_userdetails` u ON u.`UserId`=hd.`UserId`;

CREATE VIEW `Vw_DamageHeder` AS
SELECT hd.`LocCode`, lm.`LocDes`, hd.`DamNo`, hd.`NetTotal`, hd.`UserId`,
       COALESCE(u.`UserName`, hd.`UserId`) AS `UserName`,
       hd.`Remarks`, hd.`TxnDate`, hd.`TxndateTime`, hd.`SysSerialNo`,
       hd.`Confirmed`, hd.`ConUserID`, hd.`ConDatetime`
FROM `tbl_damageheder` hd
LEFT JOIN `tbl_userdetails` u ON u.`UserId`=hd.`UserId`
LEFT JOIN `tbl_locationmaster` lm ON lm.`LocCode`=hd.`LocCode`;

CREATE VIEW `Vw_DamageSummery` AS
SELECT hd.`LocCode`, lm.`LocDes`, hd.`DamNo`, hd.`NetTotal`, hd.`UserId`,
       COALESCE(u.`UserName`, hd.`UserId`) AS `UserName`,
       hd.`Remarks`, hd.`TxnDate`, hd.`TxndateTime`, hd.`SysSerialNo`,
       hd.`Confirmed`, hd.`ConUserID`, hd.`ConDatetime`
FROM `tbl_damageheder` hd
LEFT JOIN `tbl_userdetails` u ON u.`UserId`=hd.`UserId`
LEFT JOIN `tbl_locationmaster` lm ON lm.`LocCode`=hd.`LocCode`;

CREATE VIEW `Vw_Reconcilliation` AS
SELECT
  rd.`LocCode`, rd.`RecNo`, rd.`ItemCode`, rd.`UnitId`, rd.`CostPrice`,
  rd.`SysQty`, rd.`RecQty`, rd.`RecItemValue`, rd.`RecConfNo`,
  rh.`RecDate`, rh.`TxnDateTime`, rh.`UserId`, rh.`Remarks`, rh.`NetValue`,
  rh.`SysSerialNo`, rh.`Confirmed`, rh.`ConDatetime`, rh.`ConUserID`,
  COALESCE(um.`UnitDes`, rd.`UnitId`) AS `UnitDes`,
  COALESCE(im.`ItemDes`, rd.`ItemCode`) AS `RowItmDes`,
  lm.`LocDes`,
  COALESCE(u2.`UserName`, rh.`UserId`) AS `UserName`
FROM `tbl_reconcildetails` rd
JOIN `tbl_reconcilheder` rh ON rh.`LocCode`=rd.`LocCode` AND rh.`RecNo`=rd.`RecNo`
LEFT JOIN `tbl_unitmaster` um ON um.`MasterUnitID`=rd.`UnitId`
LEFT JOIN `tbl_itemmaster` im ON im.`LocCode`=rd.`LocCode` AND im.`ItemCode`=rd.`ItemCode`
LEFT JOIN `tbl_locationmaster` lm ON lm.`LocCode`=rd.`LocCode`
LEFT JOIN `tbl_userdetails` u2 ON u2.`UserId`=rh.`UserId`
LEFT JOIN `tbl_userdetails` cu ON cu.`UserId`=rh.`ConUserID`;

-- optional: ensure serials for the 3 notes exist
INSERT IGNORE INTO `tbl_serials` (`SeriCode`,`SeriNo`,`SeriDate`) VALUES ('SRN','0000000',NULL), ('DMG','0000000',NULL), ('REC','0000000',NULL);
