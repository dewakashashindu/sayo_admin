
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { checkBookingAccess } from "@/lib/bookingAccess";
import { ADMIN_COOKIE } from "@/lib/adminSession";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma || newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (v: unknown) => String(v ?? "").trim();

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    let locCode = "";
    try {
      const body = (await req.json()) as { locCode?: string };
      locCode = trim(body.locCode);
    } catch {
      /* body optional */
    }

    const access = await checkBookingAccess(
      prisma,
      req.cookies.get(ADMIN_COOKIE)?.value,
      bookingID,
      locCode || undefined,
    );
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, message: access.message },
        { status: access.status },
      );
    }
    const header = access.header;

    if (header.BillingTime !== null) {
      return NextResponse.json({ success: true, billed: true, already: true });
    }
    if (trim(header.Status).toUpperCase() !== "DONE") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Work must be marked done before billing (current status: " +
            trim(header.Status) +
            ")",
        },
        { status: 409 },
      );
    }

    await prisma.$executeRaw`
      UPDATE tbl_bookingheder
      SET BillingTime = NOW()
      WHERE RTRIM(LocCode) = ${header.LocCode.trim()}
        AND RTRIM(BookingID) = ${bookingID}
    `;

    return NextResponse.json({ success: true, billed: true });
  } catch (err) {
    console.error("[booking-billed] POST failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to mark the booking as billed" },
      { status: 500 },
    );
  }
}
