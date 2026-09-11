/**
 * Admin session tokens — HMAC-SHA256 signed, edge-runtime compatible.
 * Uses the Web Crypto API so it works both in Next.js middleware (edge)
 * and in Node route handlers. No external JWT dependency required.
 */

export const ADMIN_COOKIE = 'sayo_admin_session';
export const SESSION_HOURS = 8;

export type AdminSessionPayload = {
  uid: string;   // UserId (tbl_userdetails) or CusCode (customers)
  log: string;   // LogName (staff) or e-mail (customers)
  name: string;  // display name
  exp: number;   // expiry epoch ms
  phone?: string;
  gender?: string;
};

/* ── helpers ─────────────────────────────────────────────── */

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

/* ── public API ──────────────────────────────────────────── */

/** Creates a signed session token. Returns null if AUTH_SECRET is not configured. */
export async function createSessionToken(p: Omit<AdminSessionPayload, 'exp'>): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;

  const payload: AdminSessionPayload = {
    ...p,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };

  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body) as unknown as BufferSource);
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verifies signature + expiry. Returns the payload or null. */
export async function verifySessionToken(token: string | undefined | null): Promise<AdminSessionPayload | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split('.');
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
