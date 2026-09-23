import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureLocationExtras } from "@/lib/locationExtras";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}
const trim = (v: unknown) => String(v ?? "").trim();
const bit = (v: unknown) => (v === true || v === 1 || v === "1" ? 1 : 0);

interface LocRow {
  LocCode: string;
  LocDes: string;
  Address: string;
  Enable: number | boolean;
  MainLoc: number | boolean;
  SubLoc: number | boolean;
  MainLocCode: string;
  MainLocDes: string | null;
}

function mapLoc(r: LocRow) {
  return {
    LocCode: trim(r.LocCode),
    LocDes: trim(r.LocDes),
    Address: trim(r.Address),
    Enable: Boolean(Number(r.Enable)),
    MainLoc: Boolean(Number(r.MainLoc)),
    SubLoc: Boolean(Number(r.SubLoc)),
    MainLocCode: trim(r.MainLocCode),
    MainLocDes: r.MainLocDes ? trim(r.MainLocDes) : "",
  };
}

const SELECT_LOCS = `
  SELECT l.LocCode, l.LocDes, l.Address, l.Enable, l.MainLoc, l.SubLoc,
         l.MainLocCode, m.LocDes AS MainLocDes
  FROM tbl_locationmaster l
  LEFT JOIN tbl_locationmaster m ON RTRIM(m.LocCode) = RTRIM(l.MainLocCode)
`;

async function findLoc(locCode: string): Promise<LocRow | null> {
  const rows = await prisma.$queryRawUnsafe<LocRow[]>(
    `${SELECT_LOCS} WHERE RTRIM(l.LocCode) = ? LIMIT 1`,
    locCode,
  );
  return rows[0] ?? null;
}

