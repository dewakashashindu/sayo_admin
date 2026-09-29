// src/app/api/auth/admin-login/resend-otp/route.ts
// POST { challenge } — sends a fresh code for a challenge that is still valid.
// The old code stops working the moment a new one is written.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateMessage, waitWords } from '@/lib/rateLimit';
import { rateLimitStrong } from '@/lib/rateLimitDb';
import { clientIp, ipForLog } from '@/lib/clientIp';
import { isSuperAdmin } from '@/lib/superAdmin';
import {
  createAndSendAdminOtp,
  otpDestinationsFromRow,
  otpSentMessage,
  verifyOtpChallenge,
} from '@/lib/adminOtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RESEND_IP_LIMIT = 10;      // per caller
const RESEND_ACCOUNT_LIMIT = 3;  // per account
const RESEND_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);
    const byIp = await rateLimitStrong({
      bucket: 'admin-otp-resend:ip',
      key: caller,
      limit: RESEND_IP_LIMIT,
      windowMs: RESEND_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[admin-otp-resend] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { error: `Too many codes requested. Try again in ${waitWords(byIp.retryAfterSec)}.` },
        { status: 429, headers: { 'Retry-After': String(byIp.retryAfterSec) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { challenge?: string };
    const account = await verifyOtpChallenge(String(body.challenge ?? '').trim());
    if (!account) {
      return NextResponse.json(
        { error: 'This sign-in took too long. Please start again.' },
        { status: 401 },
      );
    }

    const accountRule = {
      bucket: 'admin-otp-resend:account',
      key: account.log.toLowerCase(),
      limit: RESEND_ACCOUNT_LIMIT,
      windowMs: RESEND_WINDOW_MS,
    };
    const accountCheck = await rateLimitStrong(accountRule);
    if (!accountCheck.ok) {
      return NextResponse.json(
        { error: rateMessage('otp_send', accountCheck.retryAfterSec) },
        { status: 429, headers: { 'Retry-After': String(accountCheck.retryAfterSec) } },
      );
    }

    const rows = await prisma.$queryRaw<
      { UserId: string; GroupId: string; ContNo: string; Email: string; Enable: number }[]
    >`
      SELECT RTRIM(UserId) AS UserId, RTRIM(GroupId) AS GroupId,
             RTRIM(ContNo) AS ContNo, RTRIM(Email) AS Email, Enable
      FROM tbl_userdetails WHERE UserId = ${account.uid} LIMIT 1
    `;
    const row = rows[0];
    if (!row || Number(row.Enable) !== 1 || !isSuperAdmin({ userId: row.UserId, groupId: row.GroupId })) {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
    }

    const { phone, email } = otpDestinationsFromRow(row);
    const delivery = await createAndSendAdminOtp(row.UserId, phone, email);
    if (!delivery.smsSent && !delivery.emailSent) {
      return NextResponse.json(
        {
          error: `The code could not be sent. SMS: ${delivery.smsError ?? 'not configured'}. E-mail: ${delivery.emailError ?? 'not configured'}.`,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      otpRequired: true,
      message: otpSentMessage(delivery, delivery.phoneMasked, delivery.emailMasked),
      destinations: { phone: delivery.phoneMasked, email: delivery.emailMasked },
      channels: { sms: delivery.smsSent, email: delivery.emailSent },
    });
  } catch (err) {
    console.error('[admin-otp-resend] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}
