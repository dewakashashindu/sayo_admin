// src/app/api/inventory/issue/note/route.ts
// GET  /api/inventory/issue/note?status=&q=&fromLoc=&toLoc=&limit=
// POST /api/inventory/issue/note  body: {irNo,fromLocCode,toLoc,inDate,remarks,lines:[{itemCode,unitID,costPrice,irQty,issuedQty}], confirm?:boolean}
// The Issue Note consumes a confirmed Issue Requisition (same From/To order —
// no location swap, unlike the transfer chain). Confirming it moves stock.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
import { postIssueConfirmation } from "@/lib/issuePosting";
import { findLocation, invActor, invChar, invDateField, invFail, invId, invPrice, invQty, InvError, resolveItems, keySql, keyVal } from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = trim(sp.get("status")).toLowerCase();
    const q = trim(sp.get("q"));
    const fromLoc = trim(sp.get("fromLoc"));
    const toLoc = trim(sp.get("toLoc"));
    const limit = Math.min(Math.max(Number(sp.get("limit") || 300) || 300, 1), 500);
    const where: Prisma.Sql[] = [];
    if (fromLoc) where.push(Prisma.sql`AND ${keySql("h.FromLocCode")}=${keyVal(fromLoc)}`);
    if (toLoc) where.push(Prisma.sql`AND ${keySql("h.ToLoc")}=${keyVal(toLoc)}`);
    if (status === "confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if (status === "pending") where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if (q) where.push(Prisma.sql`AND (RTRIM(h.INNO) LIKE ${`%${q}%`} OR RTRIM(h.IRNO) LIKE ${`%${q}%`})`);
    const filters = (): Prisma.Sql => (where.length ? Prisma.join(where, " ") : Prisma.empty);
    let rows: any[] = [];
    try {
      rows = await prisma.$queryRaw<{ INNO: string; FromLocCode: string; FromLocDes: string | null; ToLoc: string; ToLocDes: string | null; INDate: Date; IRNO: string; NetTotal: number; Confirmed: string; UserID: string }[]>`
        SELECT RTRIM(h.INNO) AS INNO, RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          h.INDate AS INDate, RTRIM(h.IRNO) AS IRNO, h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, RTRIM(h.UserID) AS UserID
        FROM tbl_issuenoteheder h WHERE 1=1 ${filters()} ORDER BY h.INDate DESC, h.INNO DESC LIMIT ${limit}
      `;
    } catch { return NextResponse.json({ success: true, data: [] }); }
    return NextResponse.json({
      success: true,
      data: rows.map(r => ({
        inNo: trim(r.INNO), fromLocCode: trim(r.FromLocCode), fromLocDes: trim(r.FromLocDes), toLoc: trim(r.ToLoc), toLocDes: trim(r.ToLocDes),
        inDate: r.INDate, irNo: trim(r.IRNO), netTotal: Number(r.NetTotal || 0), confirmed: trim(r.Confirmed) === 'Y', userId: trim(r.UserID)
      }))
    });
  } catch (err) { return invFail(err, "GET /api/inventory/issue/note"); }
}

