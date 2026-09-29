// scripts/create-superadmin.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Creates (or re-creates) the ONE hidden super administrator in tbl_userdetails.
//
//   node scripts/create-superadmin.mjs \
//     --login    sayosuperadmin \
//     --password "NDAEMWAALKA2026" \
//     --phone    0771096131 \
//     --email    dewakashashindu@gmail.com
//
// What it writes — and nothing else:
//
//   UserId    USR0000000        (fixed; the panel hides this id everywhere)
//   LogName   sayosuperadmin    (what you type in the login box)
//   PSW       bcrypt hash       (never the plain password)
//   GroupId   GRP0000000        (fixed; the role is never listed in User Groups)
//   ContNo    v1:… AES-256-GCM  (so the phone cannot be read in phpMyAdmin)
//   Email     v1:… AES-256-GCM  (same for the e-mail)
//   Enable    1
//
// No row is added to tbl_usergroups and no access rows are kept for this account:
// /api/security/my-access hands this account every permission and every
// location directly, so nothing can accidentally lock it out.
//
// Re-running the script is safe: the row is replaced, not duplicated.
//
// Flags:
//   --login --password --phone --email   the four values (see defaults below)
//   --no-otp-reset                       keep it, does not touch anything else
//   --verify                             only read back and decrypt (no writes)
//
// Keep the AES part below in step with src/lib/secureContact.ts and the bcrypt
// rounds (10) in step with /api/auth/admin-login.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/* ── .env without any dependency (same reader as scripts/check-db.mjs) ───── */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}
const loaded = [".env.local", ".env"].filter((n) => loadEnvFile(path.join(root, n)));
console.log(loaded.length ? `Read ${loaded.join(", ")}` : "No .env found — using this shell's environment.");

/* ── arguments ───────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
function flag(name, fallback = "") {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const has = (name) => argv.includes(`--${name}`);

const USER_ID = (process.env.SUPER_ADMIN_USER_ID || "USR0000000").trim().slice(0, 10);
const GROUP_ID = (process.env.SUPER_ADMIN_GROUP_ID || "GRP0000000").trim().slice(0, 10);
const LOGIN = flag("login", process.env.SUPER_ADMIN_LOGIN || "sayosuperadmin").trim().slice(0, 400);
const PASSWORD = flag("password", process.env.SUPER_ADMIN_PASSWORD || "");
const PHONE = flag("phone", process.env.SUPER_ADMIN_PHONE || "0771096131").trim();
const EMAIL = flag("email", process.env.SUPER_ADMIN_EMAIL || "dewakashashindu@gmail.com").trim();
const VERIFY_ONLY = has("verify");

console.log("\n=== SAYO admin — hidden super administrator ===\n");

if (!PASSWORD && !VERIFY_ONLY) {
  console.log("✗ No password given.");
  console.log("  Pass it on the command line (kept out of the repo on purpose):\n");
  console.log('    node scripts/create-superadmin.mjs --password "YourPasswordHere"\n');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  console.log("✗ DATABASE_URL is not set — create .env with the MySQL connection string.");
  process.exit(1);
}
const parsed = new URL(DATABASE_URL);

/* ── the AES-256-GCM piece — identical to src/lib/secureContact.ts ───────── */
const CONTACT_KEY = (process.env.SUPER_ADMIN_CONTACT_KEY || process.env.AUTH_SECRET || "").trim();
if (CONTACT_KEY.length < 16) {
  console.log("✗ SUPER_ADMIN_CONTACT_KEY (or AUTH_SECRET) must be set in .env, 16+ characters.");
  process.exit(1);
}
const KEY = crypto.createHash("sha256").update(`${CONTACT_KEY}|sayo-superadmin-contact-v1`).digest();
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function encryptContact(plain) {
  const value = String(plain ?? "").trim();
  if (!value) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return "v1:" + b64url(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

function decryptContact(stored) {
  const value = String(stored ?? "").trim();
  if (!value) return "";
  if (!value.startsWith("v1:")) return value;
  const raw = Buffer.from(
    value.slice(3).replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - ((value.length - 3) % 4)) % 4),
    "base64",
  );
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8").trim();
}

/* ── connect ─────────────────────────────────────────────────────────────── */
const connOptions = {
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  connectTimeout: 10000,
  ssl: /sslaccept=strict|sslmode=require/i.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
};

