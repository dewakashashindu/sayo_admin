// src/app/api/security/assign-profiles/[userId]/route.ts
// PUT /api/security/assign-profiles/USR0000007
//     { apfCodes: ["APF0000001", …], keys?: [{screenCode, actionCode}, …], locations?: ["LOC0000001"] }
//
// Writes the person's rows in Tbl_UserAuthorization: one row per screen, one per
// branch, and one per profile they hold (Module = 'APF').
//
//   apfCodes          — the profiles the person holds (snapshot: removing a chip
//                       really removes the rights)
//   keys / locations  — optional. When sent, these are the person's OWN ticks
//                       ("customized" — the screen lets an admin adjust the
//                       union). When omitted, the union of the profiles is
//                       written, which is what a plain profile assignment means.
//
// This is the only place where a person's access is written — creating a user
// never touches these tables.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUserAssignments } from "@/lib/accessProfiles";
import { forgetAccountState } from "@/lib/sessionGuard";
import { isSuperAdminUserId } from "@/lib/superAdmin";
import { requireAdminAccess } from "@/lib/sessionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const trim = (v: unknown) => String(v ?? "").trim();

export async function PUT(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const guard = await requireAdminAccess(req, { screen: "ASSIGNP", action: "SAVE" });
    if (!guard.ok) return guard.response;

    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    if (!userId) return NextResponse.json({ success: false, message: "User id is missing." }, { status: 400 });
    if (isSuperAdminUserId(userId)) {
      return NextResponse.json({ success: false, message: `User ${userId} was not found.` }, { status: 404 });
    }

    const exists = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM tbl_userdetails WHERE UserId = ${userId}
    `;
    if (Number(exists[0]?.n || 0) === 0) {
      return NextResponse.json({ success: false, message: `User ${userId} was not found.` }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      apfCodes?: unknown;
      keys?: unknown;
      locations?: unknown;
    };
    const apfCodes = Array.isArray(body.apfCodes) ? body.apfCodes.map((c) => trim(c)) : [];

    const keys = Array.isArray(body.keys)
      ? (body.keys as { screenCode?: unknown; actionCode?: unknown }[]).map((k) => ({
          screenCode: trim(k?.screenCode),
          actionCode: trim(k?.actionCode),
        }))
      : undefined;
    const locations = Array.isArray(body.locations)
      ? [...new Set(body.locations.map((v) => trim(v).slice(0, 10)).filter(Boolean))]
      : undefined;

    /* the branches have to exist, exactly like on the profile screen */
    if (locations && locations.length > 0) {
      const ph = locations.map(() => "?").join(",");
      const inDb = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM tbl_locationmaster WHERE LocCode IN (${ph})`,
        ...locations,
      );
      if (Number(inDb[0]?.n || 0) !== locations.length) {
        return NextResponse.json(
          { success: false, message: "One of the selected locations was not found." },
          { status: 400 },
        );
      }
    }

    const saved = await saveUserAssignments(userId, apfCodes, { keys, locations });

    /* the person's rights may have changed under a live session — drop the
       cached account state so the new set is used from the next request on */
    forgetAccountState(userId);

    return NextResponse.json({ success: true, data: { userId, ...saved } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save the assignments";
    return NextResponse.json(
      { success: false, message },
      /* unknown profile / unknown permission → 400, a missing profile → 404 */
      { status: /was not found/i.test(message) ? 404 : 400 },
    );
  }
}
