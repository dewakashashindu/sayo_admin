// src/app/api/appointments/diagnose/route.ts
// TEMPORARY diagnostic — answers “why does this booking show a different time
// on the technician screen than inside the booking?” without database access.
//
// GET /api/appointments/diagnose?bookingID=BK0000002
// GET /api/appointments/diagnose?date=2026-09-16        (the whole day)
//
// Returns, for each booking:
//   • the stored BookingDate AS TEXT (DATE_FORMAT) and AS the driver hands it
//     over (a JS Date) — so the difference between “what the database holds”
//     and “what JavaScript makes of it” is visible,
//   • the Remarks time token and the schedule minutes,
//   • the time label every screen prints (technician list, booking detail,
//     bill screen),
//   • the server timezone (process.env.TZ, the runtime timezone, its UTC
//     offset) and the database session timezone.
//
// Read-only. Admin session required (the middleware protects /api/*) and it can
// be switched off completely with ENABLE_DIAGNOSTICS=false in .env — the route
// then answers 404, exactly like the billing diagnostics.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  clockLabel,
  minutesFromRemarks,
  minutesFromValue,
  timeLabelFromValue,
} from "@/lib/legacyTime";
import {
  diagnosticsDisabledResponse,
  diagnosticsEnabled,
} from "@/lib/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (value: unknown) => String(value ?? "").trim();

/** Bumped whenever the time handling changes, so the running build is identifiable. */
const MODEL_VERSION = "appointment-time-2026-09-16";

interface RawRow {
  BookingID: string;
  LocCode: string;
  Status: string | null;
  Remarks: string | null;
  BookingDateText: string | null;
  BookingDateRaw: Date | null;
  ScheduleStartMin: number | null;
  ScheduleEndMin: number | null;
}

function timezoneFacts() {
  const now = new Date();
  return {
    processTZ: process.env.TZ || null,
    runtimeTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMinutes: now.getTimezoneOffset() === 0 ? 0 : -now.getTimezoneOffset(),
    nowIso: now.toISOString(),
    nowLocal: now.toString(),
  };
}

