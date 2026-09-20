-- Original MSSQL DDL for SRN / Damage / Recon + Views
-- Keep as-is for legacy MSSQL server reference. Run on MSSQL only.

if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_DamageDetails]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_DamageDetails]
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_DamageHeder]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_DamageHeder]
GO
CREATE TABLE [dbo].[Tbl_DamageDetails] (
	[LocCode] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[DamNo] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ItemCode] [char] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[UnitId] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[CostPrice] [float] NOT NULL ,
	[DmgQty] [float] NOT NULL ,
	[ItemValue] [float] NOT NULL ,
	[DmgConfNo] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL 
) ON [PRIMARY]
GO
CREATE TABLE [dbo].[Tbl_DamageHeder] (
	[LocCode] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[DamNo] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[NetTotal] [float] NOT NULL ,
	[UserId] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[Remarks] [varchar] (400) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[TxnDate] [datetime] NOT NULL ,
	[TxndateTime] [datetime] NOT NULL ,
	[SysSerialNo] [float] NOT NULL ,
	[Confirmed] [char] (1) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ConUserID] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ConDatetime] [datetime] NOT NULL 
) ON [PRIMARY]
GO

if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_SRNDetails]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_SRNDetails]
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_SRNHeader]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_SRNHeader]
GO
CREATE TABLE [dbo].[Tbl_SRNDetails] (
	[LocCode] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[SRNNo] [varchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ItemCode] [char] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[UnitID] [char] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[CostPrice] [float] NOT NULL ,
	[SRNQty] [float] NOT NULL ,
	[ItemValue] [float] NOT NULL ,
	[DirectSRNConfNo] [varchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[GRNQty] [float] NOT NULL 
) ON [PRIMARY]
GO
CREATE TABLE [dbo].[Tbl_SRNHeader] (
	[LocCode] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[SRNNO] [varchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[SRNDate] [datetime] NOT NULL ,
	[SupID] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[SupInvNo] [varchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[NetTotal] [float] NOT NULL ,
	[UserID] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[Remarks] [varchar] (400) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[TxnDate] [datetime] NOT NULL ,
	[SysSerialNo] [float] NOT NULL ,
	[Confirmed] [char] (1) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ConUserID] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ConDatetime] [datetime] NOT NULL ,
	[SRNTYPE] [char] (2) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL 
) ON [PRIMARY]
GO

if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_ReconcilDetails]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_ReconcilDetails]
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_ReconcilHeder]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_ReconcilHeder]
GO
CREATE TABLE [dbo].[Tbl_ReconcilDetails] (
	[LocCode] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[RecNo] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ItemCode] [varchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[UnitId] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[CostPrice] [float] NOT NULL ,
	[SysQty] [float] NOT NULL ,
	[RecQty] [float] NOT NULL ,
	[RecItemValue] [float] NOT NULL ,
	[RecConfNo] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL 
) ON [PRIMARY]
GO
CREATE TABLE [dbo].[Tbl_ReconcilHeder] (
	[LocCode] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[RecNo] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[RecDate] [datetime] NOT NULL ,
	[TxnDateTime] [datetime] NOT NULL ,
	[UserId] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[Remarks] [varchar] (400) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[NetValue] [float] NOT NULL ,
	[SysSerialNo] [float] NOT NULL ,
	[Confirmed] [char] (1) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[ConDatetime] [datetime] NOT NULL ,
	[ConUserID] [char] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL 
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[Tbl_ReconcilHeder] WITH NOCHECK ADD 
	CONSTRAINT [DF_Tbl_ReconcilHeder_TxnDateTime] DEFAULT (getdate()) FOR [TxnDateTime],
	CONSTRAINT [DF_Tbl_ReconcilHeder_ConDatetime] DEFAULT (getdate()) FOR [ConDatetime]
GO

if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Vw_SRNDetails]') and OBJECTPROPERTY(id, N'IsView') = 1)
drop view [dbo].[Vw_SRNDetails]
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Vw_SRNSummery]') and OBJECTPROPERTY(id, N'IsView') = 1)
drop view [dbo].[Vw_SRNSummery]
GO
SET QUOTED_IDENTIFIER ON 
GO
SET ANSI_NULLS ON 
GO
CREATE VIEW dbo.Vw_SRNDetails
AS
SELECT     dbo.Tbl_SRNDetails.LocCode, dbo.Tbl_LocationMaster.LocDes, dbo.Tbl_SRNDetails.SRNNo, dbo.Tbl_SRNDetails.ItemCode, 
                      dbo.Tbl_RowItems.RowItmDes, dbo.Tbl_SRNDetails.UnitID, dbo.Tbl_Unit.UnitDes, dbo.Tbl_SRNDetails.CostPrice, dbo.Tbl_SRNDetails.SRNQty, 
                      dbo.Tbl_SRNDetails.ItemValue, dbo.Tbl_SRNDetails.DirectSRNConfNo, dbo.Tbl_SRNHeader.SRNDate, dbo.Tbl_SRNHeader.SupID, 
                      dbo.Tbl_SupplierDetails.SupName, dbo.Tbl_SRNHeader.SupInvNo, dbo.Tbl_SRNHeader.NetTotal, dbo.Tbl_SRNHeader.UserID, 
                      Tbl_UserDetails_1.UserName, dbo.Tbl_SRNHeader.Remarks, dbo.Tbl_SRNHeader.TxnDate, dbo.Tbl_SRNHeader.SysSerialNo, 
                      dbo.Tbl_SRNHeader.Confirmed, dbo.Tbl_SRNHeader.ConUserID, Tbl_UserDetails_1.UserName AS CONFIRMEDUSER, 
                      dbo.Tbl_SRNHeader.ConDatetime, dbo.Tbl_SRNHeader.SRNTYPE, dbo.Tbl_SRNDetails.GRNQty
