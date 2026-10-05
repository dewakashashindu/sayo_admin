// src/app/api/auth/register/route.ts
// POST { name, phone, email?, password, gender }
//
// 2026-10-01: the account is identified by its PHONE number.
//   • before: the e-mail was required and was the only key — the duplicate
//     check, the session token and the whole forgot-password chain hung off
//     CusEmail, so a customer without an e-mail could not register at all.
//   • now:   the phone number is required and unique; the e-mail is optional
//     and, when given, still has to be free. The phone is stored in one
//     readable shape and matched on its DIGITS (src/lib/customerIdentity.ts),
//     because a customer can type the same number three different ways.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createCustomerToken, customerCookieOptions, CUSTOMER_COOKIE } from '@/lib/customerSession';
import { prisma } from '@/lib/prisma';
import { sendRegistrationSMS } from '@/lib/sms';
import { GENDER_OPTIONS, normalizeGender } from '@/lib/genderOptions';
import {
  findCustomerByPhone,
  isUsablePhone,
  localPhoneDigits,
  phoneForLog,
  usableCustomerEmail,
} from '@/lib/customerIdentity';
import { nextSerialTx, SERIAL_CODES } from '@/lib/serials';
import { rateMessage } from "@/lib/rateLimit";
import { rateLimitStrong } from "@/lib/rateLimitDb";
import { passwordProblem, PASSWORD_HINT } from "@/lib/passwordPolicy";
import { clientIp, ipForLog } from "@/lib/clientIp";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The number comes from the CUS series in Tbl_Serials (src/lib/serials.ts)
// rather than from the highest existing code in tbl_CustomerMaster.
async function generateCusCode(): Promise<string> {
  return nextSerialTx(prisma, SERIAL_CODES.customer);
}

const REGISTER_IP_LIMIT = 5;             // per hour
const REGISTER_PHONE_LIMIT = 2;          // per day, for one phone number
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_PHONE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One readable shape for a Sri Lankan mobile, otherwise what was typed. */
function phoneForStorage(phone: string): string {
  const local = localPhoneDigits(phone);
  return local.length === 9 ? `0${local}` : phone.trim().slice(0, 15);
}

export async function POST(req: NextRequest) {
  try {
    const callerIp = clientIp(req);
    const byIp = await rateLimitStrong({
      bucket: "register:ip",
      key: callerIp,
      limit: REGISTER_IP_LIMIT,
      windowMs: REGISTER_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[register] rate limited ip=${ipForLog(callerIp)}`);
      return NextResponse.json(
        { success: false, error: rateMessage("register", byIp.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
    }

    const rawPhone = String((body as Record<string, unknown>).phone ?? "").replace(/\D/g, "").slice(-9);
    if (rawPhone.length >= 9) {
      /* the per-phone limit is the one a caller cannot walk around by changing
         address — it lives in MySQL so a restart cannot clear it */
      const byPhone = await rateLimitStrong({
        bucket: "register:phone",
        key: rawPhone,
        limit: REGISTER_PHONE_LIMIT,
        windowMs: REGISTER_PHONE_WINDOW_MS,
      });
      if (!byPhone.ok) {
        console.warn(`[register] rate limited phone=${phoneForLog(rawPhone)}`);
        return NextResponse.json(
          { success: false, error: rateMessage("register", byPhone.retryAfterSec) },
          { status: 429, headers: { "Retry-After": String(byPhone.retryAfterSec) } },
        );
      }
    }

    const { name, email, phone, password, gender } = body as {
      name?: string; email?: string; phone?: string;
      password?: string; gender?: string;
    };

    if (!name?.trim())
      return NextResponse.json({ success: false, message: 'Full name is required.' }, { status: 400 });
    if (!isUsablePhone(phone))
      return NextResponse.json({ success: false, message: 'A valid phone number is required.' }, { status: 400 });

    const emailTrimmed = (email ?? '').trim();
    if (emailTrimmed && !EMAIL_SHAPE.test(emailTrimmed))
      return NextResponse.json({ success: false, message: 'Enter a valid email address.' }, { status: 400 });

    if (!password) {
      return NextResponse.json({ success: false, message: 'Password is required.' }, { status: 400 });
    }
    {
      /* one password rule for the whole app (min 8, letter + number) */
      const problem = passwordProblem(password, "customer");
      if (problem) {
        return NextResponse.json({ success: false, message: problem, hint: PASSWORD_HINT }, { status: 400 });
      }
    }

    const genderValue = normalizeGender(gender);
    if (!genderValue) {
      return NextResponse.json(
        {
          success: false,
          message: `Please choose one of: ${GENDER_OPTIONS.map((g) => g.label).join(', ')}.`,
        },
        { status: 400 },
      );
    }

    const emailLower = usableCustomerEmail(emailTrimmed);

    try {
      /* the phone IS the account now — one person, one number */
      const byPhone = await findCustomerByPhone(phone);
      if (byPhone) {
        return NextResponse.json(
          { success: false, message: 'An account with this phone number already exists.' },
          { status: 409 },
        );
      }

      /* an address, when supplied, still may not be shared */
      if (emailLower) {
        const byEmail = await prisma.tbl_CustomerMaster.findFirst({
          where: { CusEmail: emailLower },
          select: { CusCode: true },
        });
        if (byEmail) {
          return NextResponse.json(
            { success: false, message: 'An account with this email already exists.' },
            { status: 409 },
          );
        }
      }
    } catch (err) {
      console.error('[register] duplicate-check error:', errMsg(err));
      return NextResponse.json({ success: false, message: 'Registration failed.' }, { status: 500 });
    }

    const hashedPSW = await bcrypt.hash(password, 12);
    const phoneStored = phoneForStorage(String(phone));

    try {
      const cusCode = await generateCusCode();

      const created = await prisma.tbl_CustomerMaster.create({
        data: {
          CusCode:   cusCode,
          CusName:   name.trim().substring(0, 200),
          /* the column is NOT NULL with a blank-space default */
          CusEmail:  emailLower || ' ',
          RegTel:    phoneStored,
          PSW:       hashedPSW,
          Gender:    genderValue,
          CreatedBy: 'SYSTEM',
        },
        select: { CusCode: true },
      });

      try {
        await sendRegistrationSMS({
          name:  name.trim(),
          email: emailLower,
          phone: phoneStored,
        });
      } catch (smsErr) {
        console.error('[register] SMS trigger failed:', smsErr);
      }

      const token = await createCustomerToken({
        uid:    created.CusCode.trim(),
        log:    phoneStored,
        name:   name.trim(),
        phone:  phoneStored,
        gender: genderValue,
      });

      const res = NextResponse.json(
        { success: true, message: 'User registered successfully', userId: created.CusCode },
        { status: 201 },
      );
      if (token) {
        res.cookies.set(CUSTOMER_COOKIE, token, customerCookieOptions());
      }
      return res;

    } catch (err) {
      console.error('[register] create error:', errMsg(err));
      return NextResponse.json(
        { success: false, message: 'Registration failed due to server error.' },
        { status: 500 },
      );
    }

  } catch (err) {
    console.error('[register POST] unexpected error:', err);
    return NextResponse.json({ success: false, message: 'Unexpected server error.' }, { status: 500 });
  }
}
