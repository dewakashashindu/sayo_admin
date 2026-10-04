import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/sessionGuard";
import {
  foreignLocation,
  locationDeniedMessage,
  locationScopeForRequest,
  scopedLocationRows,
} from "@/lib/locationScope";
import { isReportId } from "@/lib/billingReports/config";
import { loadLiveReport, loadPayModes, loadReportLocations } from "@/lib/billingReports/live";
import { presetRange, todayISO, yearStartISO } from "@/lib/billingReports/dates";
import type { ReportId } from "@/lib/billingReports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIso(raw: string | null): string | null {
  const v = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminAccess(req, { screen: "BILLREP", action: "ACCESS" });
  if (!guard.ok) return guard.response;
  const scoped = await locationScopeForRequest(req);
  if (!scoped.ok) return scoped.response;

  const sp = req.nextUrl.searchParams;
  const reportRaw = String(sp.get("reportId") || "").trim();
  const loc = String(sp.get("loc") || "").trim();
  const pm = String(sp.get("pm") || "").trim();
  const from = parseIso(sp.get("from")) || presetRange("month").from || yearStartISO();
  const to = parseIso(sp.get("to")) || presetRange("month").to || todayISO();
  if (from > to) return jsonError("from must be on or before to");

  if (loc) {
    const bad = foreignLocation(scoped.scope, [loc]);
    if (bad) return jsonError(locationDeniedMessage(bad), 403);
  }

  try {
    const scopedLocs = await scopedLocationRows(scoped.scope);
    const mergeLocs = (locations: { locCode: string; locName: string }[]) => {
      const seen = new Set(locations.map((l) => l.locCode.toUpperCase()));
      const out = [...locations];
      for (const r of scopedLocs) {
        const code = String(r.LocCode || "").trim();
        if (!code || seen.has(code.toUpperCase())) continue;
        seen.add(code.toUpperCase());
        out.push({ locCode: code, locName: String(r.LocDes || code).trim() });
      }
      out.sort((a, b) => a.locName.localeCompare(b.locName) || a.locCode.localeCompare(b.locCode));
      return out;
    };

    if (!reportRaw || sp.get("meta") === "1") {
      const [locations, payModes] = await Promise.all([
        loadReportLocations(scoped.scope.allowed, scoped.scope.unlimited),
        loadPayModes(),
      ]);
      return NextResponse.json({
        success: true,
        locations: mergeLocs(locations),
        payModes,
        bills: [],
        credit: [],
        unusedItems: [],
      });
    }
    if (!isReportId(reportRaw)) return jsonError("Unknown report");
    const data = await loadLiveReport({
      reportId: reportRaw as ReportId,
      from,
      to,
      loc,
      pm,
      allowed: scoped.scope.allowed,
      unlimited: scoped.scope.unlimited,
    });
    return NextResponse.json({ success: true, ...data, locations: mergeLocs(data.locations) });
  } catch (e) {
    console.error("GET /api/billing/reports", e);
    return jsonError("Failed to load report", 500);
  }
}
