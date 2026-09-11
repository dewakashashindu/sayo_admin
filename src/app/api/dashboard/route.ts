// app/api/dashboard/route.ts
// Reads the SAME legacy booking tables the booking flow writes to
// (tbl_bookingheder + tbl_bookingservicedetail + tbl_bookingtxndetail),
// so the dashboard always reflects real online + manual appointments.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { stripBookingSchedule } from '@/lib/bookingSchedule';
import { BOOKING_SERVICE_DETAIL_FROM } from '@/lib/bookingReadModel';

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
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const isRange = Boolean(from && to);
    const fromDate = isRange ? (from as string) : date;
    const toDate = isRange ? (to as string) : date;

    /* ── All service rows for the window (joins mirror the write path) ── */
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

    /* ── Lookups: customers / branches / technicians ── */
    const cusCodes = [...new Set(rows.map(r => (r.CusCode || '').trim()).filter(Boolean))];
    const locCodes = [...new Set(rows.map(r => (r.LocCode || '').trim()).filter(Boolean))];

    const [customers, locations] = await Promise.all([
      cusCodes.length
        ? prisma.tbl_CustomerMaster.findMany({ where: { CusCode: { in: cusCodes } }, select: { CusCode: true, CusName: true, Gender: true } })
        : Promise.resolve([] as { CusCode: string; CusName: string; Gender: string | null }[]),
      locCodes.length
        ? prisma.tbl_LocationMaster.findMany({ where: { LocCode: { in: locCodes } }, select: { LocCode: true, LocDes: true } })
        : Promise.resolve([] as { LocCode: string; LocDes: string }[]),
    ]);

    const cusMap = new Map(customers.map(c => [c.CusCode.trim(), c]));
    const locMap = new Map(locations.map(l => [l.LocCode.trim(), l.LocDes.trim()]));

    /* ── Group service rows into bookings ── */
    type B = {
      BookingId: string; Location: string; ClientName: string; Gender: string;
      BookingDate: string; TimeSlot: string; Status: string; BookingMode: string;
      Categories: string; SpecialNotes: string | null; CreatedAt: string;
      TotalPrice: number; TotalDuration: number;
      services: { name: string; price: string; duration: string; category: string }[];
      providers: { name: string; role: string }[];
      startMin: number;
    };
    const byKey = new Map<string, B>();

    for (const r of rows) {
      const key = `${(r.LocCode || '').trim()}|${(r.BookingID || '').trim()}`;
      let b = byKey.get(key);
      if (!b) {
        const conf = (r.ConfirmationType || '').trim().toLowerCase();
        const btype = (r.BookingTypeID || '').trim().toUpperCase();
        const mode =
          conf === 'wo' || btype === 'WALKIN' || conf === 'wi'
            ? 'without_confirmation'
            : 'pre_booking';
        const headerDate = new Date(r.BookingDate as any);
        const startFromHeader =
          !Number.isNaN(headerDate.getTime())
            ? headerDate.getHours() * 60 + headerDate.getMinutes()
            : -1;
        b = {
          BookingId: (r.BookingID || '').trim(),
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
        const name = (r.TechName || '').trim() || tech;
        if (!b.providers.some(p => p.name === name)) b.providers.push({ name, role: 'Staff' });
      }
    }

    for (const b of byKey.values()) {
      b.TimeSlot = b.startMin >= 0 ? slotLabelFromMinutes(b.startMin) : '';
      b.Categories = [...new Set(b.services.map(s => s.category).filter(Boolean))].join(', ');
    }

    const all = [...byKey.values()];
    const dayBookings = all
      .filter(b => b.BookingDate === date)
      .sort((a, b) => a.startMin - b.startMin || a.CreatedAt.localeCompare(b.CreatedAt));

    /* ── Range mode: per-day / per-provider counts for the week grid ── */
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

    /* ── Day stats ── */
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

    /* ── Recent activity feed (booking events + SMS results) ── */
    const activities = await prisma.adminactivitylog
      .findMany({ orderBy: { timestamp: 'desc' }, take: 12 })
      .then(list =>
        list.map(a => ({
          id: a.id,
          actor: a.adminUsername.trim(),
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
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
