// src/lib/clientIp.ts
// ─────────────────────────────────────────────────────────────────────────────
// WHO IS CALLING — and why this is not just `x-forwarded-for`.
//
// THE HOLE THIS CLOSES
//   `x-forwarded-for` is a header the CALLER writes. On a plain `next start`
//   (no proxy in front) the server does not touch it, so a script can send a
//   different value on every attempt and walk straight past any “8 tries per
//   IP” rule. The address that cannot be faked is the one on the socket.
//
// HOW IT IS DONE HERE
//   1. `server.mjs` (the new `npm start`, and what `server.js` hands over to, so
//      IIS keeps working) reads `req.socket.remoteAddress`, deletes any
//      `x-sayo-ip` the caller sent, and writes the real address into that header
//      together with a per-boot secret. Only this server knows that secret.
//   2. If that socket address is on THIS machine (IIS, or nginx on localhost),
//      the request came through the local web server, which appends the real
//      visitor to `x-forwarded-for`. Take the LAST entry — anything the caller
//      put in front of it is ignored. This is how the hosted Windows site keeps
//      counting visitors apart instead of lumping them into one bucket.
//   3. A proxy that is NOT on this machine needs `TRUST_PROXY=1` (takes the last
//      entry as well). Set `SAYO_IP_SOCKET_ONLY=1` if your proxy passes the
//      header through without appending anything — then only the socket counts.
//   4. Without either, the caller is counted as “unknown” — one shared bucket.
//      A wrong bucket is annoying; a spoofable one is useless, so this is the
//      safe way round. (`npm run dev` keeps working: everything is one bucket
//      until you run the real server.)
// ─────────────────────────────────────────────────────────────────────────────

/** The header `server.mjs` writes with the real socket address. */
export const REAL_IP_HEADER = "x-sayo-ip";

/**
 * …and the header carrying the per-boot secret that proves it wrote them.
 * `server.mjs` makes a fresh random token at start-up, keeps it in
 * `SAYO_IP_TOKEN` and stamps every request with it. Without the token the
 * address header is ignored, so on a plain `next start` (where nothing strips
 * what the caller sent) a forged `x-sayo-ip: 1.2.3.4` cannot buy a fresh
 * rate-limit bucket.
 */
export const IP_TOKEN_HEADER = "x-sayo-ip-token";

/** How many proxies sit in front of the app (`TRUST_PROXY`). 0 = none. */
export function trustProxyCount(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.TRUST_PROXY ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/**
 * Is this address on this very machine? (`127.0.0.0/8`, `::1`)
 *
 * This is the one case where a forwarded header may be believed even though
 * nobody set `TRUST_PROXY`: only a program running on this computer can open a
 * connection that LOOKS like it came from loopback, and a program on this
 * computer is the web server / the hosting panel doing the forwarding. That is
 * the same rule ASP.NET Core follows for IIS (`KnownNetworks` = loopback only).
 * On the shared Windows host this project sits on, IIS sits in front of Node and
 * every visitor would otherwise look like one single address.
 */
export function isLoopbackIp(value: string | null | undefined): boolean {
  const ip = normaliseIp(value);
  if (!ip) return false;
  if (ip === "::1") return true;
  return /^127\./.test(ip);
}

/** 127.0.0.1 → 127.0.0.1 · ::ffff:192.168.1.5 → 192.168.1.5 · ::1 → ::1 */
export function normaliseIp(value: string | null | undefined): string {
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  raw = raw.split(",")[0].trim();

  /* [::1]:3000 → ::1 */
  const bracketed = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) raw = bracketed[1];

  /* 192.168.1.5:3000 → 192.168.1.5 */
  const v4WithPort = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4WithPort) raw = v4WithPort[1];

  /* ::ffff:192.168.1.5 → 192.168.1.5 (how Node reports IPv4 on a dual socket) */
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];

  return raw;
}

/**
 * The caller's address, from headers only (pure — this is the part the tests
 * cover). `header` returns a header value or null.
 *
 * The order matters:
 *   1. the socket address, but only from a request our own `server.mjs` stamped
 *      (token matched) — a caller cannot write the token
 *   2. if that socket address is loopback, the local web server (IIS / nginx) is
 *      the one talking: take the LAST entry of `x-forwarded-for`, which is the
 *      entry that web server appended itself. A caller may write anything in
 *      front of it; it ends up ignored.
 *   3. an explicit `TRUST_PROXY=n` works the same way for proxies that are NOT
 *      on this machine (nginx/cloudflared in front of the app)
 *   4. otherwise the socket address itself
 *   5. and if even that is unknown, one shared bucket
 */
export function clientIpFromHeaders(
  header: (name: string) => string | null | undefined,
  trustProxy = 0,
  ipToken = "",
  socketOnly = false,
): string {
  /* 1. the address our own server measured on the socket — only when it also
        proves that it is our own server doing the talking */
  const tokenSeen = String(header(IP_TOKEN_HEADER) ?? "");
  const socketIp =
    ipToken && tokenSeen && tokenSeen === ipToken
      ? normaliseIp(header(REAL_IP_HEADER))
      : "";

  /* the entries a proxy appended, oldest → newest */
  const chain = String(header("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => normaliseIp(part))
    .filter(Boolean);
  const hop = (back: number) => {
    if (chain.length === 0) return "";
    const index = Math.max(0, chain.length - back);
    return chain[index] || "";
  };

  if (socketOnly) return socketIp || "unknown";

  /* 2. the web server on THIS machine is the caller: believe what it appended */
  if (socketIp && isLoopbackIp(socketIp)) {
    const appended = hop(1);
    if (appended) return appended;
  }

  /* 3. behind a proxy elsewhere (explicit) */
  if (trustProxy > 0) {
    const viaProxy = hop(trustProxy);
    if (viaProxy) return viaProxy;
  }

  /* 4. our own measurement */
  if (socketIp) return socketIp;

  /* 5. nothing trustworthy — everyone shares one bucket */
  return "unknown";
}

/** The caller's address for a request object (anything with headers). */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const flag = String(process.env.SAYO_IP_SOCKET_ONLY ?? "").trim().toLowerCase();
  return clientIpFromHeaders(
    (name) => req.headers.get(name),
    trustProxyCount(),
    String(process.env.SAYO_IP_TOKEN ?? ""),
    flag === "1" || flag === "true",
  );
}

/** “192.168.1.5” → “192.168.1.0/24” for logs (never shown to the caller). */
export function ipForLog(ip: string): string {
  const value = String(ip || "unknown");
  const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  return value.slice(0, 24);
}
