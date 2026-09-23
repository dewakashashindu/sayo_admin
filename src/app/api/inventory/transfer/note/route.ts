// src/app/api/inventory/transfer/note/route.ts
// GET  /api/inventory/transfer/note?status=&q=&fromLoc=&toLoc=&limit=
// POST /api/inventory/transfer/note  body: {tReqNo,fromLocCode,toLoc,traDate,trDueDate,remarks,lines:[{itemCode,unitID,costPrice,trQty,tranQty}], confirm?:boolean}
// UI only → now wired to real tables tbl_transfernoteheader / detail
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
import { postNoteConfirmation } from "@/lib/transferPosting";
import { findLocation, invActor, invChar, invDateField, invFail, invId, invPrice, invQty, InvError, resolveItems, keySql, keyVal } from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest){
  try{
    const sp = req.nextUrl.searchParams;
    const status = trim(sp.get("status")).toLowerCase();
    const q = trim(sp.get("q"));
    const fromLoc = trim(sp.get("fromLoc"));
    const toLoc = trim(sp.get("toLoc"));
    const limit = Math.min(Math.max(Number(sp.get("limit")||300)||300,1),500);
    const where: Prisma.Sql[] = [];
    if(fromLoc) where.push(Prisma.sql`AND ${keySql("h.FromLocCode")}=${keyVal(fromLoc)}`);
    if(toLoc) where.push(Prisma.sql`AND ${keySql("h.ToLoc")}=${keyVal(toLoc)}`);
    if(status==="confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if(status==="pending") where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if(q) where.push(Prisma.sql`AND (RTRIM(h.TranNo) LIKE ${`%${q}%`} OR RTRIM(h.TReqNO) LIKE ${`%${q}%`})`);
    const filters = (): Prisma.Sql => (where.length? Prisma.join(where," "): Prisma.empty);
    let rows: any[] = [];
    try{
      rows = await prisma.$queryRaw<{ TranNo: string; FromLocCode: string; FromLocDes: string|null; ToLoc: string; ToLocDes: string|null; TraDate: Date; TReqNO: string; NetTotal: number; Confirmed: string; UserID: string }[]>`
        SELECT RTRIM(h.TranNo) AS TranNo, RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          h.TraDate AS TraDate, RTRIM(h.TReqNO) AS TReqNO, h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed, RTRIM(h.UserID) AS UserID
        FROM tbl_transfernoteheader h WHERE 1=1 ${filters()} ORDER BY h.TraDate DESC, h.TranNo DESC LIMIT ${limit}
      `;
    }catch{ return NextResponse.json({success:true,data:[]}); }
    return NextResponse.json({success:true,data: rows.map(r=>({
      tranNo: trim(r.TranNo), fromLocCode: trim(r.FromLocCode), fromLocDes: trim(r.FromLocDes), toLoc: trim(r.ToLoc), toLocDes: trim(r.ToLocDes),
      traDate: r.TraDate, tReqNo: trim(r.TReqNO), netTotal: Number(r.NetTotal||0), confirmed: trim(r.Confirmed)==='Y', userId: trim(r.UserID)
    }))});
  }catch(err){ return invFail(err,"GET /api/inventory/transfer/note"); }
}

export async function POST(req: NextRequest){
  const tag="POST /api/inventory/transfer/note";
  try{
    const actor = await invActor(req);
    const body = await req.json() as Record<string, unknown>;
    const tReqRaw = invId(body.tReqNo ?? body.TReqNO, "Issue Requisition No", 10);
    const fromRaw = invId(body.fromLocCode, "From Location", 10);
    const toRaw = invId(body.toLoc, "To Location", 10);
    if(fromRaw===toRaw) throw new InvError("From and To must differ.");
    const traDate = invDateField(body.traDate ?? body.TraDate ?? new Date().toISOString().slice(0,10), "Tra Date");
    const trDueDate = body.trDueDate ? invDateField(body.trDueDate, "TR Due Date") : traDate;
    const remarks = trim(body.remarks).slice(0,400);
    const confirmNow = body.confirm===true || trim(body.confirm)==='1' || trim(body.confirm)==='Y';
    const allLines = Array.isArray(body.lines) ? (body.lines as any[]) : [];
        const rawLines = allLines.filter((l:any)=> Number(l?.tranQty ?? l?.TranQty ?? l?.trQty ?? 0) > 0);
    if(rawLines.length===0) throw new InvError("Add at least one line with Transferred QTY above zero.");
    const result = await prisma.$transaction(async(tx)=>{
      const fromLoc = await findLocation(tx, fromRaw); if(!fromLoc) throw new InvError(`Unknown From ${fromRaw}`,400);
      const toLoc = await findLocation(tx, toRaw); if(!toLoc) throw new InvError(`Unknown To ${toRaw}`,400);
      // verify requisition exists if given
      if(tReqRaw){
        const rq = await tx.$queryRaw<{TRNO:string}[]>`SELECT RTRIM(TRNO) AS TRNO FROM tbl_transferreqheder WHERE ${keySql("TRNO")}=${keyVal(tReqRaw)} LIMIT 1`;
        if(!rq.length) throw new InvError(`Requisition ${tReqRaw} not found.`,404);
      }
      const items = await resolveItems(tx, fromLoc, rawLines.map(l=> String(l.itemCode||"").trim()));
      const lines = rawLines.map((l:any)=>{
        const code = String(l.itemCode||"").trim().toUpperCase();
        const it = items.get(code);
        if(!it) throw new InvError(`Item ${code} not in ${fromLoc}`,400);
        const trQty = invQty(l.trQty ?? l.TRQty, `TR QTY of ${it.des}`);
        const tranQty = invQty(l.tranQty ?? l.TranQty ?? trQty, `Transferred QTY of ${it.des}`);
        const cost = trim(l.costPrice)==="" ? it.costPrice : invPrice(l.costPrice, `Cost ${it.des}`);
        return {itemCode: it.code, unitID: invId(l.unitID||it.unitID,"Unit",10), costPrice: cost, trQty, tranQty, itemValue: cost*tranQty};
      });
      const netTotal = lines.reduce((s,l)=> s + l.itemValue,0);
      const now = new Date();
      let tranNo="";
      try{ tranNo = await nextSerialTx(tx as any, SERIAL_CODES.transferNote, {width:6}); if(!tranNo.toUpperCase().startsWith("TN")) tranNo=`TN${tranNo.slice(-6)}`; tranNo=tranNo.slice(0,15).toUpperCase(); }catch{
        const max = await tx.$queryRaw<{m:string|null}[]>`SELECT MAX(RTRIM(TranNo)) AS m FROM tbl_transfernoteheader WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)}`;
        const n=(Number(String(max[0]?.m||"").replace(/\D/g,""))||0)+1; tranNo=`TN${String(n).padStart(6,"0")}`;
      }
      const sysSerNo = Number(tranNo.replace(/\D/g,""))||0;
      await tx.$executeRaw`
        INSERT INTO tbl_transfernoteheader
          (FromLocCode,ToLoc,TranNo,TraDate,GrossTotal,DisVal,Adjestment,NetTotal,UserID,Remarks,TxnDate,SysSerialNo,Confirmed,ConUserID,ConDatetime,TReqNO,TakenForTransferRtn)
        VALUES
          (${invChar(fromLoc,10)},${invChar(toLoc,10)},${invChar(tranNo,15)},${traDate},${netTotal},0,0,${netTotal},
           ${invChar(actor.userId,10)},${remarks},${now},${sysSerNo},${confirmNow?"Y":"N"},${invChar(confirmNow?actor.userId:"",10)},${confirmNow?now:new Date("1900-01-01")},${invChar(tReqRaw,10)},0)
      `;
      for(const l of lines){
        await tx.$executeRaw`
          INSERT INTO tbl_transfernotedetail
            (FromLocCode,ToLoc,TranNo,ItemCode,UnitID,CostPrice,TRQTy,TranQty,ItemValue,TranConfNo,NewItem,TranRtnQTY)
          VALUES
            (${invChar(fromLoc,10)},${invChar(toLoc,10)},${invChar(tranNo,15)},${invChar(l.itemCode,20)},${invChar(l.unitID,15)},
             ${l.costPrice},${l.trQty},${l.tranQty},${l.itemValue},${invChar(tranNo,15)},"",0)
        `;
      }
            // the issuing location and TI into the receiving one; IssuedQTY grows on
      // the requisition, and TakenForTransfer flips to '1' only once the whole
      // requisition has been issued (see src/lib/transferPosting.ts).
      let moved = 0;
      let reqTakenFully = false;
      if(confirmNow){
        const posting = await postNoteConfirmation(tx as any, {
          tranNo, fromLoc, toLoc, tReqNo: tReqRaw,
          lines: lines.map((l)=>({ itemCode: l.itemCode, qty: l.tranQty })),
          sysSerialId: sysSerNo, userId: actor.userId,
        });
        moved = posting.moved;
        reqTakenFully = posting.takenFully;
      }
      return {tranNo, fromLoc, toLoc, netTotal, lines:lines.length, confirmed:confirmNow, moved, reqTakenFully};
    }, {timeout:30000});
    return NextResponse.json({success:true,data:result, message: result.confirmed ? `Transfer Note ${result.tranNo} confirmed — stock moved (${result.moved} line(s)).` : `Transfer Note ${result.tranNo} saved.`});
  }catch(err){ return invFail(err,tag); }
}
