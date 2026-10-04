// Public calendar: which days THIS branch is open.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCompanyDay, loadCompanyDays, loadStaffDays, resolveStaffWindow } from "@/lib/dayHours";
import { parseIsoDate } from "@/lib/operatingHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeLookup(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function resolveLocCode(raw: string): Promise<string> {
  const wanted = String(raw ?? "").trim();
  if (!wanted) return "";
  const branches = await prisma.tbl_LocationMaster.findMany({
    where: { Enable: true },
    select: { LocCode: true, LocDes: true },
  });
  const hit = branches.find((b) => {
    const code = String(b.LocCode ?? "").trim();
    const des = String(b.LocDes ?? "").trim();
    const w = normalizeLookup(wanted);
    const c = normalizeLookup(code);
    const d = normalizeLookup(des);
    return c === w || d === w || d.includes(w) || (w.length >= 4 && w.includes(d));
  });
  return hit ? String(hit.LocCode).trim() : wanted.slice(0, 10);
}

export async function GET(req: NextRequest) {
  const from = parseIsoDate(req.nextUrl.searchParams.get("from"));
  const to = parseIsoDate(req.nextUrl.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json(
      { success: false, message: "from and to (YYYY-MM-DD) are required." },
      { status: 400 },
    );
  }
  if (from > to) {
    return NextResponse.json(
      { success: false, message: "from must be on or before to." },
      { status: 400 },
    );
  }
  const locRaw =
    req.nextUrl.searchParams.get("locCode") ||
    req.nextUrl.searchParams.get("location") ||
    "";
  try {
    const locCode = await resolveLocCode(locRaw);
    if (!locCode) {
      return NextResponse.json({ success: true, locCode: "", days: [] });
    }
    const days = await loadCompanyDays(from, to, locCode);
    const payload: {
      success: true;
      locCode: string;
      days: {
        date: string;
        open: boolean;
        startTime: string;
        closingTime: string;
        remarks: string;
        slots: string[];
        staff?: { staffId: string; working: boolean }[];
      }[];
    } = {
      success: true,
      locCode,
      days: days.map((d) => ({
        date: d.date,
        open: d.open,
        startTime: d.startTime,
        closingTime: d.closingTime,
        remarks: d.remarks,
        slots: d.slots,
      })),
    };

    if (from === to) {
      const company = days[0] ?? await loadCompanyDay(from, locCode);
      const staffDays = company.open ? await loadStaffDays(from, locCode) : new Map();
      const staff = [...staffDays.values()]
        .map((s) => {
          const window = resolveStaffWindow(company, s);
          return { staffId: s.staffId, working: window.working };
        })
        .filter((s) => s.working);
      if (payload.days.length === 0) {
        payload.days = [{
          date: from,
          open: false,
          startTime: "",
          closingTime: "",
          remarks: company.remarks,
          slots: [],
          staff: [],
        }];
      } else {
        payload.days[0].staff = staff;
      }
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error("GET /api/bookings/hours", e);
    return NextResponse.json(
      { success: false, message: "Failed to load salon hours." },
      { status: 500 },
    );
  }
}
