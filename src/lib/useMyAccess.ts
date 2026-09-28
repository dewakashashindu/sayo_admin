'use client';
// src/lib/useMyAccess.ts
// Client hook: resolves the logged-in user's permissions (+ locations).
// Strict mode: once loaded, permissions are fully enforced — a user with no
// saved profile gets nothing.
//
// The data is fetched ONCE per app session and shared by every consumer
// (pages + sidebar), and is seeded from localStorage so there is no
// flash of unlocked content across page navigations.
import { useEffect, useMemo, useState } from "react";

export interface MyAccess {
  loaded: boolean;
  enforce: boolean;                    // always true once loaded (strict)
  has: (code: string, action?: string) => boolean;
  perms: Set<string>;
  locRight: string[];                  // role-granted locations
  workLoc: string;                     // location assigned in user details
  allowedLocCodes: Set<string>;        // locRight, else just workLoc
}

interface AccessPayload {
  keys: string[];
  locations: string[];
  workingLocId: string;
}

const LS_KEY = "sayo.access.v1";

let cache: AccessPayload | null = null;
let inflight: Promise<AccessPayload | null> | null = null;
const listeners = new Set<() => void>();

function seedFromStorage(): AccessPayload | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccessPayload>;
    return {
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations : [],
      workingLocId: typeof parsed.workingLocId === "string" ? parsed.workingLocId : "",
    };
  } catch {
    return null;
  }
}

function saveToStorage(p: AccessPayload | null) {
  try {
    if (p) window.localStorage.setItem(LS_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(LS_KEY);
  } catch { /* private mode */ }
}

function notify() { listeners.forEach((fn) => fn()); }

async function loadAccess(): Promise<AccessPayload | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/security/my-access", { cache: "no-store" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { keys?: string[]; locations?: string[]; workingLocId?: string };
      };
      const payload: AccessPayload = {
        keys: json?.success && json.data ? (json.data.keys ?? []) : [],
        locations: json?.success && json.data ? (json.data.locations ?? []) : [],
        workingLocId: json?.success && json.data ? (json.data.workingLocId ?? "") : "",
      };
      cache = payload;
      saveToStorage(payload);
      return payload;
    } catch {
      // network/parse failure: keep whatever cache had; if none, mark loaded-empty
      if (!cache) cache = { keys: [], locations: [], workingLocId: "" };
      return cache;
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

/** Wipe the cached access data (call this on logout/login switch). */
export function clearAccessCache() {
  cache = null;
  saveToStorage(null);
  notify();
}

/** Re-fetch access data (e.g. after own profile changes). */
export function refreshAccess() {
  void loadAccess();
}

export function useMyAccess(): MyAccess {
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState<boolean>(cache !== null);

  useEffect(() => {
    const onChange = () => {
      setReady(cache !== null);
      setVersion((v) => v + 1);
    };
    listeners.add(onChange);
    // Seed synchronously from storage, then always revalidate from the API.
    if (!cache) {
      const seeded = seedFromStorage();
      if (seeded) {
        cache = seeded;
        notify();
      } else {
        setReady(true); // nothing cached & not yet fetched
      }
    }
    void loadAccess();
    return () => { listeners.delete(onChange); };
  }, []);

  const loaded = cache !== null || ready;
  return useMemo(() => {
    const perms = new Set<string>(cache?.keys ?? []);
    const locRight = cache?.locations ?? [];
    const workLoc = (cache?.workingLocId ?? "").trim();
    const allowedLocCodes = new Set<string>(
      locRight.length ? locRight : workLoc ? [workLoc] : [],
    );
    const has = (code: string, action = "ACCESS") =>
      !loaded || perms.has(`${code}.${action}`); // before load: optimistic-open to avoid UI flicker of locked content
    void version;
    return { loaded, enforce: loaded, has, perms, locRight, workLoc, allowedLocCodes };
  }, [loaded, version]);
}
