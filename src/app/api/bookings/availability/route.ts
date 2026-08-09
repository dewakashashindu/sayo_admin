import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


function addMinutesToTimeFormat(timeStr: string, mins: number): string {
  // ── Parse ──────────────────────────────────────────────────────────────────
  // Expected input: "09:30 AM" | "02:00 PM" | "12:00 PM" | "12:00 AM"
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    // Guard: if the format is unexpected, return the original string unchanged
    // so we don't silently corrupt the timeline.
    console.warn(`[addMinutesToTimeFormat] Unexpected format: "${timeStr}"`);
    return timeStr;
  }

  let hour   = parseInt(match[1], 10); // 1–12
  const min  = parseInt(match[2], 10); // 0 or 30 (our grid)
  const ampm = match[3].toUpperCase() as 'AM' | 'PM';

  // ── Convert to 24-hour minute-of-day ──────────────────────────────────────
  // 12 AM → 0 hours (midnight), 12 PM → 12 hours (noon)
  let totalMinutes: number;
  if (ampm === 'AM') {
    totalMinutes = (hour === 12 ? 0 : hour) * 60 + min;
  } else {
    totalMinutes = (hour === 12 ? 12 : hour + 12) * 60 + min;
  }

  // ── Advance ───────────────────────────────────────────────────────────────
  totalMinutes += mins;

  // Clamp to a single day (0–1439). Bookings spanning midnight are
  // extremely unlikely in a salon context; wrapping silently would be
  // more confusing than clamping.
  if (totalMinutes >= 1440) totalMinutes = 1439;
  if (totalMinutes < 0)     totalMinutes = 0;

  // ── Convert back to HH:MM AM/PM ───────────────────────────────────────────
  const newHour24 = Math.floor(totalMinutes / 60);
  const newMin    = totalMinutes % 60;

  let newAmpm: 'AM' | 'PM';
  let newHour12: number;

  if (newHour24 === 0) {
    newAmpm   = 'AM';
    newHour12 = 12; // 00:xx → 12:xx AM
  } else if (newHour24 < 12) {
    newAmpm   = 'AM';
    newHour12 = newHour24;
  } else if (newHour24 === 12) {
    newAmpm   = 'PM';
    newHour12 = 12; // 12:xx → 12:xx PM
  } else {
    newAmpm   = 'PM';
    newHour12 = newHour24 - 12;
  }

  // Zero-pad both parts to guarantee "09:00 AM" not "9:0 AM"
  const hh = String(newHour12).padStart(2, '0');
  const mm  = String(newMin).padStart(2, '0');

  return `${hh}:${mm} ${newAmpm}`;
}


function expandToChunks(startTime: string, durationMins: number): string[] {
  // Guard: treat 0 or negative duration as a single 30-min block
  // so the slot is still marked as busy.
  const safeDuration = Math.max(durationMins, 30);

  const chunks: string[] = [];
  const numChunks = Math.ceil(safeDuration / 30); // e.g. 60 min → 2 chunks

  for (let i = 0; i < numChunks; i++) {
    chunks.push(addMinutesToTimeFormat(startTime, i * 30));
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/availability
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date           = searchParams.get('date');
    const location       = searchParams.get('location');
    // Still accepted for potential future use, but no longer drives
    // any server-side filtering — slotEvaluator handles that client-side.
    const providersParam = searchParams.get('providers');

    if (!date) {
      return NextResponse.json(
        { success: false, message: 'Date is required.' },
        { status: 400 }
      );
    }

    // Parse provider names if provided (kept for possible future use)
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
        TimeSlot:      true, // "10:00 AM" — booking start time
        TotalDuration: true, // number — total service minutes (e.g. 60, 90)
        Providers:     true, // stringified JSON: [{ "name": "Nadeesha" }]
      },
    });


    const providerSlots: Record<string, string[]> = {};

    for (const b of bookings) {
      // ── Parse providers JSON column ──────────────────────────────────────
      let bookedProviders: { name: string }[] = [];
      try {
        bookedProviders = JSON.parse(b.Providers || '[]');
      } catch {
        // Malformed JSON in a single row should not crash the entire response.
        // Log it and skip this booking.
        console.warn('[AVAILABILITY_API] Malformed Providers JSON — skipping row:', b);
        continue;
      }

      // ── Validate TimeSlot format before expanding ────────────────────────
      if (!b.TimeSlot) {
        console.warn('[AVAILABILITY_API] Booking has no TimeSlot — skipping:', b);
        continue;
      }

    
      const duration = typeof b.TotalDuration === 'number' && b.TotalDuration > 0
        ? b.TotalDuration
        : 30;

      const occupiedChunks = expandToChunks(b.TimeSlot, duration);
      // e.g. ["10:00 AM", "10:30 AM"] for a 60-min booking at 10:00 AM

      // ── Assign chunks to every provider on this booking ──────────────────
      for (const p of bookedProviders) {
        if (!p?.name) continue;

        if (!providerSlots[p.name]) {
          providerSlots[p.name] = [];
        }

        for (const chunk of occupiedChunks) {
          // De-duplicate: a provider might appear on two overlapping bookings
          // (edge case) — we don't want duplicate entries confusing the
          // evaluator's Set-based checks.
          if (!providerSlots[p.name].includes(chunk)) {
            providerSlots[p.name].push(chunk);
          }
        }
      }
    }

   
    return NextResponse.json({
      success:      true,
      bookedSlots:  [],          // Intentionally empty — see Audit Fix #2
      providerSlots,             // Complete, duration-aware busy map
    });

  } catch (error) {
    console.error('[AVAILABILITY_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    );
  }
}