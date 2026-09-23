
/** The header `server.mjs` writes with the real socket address. */
export const REAL_IP_HEADER = "x-sayo-ip";

export const IP_TOKEN_HEADER = "x-sayo-ip-token";

/** How many proxies sit in front of the app (`TRUST_PROXY`). 0 = none. */
export function trustProxyCount(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.TRUST_PROXY ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

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