FROM         dbo.Tbl_SRNDetails INNER JOIN
                      dbo.Tbl_SRNHeader ON dbo.Tbl_SRNDetails.LocCode = dbo.Tbl_SRNHeader.LocCode AND 
                      dbo.Tbl_SRNDetails.SRNNo = dbo.Tbl_SRNHeader.SRNNO LEFT OUTER JOIN
                      dbo.Tbl_RowItems ON dbo.Tbl_SRNDetails.LocCode = dbo.Tbl_RowItems.LocCode AND 
                      dbo.Tbl_SRNDetails.ItemCode = dbo.Tbl_RowItems.RowItemCode LEFT OUTER JOIN
                      dbo.Tbl_UserDetails Tbl_UserDetails_1 ON dbo.Tbl_SRNHeader.ConUserID = Tbl_UserDetails_1.UserId LEFT OUTER JOIN
                      dbo.Tbl_UserDetails Tbl_UserDetails_2 ON dbo.Tbl_SRNHeader.UserID = Tbl_UserDetails_2.UserId LEFT OUTER JOIN
                      dbo.Tbl_SupplierDetails ON dbo.Tbl_SRNHeader.SupID = dbo.Tbl_SupplierDetails.SupID LEFT OUTER JOIN
                      dbo.Tbl_Unit ON dbo.Tbl_SRNDetails.UnitID = dbo.Tbl_Unit.UnitID LEFT OUTER JOIN
                      dbo.Tbl_LocationMaster ON dbo.Tbl_SRNDetails.LocCode = dbo.Tbl_LocationMaster.LocCode
GO
SET QUOTED_IDENTIFIER OFF 
GO
SET ANSI_NULLS ON 
GO
SET QUOTED_IDENTIFIER ON 
GO
SET ANSI_NULLS ON 
GO
CREATE VIEW dbo.Vw_SRNSummery
AS
SELECT     dbo.Tbl_SRNHeader.LocCode, dbo.Tbl_LocationMaster.LocDes, dbo.Tbl_SRNHeader.SRNNO, dbo.Tbl_SRNHeader.SRNDate, 
                      dbo.Tbl_SRNHeader.SupID, dbo.Tbl_SupplierDetails.SupName, dbo.Tbl_SRNHeader.SupInvNo, dbo.Tbl_SRNHeader.NetTotal, 
                      dbo.Tbl_SRNHeader.UserID, dbo.Tbl_UserDetails.UserName, dbo.Tbl_SRNHeader.Remarks, dbo.Tbl_SRNHeader.TxnDate, 
                      dbo.Tbl_SRNHeader.SysSerialNo, dbo.Tbl_SRNHeader.Confirmed, dbo.Tbl_SRNHeader.ConUserID, dbo.Tbl_SRNHeader.ConDatetime, 
                      dbo.Tbl_SRNHeader.SRNTYPE
FROM         dbo.Tbl_SRNHeader LEFT OUTER JOIN
                      dbo.Tbl_LocationMaster ON dbo.Tbl_SRNHeader.LocCode = dbo.Tbl_LocationMaster.LocCode LEFT OUTER JOIN
                      dbo.Tbl_SupplierDetails ON dbo.Tbl_SRNHeader.SupID = dbo.Tbl_SupplierDetails.SupID LEFT OUTER JOIN
                      dbo.Tbl_UserDetails ON dbo.Tbl_SRNHeader.UserID = dbo.Tbl_UserDetails.UserId
