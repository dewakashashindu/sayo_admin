// app/api/dashboard/route.ts
// Reads the SAME legacy booking tables the booking flow writes to
// (tbl_bookingheder + tbl_bookingservicedetail + tbl_bookingtxndetail),
// so the dashboard always reflects real online + manual appointments.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { stripBookingSchedule } from '@/lib/bookingSchedule';
import { minutesFromRemarks, minutesFromValue } from '@/lib/legacyTime';
import { BOOKING_SERVICE_DETAIL_FROM } from '@/lib/bookingReadModel';
import { locationScopeForRequest, foreignLocation, locationDeniedMessage } from "@/lib/locationScope";
import { resolveLegacyColumn, resolveLegacyTable } from "@/lib/legacyColumns";
import { stripTitle } from "@/lib/displayName";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DAY_START = 9 * 60;
const SLOT_MIN = 30;
const SLOTS = 18; // 09:00 → 17:30

function buildTimeSlots(): string[] {
  const out: string[] = [];
  for (let m = DAY_START; m < DAY_START + SLOTS * SLOT_MIN; m += SLOT_MIN) {
    const h = Math.floor(m / 60), mn = m % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    out.push(`${h12}:${String(mn).padStart(2, '0')} ${ap}`);
  }
  return out;
}

function slotLabelFromMinutes(min: number): string {
  const snapped = Math.floor(min / SLOT_MIN) * SLOT_MIN;
  const h = Math.floor(snapped / 60), mn = snapped % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(mn).padStart(2, '0')} ${ap}`;
}

function dateOnly(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapStatus(dbStatus: string): string {
  switch ((dbStatus || '').toUpperCase()) {
    case 'CONFIRMED': return 'confirmed';
    case 'CANCELLED': return 'cancelled';
    case 'ONGOING':   return 'ongoing';
    default:          return 'pending';
  }
}

interface RawRow {
  BookingID: string;
  LocCode: string;
  CusCode: string;
  BookingDate: Date | string;
  Status: string;
  ConfirmationType: string | null;
  BookingTypeID: string | null;
  Remarks: string | null;
  TxnDateTime: Date | string;
  ServiceItemID: string | null;
  Qty: string | number | null;
  ItemPrice: number | string | null;
  TechID: string | null;
  ScheduleStartMin: number | string | null;
  ItemDes: string | null;
  SerDuration: number | string | null;
  Category1: string | null;
  TechName: string | null;
}

export async function GET(req: NextRequest) {
  try {
    /* branch scope — a person sees the branches they were given (their own +
       the ones ticked on their access profile). */
    const resolvedScope = await locationScopeForRequest(req);
    if (!resolvedScope.ok) return resolvedScope.response;
    const scope = resolvedScope.scope;
    const mayUse = (code: unknown) =>
      scope.unlimited ||
      [...scope.allowed].some((c) => c.toUpperCase() === String(code ?? "").trim().toUpperCase());

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const isRange = Boolean(from && to);
    const fromDate = isRange ? (from as string) : date;
    const toDate = isRange ? (to as string) : date;

    /* The three filter boxes above the schedule. Their lists are the shop's own
       reference tables — the same ones the appointments screen uses — and the
       branch list is narrowed to the branches this person may use, so the box
       can never offer another outlet. */
    const ALL = (v: string | null) => {
      const t = (v ?? '').trim();
      return !t || t.toUpperCase() === 'ALL' ? '' : t;
    };
    const wantLoc  = ALL(searchParams.get('locCode'));
    const wantCat  = ALL(searchParams.get('catCode'));
    const wantMode = ALL(searchParams.get('mode'));

    if (wantLoc) {
      const bad = foreignLocation(scope, [wantLoc]);
      if (bad) {
        return NextResponse.json(
          { success: false, message: locationDeniedMessage(bad) },
          { status: 403 },
        );
      }
    }

    /* tbl_bookingtypes is spelled differently from shop to shop — the repo's
       Prisma model even carries the old “BooikingTypeID” typo. Ask the database
       which spelling this one uses once, then use it. */
    const bookingTypeIdCol =
      (await resolveLegacyColumn('tbl_bookingtypes', ['BooikingTypeID', 'BookingTypeID'])) ??
      'BooikingTypeID';

    /* The same table is written `tbl_LocationMaster` in one place and
       `tbl_locationmaster` in another — MySQL on Linux treats those as two
       different tables. Ask the database for the real names once. */
    const [locationTable, categoryTable, bookingTypeTable] = await Promise.all([
      resolveLegacyTable('tbl_locationmaster'),
      resolveLegacyTable('tbl_itemcategory1'),
      resolveLegacyTable('tbl_bookingtypes'),
    ]);

        const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        RTRIM(h.BookingID)        AS BookingID,
        RTRIM(h.LocCode)          AS LocCode,
        RTRIM(h.CusCode)          AS CusCode,
        h.BookingDate             AS BookingDate,
        RTRIM(h.Status)           AS Status,
        RTRIM(h.ConfirmationType) AS ConfirmationType,
        RTRIM(h.BookingTypeID)    AS BookingTypeID,
        h.Remarks                 AS Remarks,
        h.TxnDateTime             AS TxnDateTime,
        RTRIM(d.ServiceItemID)    AS ServiceItemID,
        d.Qty                     AS Qty,
        d.ItemPrice               AS ItemPrice,
        RTRIM(d.TechID)           AS TechID,
        d.ScheduleStartMin        AS ScheduleStartMin,
        RTRIM(i.ItemDes)          AS ItemDes,
        i.SerDuration             AS SerDuration,
        RTRIM(i.Category1)        AS Category1,
        RTRIM(u.UserName)         AS TechName
      ${BOOKING_SERVICE_DETAIL_FROM}
      WHERE DATE(h.BookingDate) >= ${fromDate}
        AND DATE(h.BookingDate) <= ${toDate}
      ORDER BY h.BookingDate ASC
    `;

        let visibleRows = rows.filter((r) => mayUse(r.LocCode));
    /* the branch box: one branch chosen means only that branch's work */
    if (wantLoc) {
      visibleRows = visibleRows.filter(
        (r) => String(r.LocCode ?? '').trim().toUpperCase() === wantLoc.toUpperCase(),
      );
    }
    const cusCodes = [...new Set(visibleRows.map(r => (r.CusCode || '').trim()).filter(Boolean))];
    const locCodes = [...new Set(visibleRows.map(r => (r.LocCode || '').trim()).filter(Boolean))];

    const [customers, locations, branchList, categoryList, bookingTypeList] = await Promise.all([
      cusCodes.length
        ? prisma.tbl_CustomerMaster.findMany({ where: { CusCode: { in: cusCodes } }, select: { CusCode: true, CusName: true, Gender: true } })
        : Promise.resolve([] as { CusCode: string; CusName: string; Gender: string | null }[]),
      locCodes.length
        ? prisma.tbl_LocationMaster.findMany({ where: { LocCode: { in: locCodes } }, select: { LocCode: true, LocDes: true } })
        : Promise.resolve([] as { LocCode: string; LocDes: string }[]),
      /* every branch this person may pick (not only the ones that happen to
         have a booking today), scope first */
      prisma
        .$queryRaw<{ LocCode: string; LocDes: string }[]>`
          SELECT RTRIM(LocCode) AS LocCode, RTRIM(LocDes) AS LocDes
          FROM ${Prisma.raw('`' + locationTable.replace(/[^A-Za-z0-9_]/g, '') + '`')}
          WHERE Enable = 1
          ORDER BY LocDes
        `
        .then((rows) => rows.filter((r) => mayUse(r.LocCode)))
        .catch(() => [] as { LocCode: string; LocDes: string }[]),
      prisma
        /* Code / Des, the same shape as the booking-type list below, so the
           screen can render both boxes with one piece of code. */
        .$queryRaw<{ Code: string; Des: string }[]>`
          SELECT RTRIM(CatCode) AS Code, RTRIM(CatDes) AS Des
          FROM ${Prisma.raw('`' + categoryTable.replace(/[^A-Za-z0-9_]/g, '') + '`')}
          WHERE Enable = 1
          ORDER BY CatDes
        `
        .catch(() => [] as { Code: string; Des: string }[]),
      prisma
        .$queryRawUnsafe<{ Code: string; Des: string }[]>(
          `SELECT RTRIM(${bookingTypeIdCol}) AS Code, RTRIM(BookingTypeDes) AS Des
             FROM \`${bookingTypeTable.replace(/[^A-Za-z0-9_]/g, '')}\`
            WHERE Enabel = 1
            ORDER BY BookingTypeDes`,
        )
        .catch(() => [] as { Code: string; Des: string }[]),
    ]);

    const cusMap = new Map(customers.map(c => [c.CusCode.trim(), c]));
    const locMap = new Map(locations.map(l => [l.LocCode.trim(), l.LocDes.trim()]));

        type B = {
      BookingId: string; Location: string; LocCode: string; ClientName: string; Gender: string;
      BookingDate: string; TimeSlot: string; Status: string; BookingMode: string;
      BookingTypeID: string;
      Categories: string; SpecialNotes: string | null; CreatedAt: string;
      TotalPrice: number; TotalDuration: number;
      services: { name: string; price: string; duration: string; category: string }[];
      providers: { name: string; role: string }[];
      startMin: number;
    };
    const byKey = new Map<string, B>();

    for (const r of visibleRows) {
      const key = `${(r.LocCode || '').trim()}|${(r.BookingID || '').trim()}`;
      let b = byKey.get(key);
      if (!b) {
        const conf = (r.ConfirmationType || '').trim().toLowerCase();
        const btype = (r.BookingTypeID || '').trim().toUpperCase();
        const mode =
          conf === 'wo' || btype === 'WALKIN' || conf === 'wi'
            ? 'without_confirmation'
            : 'pre_booking';
        /* Wall-clock minutes, exactly as stored (src/lib/legacyTime.ts): the
           server's own timezone must not move an appointment to another hour.
           A header time of exactly midnight counts as “no time stored” — the
           legacy rows keep it in Remarks, and midnight is not a shop slot. */
        const headerMinutes = minutesFromValue(r.BookingDate);
        const startFromHeader =
          headerMinutes && headerMinutes > 0
            ? headerMinutes
            : minutesFromRemarks(r.Remarks) ?? -1;
        b = {
          BookingId: (r.BookingID || '').trim(),
          LocCode: (r.LocCode || '').trim(),
          BookingTypeID: btype,
          Location: locMap.get((r.LocCode || '').trim()) || (r.LocCode || '').trim(),
          ClientName: cusMap.get((r.CusCode || '').trim())?.CusName || 'Customer',
          Gender: cusMap.get((r.CusCode || '').trim())?.Gender || '',
          BookingDate: dateOnly(r.BookingDate as any),
          TimeSlot: '',
          Status: mapStatus(r.Status),
          BookingMode: mode,
          Categories: '',
          SpecialNotes: stripBookingSchedule(String(r.Remarks || '')) || null,
          CreatedAt: new Date(r.TxnDateTime as any).toISOString(),
          TotalPrice: 0,
          TotalDuration: 0,
          services: [],
          providers: [],
          startMin: startFromHeader,
        };
        byKey.set(key, b);
      }

      const qty = Math.max(1, Number(r.Qty) || 1);
      const price = Number(r.ItemPrice) || 0;
      const dur = Number(r.SerDuration) || 0;
      const start = Number(r.ScheduleStartMin);
      if (Number.isFinite(start) && start >= 0 && (b.startMin < 0 || start < b.startMin)) {
        b.startMin = start;
      }
      b.TotalPrice += price * qty;
      b.TotalDuration += dur * qty;
      b.services.push({
        name: (r.ItemDes || r.ServiceItemID || 'Service').trim(),
        price: `LKR ${price.toLocaleString()}`,
        duration: `${dur}min`,
        category: (r.Category1 || '').trim(),
      });
      const tech = (r.TechID || '').trim();
      if (tech && tech !== '0') {
        /* the column header above a stylist's lane is the stylist's name, not
           their title: “MR. KAMAL PERERA” reads as KAMAL PERERA */
        const name = stripTitle((r.TechName || '').trim()) || tech;
        if (!b.providers.some(p => p.name === name)) b.providers.push({ name, role: 'Staff' });
      }
    }

    for (const b of byKey.values()) {
      b.TimeSlot = b.startMin >= 0 ? slotLabelFromMinutes(b.startMin) : '';
      b.Categories = [...new Set(b.services.map(s => s.category).filter(Boolean))].join(', ');
    }

    /* The service box filters on the service's CATEGORY (tbl_itemcategory1 —
       the same list the appointments screen calls “All Services”), the mode box
       on the booking's type (tbl_bookingtypes). A booking survives when ANY of
       its services carries the chosen category, which is what a person expects
       when they pick “HAIR” and the guest also had a manicure. */
    const matchesFilters = (b: { Categories: string; BookingTypeID: string }) => {
      if (wantCat && !b.Categories.split(',')
        .map((c) => c.trim().toUpperCase())
        .includes(wantCat.toUpperCase())) return false;
      if (wantMode && b.BookingTypeID.trim().toUpperCase() !== wantMode.toUpperCase()) return false;
      return true;
    };

    const all = [...byKey.values()].filter(matchesFilters);
    const dayBookings = all
      .filter(b => b.BookingDate === date)
      .sort((a, b) => a.startMin - b.startMin || a.CreatedAt.localeCompare(b.CreatedAt));

        if (isRange) {
      const counts: Record<string, Record<string, number>> = {};
      const providerSet = new Set<string>();
      for (const b of all) {
        if (b.Status === 'cancelled') continue;
        const dayCounts = (counts[b.BookingDate] ||= {});
        const names = b.providers.length ? b.providers.map(p => p.name) : ['Unassigned'];
        for (const n of names) {
          providerSet.add(n);
          dayCounts[n] = (dayCounts[n] || 0) + 1;
        }
      }
      return NextResponse.json({
        success: true,
        from: fromDate,
        to: toDate,
        providers: [...providerSet].slice(0, 8),
        counts,
      });
    }

        const active = dayBookings.filter(b => b.Status !== 'cancelled');
    const stats = {
      totalToday: active.length,
      totalPending: dayBookings.filter(b => b.Status === 'pending').length,
      totalConfirmed: dayBookings.filter(b => b.Status === 'confirmed' || b.Status === 'ongoing').length,
      totalWalkin: active.filter(b => b.BookingMode === 'without_confirmation').length,
      totalCancelled: dayBookings.filter(b => b.Status === 'cancelled').length,
      revenueOnline: active.filter(b => b.BookingMode !== 'without_confirmation').reduce((s, b) => s + b.TotalPrice, 0),
      revenueWalkin: active.filter(b => b.BookingMode === 'without_confirmation').reduce((s, b) => s + b.TotalPrice, 0),
      onlineBookings: active.filter(b => b.BookingMode !== 'without_confirmation').length,
      walkinBookings: active.filter(b => b.BookingMode === 'without_confirmation').length,
      emailCount: 0,
      callCount: 0,
      whatsappCount: 0,
    };

    const providerSet = new Set<string>();
    for (const b of active) for (const p of b.providers) providerSet.add(p.name);

        const activities = await prisma.adminactivitylog
      .findMany({ orderBy: { timestamp: 'desc' }, take: 12 })
      .then(list =>
        list.map(a => ({
          id: a.id,
          actor: stripTitle(a.adminUsername.trim()),
          section: a.section.trim(),
          action: a.action,
          timestamp: a.timestamp.toISOString(),
        })),
      )
      .catch(() => [] as { id: number; actor: string; section: string; action: string; timestamp: string }[]);

    return NextResponse.json({
      success: true,
      date,
      stats,
      providers: [...providerSet].slice(0, 8),
      timeSlots: buildTimeSlots(),
      bookings: dayBookings,
      activities,
      /* the boxes above the schedule: what may be picked, and what is picked */
      filters: {
        locations:    branchList,
        categories:   categoryList,
        bookingTypes: bookingTypeList,
      },
      applied: {
        locCode: wantLoc,
        catCode: wantCat,
        mode: wantMode,
      },
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
