// src/app/api/security/my-access/route.ts
// GET — the logged-in admin's resolved permissions + allowed locations.
// Client pages use this to hide buttons they have no right to press.
import { NextRequest, NextResponse } from "next/server";
import { loadAccessForUser } from "@/lib/accessServer";
import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";
import { hasNeverLockedOutPower, allAccessKeys, isSuperAdmin } from "@/lib/superAdmin";
import { locationScopeForUser } from "@/lib/locationScope";
import { requireAdminSession } from "@/lib/sessionGuard";

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
  /* The branches this person may use: their own location UNION the locations
     ticked on the profiles they hold (see lib/locationScope). The super
     administrator gets every enabled branch. */
  const scope = await locationScopeForUser(session.uid);
  let locations = [...scope.allowed];
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
