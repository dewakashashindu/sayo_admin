// scripts/test-serials.ts
//
// Exercises the Tbl_Serials allocator:
//   1. numbers are issued in order
//   2. two callers at the same instant never get the same number
//   3. a rolled-back transaction gives its number back
//   4. each series counts on its own
//
// Run with:  npx ts-node --compiler-options {"module":"CommonJS"} scripts/test-serials.ts

require("dotenv").config();

import { PrismaClient } from "@prisma/client";
import { nextSerialTx, peekSerial, SERIAL_CODES } from "../src/lib/serials";

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? `  → ${detail}` : ""}`);
  if (!ok) failures++;
}

async function resetCounters() {
  await prisma.$executeRaw`
    UPDATE tbl_serials SET SeriNo = '0000000', SeriDate = NULL
     WHERE RTRIM(SeriCode) IN ('BK', 'CUS')
  `;
}

async function main() {
  console.log("\n=== Tbl_Serials allocator ===\n");

  await resetCounters();

  // ── 1. sequential ────────────────────────────────────────────────────────
  console.log("1. Sequential allocation");
  const a = await nextSerialTx(prisma, SERIAL_CODES.booking);
  const b = await nextSerialTx(prisma, SERIAL_CODES.booking);
  const c = await nextSerialTx(prisma, SERIAL_CODES.booking);
  check("first three IDs are BK0000001/2/3",
    a === "BK0000001" && b === "BK0000002" && c === "BK0000003",
    [a, b, c].join(", "));

  const peek = await peekSerial(prisma, SERIAL_CODES.booking);
  check("counter stored the last issued number",
    peek?.seriNo === "0000003" && peek?.value === 3,
    JSON.stringify(peek));
  check("SeriDate was stamped with today",
    !!peek?.seriDate &&
      new Date(peek.seriDate).toISOString().slice(0, 10) ===
        new Date().toISOString().slice(0, 10),
    String(peek?.seriDate));

  // ── 2. concurrency ───────────────────────────────────────────────────────
  console.log("\n2. concurrent allocations");
  const CONCURRENT = Number(process.env.CONCURRENT || 40);
  console.log(`   (${CONCURRENT} at the same time — set CONCURRENT=… to change)`);
  const issued = await Promise.all(
    Array.from({ length: CONCURRENT }, () =>
      prisma.$transaction(async (tx) => nextSerialTx(tx, SERIAL_CODES.booking)),
    ),
  );
  const unique = new Set(issued);
  check("every ID is different",
    unique.size === CONCURRENT,
    `${issued.length} issued, ${unique.size} unique`);
  check("IDs ran 0000004 … 0000043 with no duplicates",
    issued.sort().join(",") ===
      Array.from({ length: CONCURRENT }, (_, i) =>
        `BK${String(i + 4).padStart(7, "0")}`,
      ).sort().join(","),
    `${issued.sort()[0]} … ${issued.sort()[issued.length - 1]}`);

  // ── 3. rollback ──────────────────────────────────────────────────────────
  console.log("\n3. Rollback");
  const before = (await peekSerial(prisma, SERIAL_CODES.booking))?.value ?? 0;
  try {
    await prisma.$transaction(async (tx) => {
      await nextSerialTx(tx, SERIAL_CODES.booking);
      throw new Error("force rollback");
    });
  } catch {
    /* expected */
  }
  const after = (await peekSerial(prisma, SERIAL_CODES.booking))?.value ?? 0;
  check("a rolled-back booking does not consume a number",
    after === before, `before ${before}, after ${after}`);

  // ── 4. separate series ───────────────────────────────────────────────────
  console.log("\n4. Independent series");
  const cus1 = await nextSerialTx(prisma, SERIAL_CODES.customer);
  const cus2 = await nextSerialTx(prisma, SERIAL_CODES.customer);
  const bk = await nextSerialTx(prisma, SERIAL_CODES.booking);
  check("CUS counts from its own series",
    cus1 === "CUS0000001" && cus2 === "CUS0000002",
    [cus1, cus2].join(", "));
  check("BK was not affected by the CUS calls",
    bk === `BK${String(after + 1).padStart(7, "0")}`, bk);

  // ── 5. row contents ──────────────────────────────────────────────────────
  console.log("\n5. Table contents");
  const rows = await prisma.$queryRaw<
    { SeriCode: string; SeriNo: string; SeriDate: Date | null }[]
  >`SELECT TRIM(SeriCode) AS SeriCode, TRIM(SeriNo) AS SeriNo, SeriDate FROM tbl_serials ORDER BY SeriCode`;
  console.table(rows);

  console.log(
    failures === 0
      ? "\n  All checks passed.\n"
      : `\n  ${failures} check(s) FAILED.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("\nTest crashed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
