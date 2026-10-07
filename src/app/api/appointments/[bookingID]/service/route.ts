import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { requireAdminSession } from "@/lib/sessionGuard";

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
interface Row {
  GuessID: string;
  ServiceItemID: string;
  ScheduleIndex: number | null;
  CheckInTime: Date | null;
}

type Action = "done" | "reopen" | "cancel" | "uncancel";

function isUnknownColumn(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "");
  return (
    msg.includes("Unknown column") ||
    msg.includes("42S22") ||
    msg.toLowerCase().includes("doesn't exist")
  );
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const live = await requireAdminSession(req);
  if (!live.ok) return live.response;
  const actor = trim(live.account.userId) || "ADMIN";

  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      guessID?: string;
      itemCode?: string;
      serviceIndex?: number;
    };
    const action = trim(body.action).toLowerCase() as Action;
    if (!bookingID || !["done", "reopen", "cancel", "uncancel"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "bookingID and a valid action are required" },
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
    const locCode = trim(header.LocCode);

    if (header.BillingTime !== null && (action === "done" || action === "cancel")) {
      return NextResponse.json(
        { success: false, message: "Booking is already billed" },
        { status: 409 },
      );
    }

    /* Resolve the target row. ScheduleIndex (when present) is the stable key;
       fall back to the (guest, item) pair used by the read model. */
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        RTRIM(d.GuessID)       AS GuessID,
        RTRIM(d.ServiceItemID) AS ServiceItemID,
        d.ScheduleIndex        AS ScheduleIndex,
        t.CheckInTime          AS CheckInTime
      FROM tbl_bookingservicedetail d
      LEFT JOIN tbl_bookingtxndetail t
        ON RTRIM(t.LocCode) = RTRIM(d.LocCode)
       AND RTRIM(t.BookingID) = RTRIM(d.BookingID)
       AND RTRIM(t.GuessID) = RTRIM(d.GuessID)
      WHERE RTRIM(d.LocCode) = ${locCode}
        AND RTRIM(d.BookingID) = ${bookingID}
      ORDER BY d.ScheduleIndex, RTRIM(d.GuessID)
    `;

    const wantIndex = Number(body.serviceIndex);
    const wantGuess = trim(body.guessID).toUpperCase();
    const wantItem = trim(body.itemCode).toUpperCase();
    const byPair = (row: Row) =>
      trim(row.GuessID).toUpperCase() === wantGuess &&
      trim(row.ServiceItemID).toUpperCase() === wantItem;
    const target =
      (Number.isFinite(wantIndex) && wantIndex >= 0
        ? rows.find((row) => Number(row.ScheduleIndex) === wantIndex)
        : undefined) ?? rows.find(byPair);

    if (!target) {
      return NextResponse.json(
        { success: false, message: "Service row not found on this booking" },
        { status: 404 },
      );
    }

    const guestCheckedIn =
      target.CheckInTime !== null &&
      new Date(target.CheckInTime).getTime() > EPOCH_1900;

    if (action === "done" && !guestCheckedIn) {
      return NextResponse.json(
        {
          success: false,
          message:
            "The guest must be checked in before a service can be marked done",
        },
        { status: 409 },
      );
    }

    /* Parameterised WHERE matching exactly one service row. */
    const rowWhere = Prisma.sql`
      WHERE RTRIM(LocCode) = ${locCode}
        AND RTRIM(BookingID) = ${bookingID}
        AND RTRIM(GuessID) = ${trim(target.GuessID)}
        AND RTRIM(ServiceItemID) = ${trim(target.ServiceItemID)}
        ${target.ScheduleIndex !== null
          ? Prisma.sql`AND ScheduleIndex = ${Number(target.ScheduleIndex)}`
          : Prisma.sql``}
    `;

    try {
      if (action === "done") {
        await prisma.$executeRaw`
          UPDATE tbl_bookingservicedetail
          SET ServiceDoneTime = NOW(), ServiceDoneBy = ${actor},
              ServiceCancelledDate = NULL, ServiceCancelledBy = NULL
          ${rowWhere}
        `;
      } else if (action === "reopen") {
        await prisma.$executeRaw`
          UPDATE tbl_bookingservicedetail
          SET ServiceDoneTime = NULL, ServiceDoneBy = NULL
          ${rowWhere}
        `;
      } else if (action === "cancel") {
        await prisma.$executeRaw`
          UPDATE tbl_bookingservicedetail
          SET ServiceCancelledDate = NOW(), ServiceCancelledBy = ${actor},
              ServiceDoneTime = NULL, ServiceDoneBy = NULL
          ${rowWhere}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE tbl_bookingservicedetail
          SET ServiceCancelledDate = NULL, ServiceCancelledBy = NULL
          ${rowWhere}
        `;
      }
    } catch (err) {
      if (isUnknownColumn(err)) {
        return NextResponse.json(
          {
            success: false,
            code: "migration-pending",
            message:
              "Per-service status columns are not in the database yet. Run scripts/migrate-add-service-status-mysql.sql in phpMyAdmin, then retry.",
          },
          { status: 501 },
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error("[service-status] POST failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update the service" },
      { status: 500 },
    );
  }
}