let conn;
try {
  conn = await mysql.createConnection(connOptions);
} catch (e) {
  console.log(`✗ Could not connect to MySQL: ${e.code || e.message}`);
  console.log("  Run  node scripts/check-db.mjs  — it explains which of the causes it is.");
  process.exit(1);
}
console.log(`✓ Connected to ${connOptions.host}:${connOptions.port} / ${connOptions.database}`);

/* ── write (or just read back) ───────────────────────────────────────────── */
if (!VERIFY_ONLY) {
  const hash = await bcrypt.hash(PASSWORD, 10);            // login compares with bcrypt
  const encPhone = encryptContact(PHONE);
  const encEmail = encryptContact(EMAIL);

  const COLUMNS = [
    "UserId", "NIC", "LogName", "PSW", "GroupId", "UserName", "Address",
    "WorkingLocID", "ContNo", "Email", "Rmks", "Enable",
  ];
  const ROW = [
    USER_ID.padEnd(10, " "),
    " ",
    LOGIN,
    hash,
    GROUP_ID.padEnd(10, " "),
    "Super Administrator",
    " ",
    "0",
    encPhone,
    encEmail,
    "hidden super administrator - created by scripts/create-superadmin.mjs",
    1,
  ];

  const updates = COLUMNS.filter((c) => c !== "UserId")
    .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(", ");

  await conn.execute(
    `INSERT INTO tbl_userdetails (${COLUMNS.map((c) => `\`${c}\``).join(", ")})
     VALUES (${COLUMNS.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE ${updates}, DOB = DOB`,
    ROW,
  );

  console.log(`✓ Row written: ${USER_ID} / ${LOGIN} / group ${GROUP_ID}`);
  console.log(`  phone ciphertext : ${encPhone}   (${encPhone.length} chars)`);
  console.log(`  e-mail ciphertext: ${encEmail}   (${encEmail.length} chars)`);
  if (encEmail.length > 100) {
    console.log("  ! That e-mail is too long for the VARCHAR(100) column — widen it (see the guide).");
  }
} else {
  console.log("• --verify: no changes written.");
}

/* ── read back and prove the round trip ──────────────────────────────────── */
const [rows] = await conn.execute(
  `SELECT RTRIM(UserId) AS UserId, RTRIM(LogName) AS LogName, RTRIM(GroupId) AS GroupId,
          RTRIM(ContNo) AS ContNo, RTRIM(Email) AS Email, Enable,
          LEFT(PSW, 7) AS PswKind, LENGTH(PSW) AS PswLength
   FROM tbl_userdetails WHERE UserId = ?`,
  [USER_ID],
);
const row = rows[0];
console.log("\n--- read back ---");
if (!row) {
  console.log(`✗ No row found for ${USER_ID}.`);
} else {
  console.log(`  UserId   : ${row.UserId}`);
  console.log(`  LogName  : ${row.LogName}`);
  console.log(`  GroupId  : ${row.GroupId}`);
  console.log(`  Enable   : ${row.Enable}`);
  console.log(`  PSW      : ${row.PswKind}… (${row.PswLength} chars — bcrypt hash, not the password)`);
  const phone = decryptContact(row.ContNo);
  const email = decryptContact(row.Email);
  console.log(`  phone    : ${phone || "(did not decrypt!)"}`);
  console.log(`  e-mail   : ${email || "(did not decrypt!)"}`);
}

/* ── what must NOT exist ─────────────────────────────────────────────────── */
const [[grp]] = await conn.execute(
  "SELECT COUNT(*) AS n FROM tbl_usergroups WHERE GroupId = ?",
  [GROUP_ID],
);
console.log(`\n  tbl_usergroups rows for ${GROUP_ID}: ${grp.n} (0 is correct — the role is never listed)`);

const [[auth]] = await conn.execute(
  `SELECT COUNT(*) AS n FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'Tbl_UserAuthorization'`,
);
if (auth.n) {
  await conn.execute("DELETE FROM Tbl_UserAuthorization WHERE UserID = ?", [USER_ID]);
  console.log("  stale per-user override rows: removed (none are needed)");
}

await conn.end();

console.log(`
Next steps
  1. Make sure .env has BOTH channels the code travels over:
       TEXTLK_API_TOKEN / TEXTLK_SENDER_ID   (SMS)
       SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS   (e-mail)
     Without them the sign-in refuses to continue (by design).
  2. Start the app and sign in at /admin-login with  ${LOGIN}
     → the password is accepted, then the 6-digit code arrives on
       ${PHONE} and ${EMAIL}.
  3. Nothing about this account appears in Settings → Users, Settings →
     User Groups, Access Profiles, the technician lists or “Message Admin”.
`);
