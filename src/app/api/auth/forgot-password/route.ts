// src/app/api/auth/forgot-password/route.ts
// POST { username } — step 1 of the STAFF (tbl_userdetails) reset.
//
// 2026-09-29 fixes:
//   • the middleware never let this route (or its screen) be reached at all —
//     see PUBLIC_API / PUBLIC_PAGES in src/middleware.ts. It works now.
//   • the caller's address comes from clientIp() (measured on the socket), not
//     from an x-forwarded-for header the caller can type.
//   • the answer is identical whether or not the login name exists (no account
//     probing), and the masked phone number is no longer handed out.
//   • the code goes to the phone number AND the e-mail saved for the user, and
//     is stored bcrypt-hashed in Tbl_PswReset (10 minutes, 5 tries).
//   • the super administrator is never reset through this screen.
//   • counters live in MySQL (rateLimitStrong) so a restart cannot wipe them.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneSriLanka, sendOtpSms } from "@/lib/sms";
import { isSuperAdminUserId } from "@/lib/superAdmin";
import { decryptContact } from "@/lib/secureContact";
import { rateLimitStrong } from "@/lib/rateLimitDb";
import { rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";
import { ensureAuthTables } from "@/lib/authTables";
import { sendMail, codeMailHtml, mailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const WINDOW_MS = 10 * 60 * 1000;
const IP_LIMIT = 5;         // codes requested per caller
const USER_LIMIT = 3;       // codes requested for one login name

/* The one sentence every outcome returns — no user enumeration. */
const GENERIC =
  "If that login name is registered, a reset code has been sent to its saved phone number and e-mail.";

export async function POST(req: NextRequest) {
  try {
    const caller = clientIp(req);

    const byIp = await rateLimitStrong({
      bucket: "staff-reset:ip",
      key: caller,
      limit: IP_LIMIT,
      windowMs: WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[forgot-password] ip rate limited ip=${ipForLog(caller)}`);
      return NextResponse.json(
        { success: false, error: rateMessage("otp_send", byIp.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { username?: unknown };
    const username = String(body.username ?? "").trim().slice(0, 400);
    if (!username) {
      return NextResponse.json({ success: false, error: "Type your login name first." }, { status: 400 });
    }

    const byUser = await rateLimitStrong({
      bucket: "staff-reset:user",
      key: username.toLowerCase(),
      limit: USER_LIMIT,
      windowMs: WINDOW_MS,
    });
    if (!byUser.ok) {
      console.warn(`[forgot-password] login-name rate limited user=${username.toLowerCase()}`);
      return NextResponse.json(
        { success: false, error: rateMessage("otp_send", byUser.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byUser.retryAfterSec) } },
      );
    }

    const rows = await prisma.$queryRaw<{
      UserId: string; ContNo: string | null; Email: string | null; Enable: number | boolean;
    }[]>`
      SELECT RTRIM(UserId) AS UserId, RTRIM(ContNo) AS ContNo, RTRIM(Email) AS Email, Enable
      FROM tbl_userdetails WHERE LogName = ${username} LIMIT 1
    `;
    const user = rows[0];

    /* unknown login name, disabled account or the hidden super administrator →
       exactly the same answer as a successful send. */
    if (!user || Number(user.Enable) !== 1 || isSuperAdminUserId(user.UserId)) {
      return NextResponse.json({ success: true, message: GENERIC });
    }

    /* ContNo / Email are ciphertext for the super admin; for everybody else
       decryptContact() hands the stored value straight back. */
    const phone = normalizePhoneSriLanka(decryptContact(user.ContNo));
    const email = decryptContact(user.Email);
    const mailable = email.includes("@") && mailConfigured();

    if (!phone && !mailable) {
      console.warn(
        `[forgot-password] ${String(user.UserId).trim()} has no usable contact details — a person has to reset it`,
      );
      return NextResponse.json({ success: true, message: GENERIC });
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await ensureAuthTables();
    const hash = await bcrypt.hash(otp, 8);
    const userId = String(user.UserId).trim().slice(0, 10);

    await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${userId}`;
    await prisma.$executeRaw`
      INSERT INTO Tbl_PswReset (UserId, OtpHash, ExpiresAt, Attempts)
      VALUES (${userId}, ${hash}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), 0)
    `;

    let delivered = false;
    if (phone) {
      try {
        await sendOtpSms(phone, `Your SAYO Admin reset code is ${otp}. It expires in 10 minutes.`);
        delivered = true;
      } catch (err) {
        console.error("[forgot-password] SMS failed:", err instanceof Error ? err.message : err);
      }
    }
    if (mailable) {
      try {
        await sendMail({
          to: email,
          subject: "Your SAYO Admin password reset code",
          text: `Your SAYO Admin password reset code is ${otp}. It expires in 10 minutes.`,
          html: codeMailHtml(
            "SAYO Beauty — Admin",
            "Somebody asked to reset the password of this account. Your code is:",
            otp,
            "It expires in <strong>10 minutes</strong>. If this was not you, ignore this e-mail — nothing has changed.",
          ),
        });
        delivered = true;
      } catch (err) {
        console.error("[forgot-password] e-mail failed:", err instanceof Error ? err.message : err);
      }
    }

    if (!delivered) {
      /* nothing went out — do not leave a usable code behind */
      await prisma.$executeRaw`DELETE FROM Tbl_PswReset WHERE UserId = ${userId}`;
      console.error(
        "[forgot-password] the code could not be delivered (SMS + e-mail both failed or are not configured)",
      );
      return NextResponse.json({
        success: false,
        error:
          "The reset code could not be sent. Check TEXTLK_* and SMTP_* in .env, or ask your administrator.",
      }, { status: 503 });
    }

    return NextResponse.json({ success: true, message: GENERIC });
  } catch (e) {
    /* The detail goes to the log, NOT to the caller: a raw Prisma message
       contains the database host, port and table names. */
    console.error("[forgot-password]", e);
    return NextResponse.json(
      {
        success: false,
        error:
          "The reset code could not be sent right now. Please try again in a moment — if it keeps failing, ask your administrator to check the database connection.",
      },
      { status: 500 },
    );
  }
}
