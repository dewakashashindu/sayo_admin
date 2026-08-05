import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      phone,
      gender,
      location,
      mode,
      services,
      categories,
      totalDuration,
      totalPrice,
      providers,
      date,
      timeSlot,
      notes,
    } = body;

    // ── Validate required fields ──────────────────────
    if (!name || !email || !phone || !location || !date || !timeSlot) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields.' },
        { status: 400 }
      );
    }

    // ── Upsert user (find by email or create) ─────────
    let user = await prisma.tbl_UserDetails.findFirst({
      where: { EmailAddress: email },
    });

    if (!user) {
      // Generate a placeholder password hash for non-auth bookings
      const placeholderHash = await bcrypt.hash(
        `guest_${email}_${Date.now()}`,
        10
      );

      user = await prisma.tbl_UserDetails.create({
        data: {
          UserName:     name.trim(),
          EmailAddress: email.trim().toLowerCase(),
          PhoneNumber:  phone.trim(),
          PasswordHash: placeholderHash,
          Gender:       gender === 'her' ? 'Female' : 'Male',
        },
      });
    } else {
      // Update name/phone if user already exists
      user = await prisma.tbl_UserDetails.update({
        where: { UserId: user.UserId },
        data:  {
          UserName:    name.trim(),
          PhoneNumber: phone.trim(),
          Gender:      gender === 'her' ? 'Female' : 'Male',
        },
      });
    }

    // ── Check for duplicate booking (same user, date, time) ──
    const duplicate = await prisma.tbl_Bookings.findFirst({
      where: {
        UserId:      user.UserId,
        BookingDate: date,
        TimeSlot:    timeSlot,
        Status:      { not: 'cancelled' },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { success: false, message: 'You already have a booking at this date and time.' },
        { status: 409 }
      );
    }

    // ── Create booking ────────────────────────────────
    const booking = await prisma.tbl_Bookings.create({
      data: {
        UserId:        user.UserId,
        BookingMode:   mode,
        Gender:        gender,
        Location:      location,
        Services:      JSON.stringify(services),
        Categories:    categories.join(','),
        TotalDuration: totalDuration,
        TotalPrice:    totalPrice,
        Providers:     JSON.stringify(providers),
        BookingDate:   date,
        TimeSlot:      timeSlot,
        SpecialNotes:  notes || null,
        Status:        mode === 'walkin' ? 'registered' : 'pending',
      },
    });

    return NextResponse.json({
      success:   true,
      bookingId: booking.BookingId,
      userId:    user.UserId,
      message:   mode === 'walkin'
        ? 'Booking registered successfully.'
        : 'Booking confirmed successfully.',
    });

  } catch (error) {
    console.error('[BOOKING_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

// ── GET — fetch bookings by email (optional utility) ──
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required.' },
        { status: 400 }
      );
    }

    const user = await prisma.tbl_UserDetails.findFirst({
      where:   { EmailAddress: email.toLowerCase() },
      include: {
        bookings: {
          orderBy: { CreatedAt: 'desc' },
          take:    10,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'No user found with this email.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, user });

  } catch (error) {
    console.error('[BOOKING_GET_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    );
  }
}