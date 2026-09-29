// src/lib/safeNext.ts
// One place that decides whether a "?next=" / "?redirect=" value may be used
// as a navigation target.
//
// Why this exists (AUTH_SECURITY_REVIEW.md #6)
//   The old test was `next.startsWith("/")`, which also accepts `//evil.com`
//   and `/\evil.com` — the browser reads those as protocol-relative URLs and
//   leaves the site. After sign-in that is a convincing place to land a user,
//   so only an in-app path is honoured; anything else falls back.
//
//   Examples:  /dashboard          ✅
//              /appointment/12     ✅
//              //evil.com          ❌
//              /\evil.com          ❌
//              https://evil.com    ❌
//              javascript:alert(1) ❌
//              \n/dashboard        ❌ (control characters)
export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;

  const value = raw.trim();
  if (value.length === 0 || value.length > 2000) return fallback;

  /* control characters (newlines, tabs, NUL) — some browsers ignore them and
     then read the rest as a URL */
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  if (!value.startsWith("/")) return fallback;      // absolute URL or scheme
  if (value.startsWith("//")) return fallback;      // protocol-relative host
  if (value.startsWith("/\\") || value.includes("\\")) return fallback;

  /* a path that starts with "//" only after decoding is still a host */
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* keep raw */ }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  if (/^\/%2f/i.test(value)) return fallback;

  return value;
}
