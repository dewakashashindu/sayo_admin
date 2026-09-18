// src/app/api/inventory/grn/[grnNo]/confirm/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/inventory/grn/:grnNo/confirm        body: { locCode }
//
// The Confirmation button on the legacy GRN screen. This is the ONLY place
// where a receipt touches stock, and it does everything in ONE transaction:
//
//   for every line
//     1. lock the item-master row            (SELECT … FOR UPDATE)
//     2. lock the purchase-order line if the GRN is PO-backed
//        · refuse the whole receipt when it would go past what the PO has open
//     3. tally the line onto the PO line      (GRNQty, GRNNOs)
//     4. add the goods to tbl_itemmaster.StockBalance — GRNQty + FreeQty —
//        and write the ledger row into tbl_stocktxn
//     5. push RetailPrice into the item master ONLY when the line asked for it
//   then the header is stamped Confirmed / ConUserID / ConDatetime
//
// WHY ONE TRANSACTION: a GRN that half-happened is worse than a failed one.
// If any line fails, nothing is written and the user gets the line that failed
// with the reason (the billing screen learned this the hard way).
//
// SERVICES: a line whose item is tbl_itemmaster.ServiceItem = 1 is recorded on
// the document but does not touch stock — a haircut has no balance.
//
// RE-CONFIRMING IS REFUSED (409) — the header is locked first, so two people
// pressing the button together cannot move the stock twice.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { invActor, invChar, invFail, invId, InvError,
  confirmGrnHeader,
  keySql,
  keyVal,
}from "@/lib/inventoryServer";
import { overReceiptQty, round2, safeQty } from "@/lib/inventoryTotals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ grnNo: string }> };
const trim = (v: unknown) => String(v ?? "").trim();

