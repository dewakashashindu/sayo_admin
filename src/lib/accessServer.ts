// src/lib/accessServer.ts
// Server-side permission resolution against the VB6-style tables.
// Rule: 1) the user's own overrides (Tbl_UserAuthorization) if any exist,
//       2) otherwise the role/group profile (Tbl_UserAccess_StdProfile).
//       Locations work the same way on Tbl_UserLocAccess.
import { prisma } from "@/lib/prisma";
import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";
import { ensureAuthTables } from "@/lib/authTables";
import { decipher } from "@/lib/accessCipher";

export interface AccessBag {
  userId: string;
  userName: string;
  groupId: string;
  workingLocId: string;
  source: "user" | "group" | "none";
  keys: Set<string>;           // "APPT.NEW_BOOKING" style
  locations: string[];         // allowed LocCodes
  has: (code: string, action?: string) => boolean;
}

function decodeKeys(rows: { FuncID: string; ACCESS: string }[]): Set<string> {
  const nodeByCode = new Map(ALL_ACCESS_NODES.map((n) => [n.code, n]));
  const out = new Set<string>();
  for (const r of rows) {
    const code = decipher(String(r.FuncID ?? "").trim());
    const node = nodeByCode.get(code);
    if (!node) continue;
    const mask = decipher(String(r.ACCESS ?? "").trim());
    node.actions.forEach((a, i) => {
      if (mask[i] === "1") out.add(`${code}.${a}`);
    });
  }
  return out;
}

export async function loadAccessForUser(userIdRaw: string): Promise<AccessBag> {
  const userId = String(userIdRaw ?? "").trim().slice(0, 10);
  const users = await prisma.$queryRaw<{ UserName: string | null; GroupId: string | null; WorkingLocID: string | null }[]>`
    SELECT UserName, GroupId, WorkingLocID FROM tbl_userdetails WHERE UserId = ${userId}
  `.catch(() => [] as { UserName: string | null; GroupId: string | null; WorkingLocID: string | null }[]);
  const u = users[0];
  const groupId = String(u?.GroupId ?? "").trim().slice(0, 10);
  const empty: AccessBag = {
    userId, userName: String(u?.UserName ?? "").trim(), groupId,
    workingLocId: String(u?.WorkingLocID ?? "").trim(),
    source: "none", keys: new Set(), locations: [],
    has: () => false,
  };
  if (!u) return empty;

  /* The permission tables are created ONCE per process (src/lib/authTables.ts)
     instead of on every request — three DDL round-trips per call, and a silent
     dependency on the CREATE privilege, used to sit on this hot path. */
  await ensureAuthTables();

  // 1) user overrides?
  let rows = await prisma.$queryRaw<{ FuncID: string; ACCESS: string }[]>`
    SELECT FuncID, ACCESS FROM Tbl_UserAuthorization WHERE UserID = ${userId}
  `;
  let source: AccessBag["source"] = "user";
  if (rows.length === 0) {
    // 2) group profile
    source = "group";
    rows = await prisma.$queryRaw<{ FuncID: string; ACCESS: string }[]>`
      SELECT FuncID, ACCESS FROM Tbl_UserAccess_StdProfile WHERE UserID = ${groupId}
    `;
  }

  let locRows = await prisma.$queryRaw<{ LocCode: string }[]>`
    SELECT LocCode FROM Tbl_UserLocAccess WHERE OwnerId = ${userId} AND UPPER(Allow) = 'Y'
  `;
  if (locRows.length === 0 && groupId) {
    locRows = await prisma.$queryRaw<{ LocCode: string }[]>`
      SELECT LocCode FROM Tbl_UserLocAccess WHERE OwnerId = ${groupId} AND UPPER(Allow) = 'Y'
    `;
  }

  const keys = decodeKeys(rows);
  const locations = locRows.map((r) => String(r.LocCode).trim()).filter(Boolean);
  return {
    ...empty,
    source: keys.size ? source : "none",
    keys,
    locations,
    has: (code: string, action = "ACCESS") => keys.has(`${code}.${action}`),
  };
}
