import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma || newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (v: unknown) => String(v ?? "").trim();

const EPOCH_1900 = new Date("1900-01-01T00:00:00Z").getTime();

interface HeaderRow {
  LocCode: string;
  Status: string;
  BillingTime: Date | null;
}
interface CheckInRow {
  t: Date | null;
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }
    const headerRows = await prisma.$queryRaw<HeaderRow[]>`
      SELECT LocCode, Status, BillingTime
      FROM tbl_bookingheder
      WHERE RTRIM(BookingID) = ${bookingID}
      LIMIT 1
    `;
    const header = headerRows[0];
    if (!header) {
      return NextResponse.json(
        { success: false, message: "Booking not found" },
        { status: 404 },
      );
    }

    // Check-in time lives on tbl_bookingtxndetail (per guest), not the header.
    const txnRows = await prisma.$queryRaw<CheckInRow[]>`
      SELECT MAX(CheckInTime) AS t
      FROM tbl_bookingtxndetail
      WHERE RTRIM(BookingID) = ${bookingID}
    `;
    const rawCheckIn = txnRows[0]?.t ?? null;
    const checkedIn =
      rawCheckIn !== null && new Date(rawCheckIn).getTime() > EPOCH_1900;

    if (!checkedIn) {
      return NextResponse.json(
        {
          success: false,
          message: "Client must be checked in before marking the work done",
        },
        { status: 409 },
      );
    }
    if (header.BillingTime !== null) {
      return NextResponse.json(
        { success: false, message: "Booking is already billed" },
        { status: 409 },
      );
    }

    const current = trim(header.Status).toUpperCase();
    if (current !== "DONE") {
      await prisma.$executeRaw`
        UPDATE tbl_bookingheder
        SET Status = ${"DONE"}
        WHERE RTRIM(LocCode) = ${header.LocCode.trim()}
          AND RTRIM(BookingID) = ${bookingID}
      `;
    }

    return NextResponse.json({ success: true, status: "done" });
  } catch (err) {
    console.error("[appointment-done] POST failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to mark the appointment done" },
      { status: 500 },
    );
  }
}
