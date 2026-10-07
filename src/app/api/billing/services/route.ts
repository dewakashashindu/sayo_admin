import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { locationScopeForRequest } from "@/lib/locationScope";
import {
  serviceLifecycle,
  type ServiceLifecycle,
} from "@/lib/serviceStatus";
import {
  createItemCodeIndex,
  legacyItemCode,
  type ItemCodeIndex,
} from "@/lib/itemCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();
const EPOCH_1900 = new Date("1900-01-02T00:00:00Z").getTime();
const isSet = (value: Date | null | undefined) =>
  value !== null && value !== undefined && new Date(value).getTime() > EPOCH_1900;

function clockFromMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const h24 = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  const period = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

interface HeaderRow {
  BookingID: string;
  LocCode: string;
  CusCode: string;
  Status: string;
  ConfirmationType: string | null;
  BookingDate: string | null;
  TxnDateTime: string | null;
  BillingTime: string | null;
  Pax: number | null;
  CusName: string | null;
  RegTel: string | null;
}

interface DetailRow {
  BookingID: string;
  LocCode: string;
  GuessID: string;
  ServiceItemID: string;
  Qty: number | string | null;
  ItemPrice: number | null;
  TechID: string | null;
  ScheduleIndex: number | null;
  ScheduleStartMin: number | null;
  ScheduleEndMin: number | null;
  CheckInTime: Date | null;
  GuestCancelledDate: Date | null;
  ServiceDoneTime: Date | null;
  ServiceCancelledDate: Date | null;
}

function isUnknownColumn(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "");
  return (
    msg.includes("Unknown column") ||
    msg.includes("42S22") ||
    msg.toLowerCase().includes("doesn't exist")
  );
}

