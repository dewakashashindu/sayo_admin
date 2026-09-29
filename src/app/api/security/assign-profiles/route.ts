// src/app/api/security/assign-profiles/route.ts
// GET /api/security/assign-profiles
//   → the people who can sign in, the profiles that exist, and who holds what.
//
// Screen: System Settings → User Settings → Assign Profiles.
// A person may hold several profiles; the rights are the union of them all
// (see src/lib/accessProfiles.ts → resolveUserAccess).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessOverviewByUser, allProfileAccess, listProfiles } from "@/lib/accessProfiles";
import { superAdminGroupId, superAdminUserId } from "@/lib/superAdmin";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  try {
    /* its own right: holding ASSIGNP.ACCESS is what lets a person hand out
       profiles. Nothing gets it until a profile grants it. */
    const guard = await requireAdminAccess(req, { screen: "ASSIGNP", action: "ACCESS" });
    if (!guard.ok) return guard.response;

    const users = await prisma.$queryRaw<
      { UserId: string; LogName: string; UserName: string; GroupId: string; GroupDes: string | null; Enable: number }[]
    >`
      SELECT RTRIM(u.UserId) AS UserId, RTRIM(u.LogName) AS LogName, RTRIM(u.UserName) AS UserName,
             RTRIM(u.GroupId) AS GroupId,
             (SELECT RTRIM(g.GroupDes) FROM tbl_usergroups g WHERE RTRIM(g.GroupId) = RTRIM(u.GroupId) LIMIT 1) AS GroupDes,
             u.Enable AS Enable
      FROM tbl_userdetails u
      WHERE RTRIM(u.UserId) <> ${superAdminUserId()}
        AND RTRIM(u.GroupId) <> ${superAdminGroupId()}
      ORDER BY u.UserId
    `.catch(() => [] as { UserId: string; LogName: string; UserName: string; GroupId: string; GroupDes: string | null; Enable: number }[]);

    /* one pass over Tbl_UserAuthorization: the profiles each person holds, how
       many permissions their rows grant, their branches, and whether those rows
       were adjusted by hand ("customized") instead of being the plain union */
    const overview = await accessOverviewByUser();
    const profiles = await listProfiles();
    const ticks = await allProfileAccess();

    return NextResponse.json({
      success: true,
      data: {
        profiles: profiles.map((p) => ({
          apfCode: p.apfCode,
          apfDes: p.apfDes,
          users: p.users,
          keyCount: p.keys,
          /* the ticks themselves, so the screen can rebuild a person's ticks
             the moment a profile chip is added or removed */
          keys: ticks.get(p.apfCode)?.keys ?? [],
          locations: ticks.get(p.apfCode)?.locations ?? [],
        })),
        users: users.map((u) => {
          const userId = trim(u.UserId);
          const seen = overview.get(userId);
          return {
            userId,
            logName: trim(u.LogName),
            userName: trim(u.UserName),
            groupId: trim(u.GroupId),
            groupDes: trim(u.GroupDes),
            enable: Boolean(Number(u.Enable)),
            profiles: seen?.profileCodes ?? [],
            keyCount: seen?.keys ?? 0,
            locations: seen?.locations ?? [],
            customized: seen?.customized ?? false,
          };
        }),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "Could not load the assignments" },
      { status: 500 },
    );
  }
}
