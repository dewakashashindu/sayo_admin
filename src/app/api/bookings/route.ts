import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

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
  tls: {
    rejectUnauthorized: false,
  },
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ─────────────────────────────────────────
   PLAIN TEXT  (spam filters love it)
   — NO total shown, only per-service prices
───────────────────────────────────────── */
function buildPlainText(data: {
  name:          string;
  bookingId:     number;
  mode:          string;
  location:      string;
  services:      { name: string; price: string; duration: string }[];
  providers:     { name: string; role: string }[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
  phone:         string;
}): string {
  const lines = [
    `SAYO Beauty — ${data.mode === 'walkin' ? 'Booking Without Confirmation' : 'Booking Request Received'}`,
    `Reference: #${data.bookingId}`,
    ``,
    `Dear ${data.name},`,
    ``,
    data.mode === 'walkin'
      ? `Your appointment has been registered without confirmation. No call is needed — please arrive on time.`
      : `Thank you for your booking request. Our team will call you at ${data.phone} shortly to confirm your appointment.`,
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
    data.notes ? `Notes: ${data.notes}\n` : '',
    `── NOTE ─────────────────────────────────`,
    data.mode === 'walkin'
      ? `Registered without confirmation. Slots are first-come-first-served. Please arrive at least 5 minutes early. Payment is collected at the salon.`
      : `We will call ${data.phone} as soon as possible to confirm. If you do not receive a call within 24 hours, please contact us directly.`,
    ``,
    `────────────────────────────────────────`,
    `SAYO Beauty  |  Colombo • Negombo • Kiribathgoda`,
    `sayo.worksofficial@gmail.com`,
    ``,
    `You are receiving this email because you made a booking at SAYO Beauty.`,
    `This is a transactional email — no marketing content.`,
  ];
  return lines.join('\n');
}

/* ─────────────────────────────────────────
   WITH CONFIRMATION EMAIL
   — tells customer we will CALL to confirm
   — NO total, only per-service prices
───────────────────────────────────────── */
function buildConfirmedEmail(data: {
  name:          string;
  email:         string;
  phone:         string;
  bookingId:     number;
  location:      string;
  services:      { name: string; price: string; duration: string }[];
  providers:     { name: string; role: string }[];
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
      <td style="padding:10px 14px;border-bottom:1px solid #1e1a00;
                 color:#d4a843;font-size:13px;font-family:Arial,sans-serif;">
        ${s.name}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e1a00;
                 color:#a07828;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.price}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e1a00;
                 color:#6a5020;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.duration}
      </td>
    </tr>`).join('');

  const providerNames = safe.providers.map(p => p.name).join(', ');
  const preheader     = `We received your booking request — our team will call ${data.phone} shortly to confirm.`;
  const subject       = `Booking Request Received #${data.bookingId} — SAYO Beauty`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Booking Request Received — SAYO Beauty</title>
  <style>
    body{margin:0;padding:0;background-color:#0a0900;
         -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    a{color:#B8860B;}
    @media only screen and (max-width:600px){
      .email-wrapper{width:100% !important;padding:20px 8px !important;}
      .email-body{padding:24px 20px !important;}
      .detail-label{width:auto !important;}
      .call-box{padding:20px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0a0900;">

  <!-- preheader -->
  <div style="display:none;font-size:1px;color:#0a0900;line-height:1px;
              max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#0a0900;">
    <tr>
      <td align="center" class="email-wrapper" style="padding:32px 16px;">

        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;width:100%;border-radius:14px;overflow:hidden;
                 border:1px solid rgba(184,134,11,0.28);
                 box-shadow:0 4px 40px rgba(0,0,0,0.6);">

          <!-- ── HEADER ─ -->
          <tr>
            <td style="background-color:#1a1300;padding:36px 40px 28px;
                       text-align:center;border-bottom:3px solid #B8860B;">
              <p style="margin:0 0 6px;color:#B8860B;font-size:10px;font-weight:bold;
                         letter-spacing:4px;text-transform:uppercase;
                         font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:400;
                          letter-spacing:1px;font-family:Arial,sans-serif;">
                Booking <strong style="color:#B8860B;">Request Received</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.4);font-size:12px;
                         font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#B8860B;">#${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- ── BODY ── -->
          <tr>
            <td class="email-body" style="background-color:#110e00;padding:32px 40px;">

              <p style="margin:0 0 24px;color:rgba(255,255,255,0.75);font-size:14px;
                          line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#ffffff;">${safe.name}</strong>,<br/>
                Thank you for choosing SAYO Beauty. We have received your booking request
                and it is currently <strong style="color:#B8860B;">pending confirmation</strong>.
              </p>

              <!-- ── CALL CONFIRMATION BANNER ── -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:linear-gradient(135deg,#1f1500 0%,#2a1c00 100%);
                       border:2px solid #B8860B;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td class="call-box" style="padding:24px 28px;text-align:center;">

                    <div style="width:52px;height:52px;border-radius:50%;
                                background:rgba(184,134,11,0.18);
                                border:2px solid rgba(184,134,11,0.5);
                                margin:0 auto 14px;
                                display:table;line-height:52px;text-align:center;">
                      <span style="font-size:22px;display:table-cell;
                                   vertical-align:middle;">📞</span>
                    </div>

                    <p style="margin:0 0 8px;color:#B8860B;font-size:11px;
                               font-weight:bold;letter-spacing:3px;
                               text-transform:uppercase;font-family:Arial,sans-serif;">
                      CONFIRMATION CALL
                    </p>
                    <p style="margin:0 0 14px;color:#ffffff;font-size:17px;
                               font-weight:bold;font-family:Arial,sans-serif;">
                      We will call you shortly at
                    </p>

                    <div style="display:inline-block;background:rgba(184,134,11,0.22);
                                border:1.5px solid rgba(184,134,11,0.6);
                                border-radius:999px;padding:8px 24px;
                                margin-bottom:14px;">
                      <span style="color:#B8860B;font-size:18px;font-weight:bold;
                                   letter-spacing:2px;font-family:Arial,sans-serif;">
                        ${safe.phone}
                      </span>
                    </div>

                    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:12px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Our team will contact you <strong style="color:rgba(255,255,255,0.75);">
                      as soon as possible</strong> to confirm your appointment.<br/>
                      Please keep your phone nearby.
                    </p>

                  </td>
                </tr>
              </table>

              <!-- ── APPOINTMENT DETAILS ── -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:rgba(184,134,11,0.07);
                       border:1px solid rgba(184,134,11,0.22);
                       border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 22px 6px;">
                    <p style="margin:0;color:#B8860B;font-size:10px;font-weight:bold;
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
                        <td class="detail-label" width="38%"
                          style="padding:6px 0;color:rgba(255,255,255,0.38);
                                 font-size:12px;font-family:Arial,sans-serif;">
                          Date
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${formatDate(data.date)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Time
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.timeSlot}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Branch
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.location}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Provider(s)
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${providerNames}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Duration
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${fmtMins(data.totalDuration)}
                        </td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;
                                   vertical-align:top;">
                          Notes
                        </td>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.65);
                                   font-size:13px;font-family:Arial,sans-serif;">
                          ${escapeHtml(data.notes)}
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- ── SERVICES TABLE (prices only, no total) ── -->
              <p style="margin:0 0 8px;color:#B8860B;font-size:10px;font-weight:bold;
                          letter-spacing:3px;text-transform:uppercase;
                          font-family:Arial,sans-serif;">
                SERVICES REQUESTED
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid rgba(184,134,11,0.18);border-radius:8px;
                       overflow:hidden;margin-bottom:24px;">
                <thead>
                  <tr style="background-color:rgba(184,134,11,0.1);">
                    <th style="padding:10px 14px;color:#B8860B;font-size:11px;
                               font-weight:bold;letter-spacing:2px;text-align:left;
                               font-family:Arial,sans-serif;">SERVICE</th>
                    <th style="padding:10px 14px;color:#B8860B;font-size:11px;
                               font-weight:bold;letter-spacing:2px;text-align:right;
                               font-family:Arial,sans-serif;">PRICE</th>
                    <th style="padding:10px 14px;color:#B8860B;font-size:11px;
                               font-weight:bold;letter-spacing:2px;text-align:right;
                               font-family:Arial,sans-serif;">TIME</th>
                  </tr>
                </thead>
                <tbody>${serviceRows}</tbody>
              </table>

              <!-- ── WHAT HAPPENS NEXT ── -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:rgba(255,255,255,0.03);
                       border:1px solid rgba(255,255,255,0.07);
                       border-radius:8px;margin-bottom:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;color:#B8860B;font-size:10px;
                               font-weight:bold;letter-spacing:2px;
                               font-family:Arial,sans-serif;">
                      WHAT HAPPENS NEXT
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;width:22px;">
                          <span style="color:#B8860B;font-size:13px;">1.</span>
                        </td>
                        <td style="padding:4px 0;color:rgba(255,255,255,0.5);
                                   font-size:12px;line-height:1.6;
                                   font-family:Arial,sans-serif;">
                          Our team will call
                          <strong style="color:rgba(255,255,255,0.75);">${safe.phone}</strong>
                          shortly to confirm your slot.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#B8860B;font-size:13px;">2.</span>
                        </td>
                        <td style="padding:4px 0;color:rgba(255,255,255,0.5);
                                   font-size:12px;line-height:1.6;
                                   font-family:Arial,sans-serif;">
                          Once confirmed, your booking is locked in.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#B8860B;font-size:13px;">3.</span>
                        </td>
                        <td style="padding:4px 0;color:rgba(255,255,255,0.5);
                                   font-size:12px;line-height:1.6;
                                   font-family:Arial,sans-serif;">
                          Payment is collected at the salon on the day of your appointment.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#B8860B;font-size:13px;">4.</span>
                        </td>
                        <td style="padding:4px 0;color:rgba(255,255,255,0.5);
                                   font-size:12px;line-height:1.6;
                                   font-family:Arial,sans-serif;">
                          To cancel or reschedule, please notify us at least
                          <strong style="color:rgba(255,255,255,0.75);">24 hours in advance</strong>.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="background-color:#0d0b00;padding:22px 40px;text-align:center;
                       border-top:1px solid rgba(184,134,11,0.15);">
              <p style="margin:0 0 4px;color:#B8860B;font-size:11px;font-weight:bold;
                         letter-spacing:3px;font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.25);font-size:11px;
                         font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.18);font-size:10px;
                         line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because you made a booking at SAYO Beauty.<br/>
                This is a transactional email — no marketing content.
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
   WITHOUT CONFIRMATION EMAIL
   — no call, no total, only per-service prices
───────────────────────────────────────── */
function buildWithoutConfirmationEmail(data: {
  name:          string;
  email:         string;
  phone:         string;
  bookingId:     number;
  location:      string;
  services:      { name: string; price: string; duration: string }[];
  providers:     { name: string; role: string }[];
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
  const serviceList   = safe.services.map(s => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid rgba(34,197,94,0.1);
                 color:rgba(255,255,255,0.7);font-size:13px;font-family:Arial,sans-serif;">
        ${s.name}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid rgba(34,197,94,0.1);
                 color:#22c55e;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.price}
      </td>
    </tr>`).join('');

  const preheader = `Registered without confirmation at SAYO Beauty — ${formatDate(data.date)} at ${data.timeSlot}, ${data.location}.`;
  const subject   = `Registered Without Confirmation #${data.bookingId} — SAYO Beauty`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Registered Without Confirmation — SAYO Beauty</title>
  <style>
    body{margin:0;padding:0;background-color:#020a04;
         -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    a{color:#22c55e;}
    @media only screen and (max-width:600px){
      .email-wrapper{width:100% !important;padding:20px 8px !important;}
      .email-body{padding:24px 20px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#020a04;">

  <!-- preheader -->
  <div style="display:none;font-size:1px;color:#020a04;line-height:1px;
              max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#020a04;">
    <tr>
      <td align="center" class="email-wrapper" style="padding:32px 16px;">

        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;width:100%;border-radius:14px;overflow:hidden;
                 border:1px solid rgba(34,197,94,0.25);
                 box-shadow:0 4px 40px rgba(0,0,0,0.6);">

          <!-- header -->
          <tr>
            <td style="background-color:#001a08;padding:36px 40px 28px;
                       text-align:center;border-bottom:3px solid #22c55e;">
              <p style="margin:0 0 6px;color:#22c55e;font-size:10px;font-weight:bold;
                         letter-spacing:4px;text-transform:uppercase;
                         font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:400;
                          letter-spacing:1px;font-family:Arial,sans-serif;">
                Registered <strong style="color:#22c55e;">Without Confirmation</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.4);font-size:12px;
                         font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#22c55e;">#${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- body -->
          <tr>
            <td class="email-body" style="background-color:#030f06;padding:32px 40px;">

              <p style="margin:0 0 22px;color:rgba(255,255,255,0.75);font-size:14px;
                          line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#ffffff;">${safe.name}</strong>,<br/>
                Your appointment has been
                <strong style="color:#22c55e;">registered without confirmation</strong>.
                No confirmation call is needed — simply arrive at the salon on time.
              </p>

              <!-- no-call notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:rgba(34,197,94,0.08);
                       border:1.5px solid rgba(34,197,94,0.28);
                       border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 22px;text-align:center;">
                    <p style="margin:0 0 6px;color:#22c55e;font-size:22px;">✓</p>
                    <p style="margin:0 0 6px;color:#22c55e;font-size:11px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      NO CONFIRMATION NEEDED
                    </p>
                    <p style="margin:0;color:rgba(255,255,255,0.55);font-size:13px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Your slot is registered. Just show up at the
                      <strong style="color:rgba(255,255,255,0.8);">${safe.location}</strong> branch
                      on <strong style="color:rgba(255,255,255,0.8);">${formatDate(data.date)}</strong>
                      at <strong style="color:rgba(255,255,255,0.8);">${safe.timeSlot}</strong>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:rgba(34,197,94,0.05);
                       border:1px solid rgba(34,197,94,0.18);
                       border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 22px 6px;">
                    <p style="margin:0;color:#22c55e;font-size:10px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      REGISTRATION DETAILS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="padding:6px 0;color:rgba(255,255,255,0.38);
                                               font-size:12px;font-family:Arial,sans-serif;">
                          Date
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${formatDate(data.date)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Time
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.timeSlot}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Branch
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.location}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Provider(s)
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${providerNames}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;">
                          Duration
                        </td>
                        <td style="padding:6px 0;color:#ffffff;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${fmtMins(data.totalDuration)}
                        </td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.38);
                                   font-size:12px;font-family:Arial,sans-serif;
                                   vertical-align:top;">
                          Notes
                        </td>
                        <td style="padding:6px 0;color:rgba(255,255,255,0.65);
                                   font-size:13px;font-family:Arial,sans-serif;">
                          ${escapeHtml(data.notes)}
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- services (prices only, no total) -->
              <p style="margin:0 0 8px;color:#22c55e;font-size:10px;font-weight:bold;
                          letter-spacing:3px;text-transform:uppercase;
                          font-family:Arial,sans-serif;">
                SERVICES
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:24px;">
                <thead>
                  <tr>
                    <th style="padding:6px 0;border-bottom:1px solid rgba(34,197,94,0.25);
                               color:#22c55e;font-size:10px;font-weight:bold;letter-spacing:2px;
                               text-align:left;font-family:Arial,sans-serif;">SERVICE</th>
                    <th style="padding:6px 0;border-bottom:1px solid rgba(34,197,94,0.25);
                               color:#22c55e;font-size:10px;font-weight:bold;letter-spacing:2px;
                               text-align:right;font-family:Arial,sans-serif;">PRICE</th>
                  </tr>
                </thead>
                <tbody>${serviceList}</tbody>
              </table>

              <!-- reminder -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:rgba(34,197,94,0.04);
                       border:1px solid rgba(34,197,94,0.15);
                       border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0 0 5px;color:#22c55e;font-size:10px;font-weight:bold;
                               letter-spacing:2px;font-family:Arial,sans-serif;">
                      REMINDER
                    </p>
                    <p style="margin:0;color:rgba(255,255,255,0.45);font-size:12px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Slots are
                      <strong style="color:rgba(255,255,255,0.65);">
                        first-come-first-served
                      </strong>.
                      Please arrive at least
                      <strong style="color:rgba(255,255,255,0.65);">5 minutes early</strong>.
                      Payment is collected at the salon.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="background-color:#010a03;padding:22px 40px;text-align:center;
                       border-top:1px solid rgba(34,197,94,0.12);">
              <p style="margin:0 0 4px;color:#22c55e;font-size:11px;font-weight:bold;
                         letter-spacing:3px;font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.25);font-size:11px;
                         font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.18);font-size:10px;
                         line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because you made a booking at SAYO Beauty.<br/>
                This is a transactional notification — no marketing content.
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
   SEND HELPER  (never throws)
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
        'X-Mailer':                       'SAYO-Beauty-Booking/1.0',
        'X-Priority':                     '3',
        'X-MS-Exchange-Organization-SCL': '-1',
        'Precedence':                     'transactional',
        'Auto-Submitted':                 'auto-generated',
        'Message-ID':                     `<booking-${bookingId}-${Date.now()}@sayo.beauty>`,
      },
    });
    console.log(`[EMAIL_SENT] → ${to} | ${subject}`);
  } catch (err) {
    console.error('[EMAIL_ERROR]', err);
  }
}

