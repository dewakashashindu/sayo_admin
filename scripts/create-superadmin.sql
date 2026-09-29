-- ═══════════════════════════════════════════════════════════════════════════
--  SAYO Admin — the hidden super administrator, REFERENCE + CHECKS
--
--  Do NOT hand-type the INSERT from this file. The row needs
--    · a bcrypt hash of the password  (PHP/phpMyAdmin cannot make one here), and
--    · AES-256-GCM ciphertext for the phone number and the e-mail,
--  both of which  scripts/create-superadmin.mjs  computes for you:
--
--      node scripts/create-superadmin.mjs \
--        --login sayosuperadmin --password "NDAEMWAALKA2026" \
--        --phone 0771096131 --email dewakashashindu@gmail.com
--
--  This file is for (a) understanding what lands in the table, (b) checking it
--  afterwards, and (c) putting the row back if it is ever lost.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Does the row exist, and what does the table hold? ────────────────────
SELECT RTRIM(UserId)  AS UserId,
       RTRIM(LogName) AS LogName,
       RTRIM(GroupId) AS GroupId,
       CASE WHEN PSW LIKE '$2%' THEN 'bcrypt hash ✓' ELSE 'NOT a bcrypt hash ✗' END AS Password,
       LEFT(RTRIM(ContNo), 3) AS ContNo_Start,   -- 'v1:' = encrypted ✓
       LEFT(RTRIM(Email), 3)  AS Email_Start,    -- 'v1:' = encrypted ✓
       Enable
FROM tbl_userdetails
WHERE UserId = 'USR0000000';

-- ── 2. What must NOT be there ──────────────────────────────────────────────
-- (both must return 0 — the account is never listed as a user group and never
--  gets profile rows; /api/security/my-access grants it everything directly)
SELECT COUNT(*) AS usergroups_rows_expected_0 FROM tbl_usergroups WHERE GroupId = 'GRP0000000';
SELECT COUNT(*) AS profile_rows_expected_0
FROM Tbl_UserAccess_StdProfile WHERE UserID = 'GRP0000000';
SELECT COUNT(*) AS user_override_rows_expected_0
FROM Tbl_UserAuthorization WHERE UserID = 'USR0000000';

-- ── 3. The sign-in OTP table (created by the app on the first login) ───────
SELECT UserId, ExpiresAt, Attempts, CreatedAt FROM Tbl_AdminLoginOtp;
-- Locked out by wrong codes? Clear it and try again:
-- DELETE FROM Tbl_AdminLoginOtp WHERE UserId = 'USR0000000';

-- ── 4. Lost the row? Put it back the easy way ──────────────────────────────
-- Run scripts/create-superadmin.mjs again (it replaces, never duplicates).
-- Only if Node is unavailable, the shape of the row is:
--
--   INSERT INTO tbl_userdetails
--     (UserId, NIC, LogName, PSW, GroupId, UserName, Address, WorkingLocID,
--      ContNo, Email, Rmks, Enable)
--   VALUES
--     ('USR0000000', ' ', 'sayosuperadmin',
--      '<bcrypt hash of the password>',
--      'GRP0000000', 'Super Administrator', ' ', '0',
--      'v1:<base64url of iv|tag|ciphertext>',
--      'v1:<base64url of iv|tag|ciphertext>',
--      'hidden super administrator', 1)
--   ON DUPLICATE KEY UPDATE PSW = VALUES(PSW);
--
-- ⚠ Without the matching SUPER_ADMIN_CONTACT_KEY in .env the two v1: values
--   cannot be decrypted, and the login will refuse to send a code — that is
--   the intended failure (fail-closed), not a bug.

-- ── 5. Re-encrypt after rotating the key ───────────────────────────────────
-- If SUPER_ADMIN_CONTACT_KEY is ever changed, the old ciphertext is dead:
-- just re-run scripts/create-superadmin.mjs with the same password/phone/e-mail.
