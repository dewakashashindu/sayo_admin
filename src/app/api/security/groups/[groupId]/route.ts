// src/app/api/security/groups/[groupId]/route.ts
// PUT    /api/security/groups/GRP0000001 { groupDes } → rename
// DELETE /api/security/groups/GRP0000001             → remove (blocks while users belong to it)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trim = (v: unknown) => String(v ?? "").trim();
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId: raw } = await ctx.params;
    const groupId = trim(raw).slice(0, 10);
    const body = (await req.json()) as { groupDes?: string };
    const groupDes = trim(body.groupDes);
    if (!groupId) return err("Group id is missing.");
    if (!groupDes) return err("Type the group name first.");

    const dup = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM tbl_usergroups
      WHERE UPPER(RTRIM(GroupDes)) = UPPER(${groupDes}) AND RTRIM(GroupId) <> RTRIM(${groupId})
    `;
    if (Number(dup[0]?.n || 0) > 0) return err(`Another group named '${groupDes}' already exists.`, 409);

    const n = await prisma.$executeRaw`
      UPDATE tbl_usergroups SET GroupDes = ${groupDes} WHERE GroupId = ${groupId}
    `;
    if (Number(n) === 0) return err(`Group ${groupId} was not found.`, 404);
    return ok({ groupId, groupDes });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not update the group", 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId: raw } = await ctx.params;
    const groupId = trim(raw).slice(0, 10);
    if (!groupId) return err("Group id is missing.");

    const used = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM tbl_userdetails WHERE RTRIM(GroupId) = RTRIM(${groupId})
    `;
    if (Number(used[0]?.n || 0) > 0)
      return err(`Group ${groupId} has ${Number(used[0].n)} user(s) in it — move them to another group first.`, 409);

    const n = await prisma.$executeRaw`
      DELETE FROM tbl_usergroups WHERE GroupId = ${groupId}
    `;
    if (Number(n) === 0) return err(`Group ${groupId} was not found.`, 404);
    return ok({ groupId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not delete the group", 500);
  }
}
