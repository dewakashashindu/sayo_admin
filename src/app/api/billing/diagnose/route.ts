import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { itemCode, legacyItemCode } from "@/lib/itemCode";
import { diagnosticsEnabled, diagnosticsDisabledResponse } from "@/lib/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();

/** Bumped whenever the billing read model changes, so the running build is identifiable. */
const MODEL_VERSION = "billing-readmodel-2026-09-16";

export async function GET(req: NextRequest) {
  if (!diagnosticsEnabled()) return diagnosticsDisabledResponse();

  try {
    const bookingID = trim(req.nextUrl.searchParams.get("bookingID"));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    const header = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        RTRIM(h.BookingID) AS BookingID,
        RTRIM(h.LocCode)   AS LocCode,
        RTRIM(h.CusCode)   AS CusCode,
        RTRIM(h.Status)    AS Status,
        h.BookingDate      AS BookingDate,
        h.Pax              AS Pax,
        h.BillingTime      AS BillingTime
      FROM tbl_bookingheder h
      WHERE RTRIM(h.BookingID) = ${bookingID}
      LIMIT 1
    `;

    const detailRows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        RTRIM(LocCode)       AS LocCode,
        RTRIM(BookingID)     AS BookingID,
        RTRIM(GuessID)       AS GuessID,
        RTRIM(ServiceItemID) AS ServiceItemID,
        Qty,
        ItemPrice,
        RTRIM(TechID)        AS TechID,
        ScheduleIndex,
        ScheduleStartMin,
        ScheduleEndMin
      FROM tbl_bookingservicedetail
      WHERE RTRIM(BookingID) = ${bookingID}
      ORDER BY RTRIM(GuessID), RTRIM(ServiceItemID)
    `;

    const serviceItemIDs = Array.from(
      new Set(detailRows.map((row) => trim(row.ServiceItemID))),
    ).filter(Boolean);

    // A stored code is the full CHAR(15) code on new rows and the legacy
    // 10-character prefix on older ones — look for both.
    const legacyServiceItemIDs = Array.from(
      new Set(serviceItemIDs.map((code) => legacyItemCode(code)).filter(Boolean)),
    );

    // How many item-master rows match each stored ServiceItemID: the full
    // CHAR(15) code, or the legacy 10-character prefix. > 1 means a join on the
    // item code returns each detail row once per matching item.
    const itemMatches = serviceItemIDs.length
      ? await prisma.$queryRaw<
          {
            LocCode: string;
            ItemCode: string;
            ItemDes: string | null;
            ItemPrintDes: string | null;
          }[]
        >`
          SELECT
            RTRIM(LocCode)      AS LocCode,
            RTRIM(ItemCode)     AS ItemCode,
            RTRIM(ItemDes)      AS ItemDes,
            RTRIM(ItemPrintDes) AS ItemPrintDes
          FROM tbl_itemmaster
          WHERE (
            RTRIM(ItemCode) IN (${Prisma.join(serviceItemIDs)})
            OR LEFT(RTRIM(ItemCode), 10) IN (${Prisma.join(
              legacyServiceItemIDs.length ? legacyServiceItemIDs : [""],
            )})
          )
          ORDER BY RTRIM(ItemCode)
        `
      : [];

    // Group the raw rows exactly the way the bill counts them.
    const grouped = new Map<
      string,
      { guessID: string; serviceItemID: string; qty: string; itemPrice: number; techID: string; copies: number }
    >();
    detailRows.forEach((row) => {
      const key = [
        trim(row.GuessID),
        trim(row.ServiceItemID),
        trim(row.Qty),
        String(row.ItemPrice ?? 0),
        trim(row.TechID),
      ].join("|");
      const current = grouped.get(key);
      if (current) {
        current.copies += 1;
        return;
      }
      grouped.set(key, {
        guessID: trim(row.GuessID),
        serviceItemID: trim(row.ServiceItemID),
        qty: trim(row.Qty),
        itemPrice: Number(row.ItemPrice ?? 0) || 0,
        techID: trim(row.TechID),
        copies: 1,
      });
    });

    const groups = Array.from(grouped.values());
    const guests = Array.from(new Set(detailRows.map((r) => trim(r.GuessID))));

    return NextResponse.json({
      success: true,
      modelVersion: MODEL_VERSION,
      bookingID,
      header: header[0] ?? null,
      summary: {
        detailRowCount: detailRows.length,
        distinctGuests: guests,
        distinctServiceItems: serviceItemIDs,
        /** Rows that are exact copies of another row (same guest + service + qty). */
        copiedRows: groups.filter((g) => g.copies > 1),
      },
      groups,
      detailRows,
      itemMatches: {
        serviceItemIDs,
        matches: itemMatches,
        collisionCount: serviceItemIDs.map((code) => {
          const stored = itemCode(code).toUpperCase();
          const exact = itemMatches.filter(
            (i) => itemCode(i.ItemCode).toUpperCase() === stored,
          ).length;
          const byPrefix = itemMatches.filter(
            (i) => legacyItemCode(i.ItemCode).toUpperCase() === stored,
          ).length;
          return {
            serviceItemID: code,
            storedLength: stored.length,
            itemMasterMatches: exact || byPrefix,
          };
        }),
      },
      hint:
        "detailRowCount is the real count of service rows. If copiedRows is empty and " +
        "distinctGuests has many entries, the booking genuinely holds that many guests. " +
        "If collisionCount shows > 1 item-master matches, an item-master join (NOT used by " +
        "the current bill API) would multiply each row. storedLength 15 means the row holds " +
        "the full CHAR(15) item code; a smaller value is a legacy row — run " +
        "scripts/migrate-itemcode-char15.sql to widen the detail columns and backfill it.",
    });
  } catch (err) {
    console.error("[billing-diagnose] GET failed:", err);
    return NextResponse.json(
      { success: false, message: "Diagnostic query failed" },
      { status: 500 },
    );
  }
}
