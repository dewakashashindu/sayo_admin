// src/app/api/security/my-access/route.ts
// GET — the logged-in admin's resolved permissions + allowed locations.
// Client pages use this to hide buttons they have no right to press.
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminSession";
import { loadAccessForUser } from "@/lib/accessServer";
import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    return NextResponse.json({ success: false, message: "Not logged in" }, { status: 401 });
  }
  const bag = await loadAccessForUser(session.uid);
  let keys = [...bag.keys];
  // Super-admin safety net: the built-in Administrator group is never gated
  // out of anything (can never lock itself out of Access Profiles).
  if (bag.groupId.trim().toUpperCase() === "GRP0000001") {
    keys = ALL_ACCESS_NODES.flatMap((n) => n.actions.map((a) => `${n.code}.${a}`));
  }
  return NextResponse.json({
    success: true,
    data: {
      userId: bag.userId,
      userName: bag.userName,
      name: session.name,
      groupId: bag.groupId,
      workingLocId: bag.workingLocId,
      source: bag.source,
      keys,
      locations: bag.locations,
    },
  });
}
