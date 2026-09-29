// src/app/api/security/my-access/route.ts
// GET — the logged-in admin's resolved permissions + allowed locations.
// Client pages use this to hide buttons they have no right to press.
import { NextRequest, NextResponse } from "next/server";
import { loadAccessForUser } from "@/lib/accessServer";
import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";
import { prisma } from "@/lib/prisma";
import { hasNeverLockedOutPower, allAccessKeys, isSuperAdmin } from "@/lib/superAdmin";
import { requireAdminSession } from "@/lib/sessionGuard";

/** Every enabled location — the super administrator is never branch-bound. */
async function allLocationCodes(): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<{ LocCode: string }[]>`
      SELECT RTRIM(LocCode) AS LocCode FROM tbl_locationmaster WHERE Enable = 1
    `;
    return rows.map((r) => String(r.LocCode ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  /* The session has to be LIVE, not merely signed: the account must exist,
     be enabled, and the password fingerprint in the cookie must still match
     tbl_userdetails.PSW. That is what makes "disable the user", "change the
     password" and "delete the user" take effect immediately, instead of eight
     hours later when the cookie happens to expire. */
  const live = await requireAdminSession(req);
  if (!live.ok) return live.response;
  const session = live.session;

  const bag = await loadAccessForUser(session.uid);
  let keys = [...bag.keys];
  let locations = bag.locations;
  /* "profiles" = the union of the assigned profiles, "custom" = rows without an
     assigned profile, "none" = nothing assigned,
     "super" = the override below is in force (the account above ignores the
     profile tables on purpose). */
  let source: "profiles" | "custom" | "none" | "super" = bag.source;

  // Never-locked-out roles: the hidden super administrator (by user id or by
  // group id) and the built-in Administrator group. They get every key in the
  // catalog and every enabled location, whatever the profile tables say — the
  // profile can be wiped by accident, and this account must not be able to
  // lock itself out of its own panel.
  if (isSuperAdmin({ userId: bag.userId, groupId: bag.groupId }) || hasNeverLockedOutPower(bag.groupId)) {
    keys = allAccessKeys();
    locations = await allLocationCodes();
    source = "super";
  }

  return NextResponse.json({
    success: true,
    data: {
      userId: bag.userId,
      userName: bag.userName,
      name: session.name,
      groupId: bag.groupId,
      workingLocId: bag.workingLocId,
      source,
      keys,
      locations,
    },
  });
}
