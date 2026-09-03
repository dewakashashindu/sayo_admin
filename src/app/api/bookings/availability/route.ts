// src/app/api/bookings/availability/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decodeBookingSchedule } from '@/lib/bookingSchedule';

const PUBLIC_TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM',
];

interface LegacyAvailabilityRow {
  BookingID: string;
  StartMin: number;
  TechID: string;
  ServiceItemID: string;
  ProviderName: string | null;
  Remarks: string | null;
  DurationMin: number;
  Qty: string | number | null;
}

function normalizeLookup(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function slotToMinutes(timeStr: string): number {
  const match = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return -1;
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function overlaps(
  firstStart: number,
  firstDuration: number,
  secondStart: number,
  secondDuration: number,
): boolean {
  return firstStart < secondStart + secondDuration &&
    secondStart < firstStart + firstDuration;
}

function branchMatches(location: string, code: string, description: string): boolean {
  const wanted = normalizeLookup(location);
  const normalizedCode = normalizeLookup(code);
  const normalizedDescription = normalizeLookup(description);
  return normalizedCode === wanted ||
    normalizedDescription === wanted ||
    normalizedDescription.includes(wanted) ||
    wanted.includes(normalizedDescription);
}

function providerDisplayName(rawName: string, requestedNames: string[]): string {
  const normalizedRaw = normalizeLookup(rawName);
  const requested = requestedNames.find((name) => {
    const normalizedRequested = normalizeLookup(name);
    return normalizedRequested === normalizedRaw ||
      (normalizedRaw.length >= 6 && normalizedRaw.startsWith(normalizedRequested)) ||
      (normalizedRequested.length >= 6 && normalizedRequested.startsWith(normalizedRaw));
  });
  return requested || rawName;
}

async function loadLegacyBookings(date: string, locCode?: string): Promise<LegacyAvailabilityRow[]> {
  if (locCode) {
    return prisma.$queryRaw<LegacyAvailabilityRow[]>`
      SELECT
        RTRIM(h.BookingID) AS BookingID,
        (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
        RTRIM(d.TechID) AS TechID,
        RTRIM(d.ServiceItemID) AS ServiceItemID,
        RTRIM(u.UserName) AS ProviderName,
        h.Remarks AS Remarks,
        COALESCE(NULLIF(i.DurationMin, 0), 30) AS DurationMin,
        d.Qty AS Qty
      FROM tbl_bookingheder h
      JOIN tbl_bookingdetail d
        ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
      LEFT JOIN tbl_itemmaster i
        ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
       AND (RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
         OR LEFT(RTRIM(i.ItemCode), 10) = RTRIM(d.ServiceItemID))
      LEFT JOIN tbl_userdetails u
        ON RTRIM(u.UserId) = RTRIM(d.TechID)
      WHERE DATE(h.BookingDate) = ${date}
        AND RTRIM(h.LocCode) = ${locCode}
        AND UPPER(RTRIM(h.Status)) NOT IN ('CANCELLED', 'CANCEL')
    `;
  }

  return prisma.$queryRaw<LegacyAvailabilityRow[]>`
    SELECT
      RTRIM(h.BookingID) AS BookingID,
      (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
      RTRIM(d.TechID) AS TechID,
      RTRIM(d.ServiceItemID) AS ServiceItemID,
      RTRIM(u.UserName) AS ProviderName,
      h.Remarks AS Remarks,
      COALESCE(NULLIF(i.DurationMin, 0), 30) AS DurationMin,
      d.Qty AS Qty
    FROM tbl_bookingheder h
    JOIN tbl_bookingdetail d
      ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
    LEFT JOIN tbl_ItemMaster i
      ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
     AND (RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
       OR LEFT(RTRIM(i.ItemCode), 10) = RTRIM(d.ServiceItemID))
    LEFT JOIN tbl_userdetails u
      ON RTRIM(u.UserId) = RTRIM(d.TechID)
    WHERE DATE(h.BookingDate) = ${date}
      AND UPPER(RTRIM(h.Status)) NOT IN ('CANCELLED', 'CANCEL')
  `;
}

/* GET /api/bookings/availability
   Only the without-confirmation public flow uses this endpoint. Its response
   is derived from the same legacy bookings used by the server-side guard. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date')?.trim() || '';
    const location = searchParams.get('location')?.trim() || '';
    const requestedProviderNames = (searchParams.get('providers') || '')
      .split(',')
      .map((provider) => provider.trim())
      .filter(Boolean);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, message: 'A valid date is required.' },
        { status: 400 },
      );
    }

    let locCode: string | undefined;
    if (location) {
      const branches = await prisma.tbl_LocationMaster.findMany({
        where: { Enable: true },
        select: { LocCode: true, LocDes: true },
      });
      const branch = branches.find((candidate) =>
        branchMatches(location, candidate.LocCode, candidate.LocDes),
      );

      if (!branch) {
        return NextResponse.json(
          { success: false, message: 'Selected location is not configured.' },
          { status: 422 },
        );
      }
      locCode = branch.LocCode.trim();
    }

    const rows = await loadLegacyBookings(date, locCode);
    const grouped = new Map<string, {
      startMin: number;
      durationMin: number;
      providerName: string;
    }>();
    const scheduledBookings: {
      startMin: number;
      durationMin: number;
      providerName: string;
    }[] = [];

    for (const row of rows) {
      const techID = String(row.TechID || '').trim();
      if (!techID || techID === '0') continue;

      const bookingID = String(row.BookingID || '').trim();
      const quantity = Number(row.Qty) > 0 ? Number(row.Qty) : 1;
      const durationMin = Math.max(30, Number(row.DurationMin) || 30) * quantity;
      const providerName = providerDisplayName(
        String(row.ProviderName || techID).trim(),
        requestedProviderNames,
      );
      const storedSchedule = decodeBookingSchedule(row.Remarks);
      const scheduled = storedSchedule.find((entry) =>
        entry.itemCode &&
        entry.itemCode.toLowerCase() === String(row.ServiceItemID || '').trim().toLowerCase(),
      );

      if (scheduled) {
        // Persisted split/swap schedules contain the exact service start. Do
        // not collapse that service back to the booking's overall start.
        scheduledBookings.push({
          startMin: scheduled.startMin,
          durationMin,
          providerName,
        });
        continue;
      }

      // Legacy rows without schedule metadata retain the original grouped
      // booking window (one continuous window per provider).
      const key = `${bookingID}|${techID}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.durationMin += durationMin;
      } else {
        grouped.set(key, {
          startMin: Number(row.StartMin) || 0,
          durationMin,
          providerName,
        });
      }
    }

    const providerSlots: Record<string, string[]> = {};
    for (const booking of [...grouped.values(), ...scheduledBookings]) {
      if (!booking.providerName) continue;
      const slots = providerSlots[booking.providerName] || [];

      for (const slot of PUBLIC_TIME_SLOTS) {
        const slotStart = slotToMinutes(slot);
        if (
          overlaps(slotStart, 30, booking.startMin, booking.durationMin) &&
          !slots.includes(slot)
        ) {
          slots.push(slot);
        }
      }

      providerSlots[booking.providerName] = slots;
    }

    return NextResponse.json({
      success: true,
      bookedSlots: [],
      providerSlots,
    });
  } catch (error) {
    console.error('[AVAILABILITY_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
