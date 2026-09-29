// src/app/api/security/users/[userId]/effective-access/route.ts
// GET — what this person may actually do, i.e. the union of every access
// profile assigned to them. Read-only: it exists for the Print button on the
// Users screen. There is nothing to save here any more — a person's access is
// written only by PUT /api/security/assign-profiles/<userId>.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserAccess } from "@/lib/accessProfiles";
import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";
import { isSuperAdmin } from "@/lib/superAdmin";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const guard = await requireAdminAccess(req, { screen: "USERS", action: "ACCESS" });
    if (!guard.ok) return guard.response;

    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    if (!userId) return NextResponse.json({ success: false, message: "User id is missing." }, { status: 400 });

    const rows = await prisma.$queryRaw<{ UserName: string | null; GroupId: string | null }[]>`
      SELECT RTRIM(UserName) AS UserName, RTRIM(GroupId) AS GroupId FROM tbl_userdetails WHERE UserId = ${userId}
    `;
    if (!rows[0]) {
      return NextResponse.json({ success: false, message: `User ${userId} was not found.` }, { status: 404 });
    }

    /* the hidden super administrator holds everything by definition */
    if (isSuperAdmin({ userId, groupId: trim(rows[0].GroupId) })) {
      return NextResponse.json({
        success: true,
        data: {
          userId,
          userName: trim(rows[0].UserName),
          profiles: [],
          keys: ALL_ACCESS_NODES.flatMap((n) => n.actions.map((a) => ({ screenCode: n.code, actionCode: a }))),
          locations: [],
          superAdmin: true,
        },
      });
    }

    const { profileCodes, keys, locations } = await resolveUserAccess(userId);
    const keys_ = [...keys].map((k) => {
      const [screenCode, ...rest] = k.split(".");
      return { screenCode, actionCode: rest.join(".") };
    });

    return NextResponse.json({
      success: true,
      data: {
        userId,
        userName: trim(rows[0].UserName),
        profiles: profileCodes,
        keys: keys_,
        locations,
        superAdmin: false,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "Could not load the permissions" },
      { status: 500 },
    );
  }
}
