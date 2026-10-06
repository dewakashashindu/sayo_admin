// /api/administration/specialities  —  tbl_technicianspecilities
//
//   SpecAreaID   char(10)      primary key — you type this one
//   Specilities  varchar(100)  the name
//
// GET     the list, plus a suggested code for the next row   (ADSPEC.ACCESS)
// POST    add a row — the code is supplied by the caller      (ADSPEC.SAVE)
// PUT     rename an existing row                              (ADSPEC.SAVE)
// DELETE  remove one — refused while technicians are still assigned to it, so
//         nothing silently loses a speciality. ?force=1 drops those links too.
//                                                                       (ADSPEC.DELETE)
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_NAME = 100;   // Specilities varchar(100)
const MAX_CODE = 10;    // SpecAreaID char(10)

const SPECIALITIES_TABLE_HINT =
  "Table tbl_technicianspecilities is missing on this database. Run scripts/add-technician-specialities.sql in phpMyAdmin.";

function missingTable(e: unknown): boolean {
  const msg = String((e as { message?: string } | undefined)?.message ?? e);
  return /doesn't exist|ER_NO_SUCH_TABLE|1146|P2021|unknown table/i.test(msg);
}

function ok(data: unknown, extra?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, data, ...extra }, { status });
}
function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

interface Row {
  SpecAreaID: string;
  Specilities: string;
  AssignedCount: number;
}

/**
 * char(10) blank-pads on the way in, so every comparison against a stored code
 * has to be RTRIM-ed on both sides — otherwise "SPA0000001" and "SPA0000001    "
 * read as two different codes.
 */
