// src/app/api/security/groups/[groupId]/access/route.ts
// GET / PUT  /api/security/groups/GRP.../access
// Persists group profiles into the legacy-shaped  Tbl_UserAccess_StdProfile :
//   UserID = the GroupId, FuncID = cipher(screen code), Auth = given access?
//   Module = parent category code ('RT' for top-level), ACCESS = cipher(bitmask
//            of that function's allowed actions, in catalog order)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_ACCESS_NODES, isKnownAccessKey } from "@/lib/accessCatalog";
import { cipher, decipher } from "@/lib/accessCipher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trim = (v: unknown) => String(v ?? "").trim();
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Tbl_UserAccess_StdProfile (
      UserID  CHAR(10)     NOT NULL,
      FuncID  VARCHAR(200) NOT NULL,
      Auth    TINYINT(1)   NOT NULL DEFAULT 0,
      Module  VARCHAR(50)  NOT NULL DEFAULT 'RT',
      ACCESS  VARCHAR(50)  NOT NULL DEFAULT '',
      PRIMARY KEY (UserID, FuncID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function groupExists(groupId: string) {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*) AS n FROM tbl_usergroups WHERE GroupId = ${groupId}
  `;
  return Number(rows[0]?.n || 0) > 0;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId: raw } = await ctx.params;
    const groupId = trim(raw).slice(0, 10);
    if (!groupId) return err("Group id is missing.");
    await ensureTable();
    if (!(await groupExists(groupId))) return err(`Group ${groupId} was not found.`, 404);

    const rows = await prisma.$queryRaw<{ FuncID: string; ACCESS: string }[]>`
      SELECT FuncID, ACCESS FROM Tbl_UserAccess_StdProfile WHERE UserID = ${groupId}
    `;
    const nodeByCode = new Map(ALL_ACCESS_NODES.map((n) => [n.code, n]));
    const keys: { screenCode: string; actionCode: string }[] = [];

    for (const r of rows) {
      const code = decipher(trim(r.FuncID));
      const node = nodeByCode.get(code);
      if (!node) continue; // stale row for a screen that left the catalog
      const mask = decipher(trim(r.ACCESS)); // e.g. "10110" in catalog action order
      node.actions.forEach((actionCode, i) => {
        if (mask[i] === "1") keys.push({ screenCode: code, actionCode });
      });
    }
    return ok({ keys });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the profile", 500);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId: raw } = await ctx.params;
    const groupId = trim(raw).slice(0, 10);
    if (!groupId) return err("Group id is missing.");
    const body = (await req.json()) as { keys?: { screenCode?: unknown; actionCode?: unknown }[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];

    const granted = new Map<string, Set<string>>(); // screenCode → allowed action codes
    for (const k of keys) {
      const screenCode = trim(k?.screenCode);
      const actionCode = trim(k?.actionCode);
      if (!screenCode || !actionCode) continue;
      if (!isKnownAccessKey(screenCode, actionCode)) {
        return err(`Unknown permission ${screenCode}.${actionCode}.`, 400);
      }
      if (!granted.has(screenCode)) granted.set(screenCode, new Set());
      granted.get(screenCode)!.add(actionCode);
    }

    await ensureTable();
    if (!(await groupExists(groupId))) return err(`Group ${groupId} was not found.`, 404);

    // full snapshot: one row per catalog function, VB6-style.
    // Built as a single multi-row INSERT — dozens of separate $executeRaw
    // round-trips can outlive Prisma's default interactive-tx timeout.
    const rowSql: string[] = [];
    const vals: (string | number)[] = [];
    for (const node of ALL_ACCESS_NODES) {
      const allowed = granted.get(node.code);
      const mask = node.actions.map((a) => (allowed?.has(a) ? "1" : "0")).join("");
      const auth = allowed?.has("ACCESS") ? 1 : 0;
      rowSql.push("(?, ?, ?, ?, ?)");
      vals.push(groupId, cipher(node.code).slice(0, 200), auth, node.parent.slice(0, 50), cipher(mask).slice(0, 50));
    }
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`DELETE FROM Tbl_UserAccess_StdProfile WHERE UserID = ${groupId}`;
        await tx.$executeRawUnsafe(
          `INSERT INTO Tbl_UserAccess_StdProfile (UserID, FuncID, Auth, Module, ACCESS) VALUES ${rowSql.join(",")}`,
          ...vals,
        );
      },
      { timeout: 30000, maxWait: 10000 },
    );
    const grantedCount = [...granted.values()].reduce((n, s) => n + s.size, 0);
    return ok({ groupId, granted: grantedCount });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save the profile", 500);
  }
}
