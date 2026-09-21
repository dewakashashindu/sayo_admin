// src/app/api/inventory/transfer/requisition/route.ts
// GET  /api/inventory/transfer/requisition?status=confirmed|pending|all&q=&fromLoc=&toLoc=&limit=300
// POST /api/inventory/transfer/requisition  body: {fromLocCode,toLoc,trDate,trDueDate,remarks,lines:[{itemCode,unitID,costPrice,trQty}], confirm?:boolean}
// Mirrors VB6 Tbl_TransferReqHeder/Detail save — see image-1.png: GetSerialNo(GetTxnNo "TRQ") → Insert heder → loop detail
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
import {
  findLocation,
  invActor,
  invChar,
  invDateField,
  invFail,
  invId,
  invPrice,
  invQty,
  InvError,
  resolveItems,
  keySql,
  keyVal,
} from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();

interface RawLine { itemCode?: unknown; unitID?: unknown; costPrice?: unknown; trQty?: unknown; }

/* ── GET — list ──────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = trim(sp.get("status")).toLowerCase(); // confirmed|pending|all
    const q = trim(sp.get("q"));
    const fromLoc = trim(sp.get("fromLoc"));
    const toLoc = trim(sp.get("toLoc"));
    const limit = Math.min(Math.max(Number(sp.get("limit") || 300) || 300, 1), 500);

    const where: Prisma.Sql[] = [];
    if (fromLoc) where.push(Prisma.sql`AND ${keySql("h.FromLocCode")} = ${keyVal(fromLoc)}`);
    if (toLoc) where.push(Prisma.sql`AND ${keySql("h.ToLoc")} = ${keyVal(toLoc)}`);
    if (status === "confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if (status === "pending") where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if (q) where.push(Prisma.sql`AND (RTRIM(h.TRNO) LIKE ${`%${q}%`} OR RTRIM(h.FromLocCode) LIKE ${`%${q}%`} OR RTRIM(h.ToLoc) LIKE ${`%${q}%`})`);

    const filters = (): Prisma.Sql => (where.length ? Prisma.join(where, " ") : Prisma.empty);

    // Use raw SQL so it works even when Prisma client is stale; also handles padded CHAR via keySql
    // Try Vw_TransferReqDetail if view exists, else fall back to heder table
    let rows: any[] = [];
    try {
      rows = await prisma.$queryRaw<{ TRNO: string; FromLocCode: string; FromLocDes: string|null; ToLoc: string; ToLocDes: string|null; TRDate: Date; TRDueDate: Date; NetTotal: number; Confirmed: string; UserID: string; UserName: string|null }[]>`
        SELECT
          RTRIM(h.TRNO) AS TRNO,
          RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          h.TRDate AS TRDate,
          h.TRDueDate AS TRDueDate,
          h.NetTotal AS NetTotal,
          UPPER(h.Confirmed) AS Confirmed,
          RTRIM(h.UserID) AS UserID,
          (SELECT UserName FROM tbl_userdetails u WHERE ${keySql("u.UserId")}=${keySql("h.UserID")} LIMIT 1) AS UserName
        FROM tbl_transferreqheder h
        WHERE 1=1 ${filters()}
        ORDER BY h.TRDate DESC, h.TRNO DESC
        LIMIT ${limit}
      `;
    } catch (e) {
      // table not created yet
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        trNo: trim(r.TRNO),
        fromLocCode: trim(r.FromLocCode),
        fromLocDes: trim(r.FromLocDes),
        toLoc: trim(r.ToLoc),
        toLocDes: trim(r.ToLocDes),
        trDate: r.TRDate,
        trDueDate: r.TRDueDate,
        netTotal: Number(r.NetTotal || 0),
        confirmed: trim(r.Confirmed)==='Y',
        userId: trim(r.UserID),
        userName: trim(r.UserName) || trim(r.UserID),
      })),
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/transfer/requisition");
  }
}

/* ── POST — create (Save Confirmation Details) ────────────────────────── */
export async function POST(req: NextRequest) {
  const tag = "POST /api/inventory/transfer/requisition";
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as Record<string, unknown>;

    const fromRaw = invId(body.fromLocCode, "From Location", 10);
    const toRaw   = invId(body.toLoc, "To Location", 10);
    if (fromRaw === toRaw) throw new InvError("From and To locations must be different.");
    const trDate  = invDateField(body.trDate ?? body.TRDate ?? new Date().toISOString().slice(0,10), "TR Date");
    const trDueDate = invDateField(body.trDueDate ?? body.TRDueDate ?? trDate, "TR Due Date");
    const remarks = trim(body.remarks).slice(0, 500);
    const confirmNow = body.confirm === true || trim(body.confirm)==='1' || trim(body.confirm)==='Y';

    const rawLines = Array.isArray(body.lines) ? (body.lines as RawLine[]) : [];
    if (rawLines.length===0) throw new InvError("Add at least one item line before saving.");

    const result = await prisma.$transaction(async (tx) => {
      // resolve locations as DB holds
      const fromLoc = await findLocation(tx, fromRaw);
      if (!fromLoc) throw new InvError(`Unknown From location “${fromRaw}”.`, 400);
      const toLoc = await findLocation(tx, toRaw);
      if (!toLoc) throw new InvError(`Unknown To location “${toRaw}”.`, 400);

      // resolve items against From location (like VB: Tbl_RowItems where LocCode=From)
      const items = await resolveItems(tx, fromLoc, rawLines.map(l=> itemCode(l.itemCode)));
      const missing = rawLines.map(l=> invId(l.itemCode, "Item code", 50)).filter(c=> !items.has(itemCode(c)));
      if (missing.length) throw new InvError(`These item codes are not in the item master for ${fromLoc}: ${missing.join(", ")}.`, 400);

      // build lines with values (VB: CostPrice from Columns("CostPrice"), TR QTY from Columns("TR QTY"), ItemValue = Cost*TRQty)
      const lines = rawLines.map((line, idx)=>{
        const code = itemCode(line.itemCode);
        const it = items.get(code)!;
        const qty = invQty(line.trQty, `TR QTY of ${it.des}`);
        const cost = trim(line.costPrice)==="" ? it.costPrice : invPrice(line.costPrice, `Cost price of ${it.des}`);
        return {
          lineNo: idx+1,
          itemCode: it.code,
          unitID: invId(line.unitID || it.unitID || "", `Unit of ${it.des}`, 10),
          costPrice: cost,
          trQty: qty,
          itemValue: Number(cost) * Number(qty),
        };
      });

      const netTotal = lines.reduce((s,l)=> s + l.itemValue, 0);
      const now = new Date();

      // ── VB: dblSysSerNo = GetSerialNo(Trim(cmbLoc.BoundText)) / strTxnNo = GetTxnNo(Trim(cmbLoc.BoundText), "TRQ")
      // We generate TC number via SERIAL_CODES.transferReq (alias TRQ). SysSerialNo = numeric part.
      let trNo = "";
      try {
        // 6-digit TC like TC000006 in screenshot
        trNo = await nextSerialTx(tx as any, SERIAL_CODES.transferReq, { width: 6 });
        // nextSerialTx returns "TC000006" already — keep as is, but ensure fits CHAR(10) padded
        // If it returned just number, prefix manually
        if (!trNo.toUpperCase().startsWith("TC")) trNo = `TC${trNo.slice(-6)}`;
        trNo = trNo.trim().toUpperCase().slice(0,10);
      } catch (e:any) {
        // Fallback to max+1 if serial table missing
        const maxRows = await tx.$queryRaw<{ m: string|null }[]>`SELECT MAX(RTRIM(TRNO)) AS m FROM tbl_transferreqheder WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)}`;
        const max = trim(maxRows[0]?.m) || "TC000000";
        const n = (Number(max.replace(/\D/g,""))||0)+1;
        trNo = `TC${String(n).padStart(6,"0")}`;
      }
      const sysSerNo = Number(trNo.replace(/\D/g,"")) || 0;

      // ── VB: Insert Into Tbl_TransferReqHeder (FromLocCode,ToLoc,TRNO,TRDate,TRDueDate,NetTotal,UserID,Remarks,TxnDate,SysSerialNo,ConUserID,Confirmed,ConDatetime,TakenForTransfer) values(...)
      // Note: VB uses set dateformat dmy but we pass JS Date; MySQL accepts.
      const confirmedFlag = confirmNow ? "Y" : "N";
      const conUser = confirmNow ? actor.userId : "";
      const conTime = confirmNow ? now : new Date("1900-01-01");

      await tx.$executeRaw`
        INSERT INTO tbl_transferreqheder
          (FromLocCode, ToLoc, TRNO, TRDate, TRDueDate, NetTotal, UserID, Remarks, TxnDate, SysSerialNo, ConUserID, Confirmed, ConDatetime, TakenForTransfer)
        VALUES
          (${invChar(fromLoc,10)}, ${invChar(toLoc,10)}, ${invChar(trNo,10)}, ${trDate}, ${trDueDate}, ${netTotal},
           ${invChar(actor.userId,10)}, ${remarks}, ${now}, ${sysSerNo},
           ${invChar(conUser,10)}, ${confirmedFlag}, ${conTime}, ${'N'})
      `;

      // ── VB: Loop grdItemList → Insert Into Tbl_TransferReqDetail (FromLocCode,ToLoc,TRNo,ItemCode,UnitID,CostPrice,TRQty,ItemValue,TransferConfNo,IssuedQTY) values(...)
      for (const l of lines) {
        await tx.$executeRaw`
          INSERT INTO tbl_transferreqdetail
            (FromLocCode, ToLoc, TRNo, ItemCode, UnitID, CostPrice, TRQty, ItemValue, TransferConfNo, IssuedQTY)
          VALUES
            (${invChar(fromLoc,10)}, ${invChar(toLoc,10)}, ${invChar(trNo,50)}, ${invChar(l.itemCode,20)}, ${invChar(l.unitID,10)},
             ${l.costPrice}, ${l.trQty}, ${l.itemValue}, ${invChar(trNo,20)}, 0)
        `;
      }

      return { trNo: trNo.trim(), fromLoc, toLoc, netTotal, lines: lines.length, confirmed: confirmNow, trDate, trDueDate };
    }, { timeout: 30000 });

    try { await logActivity(actor.name, "inventory", `Transfer Requisition ${result.trNo} ${result.confirmed?'confirmed':'saved'}`); } catch {}

    return NextResponse.json({
      success: true,
      data: result,
      message: result.confirmed ? `Transfer Requisition ${result.trNo} confirmed — ${result.lines} line(s) saved.` : `Transfer Requisition ${result.trNo} saved (${result.lines} lines).`
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