export async function POST(req: NextRequest) {
  const tag = "POST /api/inventory/issue/note";
  try {
    const actor = await invActor(req);
    const body = await req.json() as Record<string, unknown>;
    const irRaw = trim(body.irNo ?? body.IRNO);
    const fromRaw = invId(body.fromLocCode, "From Location", 10);
    const toRaw = invId(body.toLoc, "To Location", 10);
    if (fromRaw === toRaw) throw new InvError("From and To must differ.");
    const inDate = invDateField(body.inDate ?? body.INDate ?? new Date().toISOString().slice(0, 10), "IN Date");
    const remarks = trim(body.remarks).slice(0, 500);
    const confirmNow = body.confirm === true || trim(body.confirm) === '1' || trim(body.confirm) === 'Y';
    const allLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
    const rawLines = allLines.filter((l: any) => Number(l?.issuedQty ?? l?.IssuedQty ?? l?.irQty ?? 0) > 0);
    if (rawLines.length === 0) throw new InvError("Add at least one line with Issued QTY above zero.");

    const result = await prisma.$transaction(async (tx) => {
      const fromLoc = await findLocation(tx, fromRaw); if (!fromLoc) throw new InvError(`Unknown From ${fromRaw}`, 400);
      const toLoc = await findLocation(tx, toRaw); if (!toLoc) throw new InvError(`Unknown To ${toRaw}`, 400);

      // requisition must exist, be confirmed, and in the SAME From/To order
      if (irRaw) {
        const rq = await tx.$queryRaw<{ IRNO: string; Confirmed: string }[]>`
          SELECT RTRIM(IRNO) AS IRNO, UPPER(Confirmed) AS Confirmed
          FROM tbl_issuereqheder
          WHERE ${keySql("IRNO")}=${keyVal(irRaw)} AND ${keySql("FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("ToLoc")}=${keyVal(toLoc)}
          LIMIT 1`;
        if (!rq.length) throw new InvError(`Requisition ${irRaw} not found for ${fromLoc} → ${toLoc}.`, 404);
        if (trim(rq[0].Confirmed) !== 'Y') throw new InvError(`Requisition ${irRaw} is not confirmed yet — issue notes can only be made from confirmed requisitions.`, 409);
      }

      const items = await resolveItems(tx, fromLoc, rawLines.map(l => String(l.itemCode || "").trim()));
      const lines = rawLines.map((l: any) => {
        const code = String(l.itemCode || "").trim().toUpperCase();
        const it = items.get(code);
        if (!it) throw new InvError(`Item ${code} not in ${fromLoc}`, 400);
        const irQty = invQty(l.irQty ?? l.IRQty, `IR QTY of ${it.des}`);
        const issuedQty = invQty(l.issuedQty ?? l.IssuedQty ?? irQty, `Issued QTY of ${it.des}`);
        const cost = trim(l.costPrice) === "" ? it.costPrice : invPrice(l.costPrice, `Cost ${it.des}`);
        return { itemCode: it.code, unitID: invId(l.unitID || it.unitID, "Unit", 10), costPrice: cost, irQty, issuedQty, itemValue: cost * issuedQty };
      });

      // never issue more than the requisition still owes (confirmed consumption so far)
      if (irRaw) {
        for (const l of lines) {
          const owed = await tx.$queryRaw<{ Remaining: number }[]>`
            SELECT IFNULL(d.IRQty,0) - IFNULL(d.IssuedQTY,0) AS Remaining
            FROM tbl_issuereqdetail d
            WHERE ${keySql("d.IRNo")}=${keyVal(irRaw)} AND ${keySql("d.ItemCode")}=${keyVal(l.itemCode)}
              AND ${keySql("d.FromLocCode")}=${keyVal(fromLoc)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)}
            LIMIT 1`;
          if (owed.length && l.issuedQty > Number(owed[0].Remaining || 0) + 1e-9) {
            throw new InvError(`Issued QTY of ${l.itemCode} (${l.issuedQty}) is more than the requisition still owes (${Number(owed[0].Remaining || 0)}).`, 400);
          }
        }
      }

      const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);
      const now = new Date();
      let inNo = "";
      try {
        inNo = await nextSerialTx(tx as any, SERIAL_CODES.issueNote, { width: 6 });
        if (!inNo.toUpperCase().startsWith("IN")) inNo = `IN${inNo.slice(-6)}`;
        inNo = inNo.slice(0, 10).toUpperCase();
      } catch {
        const max = await tx.$queryRaw<{ m: string | null }[]>`SELECT MAX(RTRIM(INNO)) AS m FROM tbl_issuenoteheder WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)}`;
        const n = (Number(String(max[0]?.m || "").replace(/\D/g, "")) || 0) + 1; inNo = `IN${String(n).padStart(6, "0")}`;
      }
      const sysSerNo = Number(inNo.replace(/\D/g, "")) || 0;

      await tx.$executeRaw`
        INSERT INTO tbl_issuenoteheder
          (FromLocCode,ToLoc,INNO,INDate,NetTotal,UserID,Remarks,TxnDate,SysSerialNo,Confirmed,ConUserID,ConDatetime,IRNO)
        VALUES
          (${invChar(fromLoc, 10)},${invChar(toLoc, 10)},${invChar(inNo, 10)},${inDate},${netTotal},
           ${invChar(actor.userId, 10)},${remarks},${now},${sysSerNo},${confirmNow ? "Y" : "N"},${invChar(confirmNow ? actor.userId : "", 10)},${confirmNow ? now : new Date("1900-01-01")},${invChar(irRaw, 10)})
      `;
      for (const l of lines) {
        await tx.$executeRaw`
          INSERT INTO tbl_issuenotedetail
            (FromLocCode,ToLoc,INNo,ItemCode,UnitID,CostPrice,IRQty,INQty,ItemValue,DirectPOConfNo,NewItem)
          VALUES
            (${invChar(fromLoc, 10)},${invChar(toLoc, 10)},${invChar(inNo, 10)},${invChar(l.itemCode, 10)},${invChar(l.unitID, 10)},
             ${l.costPrice},${l.irQty},${l.issuedQty},${l.itemValue},${invChar(inNo, 10)},"")
        `;
      }

      let moved = 0;
      let reqTakenFully = false;
      if (confirmNow) {
        const posting = await postIssueConfirmation(tx as any, {
          inNo, fromLoc, toLoc, irNo: irRaw,
          lines: lines.map((l) => ({ itemCode: l.itemCode, qty: l.issuedQty })),
          sysSerialId: sysSerNo, userId: actor.userId,
        });
        moved = posting.moved;
        reqTakenFully = posting.takenFully;
      }
      return { inNo, fromLoc, toLoc, netTotal, lines: lines.length, confirmed: confirmNow, moved, reqTakenFully };
    }, { timeout: 30000 });

    try { await logActivity(actor.name, "inventory", `Issue Note ${result.inNo} ${result.confirmed ? 'confirmed' : 'saved'} — ${result.lines} line(s), net ${result.netTotal.toFixed(2)}`); } catch {}

    return NextResponse.json({
      success: true, data: result,
      message: result.confirmed ? `Issue Note ${result.inNo} confirmed — stock moved (${result.moved} line(s)).` : `Issue Note ${result.inNo} saved.`
    });
  } catch (err) { return invFail(err, tag); }
}
