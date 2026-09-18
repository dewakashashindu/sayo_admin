-- ═══════════════════════════════════════════════════════════════════════════
--  Purchase Order + GRN tables for sayo_admin  (MySQL / MariaDB)
--  ---------------------------------------------------------------------------
--  The script handed over was written for SQL SERVER (dbo., [brackets], GO,
--  COLLATE SQL_Latin1_…, ON [PRIMARY]) — it will NOT run on this project's
--  MySQL database. This file is the same four tables converted for MySQL,
--  with the project's own rules applied:
--
--    • item code column is CHAR(15)   (src/lib/itemCode.ts — never 10/20/50)
--    • lower-case table names         (MySQL on Linux is case sensitive)
--    • NO "DROP TABLE" statements     (the original script drops the tables
--                                      first — that would delete live data)
--    • every NOT NULL column has a default, so an INSERT that forgets a
--      column cannot fail under MySQL strict mode
--    • every table has a real PRIMARY KEY (Prisma cannot model a table
--      without one)
--    • float  -> DOUBLE,  bit -> TINYINT(1),  datetime -> DATETIME
--
--  HOW TO RUN:  phpMyAdmin → your database → SQL tab → paste everything →
--               Go.  Safe to run twice (CREATE TABLE IF NOT EXISTS).
--  RUN THIS FIRST, then add the Prisma models, then the API code.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Purchase Order — header ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tbl_poheader (
  LocCode     CHAR(10)     NOT NULL DEFAULT ' ',
  PONO        CHAR(10)     NOT NULL DEFAULT ' ',      -- "PO0000001" from Tbl_Serials
  PODate      DATETIME     NOT NULL DEFAULT '1900-01-01 00:00:00',
  DueDate     DATETIME     NOT NULL DEFAULT '1900-01-01 00:00:00',
  SupID       CHAR(10)     NOT NULL DEFAULT ' ',
  NetTotal    DOUBLE       NOT NULL DEFAULT 0,
  UserID      CHAR(10)     NOT NULL DEFAULT ' ',      -- who entered it
  Remarks     VARCHAR(1500) NOT NULL DEFAULT '',
  DeliAdd     VARCHAR(100) NOT NULL DEFAULT '',
  TxnDate     DATETIME     NOT NULL DEFAULT '1900-01-01 00:00:00',  -- server time
  SysSerialNo CHAR(10)     NOT NULL DEFAULT ' ',
  ConUserID   CHAR(10)     NOT NULL DEFAULT ' ',      -- who confirmed it
  Confirmed   CHAR(1)      NOT NULL DEFAULT 'N',      -- 'N' pending / 'Y' confirmed
  ConDatetime DATETIME     NULL DEFAULT NULL,
  GRNed       CHAR(1)      NOT NULL DEFAULT 'N',      -- 'Y' when every line has arrived (the old desktop GRN save set this too)
  PRIMARY KEY (LocCode, PONO),
  KEY idx_po_sup    (SupID),
  KEY idx_po_conf   (Confirmed, PODate),
  KEY idx_po_due    (DueDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Purchase Order — lines ─────────────────────────────────────────────────
-- LineNo is the line number inside one PO (1,2,3…). The original SQL Server
-- script had no key at all; a key is required, and (LocCode, PONO, LineNo)
-- lets the SAME item sit on two lines with different prices/dates, which the
-- legacy screen allowed.
CREATE TABLE IF NOT EXISTS tbl_podetails (
  LocCode        CHAR(10)     NOT NULL DEFAULT ' ',
  PONo           CHAR(10)     NOT NULL DEFAULT ' ',
  LineNo         INT          NOT NULL DEFAULT 0,
  ItemCode       CHAR(15)     NOT NULL DEFAULT ' ',   -- CHAR(15), not varchar(50)
  UnitID         CHAR(10)     NOT NULL DEFAULT ' ',
  CostPrice      DOUBLE       NOT NULL DEFAULT 0,
  POQty          DOUBLE       NOT NULL DEFAULT 0,
  ItemValue      DOUBLE       NOT NULL DEFAULT 0,     -- CostPrice × POQty (server side)
  DirectPOConfNo CHAR(10)     NOT NULL DEFAULT ' ',   -- direct-confirmation reference
  GRNQty         DOUBLE       NOT NULL DEFAULT 0,     -- how much has been received
  GRNNOs         VARCHAR(500) NOT NULL DEFAULT '',    -- "GRN0000001, GRN0000004"
  PRIMARY KEY (LocCode, PONo, LineNo),
  KEY idx_pod_item (ItemCode),
  KEY idx_pod_pono (PONo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── GRN — header ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tbl_grnheader (
  LocCode     CHAR(10)     NOT NULL DEFAULT ' ',
  GRNNO       VARCHAR(15)  NOT NULL DEFAULT ' ',      -- "GRN0000001" from Tbl_Serials
  GRNDate     DATETIME     NOT NULL DEFAULT '1900-01-01 00:00:00',
  SupID       CHAR(10)     NOT NULL DEFAULT ' ',
  SupInvNo    VARCHAR(20)  NOT NULL DEFAULT '',       -- the supplier's own invoice no
  GrossTotal  DOUBLE       NOT NULL DEFAULT 0,
  DisVal      DOUBLE       NOT NULL DEFAULT 0,
  Adjestment  DOUBLE       NOT NULL DEFAULT 0,        -- (spelling kept from the legacy app)
  NetTotal    DOUBLE       NOT NULL DEFAULT 0,
  UserID      CHAR(10)     NOT NULL DEFAULT ' ',
  Remarks     VARCHAR(400) NOT NULL DEFAULT '',
  TxnDate     DATETIME     NOT NULL DEFAULT '1900-01-01 00:00:00',
  SysSerialNo DOUBLE       NOT NULL DEFAULT 0,        -- float in the legacy table too
  Confirmed   CHAR(1)      NOT NULL DEFAULT 'N',
  ConUserID   CHAR(10)     NOT NULL DEFAULT ' ',
  ConDatetime DATETIME     NULL DEFAULT NULL,
  GRNTYPE     CHAR(2)      NOT NULL DEFAULT 'GR',     -- 'GR' normal · 'DG' direct GRN
  PONO        CHAR(10)     NOT NULL DEFAULT ' ',      -- the PO behind it, '' for a direct GRN
  PRIMARY KEY (LocCode, GRNNO),
  KEY idx_grn_sup  (SupID),
  KEY idx_grn_type (GRNTYPE, Confirmed, GRNDate),
  KEY idx_grn_po   (PONO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── GRN — lines ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tbl_grndetails (
  LocCode         CHAR(10)     NOT NULL DEFAULT ' ',
  GRNNo           VARCHAR(15)  NOT NULL DEFAULT ' ',
  LineNo          INT          NOT NULL DEFAULT 0,
  ItemCode        CHAR(15)     NOT NULL DEFAULT ' ',  -- CHAR(15), not char(20)
  UnitID          CHAR(15)     NOT NULL DEFAULT ' ',
  BatchNo         VARCHAR(50)  NOT NULL DEFAULT '',    -- written on the packet, typed line by line
  CostPrice       DOUBLE       NOT NULL DEFAULT 0,
  RetailPrice     DOUBLE       NOT NULL DEFAULT 0,
  GRNQty          DOUBLE       NOT NULL DEFAULT 0,
  FreeQty         DOUBLE       NOT NULL DEFAULT 0,
  ItemValue       DOUBLE       NOT NULL DEFAULT 0,    -- CostPrice × (GRNQty + FreeQty)
  ExpDate         DATETIME     NULL DEFAULT NULL,
  DirectGRNConfNo VARCHAR(15)  NOT NULL DEFAULT '',
  RETYN           TINYINT(1)   NOT NULL DEFAULT 0,    -- 1 = returned to supplier
  RETQTY          DOUBLE       NOT NULL DEFAULT 0,
  RETVAL          DOUBLE       NOT NULL DEFAULT 0,
  PONO            CHAR(10)     NOT NULL DEFAULT ' ',  -- '' for a DIRECT GRN
  UpdItemPrice    TINYINT(1)   NOT NULL DEFAULT 0,    -- push RetailPrice into the item master? (ticked by the user)
  PRIMARY KEY (LocCode, GRNNo, LineNo),
  KEY idx_grnd_item (ItemCode),
  KEY idx_grnd_po   (PONO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ═══════════════════════════════════════════════════════════════════════════
--  Serial numbers for PO No / GRN No
--  ---------------------------------------------------------------------------
--  The project already issues BK / CUS / INV numbers from tbl_serials through
--  src/lib/serials.ts.  "PO" + 7 digits  = 9 chars  → fits CHAR(10).
--  "GRN" + 7 digits = 10 chars → fits VARCHAR(15).
--  Do this in the DB, then add the two codes to SERIAL_CODES in serials.ts.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO tbl_serials (SeriCode, SeriNo, SeriDate) VALUES
  ('PO',  '0000000', NULL),
  ('GRN', '0000000', NULL);


-- ═══════════════════════════════════════════════════════════════════════════
--  RECOMMENDED (not from the legacy script): one stock ledger table
--  ---------------------------------------------------------------------------
--  tbl_itemmaster.StockBalance is a single running number per LocCode+ItemCode.
--  If the GRN edits that number directly and nothing writes a ledger row, six
--  months from now nobody can answer "why is the stock 12?".  Issue, Damage,
--  Transfer, SRN and Stock Recon all need the same table, so build it once:
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tbl_stocktxn (
  TxnNo      BIGINT       NOT NULL AUTO_INCREMENT,
  LocCode    CHAR(10)     NOT NULL DEFAULT ' ',
  ItemCode   CHAR(15)     NOT NULL DEFAULT ' ',
  TxnType    VARCHAR(10)  NOT NULL DEFAULT 'GRN',   -- GRN · DGRN · SRN · DMG · TRF · ISS · ADJ
  RefNo      VARCHAR(20)  NOT NULL DEFAULT '',      -- GRN no, issue no, …
  TxnDate    DATETIME     NOT NULL DEFAULT '1900-01-01 00:00:00',
  QtyIn      DOUBLE       NOT NULL DEFAULT 0,
  QtyOut     DOUBLE       NOT NULL DEFAULT 0,
  Balance    DOUBLE       NOT NULL DEFAULT 0,       -- balance after this row
  CostPrice  DOUBLE       NOT NULL DEFAULT 0,
  UserID     CHAR(10)     NOT NULL DEFAULT ' ',
  Remarks    VARCHAR(200) NOT NULL DEFAULT '',
  PRIMARY KEY (TxnNo),
  KEY idx_stk_item (LocCode, ItemCode, TxnDate),
  KEY idx_stk_ref  (TxnType, RefNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
