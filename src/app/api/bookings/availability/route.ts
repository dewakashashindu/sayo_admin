import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date          = searchParams.get('date');
    const location       = searchParams.get('location');
    const providersParam = searchParams.get('providers'); // comma-separated names

    if (!date) {
      return NextResponse.json(
        { success: false, message: 'Date is required.' },
        { status: 400 }
      );
    }

    const providerNames = providersParam
      ? providersParam.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    // ── Fetch all active bookings for this date (+ location if given) ──
    const bookings = await prisma.tbl_Bookings.findMany({
      where: {
        BookingDate: date,
        Status: { not: 'cancelled' },
        ...(location ? { Location: location } : {}),
      },
      select: {
        TimeSlot:  true,
        Providers: true,
      },
    });

    const bookedSlots = new Set<string>();

    for (const b of bookings) {
      let bookedProviders: { name: string }[] = [];
      try {
        bookedProviders = JSON.parse(b.Providers || '[]');
      } catch {
        continue;
      }

      const bookedProviderNames = bookedProviders.map(p => p.name);

      // If no specific providers selected yet → block slot if ANY booking exists.
      // If providers selected → only block if there's overlap with THIS booking's providers.
      const overlap = providerNames.length === 0
        ? true
        : bookedProviderNames.some(name => providerNames.includes(name));

      if (overlap) {
        bookedSlots.add(b.TimeSlot);
      }
    }

    return NextResponse.json({
      success: true,
      bookedSlots: Array.from(bookedSlots),
    });

  } catch (error) {
    console.error('[AVAILABILITY_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    );
  }
}