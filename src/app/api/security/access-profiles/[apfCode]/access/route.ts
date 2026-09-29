// src/app/api/security/access-profiles/[apfCode]/access/route.ts
// GET / PUT  /api/security/access-profiles/APF0000001/access
//
// The tick tree of ONE profile. Same shape the group profiles used:
//   FuncID = cipher(screen code), ACCESS = cipher(bitmask in catalog order),
//   Auth   = 1 when the screen itself is granted.
// Saving is a full snapshot: the profile gets a row for every screen in the
// catalog (61 of them), so removing a tick is as real as adding one.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseKeys, loadProfile, profileExists, profileNameOf, saveProfile } from "@/lib/accessProfiles";
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ apfCode: string }> }) {
  try {
    const guard = await requireAdminAccess(_req, { screen: "ACCESSP", action: "ACCESS" });
    if (!guard.ok) return guard.response;

    const { apfCode: raw } = await ctx.params;
    const apfCode = trim(raw).slice(0, 10);
    if (!apfCode) return err("Profile code is missing.");
    if (!(await profileExists(apfCode))) return err(`Profile ${apfCode} was not found.`, 404);

    const { keys, locations } = await loadProfile(apfCode);
    const apfDes = await profileNameOf(apfCode);
    return ok({ apfCode, apfDes, keys, locations });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the profile", 500);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ apfCode: string }> }) {
  try {
    const guard = await requireAdminAccess(req, { screen: "ACCESSP", action: "SAVE" });
    if (!guard.ok) return guard.response;

    const { apfCode: raw } = await ctx.params;
    const apfCode = trim(raw).slice(0, 10);
    if (!apfCode) return err("Profile code is missing.");
    if (!(await profileExists(apfCode))) return err(`Profile ${apfCode} was not found.`, 404);

    const body = (await req.json().catch(() => ({}))) as { keys?: unknown; locations?: unknown };
    const keys = Array.isArray(body.keys) ? (body.keys as { screenCode?: unknown; actionCode?: unknown }[]) : [];
    const locations = Array.isArray(body.locations)
      ? [...new Set(body.locations.map((v) => trim(v).slice(0, 10)).filter(Boolean))]
      : [];

    let granted: Map<string, Set<string>>;
    try {
      granted = collapseKeys(keys);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Unknown permission.", 400);
    }

    if (locations.length > 0) {
      const ph = locations.map(() => "?").join(",");
      const inDb = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM tbl_locationmaster WHERE LocCode IN (${ph})`,
        ...locations,
      );
      if (Number(inDb[0]?.n || 0) !== locations.length) {
        return err("One of the selected locations was not found.", 400);
      }
    }

    const count = await saveProfile(apfCode, granted, locations);
    return ok({ apfCode, granted: count, locations: locations.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save the profile", 500);
  }
}
