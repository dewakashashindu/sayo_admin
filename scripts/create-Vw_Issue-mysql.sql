-- scripts/create-Vw_Issue-mysql.sql
-- MySQL port of dbo.Vw_IssueReqDetail / Vw_IssueNoteDetail
-- Converted from SQL Server (QUOTED_IDENTIFIER, ANSI_NULLS, RIGHT OUTER JOIN) to MySQL.
-- Tbl_RowItems -> tbl_itemmaster, Tbl_Unit -> tbl_unitmaster (same mapping as the
-- transfer views in scripts/create-Vw_Transfer-mysql.sql).
-- Run after scripts/create-Tbl_Issue-mysql.sql
--   mysql -h <host> -u <user> -p <db> < scripts/create-Vw_Issue-mysql.sql

DROP VIEW IF EXISTS `Vw_IssueNoteDetail`;
DROP VIEW IF EXISTS `Vw_IssueReqDetail`;

-- ───────────────────────────────────────────────────────────────
-- Vw_IssueReqDetail
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `Vw_IssueReqDetail` AS
SELECT
  h.`FromLocCode`    AS FromLocCode,
  lm2.`LocDes`       AS LocDes,
  h.`ToLoc`          AS ToLoc,
  lm1.`LocDes`       AS ToLocDes,
  d.`IRNo`           AS IRNO,
  d.`ItemCode`       AS ItemCode,
  ri.`ItemDes`       AS RowItmDes,
  d.`UnitID`         AS UnitID,
  u.`UnitDes`        AS UnitDes,
  d.`IRQty`          AS IRQty,
  d.`CostPrice`      AS CostPrice,
  d.`ItemValue`      AS ItemValue,
  d.`DirectPOConfNo` AS DirectPOConfNo,
  h.`IRDate`         AS IRDate,
  h.`IRDueDate`      AS IRDueDate,
  h.`NetTotal`       AS NetTotal,
  h.`Remarks`        AS Remarks,
  h.`TxnDate`        AS TxnDate,
  h.`SysSerialNo`    AS SysSerialNo,
  h.`Confirmed`      AS Confirmed,
  h.`TakenForIssue`  AS TakenForIssue,
  h.`UserID`         AS UserID,
  ud.`UserName`      AS UserName,
  d.`IssuedQTY`      AS IssuedQTY
FROM `tbl_issuereqdetail` d
LEFT JOIN `tbl_issuereqheder` h
  ON h.`IRNO` = d.`IRNo` AND h.`ToLoc` = d.`ToLoc` AND h.`FromLocCode` = d.`FromLocCode`
LEFT JOIN `tbl_locationmaster` lm1 ON lm1.`LocCode` = d.`ToLoc`
LEFT JOIN `tbl_locationmaster` lm2 ON lm2.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_unitmaster` u        ON u.`MasterUnitID` = d.`UnitID`
LEFT JOIN `tbl_itemmaster` ri       ON ri.`ItemCode` = d.`ItemCode` AND ri.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_userdetails` ud      ON ud.`UserId` = h.`UserID`;

-- ───────────────────────────────────────────────────────────────
-- Vw_IssueNoteDetail
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `Vw_IssueNoteDetail` AS
SELECT
  h.`FromLocCode`    AS FromLocCode,
  lm.`LocDes`        AS LocDes,
  h.`ToLoc`          AS ToLoc,
  lm2.`LocDes`       AS ToLocDes,
  h.`INNO`           AS INNO,
  h.`INDate`         AS INDate,
  d.`ItemCode`       AS ItemCode,
  ri.`ItemDes`       AS RowItmDes,
  d.`UnitID`         AS UnitID,
  u.`UnitDes`        AS UnitDes,
  d.`CostPrice`      AS CostPrice,
  d.`IRQty`          AS IRQty,
  d.`INQty`          AS INQty,
  d.`ItemValue`      AS ItemValue,
  d.`DirectPOConfNo` AS DirectPOConfNo,
  h.`NetTotal`       AS NetTotal,
  h.`UserID`         AS UserID,
  h.`Remarks`        AS Remarks,
  h.`TxnDate`        AS TxnDate,
  h.`SysSerialNo`    AS SysSerialNo,
  h.`ConUserID`      AS ConUserID,
  h.`Confirmed`      AS Confirmed,
  h.`ConDatetime`    AS ConDatetime,
  h.`IRNO`           AS IRNO,
  ud.`UserName`      AS UserName,
  d.`NewItem`        AS NewItem
FROM `tbl_issuenotedetail` d
LEFT JOIN `tbl_issuenoteheder` h
  ON h.`INNO` = d.`INNo` AND h.`ToLoc` = d.`ToLoc` AND h.`FromLocCode` = d.`FromLocCode`
LEFT JOIN `tbl_locationmaster` lm   ON lm.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_locationmaster` lm2  ON lm2.`LocCode` = d.`ToLoc`
LEFT JOIN `tbl_unitmaster` u         ON u.`MasterUnitID` = d.`UnitID`
LEFT JOIN `tbl_itemmaster` ri        ON ri.`ItemCode` = d.`ItemCode` AND ri.`LocCode` = d.`FromLocCode`
LEFT JOIN `tbl_userdetails` ud       ON ud.`UserId` = h.`UserID`;
