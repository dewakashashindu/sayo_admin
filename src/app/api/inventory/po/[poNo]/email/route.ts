// src/app/api/inventory/po/[poNo]/email/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/inventory/po/:poNo/email
//
//   body: { locCode, copy: 'standard'|'supplier', to?, subject?, message? }
//
// “Email to Supplier” on the Purchase Order screen: the order is drawn as a PDF
// (the same sheet the Print button makes — see src/lib/poPdf.ts) and mailed to
// the supplier the order is addressed to, using the SMTP_ settings from .env
// that the rest of this project already mails with.
//
// WHAT IT REFUSES, AND WHY
//   · an order that was never saved          → 400, “save it first”
//   · a supplier with no usable address      → 400, with what is on the row
//   · an empty order                         → 400
//   · an unconfigured mail server            → 503, naming the empty .env keys
// Nothing is written to the database: emailing a purchase order is not an event
// in the order's life the way Confirmation is. The activity log records it.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { logActivity } from "@/lib/activityLog";
import { invActor, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";
import { loadCompanyLetterhead, letterheadAddress, letterheadName } from "@/lib/companyLetterhead";
import {
  poPrintClock,
  poPrintCopyLabel,
  poPrintDate,
  poPrintRows,
  poPrintTotal,
  type PoPrintCopy,
} from "@/lib/poPrint";
import {
  invalidSupplierEmailParts,
  poEmailBody,
  poEmailSubject,
  poPdfFileName,
  primarySupplierEmail,
  smtpConfigured,
  smtpMissingEnv,
  smtpSetupMessage,
} from "@/lib/poEmail";
import { buildPoPdf } from "@/lib/poPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ poNo: string }> };

const trim = (v: unknown) => String(v ?? "").trim();

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/po/[poNo]/email";
  try {
    const actor = await invActor(req);
    const { poNo: poNoRaw } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const locCode = invId(body.locCode, "Location", 10);
    const poNo = invId(poNoRaw, "PO number", 10);
    const copy: PoPrintCopy = trim(body.copy) === "supplier" ? "supplier" : "standard";

    /* ── the order, as the sheet needs it ────────────────────────────────── */
    const headRows = await prisma.$queryRaw<
      {
        PONO: string; SupID: string; PODate: Date | null; DueDate: Date | null;
        DeliAdd: string | null; Remarks: string | null; NetTotal: number | null;
      }[]
    >`
      SELECT RTRIM(h.PONO) AS PONO, RTRIM(h.SupID) AS SupID, h.PODate, h.DueDate,
             h.DeliAdd, h.Remarks, h.NetTotal
      FROM tbl_poheader h
      WHERE ${keySql("h.LocCode")} = ${keyVal(locCode)} AND ${keySql("h.PONO")} = ${keyVal(poNo)}
    `;
    if (headRows.length === 0) {
      throw new InvError(
        `Purchase order ${poNo} was not found at this location. Save the order first, then email it.`,
        404,
      );
    }
    const head = headRows[0];
    const supID = trim(head.SupID);

    /* the lines, with the unit NAME joined in (the sheet shows names) */
    const lineRows = await prisma.$queryRaw<
      {
        ItemCode: string; ItemDes: string | null; ItemPrintDes: string | null;
        UnitID: string; UnitName: string | null; CostPrice: number | null; POQty: number | null;
      }[]
    >`
      SELECT RTRIM(d.ItemCode) AS ItemCode, i.ItemDes AS ItemDes, i.ItemPrintDes AS ItemPrintDes,
             RTRIM(d.UnitID) AS UnitID, u.UnitDes AS UnitName,
             d.CostPrice AS CostPrice, d.POQty AS POQty
      FROM tbl_podetails d
      LEFT JOIN tbl_itemmaster i
        ON ${keySql("i.LocCode")} = ${keySql("d.LocCode")} AND ${keySql("i.ItemCode")} = ${keySql("d.ItemCode")}
      LEFT JOIN tbl_unitmaster u ON ${keySql("u.MasterUnitID")} = ${keySql("d.UnitID")}
      WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.PONo")} = ${keyVal(poNo)}
      ORDER BY d.LineNo
    `;
    if (lineRows.length === 0) {
      throw new InvError(`Purchase order ${poNo} has no item lines, so there is nothing to email.`, 400);
    }

    /* ── the supplier, and the address to send to ────────────────────────── */
    const supRows = await prisma.$queryRaw<
      { SupName: string | null; Emails: string | null; ContAdd1: string | null; ContactNO: string | null }[]
    >`
      SELECT s.SupName, s.Emails, s.SuppAdd1 AS ContAdd1, s.ContactNO
      FROM tbl_suppliermaster s
      WHERE ${keySql("s.SupID")} = ${keyVal(supID)}
    `;
    const supplier = supRows[0];
    const supplierName = trim(supplier?.SupName) || supID;

    /* the screen may send the address it showed (it is editable there); when it
       does not, the supplier's own row decides */
    const typedTo = trim(body.to);
    const to = typedTo || primarySupplierEmail(supplier?.Emails);
    if (!to) {
      const onTheRow = trim(supplier?.Emails);
      throw new InvError(
        `Supplier ${supplierName} (${supID}) has no e-mail address on its record` +
          (onTheRow ? ` — the row holds “${onTheRow}”, which is not an address.` : ".") +
          " Put an address on the supplier in the Suppliers screen, or type one over the “To” box.",
        400,
      );
    }
    const rejectedParts = invalidSupplierEmailParts(trim(body.to) ? "" : supplier?.Emails);

    /* ── the letterhead and the branch ───────────────────────────────────── */
    const locationRows = await prisma.$queryRaw<
      { LocDes: string | null; Address: string | null }[]
    >`
      SELECT l.LocDes, l.Address
      FROM tbl_locationmaster l
      WHERE ${keySql("l.LocCode")} = ${keyVal(locCode)}
    `;
    const location = locationRows[0];
    const company = await loadCompanyLetterhead(prisma);
    const companyName = letterheadName(company, trim(location?.LocDes));
    const companyAddress = letterheadAddress(company, trim(location?.Address));

    /* ── the sheet ───────────────────────────────────────────────────────── */
    const lines = lineRows.map((l) => ({
      itemCode: trim(l.ItemCode),
      name: trim(l.ItemPrintDes) || trim(l.ItemDes) || trim(l.ItemCode),
      unitID: trim(l.UnitID),
      unitName: trim(l.UnitName),
      costPrice: Number(l.CostPrice ?? 0),
      poQty: Number(l.POQty ?? 0),
    }));
    const rows = poPrintRows(lines);
    const total = poPrintTotal(lines);
    const now = new Date();
    const clock = poPrintClock(now);

    const pdf = await buildPoPdf({
      copy,
      copyLabel: poPrintCopyLabel(copy),
      companyName,
      companyAddress,
      companyPhone: company.phone,
      branch: trim(location?.LocDes),
      supplierCode: supID,
      supplierName,
      supplierAddress: trim(head.DeliAdd) || trim(supplier?.ContAdd1) || trim(supplier?.ContactNO),
      poNo,
      poDate: poPrintDate(head.PODate),
      dueDate: poPrintDate(head.DueDate),
      printDate: clock.date,
      printTime: clock.time,
      user: actor.name || actor.userId,
      rows,
      total,
      deliAdd: trim(head.DeliAdd),
      remarks: trim(head.Remarks),
    });

    /* ── the mail server ─────────────────────────────────────────────────── */
    const missing = smtpMissingEnv(process.env);
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, message: smtpSetupMessage(missing), missingEnv: missing },
        { status: 503 },
      );
    }

    const fileName = poPdfFileName(poNo);
    const subject = trim(body.subject) || poEmailSubject({ poNo, companyName });
    const text =
      trim(body.message) ||
      poEmailBody({
        poNo,
        companyName,
        supplierName,
        poDate: poPrintDate(head.PODate),
        dueDate: poPrintDate(head.DueDate),
        lineCount: rows.length,
        copy,
      });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });

    await logActivity(
      actor.name,
      "inventory",
      `Purchase order ${poNo} emailed to ${supplierName} <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`,
    );

    return NextResponse.json({
      success: true,
      data: { poNo, locCode, to, copy, fileName, bytes: pdf.length, lines: rows.length, total },
      message:
        `Purchase order ${poNo} emailed to ${supplierName} <${to}> — ` +
        `${poPrintCopyLabel(copy)} attached as ${fileName}.`,
      /* addresses that were on the supplier row but are not addresses, so the
         screen can mention them instead of silently dropping them */
      ignored: rejectedParts,
    });
  } catch (err) {
    return invFail(err, tag);
  }
}

/* Prisma is imported for the Sql types the other inventory routes use. */
void Prisma;
