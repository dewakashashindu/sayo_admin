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