export async function GET(req: NextRequest) {
  const resolvedScope = await locationScopeForRequest(req);
  if (!resolvedScope.ok) return resolvedScope.response;
  const scope = resolvedScope.scope;
  const mayUse = (code: unknown) =>
    scope.unlimited ||
    [...scope.allowed].some(
      (c) => c.toUpperCase() === String(code ?? "").trim().toUpperCase(),
    );

  try {
    /* Bookings that still have work on the floor (ONGOING) or are DONE but not
       yet billed. Fully billed bookings stay on the "Completed" tab. */
    const headers = (
      await prisma.$queryRaw<HeaderRow[]>`
        SELECT
          RTRIM(h.BookingID)         AS BookingID,
          RTRIM(h.LocCode)           AS LocCode,
          RTRIM(h.CusCode)           AS CusCode,
          RTRIM(h.Status)            AS Status,
          RTRIM(h.ConfirmationType)  AS ConfirmationType,
          DATE_FORMAT(h.BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
          DATE_FORMAT(h.TxnDateTime, '%Y-%m-%d %H:%i:%s') AS TxnDateTime,
          DATE_FORMAT(h.BillingTime, '%Y-%m-%d %H:%i:%s') AS BillingTime,
          h.Pax                      AS Pax,
          RTRIM(c.CusName)           AS CusName,
          RTRIM(c.RegTel)            AS RegTel
        FROM tbl_bookingheder h
        LEFT JOIN tbl_customermaster c
          ON RTRIM(c.CusCode) = RTRIM(h.CusCode)
        WHERE (
              UPPER(RTRIM(h.Status)) = 'ONGOING'
              AND (h.BillingTime IS NULL OR h.BillingTime <= '1900-01-01 00:00:00')
           )
           OR (
              UPPER(RTRIM(h.Status)) = 'DONE'
              AND (h.BillingTime IS NULL OR h.BillingTime <= '1900-01-01 00:00:00')
           )
        ORDER BY h.TxnDateTime DESC
        LIMIT 300
      `
    ).filter((r) => mayUse(r.LocCode));

    if (headers.length === 0) {
      return NextResponse.json({
        success: true,
        bookings: [],
        migrationPending: false,
      });
    }

    const bookingIDs = [...new Set(headers.map((r) => trim(r.BookingID)))].filter(Boolean);
    const locCodes = [...new Set(headers.map((r) => trim(r.LocCode)))].filter(Boolean);

    /* Detail rows + per-service status. The four Service* columns only exist
       after scripts/migrate-add-service-status-mysql.sql; if they are missing
       we fall back to a projection without them. */
    let details: DetailRow[];
    let migrationPending = false;
    try {
      details = await prisma.$queryRaw<DetailRow[]>`
        SELECT
          RTRIM(d.BookingID)     AS BookingID,
          RTRIM(d.LocCode)       AS LocCode,
          RTRIM(d.GuessID)       AS GuessID,
          RTRIM(d.ServiceItemID) AS ServiceItemID,
          d.Qty                  AS Qty,
          d.ItemPrice            AS ItemPrice,
          RTRIM(d.TechID)        AS TechID,
          d.ScheduleIndex        AS ScheduleIndex,
          d.ScheduleStartMin     AS ScheduleStartMin,
          d.ScheduleEndMin       AS ScheduleEndMin,
          t.CheckInTime          AS CheckInTime,
          t.CancelledDate        AS GuestCancelledDate,
          d.ServiceDoneTime      AS ServiceDoneTime,
          d.ServiceCancelledDate AS ServiceCancelledDate
        FROM tbl_bookingservicedetail d
        LEFT JOIN tbl_bookingtxndetail t
          ON RTRIM(t.LocCode) = RTRIM(d.LocCode)
         AND RTRIM(t.BookingID) = RTRIM(d.BookingID)
         AND RTRIM(t.GuessID) = RTRIM(d.GuessID)
        WHERE RTRIM(d.BookingID) IN (${Prisma.join(bookingIDs)})
          AND RTRIM(d.LocCode)   IN (${Prisma.join(locCodes)})
        ORDER BY d.ScheduleIndex, RTRIM(d.GuessID)
      `;
    } catch (err) {
      if (!isUnknownColumn(err)) throw err;
      migrationPending = true;
      details = await prisma.$queryRaw<DetailRow[]>`
        SELECT
          RTRIM(d.BookingID)     AS BookingID,
          RTRIM(d.LocCode)       AS LocCode,
          RTRIM(d.GuessID)       AS GuessID,
          RTRIM(d.ServiceItemID) AS ServiceItemID,
          d.Qty                  AS Qty,
          d.ItemPrice            AS ItemPrice,
          RTRIM(d.TechID)        AS TechID,
          d.ScheduleIndex        AS ScheduleIndex,
          d.ScheduleStartMin     AS ScheduleStartMin,
          d.ScheduleEndMin       AS ScheduleEndMin,
          t.CheckInTime          AS CheckInTime,
          t.CancelledDate        AS GuestCancelledDate,
          NULL                   AS ServiceDoneTime,
          NULL                   AS ServiceCancelledDate
        FROM tbl_bookingservicedetail d
        LEFT JOIN tbl_bookingtxndetail t
          ON RTRIM(t.LocCode) = RTRIM(d.LocCode)
         AND RTRIM(t.BookingID) = RTRIM(d.BookingID)
         AND RTRIM(t.GuessID) = RTRIM(d.GuessID)
        WHERE RTRIM(d.BookingID) IN (${Prisma.join(bookingIDs)})
          AND RTRIM(d.LocCode)   IN (${Prisma.join(locCodes)})
        ORDER BY d.ScheduleIndex, RTRIM(d.GuessID)
      `;
    }

    /* Billed stamps are read SEPARATELY: they only exist after the rev-10
       migration (ServiceBilledTime/ServiceBillNo). When absent we simply treat
       nothing as billed, so done/cancelled info still works on the older
       schema. This must NOT ride on the main query, or a missing billed column
       would knock out the done stamps too. */
    const billedSet = new Set<string>();
    if (!migrationPending) {
      try {
        const billedRows = await prisma.$queryRaw<
          { BookingID: string; LocCode: string; GuessID: string; ServiceItemID: string; ScheduleIndex: number | null; ServiceBilledTime: Date | null }[]
        >`
          SELECT
            RTRIM(BookingID)     AS BookingID,
            RTRIM(LocCode)       AS LocCode,
            RTRIM(GuessID)       AS GuessID,
            RTRIM(ServiceItemID) AS ServiceItemID,
            ScheduleIndex        AS ScheduleIndex,
            ServiceBilledTime    AS ServiceBilledTime
          FROM tbl_bookingservicedetail
          WHERE RTRIM(BookingID) IN (${Prisma.join(bookingIDs)})
            AND RTRIM(LocCode)   IN (${Prisma.join(locCodes)})
        `;
        for (const r of billedRows) {
          if (isSet(r.ServiceBilledTime)) {
            billedSet.add(
              `${trim(r.BookingID)}|${trim(r.LocCode)}|${(trim(r.GuessID) || "MAIN").toUpperCase()}|${trim(r.ServiceItemID)}|${r.ScheduleIndex ?? 0}`,
            );
          }
        }
      } catch {
        /* Billed columns absent — nothing is billed yet. */
      }
    }
    const isBilled = (d: DetailRow) =>
      billedSet.has(
        `${trim(d.BookingID)}|${trim(d.LocCode)}|${(trim(d.GuessID) || "MAIN").toUpperCase()}|${trim(d.ServiceItemID)}|${d.ScheduleIndex ?? 0}`,
      );

    /* Names for services + technicians. */
    const itemCodes = [...new Set(details.map((d) => trim(d.ServiceItemID)).filter(Boolean))];
    const techIDs = [...new Set(details.map((d) => trim(d.TechID)).filter((id) => id && id !== "0"))];
    const legacyItemCodes = [...new Set(itemCodes.map((c) => legacyItemCode(c)).filter(Boolean))];

    const itemRows = itemCodes.length
      ? await prisma.$queryRaw<{ LocCode: string; ItemCode: string; ItemDes: string | null; ItemPrintDes: string | null }[]>`
          SELECT RTRIM(LocCode) LocCode, RTRIM(ItemCode) ItemCode, RTRIM(ItemDes) ItemDes, RTRIM(ItemPrintDes) ItemPrintDes
          FROM tbl_itemmaster
          WHERE RTRIM(LocCode) IN (${Prisma.join(locCodes)})
            AND (RTRIM(ItemCode) IN (${Prisma.join(itemCodes)})
                 OR LEFT(RTRIM(ItemCode),10) IN (${Prisma.join(legacyItemCodes.length ? legacyItemCodes : [""])})
            )
        `
      : [];
    const techRows = techIDs.length
      ? await prisma.$queryRaw<{ UserId: string; UserName: string | null }[]>`
          SELECT RTRIM(UserId) UserId, RTRIM(UserName) UserName
          FROM tbl_userdetails
          WHERE RTRIM(UserId) IN (${Prisma.join(techIDs)})
        `
      : [];
    const nameIndexByLoc = new Map<string, ItemCodeIndex<{ code: string; name: string }>>();
    const byLoc = new Map<string, { code: string; name: string }[]>();
    itemRows.forEach((row) => {
      const loc = trim(row.LocCode).toUpperCase();
      const name = trim(row.ItemPrintDes) || trim(row.ItemDes);
      if (!loc || !name) return;
      const list = byLoc.get(loc) ?? [];
      list.push({ code: trim(row.ItemCode), name });
      byLoc.set(loc, list);
    });
    byLoc.forEach((list, loc) =>
      nameIndexByLoc.set(loc, createItemCodeIndex(list, (e) => e.code)),
    );
    const techNameById = new Map<string, string>();
    techRows.forEach((row) => {
      const id = trim(row.UserId).toUpperCase();
      if (id && trim(row.UserName) && !techNameById.has(id))
        techNameById.set(id, trim(row.UserName));
    });

    const lineTotal = (d: DetailRow) => {
      const qty = Number(trim(d.Qty));
      const price = Number(d.ItemPrice ?? 0);
      return (Number.isFinite(qty) && qty > 0 ? qty : 1) * (Number.isFinite(price) ? price : 0);
    };

    const mappedBookings = headers.map((header) => {
      const bookingID = trim(header.BookingID);
      const locCode = trim(header.LocCode);
      /* A service that already went onto a bill is finished business — it must
         not reappear in the To-bill accordion (no double billing). */
      const rows = details.filter(
        (d) =>
          trim(d.BookingID) === bookingID &&
          trim(d.LocCode) === locCode &&
          !isBilled(d),
      );

      const guestOrder: string[] = [];
      rows.forEach((d) => {
        const id = trim(d.GuessID).toUpperCase() || "MAIN";
        if (!guestOrder.includes(id)) guestOrder.push(id);
      });
      guestOrder.sort((a, b) =>
        a === "MAIN" ? -1 : b === "MAIN" ? 1 : a.localeCompare(b),
      );

      const guests = guestOrder.map((guestID, index) => {
        const services = rows
          .filter((d) => (trim(d.GuessID).toUpperCase() || "MAIN") === guestID)
          .map((d) => {
            const guestCheckedIn = isSet(d.CheckInTime);
            const guestCancelled = isSet(d.GuestCancelledDate);
            const done = isSet(d.ServiceDoneTime);
            const cancelled = guestCancelled || isSet(d.ServiceCancelledDate);
            const lifecycle: ServiceLifecycle = serviceLifecycle({
              checkedIn: guestCheckedIn,
              done,
              cancelled,
            });
            const start = Number(d.ScheduleStartMin);
            const end = Number(d.ScheduleEndMin);
            return {
              serviceIndex: d.ScheduleIndex ?? 0,
              itemCode: trim(d.ServiceItemID),
              guessID: guestID,
              serviceName:
                nameIndexByLoc.get(locCode.toUpperCase())?.get(d.ServiceItemID)?.name ||
                trim(d.ServiceItemID),
              providerName:
                trim(d.TechID) && trim(d.TechID) !== "0"
                  ? techNameById.get(trim(d.TechID).toUpperCase()) || trim(d.TechID)
                  : "Unassigned",
              techID: trim(d.TechID),
              qty: Number(trim(d.Qty)) > 0 ? Number(trim(d.Qty)) : 1,
              price: Number(d.ItemPrice ?? 0) || 0,
              lineTotal: lineTotal(d),
              startTime: clockFromMinutes(start),
              endTime: clockFromMinutes(end),
              checkedIn: guestCheckedIn,
              done,
              cancelled,
              status: lifecycle,
            };
          });

        const checkedIn = services.some((s) => s.checkedIn);
        const cancelled = services.length > 0 && services.every((s) => s.cancelled);
        return {
          guessID: guestID,
          label: guestID === "MAIN" ? "Main client" : `Guest ${index + 1}`,
          checkedIn,
          cancelled,
          services,
          doneTotal: services
            .filter((s) => s.status === "done")
            .reduce((sum, s) => sum + s.lineTotal, 0),
        };
      });

      const allServices = guests.flatMap((g) => g.services);
      const date = (trim(header.BookingDate) || trim(header.TxnDateTime)).slice(0, 10);
      const conf = trim(header.ConfirmationType).toLowerCase();
      return {
        bookingID,
        locCode,
        cusCode: trim(header.CusCode),
        clientName: trim(header.CusName) || "Unknown",
        clientPhone: trim(header.RegTel),
        date,
        status: trim(header.Status).toLowerCase(),
        mode: conf === "wo" || conf === "wi" ? "walkin" : "pre_booked",
        pax: Number(header.Pax ?? 0) || 0,
        guests,
        doneTotal: allServices
          .filter((s) => s.status === "done")
          .reduce((sum, s) => sum + s.lineTotal, 0),
        grandTotal: allServices
          .filter((s) => !s.cancelled)
          .reduce((sum, s) => sum + s.lineTotal, 0),
        doneCount: allServices.filter((s) => s.status === "done").length,
        totalCount: allServices.length,
      };
    });

    /* Drop bookings with nothing left to bill and nothing on the floor —
       e.g. a group whose services are all billed or cancelled. */
    const bookings = mappedBookings.filter((b) => {
      const svc = b.guests.flatMap((g) => g.services);
      return (
        svc.some((s) => s.status === "done") ||
        svc.some((s) => s.status === "ongoing" || s.status === "confirmed")
      );
    });

    return NextResponse.json({ success: true, bookings, migrationPending });
  } catch (err) {
    console.error("[billing-services] GET failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load the billing accordion" },
      { status: 500 },
    );
  }
}
