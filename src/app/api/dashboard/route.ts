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
    const [totalToday, totalPending, totalConfirmed, totalWalkin] = await Promise.all([
      prisma.tbl_Bookings.count({ where: { BookingDate: date, Status: { not: 'cancelled' } } }),
      prisma.tbl_Bookings.count({ where: { BookingDate: date, Status: 'pending' } }),
      prisma.tbl_Bookings.count({ where: { BookingDate: date, Status: 'confirmed' } }),
      prisma.tbl_Bookings.count({ where: { BookingDate: date, BookingMode: 'walkin' } }),
    ]);

    /* ── Bookings for schedule grid ── */
    const bookings = await prisma.tbl_Bookings.findMany({
      where: { BookingDate: date, Status: { not: 'cancelled' } },
      select: { TimeSlot: true, Providers: true, Services: true },
    });

    /* Build provider list dynamically from today's bookings */
    const providerSet = new Set<string>();
    const grid: Record<string, Record<string, string>> = {}; // timeSlot -> providerName -> serviceName

    for (const slot of TIME_SLOTS) grid[slot] = {};

    for (const b of bookings) {
      let provs: { name: string }[] = [];
      let svcs:  { name: string }[] = [];
      try { provs = JSON.parse(b.Providers || '[]'); } catch {}
      try { svcs  = JSON.parse(b.Services  || '[]'); } catch {}

      for (const p of provs) {
        providerSet.add(p.name);
        if (grid[b.TimeSlot]) {
          grid[b.TimeSlot][p.name] = svcs.map(s => s.name).join(', ') || 'Booked';
        }
      }
    }

    const providers = Array.from(providerSet).slice(0, 6); // limit columns shown

    return NextResponse.json({
      success: true,
      date,
      stats: {
        totalToday,
        totalPending,
        totalConfirmed,
        totalWalkin,
      },
      providers,
      timeSlots: TIME_SLOTS,
      grid,
    });

  } catch (error) {
    console.error('[ADMIN_DASHBOARD_API_ERROR]', error);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}