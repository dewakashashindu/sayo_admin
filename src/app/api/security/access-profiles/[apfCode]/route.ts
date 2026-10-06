// src/app/api/security/access-profiles/[apfCode]/route.ts
// PUT    /api/security/access-profiles/APF0000001  { apfDes } → rename
// DELETE /api/security/access-profiles/APF0000001            → remove if unused
//
// A profile cannot be deleted while any user's authorization rows still point
// to it; unassign it from every user first.
import { NextRequest, NextResponse } from "next/server";
import { deleteProfile, profileExists, renameProfile, usersUsingProfile } from "@/lib/accessProfiles";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const trim = (v: unknown) => String(v ?? "").trim();
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ apfCode: string }> }) {
  try {
    const guard = await requireAdminAccess(req, { screen: "ACCESSP", action: "SAVE" });
    if (!guard.ok) return guard.response;

    const { apfCode: raw } = await ctx.params;
    const apfCode = trim(raw).slice(0, 10);
    if (!apfCode) return err("Profile code is missing.");
    if (!(await profileExists(apfCode))) return err(`Profile ${apfCode} was not found.`, 404);

    const body = (await req.json().catch(() => ({}))) as { apfDes?: unknown };
    await renameProfile(apfCode, String(body.apfDes ?? ""));
    return ok({ apfCode, apfDes: trim(body.apfDes) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not rename the profile";
    return err(message, /already exists/i.test(message) ? 409 : 400);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ apfCode: string }> }) {
  try {
    const guard = await requireAdminAccess(req, { screen: "ACCESSP", action: "SAVE" });
    if (!guard.ok) return guard.response;

    const { apfCode: raw } = await ctx.params;
    const apfCode = trim(raw).slice(0, 10);
    if (!apfCode) return err("Profile code is missing.");
    if (!(await profileExists(apfCode))) return err(`Profile ${apfCode} was not found.`, 404);

    const holders = await usersUsingProfile(apfCode);
    if (holders > 0) {
      return err(
        `Profile ${apfCode} is assigned to ${holders} user(s) and cannot be deleted. Unassign it from all users first.`,
        409,
      );
    }

    /* deleteProfile checks again inside its transaction, so a concurrent
       assignment cannot turn this preflight check into an orphaned reference. */
    await deleteProfile(apfCode);
    return ok({ apfCode, users: 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete the profile";
    return err(message, /assigned to .* user|cannot be deleted while assigned/i.test(message) ? 409 : 500);
  }
}
