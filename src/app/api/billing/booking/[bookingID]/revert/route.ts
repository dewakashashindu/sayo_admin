// src/app/api/billing/booking/[bookingID]/revert/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/booking/:bookingID/revert      body: { locCode? }
//
// THE MISTAKE THIS FIXES
// The technician marks the work Done and the booking leaves the appointment
// grid — only the Billing Dashboard (and this bill screen) can see it any more.
// If the tap was a mistake there was no way back: the materials, the supporters
// and even the services could no longer be corrected, and the cashier was left
// with a booking that was not ready to be billed.
//
// WHAT IT DOES — one status step back, and the booking is editable again:
//
//   DONE    → ONGOING     (the wrong “Done” — back to the technician)
//   ONGOING → CONFIRMED   (the check-in itself was wrong; CheckInTime is
//                          cleared, so the technician additions lock again)
//
// REFUSED while the booking is already billed (BillingTime stamped): the money
// is in the four bill tables, and moving the status afterwards would leave the
// bill and the booking disagreeing. Cancelling a finished sale is a separate
// (refund) flow on purpose.
//
// The technician screen finds the booking again by itself: it refreshes every
// 20 seconds and whenever the tab is looked at, and its day list is no longer
// narrowed by a technician name that may not match (see the technician screens
// and GET /api/appointments).
//
// The header row is locked (SELECT … FOR UPDATE) and the status change runs in
// one transaction, so two cashiers pressing the button at the same time cannot
// move the booking twice. Every revert is written to the activity log with the
// signed-in user's name.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import {
  bookingStatusLabel,
  previousBookingStatus,
} from "@/lib/bookingStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (value: unknown) => String(value ?? "").trim();

/** Pad a value for the fixed-width char(10) columns — INSERT/UPDATE only. */
const toChar = (value: unknown, length: number) =>
  trim(value).substring(0, length).padEnd(length, " ");

/** 1900-01-01 means “never” in the legacy schema. */
const EPOCH_1900 = new Date("1900-01-01T00:00:00Z").getTime();

class RevertError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RevertError";
    this.status = status;
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { locCode?: unknown };
    const requestedLoc = trim(body.locCode);

    // The acting user comes from the signed cookie, never from the body.
    const session = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);
    const actor = session?.log || "ADMIN";

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { LocCode: string; Status: string | null; BillingTime: Date | null }[]
        >`
          SELECT
            RTRIM(LocCode) AS LocCode,
            RTRIM(Status)  AS Status,
            BillingTime
          FROM tbl_bookingheder
          WHERE RTRIM(BookingID) = ${bookingID}
            ${
              requestedLoc
                ? Prisma.sql`AND RTRIM(LocCode) = ${requestedLoc}`
                : Prisma.empty
            }
          LIMIT 1
          FOR UPDATE
        `;

        const header = rows[0];
        if (!header) throw new RevertError("Booking not found", 404);

        const billedAt = header.BillingTime;
        if (
          billedAt !== null &&
          billedAt !== undefined &&
          new Date(billedAt).getTime() > EPOCH_1900
        ) {
          throw new RevertError(
            "This booking is already billed — the bill was written, so its status can no longer be moved back.",
            409,
          );
        }

        const current = trim(header.Status).toUpperCase();
        const next = previousBookingStatus(current);
        if (!next) {
          throw new RevertError(
            `A ${bookingStatusLabel(current)} booking has nothing to revert to — it is still at the start of the flow.`,
            409,
          );
        }

        const locCode = trim(header.LocCode);

        await tx.$executeRaw`
          UPDATE tbl_bookingheder
          SET Status = ${toChar(next, 10)}
          WHERE RTRIM(LocCode) = ${locCode}
            AND RTRIM(BookingID) = ${bookingID}
        `;

        // Undoing a check-in must also clear CheckInTime, otherwise the status
        // says “not checked in” while the technician additions stay unlocked.
        if (next === "CONFIRMED") {
          await tx.$executeRaw`
            UPDATE tbl_bookingtxndetail
            SET CheckInTime = ${null}
            WHERE RTRIM(LocCode) = ${locCode}
              AND RTRIM(BookingID) = ${bookingID}
          `;
        }

        return { locCode, from: current, to: next };
      },
      { timeout: 15000 },
    );

    const fromLabel = bookingStatusLabel(result.from);
    const toLabel = bookingStatusLabel(result.to);

    void logActivity(
      actor,
      "billing",
      `Booking ${bookingID} reverted ${fromLabel} → ${toLabel} from the bill screen`,
    );

    return NextResponse.json({
      success: true,
      bookingID,
      locCode: result.locCode,
      from: result.from,
      to: result.to,
      fromLabel,
      toLabel,
      message:
        result.to === "ONGOING"
          ? "Reverted to Ongoing — the booking is back on the technician screen, so the work, materials and supporters can be corrected and marked done again. That screen refreshes itself within 20 seconds."
          : "Reverted to Confirmed — the check-in was undone, so the technician additions lock again until the client is checked in.",
    });
  } catch (err) {
    if (err instanceof RevertError) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.status },
      );
    }
    console.error("[billing-revert] POST failed:", err);
    return NextResponse.json(
      { success: false, message: "The status could not be reverted." },
      { status: 500 },
    );
  }
}
