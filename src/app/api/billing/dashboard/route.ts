import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { timeLabelFromValue } from "@/lib/legacyTime";
import { dedupeBookingDetailRows } from "@/lib/bookingReadModel";
import {
  createItemCodeIndex,
  legacyItemCode,
  type ItemCodeIndex,
} from "@/lib/itemCode";
import { describeDbTarget } from "@/lib/dbHealth";
import { locationScopeForRequest } from "@/lib/locationScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();

interface HeaderRow {
  BookingID: string;
  LocCode: string;
  CusCode: string;
  BookingDate: string | null;
  Remarks: string | null;
  Status: string;
  ConfirmationType: string;
  TxnDateTime: string | null;
  BillingTime: string | null;
  Pax: number | null;
  CusName: string | null;
  RegTel: string | null;
}

interface BillHeaderRow {
  LocCode: string;
  BillNo: string;
  CusID: string;
  TxnTime: string | null;
  NetTotal: number | null;
}

interface DetailRow {
  BookingID: string;
  LocCode: string;
  GuessID: string;
  ServiceItemID: string;
  Qty: string | number | null;
  ItemPrice: number | null;
  TechID: string | null;
}

interface ItemNameRow {
  LocCode: string;
  ItemCode: string;
  ItemDes: string | null;
  ItemPrintDes: string | null;
}

/** 'YYYY-MM-DD' out of a DATE_FORMAT'ed datetime / ISO string. */
function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = new Date(value as never);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** '1:30 PM' out of a datetime value — read as stored (src/lib/legacyTime.ts). */
function timeLabel(value: unknown): string | null {
  return timeLabelFromValue(value);
}

/** Legacy rows carry the time as a `Time:9:00 AM` prefix in Remarks. */
function timeFromRemarks(remarks: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Time:([\d:]+\s*[AaPp][Mm])/i);
  return match ? match[1].trim() : null;
}

function modeFromConfirmationType(raw: string): "walkin" | "pre_booked" {
  const value = trim(raw).toLowerCase();
  if (["wo", "wi", "walkin", "walk-in", "without_confirmation"].includes(value)) {
    return "walkin";
  }
  return "pre_booked";
}

function isBilledAt(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const time = new Date(value as never).getTime();
  if (Number.isNaN(time)) return false;
  return time > Date.parse("1900-01-02T00:00:00Z");
}

async function loadDoneHeaders(billed: boolean): Promise<HeaderRow[]> {
  const billedFilter = billed
    ? Prisma.sql`h.BillingTime IS NOT NULL AND h.BillingTime > '1900-01-01 00:00:00'`
    : Prisma.sql`(h.BillingTime IS NULL OR h.BillingTime <= '1900-01-01 00:00:00')`;
  const orderBy = billed
    ? Prisma.sql`h.BillingTime DESC`
    : Prisma.sql`h.TxnDateTime DESC`;
  return prisma.$queryRaw<HeaderRow[]>`
    SELECT
      RTRIM(h.BookingID)        AS BookingID,
      RTRIM(h.LocCode)          AS LocCode,
      RTRIM(h.CusCode)          AS CusCode,
      DATE_FORMAT(h.BookingDate, '%Y-%m-%d %H:%i:%s') AS BookingDate,
      h.Remarks                 AS Remarks,
      RTRIM(h.Status)           AS Status,
      RTRIM(h.ConfirmationType) AS ConfirmationType,
      DATE_FORMAT(h.TxnDateTime, '%Y-%m-%d %H:%i:%s') AS TxnDateTime,
      DATE_FORMAT(h.BillingTime, '%Y-%m-%d %H:%i:%s') AS BillingTime,
      h.Pax                     AS Pax,
      RTRIM(c.CusName)          AS CusName,
      RTRIM(c.RegTel)           AS RegTel
    FROM tbl_bookingheder h
    LEFT JOIN tbl_customermaster c
      ON RTRIM(c.CusCode) = RTRIM(h.CusCode)
    WHERE UPPER(RTRIM(h.Status)) = 'DONE'
      AND ${billedFilter}
    ORDER BY ${orderBy}
    LIMIT 200
  `;
}

