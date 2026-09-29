// src/lib/sessionGuard.ts
// ─────────────────────────────────────────────────────────────────────────────
// The server-side answer to "may THIS caller do THIS?".
//
// Before: /api/security/* and friends were protected by the middleware alone —
// which only asked "is there a valid signed cookie?". Every permission in
// Access Profiles lived in the browser, so any signed-in user (a technician, a
// cashier, and — before the audience fix — even a customer account created by
// the public sign-up endpoint) could read the whole staff list, delete users or
// grant themselves permissions with a hand-made request.
//
// Every protected route now starts with:
//
//     const guard = await requireAdminAccess(req, { screen: "USERS", action: "SAVE" });
//     if (!guard.ok) return guard.response;
//
// What the guard does, in order:
//   1. the cookie must be a signed ADMIN session (audience "admin");
//   2. the account must still be live in tbl_userdetails — Enable = 1 — and the
//      password fingerprint inside the token must still match the stored hash
//      (so disabling / deleting / re-passwording an account kills its sessions);
//   3. the caller must hold the requested permission, unless they are the hidden
//      super administrator or in a never-locked-out role.
//
// The account state is cached for 15 seconds, so a page that fires ten calls
// does not run ten extra queries. Changing a password or editing a user calls
// forgetAccountState() and the next request re-reads it immediately.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { ADMIN_COOKIE, sessionVersion, verifySessionToken, type AdminSessionPayload } from "@/lib/adminSession";
import { prisma } from "@/lib/prisma";
import { loadAccessForUser, type AccessBag } from "@/lib/accessServer";
import { allAccessKeys, hasNeverLockedOutPower, isSuperAdmin } from "@/lib/superAdmin";

export interface AccountState {
  userId: string;
  userName: string;
  groupId: string;
  workingLocId: string;
  enable: boolean;
  psw: string;
}

const STATE_TTL_MS = 15_000;
const stateCache = new Map<string, { at: number; state: AccountState | null }>();

/** Drop the cached row — call after a password change or a user edit. */
export function forgetAccountState(userId?: string | null): void {
  const id = String(userId ?? "").trim();
  if (id) stateCache.delete(id);
  else stateCache.clear();
}

async function loadAccountState(userId: string): Promise<AccountState | null> {
  const id = String(userId ?? "").trim().slice(0, 10);
  if (!id) return null;

  const cached = stateCache.get(id);
  if (cached && Date.now() - cached.at < STATE_TTL_MS) return cached.state;

  let state: AccountState | null = null;
  try {
    const rows = await prisma.$queryRaw<{
      UserId: string; UserName: string | null; GroupId: string | null;
      WorkingLocID: string | null; PSW: string | null; Enable: number | boolean | null;
    }[]>`
      SELECT RTRIM(UserId) AS UserId, RTRIM(UserName) AS UserName, RTRIM(GroupId) AS GroupId,
             RTRIM(WorkingLocID) AS WorkingLocID, PSW AS PSW, Enable AS Enable
      FROM tbl_userdetails WHERE UserId = ${id} LIMIT 1
    `;
    const row = rows[0];
    if (row) {
      state = {
        userId: String(row.UserId ?? "").trim(),
        userName: String(row.UserName ?? "").trim(),
        groupId: String(row.GroupId ?? "").trim(),
        workingLocId: String(row.WorkingLocID ?? "").trim(),
        enable: Number(row.Enable) === 1,
        psw: String(row.PSW ?? "").trim(),
      };
    }
  } catch (err) {
    console.error("[sessionGuard] could not read the account row:", err instanceof Error ? err.message : err);
    return null; // fail closed
  }

  stateCache.set(id, { at: Date.now(), state });
  return state;
}

export type GuardOk = {
  ok: true;
  session: AdminSessionPayload;
  account: AccountState;
  bag: AccessBag;
  keys: Set<string>;
};
export type GuardFail = { ok: false; response: NextResponse };
export type GuardResult = GuardOk | GuardFail;

function unauthorized(reason: string): GuardFail {
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: "Unauthorized", reason }, { status: 401 }),
  };
}

function forbidden(screen: string, action: string): GuardFail {
  return {
    ok: false,
    response: NextResponse.json(
      {
        success: false,
        error: `You do not have permission to do this (${screen}.${action}).`,
        screen,
        action,
      },
      { status: 403 },
    ),
  };
}

/**
 * Is there a live, un-revoked admin session? No permission check.
 * Use it for things every signed-in staff member may do (e.g. reading their
 * own access bag).
 */
export async function requireAdminSession(
  req: { cookies: { get(name: string): { value: string } | undefined } },
): Promise<{ ok: true; session: AdminSessionPayload; account: AccountState } | GuardFail> {
  const payload = await verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value, "admin");
  if (!payload) return unauthorized("no-session");

  const account = await loadAccountState(payload.uid);
  if (!account) return unauthorized("account-not-found");
  if (!account.enable) return unauthorized("account-disabled");

  /* session version — a password change signs every old cookie out */
  if (payload.sv && account.psw) {
    const current = await sessionVersion(account.psw);
    if (current !== payload.sv) return unauthorized("password-changed");
  }

  return { ok: true, session: payload, account };
}

export interface NeedPermission {
  screen: string;
  action?: string; // "ACCESS" when omitted
  anyOf?: { screen: string; action?: string }[];
}

/** The full check: live session + permission. */
export async function requireAdminAccess(
  req: { cookies: { get(name: string): { value: string } | undefined } },
  need: NeedPermission,
): Promise<GuardResult> {
  const base = await requireAdminSession(req);
  if (!base.ok) return base;

  const { session, account } = base;
  const bag = await loadAccessForUser(session.uid);

  let keys = bag.keys;
  const neverLockedOut =
    isSuperAdmin({ userId: session.uid, groupId: account.groupId }) ||
    hasNeverLockedOutPower(account.groupId);
  if (neverLockedOut) keys = new Set(allAccessKeys());

  const wanted: { screen: string; action: string }[] = [
    { screen: need.screen, action: need.action ?? "ACCESS" },
    ...(need.anyOf ?? []).map((w) => ({ screen: w.screen, action: w.action ?? "ACCESS" })),
  ];

  const allowed = wanted.some((w) => keys.has(`${w.screen}.${w.action}`));
  if (!allowed) {
    const first = wanted[0];
    console.warn(
      `[sessionGuard] denied ${first.screen}.${first.action} for ${session.uid} (group ${account.groupId || "none"})`,
    );
    return forbidden(first.screen, first.action);
  }

  return { ok: true, session, account, bag, keys };
}
