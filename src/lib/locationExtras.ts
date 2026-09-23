import { prisma } from "@/lib/prisma";

let ensured: Promise<void> | null = null;

export function ensureLocationExtras(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const rows = await prisma.$queryRaw<{ n: bigint | number }[]>`
        SELECT COUNT(*) AS n
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tbl_locationmaster'
          AND COLUMN_NAME = 'MainLoc'
      `;
      if (Number(rows[0]?.n || 0) === 0) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE tbl_locationmaster
            ADD COLUMN MainLoc     tinyint(1) NOT NULL DEFAULT 0,
            ADD COLUMN SubLoc      tinyint(1) NOT NULL DEFAULT 0,
            ADD COLUMN MainLocCode char(10)   NOT NULL DEFAULT ''
        `);
      }
    })().catch((e) => {
      ensured = null; // let the next request retry the ensure
      throw e;
    });
  }
  return ensured;
}
