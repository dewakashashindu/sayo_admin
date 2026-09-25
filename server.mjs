// server.mjs
// ─────────────────────────────────────────────────────────────────────────────
// The production server (this is what `npm start` runs now).
//
// WHY THIS FILE EXISTS
//   On a plain `next start`, the only address the application can see is the
//   `x-forwarded-for` HEADER — and a header is whatever the caller typed. A
//   script can send a new value on every try, which makes “8 attempts per IP”
//   meaningless.
//   The address on the TCP socket cannot be faked. This server reads it and
//   passes it to the app in a header of its own (`x-sayo-ip`), after DELETING
//   any copy the caller sent. Every rate limit in the application is built on
//   that value (see src/lib/clientIp.ts).
//
// BEHIND A REVERSE PROXY (nginx / IIS / Cloudflare)
//   * if the proxy is on THIS machine (the IIS / HttpPlatformHandler setup of
//     the hosted Windows account, or nginx on localhost) nothing has to be set:
//     the application sees a loopback address, knows the local web server is the
//     one talking, and reads the real visitor from the end of
//     `x-forwarded-for` — the entry that web server appended itself.
//   * if the proxy is somewhere else, set
//       TRUST_PROXY=1
//     (one proxy) in the .env / environment.
//   * if your proxy is set up to pass `x-forwarded-for` through WITHOUT
//     appending the caller, set
//       SAYO_IP_SOCKET_ONLY=1
//     so only the address on the socket is ever counted.
//   Either way a copy of the header the CALLER sent never wins: this server
//   deletes the headers below before the application gets to look at them.
//
// PLAIN LAN USE (no proxy) — nothing to set. The socket address is the client.
//
// Nothing else changes: this server hands every request straight to Next.js.
// `npm run dev` still uses `next dev` as before.
// ─────────────────────────────────────────────────────────────────────────────
import { createServer } from "node:http";
import { parse } from "node:url";
import crypto from "node:crypto";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

/* How many proxies sit in front of this server (TRUST_PROXY=1 for nginx). */
const trustProxyRaw = Number(process.env.TRUST_PROXY || 0);
const trustProxy = Number.isFinite(trustProxyRaw) && trustProxyRaw > 0 ? Math.floor(trustProxyRaw) : 0;

/* A fresh secret for every start-up. It travels with the address header, so the
   application can tell “our own server measured this” from “the caller typed
   this”. Nothing outside this process can produce it. */
const ipToken = crypto.randomBytes(24).toString("hex");
process.env.SAYO_IP_TOKEN = ipToken;

/** ::ffff:192.168.1.5 → 192.168.1.5 · [::1]:0 → ::1 */
function normaliseIp(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  raw = raw.split(",")[0].trim();
  const bracketed = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) raw = bracketed[1];
  const v4Port = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4Port) raw = v4Port[1];
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];
  return raw;
}

/** The caller's address: the socket, or the last hop a trusted proxy added. */
function callerAddress(req) {
  const socketIp = normaliseIp(req.socket?.remoteAddress);
  if (trustProxy > 0) {
    const chain = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((part) => normaliseIp(part))
      .filter(Boolean);
    if (chain.length > 0) {
      const index = Math.max(0, chain.length - trustProxy);
      return chain[index] || chain[0];
    }
  }
  return socketIp || "unknown";
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  try {
    /* the caller does not get to say who it is */
    const address = callerAddress(req);
    delete req.headers["x-sayo-ip"];
    delete req.headers["x-sayo-ip-token"];
    delete req.headers["x-real-ip"];
    req.headers["x-sayo-ip"] = address;
    req.headers["x-sayo-ip-token"] = ipToken;
  } catch {
    /* never let this stop a request */
  }
  handle(req, res, parse(req.url || "/", true));
});

server.listen(port, hostname, () => {
  console.log(
    `  ▲ SAYO admin ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}` +
      (dev ? " (development)" : "") +
      (trustProxy > 0 ? `  ·  TRUST_PROXY=${trustProxy}` : ""),
  );
});

/* a tidy stop, so a redeploy does not leave a socket behind */
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
