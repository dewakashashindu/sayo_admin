'use client';
// src/lib/useMyAccess.ts
// Client hook: resolves the logged-in user's permissions (+ locations) from the
// server, so the UI can hide what the API would refuse anyway.
//
// 2026-09-29 fixes (see AUTH_SECURITY_REVIEW.md #5 and #2)
//   • FAIL CLOSED. `has()` used to be `!loaded || perms.has(...)`, so every
//     button was available for as long as the fetch took. Now nothing is
//     granted until the answer has arrived.
//   • NO CROSS-USER MEMORY. The payload was cached in localStorage under one
//     key for everybody, so on a shared shop computer the next person to sign
//     in briefly saw the previous person's permissions — and if the request
//     failed, that stale answer stayed. The cache now lives in memory only
//     (gone on reload), and logout clears it.
//   • 401 → the server says the session is no longer live (account disabled,
//     password changed, user deleted …) → drop everything and go to the sign-in
//     screen instead of showing a half-working panel.
import { useEffect, useMemo, useState } from "react";
import { displayNameOf, initialOf } from "@/lib/displayName";

export interface MyAccess {
  loaded: boolean;
  enforce: boolean;                    // always true once loaded (strict)
  has: (code: string, action?: string) => boolean;
  perms: Set<string>;
  locRight: string[];                  // role-granted locations
  workLoc: string;                     // location assigned in user details
  allowedLocCodes: Set<string>;        // workLoc ∪ locRight (the union)
  userId: string;                      // tbl_userdetails.UserId
  loginName: string;                   // what they signed in with
  displayName: string;                 // the name the header prints (no MR./MRS.)
  initial: string;                     // the letter in the avatar
}

interface AccessPayload {
  keys: string[];
  locations: string[];
  workingLocId: string;
  userId: string;
  name: string;        // the person's own name
  userName: string;    // the login name
}

/** The old localStorage key — removed on sight so no stale profile survives. */
const LEGACY_LS_KEY = "sayo.access.v1";

/* In-memory only: one tab, one signed-in person, and gone on every reload. */
let cache: AccessPayload | null = null;
let inflight: Promise<AccessPayload | null> | null = null;
let revoked = false;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((fn) => fn()); }

/** Only ever called when the server refuses the session. */
function dropEverythingAndLeave() {
  revoked = true;
  cache = null;
  notify();
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (here.startsWith("/admin-login")) return; // already there
  const target = `/admin-login?next=${encodeURIComponent(here)}`;
  window.location.href = target;
}

async function loadAccess(): Promise<AccessPayload | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/security/my-access", { cache: "no-store" });

      if (res.status === 401) {
        /* the session is valid-looking but the account is not live any more */
        dropEverythingAndLeave();
        return null;
      }

      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          keys?: string[];
          locations?: string[];
          workingLocId?: string;
          userId?: string;
          name?: string;
          userName?: string;
        };
      };
      if (!res.ok || !json?.success || !json.data) {
        /* A refusal/failure must NOT keep the old answer — lock the UI. */
        cache = { keys: [], locations: [], workingLocId: "", userId: "", name: "", userName: "" };
        return cache;
      }
      cache = {
        keys: json.data.keys ?? [],
        locations: json.data.locations ?? [],
        workingLocId: json.data.workingLocId ?? "",
        userId: json.data.userId ?? "",
        name: json.data.name ?? "",
        userName: json.data.userName ?? "",
      };
      return cache;
    } catch {
      /* network failure: lock rather than trust whatever was there before */
      cache = { keys: [], locations: [], workingLocId: "", userId: "", name: "", userName: "" };
      return cache;
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

/** Wipe the cached access data (logout, or after your own profile changes). */
export function clearAccessCache() {
  cache = null;
  inflight = null;
  revoked = false;
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(LEGACY_LS_KEY); } catch { /* private mode */ }
  }
  notify();
}

/** Re-fetch access data (e.g. after own profile changes). */
export function refreshAccess() {
  cache = null;
  void loadAccess();
}

export function useMyAccess(): MyAccess {
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState<boolean>(cache !== null || revoked);

  useEffect(() => {
    /* the previous version stored the profile in localStorage under one key for
       every user — make sure nothing of that survives */
    try { window.localStorage.removeItem(LEGACY_LS_KEY); } catch { /* private mode */ }

    const onChange = () => {
      setReady(cache !== null || revoked);
      setVersion((v) => v + 1);
    };
    listeners.add(onChange);
    void loadAccess();
    return () => { listeners.delete(onChange); };
  }, []);

  const loaded = cache !== null || ready;

  return useMemo(() => {
    const perms = new Set<string>(cache?.keys ?? []);
  const locRight = cache?.locations ?? [];
  const workLoc = (cache?.workingLocId ?? "").trim();
  /* UNION, not fallback: the person's own location always counts, and the
     locations ticked on their access profiles are added to it. (Before this,
     ticking one location on a profile threw the person's own branch away.) */
  const allowedLocCodes = new Set<string>();
  if (workLoc) allowedLocCodes.add(workLoc);
  for (const code of locRight) {
    const c = String(code ?? "").trim();
    if (c) allowedLocCodes.add(c);
  }
    /* FAIL CLOSED: no answer yet (or no permission) → no. Before this change a
       slow or failed request left every button enabled. */
    const has = (code: string, action = "ACCESS") =>
      loaded && !revoked && perms.has(`${code}.${action}`);
    void version;
    const displayName = displayNameOf(cache?.name, cache?.userName);
    return {
      loaded, enforce: loaded, has, perms, locRight, workLoc, allowedLocCodes,
      userId: cache?.userId ?? "",
      loginName: cache?.userName ?? "",
      displayName,
      initial: initialOf(displayName),
    };
  }, [loaded, version]);
}
