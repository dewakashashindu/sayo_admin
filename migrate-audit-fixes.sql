-- ════════════════════════════════════════════════════════════════════
-- Audit fix round — booking & appointment flow
-- Run on BOTH databases (local MySQL and TiDB cloud), or run
-- `npm run db:push:all` (schema is already updated in prisma/schema.prisma).
--
-- 1) Item-code columns in the booking tables widen to CHAR(15) so the
--    FULL item code is stored instead of a silently-truncated 10-char
--    prefix (which collides once item codes differ only after char 10).
-- 2) tbl_bookingheder.ClientReqID stores the client idempotency key, so
--    duplicate submissions return the original booking instead of
--    creating a second one.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE tbl_bookingservicedetail
  MODIFY COLUMN ServiceItemID CHAR(15) NOT NULL;

ALTER TABLE Tbl_BookingServiceItemAddTech
  MODIFY COLUMN ServiceItemID CHAR(15) NOT NULL;

ALTER TABLE Tbl_BookingServiceRecipe
  MODIFY COLUMN ServiceItemID CHAR(15) NOT NULL,
  MODIFY COLUMN RawItemCode   CHAR(15) NOT NULL;

ALTER TABLE tbl_bookingheder
  ADD COLUMN ClientReqID VARCHAR(50) NOT NULL DEFAULT ' ';
