// src/lib/locationScope.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which branches may THIS caller see and touch?
//
// 2026-09-30 — the shop's rule, written down once so every screen and every
// API route answers it the same way:
//
//   • the hidden super administrator (and any never-locked-out role) → every
//     enabled location
//   • everybody else →  the location stored on their own user details
//                       UNION  every location ticked on the access profiles
//                              they were given
//     (ticking locations on a profile ADDS branches — it never takes the
//      person's own "my branch" away)
//   • a person with neither → no branch at all. They see no branch data.
//
// The screens use it to shorten their location pickers; the API routes use it
// to refuse a `locCode` that is outside the set, so a hand-made request cannot
// read or post into a branch the person was never given.
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/sessionGuard";
import { loadAccessForUser } from "@/lib/accessServer";
import { hasNeverLockedOutPower, isSuperAdmin } from "@/lib/superAdmin";
import { prisma } from "@/lib/prisma";

export interface LocationScope {
  userId: string;
  /** super administrator / never-locked-out role → every enabled branch */
  unlimited: boolean;
  /** the LocCode on the person's user details ("my branch") */
  workingLocId: string;
  /** every branch this caller may read or write (codes as stored, trimmed) */
  allowed: Set<string>;
  /** the caller's permission keys ("TECHAPPT.CHANGE_TECH" style) */
  keys: Set<string>;
}

const trim = (v: unknown) => String(v ?? "").trim();

/* The account guard already caches its own state for 15s; the profile tables
   are read on nearly every inventory call, so the resolved scope is kept for
   the same short window. Saves through the access screens call
   forgetLocationScope() so a change lands immediately. */
const TTL_MS = 15_000;
const scopeCache = new Map<string, { at: number; scope: LocationScope }>();

export function forgetLocationScope(userId?: string): void {
  if (!userId) scopeCache.clear();
  else scopeCache.delete(trim(userId).toUpperCase());
}

async function allEnabledLocations(): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<{ LocCode: string }[]>`
      SELECT RTRIM(LocCode) AS LocCode FROM tbl_locationmaster WHERE Enable = 1
    `;
    return rows.map((r) => trim(r.LocCode)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function locationScopeForUser(userIdRaw: string): Promise<LocationScope> {
  const userId = trim(userIdRaw);
  const key = userId.toUpperCase();
  const hit = scopeCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.scope;

  const bag = await loadAccessForUser(userId);
  const unlimited =
    isSuperAdmin({ userId: bag.userId, groupId: bag.groupId }) ||
    hasNeverLockedOutPower(bag.groupId);

  const allowed = new Set<string>();
  if (unlimited) {
    for (const code of await allEnabledLocations()) allowed.add(code);
  } else {
    /* the union — the person's own branch first, then whatever the profiles add */
    if (bag.workingLocId) allowed.add(bag.workingLocId);
    for (const code of bag.locations) {
      const c = trim(code);
      if (c) allowed.add(c);
    }
  }

  const scope: LocationScope = {
    userId: bag.userId || userId,
    unlimited,
    workingLocId: bag.workingLocId,
    allowed,
    keys: bag.keys,
  };
  scopeCache.set(key, { at: Date.now(), scope });
  return scope;
}

/** Does this caller hold `screen.action`? (the super administrator holds all) */
export function scopeHas(scope: LocationScope, screen: string, action = "ACCESS"): boolean {
  return scope.unlimited || scope.keys.has(`${screen}.${action}`);
}

/** The first code in `codes` this caller may NOT use, or null when all are fine. */
export function foreignLocation(
  scope: LocationScope,
  codes: (string | null | undefined)[],
): string | null {
  if (scope.unlimited) return null;
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = trim(raw);
    if (!code) continue;
    const up = code.toUpperCase();
    if (seen.has(up)) continue;
    seen.add(up);
    let ok = false;
    for (const have of scope.allowed) {
      if (have.trim().toUpperCase() === up) {
        ok = true;
        break;
      }
    }
    if (!ok) return code;
  }
  return null;
}

export function locationDeniedMessage(code: string): string {
  return `You do not have access to location ${code}. Ask an administrator to add it to your access profile (or set it as your own location).`;
}

export async function locationScopeForRequest(
  req: NextRequest,
): Promise<{ ok: true; scope: LocationScope } | { ok: false; response: NextResponse }> {
  const live = await requireAdminSession(req);
  if (!live.ok) return { ok: false, response: live.response };
  return { ok: true, scope: await locationScopeForUser(live.session.uid) };
}

/**
 * Throwing variant for the inventory routes: reads like `invActor`, works from
 * inside a transaction helper too. invFail() turns it into a 403 answer.
 */
export class LocationDeniedError extends Error {
  status = 403;
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "LocationDeniedError";
    this.code = code;
  }
}

export async function assertLocationAllowed(
  req: NextRequest,
  codes: string | (string | null | undefined)[] | null | undefined,
): Promise<void> {
  const list = (Array.isArray(codes) ? codes : [codes])
    .map((c) => trim(c))
    .filter(Boolean);
  if (list.length === 0) return;
  const resolved = await locationScopeForRequest(req);
  if (!resolved.ok) throw new LocationDeniedError("Your session has expired — please sign in again.", "session");
  const bad = foreignLocation(resolved.scope, list);
  if (bad) throw new LocationDeniedError(locationDeniedMessage(bad), bad);
}

/**
 * Route helper. Returns a 403 response when the caller may not use any of
 * `codes`, otherwise null. No codes (or an empty list) → nothing to check.
 */
export async function locationGuard(
  req: NextRequest,
  codes: string | (string | null | undefined)[] | null | undefined,
): Promise<NextResponse | null> {
  const list = (Array.isArray(codes) ? codes : [codes])
    .map((c) => trim(c))
    .filter(Boolean);
  if (list.length === 0) return null;

  const resolved = await locationScopeForRequest(req);
  if (!resolved.ok) return resolved.response;

  const bad = foreignLocation(resolved.scope, list);
  if (!bad) return null;
  return NextResponse.json(
    { success: false, error: locationDeniedMessage(bad), message: locationDeniedMessage(bad) },
    { status: 403 },
  );
}
