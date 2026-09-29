// src/app/api/security/access-profiles/route.ts
// GET  /api/security/access-profiles        → every profile (name, holders, size)
// POST /api/security/access-profiles {apfDes} → create one; the code is
//                                              generated (APF0000001 …)
//
// Screen: System Settings → User Settings → Access Profile Creation.
// The profile itself is written by
//   PUT /api/security/access-profiles/<APF...>/access   (the tick tree)
// and handed to people by
//   PUT /api/security/assign-profiles/<USR...>
import { NextRequest, NextResponse } from "next/server";
import { createProfile, listProfiles } from "@/lib/accessProfiles";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdminAccess(req, { screen: "ACCESSP", action: "ACCESS" });
    if (!guard.ok) return guard.response;
    return ok(await listProfiles());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the access profiles", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    /* the screen has no NEW_PROFILE chip — creating a profile is a SAVE-level
       action, the same way deleting a user group is */
    const guard = await requireAdminAccess(req, { screen: "ACCESSP", action: "SAVE" });
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => ({}))) as { apfDes?: unknown };
    const created = await createProfile(String(body.apfDes ?? ""));
    return ok(created, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save the profile";
    return err(message, /already exists/i.test(message) ? 409 : 400);
  }
}