GO
SET QUOTED_IDENTIFIER OFF 
GO
SET ANSI_NULLS ON 
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Vw_DamageDetails]') and OBJECTPROPERTY(id, N'IsView') = 1)
drop view [dbo].[Vw_DamageDetails]
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Vw_DamageHeder]') and OBJECTPROPERTY(id, N'IsView') = 1)
drop view [dbo].[Vw_DamageHeder]
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Vw_DamageSummery]') and OBJECTPROPERTY(id, N'IsView') = 1)
drop view [dbo].[Vw_DamageSummery]
GO
SET QUOTED_IDENTIFIER ON 
GO
SET ANSI_NULLS ON 
GO
CREATE VIEW dbo.Vw_DamageDetails
AS
SELECT     dbo.Tbl_DamageDetails.LocCode, dbo.Tbl_LocationMaster.LocDes, dbo.Tbl_DamageDetails.DamNo, dbo.Tbl_DamageDetails.ItemCode, 
                      dbo.Tbl_DamageDetails.UnitId, dbo.Tbl_Unit.UnitDes, dbo.Tbl_DamageDetails.CostPrice, dbo.Tbl_DamageDetails.DmgQty, 
                      dbo.Tbl_DamageDetails.ItemValue, dbo.Tbl_DamageDetails.DmgConfNo, dbo.Tbl_DamageHeder.NetTotal, dbo.Tbl_DamageHeder.Remarks, 
                      dbo.Tbl_DamageHeder.TxnDate, dbo.Tbl_DamageHeder.TxndateTime, dbo.Tbl_DamageHeder.SysSerialNo, dbo.Tbl_DamageHeder.Confirmed, 
                      dbo.Tbl_DamageHeder.UserId, dbo.Tbl_UserDetails.UserName, dbo.Tbl_RowItems.RowItmDes
FROM         dbo.Tbl_UserDetails RIGHT OUTER JOIN
                      dbo.Tbl_DamageHeder ON dbo.Tbl_UserDetails.UserId = dbo.Tbl_DamageHeder.UserId RIGHT OUTER JOIN
                      dbo.Tbl_Unit INNER JOIN
                      dbo.Tbl_DamageDetails ON dbo.Tbl_Unit.UnitID = dbo.Tbl_DamageDetails.UnitId ON 
                      dbo.Tbl_DamageHeder.LocCode = dbo.Tbl_DamageDetails.LocCode AND 
                      dbo.Tbl_DamageHeder.DamNo = dbo.Tbl_DamageDetails.DamNo LEFT OUTER JOIN
                      dbo.Tbl_RowItems ON dbo.Tbl_DamageDetails.LocCode = dbo.Tbl_RowItems.LocCode AND 
                      dbo.Tbl_DamageDetails.ItemCode = dbo.Tbl_RowItems.RowItemCode LEFT OUTER JOIN
                      dbo.Tbl_LocationMaster ON dbo.Tbl_DamageDetails.LocCode = dbo.Tbl_LocationMaster.LocCode
GO
SET QUOTED_IDENTIFIER OFF 
GO
SET ANSI_NULLS ON 
GO
SET QUOTED_IDENTIFIER ON 
GO
SET ANSI_NULLS ON 
GO
CREATE VIEW dbo.Vw_DamageHeder
AS
SELECT     dbo.Tbl_DamageHeder.LocCode, dbo.Tbl_LocationMaster.LocDes, dbo.Tbl_DamageHeder.DamNo, dbo.Tbl_DamageHeder.NetTotal, 
                      dbo.Tbl_DamageHeder.UserId, dbo.Tbl_UserDetails.UserName, dbo.Tbl_DamageHeder.Remarks, dbo.Tbl_DamageHeder.TxnDate, 
                      dbo.Tbl_DamageHeder.TxndateTime, dbo.Tbl_DamageHeder.SysSerialNo, dbo.Tbl_DamageHeder.Confirmed, dbo.Tbl_DamageHeder.ConUserID, 
                      dbo.Tbl_DamageHeder.ConDatetime
FROM         dbo.Tbl_DamageHeder LEFT OUTER JOIN
                      dbo.Tbl_UserDetails ON dbo.Tbl_DamageHeder.UserId = dbo.Tbl_UserDetails.UserId LEFT OUTER JOIN
                      dbo.Tbl_LocationMaster ON dbo.Tbl_DamageHeder.LocCode = dbo.Tbl_LocationMaster.LocCode
