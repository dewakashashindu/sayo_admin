-- MySQL port of the salon's MSSQL view:
--   CREATE VIEW dbo.Vw_PaymentModes AS
--   SELECT PayCode,PayDes,ZeroVal,Cash,CreditCard,CREDIT,RmksNeed,Enable,Other,AdvPay,
--          COMPLEMENTRY,DoNotShowInSales,OneOff,ADDDIDUCTTOSALES,Voucher,PayGroupID,PayGroup
--   FROM Tbl_PaymentModes LEFT JOIN Tbl_PaymentGroup
--        ON Tbl_PaymentModes.PayGroupID = Tbl_PaymentGroup.PaygroupID
--
-- Run this after Tbl_PaymentModes and Tbl_PaymentGroup exist.
-- Safe to re-run: DROP VIEW IF EXISTS.

DROP VIEW IF EXISTS `Vw_PaymentModes`;

CREATE VIEW `Vw_PaymentModes` AS
SELECT
  m.`PayCode`          AS `PayCode`,
  m.`PayDes`           AS `PayDes`,
  m.`ZeroVal`          AS `ZeroVal`,
  m.`Cash`             AS `Cash`,
  m.`CreditCard`       AS `CreditCard`,
  m.`CREDIT`           AS `CREDIT`,
  m.`RmksNeed`         AS `RmksNeed`,
  m.`Enable`           AS `Enable`,
  m.`Other`            AS `Other`,
  m.`AdvPay`           AS `AdvPay`,
  m.`COMPLEMENTRY`     AS `COMPLEMENTRY`,
  m.`DoNotShowInSales` AS `DoNotShowInSales`,
  m.`OneOff`           AS `OneOff`,
  m.`ADDDIDUCTTOSALES` AS `ADDDIDUCTTOSALES`,
  m.`Voucher`          AS `Voucher`,
  m.`PayGroupID`       AS `PayGroupID`,
  g.`PayGroup`         AS `PayGroup`
FROM `Tbl_PaymentModes` m
LEFT JOIN `Tbl_PaymentGroup` g
  ON m.`PayGroupID` = g.`PaygroupID`;
