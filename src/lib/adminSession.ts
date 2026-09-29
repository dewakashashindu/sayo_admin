/**
 * Admin session tokens — HMAC-SHA256 signed, edge-runtime compatible.
 * Uses the Web Crypto API so it works both in Next.js middleware (edge)
 * and in Node route handlers. No external JWT dependency required.
 *
 * ── 2026-09-29, two security fixes live in this file ────────────────────────
 *
 * 1. AUDIENCE (`aud`). The customer cookie used to be signed by exactly the
 *    same functions as the admin cookie, so a token handed out by the PUBLIC
 *    /api/auth/register endpoint was accepted as an admin session (renaming the
 *    cookie was enough). Every token now carries `aud: 'admin' | 'customer'`
 *    and the verifier only accepts the audience it asked for. Old tokens have
 *    no `aud` and are therefore refused — everyone signs in once more.
 *
 * 2. SESSION VERSION (`sv`). A token carries a short fingerprint of the stored
 *    password hash it was created from. Node-side checks (src/lib/sessionGuard.ts
 *    and /api/security/my-access) compare it with the row, so changing a
 *    password — or an admin deleting/disabling the account — kills the old
 *    cookie immediately. (The edge middleware cannot read MySQL, so it still
 *    goes by signature + expiry alone; every API that returns data goes through
 *    the Node-side check.)
 */

export const ADMIN_COOKIE = 'sayo_admin_session';

/** How long a session lives. Override with SESSION_HOURS in .env (1–24). */
export const SESSION_HOURS = (() => {
  const raw = Number(process.env.SESSION_HOURS);
  if (!Number.isFinite(raw) || raw < 1) return 4;
  return Math.min(24, Math.floor(raw));
})();

export type SessionAudience = 'admin' | 'customer';

export type AdminSessionPayload = {
  uid: string;                // UserId (tbl_userdetails) or CusCode (customers)
  log: string;                // LogName (staff) or e-mail (customers)
  name: string;               // display name
  aud: SessionAudience;       // who this token is for
  exp: number;                // expiry epoch ms
  sv?: string;                // password fingerprint (staff tokens)
  phone?: string;
  gender?: string;
};

/** What callers pass in — exp/aud are added by createSessionToken(). */
export type NewSessionInput = Omit<AdminSessionPayload, 'exp' | 'aud'>;

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.trim().length < 16) return null;
  return new TextEncoder().encode(s);
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array | null {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    secret as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Short fingerprint of a stored password hash. Only used to notice that the
 * password changed — it never leaves the server inside a readable form and it
 * is useless without the signature over it.
 */
export async function sessionVersion(passwordHash: string): Promise<string> {
  const bytes = new TextEncoder().encode(`sayo-sv|${String(passwordHash ?? '').trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** Creates a signed session token. Returns null if AUTH_SECRET is not configured. */
export async function createSessionToken(
  p: NewSessionInput,
  aud: SessionAudience = 'admin',
): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;

  const payload: AdminSessionPayload = {
    ...p,
    aud,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };

  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body) as unknown as BufferSource);
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * Verifies signature, expiry AND audience. Returns the payload or null.
 * `aud` defaults to 'admin', so every existing caller keeps working — and a
 * customer token can no longer pass for an admin one.
 */
export async function verifySessionToken(
  token: string | undefined | null,
  aud: SessionAudience = 'admin',
): Promise<AdminSessionPayload | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const bodyBytes = new TextEncoder().encode(body);
  const sigBytes = b64urlDecode(sig);
  if (!sigBytes) return null;

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes as unknown as BufferSource,
    bodyBytes as unknown as BufferSource,
  );
  if (!ok) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)!)) as AdminSessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!payload.uid || !payload.log) return null;
    /* THE fix for the customer→admin token swap: the audience is inside the
       signed body, so a customer token can never be presented as an admin one
       (and vice versa). Tokens minted before this change carry no `aud` and
       are refused — a fresh sign-in is required, which is intended. */
    if (payload.aud !== aud) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Cookie options used when setting the session cookie. */
export function adminCookieOptions() {
  return {
    httpOnly: true,                                   // not readable from JavaScript
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',    // HTTPS-only in production
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  };
}

/* Back-compatible aliases */
export const createAdminToken = createSessionToken;
export const verifyAdminToken = verifySessionToken;
