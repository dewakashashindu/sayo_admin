-- Original SQL Server script you sent — kept as-is for MSSQL / legacy server
if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[Tbl_TxnMovement]') and OBJECTPROPERTY(id, N'IsUserTable') = 1)
drop table [dbo].[Tbl_TxnMovement]
GO
CREATE TABLE [dbo].[Tbl_TxnMovement] (
	[LocCode] [char] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[RowItemCode] [varchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[TxnNo] [varchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[TxnType] [varchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[TxnDate] [datetime] NOT NULL ,
	[TxndateTime] [datetime] NOT NULL ,
	[PreQty] [float] NOT NULL ,
	[TxnQty] [float] NOT NULL ,
	[LastQty] [float] NOT NULL ,
	[UserId] [varchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[SysSerialId] [float] NOT NULL ,
	[Remarks] [varchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[AddDeduct] [char] (1) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL ,
	[TXNDATETIMEMANUAL] [datetime] NOT NULL ,
	[SourceItemCode] [varchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL 
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[Tbl_TxnMovement] WITH NOCHECK ADD 
	CONSTRAINT [DF_Tbl_TxnMovement_TxnDate] DEFAULT (getdate()) FOR [TxnDate],
	CONSTRAINT [DF_Tbl_TxnMovement_TxndateTime] DEFAULT (getdate()) FOR [TxndateTime],
	CONSTRAINT [DF_Tbl_TxnMovement_SourceItemCode] DEFAULT (0) FOR [SourceItemCode]
GO
