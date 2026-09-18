import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createCustomerToken, customerCookieOptions, CUSTOMER_COOKIE } from '@/lib/customerSession';
import { prisma } from '@/lib/prisma';
import { sendRegistrationSMS } from '@/lib/sms';
import { GENDER_OPTIONS } from '@/lib/genderOptions';
import { nextSerialTx, SERIAL_CODES } from '@/lib/serials';
import { rateLimit, rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type GenderValue = typeof GENDER_OPTIONS[number]['value'];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Generate next CusCode (CUS0000001 format) ──────────────────────────────
// The number comes from the CUS series in Tbl_Serials (src/lib/serials.ts)
// rather than from the highest existing code in tbl_CustomerMaster.
async function generateCusCode(): Promise<string> {
  return nextSerialTx(prisma, SERIAL_CODES.customer);
}

// ───────────────────────────────────────────────────────────────────────────

/* ── how often one caller may sign up ────────────────────────────────────── *
 * A new account sends a welcome SMS, so this endpoint is counted too: per
 * caller and per phone number. */
const REGISTER_IP_LIMIT = 5;             // per hour
const REGISTER_PHONE_LIMIT = 2;          // per day, for one phone number
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_PHONE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const callerIp = clientIp(req);
    const byIp = rateLimit({
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
      const byPhone = rateLimit({
        bucket: "register:phone",
        key: rawPhone,
        limit: REGISTER_PHONE_LIMIT,
        windowMs: REGISTER_PHONE_WINDOW_MS,
      });
      if (!byPhone.ok) {
        console.warn(`[register] rate limited phone=***${rawPhone.slice(-4)}`);
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
    if (!email?.trim())
      return NextResponse.json({ success: false, message: 'Email address is required.' }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ success: false, message: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailLower = email.trim().toLowerCase();

    // ── Duplicate check (Select CusCode only to avoid unnecessary column queries) ─
    try {
      const exists = await prisma.tbl_CustomerMaster.findFirst({
        where: { CusEmail: emailLower },
        select: { CusCode: true },
      });
      if (exists) {
        return NextResponse.json(
          { success: false, message: 'An account with this email already exists.' },
          { status: 409 },
        );
      }
    } catch (err) {
      console.error('[register] duplicate-check error:', errMsg(err));
      return NextResponse.json({ success: false, message: 'Registration failed.' }, { status: 500 });
    }

    // ── Hash password ──────────────────────────────────────────────────────
    const hashedPSW = await bcrypt.hash(password, 12);

    // ── Save to Tbl_CustomerMaster ─────────────────────────────────────────
    try {
      const cusCode = await generateCusCode();

      const created = await prisma.tbl_CustomerMaster.create({
        data: {
          CusCode:   cusCode,
          CusName:   name.trim().substring(0, 200),
          CusEmail:  emailLower.substring(0, 200),
          RegTel:    (phone?.trim() ?? ' ').substring(0, 15) || ' ',
          PSW:       hashedPSW,
          Gender:    gender?.trim() ?? null,
          CreatedBy: 'SYSTEM',
        },
        select: { CusCode: true },
      });

      // ── SMS ───────────────────────────────────────────────────────────────
      if (phone?.trim()) {
        try {
          await sendRegistrationSMS({
            name:  name.trim(),
            email: emailLower,
            phone: phone.trim(),
          });
        } catch (smsErr) {
          console.error('[register] SMS trigger failed:', smsErr);
        }
      }

      const token = await createCustomerToken({
        uid:    created.CusCode.trim(),
        log:    emailLower,
        name:   name.trim(),
        phone:  phone?.trim() || '',
        gender: gender?.trim() || '',
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