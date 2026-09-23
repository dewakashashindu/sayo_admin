import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { sendSms, smsConfigured, smsMissingEnv, smsSetupMessage } from "@/lib/sms";
import {
  defaultNotifyMessage,
  isMobileForSms,
  notifyContacts,
  smsPartCount,
  type StaffRow,
} from "@/lib/grnNotify";
import {
  invActor,
  invFail,
  invId,
  InvError,
  keySql,
  keyVal,
} from "@/lib/inventoryServer";
import { invTrim } from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();
const tag = "inventory/grn/notify";

interface GrnHeadRow {
  GRNNO: string;
  LocCode: string;
  GRNDate: Date | string | null;
  SupID: string;
  SupName: string | null;
  PONO: string | null;
  NetTotal: number | null;
  Confirmed: string | null;
}

/** The receipt, or a clear reason why there is nothing to announce. */
async function loadGrn(grnNo: string, locCodeRaw: string) {
  const locCode = invId(locCodeRaw, "Location", 10);
  const head = await prisma.$queryRaw<GrnHeadRow[]>`
    SELECT RTRIM(h.GRNNO) AS GRNNO, RTRIM(h.LocCode) AS LocCode, h.GRNDate,
           RTRIM(h.SupID) AS SupID, RTRIM(s.SupName) AS SupName,
           RTRIM(h.PONO) AS PONO, h.NetTotal, UPPER(h.Confirmed) AS Confirmed
    FROM tbl_grnheader h
    LEFT JOIN tbl_suppliermaster s
      ON ${keySql("s.SupID")} = ${keySql("h.SupID")}
    WHERE ${keySql("h.LocCode")} = ${keyVal(locCode)} AND ${keySql("h.GRNNO")} = ${keyVal(grnNo)}
    LIMIT 1
  `;
  if (head.length === 0) {
    throw new InvError(`GRN ${grnNo} was not found at this location.`, 404);
  }

  const [location] = await prisma.$queryRaw<{ LocDes: string | null }[]>`
    SELECT RTRIM(LocDes) AS LocDes FROM tbl_locationmaster
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} LIMIT 1
  `;
  const [countRow] = await prisma.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM tbl_grndetails
    WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("GRNNo")} = ${keyVal(grnNo)}
  `;

  const h = head[0];
  return {
    locCode,
    row: h,
    grnNo: trim(h.GRNNO),
    locationName: trim(location?.LocDes) || locCode,
    supplierName: trim(h.SupName) || trim(h.SupID),
    poNo: trim(h.PONO),
    netTotal: Number(h.NetTotal || 0),
    lineCount: Number(countRow?.n ?? 0),
    confirmed: trim(h.Confirmed) === "Y",
  };
}

/** Everyone who could be texted, admins first. */
async function contacts() {
  const [staff, groups] = await Promise.all([
    prisma.$queryRaw<StaffRow[]>`
      SELECT RTRIM(UserId) AS UserId, RTRIM(UserName) AS UserName, RTRIM(LogName) AS LogName,
             RTRIM(ContNo) AS ContNo, RTRIM(GroupId) AS GroupId, Enable
      FROM tbl_userdetails
    `.catch(() => [] as StaffRow[]),
    prisma.$queryRaw<{ GroupId: string; GroupDes: string | null }[]>`
      SELECT RTRIM(GroupId) AS GroupId, RTRIM(GroupDes) AS GroupDes FROM tbl_usergroups
    `.catch(() => [] as { GroupId: string; GroupDes: string | null }[]),
  ]);
  return notifyContacts(staff, groups);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ grnNo: string }> }) {
  try {
    await invActor(req); // signed-in admins only
    const { grnNo: rawNo } = await ctx.params;
    const grnNo = invId(rawNo, "GRN number", 15);
    const locCode = trim(new URL(req.url).searchParams.get("locCode"));

    const grn = await loadGrn(grnNo, locCode);
    const actor = await invActor(req);
    const people = await contacts();
    const missingEnv = smsMissingEnv();

    return NextResponse.json({
      success: true,
      data: {
        grnNo: grn.grnNo,
        locCode: grn.locCode,
        confirmed: grn.confirmed,
        contacts: people,
        configured: smsConfigured(),
        missingEnv,
        setupMessage: smsSetupMessage(missingEnv),
        message: defaultNotifyMessage({
          grnNo: grn.grnNo,
          locCode: grn.locCode,
          locationName: grn.locationName,
          supplierName: grn.supplierName,
          poNo: grn.poNo,
          netTotal: grn.netTotal,
          lineCount: grn.lineCount,
          actorName: actor.name,
        }),
      },
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ grnNo: string }> }) {
  try {
    const actor = await invActor(req);
    const { grnNo: rawNo } = await ctx.params;
    const grnNo = invId(rawNo, "GRN number", 15);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const grn = await loadGrn(grnNo, trim(body.locCode));
    if (grn.confirmed) {
      throw new InvError(
        `GRN ${grn.grnNo} is already confirmed — there is nothing left to do on it.`,
        409,
      );
    }

    /* who it goes to: a chosen member of staff, or a number typed by hand */
    const userId = trim(body.userId);
    const typedTo = trim(body.to);
    let phone = typedTo;
    let recipientName = "";
    if (userId) {
      const [person] = await prisma.$queryRaw<{ UserName: string | null; ContNo: string | null }[]>`
        SELECT RTRIM(UserName) AS UserName, RTRIM(ContNo) AS ContNo
        FROM tbl_userdetails WHERE ${keySql("UserId")} = ${keyVal(userId)} LIMIT 1
      `;
      if (!person) throw new InvError(`There is no staff member “${userId}” to message.`, 404);
      phone = trim(person.ContNo);
      recipientName = trim(person.UserName);
    }
    if (!phone) {
      throw new InvError("Choose the person to message, or type a mobile number.", 400);
    }
    if (!isMobileForSms(phone)) {
      throw new InvError(
        `“${phone}” is not a Sri Lankan mobile number, so the SMS was not sent. Use 07XXXXXXXX.`,
        400,
      );
    }

    const message =
      trim(body.message) ||
      defaultNotifyMessage({
        grnNo: grn.grnNo,
        locCode: grn.locCode,
        locationName: grn.locationName,
        supplierName: grn.supplierName,
        poNo: grn.poNo,
        netTotal: grn.netTotal,
        lineCount: grn.lineCount,
        actorName: actor.name,
      });

    const missingEnv = smsMissingEnv();
    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: smsSetupMessage(missingEnv),
          missingEnv,
        },
        { status: 503 },
      );
    }

    const result = await sendSms(phone, message);
    if (!result.success) {
      throw new InvError(`Text.lk would not send the message: ${result.error}`, 502);
    }

    const masked = phone.replace(/\D/g, "").replace(/^(94)?(\d{3})\d+(\d{3})$/, "$2***$3");
    await logActivity(
      actor.name,
      "inventory",
      `GRN ${grn.grnNo} saved at ${grn.locCode} — asked ${recipientName || "an admin"} (${masked}) by SMS to confirm it`,
    );

    return NextResponse.json({
      success: true,
      data: {
        grnNo: grn.grnNo,
        locCode: grn.locCode,
        to: phone,
        recipientName,
        masked,
        parts: smsPartCount(message),
        message,
      },
      message: recipientName
        ? `SMS sent to ${recipientName} — they can confirm ${grn.grnNo} from the GRN screen.`
        : `SMS sent — they can confirm ${grn.grnNo} from the GRN screen.`,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
