import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/* ─────────────────────────────────────────────────────────────────────────────
   TIME HELPERS
───────────────────────────────────────────────────────────────────────────── */
function slotToMinutes(timeStr: string): number {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hour       = parseInt(match[1], 10);
  const min      = parseInt(match[2], 10);
  const ampm     = match[3].toUpperCase() as 'AM' | 'PM';
  if (ampm === 'AM') return (hour === 12 ? 0 : hour) * 60 + min;
  return (hour === 12 ? 12 : hour + 12) * 60 + min;
}

function minutesToTimeLabel(totalMinutes: number): string {
  if (totalMinutes >= 1440) totalMinutes = 1439;
  if (totalMinutes < 0)     totalMinutes = 0;
  const newHour24 = Math.floor(totalMinutes / 60);
  const newMin    = totalMinutes % 60;
  let newAmpm: 'AM' | 'PM';
  let newHour12: number;
  if (newHour24 === 0)       { newAmpm = 'AM'; newHour12 = 12; }
  else if (newHour24 < 12)   { newAmpm = 'AM'; newHour12 = newHour24; }
  else if (newHour24 === 12) { newAmpm = 'PM'; newHour12 = 12; }
  else                       { newAmpm = 'PM'; newHour12 = newHour24 - 12; }
  return `${String(newHour12).padStart(2, '0')}:${String(newMin).padStart(2, '0')} ${newAmpm}`;
}

function addMinutesToTimeFormat(timeStr: string, mins: number): string {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    console.warn(`[addMinutesToTimeFormat] Unexpected format: "${timeStr}"`);
    return timeStr;
  }
  const totalMinutes = slotToMinutes(timeStr) + mins;
  return minutesToTimeLabel(totalMinutes);
}

function expandToChunks(startTime: string, durationMins: number): string[] {
  const safeDuration = Math.max(durationMins, 30);
  const chunks: string[] = [];
  const numChunks = Math.ceil(safeDuration / 30);
  for (let i = 0; i < numChunks; i++) {
    chunks.push(addMinutesToTimeFormat(startTime, i * 30));
  }
  return chunks;
}

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/bookings/availability
───────────────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date             = searchParams.get('date');
    const location         = searchParams.get('location');
    const providersParam   = searchParams.get('providers');

    if (!date) {
      return NextResponse.json(
        { success: false, message: 'Date is required.' },
        { status: 400 },
      );
    }

    const _providerNames = providersParam
      ? providersParam.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    const bookings = await prisma.tbl_Bookings.findMany({
      where: {
        BookingDate: date,
        Status:      { not: 'cancelled' },
        ...(location ? { Location: location } : {}),
      },
      select: {
        TimeSlot:      true,
        TotalDuration: true,
        Providers:     true,
        Services:      true, // ✅ FIX: include Services for per-provider duration
      },
    });

    const providerSlots: Record<string, string[]> = {};

    for (const b of bookings) {
      // Parse JSON columns
      let bookedProviders: { name: string }[]                                        = [];
      let bookedServices:  { name: string; duration: string; category: string }[]    = [];

      try {
        bookedProviders = JSON.parse(b.Providers || '[]');
      } catch {
        console.warn('[AVAILABILITY_API] Malformed Providers JSON — skipping:', b);
        continue;
      }

      try {
        // Services column may or may not exist — graceful fallback
        bookedServices = b.Services ? JSON.parse(b.Services) : [];
      } catch {
        bookedServices = [];
      }

      if (!b.TimeSlot) {
        console.warn('[AVAILABILITY_API] Booking has no TimeSlot — skipping:', b);
        continue;
      }

      const bookingStartMins = slotToMinutes(b.TimeSlot);

      // ✅ FIX: Each provider gets their OWN service duration and start time
      // Providers run sequentially — provider[i] starts after provider[i-1] finishes
      let cursorMins = bookingStartMins;

      for (let i = 0; i < bookedProviders.length; i++) {
        const p   = bookedProviders[i];
        const svc = bookedServices[i];

        if (!p?.name) continue;

        // Use this provider's specific service duration
        let duration = 30; // fallback
        if (svc?.duration) {
          const parsed = parseInt(svc.duration, 10);
          if (!isNaN(parsed) && parsed > 0) duration = parsed;
        } else if (bookedProviders.length === 1) {
          // Single provider — use total duration
          const total = typeof b.TotalDuration === 'number' ? b.TotalDuration : 0;
          if (total > 0) duration = total;
        } else {
          // Multi-provider, no per-service data — divide total equally
          const total = typeof b.TotalDuration === 'number' ? b.TotalDuration : 0;
          if (total > 0) duration = Math.round(total / bookedProviders.length);
        }

        // This provider's start time label
        const providerStartLabel = minutesToTimeLabel(cursorMins);

        // Expand into 30-min chunks
        const chunks = expandToChunks(providerStartLabel, duration);

        if (!providerSlots[p.name]) providerSlots[p.name] = [];

        for (const chunk of chunks) {
          if (!providerSlots[p.name].includes(chunk)) {
            providerSlots[p.name].push(chunk);
          }
        }

        // Advance cursor for next provider
        cursorMins += duration;
      }
    }

    return NextResponse.json({
      success:     true,
      bookedSlots: [],     // intentionally empty — evaluator handles logic
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