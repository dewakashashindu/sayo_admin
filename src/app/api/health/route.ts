// src/app/api/health/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// One URL to answer “is the database reachable?” — WITHOUT logging in, because
// logging in itself needs the database. Open this in a browser and send the
// answer back:
//
//   http://localhost:3000/api/health
//
//   { reachable: true,  latencyMs: 82,  target: { host, database, user }, serverVersion: "8.0.32" }
//   { reachable: false, code: "P1001", error: "…", hint: "…", target: { host, database, user } }
//
// The password is never part of the reply. The host / database / user are, so
// they can be compared with the hosting panel line by line.
//
// It is listed as a public route in src/middleware.ts on purpose: when the
// database is down nobody can sign in, and this is the page that says why.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/dbHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const health = await checkDatabase();
  return NextResponse.json(
    {
      success: health.reachable,
      checkedAt: new Date().toISOString(),
      database: {
        reachable: health.reachable,
        latencyMs: health.latencyMs,
        host: health.target.host,
        database: health.target.database,
        user: health.target.user,
        serverVersion: health.serverVersion,
      },
      error: health.error,
      code: health.code,
      hint: health.hint,
    },
    { status: health.reachable ? 200 : 503 },
  );
}
