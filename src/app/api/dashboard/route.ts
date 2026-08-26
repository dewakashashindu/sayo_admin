// app/api/admin/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const TIME_SLOTS = [
  '09:00 AM','09:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM',
  '01:00 PM','01:30 PM','02:00 PM','02:30 PM',
  '03:00 PM','03:30 PM','04:00 PM','04:30 PM',
  '05:00 PM','05:30 PM','06:00 PM',
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    /* ── Stats ── */
    const [totalToday, totalPending, totalConfirmed, totalWalkin, totalCancelled] =
      await Promise.all([
        prisma.tbl_Bookings.count({
          where: { BookingDate: date, Status: { not: 'cancelled' } },
        }),
        prisma.tbl_Bookings.count({
          where: { BookingDate: date, Status: 'pending' },
        }),
        prisma.tbl_Bookings.count({
          where: { BookingDate: date, Status: 'confirmed' },
        }),
        prisma.tbl_Bookings.count({
          where: { BookingDate: date, BookingMode: 'without_confirmation' },
        }),
        prisma.tbl_Bookings.count({
          where: { BookingDate: date, Status: 'cancelled' },
        }),
      ]);

    /* ── All bookings for the date (including cancelled) ── */
    const rawBookings = await prisma.tbl_Bookings.findMany({
      where: { BookingDate: date },
      orderBy: { TimeSlot: 'asc' },
      select: {
        BookingId:    true,
        CusCode:       true,
        BookingMode:  true,
        Gender:       true,
        Location:     true,
        Services:     true,
        Categories:   true,
        TotalDuration:true,
        TotalPrice:   true,
        Providers:    true,
        BookingDate:  true,
        TimeSlot:     true,
        SpecialNotes: true,
        Status:       true,
        CreatedAt:    true,
      },
    });

    /* ── Parse JSON fields ── */
    const bookings = rawBookings.map((b) => {
      let services: { name: string; price: string; duration: string; category: string }[] = [];
      let providers: { name: string; role: string }[] = [];

      try { services  = JSON.parse(b.Services  || '[]'); } catch {}
      try { providers = JSON.parse(b.Providers || '[]'); } catch {}

      return {
        ...b,
        TotalPrice:    Number(b.TotalPrice),
        TotalDuration: Number(b.TotalDuration),
        services,
        providers,
      };
    });

    /* ── Schedule grid ── */
    const providerSet = new Set<string>();
    const grid: Record<string, Record<string, { service: string; bookingId: number; status: string }>> = {};

    for (const slot of TIME_SLOTS) grid[slot] = {};

    for (const b of bookings) {
      if (b.Status === 'cancelled') continue;
      for (const p of b.providers) {
        providerSet.add(p.name);
        if (grid[b.TimeSlot]) {
          grid[b.TimeSlot][p.name] = {
            service:   b.services.map((s) => s.name).join(', ') || 'Booked',
            bookingId: b.BookingId,
            status:    b.Status,
          };
        }
      }
    }

    const providers = Array.from(providerSet).slice(0, 6);

    return NextResponse.json({
      success: true,
      date,
      stats: { totalToday, totalPending, totalConfirmed, totalWalkin, totalCancelled },
      providers,
      timeSlots: TIME_SLOTS,
      grid,
      bookings,
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}