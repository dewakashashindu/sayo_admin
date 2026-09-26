// src/app/api/security/groups/route.ts
// GET  /api/security/groups?q=        → user groups list
// POST /api/security/groups { groupDes } → create; GroupId is assigned (GRP0000001…)
// Source of truth: tbl_usergroups (GroupId char(10) PK, GroupDes varchar(50)).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}
const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  try {
    const q = trim(req.nextUrl.searchParams.get("q"));
    const like = `%${q}%`;
    const rows = await prisma.$queryRaw<{ GroupId: string; GroupDes: string; Users: number }[]>`
      SELECT RTRIM(g.GroupId) AS GroupId, RTRIM(g.GroupDes) AS GroupDes,
        (SELECT COUNT(*) FROM tbl_userdetails u WHERE RTRIM(u.GroupId)=RTRIM(g.GroupId)) AS Users
      FROM tbl_usergroups g
      WHERE ${q ? Prisma.sql`(RTRIM(g.GroupId) LIKE ${like} OR RTRIM(g.GroupDes) LIKE ${like})` : Prisma.sql`1=1`}
      ORDER BY g.GroupId
    `.catch(() => [] as { GroupId: string; GroupDes: string; Users: number }[]);
    return ok(rows.map((r) => ({ groupId: trim(r.GroupId), groupDes: trim(r.GroupDes), users: Number(r.Users || 0) })));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the groups", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { groupDes?: string };
    const groupDes = trim(body.groupDes);
    if (!groupDes) return err("Type the group name first.");

    const exists = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM tbl_usergroups WHERE UPPER(RTRIM(GroupDes)) = UPPER(${groupDes})
    `;
    if (Number(exists[0]?.n || 0) > 0) return err(`A group named '${groupDes}' already exists.`, 409);

    const max = await prisma.$queryRaw<{ m: string | null }[]>`
      SELECT MAX(CAST(REGEXP_REPLACE(RTRIM(GroupId), '[^0-9]', '') AS UNSIGNED)) AS m FROM tbl_usergroups
    `;
    const next = (Number(max[0]?.m || 0) || 0) + 1;
    const groupId = `GRP${String(next).padStart(7, "0")}`.slice(0, 10);

    await prisma.$executeRaw`
      INSERT INTO tbl_usergroups (GroupId, GroupDes) VALUES (${groupId.padEnd(10, " ")}, ${groupDes})
    `;
    return ok({ groupId: trim(groupId), groupDes }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save the group", 500);
  }
}
