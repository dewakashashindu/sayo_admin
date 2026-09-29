'use client';
// src/lib/logout.ts
// Signing out must leave nothing of the previous person behind in the tab:
//   • the server session cookie is cleared (POST /api/auth/admin-logout),
//   • the cached access profile is dropped (clearAccessCache).
//
// Why (AUTH_SECURITY_REVIEW.md #5): the access profile used to sit in
// localStorage under one shared key, so on a shop computer the next person to
// sign in briefly saw the previous person's menus and buttons — and if the
// permission request failed, that stale answer stayed forever.
import { clearAccessCache } from '@/lib/useMyAccess';

/** Clear the session cookie + the client-side access cache. Best effort. */
export async function logoutAdmin(): Promise<void> {
  clearAccessCache();
  try {
    await fetch('/api/auth/admin-logout', {
      method: 'POST',
      keepalive: true,          // let the request finish even while we navigate
      credentials: 'same-origin',
    });
  } catch {
    /* the navigation below still happens; the middleware will bounce any
       request that arrives without a live session */
  }
}