async function listAll(search?: string): Promise<Row[]> {
  const like = search ? `%${search}%` : null;
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT RTRIM(s.SpecAreaID)  AS SpecAreaID,
           RTRIM(s.Specilities) AS Specilities,
           COUNT(a.UserID)      AS AssignedCount
      FROM tbl_technicianspecilities s
      LEFT JOIN tbl_technicianspecilityassignment a
             ON RTRIM(a.SpecAreaID) = RTRIM(s.SpecAreaID)
     WHERE ${like === null ? Prisma.sql`1 = 1` : Prisma.sql`RTRIM(s.Specilities) LIKE ${like}`}
     GROUP BY RTRIM(s.SpecAreaID), RTRIM(s.Specilities)
     ORDER BY RTRIM(s.Specilities) ASC, RTRIM(s.SpecAreaID) ASC
  `;
  return rows.map((r) => ({
    SpecAreaID: String(r.SpecAreaID ?? "").trim(),
    Specilities: String(r.Specilities ?? "").trim(),
    AssignedCount: Number(r.AssignedCount ?? 0),
  }));
}

/**
 * A code to offer in the Add form — it only ever has to be UNIQUE, so this just
 * looks at the codes already there and offers the next number in the same shape.
 * The screen lets you change it before saving; nothing is written until you do.
 */
function suggestCode(rows: Row[]): string {
  let prefix = "SPA";
  let width = 7;
  let max = 0;

  for (const r of rows) {
    const m = r.SpecAreaID.match(/^(\D*)(\d+)$/);
    if (!m) continue;                      // a code with no digits in it
    const n = Number(m[2]);
    if (n > max) { max = n; prefix = m[1]; width = m[2].length; }
  }
  if (max === 0) return "SPA0000001";
  return prefix + String(max + 1).padStart(width, "0");
}

/** The name another row already holds, or null. Case- and space-insensitive. */
async function nameTaken(name: string, exceptCode?: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ SpecAreaID: string }[]>`
    SELECT RTRIM(SpecAreaID) AS SpecAreaID
      FROM tbl_technicianspecilities
     WHERE LOWER(TRIM(Specilities)) = ${name.trim().toLowerCase()}
       ${exceptCode ? Prisma.sql`AND RTRIM(SpecAreaID) <> ${exceptCode}` : Prisma.sql``}
     LIMIT 1
  `;
  return rows[0] ? String(rows[0].SpecAreaID).trim() : null;
}

async function codeExists(code: string, exceptCode?: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ SpecAreaID: string }[]>`
    SELECT RTRIM(SpecAreaID) AS SpecAreaID
      FROM tbl_technicianspecilities
     WHERE RTRIM(SpecAreaID) = ${code}
       ${exceptCode ? Prisma.sql`AND RTRIM(SpecAreaID) <> ${exceptCode}` : Prisma.sql``}
     LIMIT 1
  `;
  return rows[0] ? String(rows[0].SpecAreaID).trim() : null;
}

function cleanName(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

/** The code as it is typed: no padding spaces, nothing squeezed. */
function cleanCode(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, "").trim();
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    return b && typeof b === "object" ? b : null;
  } catch {
    return null;
  }
}

/* ── GET ─────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSPEC", action: "ACCESS" });
  if (!guard.ok) return guard.response;

  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
  try {
    const all = await listAll();
    return ok(search ? all.filter(
      (r) => r.Specilities.toLowerCase().includes(search.toLowerCase()) ||
             r.SpecAreaID.toLowerCase().includes(search.toLowerCase()),
    ) : all, { total: all.length, suggestedCode: suggestCode(all) });
  } catch (e) {
    console.error("GET /api/administration/specialities", e);
    if (missingTable(e)) return err(SPECIALITIES_TABLE_HINT, 503);
    return err("Failed to load technician specialities", 500);
  }
}

/* ── POST — add ──────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSPEC", action: "SAVE" });
  if (!guard.ok) return guard.response;

  const body = await readBody(req);
  if (!body) return err("Invalid JSON");

  const rawName = String(body.Specilities ?? body.specilities ?? body.name ?? "");
  const rawCode = String(body.SpecAreaID ?? body.specAreaID ?? body.code ?? "");
  const name = cleanName(rawName);
  const code = cleanCode(rawCode);

  if (!name) return err("Speciality name is required.");
  if (rawName.trim().length > MAX_NAME) return err(`Speciality name must be ${MAX_NAME} characters or less.`);
  if (!code) return err("Code is required — it is the primary key of the row.");
  if (code.length > MAX_CODE) return err(`Code must be ${MAX_CODE} characters or less (the column is char(${MAX_CODE})).`);

  try {
    const dupeCode = await codeExists(code);
    if (dupeCode) return err(`Code "${code}" is already used by a row. Pick another.`, 409);
    const dupeName = await nameTaken(name);
    if (dupeName) return err(`"${name}" already exists (${dupeName}).`, 409);

    await prisma.$executeRaw`
      INSERT INTO tbl_technicianspecilities (SpecAreaID, Specilities)
      VALUES (${code.padEnd(MAX_CODE, " ")}, ${name})
    `;
    return ok({ SpecAreaID: code, Specilities: name, AssignedCount: 0 }, undefined, 201);
  } catch (e) {
    console.error("POST /api/administration/specialities", e);
    if (missingTable(e)) return err(SPECIALITIES_TABLE_HINT, 503);
    if (/duplicate|Duplicate entry/i.test(String((e as Error)?.message ?? ""))) {
      return err(`Code "${code}" is already used by a row. Pick another.`, 409);
    }
    return err("Failed to add the speciality", 500);
  }
}

/* ── PUT — rename ────────────────────────────────────────────────────── */
export async function PUT(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSPEC", action: "SAVE" });
  if (!guard.ok) return guard.response;

  const body = await readBody(req);
  if (!body) return err("Invalid JSON");

  const code = cleanCode(body.SpecAreaID ?? body.specAreaID ?? body.code);
  const name = cleanName(body.Specilities ?? body.specilities ?? body.name);
  if (!code) return err("SpecAreaID is required.");
  if (!name) return err("Speciality name is required.");

  try {
    const found = await codeExists(code);
    if (!found) return err("That speciality no longer exists.", 404);

    const dupe = await nameTaken(name, code);
    if (dupe) return err(`"${name}" already exists (${dupe}).`, 409);

    await prisma.$executeRaw`
      UPDATE tbl_technicianspecilities
         SET Specilities = ${name}
       WHERE RTRIM(SpecAreaID) = ${code}
    `;
    const all = await listAll();
    const saved = all.find((r) => r.SpecAreaID === found);
    return ok(saved ?? { SpecAreaID: code, Specilities: name, AssignedCount: 0 });
  } catch (e) {
    console.error("PUT /api/administration/specialities", e);
    if (missingTable(e)) return err(SPECIALITIES_TABLE_HINT, 503);
    return err("Failed to rename the speciality", 500);
  }
}

/* ── DELETE ──────────────────────────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "ADSPEC", action: "DELETE" });
  if (!guard.ok) return guard.response;

  const body = (await readBody(req)) ?? {};
  const id = cleanCode(body.SpecAreaID ?? body.specAreaID ?? body.code ??
    req.nextUrl.searchParams.get("SpecAreaID"));
  if (!id) return err("SpecAreaID is required.");

  const force = req.nextUrl.searchParams.get("force") === "1" || body.force === true;

  try {
    const counts = await prisma.$queryRaw<{ AssignedCount: number }[]>`
      SELECT COUNT(a.UserID) AS AssignedCount
        FROM tbl_technicianspecilities s
        LEFT JOIN tbl_technicianspecilityassignment a
               ON RTRIM(a.SpecAreaID) = RTRIM(s.SpecAreaID)
       WHERE RTRIM(s.SpecAreaID) = ${id}
       GROUP BY RTRIM(s.SpecAreaID)
    `;
    if (!counts[0]) return err("That speciality no longer exists.", 404);

    const assigned = Number(counts[0].AssignedCount ?? 0);
    if (assigned > 0 && !force) {
      return err(
        `${assigned} technician${assigned === 1 ? "" : "s"} still assigned to "${id}". Remove those first, or delete it and the assignments together.`,
        409,
        { assigned, specAreaID: id },
      );
    }

    /* One transaction: the link rows go with the speciality, so a speciality can
       never end up deleted while the assignments still point at it. */
    await prisma.$transaction(async (tx) => {
      if (assigned > 0) {
        await tx.$executeRaw`
          DELETE FROM tbl_technicianspecilityassignment
           WHERE RTRIM(SpecAreaID) = ${id}
        `;
      }
      await tx.$executeRaw`
        DELETE FROM tbl_technicianspecilities
         WHERE RTRIM(SpecAreaID) = ${id}
      `;
    });

    return ok({ SpecAreaID: id, removedAssignments: assigned });
  } catch (e) {
    console.error("DELETE /api/administration/specialities", e);
    if (missingTable(e)) return err(SPECIALITIES_TABLE_HINT, 503);
    return err("Failed to remove the speciality", 500);
  }
}