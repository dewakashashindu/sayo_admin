-- Original MSSQL view (for the legacy server). Keep as reference.
-- Run on MSSQL only.

IF OBJECT_ID('dbo.Vw_PaymentModes', 'V') IS NOT NULL
    DROP VIEW dbo.Vw_PaymentModes;
GO

CREATE VIEW dbo.Vw_PaymentModes AS
SELECT
    m.PayCode,
    m.PayDes,
    m.ZeroVal,
    m.Cash,
    m.CreditCard,
    m.CREDIT,
    m.RmksNeed,
    m.Enable,
    m.Other,
    m.AdvPay,
    m.COMPLEMENTRY,
    m.DoNotShowInSales,
    m.OneOff,
    m.ADDDIDUCTTOSALES,
    m.Voucher,
    m.PayGroupID,
    g.PayGroup
FROM dbo.Tbl_PaymentModes m
LEFT JOIN dbo.Tbl_PaymentGroup g
    ON m.PayGroupID = g.PaygroupID;
GO
