// src/lib/bookingAccess.ts
//
// Booking-level write protection for technician-facing endpoints
// (/api/bookings/[bookingID]/extras, /api/appointments/[bookingID]/done,
// /api/bookings/[bookingID]/billed).
//
// Rule:
//   • The caller must hold a valid admin session (the middleware already
//     guarantees this; we re-verify to be safe).
//   • If the session user maps to a staff row in tbl_userdetails, they may
//     only touch bookings they are assigned to (TechID on the booking's
//     service-detail rows, or a supporting-technician row in
//     Tbl_BookingServiceItemAddTech).
//   • If the session user has no staff row (a pure admin account), they are
//     treated as an administrator and may touch any booking.

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/adminSession";

export interface BookingHeaderRow {
  LocCode: string;
  Status: string;
  BillingTime: Date | null;
}

export type BookingAccessResult =
  | { allowed: true; header: BookingHeaderRow }
  | { allowed: false; status: 401 | 403 | 404; message: string };

const trim = (value: unknown) => String(value ?? "").trim();

export async function checkBookingAccess(
  prisma: PrismaClient,
  cookieValue: string | undefined,
  bookingID: string,
  locCode?: string,
): Promise<BookingAccessResult> {
  const headerRows = await prisma.$queryRaw<BookingHeaderRow[]>`
    SELECT LocCode, Status, BillingTime
    FROM tbl_bookingheder
    WHERE RTRIM(BookingID) = ${bookingID}
      ${locCode ? Prisma.sql`AND RTRIM(LocCode) = ${locCode}` : Prisma.empty}
    LIMIT 1
  `;
  const header = headerRows[0];
  if (!header) {
    return { allowed: false, status: 404, message: "Booking not found" };
  }

  const payload = await verifyAdminToken(cookieValue);
  if (!payload) {
    return { allowed: false, status: 401, message: "Sign-in required" };
  }

  // Is the session user a staff member? Match by login name first, then by
  // user id. No staff row → treat as administrator.
  const staffRows = await prisma.$queryRaw<{ UserId: string }[]>`
    SELECT RTRIM(UserId) AS UserId
    FROM tbl_userdetails
    WHERE Enable = 1
      AND (UPPER(RTRIM(UserName)) = UPPER(${trim(payload.log)})
        OR UPPER(RTRIM(UserId)) = UPPER(${trim(payload.uid)}))
    ORDER BY UserId
    LIMIT 1
  `;
  const staff = staffRows[0];
  if (!staff) return { allowed: true, header };

  const userId = trim(staff.UserId).toUpperCase();
  const bookingLoc = trim(header.LocCode);
  const bookingIDUpper = bookingID.toUpperCase();

  const assigned = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*) AS n
    FROM tbl_bookingservicedetail
    WHERE RTRIM(BookingID) = ${bookingID}
      AND RTRIM(LocCode) = ${bookingLoc}
      AND UPPER(RTRIM(TechID)) = ${userId}
  `;
  if (Number(assigned[0]?.n ?? 0) > 0) return { allowed: true, header };

  const supporting = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*) AS n
    FROM Tbl_BookingServiceItemAddTech
    WHERE RTRIM(BookingID) = ${bookingID}
      AND RTRIM(LocCode) = ${bookingLoc}
      AND UPPER(RTRIM(TechID)) = ${userId}
  `;
  if (Number(supporting[0]?.n ?? 0) > 0) return { allowed: true, header };

  return {
    allowed: false,
    status: 403,
    message: `Booking ${bookingIDUpper} is not assigned to you — only the assigned technician or an administrator can update it`,
  };
}
