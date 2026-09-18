// src/lib/diagnostics.ts
// The two diagnostic endpoints under /api/billing/diagnose* exist so a broken
// bill or a wrong quantity can be explained without database access. They are
// read-only and behind the admin session cookie, but they expose table and
// column names, so a live salon does not want them reachable in the open.
//
// ENABLE_DIAGNOSTICS in .env decides:
//
//   (unset)            → enabled   (default: keeps support possible)
//   ENABLE_DIAGNOSTICS=false       → the routes answer 404 and do nothing
//   ENABLE_DIAGNOSTICS=0|off|no    → same
//
// Put `ENABLE_DIAGNOSTICS=false` in the production .env once the salon runs
// normally, and remove it again when a diagnostic answer is needed.
import { NextResponse } from "next/server";

const DISABLED_VALUES = new Set(["false", "0", "off", "no", "disabled", "none"]);

/** True when the diagnostic endpoints are allowed to answer. */
export function diagnosticsEnabled(): boolean {
  const raw = (process.env.ENABLE_DIAGNOSTICS ?? "").trim().toLowerCase();
  if (!raw) return true;
  return !DISABLED_VALUES.has(raw);
}

/** 404 body for a disabled diagnostic route — it must look like it never existed. */
export function diagnosticsDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      message:
        "Diagnostics are switched off on this deployment (ENABLE_DIAGNOSTICS=false in .env).",
    },
    { status: 404 },
  );
}
