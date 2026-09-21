-- scripts/create-Vw_Transfer-mysql.sql
-- MySQL port of dbo.Vw_TransferNoteDetail / Vw_TransferReqDetail / Vw_TransferReturnDetail
-- Converted from SQL Server (QUOTED_IDENTIFIER, ANSI_NULLS, RIGHT OUTER JOIN) to MySQL InnoDB.
-- Drop first (MySQL views: DROP VIEW IF EXISTS). Keep names exactly as legacy code expects:
--   Vw_TransferNoteDetail, Vw_TransferReqDetail, Vw_TransferReturnDetail
--   (MySQL lower_case_table_names=1 makes Vw_* = vw_* = VW_*)
-- Run after scripts/create-Tbl_Transfer-mysql.sql
--   mysql -h <host> -u <user> -p <db> < scripts/create-Vw_Transfer-mysql.sql

DROP VIEW IF EXISTS `Vw_TransferNoteDetail`;
DROP VIEW IF EXISTS `Vw_TransferReqDetail`;
DROP VIEW IF EXISTS `Vw_TransferReturnDetail`;

-- ───────────────────────────────────────────────────────────────
-- Vw_TransferNoteDetail
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `Vw_TransferNoteDetail` AS
SELECT
  d.`FromLocCode`  AS FromLocCode,
  lm.`LocDes`      AS LocDes,
  d.`ToLoc`        AS ToLoc,
  lm2.`LocDes`     AS ToLocDes,
  d.`TranNo`       AS TranNo,
  d.`ItemCode`     AS ItemCode,
  ri.`ItemDes`     AS RowItmDes,
  d.`UnitID`       AS UnitID,
  u.`UnitDes`      AS UnitDes,
  d.`CostPrice`    AS CostPrice,
  d.`TRQTy`        AS TRQTy,
  d.`TranQty`      AS TranQty,
  d.`ItemValue`    AS ItemValue,
  d.`TranConfNo`   AS TranConfNo,
  d.`NewItem`      AS NewItem,
  h.`TraDate`      AS TraDate,
  h.`NetTotal`     AS NetTotal,
  h.`UserID`       AS UserID,
  ud.`UserName`    AS UserName,
  h.`Remarks`      AS Remarks,
  h.`TxnDate`      AS TxnDate,
  h.`Confirmed`    AS Confirmed,
  h.`TReqNO`       AS TReqNO,
  h.`ConDatetime`  AS ConDatetime,
  h.`SysSerialNo`  AS SysSerialNo,
  h.`TakenForTransferRtn` AS TakenForTransferRtn,
  d.`TranRtnQTY`   AS TranRtnQTY
FROM `tbl_transfernotedetail` d
LEFT JOIN `tbl_transfernoteheader` h
  ON h.`TranNo` = d.`TranNo` AND h.`FromLocCode` = d.`FromLocCode` AND h.`ToLoc` = d.`ToLoc`
LEFT JOIN `tbl_locationmaster` lm   ON lm.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_locationmaster` lm2  ON lm2.`LocCode` = d.`ToLoc`
LEFT JOIN `tbl_unitmaster` u         ON u.`MasterUnitID` = d.`UnitID`
LEFT JOIN `tbl_itemmaster` ri        ON ri.`ItemCode` = d.`ItemCode` AND ri.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_userdetails` ud       ON ud.`UserId` = h.`UserID`;

-- ───────────────────────────────────────────────────────────────
-- Vw_TransferReqDetail
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `Vw_TransferReqDetail` AS
SELECT
  d.`FromLocCode`  AS FromLocCode,
  lm2.`LocDes`     AS LocDes,
  d.`ToLoc`        AS ToLoc,
  lm1.`LocDes`     AS TOLOCDES,
  d.`TRNo`         AS TRNo,
  d.`ItemCode`     AS ItemCode,
  ri.`ItemDes`     AS RowItmDes,
  d.`UnitID`       AS UnitID,
  u.`UnitDes`      AS UnitDes,
  d.`CostPrice`    AS CostPrice,
  d.`TRQty`        AS TRQty,
  d.`ItemValue`    AS ItemValue,
  d.`TransferConfNo` AS TransferConfNo,
  d.`IssuedQTY`    AS IssuedQTY,
  h.`TRDate`       AS TRDate,
  h.`TRDueDate`    AS TRDueDate,
  h.`NetTotal`     AS NetTotal,
  h.`Remarks`      AS Remarks,
  h.`Confirmed`    AS Confirmed,
  h.`TakenForTransfer` AS TakenForTransfer,
  h.`UserID`       AS UserID,
  ud.`UserName`    AS UserName,
  h.`TxnDate`      AS TxnDate
FROM `tbl_transferreqdetail` d
LEFT JOIN `tbl_transferreqheder` h
  ON h.`TRNO` = d.`TRNo` AND h.`ToLoc` = d.`ToLoc` AND h.`FromLocCode` = d.`FromLocCode`
LEFT JOIN `tbl_locationmaster` lm1 ON lm1.`LocCode` = d.`ToLoc`
LEFT JOIN `tbl_locationmaster` lm2 ON lm2.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_unitmaster` u        ON u.`MasterUnitID` = d.`UnitID`
LEFT JOIN `tbl_itemmaster` ri       ON ri.`ItemCode` = d.`ItemCode` AND ri.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_userdetails` ud      ON ud.`UserId` = h.`UserID`;

-- ───────────────────────────────────────────────────────────────
-- Vw_TransferReturnDetail
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `Vw_TransferReturnDetail` AS
SELECT
  d.`FromLocCode`  AS FromLocCode,
  lm2.`LocDes`     AS LocDes,
  d.`ToLoc`        AS ToLoc,
  lm1.`LocDes`     AS ToLocDes,
  d.`TRtnNo`       AS TRtnNo,
  d.`ItemCode`     AS ItemCode,
  ri.`ItemDes`     AS RowItmDes,
  d.`UnitID`       AS UnitID,
  u.`UnitDes`      AS UnitDes,
  d.`CostPrice`    AS CostPrice,
  d.`TNQty`        AS TNQty,
  d.`TranRtnQty`   AS TranRtnQty,
  d.`ItemValue`    AS ItemValue,
  h.`TRtnDate`     AS TRtnDate,
  h.`NetTotal`     AS NetTotal,
  h.`UserID`       AS UserID,
  h.`Remarks`      AS Remarks,
  h.`TxnDate`      AS TxnDate,
  h.`SysSerialNo`  AS SysSerialNo,
  h.`ConUserID`    AS ConUserID,
  h.`Confirmed`    AS Confirmed,
  h.`ConDatetime`  AS ConDatetime,
  h.`TNNO`         AS TNNO,
  ud.`UserName`    AS UserName,
  d.`TranConfNo`   AS TranConfNo
FROM `tbl_transferreturndetail` d
LEFT JOIN `tbl_transferreturnheader` h
  ON h.`TRtnNo` = d.`TRtnNo` AND h.`ToLoc` = d.`ToLoc` AND h.`FromLocCode` = d.`FromLocCode`
LEFT JOIN `tbl_locationmaster` lm1 ON lm1.`LocCode` = d.`ToLoc`
LEFT JOIN `tbl_locationmaster` lm2 ON lm2.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_unitmaster` u        ON u.`MasterUnitID` = d.`UnitID`
LEFT JOIN `tbl_itemmaster` ri       ON ri.`ItemCode` = d.`ItemCode` AND ri.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_userdetails` ud      ON ud.`UserId` = h.`UserID`;
