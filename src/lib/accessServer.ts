// src/lib/accessServer.ts
// Server-side permission resolution.
//
// 2026-09-29 — the rules are:
//     a PROFILE's ticks live in Tbl_UserAccess_StdProfile (UserID = APF…)
//     a PERSON's rights live in Tbl_UserAuthorization (UserID = USR…): the
//     union of the profiles assigned to them, which Assign Profiles writes and
//     the admin may adjust per person ("customize")
//     no rows at all      = nothing at all (strict), said plainly in the UI
//
// The old "first touch copies the group's profile into the user" behaviour is
// still gone — nothing is copied behind your back; the rows appear only when
// somebody presses Save on Assign Profiles.
//
// The hidden super administrator keeps its escape hatch — see my-access.
import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";
import { resolveUserAccess } from "@/lib/accessProfiles";
import { prisma } from "@/lib/prisma";

export interface AccessBag {
  userId: string;
  userName: string;
  groupId: string;
  workingLocId: string;
  /**
   * "profiles" = at least one profile is assigned,
   * "custom"   = the person has rows but no profile assigned (rows written by
   *              hand, or left over from the old model),
   * "none"     = no rows at all → nothing is allowed.
   */
  source: "profiles" | "custom" | "none";
  /** the profile codes assigned to this person (for the screens) */
  profiles: string[];
  keys: Set<string>;           // "APPT.NEW_BOOKING" style
  locations: string[];         // allowed LocCodes
  has: (code: string, action?: string) => boolean;
}

const trim = (v: unknown) => String(v ?? "").trim();

/** Keep the catalog honest: drop keys for screens that no longer exist. */
function knownKeys(keys: Set<string>): Set<string> {
  const codes = new Set(ALL_ACCESS_NODES.map((n) => n.code));
  const out = new Set<string>();
  for (const k of keys) {
    const [screen] = k.split(".");
    if (screen && codes.has(screen)) out.add(k);
  }
  return out;
}

export async function loadAccessForUser(userIdRaw: string): Promise<AccessBag> {
  const userId = trim(userIdRaw).slice(0, 10);

  const users = await prisma.$queryRaw<
    { UserName: string | null; GroupId: string | null; WorkingLocID: string | null }[]
  >`
    SELECT UserName, GroupId, WorkingLocID FROM tbl_userdetails WHERE UserId = ${userId}
  `.catch(() => [] as { UserName: string | null; GroupId: string | null; WorkingLocID: string | null }[]);
  const u = users[0];

  const empty: AccessBag = {
    userId,
    userName: trim(u?.UserName),
    groupId: trim(u?.GroupId),
    workingLocId: trim(u?.WorkingLocID),
    source: "none",
    profiles: [],
    keys: new Set(),
    locations: [],
    has: () => false,
  };
  if (!u) return empty;

  const { profileCodes, keys, locations } = await resolveUserAccess(userId);
  const known = knownKeys(keys);
  const hasRows = known.size > 0 || locations.length > 0 || profileCodes.length > 0;
  return {
    ...empty,
    source: profileCodes.length > 0 ? "profiles" : hasRows ? "custom" : "none",
    profiles: profileCodes,
    keys: known,
    locations,
    has: (code: string, action = "ACCESS") => known.has(`${code}.${action}`),
  };
}
