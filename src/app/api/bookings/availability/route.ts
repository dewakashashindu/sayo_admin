// src/app/api/bookings/availability/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decodeBookingSchedule } from '@/lib/bookingSchedule';
import { BOOKING_SERVICE_DETAIL_FROM } from '@/lib/bookingReadModel';
import {
  loadCompanyDay,
  loadStaffDays,
  resolveStaffWindow,
  slotsOutsideWindow,
  slotsOutsideWindows,
} from '@/lib/dayHours';


/* A booking that is not CONFIRMED yet does not hold a chair. The "with
   confirmation" flow is a REQUEST: it is saved PENDING precisely because the
   salon calls the customer and agrees the time, and two requests for the same
   slot are normal (that is the whole point of the mode). Counting them here
   made half the day read as "booked" on the without-confirmation screen and,
   worse, the server guard rejected a real walk-in for a slot nobody had
   confirmed. CANCELLED/CANCEL are still ignored. */
const NON_BLOCKING_STATUSES = ['CANCELLED', 'CANCEL', 'PENDING'];

interface LegacyAvailabilityRow {
  BookingID: string;
  StartMin: number;
  TechID: string;
  ServiceItemID: string;
  ProviderName: string | null;
  Remarks: string | null;
  ScheduleStartMin: number | null;
  ScheduleEndMin: number | null;
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
        d.ScheduleStartMin AS ScheduleStartMin,
        d.ScheduleEndMin AS ScheduleEndMin,
        COALESCE(NULLIF(i.SerDuration, 0), 30) AS DurationMin,
        d.Qty AS Qty
      ${BOOKING_SERVICE_DETAIL_FROM}
      WHERE DATE(h.BookingDate) = ${date}
        AND RTRIM(h.LocCode) = ${locCode}
        AND UPPER(RTRIM(h.Status)) NOT IN (${Prisma.join(NON_BLOCKING_STATUSES)})
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
      d.ScheduleStartMin AS ScheduleStartMin,
      d.ScheduleEndMin AS ScheduleEndMin,
      COALESCE(NULLIF(i.SerDuration, 0), 30) AS DurationMin,
      d.Qty AS Qty
    ${BOOKING_SERVICE_DETAIL_FROM}
    WHERE DATE(h.BookingDate) = ${date}
      AND UPPER(RTRIM(h.Status)) NOT IN (${Prisma.join(NON_BLOCKING_STATUSES)})
  `;
}

/** Every bookable specialist of a branch, by the display name the page uses. */
async function loadBranchProviders(locCode: string): Promise<{ userId: string; name: string }[]> {
  const [locations, users, specialities, assignments] = await Promise.all([
    prisma.tbl_LocationMaster.findMany({ where: { Enable: true }, select: { LocCode: true } }),
    prisma.tbl_userdetails.findMany({ where: { Enable: true }, select: { UserId: true, UserName: true, WorkingLocID: true, Rmks: true } }),
    prisma.tbl_technicianspecilities.findMany(),
    prisma.tbl_technicianspecilityassignment.findMany(),
  ]);

  const locMap = new Map<string, string>();
  for (const location of locations) {
    locMap.set(String(location.LocCode ?? '').trim().toUpperCase(), String(location.LocCode ?? '').trim().toUpperCase());
  }

  const specByID = new Map<string, string>();
  for (const spec of specialities) {
    specByID.set(String(spec.SpecAreaID ?? '').trim().toUpperCase(), String(spec.Specilities ?? '').trim());
  }

  const bookable = new Set<string>();
  for (const assignment of assignments) {
    const specID = String(assignment.SpecAreaID ?? '').trim().toUpperCase();
    if (specByID.get(specID)) bookable.add(String(assignment.UserID ?? '').trim().toUpperCase());
  }

  const out: { userId: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const user of users) {
    const userID = String(user.UserId ?? '').trim();
    if (!bookable.has(userID.toUpperCase())) continue;
    const working = String(user.WorkingLocID ?? '').trim().toUpperCase();
    if (!locMap.has(working)) continue;
    const display = String(user.UserName ?? '').trim();
    if (!display || seen.has(display)) continue;
    seen.add(display);
    out.push({ userId: userID, name: display });
  }
  return out;
}

/* GET /api/bookings/availability
   Only the without-confirmation public flow uses this endpoint, and it has to
   agree with the server-side guard (assertNoProviderCapacityConflict) row for
   row — the page shows what this returns and the API rejects on anything
   hidden here. */
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

    const [company, staffDays, rows, branchProviders] = await Promise.all([
      loadCompanyDay(date, locCode || ""),
      loadStaffDays(date, locCode || ""),
      loadLegacyBookings(date, locCode),
      locCode ? loadBranchProviders(locCode) : Promise.resolve([] as { userId: string; name: string }[]),
    ]);

    const scheduledProviders = branchProviders.filter((person) =>
      resolveStaffWindow(company, staffDays.get(person.userId.trim().toUpperCase())).working,
    );
    const daySlots = company.open ? company.slots : [];
    const rosterNames = scheduledProviders.map((p) => p.name);

    if (!company.open) {
      return NextResponse.json({
        success: true,
        salonClosed: true,
        open: false,
        startTime: company.startTime,
        closingTime: company.closingTime,
        remarks: company.remarks,
        slots: [] as string[],
        bookedSlots: [] as string[],
        providerSlots: {} as Record<string, string[]>,
        scheduledProviders: [] as string[],
      });
    }

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

      /* Same priority as the server guard: the per-service placement columns
         win, the legacy Remarks metadata is the fallback. Reading only Remarks
         (as this used to) showed a green slot for a service that is actually
         placed later, and the submit then failed with 409. */
      const columnStart = Number(row.ScheduleStartMin);
      const columnEnd = Number(row.ScheduleEndMin);
      const storedSchedule = decodeBookingSchedule(row.Remarks);
      const legacyScheduled = storedSchedule.find((entry) =>
        entry.itemCode &&
        normalizeLookup(entry.itemCode) === normalizeLookup(row.ServiceItemID),
      );
      const scheduledStart =
        Number.isFinite(columnStart) && Number.isFinite(columnEnd) && columnEnd > columnStart
          ? columnStart
          : legacyScheduled?.startMin;

      if (scheduledStart !== undefined && Number.isFinite(scheduledStart)) {
        scheduledBookings.push({
          startMin: scheduledStart,
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

      for (const slot of daySlots) {
        const slotStart = slotToMinutes(slot);
        if (
          slotStart >= 0 &&
          overlaps(slotStart, 30, booking.startMin, booking.durationMin) &&
          !slots.includes(slot)
        ) {
          slots.push(slot);
        }
      }

      providerSlots[booking.providerName] = slots;
    }

    for (const person of scheduledProviders) {
      const window = resolveStaffWindow(company, staffDays.get(person.userId.trim().toUpperCase()));
      const extra = window.working
        ? (window.windows?.length
            ? slotsOutsideWindows(daySlots, window.windows)
            : slotsOutsideWindow(daySlots, window.startMin, window.closeMin))
        : daySlots;
      if (extra.length === 0) continue;
      const current = providerSlots[person.name] || [];
      for (const slot of extra) {
        if (!current.includes(slot)) current.push(slot);
      }
      providerSlots[person.name] = current;
    }

    /* A slot nobody at the branch can take at all. This used to be hardcoded
       `[]`, which left the evaluator's first guard (a globally blocked slot)
       unreachable — the page had no way to mark a whole branch as full. */
    const roster = rosterNames;
    const bookedSlots: string[] = [];
    if (roster.length > 0) {
      for (const slot of daySlots) {
        const someoneFree = roster.some((name) => {
          const busy = providerSlots[name] || providerSlots[providerDisplayName(name, requestedProviderNames)] || [];
          return !busy.includes(slot);
        });
        if (!someoneFree) bookedSlots.push(slot);
      }
    }

    return NextResponse.json({
      success: true,
      salonClosed: false,
      open: true,
      startTime: company.startTime,
      closingTime: company.closingTime,
      remarks: company.remarks,
      slots: daySlots,
      bookedSlots,
      providerSlots,
      scheduledProviders: rosterNames,
    });
  } catch (error) {
    console.error('[AVAILABILITY_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
