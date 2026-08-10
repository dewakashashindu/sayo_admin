import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
─────────────────────────────────────────────────────────────────────────────── */
interface BookingService {
  name:     string;
  price:    string;
  duration: string;
}

interface BookingProvider {
  name: string;
  role: string;
}

// FIX 1 — `date` is now inside the interface, not a floating external field
interface BookingRequestBody {
  name:          string;
  email:         string;
  phone:         string;
  gender?:       string;          // optional on the way IN (we default it below)
  location:      string;
  mode:          string;
  date:          string;          // ← MOVED HERE from the ad-hoc & { date?: string }
  timeSlot:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  categories?:   string | string[];
  totalDuration: number;
  totalPrice:    number;
  notes?:        string;
}

/* ─────────────────────────────────────────
   NODEMAILER TRANSPORTER
───────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
  pool:           true,
  maxConnections: 5,
  rateDelta:      1000,
  rateLimit:      5,
});

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function formatDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtMins(m: number): string {
  if (m <= 0) return '—';
  return m >= 60
    ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
    : `${m} min`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAYLOAD VALIDATOR
─────────────────────────────────────────────────────────────────────────────── */
function validateBookingBody(body: Partial<BookingRequestBody>): string | null {
  if (!body.name?.trim())     return 'Name is required.';
  if (!body.email?.trim())    return 'Email is required.';
  if (!body.phone?.trim())    return 'Phone number is required.';
  if (!body.location?.trim()) return 'Location is required.';
  if (!body.date?.trim())     return 'Date is required.';
  if (!body.timeSlot?.trim()) return 'Time slot is required.';

  if (!Array.isArray(body.services) || body.services.length === 0) {
    return 'At least one service is required.';
  }

  // Providers are optional for confirmed mode (staff will assign on call)
  // Walk-in (without_confirmation) must have at least one provider
  const isWalkin = body.mode === 'without_confirmation';
  if (isWalkin && (!Array.isArray(body.providers) || body.providers.length === 0)) {
    return 'At least one provider is required.';
  }
  if (!Array.isArray(body.providers)) {
    return 'Invalid providers format.';
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   FIX 2 — resolveGender
   Schema: Gender String @db.VarChar(10)  ← required, NOT nullable
   The DB column is required so we must always provide a non-empty string.
   We cap at 10 chars to match the VarChar(10) constraint.
─────────────────────────────────────────────────────────────────────────────── */
function resolveGender(raw: string | undefined): string {
  const val = (raw ?? '').trim().slice(0, 10);
  return val.length > 0 ? val : 'Unknown';
}

/* ─────────────────────────────────────────────────────────────────────────────
   FIX 3 — resolveCategories
   Schema: Categories String @db.VarChar(255)  ← required, NOT nullable
   We must always provide a non-empty string.
─────────────────────────────────────────────────────────────────────────────── */
function resolveCategories(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) {
    return raw.join(',').slice(0, 255) || 'General';
  }
  const val = (raw ?? '').trim().slice(0, 255);
  return val.length > 0 ? val : 'General';
}

/* ─────────────────────────────────────────
   buildPlainText
───────────────────────────────────────── */
function buildPlainText(data: {
  name:          string;
  bookingId:     number;
  mode:          string;
  location:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
  phone:         string;
}): string {
  const isWithout = data.mode === 'without_confirmation';

  const lines = [
    `SAYO Beauty — ${isWithout ? 'Booking Registered' : 'Appointment Request Received'}`,
    `Reference: #${data.bookingId}`,
    ``,
    `Dear ${data.name},`,
    ``,
    isWithout
      ? `Your appointment has been registered. No confirmation call is needed — please arrive on time.`
      : `Thank you for your booking. Our team will call you at ${data.phone} shortly to confirm your appointment.`,
    ``,
    `── APPOINTMENT DETAILS ──────────────────`,
    `Date:        ${formatDate(data.date)}`,
    `Time:        ${data.timeSlot}`,
    `Branch:      ${data.location}`,
    `Provider(s): ${data.providers.map(p => p.name).join(', ')}`,
    `Duration:    ${fmtMins(data.totalDuration)}`,
    ``,
    `── SERVICES ─────────────────────────────`,
    ...data.services.map(s => `  • ${s.name}  |  ${s.price}  |  ${s.duration}`),
    ``,
    data.notes ? `Notes: ${data.notes.trim()}` : '',
    `── NOTE ─────────────────────────────────`,
    isWithout
      ? `Slots are first-come-first-served. Please arrive at least 5 minutes early. Payment is collected at the salon.`
      : `We will call ${data.phone} as soon as possible to confirm. If you do not receive a call within 24 hours, please contact us directly.`,
    ``,
    `────────────────────────────────────────`,
    `SAYO Beauty  |  Colombo • Negombo • Kiribathgoda`,
    `sayo.worksofficial@gmail.com`,
    ``,
    `You are receiving this email because you made a booking at SAYO Beauty.`,
    `This is a transactional notification.`,
  ];

  return lines.join('\n');
}

/* ─────────────────────────────────────────
   buildConfirmedEmail
───────────────────────────────────────── */
function buildConfirmedEmail(data: {
  name:          string;
  email:         string;
  phone:         string;
  bookingId:     number;
  location:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
}) {
  const safe = {
    name:      escapeHtml(data.name),
    phone:     escapeHtml(data.phone),
    location:  escapeHtml(data.location),
    timeSlot:  escapeHtml(data.timeSlot),
    providers: data.providers.map(p => ({ ...p, name: escapeHtml(p.name) })),
    services:  data.services.map(s => ({
      ...s,
      name:     escapeHtml(s.name),
      price:    escapeHtml(s.price),
      duration: escapeHtml(s.duration),
    })),
  };

  const serviceRows = safe.services.map(s => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e8e0cc;
                 color:#2d2000;font-size:13px;font-family:Arial,sans-serif;">
        ${s.name}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e8e0cc;
                 color:#7a5800;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;font-weight:bold;">
        ${s.price}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e8e0cc;
                 color:#9a7820;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.duration}
      </td>
    </tr>`).join('');

  const providerNames = safe.providers.map(p => p.name).join(', ');
  const subject       = `Your SAYO Beauty Appointment — Ref ${data.bookingId}`;
  const preheader     = `Our team will call ${data.phone} shortly to confirm your appointment on ${formatDate(data.date)}.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Appointment Request — SAYO Beauty</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f0e8;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <div style="display:none;font-size:1px;color:#f5f0e8;line-height:1px;
              max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f5f0e8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;
                 border:1px solid #d4b96a;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#7a4f00;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#f0c96a;font-size:10px;font-weight:bold;
                         letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;
                          letter-spacing:1px;font-family:Arial,sans-serif;">
                Appointment <strong style="color:#f0c96a;">Request Received</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.6);font-size:12px;
                         font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#f0c96a;">Ref ${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 24px;color:#3d3000;font-size:14px;
                          line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#1a1000;">${safe.name}</strong>,<br/>
                Thank you for choosing SAYO Beauty. We have received your booking
                request and it is currently
                <strong style="color:#7a4f00;">pending confirmation</strong>.
              </p>

              <!-- CALL BANNER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#fff8e8;border:2px solid #d4a843;
                       border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:28px;">📞</p>
                    <p style="margin:0 0 8px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">
                      CONFIRMATION CALL
                    </p>
                    <p style="margin:0 0 12px;color:#1a1000;font-size:16px;
                               font-weight:bold;font-family:Arial,sans-serif;">
                      We will call you shortly at
                    </p>
                    <div style="display:inline-block;background-color:#7a4f00;
                                border-radius:999px;padding:8px 24px;margin-bottom:12px;">
                      <span style="color:#ffffff;font-size:17px;font-weight:bold;
                                   letter-spacing:2px;font-family:Arial,sans-serif;">
                        ${safe.phone}
                      </span>
                    </div>
                    <p style="margin:0;color:#6b5a30;font-size:12px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Our team will contact you
                      <strong style="color:#3d3000;">as soon as possible</strong>
                      to confirm your appointment.<br/>
                      Please keep your phone nearby.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- BOOKING DETAILS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#faf6ee;border:1px solid #d4b96a;
                       border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 22px 6px;">
                    <p style="margin:0;color:#7a4f00;font-size:10px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      YOUR BOOKING DETAILS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="padding:6px 0;color:#9a8060;
                                               font-size:12px;font-family:Arial,sans-serif;">Date</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${formatDate(data.date)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Time</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.timeSlot}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Branch</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.location}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Provider(s)</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${providerNames}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Duration</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${fmtMins(data.totalDuration)}
                        </td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;font-size:12px;
                                   font-family:Arial,sans-serif;vertical-align:top;">Notes</td>
                        <td style="padding:6px 0;color:#4a3800;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${escapeHtml(data.notes)}
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SERVICES TABLE -->
              <p style="margin:0 0 8px;color:#7a4f00;font-size:10px;font-weight:bold;
                          letter-spacing:3px;text-transform:uppercase;
                          font-family:Arial,sans-serif;">
                SERVICES REQUESTED
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #d4b96a;border-radius:8px;
                       overflow:hidden;margin-bottom:24px;">
                <thead>
                  <tr style="background-color:#faf0d4;">
                    <th style="padding:10px 14px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:2px;text-align:left;font-family:Arial,sans-serif;">
                      SERVICE
                    </th>
                    <th style="padding:10px 14px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:2px;text-align:right;font-family:Arial,sans-serif;">
                      PRICE
                    </th>
                    <th style="padding:10px 14px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:2px;text-align:right;font-family:Arial,sans-serif;">
                      TIME
                    </th>
                  </tr>
                </thead>
                <tbody>${serviceRows}</tbody>
              </table>

              <!-- WHAT HAPPENS NEXT -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#faf6ee;border:1px solid #e0d0a0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;color:#7a4f00;font-size:10px;font-weight:bold;
                               letter-spacing:2px;font-family:Arial,sans-serif;">
                      WHAT HAPPENS NEXT
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;width:22px;">
                          <span style="color:#7a4f00;font-size:13px;
                                       font-family:Arial,sans-serif;">1.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          Our team will call
                          <strong style="color:#3d3000;">${safe.phone}</strong>
                          shortly to confirm your slot.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#7a4f00;font-size:13px;
                                       font-family:Arial,sans-serif;">2.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          Once confirmed, your booking is locked in.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#7a4f00;font-size:13px;
                                       font-family:Arial,sans-serif;">3.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          Payment is collected at the salon on the day.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#7a4f00;font-size:13px;
                                       font-family:Arial,sans-serif;">4.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          To cancel or reschedule, please notify us at least
                          <strong style="color:#3d3000;">24 hours in advance</strong>.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#7a4f00;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#f0c96a;font-size:11px;font-weight:bold;
                         letter-spacing:3px;font-family:Arial,sans-serif;">SAYO BEAUTY</p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.6);font-size:11px;
                         font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:10px;
                         line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because you made a booking at SAYO Beauty.<br/>
                This is a transactional notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/* ─────────────────────────────────────────
   buildWithoutConfirmationEmail
───────────────────────────────────────── */
function buildWithoutConfirmationEmail(data: {
  name:          string;
  email:         string;
  phone:         string;
  bookingId:     number;
  location:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
}) {
  const safe = {
    name:      escapeHtml(data.name),
    location:  escapeHtml(data.location),
    timeSlot:  escapeHtml(data.timeSlot),
    providers: data.providers.map(p => ({ ...p, name: escapeHtml(p.name) })),
    services:  data.services.map(s => ({
      ...s,
      name:     escapeHtml(s.name),
      price:    escapeHtml(s.price),
      duration: escapeHtml(s.duration),
    })),
  };

  const providerNames = safe.providers.map(p => p.name).join(', ');

  const serviceList = safe.services.map(s => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;
                 color:#1a3a1a;font-size:13px;font-family:Arial,sans-serif;">
        ${s.name}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;
                 color:#1a6b1a;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;font-weight:bold;">
        ${s.price}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;
                 color:#4a8a4a;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.duration}
      </td>
    </tr>`).join('');

  const subject   = `Your SAYO Beauty Booking Confirmed — ${formatDate(data.date)}`;
  const preheader = `Your booking at ${data.location} on ${formatDate(data.date)} at ${data.timeSlot} is registered. No confirmation call needed.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Booking Confirmed — SAYO Beauty</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f7f0;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <div style="display:none;font-size:1px;color:#f0f7f0;line-height:1px;
              max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f0f7f0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;
                 border:1px solid #7bc47b;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#1a6b1a;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#a0e8a0;font-size:10px;font-weight:bold;
                         letter-spacing:4px;text-transform:uppercase;
                         font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;
                          letter-spacing:1px;font-family:Arial,sans-serif;">
                Booking <strong style="color:#a0e8a0;">Confirmed</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.6);font-size:12px;
                         font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#a0e8a0;">Ref ${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 22px;color:#1a3a1a;font-size:14px;
                          line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#0a200a;">${safe.name}</strong>,<br/>
                Your appointment has been
                <strong style="color:#1a6b1a;">confirmed</strong>.
                No confirmation call is needed — simply arrive at the salon on time.
              </p>

              <!-- NO-CALL NOTICE -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f0fff0;border:2px solid #7bc47b;
                       border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 22px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:28px;">✅</p>
                    <p style="margin:0 0 6px;color:#1a6b1a;font-size:11px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      NO CONFIRMATION NEEDED
                    </p>
                    <p style="margin:0;color:#3a5a3a;font-size:13px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Just show up at
                      <strong style="color:#0a200a;">${safe.location}</strong> on<br/>
                      <strong style="color:#0a200a;">${formatDate(data.date)}</strong>
                      at <strong style="color:#0a200a;">${safe.timeSlot}</strong>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- BOOKING DETAILS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f5faf5;border:1px solid #b0d8b0;
                       border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 22px 6px;">
                    <p style="margin:0;color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      BOOKING DETAILS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="padding:6px 0;color:#6a8a6a;
                                               font-size:12px;font-family:Arial,sans-serif;">
                          Date
                        </td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${formatDate(data.date)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Time</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.timeSlot}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Branch</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.location}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Provider(s)
                        </td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${providerNames}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Duration</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${fmtMins(data.totalDuration)}
                        </td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;font-size:12px;
                                   font-family:Arial,sans-serif;vertical-align:top;">Notes</td>
                        <td style="padding:6px 0;color:#2a4a2a;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${escapeHtml(data.notes)}
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SERVICES -->
              <p style="margin:0 0 8px;color:#1a6b1a;font-size:10px;font-weight:bold;
                          letter-spacing:3px;text-transform:uppercase;
                          font-family:Arial,sans-serif;">
                SERVICES
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:24px;border:1px solid #b0d8b0;
                       border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background-color:#e8f5e8;">
                    <th style="padding:8px 12px;border-bottom:1px solid #b0d8b0;
                               color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;text-align:left;
                               font-family:Arial,sans-serif;">SERVICE</th>
                    <th style="padding:8px 12px;border-bottom:1px solid #b0d8b0;
                               color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;text-align:right;
                               font-family:Arial,sans-serif;">PRICE</th>
                    <th style="padding:8px 12px;border-bottom:1px solid #b0d8b0;
                               color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;text-align:right;
                               font-family:Arial,sans-serif;">TIME</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="3" style="padding:0 12px;">
                      <table role="presentation" width="100%"
                             cellpadding="0" cellspacing="0">
                        ${serviceList}
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- REMINDER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0 0 5px;color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;font-family:Arial,sans-serif;">REMINDER</p>
                    <p style="margin:0;color:#4a6a4a;font-size:12px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Slots are
                      <strong style="color:#1a3a1a;">first-come-first-served</strong>.
                      Please arrive at least
                      <strong style="color:#1a3a1a;">5 minutes early</strong>.
                      Payment is collected at the salon.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1a6b1a;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#a0e8a0;font-size:11px;font-weight:bold;
                         letter-spacing:3px;font-family:Arial,sans-serif;">SAYO BEAUTY</p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.6);font-size:11px;
                         font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:10px;
                         line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because you made a booking at SAYO Beauty.<br/>
                This is a transactional notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/* ─────────────────────────────────────────
   SEND HELPER
───────────────────────────────────────── */
async function sendBookingEmail(
  to:        string,
  subject:   string,
  html:      string,
  text:      string,
  bookingId: number,
): Promise<void> {
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || 'SAYO Beauty <sayo.worksofficial@gmail.com>',
      replyTo: process.env.SMTP_FROM || 'SAYO Beauty <sayo.worksofficial@gmail.com>',
      to,
      subject,
      text,
      html,
      headers: {
        'List-Unsubscribe':
          '<mailto:sayo.worksofficial@gmail.com?subject=unsubscribe>',
        'List-Unsubscribe-Post':          'List-Unsubscribe=One-Click',
        'X-Mailer':                       'SAYO-Beauty-Booking/1.0',
        'X-Priority':                     '3',
        'X-MS-Exchange-Organization-SCL': '-1',
        'Precedence':                     'transactional',
        'Auto-Submitted':                 'auto-generated',
        'Message-ID':
          `<booking-${bookingId}-${Date.now()}@sayo.beauty>`,
        'X-Entity-Ref-ID': `booking-${bookingId}`,
        'Feedback-ID':     `booking:sayo-beauty`,
      },
    });
    console.log(`[EMAIL_SENT] → ${to} | ${subject}`);
  } catch (err) {
    console.error('[EMAIL_ERROR]', err);
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   POST — create booking
═════════════════════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BookingRequestBody>;

    // ── 1. Validate ───────────────────────────────────────────────────────────
    const validationError = validateBookingBody(body);
    if (validationError) {
      return NextResponse.json(
        { success: false, message: validationError },
        { status: 400 }
      );
    }

    // Safe to assert after validation
    const {
      name,
      email,
      phone,
      gender,
      location,
      mode,
      date,
      timeSlot,
      services,
      providers,
      categories,
      totalDuration,
      totalPrice,
      notes,
    } = body as BookingRequestBody;

    // ── FIX 2: Gender — schema requires String (NOT NULL, VarChar(10)) ────────
    // resolveGender guarantees a non-empty string capped at 10 chars.
    const resolvedGender = resolveGender(gender);

    // ── FIX 3: Categories — schema requires String (NOT NULL) ─────────────────
    // resolveCategories guarantees a non-empty string capped at 255 chars.
    const resolvedCategories = resolveCategories(categories);

    // ── 2. Upsert user ────────────────────────────────────────────────────────
    let user = await prisma.tbl_UserDetails.findFirst({
      where: { EmailAddress: email.trim().toLowerCase() },
    });

    if (!user) {
      const placeholderHash = await bcrypt.hash(
        `guest_${email}_${Date.now()}`, 10
      );
      user = await prisma.tbl_UserDetails.create({
        data: {
          UserName:     name.trim(),
          EmailAddress: email.trim().toLowerCase(),
          PhoneNumber:  phone.trim(),
          PasswordHash: placeholderHash,
          // Gender on tbl_UserDetails is String? (nullable) — safe to pass directly
          Gender:       gender ?? null,
        },
      });
    } else {
      user = await prisma.tbl_UserDetails.update({
        where: { UserId: user.UserId },
        data: {
          UserName:    name.trim(),
          PhoneNumber: phone.trim(),
          // Preserve existing gender if none supplied
          Gender:      gender?.trim() || user.Gender,
        },
      });
    }

    // ── 3. Duplicate check (provider-aware) ───────────────────────────────────
    // Same slot is only a conflict if the SAME provider is involved.
    const requestedProviderNames = new Set(
      providers.map(p => p.name.trim().toLowerCase())
    );

    const sameSlotBookings = await prisma.tbl_Bookings.findMany({
      where: {
        UserId:      user.UserId,
        BookingDate: date,
        TimeSlot:    timeSlot,
        Status:      { not: 'cancelled' },
      },
      select: {
        Providers: true,
        BookingId: true,
      },
    });

    for (const existing of sameSlotBookings) {
      let existingProviders: { name: string }[] = [];
      try {
        existingProviders = JSON.parse(existing.Providers || '[]');
      } catch {
        console.warn(
          `[BOOKING_POST] Malformed Providers JSON on BookingId ${existing.BookingId}`
        );
        continue;
      }

      const hasConflict = existingProviders.some(ep =>
        requestedProviderNames.has(ep.name.trim().toLowerCase())
      );

      if (hasConflict) {
        return NextResponse.json(
          {
            success: false,
            message: 'One or more of the selected providers is already booked at this time.',
          },
          { status: 409 }
        );
      }
    }

    // ── 4. Create booking ─────────────────────────────────────────────────────
    const dbStatus = mode === 'without_confirmation'
      ? 'without_confirmation'
      : 'pending';

    const booking = await prisma.tbl_Bookings.create({
      data: {
        UserId:        user.UserId,
        BookingMode:   mode === 'without_confirmation'
                         ? 'without_confirmation'
                         : 'confirmed',
        // FIX 2 — resolvedGender is always a non-empty string ≤ 10 chars
        Gender:        resolvedGender,
        Location:      location,
        Services:      JSON.stringify(services),
        // FIX 3 — resolvedCategories is always a non-empty string ≤ 255 chars
        Categories:    resolvedCategories,
        TotalDuration: totalDuration,
        TotalPrice:    totalPrice,
        Providers:     JSON.stringify(providers),
        BookingDate:   date,
        TimeSlot:      timeSlot,
        SpecialNotes:  notes || null,
        Status:        dbStatus,
      },
    });

    // ── 5. Send email ─────────────────────────────────────────────────────────
    const emailPayload = {
      name,
      email:         email.trim().toLowerCase(),
      phone:         phone.trim(),
      bookingId:     booking.BookingId,
      location,
      services,
      providers,
      date,
      timeSlot,
      totalDuration: Number(totalDuration) || 0,
      notes:         notes || null,
    };

    const plainText = buildPlainText({ ...emailPayload, mode });

    if (mode === 'without_confirmation') {
      const { subject, html } = buildWithoutConfirmationEmail(emailPayload);
      sendBookingEmail(
        emailPayload.email, subject, html, plainText, booking.BookingId
      );
    } else {
      const { subject, html } = buildConfirmedEmail(emailPayload);
      sendBookingEmail(
        emailPayload.email, subject, html, plainText, booking.BookingId
      );
    }

    // ── 6. Respond ────────────────────────────────────────────────────────────
    return NextResponse.json({
      success:   true,
      bookingId: booking.BookingId,
      userId:    user.UserId,
      message:   mode === 'without_confirmation'
        ? 'Booking registered without confirmation.'
        : 'Booking request received. We will call you shortly to confirm.',
    });

  } catch (error) {
    console.error('[BOOKING_API_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────
   GET — fetch bookings by email
───────────────────────────────────────── */
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