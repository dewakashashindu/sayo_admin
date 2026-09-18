// src/app/api/health/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// “Is the database reachable?” — one URL, no sign-in needed, because signing in
// itself needs the database.
//
//   http://192.168.1.100:3000/api/health
//
// WHAT THE PUBLIC SEES (anyone who opens the URL)
//   { reachable: true,  latencyMs: 82 }
//   { reachable: false, latencyMs: null, hint: "The application could not
//     reach its database. The shop's technical contact has the details." }
//
// WHAT A SIGNED-IN ADMIN SEES (the browser already holds a valid session)
//   …plus host / database / user / serverVersion / the database error code.
//
// WHY THE SPLIT: the host, the database name, the user name and the server
// version are a map for anyone scanning the network — that was a real leak on a
// public endpoint. They are still exactly what the shop needs while fixing a
// database problem, so they stayed, but only behind a session. The session
// cookie is signed with AUTH_SECRET and checked locally, so this works even
// while the database is down.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { checkDatabase } from "@/lib/dbHealth";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/adminSession";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* It asks the database a question every time, so it is counted as well. */
const HEALTH_IP_LIMIT = 60;                 // per caller
const HEALTH_WINDOW_MS = 60 * 1000;

export async function GET(req: NextRequest) {
  const caller = clientIp(req);
  const allowed = rateLimit({
    bucket: "health:ip",
    key: caller,
    limit: HEALTH_IP_LIMIT,
    windowMs: HEALTH_WINDOW_MS,
  });
  if (!allowed.ok) {
    return NextResponse.json(
      { success: false, error: "Too many health checks. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfterSec) } },
    );
  }

  const health = await checkDatabase();

  /* a valid admin session cookie — verified without touching the database */
  const session = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);

  const minimal = {
    success: health.reachable,
    checkedAt: new Date().toISOString(),
    database: {
      reachable: health.reachable,
      latencyMs: health.latencyMs,
    },
    hint: health.reachable
      ? null
      : "The application could not reach its database. The shop's technical contact has the details.",
  };

  if (!session) {
    return NextResponse.json(minimal, { status: health.reachable ? 200 : 503 });
  }

  /* signed in — the details the shop needs to fix a database problem */
  return NextResponse.json(
    {
      ...minimal,
      hint: health.hint,
      error: health.error,
      code: health.code,
      database: {
        reachable: health.reachable,
        latencyMs: health.latencyMs,
        host: health.target.host,
        database: health.target.database,
        user: health.target.user,
        serverVersion: health.serverVersion,
      },
    },
    { status: health.reachable ? 200 : 503 },
  );
}
