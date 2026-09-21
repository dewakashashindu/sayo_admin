// GET /api/inventory/transfer/requisition/:trNo?fromLoc=&toLoc=  — load one requisition with lines (actual DB)
// For the form to show actual data (dn form wala pennana)
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { invFail, invId, keySql, keyVal } from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ trNo: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { trNo: raw } = await ctx.params;
    const trNo = invId(raw, "TR No", 50);
    const sp = req.nextUrl.searchParams;
    const fromLocQ = String(sp.get("fromLoc") ?? "").trim();
    const toLocQ = String(sp.get("toLoc") ?? "").trim();

    // Find header — if from/to not given, find any
    const headerWhere: string[] = [];
    // Use raw SQL with keySql
    const headers = await prisma.$queryRaw<{ FromLocCode: string; ToLoc: string; TRNO: string; TRDate: Date; TRDueDate: Date; NetTotal: number; UserID: string; Remarks: string; Confirmed: string; TxnDate: Date; SysSerialNo: number }[]>`
      SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(TRNO) AS TRNO, TRDate, TRDueDate, NetTotal, RTRIM(UserID) AS UserID, Remarks, UPPER(Confirmed) AS Confirmed, TxnDate, SysSerialNo
      FROM tbl_transferreqheder
      WHERE ${keySql("TRNO")}=${keyVal(trNo)}
      ${fromLocQ ? Prisma.sql`AND ${keySql("FromLocCode")}=${keyVal(fromLocQ)}` : Prisma.empty}
      ${toLocQ ? Prisma.sql`AND ${keySql("ToLoc")}=${keyVal(toLocQ)}` : Prisma.empty}
      LIMIT 1
    ` as any;

    // fallback if no header with that filter, try without from/to
    let head = headers[0];
    if (!head) {
      const fallback = await prisma.$queryRaw<{ FromLocCode: string; ToLoc: string; TRNO: string; TRDate: Date; TRDueDate: Date; NetTotal: number; UserID: string; Remarks: string; Confirmed: string }[]>`
        SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(TRNO) AS TRNO, TRDate, TRDueDate, NetTotal, RTRIM(UserID) AS UserID, Remarks, UPPER(Confirmed) AS Confirmed
        FROM tbl_transferreqheder WHERE ${keySql("TRNO")}=${keyVal(trNo)} LIMIT 1
      `;
      head = fallback[0] as any;
    }
    if (!head) return NextResponse.json({ success:false, message:`Requisition ${trNo} not found` }, {status:404});

    const lines = await prisma.$queryRaw<{ ItemCode: string; ItemDes: string|null; UnitID: string; UnitDes: string|null; CostPrice: number; TRQty: number; ItemValue: number; TransferConfNo: string; IssuedQTY: number }[]>`
      SELECT
        RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql("um.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.TRQty AS TRQty, d.ItemValue AS ItemValue, RTRIM(d.TransferConfNo) AS TransferConfNo, d.IssuedQTY AS IssuedQTY
      FROM tbl_transferreqdetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(String(head.FromLocCode).trim())} AND ${keySql("d.ToLoc")}=${keyVal(String(head.ToLoc).trim())} AND ${keySql("d.TRNo")}=${keyVal(trNo)}
      ORDER BY d.ItemCode
    `;

    return NextResponse.json({
      success: true,
      data: {
        header: {
          trNo: String(head.TRNO).trim(),
          fromLocCode: String(head.FromLocCode).trim(),
          toLoc: String(head.ToLoc).trim(),
          trDate: head.TRDate,
          trDueDate: head.TRDueDate,
          netTotal: Number(head.NetTotal||0),
          userId: String(head.UserID||"").trim(),
          remarks: String(head.Remarks||"").trim(),
          confirmed: String(head.Confirmed||"N").trim()==='Y',
        },
        lines: lines.map(l=>({
          itemCode: String(l.ItemCode).trim(),
          itemName: String(l.ItemDes||l.ItemCode).trim(),
          unitID: String(l.UnitID||"").trim(),
          unitDes: String(l.UnitDes||l.UnitID||"").trim(),
          costPrice: Number(l.CostPrice||0),
          trQty: Number(l.TRQty||0),
          itemValue: Number(l.ItemValue||0),
          transferConfNo: String(l.TransferConfNo||"").trim(),
          issuedQty: Number(l.IssuedQTY||0),
        }))
      }
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/transfer/requisition/[trNo]");
  }
}