GO
SET QUOTED_IDENTIFIER OFF 
GO
SET ANSI_NULLS ON 
GO
SET QUOTED_IDENTIFIER ON 
GO
SET ANSI_NULLS ON 
GO
CREATE VIEW dbo.Vw_DamageSummery
AS
SELECT     dbo.Tbl_DamageHeder.LocCode, dbo.Tbl_LocationMaster.LocDes, dbo.Tbl_DamageHeder.DamNo, dbo.Tbl_DamageHeder.NetTotal, 
                      dbo.Tbl_DamageHeder.UserId, dbo.Tbl_UserDetails.UserName, dbo.Tbl_DamageHeder.Remarks, dbo.Tbl_DamageHeder.TxnDate, 
                      dbo.Tbl_DamageHeder.TxndateTime, dbo.Tbl_DamageHeder.SysSerialNo, dbo.Tbl_DamageHeder.Confirmed, dbo.Tbl_DamageHeder.ConUserID, 
                      dbo.Tbl_DamageHeder.ConDatetime
FROM         dbo.Tbl_DamageHeder LEFT OUTER JOIN
                      dbo.Tbl_UserDetails ON dbo.Tbl_DamageHeder.UserId = dbo.Tbl_UserDetails.UserId LEFT OUTER JOIN
                      dbo.Tbl_LocationMaster ON dbo.Tbl_DamageHeder.LocCode = dbo.Tbl_LocationMaster.LocCode
GO
SET QUOTED_IDENTIFIER OFF 
GO
SET ANSI_NULLS ON 
GO
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Vw_Reconcilliation]') and OBJECTPROPERTY(id, N'IsView') = 1)
drop view [dbo].[Vw_Reconcilliation]
GO
SET QUOTED_IDENTIFIER ON 
GO
SET ANSI_NULLS ON 
GO
CREATE VIEW dbo.Vw_Reconcilliation
AS
SELECT     dbo.Tbl_ReconcilDetails.LocCode, dbo.Tbl_ReconcilDetails.RecNo, dbo.Tbl_ReconcilDetails.ItemCode, dbo.Tbl_ReconcilDetails.UnitId, 
                      dbo.Tbl_ReconcilDetails.CostPrice, dbo.Tbl_ReconcilDetails.SysQty, dbo.Tbl_ReconcilDetails.RecQty, dbo.Tbl_ReconcilDetails.RecItemValue, 
                      dbo.Tbl_ReconcilDetails.RecConfNo, dbo.Tbl_ReconcilHeder.RecDate, dbo.Tbl_ReconcilHeder.TxnDateTime, dbo.Tbl_ReconcilHeder.UserId, 
                      dbo.Tbl_ReconcilHeder.Remarks, dbo.Tbl_ReconcilHeder.NetValue, dbo.Tbl_ReconcilHeder.SysSerialNo, dbo.Tbl_ReconcilHeder.Confirmed, 
                      dbo.Tbl_ReconcilHeder.ConDatetime, dbo.Tbl_ReconcilHeder.ConUserID, dbo.Tbl_Unit.UnitDes, dbo.Tbl_RowItems.RowItmDes, 
                      dbo.Tbl_LocationMaster.LocDes, Tbl_UserDetails_2.UserName
FROM         dbo.Tbl_ReconcilDetails INNER JOIN
                      dbo.Tbl_ReconcilHeder ON dbo.Tbl_ReconcilDetails.LocCode = dbo.Tbl_ReconcilHeder.LocCode AND 
                      dbo.Tbl_ReconcilDetails.RecNo = dbo.Tbl_ReconcilHeder.RecNo INNER JOIN
                      dbo.Tbl_Unit ON dbo.Tbl_ReconcilDetails.UnitId = dbo.Tbl_Unit.UnitID INNER JOIN
                      dbo.Tbl_RowItems ON dbo.Tbl_ReconcilDetails.ItemCode = dbo.Tbl_RowItems.RowItemCode AND 
                      dbo.Tbl_ReconcilDetails.LocCode = dbo.Tbl_RowItems.LocCode INNER JOIN
                      dbo.Tbl_UserDetails Tbl_UserDetails_3 ON dbo.Tbl_ReconcilHeder.UserId = Tbl_UserDetails_3.UserId LEFT OUTER JOIN
                      dbo.Tbl_LocationMaster ON dbo.Tbl_ReconcilDetails.LocCode = dbo.Tbl_LocationMaster.LocCode LEFT OUTER JOIN
                      dbo.Tbl_UserDetails Tbl_UserDetails_1 ON dbo.Tbl_ReconcilHeder.ConUserID = Tbl_UserDetails_1.UserId LEFT OUTER JOIN
                      dbo.Tbl_UserDetails Tbl_UserDetails_2 ON dbo.Tbl_ReconcilHeder.UserId = Tbl_UserDetails_2.UserId
GO
SET QUOTED_IDENTIFIER OFF 
GO
SET ANSI_NULLS ON 
GO
