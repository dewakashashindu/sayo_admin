-- ═══════════════════════════════════════════════════════════════════
--  SAYO Admin — create the FIRST admin login
--  Run this once in phpMyAdmin (database: db_acd689_sayo)
--
--  Login name : admin
--  Password   : Admin@2025      ← TEMPORARY!
--                After your first login go to
--                Settings → Users → select "admin" → Security tab
--                and set a new password (min 8 characters).
--
--  The password below is stored as a bcrypt hash — never as plain text.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO tbl_userdetails
  (UserId, NIC, LogName, PSW, GroupId, UserName, Address, WorkingLocID,
   ContNo, Email, DOB, DOJ, DOL, CreateUser, Rmks, Enable)
SELECT
  'ADM000001', ' ', 'admin',
  '$2b$10$lmzGH3/OuXhVFJ5yaDMaU.HQpNPoWJ8Gxb3njSmfrKFsX27UCYML2',
  '1', 'System Administrator', ' ', '0', '0', ' ',
  NOW(), NOW(), NOW(), '0', 'first admin - created by create-admin.sql', 1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_userdetails WHERE UserId = 'ADM000001' OR LogName = 'admin'
);

-- ═══════════════════════════════════════════════════════════════════
--  Forgot / reset a password manually (optional):
--
--  1. Generate a bcrypt hash (on any machine with Node.js):
--       node -e "require('bcryptjs').hash('NewPassword123',10).then(console.log)"
--     (run inside the project folder so bcryptjs is installed)
--
--  2. Then run:
--       UPDATE tbl_userdetails
--          SET PSW = '<paste-hash-here>'
--        WHERE LogName = 'admin';
--
--  Or simply reset it from the panel: Settings → Users → Security tab.
-- ═══════════════════════════════════════════════════════════════════
