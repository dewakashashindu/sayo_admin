// scripts/backfill-itemdetail.mjs
// ─────────────────────────────────────────────────────────────────────────────
// One-time reconciliation of tbl_itemdetail against tbl_itemmaster.StockBalance.
//
//   node scripts/backfill-itemdetail.mjs            (dry run — only reports)
//   node scripts/backfill-itemdetail.mjs --apply    (actually writes)
//
// Why: older stock exists only as StockBalance with no batch rows, so the
// Item Master location grid and every FIFO batch move drift apart. For every
// (location, item) this script makes SUM(tbl_itemdetail.ItemQty) equal to
// StockBalance, using the same rules the application uses:
//   · missing rows entirely  → insert one no-expiry batch row
//   · too little in batches  → add the difference into the latest batch
//   · too much in batches    → reduce FIFO, overflowing shortage onto the
//                              last batch (may stay negative — visible in the
//                              Item Master batch popup and fixed by a recon)
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found — create .env next to this script.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const NO_EXPIRY_YEAR = 1900;
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

async function main() {
  const pairs = await prisma.$queryRaw`
    SELECT RTRIM(LocCode) AS LocCode, RTRIM(ItemCode) AS ItemCode, COALESCE(StockBalance, 0) AS sb
      FROM tbl_itemmaster
     ORDER BY LocCode, ItemCode`;

  let ok = 0, inserted = 0, raised = 0, reduced = 0, errors = 0;

  for (let i = 0; i < pairs.length; i++) {
    const { LocCode: loc, ItemCode: code } = pairs[i];
    const target = round3(pairs[i].sb);
    try {
      const rows = await prisma.$queryRaw`
        SELECT ExpiryDate, ItemQty FROM tbl_itemdetail
         WHERE RTRIM(LocCode) = ${loc} AND RTRIM(ItemCode) = ${code}
         ORDER BY CASE WHEN YEAR(ExpiryDate) <= ${NO_EXPIRY_YEAR} THEN 1 ELSE 0 END, ExpiryDate ASC`;

      const sum = round3(rows.reduce((s, r) => s + Number(r.ItemQty || 0), 0));
      const diff = round3(target - sum);
      if (Math.abs(diff) < 1e-9) { ok++; continue; }

      if (rows.length === 0) {
        // No batch rows at all and balance is zero → nothing to do.
        if (Math.abs(target) < 1e-9) { ok++; continue; }
        if (APPLY) {
          await prisma.$executeRaw`
            INSERT INTO tbl_itemdetail (LocCode, ItemCode, ExpiryDate, ItemQty)
            VALUES (${loc.padEnd(10, " ").slice(0, 10)}, ${code.padEnd(15, " ").slice(0, 15)}, ${new Date("1900-01-01")}, ${target})`;
        }
        inserted++;
        continue;
      }

      if (diff > 0) {
        // Grow the latest real-expiry batch, else the no-expiry bucket, else first row.
        const real = rows.filter((r) => new Date(r.ExpiryDate).getUTCFullYear() > NO_EXPIRY_YEAR);
        const bucket = real.length ? real[real.length - 1] : rows[rows.length - 1];
        if (APPLY) {
          await prisma.$executeRaw`
            UPDATE tbl_itemdetail SET ItemQty = ${round3(Number(bucket.ItemQty || 0) + diff)}
             WHERE RTRIM(LocCode) = ${loc} AND RTRIM(ItemCode) = ${code} AND ExpiryDate = ${bucket.ExpiryDate}`;
        }
        raised++;
      } else {
        // FIFO reduce; remaining shortage lands on the last batch as negative.
        let todo = -diff;
        const writes = [];
        for (let j = 0; j < rows.length; j++) {
          if (todo <= 0) break;
          const b = rows[j];
          const take = Math.min(Number(b.ItemQty || 0), todo);
          todo = round3(todo - take);
          writes.push([b, round3(Number(b.ItemQty || 0) - take)]);
        }
        if (todo > 0) {
          const [last, val] = writes.length ? writes[writes.length - 1] : [rows[rows.length - 1], Number(rows[rows.length - 1].ItemQty || 0)];
          writes.length ? (writes[writes.length - 1][1] = round3(val - todo)) : writes.push([rows[rows.length - 1], round3(val - todo)]);
        }
        if (APPLY) {
          for (const [b, val] of writes) {
            await prisma.$executeRaw`
              UPDATE tbl_itemdetail SET ItemQty = ${val}
               WHERE RTRIM(LocCode) = ${loc} AND RTRIM(ItemCode) = ${code} AND ExpiryDate = ${b.ExpiryDate}`;
          }
        }
        reduced++;
      }
    } catch (e) {
      errors++;
      console.error(`  ✗ ${loc}/${code}: ${e.message}`);
    }

    if (pairs.length > 500 && (i + 1) % 500 === 0) {
      console.log(`  … ${i + 1}/${pairs.length} pairs checked`);
    }
  }

  console.log("");
  console.log(`Mode      : ${APPLY ? "APPLY — the table was updated" : "DRY RUN — nothing was written (add --apply to write)"}`);
  console.log(`Pairs     : ${pairs.length}`);
  console.log(`Already ok: ${ok}`);
  console.log(`Inserted  : ${inserted} new no-expiry batch row(s)`);
  console.log(`Raised    : ${raised} batch row(s) grew to reach the balance`);
  console.log(`Reduced   : ${reduced} (location,item) reduced FIFO-wise`);
  console.log(`Errors    : ${errors}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