export async function GET(req: NextRequest) {
  try {
    /* branch scope — the billing dashboard lists the branches this person was
       given (their own + the ones ticked on their access profile). */
    const resolvedScope = await locationScopeForRequest(req);
    if (!resolvedScope.ok) return resolvedScope.response;
    const scope = resolvedScope.scope;
    const mayUse = (code: unknown) =>
      scope.unlimited ||
      [...scope.allowed].some((c) => c.toUpperCase() === String(code ?? "").trim().toUpperCase());

    const [pendingHeaders, completedHeaders] = await Promise.all([
      loadDoneHeaders(false),
      loadDoneHeaders(true),
    ]);
    const pendingScoped = pendingHeaders.filter((r) => mayUse(r.LocCode));
    const completedScoped = completedHeaders.filter((r) => mayUse(r.LocCode));
    const headers = [...pendingScoped, ...completedScoped];

    if (headers.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        pending: [],
        completed: [],
      });
    }

    const bookingIDs = [...new Set(headers.map((r) => trim(r.BookingID)))].filter(Boolean);
    const locCodes = [...new Set(headers.map((r) => trim(r.LocCode)))].filter(Boolean);

    /* Detail rows are read WITHOUT joining the item master: a join on the item
       code returns one row per matching item and inflates every total. */
    const rawDetails = await prisma.$queryRaw<DetailRow[]>`
      SELECT
        RTRIM(d.BookingID)     AS BookingID,
        RTRIM(d.LocCode)       AS LocCode,
        RTRIM(d.GuessID)       AS GuessID,
        RTRIM(d.ServiceItemID) AS ServiceItemID,
        d.Qty                  AS Qty,
        d.ItemPrice            AS ItemPrice,
        RTRIM(d.TechID)        AS TechID
      FROM tbl_bookingservicedetail d
      WHERE RTRIM(d.BookingID) IN (${Prisma.join(bookingIDs)})
        AND RTRIM(d.LocCode)   IN (${Prisma.join(locCodes)})
      ORDER BY d.ScheduleIndex, RTRIM(d.GuessID)
    `;

    // One row per (guest, service) — the real key of the detail table.
    const detailRows = dedupeBookingDetailRows(rawDetails);

    const itemCodes = Array.from(
      new Set(detailRows.map((row) => trim(row.ServiceItemID)).filter(Boolean)),
    );
    const techIDs = Array.from(
      new Set(
        detailRows
          .map((row) => trim(row.TechID))
          .filter((id) => id && id !== "0"),
      ),
    );

    // Stored codes are the full CHAR(15) code on new rows and the legacy
    // 10-character prefix on older ones — the lookup accepts both.
    const legacyItemCodes = Array.from(
      new Set(itemCodes.map((code) => legacyItemCode(code)).filter(Boolean)),
    );

    const itemRows = itemCodes.length
      ? await prisma.$queryRaw<ItemNameRow[]>`
          SELECT
            RTRIM(LocCode)       AS LocCode,
            RTRIM(ItemCode)      AS ItemCode,
            RTRIM(ItemDes)       AS ItemDes,
            RTRIM(ItemPrintDes)  AS ItemPrintDes
          FROM tbl_itemmaster
          WHERE RTRIM(LocCode) IN (${Prisma.join(locCodes)})
            AND (
              RTRIM(ItemCode) IN (${Prisma.join(itemCodes)})
              OR LEFT(RTRIM(ItemCode), 10) IN (${Prisma.join(legacyItemCodes.length ? legacyItemCodes : [""])})
            )
          ORDER BY RTRIM(ItemCode)
        `
      : [];
    const techRows = techIDs.length
      ? await prisma.$queryRaw<{ UserId: string; UserName: string | null }[]>`
          SELECT RTRIM(UserId) AS UserId, RTRIM(UserName) AS UserName
          FROM tbl_userdetails
          WHERE RTRIM(UserId) IN (${Prisma.join(techIDs)})
        `
      : [];

    // Stored item code → printed name, per location. The full code wins; a
    // legacy 10-character code resolves through its prefix only while that
    // prefix belongs to exactly one item, so two items sharing a prefix can
    // never swap names on the dashboard.
    const namesByLoc = new Map<string, { code: string; name: string }[]>();
    itemRows.forEach((row) => {
      const loc = trim(row.LocCode).toUpperCase();
      const code = trim(row.ItemCode);
      const name = trim(row.ItemPrintDes) || trim(row.ItemDes);
      if (!loc || !code || !name) return;
      const list = namesByLoc.get(loc) ?? [];
      list.push({ code, name });
      namesByLoc.set(loc, list);
    });
    const itemNameIndexByLoc = new Map<
      string,
      ItemCodeIndex<{ code: string; name: string }>
    >();
    namesByLoc.forEach((list, loc) =>
      itemNameIndexByLoc.set(loc, createItemCodeIndex(list, (entry) => entry.code)),
    );
    const itemNameFor = (loc: string, storedCode: unknown) =>
      itemNameIndexByLoc.get(loc.toUpperCase())?.get(storedCode)?.name;
    const userNameById = new Map<string, string>();
    techRows.forEach((row) => {
      const id = trim(row.UserId).toUpperCase();
      const name = trim(row.UserName);
      if (id && name && !userNameById.has(id)) userNameById.set(id, name);
    });

    // Aggregate per booking in JS so the totals cannot be multiplied by a join.
    const aggByKey = new Map<
      string,
      { total: number; services: string[]; techs: string[] }
    >();
    detailRows.forEach((row) => {
      const loc = trim(row.LocCode);
      const booking = trim(row.BookingID);
      const key = `${loc}|${booking}`;
      const agg = aggByKey.get(key) || { total: 0, services: [], techs: [] };
      const qtyRaw = Number(trim(row.Qty));
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
      agg.total += qty * (Number(row.ItemPrice ?? 0) || 0);
      const name =
        itemNameFor(loc, row.ServiceItemID) || trim(row.ServiceItemID);
      if (name && !agg.services.includes(name)) agg.services.push(name);
      const techID = trim(row.TechID).toUpperCase();
      if (techID && techID !== "0") {
        const techName = userNameById.get(techID) || trim(row.TechID);
        if (techName && !agg.techs.includes(techName)) agg.techs.push(techName);
      }
      aggByKey.set(key, agg);
    });

    const completedLocs = [...new Set(completedScoped.map((r) => trim(r.LocCode)).filter(Boolean))];
    const completedCus = [...new Set(completedScoped.map((r) => trim(r.CusCode)).filter(Boolean))];
    let billRows: BillHeaderRow[] = [];
    if (completedLocs.length && completedCus.length) {
      try {
        billRows = await prisma.$queryRaw<BillHeaderRow[]>`
          SELECT
            RTRIM(LocCode) AS LocCode,
            RTRIM(BillNo)  AS BillNo,
            RTRIM(CusID)   AS CusID,
            DATE_FORMAT(TxnTime, '%Y-%m-%d %H:%i:%s') AS TxnTime,
            NetTotal       AS NetTotal
          FROM tbl_billheader
          WHERE RTRIM(LocCode) IN (${Prisma.join(completedLocs)})
            AND RTRIM(CusID)   IN (${Prisma.join(completedCus)})
          ORDER BY TxnTime DESC
          LIMIT 800
        `;
      } catch {
        billRows = [];
      }
    }

    const matchBill = (loc: string, cus: string, billedAt: string | null) => {
      if (!billedAt) return { billNo: "", netTotal: null as number | null };
      const billedMs = new Date(billedAt.replace(" ", "T")).getTime();
      if (Number.isNaN(billedMs)) return { billNo: "", netTotal: null as number | null };
      let best: { billNo: string; netTotal: number; diff: number } | null = null;
      for (const row of billRows) {
        if (trim(row.LocCode).toUpperCase() !== loc.toUpperCase()) continue;
        if (trim(row.CusID).toUpperCase() !== cus.toUpperCase()) continue;
        const txnMs = new Date(String(row.TxnTime ?? "").replace(" ", "T")).getTime();
        if (Number.isNaN(txnMs)) continue;
        const diff = Math.abs(txnMs - billedMs);
        if (diff > 20 * 60 * 1000) continue;
        if (!best || diff < best.diff) {
          best = {
            billNo: trim(row.BillNo),
            netTotal: Number(row.NetTotal ?? 0) || 0,
            diff,
          };
        }
      }
      return best
        ? { billNo: best.billNo, netTotal: best.netTotal }
        : { billNo: "", netTotal: null as number | null };
    };

    const mapRow = (header: HeaderRow) => {
      const bookingID = trim(header.BookingID);
      const locCode = trim(header.LocCode);
      const cusCode = trim(header.CusCode);
      const agg = aggByKey.get(`${locCode}|${bookingID}`);
      const bookingDate = trim(header.BookingDate) || null;
      const remarks = header.Remarks ?? "";
      const date = dateOnly(bookingDate) || dateOnly(header.TxnDateTime) || "";
      const timeSlot =
        (timeLabel(bookingDate) && timeLabel(bookingDate) !== "12:00 AM"
          ? timeLabel(bookingDate)
          : null) ||
        timeFromRemarks(remarks) ||
        timeLabel(bookingDate) ||
        "—";
      const billed = isBilledAt(header.BillingTime);
      const billedAt = billed ? trim(header.BillingTime) : "";
      const bill = billed ? matchBill(locCode, cusCode, billedAt || null) : { billNo: "", netTotal: null };

      return {
        bookingID,
        locCode,
        cusCode,
        clientName: trim(header.CusName) || "Unknown",
        clientPhone: trim(header.RegTel),
        date,
        timeSlot,
        status: "done",
        mode: modeFromConfirmationType(header.ConfirmationType),
        pax: Number(header.Pax ?? 0) || 0,
        services: agg?.services ?? [],
        techNames: agg?.techs ?? [],
        total: bill.netTotal != null ? bill.netTotal : Number(agg?.total ?? 0) || 0,
        billed,
        billedAt,
        billNo: bill.billNo,
      };
    };

    const pending = pendingScoped.map(mapRow);
    const completed = completedScoped.map(mapRow);

    return NextResponse.json({
      success: true,
      data: pending,
      pending,
      completed,
    });
  } catch (err) {
    console.error("[billing-dashboard] GET failed:", err);
    /* A database that cannot be reached is not a broken page: say so, with the
       host that was tried and what to do, so the screen can explain it. */
    const code = (err as { code?: string })?.code ?? "";
    const unreachable =
      code === "P1001" || code === "P1008" || code === "P1017" || code === "P2024";
    if (unreachable) {
      const target = describeDbTarget();
      return NextResponse.json(
        {
          success: false,
          code,
          message:
            "The database is unreachable, so the done bookings cannot be listed.",
          host: target.host,
          database: target.database,
          hint: "Open /api/health for the details, then check the database host in DATABASE_URL against your hosting panel.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Failed to load the billing dashboard" },
      { status: 500 },
    );
  }
}
