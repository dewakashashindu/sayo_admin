// src/lib/superAdmin.ts
// ─────────────────────────────────────────────────────────────────────────────
// The ONE hidden super administrator.
//
// Rules this file exists to keep true, everywhere in the app:
//   • the account has every permission and every location (never from the
//     access-profile tables — a profile can be deleted by accident and would
//     lock the owner out of his own panel);
//   • the account is never listed on any screen and can never be edited or
//     deleted through the API — it only exists as a row in tbl_userdetails;
//   • a password alone is not enough to sign in: an OTP (SMS + e-mail) is
//     required on top (see src/lib/adminOtp.ts).
//
// The ids below must stay in step with scripts/create-superadmin.mjs and with
// the SQL in scripts/create-superadmin.sql.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_ACCESS_NODES } from "@/lib/accessCatalog";

export const DEFAULT_SUPER_ADMIN_USER_ID = "USR0000000";
export const DEFAULT_SUPER_ADMIN_GROUP_ID = "GRP0000000";

/**
 * Roles that are never gated out of anything, on top of the hidden super
 * administrator (whose group id is checked separately, by group AND user id).
 *
 * ── THIS LIST IS DELIBERATELY EMPTY ─────────────────────────────────────────
 * It used to hold "GRP0000001" (the built-in Administrator role). That meant
 * whoever sat in the Administrator group received all 209 keys and every
 * location whatever the saved profile said — so putting a person into that
 * group silently handed them everything, and the role's saved Access Profile
 * was ignored on the screen.
 *
 * With the list empty, every role except the super administrator gets exactly
 * what Settings → Access Profiles saved for it. If a role has NO profile saved
 * yet, its members see nothing (strict mode) — so save the profile, or log in
 * with the super administrator account (GRP0000000), which always has all of it.
 *
 * To bring the old safety net back, put the group id here again:
 *     export const BUILT_IN_ADMIN_GROUP_IDS: string[] = ["GRP0000001"];
 * Nothing else has to change.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const BUILT_IN_ADMIN_GROUP_IDS: string[] = [];

const trimUp = (v: unknown) => String(v ?? "").trim().toUpperCase();

/** UserId of the hidden super administrator (env override wins). */
export function superAdminUserId(): string {
  return (process.env.SUPER_ADMIN_USER_ID?.trim() || DEFAULT_SUPER_ADMIN_USER_ID)
    .toUpperCase()
    .slice(0, 10);
}

/** GroupId written into the super administrator's tbl_userdetails row. */
export function superAdminGroupId(): string {
  return (process.env.SUPER_ADMIN_GROUP_ID?.trim() || DEFAULT_SUPER_ADMIN_GROUP_ID)
    .toUpperCase()
    .slice(0, 10);
}

export function isSuperAdminUserId(userId?: string | null): boolean {
  const id = trimUp(userId);
  return id !== "" && id === superAdminUserId();
}

export function isSuperAdminGroupId(groupId?: string | null): boolean {
  const id = trimUp(groupId);
  return id !== "" && id === superAdminGroupId();
}

/** True for the hidden super administrator, by user id or by group id. */
export function isSuperAdmin(ids: { userId?: string | null; groupId?: string | null }): boolean {
  return isSuperAdminUserId(ids.userId) || isSuperAdminGroupId(ids.groupId);
}

/**
 * True for a role that must never be locked out of anything: the super
 * administrator, or the built-in Administrator role.
 */
export function hasNeverLockedOutPower(groupId?: string | null): boolean {
  const id = trimUp(groupId);
  return isSuperAdminGroupId(id) || BUILT_IN_ADMIN_GROUP_IDS.includes(id);
}

/** Every (screen, action) pair in the catalog — "APPT.NEW_BOOKING" style. */
export function allAccessKeys(): string[] {
  return ALL_ACCESS_NODES.flatMap((n) => n.actions.map((a) => `${n.code}.${a}`));
}

/**
 * A WHERE fragment every "list the staff" query can reuse, so the hidden
 * account cannot reappear through a query somebody adds later.
 * Returned as SQL text — callers splice it with Prisma.raw().
 */
export const HIDE_SUPER_ADMIN_SQL = `RTRIM(UserId) <> '${DEFAULT_SUPER_ADMIN_USER_ID}'`;