export async function GET(req: NextRequest) {
  if (!diagnosticsEnabled()) return diagnosticsDisabledResponse();

  try {
    const url = new URL(req.url);
    const bookingID = trim(url.searchParams.get("bookingID")).toUpperCase();
    const date = trim(url.searchParams.get("date"));

    if (!bookingID && !date) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Pass ?bookingID=BK0000002 (one booking) or ?date=YYYY-MM-DD (the whole day).",
        },
        { status: 400 },
      );
    }

    let dbTimeZone = "";
    try {
      const rows = await prisma.$queryRaw<{ tz: string }[]>`
        SELECT @@session.time_zone AS tz
      `;
      dbTimeZone = trim(rows[0]?.tz);
    } catch {
      dbTimeZone = "";
    }

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        RTRIM(h.BookingID)                              AS BookingID,
        RTRIM(h.LocCode)                                AS LocCode,
        RTRIM(h.Status)                                 AS Status,
        h.Remarks                                       AS Remarks,
        DATE_FORMAT(h.BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDateText,
        h.BookingDate                                   AS BookingDateRaw,
        d.ScheduleStartMin                              AS ScheduleStartMin,
        d.ScheduleEndMin                                AS ScheduleEndMin
      FROM tbl_bookingheder h
      LEFT JOIN tbl_bookingservicedetail d
        ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
      WHERE
        ${
          bookingID
            ? Prisma.sql`RTRIM(h.BookingID) = ${bookingID}`
            : Prisma.sql`DATE(h.BookingDate) = ${date}`
        }
      GROUP BY
        h.BookingID, h.LocCode, h.Status, h.Remarks,
        h.BookingDate, d.ScheduleStartMin, d.ScheduleEndMin
      ORDER BY
        ${
          bookingID
            ? Prisma.sql`h.BookingID`
            : Prisma.sql`h.BookingDate`
        }
      LIMIT 200
    `;

    const bookings = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const id = trim(row.BookingID);
      if (!id) continue;

      if (!bookings.has(id)) {
        const headerMinutes = minutesFromValue(row.BookingDateRaw);
        const remarksMinutes = minutesFromRemarks(row.Remarks);
        /* Exactly what GET /api/appointments computes for `timeSlot`. */
        const timeSlot =
          (headerMinutes !== null && headerMinutes !== 0
            ? clockLabel(headerMinutes)
            : null) ||
          (remarksMinutes !== null ? clockLabel(remarksMinutes) : null) ||
          (headerMinutes !== null ? clockLabel(headerMinutes) : null) ||
          "9:00 AM";

        bookings.set(id, {
          bookingID: id,
          locCode: trim(row.LocCode),
          status: trim(row.Status),
          stored: {
            BookingDateText: trim(row.BookingDateText) || null,
            BookingDateAsDriverDate: row.BookingDateRaw
              ? new Date(row.BookingDateRaw).toISOString()
              : null,
            Remarks: trim(row.Remarks) || null,
            remarksTimeToken: minutesFromRemarks(row.Remarks) !== null
              ? clockLabel(minutesFromRemarks(row.Remarks) as number)
              : null,
          },
          screens: {
            /* The technician list card and the booking’s “Time” box. */
            technicianListAndDetail:
              /* scheduleStartTime – scheduleEndTime, filled in below */
              null as string | null,
            /* GET /api/appointments `timeSlot` — what a screen falls back to. */
            headerTimeSlot: timeSlot,
          },
          schedule: [] as { startMin: number | null; endMin: number | null; label: string | null }[],
        });
      }

      const entry = bookings.get(id) as {
        screens: { technicianListAndDetail: string | null; headerTimeSlot: string };
        schedule: { startMin: number | null; endMin: number | null; label: string | null }[];
      };

      const start = row.ScheduleStartMin === null ? null : Number(row.ScheduleStartMin);
      const end = row.ScheduleEndMin === null ? null : Number(row.ScheduleEndMin);
      if (start !== null && Number.isFinite(start)) {
        const startLabel = clockLabel(start);
        const endLabel = end !== null && Number.isFinite(end) ? clockLabel(end) : "";
        entry.schedule.push({
          startMin: start,
          endMin: end,
          label: endLabel ? `${startLabel} – ${endLabel}` : startLabel,
        });
      }
    }

    /* Fill the card/detail label from the schedule, exactly like the UI does. */
    for (const booking of bookings.values()) {
      const entry = booking as {
        screens: { technicianListAndDetail: string | null; headerTimeSlot: string };
        schedule: { startMin: number | null; endMin: number | null; label: string | null }[];
      };
      const starts = entry.schedule
        .map((s) => s.startMin)
        .filter((m): m is number => m !== null && Number.isFinite(m));
      const ends = entry.schedule
        .map((s) => s.endMin)
        .filter((m): m is number => m !== null && Number.isFinite(m));
      if (starts.length && ends.length) {
        const from = clockLabel(Math.min(...starts));
        const to = clockLabel(Math.max(...ends));
        entry.screens.technicianListAndDetail = `${from} – ${to}`;
      } else {
        entry.screens.technicianListAndDetail = entry.screens.headerTimeSlot;
      }
    }

    return NextResponse.json({
      success: true,
      modelVersion: MODEL_VERSION,
      server: timezoneFacts(),
      database: { sessionTimeZone: dbTimeZone || "(server default)" },
      note:
        "technicianListAndDetail = the card on /technician-appointments and the “Time” box inside the booking. " +
        "headerTimeSlot = the fallback label built from BookingDate / Remarks. " +
        "They must never disagree.",
      bookings: [...bookings.values()],
    });
  } catch (err) {
    console.error("[appointments-diagnose] GET failed:", err);
    return NextResponse.json(
      {
        success: false,
        message: "The diagnostic query failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
