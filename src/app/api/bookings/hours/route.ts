// Public calendar: which days the salon is open.
import { NextRequest, NextResponse } from "next/server";
import { loadCompanyDays } from "@/lib/dayHours";
import { parseIsoDate } from "@/lib/operatingHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  try {
    const days = await loadCompanyDays(from, to);
    return NextResponse.json({
      success: true,
      days: days.map((d) => ({
        date: d.date,
        open: d.open,
        startTime: d.startTime,
        closingTime: d.closingTime,
        remarks: d.remarks,
        slots: d.slots,
      })),
    });
  } catch (e) {
    console.error("GET /api/bookings/hours", e);
    return NextResponse.json(
      { success: false, message: "Failed to load salon hours." },
      { status: 500 },
    );
  }
}