async function nextLocCode(): Promise<string> {
  const all = await prisma.tbl_LocationMaster.findMany({ select: { LocCode: true } });
  const nums = all
    .map((l) => parseInt(l.LocCode.replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `LOC${String(next).padStart(2, "0")}`;
}

/** A location the sub can belong to: an existing MAIN location. */
async function assertValidMain(mainLocCode: string, selfLocCode = ""): Promise<string | null> {
  const code = trim(mainLocCode);
  if (!code) return "A sub location needs a main location — pick one from the list.";
  if (selfLocCode && code === selfLocCode) return "A location cannot be its own main location.";
  const main = await findLoc(code);
  if (!main) return `Main location ${code} does not exist.`;
  if (Number(main.SubLoc)) return `${trim(main.LocDes)} is itself a sub location — pick a MAIN location.`;
  if (!Number(main.MainLoc)) return `${trim(main.LocDes)} is not marked as a main location.`;
  return null;
}

/** How many subs point at this location. */
async function subCount(locCode: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(
    `SELECT COUNT(*) AS n FROM tbl_locationmaster WHERE RTRIM(MainLocCode) = ?`,
    locCode,
  );
  return Number(rows[0]?.n || 0);
}

const TXN_REFS: { table: string; cols: string[]; label: string }[] = [
  { table: "tbl_itemmaster",            cols: ["LocCode"],               label: "Item Master (stock per location)" },
  { table: "tbl_stocktxn",              cols: ["LocCode"],               label: "Stock Ledger" },
  { table: "tbl_txnmovement",           cols: ["LocCode"],               label: "Stock Movement" },
  { table: "tbl_bookingheder",          cols: ["LocCode"],               label: "Bookings" },
  { table: "tbl_bookingheader",         cols: ["LocCode"],               label: "Bookings" },
  { table: "tbl_bookingtxndetail",      cols: ["LocCode"],               label: "Bookings" },
  { table: "tbl_billheader",            cols: ["LocCode"],               label: "Bills" },
  { table: "tbl_poheader",              cols: ["LocCode"],               label: "Purchase Orders" },
  { table: "tbl_podetails",             cols: ["LocCode"],               label: "Purchase Orders" },
  { table: "tbl_grnheader",             cols: ["LocCode"],               label: "GRNs" },
  { table: "tbl_grndetails",            cols: ["LocCode"],               label: "GRNs" },
  { table: "tbl_srnheader",             cols: ["LocCode"],               label: "Supplier Returns" },
  { table: "tbl_damageheader",          cols: ["LocCode"],               label: "Damage Notes" },
  { table: "tbl_reconheader",           cols: ["LocCode"],               label: "Stock Recons" },
  { table: "tbl_transferreqheder",      cols: ["FromLocCode", "ToLoc"],  label: "Transfer Requisitions" },
  { table: "tbl_transfernoteheader",    cols: ["FromLocCode", "ToLoc"],  label: "Transfer Notes" },
  { table: "tbl_transferreturnheader",  cols: ["FromLocCode", "ToLoc"],  label: "Transfer Returns" },
];

/** Name of the first transaction source that uses the location, or null. */
async function txnUsageOf(locCode: string): Promise<string | null> {
  const existing = new Set(
    (
      await prisma.$queryRawUnsafe<{ t: string }[]>(
        `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
      )
    ).map((r) => r.t.toLowerCase()),
  );
  for (const ref of TXN_REFS) {
    if (!existing.has(ref.table)) continue;
    // codes are padded CHAR(10) — RTRIM before comparing
    const cond = ref.cols.map((c) => `RTRIM(${c}) = ?`).join(" OR ");
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM \`${ref.table}\` WHERE ${cond} LIMIT 1`,
      ...ref.cols.map(() => locCode),
    );
    if (Number(rows[0]?.n || 0) > 0) return ref.label;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureLocationExtras();
    const { searchParams } = req.nextUrl;
    const locCode = trim(searchParams.get("locCode"));
    const search = trim(searchParams.get("search")).toUpperCase();
    const mainsOnly = searchParams.get("mainsOnly") === "1";

    if (locCode) {
      const found = await findLoc(locCode);
      if (!found) return err("Location not found", 404);
      return ok(mapLoc(found));
    }

    let sql = SELECT_LOCS;
    const params: string[] = [];
    const wh: string[] = [];
    if (search) {
      wh.push("(UPPER(l.LocCode) LIKE ? OR UPPER(l.LocDes) LIKE ? OR UPPER(l.Address) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (mainsOnly) wh.push("l.MainLoc = 1 AND l.SubLoc = 0");
    if (wh.length) sql += ` WHERE ${wh.join(" AND ")}`;
    // mains first, each followed by its subs (the list groups subs under their main)
    sql += " ORDER BY CASE WHEN l.MainLocCode<>'' THEN RTRIM(l.MainLocCode) ELSE RTRIM(l.LocCode) END, l.SubLoc, RTRIM(l.LocCode)";

    const list = await prisma.$queryRawUnsafe<LocRow[]>(sql, ...params);
    return ok(list.map(mapLoc));
  } catch (e) {
    console.error("GET /locations error:", e);
    return err("Failed to fetch locations", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureLocationExtras();
    const body = await req.json().catch(() => ({}));
    const locDes = trim(body.locDes);
    if (!locDes) return err("locDes (Location Description) is required");
    if (locDes.length > 50) return err("locDes must be 50 characters or less");

    const mainLoc = bit(body.mainLoc);
    const subLoc = bit(body.subLoc);
    if (mainLoc && subLoc) return err("A location is either a Main Location or a Sub Location — not both.");
    const mainLocCode = subLoc ? trim(body.mainLocCode) : "";
    if (subLoc) {
      const bad = await assertValidMain(mainLocCode);
      if (bad) return err(bad);
    }

    /* duplicate description check */
    const dup = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM tbl_locationmaster WHERE UPPER(RTRIM(LocDes)) = ?`,
      locDes.toUpperCase(),
    );
    if (Number(dup[0]?.n || 0) > 0) return err(`Location description "${locDes}" already exists`);

    const locCode = await nextLocCode();
    const address = (trim(body.address) || " ").slice(0, 300);
    const enable = body.enable === undefined || body.enable === null ? 1 : bit(body.enable);

    await prisma.$executeRawUnsafe(
      `INSERT INTO tbl_locationmaster
        (LocCode, LocDes, Address, Enable, MainLoc, SubLoc, MainLocCode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      locCode.padEnd(10, " "),
      locDes.toUpperCase(),
      address,
      enable,
      mainLoc,
      subLoc,
      mainLocCode.padEnd(10, " "),
    );

    const created = await findLoc(locCode);
    return ok(mapLoc(created!), 201);
  } catch (e) {
    console.error("POST /locations error:", e);
    return err("Failed to create location", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureLocationExtras();
    const body = await req.json().catch(() => ({}));
    const locCode = trim(body.locCode);
    const locDes = trim(body.locDes);
    if (!locCode) return err("locCode is required");
    if (!locDes) return err("locDes (Location Description) is required");
    if (locDes.length > 50) return err("locDes must be 50 characters or less");

    const existing = await findLoc(locCode);
    if (!existing) return err("Location not found", 404);

    const mainLoc = bit(body.mainLoc);
    const subLoc = bit(body.subLoc);
    if (mainLoc && subLoc) return err("A location is either a Main Location or a Sub Location — not both.");
    const mainLocCode = subLoc ? trim(body.mainLocCode) : "";
    if (subLoc) {
      const bad = await assertValidMain(mainLocCode, locCode);
      if (bad) return err(bad);
    }

    /* a MAIN that has subs under it cannot stop being a main */
    if (Number(existing.MainLoc) && !mainLoc) {
      const n = await subCount(locCode);
      if (n > 0) {
        return err(`${trim(existing.LocDes)} is the main location of ${n} sub location(s) — move those subs to another main first.`);
      }
    }

    /* duplicate description check (exclude self) */
    const dup = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM tbl_locationmaster WHERE UPPER(RTRIM(LocDes)) = ? AND RTRIM(LocCode) <> ?`,
      locDes.toUpperCase(),
      locCode,
    );
    if (Number(dup[0]?.n || 0) > 0) return err(`Location description "${locDes}" already exists`);

    const address = (body.address !== undefined ? trim(body.address) || " " : trim(existing.Address)).slice(0, 300);
    const enable = body.enable === undefined ? Number(existing.Enable) : bit(body.enable);

    await prisma.$executeRawUnsafe(
      `UPDATE tbl_locationmaster
       SET LocDes = ?, Address = ?, Enable = ?, MainLoc = ?, SubLoc = ?, MainLocCode = ?
       WHERE RTRIM(LocCode) = ?`,
      locDes.toUpperCase(),
      address,
      enable,
      mainLoc,
      subLoc,
      mainLocCode.padEnd(10, " "),
      locCode,
    );

    const updated = await findLoc(locCode);
    return ok(mapLoc(updated!));
  } catch (e) {
    console.error("PUT /locations error:", e);
    return err("Failed to update location", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureLocationExtras();
    const locCode = trim(req.nextUrl.searchParams.get("locCode"));
    if (!locCode) return err("locCode query param is required");

    const existing = await findLoc(locCode);
    if (!existing) return err("Location not found", 404);

    /* a main with subs under it cannot be deleted */
    const n = await subCount(locCode);
    if (n > 0) {
      return err(`${trim(existing.LocDes)} has ${n} sub location(s) under it — move or delete them first.`);
    }

        const usedBy = await txnUsageOf(locCode);
    if (usedBy) {
      return err(`${trim(existing.LocDes)} is used by ${usedBy} — it cannot be deleted. Disable it instead.`);
    }

    await prisma.$executeRawUnsafe(`DELETE FROM tbl_locationmaster WHERE RTRIM(LocCode) = ?`, locCode);
    return ok({ deleted: mapLoc(existing) });
  } catch (e) {
    console.error("DELETE /locations error:", e);
    return err("Failed to delete location", 500);
  }
}