/* ─────────────────────────────────────────
   POST  — create booking
───────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name, email, phone, gender,
      location, mode, services, categories,
      totalDuration, totalPrice, providers,
      date, timeSlot, notes,
    } = body;

    /* ── validate ── */
    if (!name || !email || !phone || !location || !date || !timeSlot) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields.' },
        { status: 400 }
      );
    }

    /* ── upsert user ── */
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
          Gender:       gender || 'Not specified',
        },
      });
    } else {
      user = await prisma.tbl_UserDetails.update({
        where: { UserId: user.UserId },
        data: {
          UserName:    name.trim(),
          PhoneNumber: phone.trim(),
          Gender:      gender || user.Gender,
        },
      });
    }

    /* ── duplicate check ── */
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

    /* ── status ── */
    const dbStatus = mode === 'walkin' ? 'without confirmed' : 'pending';

    /* ── create booking ── */
    const booking = await prisma.tbl_Bookings.create({
      data: {
        UserId:        user.UserId,
        BookingMode:   mode === 'walkin' ? 'without confirmation' : 'confirmed',
        Gender:        gender,
        Location:      location,
        Services:      JSON.stringify(services),
        Categories:    Array.isArray(categories)
                         ? categories.join(',')
                         : categories,
        TotalDuration: totalDuration,
        TotalPrice:    totalPrice,
        Providers:     JSON.stringify(providers),
        BookingDate:   date,
        TimeSlot:      timeSlot,
        SpecialNotes:  notes || null,
        Status:        dbStatus,
      },
    });

    /* ── email (fire-and-forget) ── */
    const emailPayload = {
      name,
      email:         email.trim().toLowerCase(),
      phone:         phone.trim(),
      bookingId:     booking.BookingId,
      location,
      services:      Array.isArray(services)  ? services  : [],
      providers:     Array.isArray(providers) ? providers : [],
      date,
      timeSlot,
      totalDuration: Number(totalDuration) || 0,
      notes:         notes || null,
    };

    const plainText = buildPlainText({ ...emailPayload, mode });

    if (mode === 'walkin') {
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

    return NextResponse.json({
      success:   true,
      bookingId: booking.BookingId,
      userId:    user.UserId,
      message:   mode === 'walkin'
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
   GET  — fetch bookings by email
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