interface LineRow {
  LineNo: number;
  ItemCode: string;
  ItemName: string | null;
  GRNQty: number;
  FreeQty: number;
  CostPrice: number;
  RetailPrice: number;
  PONO: string;
  UpdItemPrice: number | boolean | null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const tag = "POST /api/inventory/grn/[grnNo]/confirm";
  try {
    const actor = await invActor(req);
    const { grnNo: grnNoRaw } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const locCode = invId(body.locCode, "Location", 10);
    const grnNo = invId(grnNoRaw, "GRN number", 15);

    const result = await prisma.$transaction(async (tx) => {
      /* ── 1. the document ───────────────────────────────────────────────── */
      const head = await tx.$queryRaw<
        { GRNNO: string; GRNTYPE: string; Confirmed: string; PONO: string; NetTotal: number }[]
      >`
        SELECT RTRIM(GRNNO) AS GRNNO, UPPER(GRNTYPE) AS GRNTYPE,
               UPPER(Confirmed) AS Confirmed, RTRIM(PONO) AS PONO, NetTotal
        FROM tbl_grnheader
        WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("GRNNO")} = ${keyVal(grnNo)}
        FOR UPDATE
      `;
      if (head.length === 0) {
        throw new InvError(`GRN ${grnNo} was not found at this location.`, 404);
      }
      if (trim(head[0].Confirmed) === "Y") {
        throw new InvError(
          `GRN ${grnNo} is already confirmed — its stock has moved, so it cannot be confirmed again.`,
          409,
        );
      }
      const grnType = trim(head[0].GRNTYPE) || (trim(head[0].PONO) ? "GR" : "DG");
      const headerPoNo = trim(head[0].PONO);

      /* ── 2. the lines ──────────────────────────────────────────────────── */
      const lines = await tx.$queryRaw<LineRow[]>`
        SELECT d.LineNo, RTRIM(d.ItemCode) AS ItemCode,
               COALESCE(i.ItemPrintDes, i.ItemDes) AS ItemName,
               d.GRNQty, d.FreeQty, d.CostPrice, d.RetailPrice,
               RTRIM(d.PONO) AS PONO, d.UpdItemPrice
        FROM tbl_grndetails d
        LEFT JOIN tbl_itemmaster i
          ON ${keySql("i.LocCode")} = ${keySql("d.LocCode")} AND ${keySql("i.ItemCode")} = ${keySql("d.ItemCode")}
        WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.GRNNo")} = ${keyVal(grnNo)}
        ORDER BY d.LineNo ASC
      `;
      if (lines.length === 0) {
        throw new InvError(`GRN ${grnNo} has no item lines, so there is nothing to confirm.`);
      }

      const now = new Date();
      const applied: {
        itemCode: string;
        itemName: string;
        received: number;
        free: number;
        newBalance: number | null;
        retailUpdated: boolean;
        poLine: string;
      }[] = [];

      for (const line of lines) {
        const code = trim(line.ItemCode);
        const itemName = trim(line.ItemName) || code;
        const received = safeQty(line.GRNQty);
        const free = safeQty(line.FreeQty);

        /* the item-master row, locked, read from the DATABASE */
        const item = await tx.$queryRaw<
          { StockBalance: number | null; ServiceItem: number | null }[]
        >`
          SELECT i.StockBalance, COALESCE(CAST(i.ServiceItem AS UNSIGNED), 0) AS ServiceItem
          FROM tbl_itemmaster i
          WHERE ${keySql("i.LocCode")} = ${keyVal(locCode)} AND ${keySql("i.ItemCode")} = ${keyVal(code)}
          FOR UPDATE
        `;
        if (item.length === 0) {
          throw new InvError(
            `“${itemName}” (${code}) is not in the item master for this location any more, so GRN ${grnNo} cannot be confirmed. Remove the line or restore the item.`,
            409,
          );
        }
        const isService = Number(item[0].ServiceItem) === 1;

        /* the purchase-order line behind this receipt, locked */
        let poLine = "";
        if (headerPoNo) {
          const poRows = await tx.$queryRaw<
            { POQty: number; GRNQty: number; GRNNOs: string | null }[]
          >`
            SELECT d.POQty, d.GRNQty, d.GRNNOs
            FROM tbl_podetails d
            WHERE ${keySql("d.LocCode")} = ${keyVal(locCode)} AND ${keySql("d.PONo")} = ${keyVal(headerPoNo)}
              AND ${keySql("d.ItemCode")} = ${keyVal(code)}
            FOR UPDATE
          `;
          if (poRows.length === 0) {
            throw new InvError(
              `“${itemName}” is not a line of purchase order ${headerPoNo}, so GRN ${grnNo} cannot be confirmed.`,
              409,
            );
          }
          const poRow = poRows[0];
          const over = overReceiptQty(poRow.POQty, poRow.GRNQty, received);
          if (over > 0) {
            throw new InvError(
              `Receiving ${received} of “${itemName}” goes ${over} past what ${headerPoNo} still has open — reduce the quantity and confirm again.`,
              409,
            );
          }

          const already = trim(poRow.GRNNOs);
          const list = already ? already.split(",").map((s) => s.trim()).filter(Boolean) : [];
          if (!list.includes(grnNo)) list.push(grnNo);
          const joined = list.join(", ").slice(0, 500);

          await tx.$executeRaw`
            UPDATE tbl_podetails
            SET GRNQty = GRNQty + ${received}, GRNNOs = ${joined}
            WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("PONo")} = ${keyVal(headerPoNo)}
              AND ${keySql("ItemCode")} = ${keyVal(code)}
          `;
          poLine = headerPoNo;
        }

        /* stock — only for real stock items */
        let newBalance: number | null = null;
        if (!isService) {
          const stock = safeQty(item[0].StockBalance);
          const qtyIn = round2(received + free);
          newBalance = round2(stock + qtyIn);

          await tx.$executeRaw`
            UPDATE tbl_itemmaster
            SET StockBalance = ${newBalance}
            WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("ItemCode")} = ${keyVal(code)}
          `;

          await tx.$executeRaw`
            INSERT INTO tbl_stocktxn
              (LocCode, ItemCode, TxnType, RefNo, TxnDate, QtyIn, QtyOut, Balance,
               CostPrice, UserID, Remarks)
            VALUES
              (${invChar(locCode, 10)}, ${invChar(code, 15)}, ${grnType.slice(0, 10)},
               ${grnNo.slice(0, 20)}, ${now}, ${qtyIn}, 0, ${newBalance},
               ${Number(line.CostPrice) || 0}, ${invChar(actor.userId, 10)},
               ${`Received${free > 0 ? ` (incl. ${free} free)` : ""} on ${grnNo}${poLine ? ` against ${poLine}` : ""}`.slice(0, 200)})
          `;
        }

        /* the item-master retail price — ONLY when the line asked for it */
        let retailUpdated = false;
        if (line.UpdItemPrice === true || Number(line.UpdItemPrice || 0) === 1) {
          const retail = Number(line.RetailPrice) || 0;
          if (retail > 0) {
            await tx.$executeRaw`
              UPDATE tbl_itemmaster
              SET Retailprice = ${retail}
              WHERE ${keySql("LocCode")} = ${keyVal(locCode)} AND ${keySql("ItemCode")} = ${keyVal(code)}
            `;
            retailUpdated = true;
          }
        }

        applied.push({
          itemCode: code,
          itemName,
          received,
          free,
          newBalance,
          retailUpdated,
          poLine,
        });
      }

      /* ── 3. stamp the header ───────────────────────────────────────────── */
      await confirmGrnHeader(tx, locCode, grnNo, actor.userId);

      return {
        applied,
        grnType,
        poNo: headerPoNo,
        netTotal: Number(head[0].NetTotal || 0),
      };
    }, { timeout: 30000 });

    const services = result.applied.filter((l) => l.newBalance === null).length;
    await logActivity(
      actor.name,
      "inventory",
      `GRN ${grnNo} confirmed at ${locCode} — ${result.applied.length} line(s), net ${result.netTotal.toFixed(2)}${result.poNo ? `, PO ${result.poNo} updated` : ", direct receipt"}${services ? `, ${services} service line(s) not stocked` : ""}`,
    );

    return NextResponse.json({
      success: true,
      data: {
        grnNo,
        locCode,
        poNo: result.poNo,
        grnType: result.grnType,
        lines: result.applied,
      },
      message:
        `GRN ${grnNo} confirmed — stock updated` +
        (result.poNo ? ` and ${result.poNo} written back.` : "."),
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
