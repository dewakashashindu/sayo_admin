// src/app/api/security/users/[userId]/access/route.ts
// GET / PUT  /api/security/users/USR.../access
// Per-user role overrides in  Tbl_UserAuthorization :
//   - First touch: seeded from the user's group profile (Tbl_UserAccess_StdProfile)
//   - Saves afterwards touch ONLY Tbl_UserAuthorization — StdProfile unchanged.
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

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Tbl_UserAuthorization (
      UserID  CHAR(10)     NOT NULL,
      FuncID  VARCHAR(200) NOT NULL,
      Auth    TINYINT(1)   NOT NULL DEFAULT 0,
      Module  VARCHAR(50)  NOT NULL DEFAULT 'RT',
      ACCESS  VARCHAR(50)  NOT NULL DEFAULT '',
      PRIMARY KEY (UserID, FuncID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
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

async function getUser(userId: string) {
  const rows = await prisma.$queryRaw<{ UserName: string | null; GroupId: string | null }[]>`
    SELECT UserName, GroupId FROM tbl_userdetails WHERE UserId = ${userId}
  `;
  return rows[0] ?? null;
}

function decodeRows(rows: { FuncID: string; ACCESS: string }[]) {
  const nodeByCode = new Map(ALL_ACCESS_NODES.map((n) => [n.code, n]));
  const keys: { screenCode: string; actionCode: string }[] = [];
  for (const r of rows) {
    const code = decipher(trim(r.FuncID));
    const node = nodeByCode.get(code);
    if (!node) continue;
    const mask = decipher(trim(r.ACCESS));
    node.actions.forEach((actionCode, i) => {
      if (mask[i] === "1") keys.push({ screenCode: code, actionCode });
    });
  }
  return keys;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    if (!userId) return err("User id is missing.");
    await ensureTables();
    const user = await getUser(userId);
    if (!user) return err(`User ${userId} was not found.`, 404);

    let rows = await prisma.$queryRaw<{ FuncID: string; ACCESS: string }[]>`
      SELECT FuncID, ACCESS FROM Tbl_UserAuthorization WHERE UserID = ${userId}
    `;
    let seeded = false;
    if (rows.length === 0) {
      // no overrides yet — copy the user's group profile as the starting point
      const gi = trim(user.GroupId).slice(0, 10);
      await prisma.$executeRaw`
        INSERT INTO Tbl_UserAuthorization (UserID, FuncID, Auth, Module, ACCESS)
        SELECT ${userId}, FuncID, Auth, Module, ACCESS
        FROM Tbl_UserAccess_StdProfile WHERE UserID = ${gi}
      `;
      seeded = true;
      rows = await prisma.$queryRaw<{ FuncID: string; ACCESS: string }[]>`
        SELECT FuncID, ACCESS FROM Tbl_UserAuthorization WHERE UserID = ${userId}
      `;
    }
    return ok({ keys: decodeRows(rows), seeded, groupId: trim(user.GroupId) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the user's profile", 500);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    if (!userId) return err("User id is missing.");
    const body = (await req.json()) as { keys?: { screenCode?: unknown; actionCode?: unknown }[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];

    const granted = new Map<string, Set<string>>();
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

    await ensureTables();
    const user = await getUser(userId);
    if (!user) return err(`User ${userId} was not found.`, 404);

    // full snapshot for THIS USER only — Tbl_UserAccess_StdProfile untouched
    const rowSql: string[] = [];
    const vals: (string | number)[] = [];
    for (const node of ALL_ACCESS_NODES) {
      const allowed = granted.get(node.code);
      const mask = node.actions.map((a) => (allowed?.has(a) ? "1" : "0")).join("");
      const auth = allowed?.has("ACCESS") ? 1 : 0;
      rowSql.push("(?, ?, ?, ?, ?)");
      vals.push(userId, cipher(node.code).slice(0, 200), auth, node.parent.slice(0, 50), cipher(mask).slice(0, 50));
    }
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`DELETE FROM Tbl_UserAuthorization WHERE UserID = ${userId}`;
        await tx.$executeRawUnsafe(
          `INSERT INTO Tbl_UserAuthorization (UserID, FuncID, Auth, Module, ACCESS) VALUES ${rowSql.join(",")}`,
          ...vals,
        );
      },
      { timeout: 30000, maxWait: 10000 },
    );
    const grantedCount = [...granted.values()].reduce((n, s) => n + s.size, 0);
    return ok({ userId, granted: grantedCount });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save the user's profile", 500);
  }
}
