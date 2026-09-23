// src/app/api/inventory/transfer/return/route.ts
// GET /api/inventory/transfer/return?status=&q=&fromLoc=&toLoc=&limit=
// POST /api/inventory/transfer/return  body: {tnNo,fromLocCode,toLoc,trRtnDate,tnDate,remarks,lines:[{itemCode,unitID,costPrice,tnQty,tranRtnQty}], confirm?}
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
import { postReturnConfirmation } from "@/lib/transferPosting";
import { findLocation, invActor, invChar, invDateField, invFail, invId, invPrice, invQty, InvError, resolveItems, keySql, keyVal } from "@/lib/inventoryServer";

export const runtime="nodejs"; export const dynamic="force-dynamic"; export const revalidate=0;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if(process.env.NODE_ENV!=="production") globalForPrisma.prisma=prisma;
const trim=(v:unknown)=>String(v??"").trim();

export async function GET(req:NextRequest){
  try{
    const sp=req.nextUrl.searchParams;
    const status=trim(sp.get("status")).toLowerCase();
    const q=trim(sp.get("q"));
    const fromLoc=trim(sp.get("fromLoc"));
    const toLoc=trim(sp.get("toLoc"));
    const limit=Math.min(Math.max(Number(sp.get("limit")||300)||300,1),500);
    const where:Prisma.Sql[]=[];
    if(fromLoc) where.push(Prisma.sql`AND ${keySql("h.FromLocCode")}=${keyVal(fromLoc)}`);
    if(toLoc) where.push(Prisma.sql`AND ${keySql("h.ToLoc")}=${keyVal(toLoc)}`);
    if(status==="confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if(status==="pending") where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if(q) where.push(Prisma.sql`AND (RTRIM(h.TRtnNo) LIKE ${`%${q}%`} OR RTRIM(h.TNNO) LIKE ${`%${q}%`})`);
    const filters=():Prisma.Sql=>(where.length? Prisma.join(where," "): Prisma.empty);
    let rows:any[]=[];
    try{
      rows=await prisma.$queryRaw<{TRtnNo:string;FromLocCode:string;FromLocDes:string|null;ToLoc:string;ToLocDes:string|null;TRtnDate:Date;TNNO:string;NetTotal:number;Confirmed:string}[]>`
        SELECT RTRIM(h.TRtnNo) AS TRtnNo, RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          h.TRtnDate AS TRtnDate, RTRIM(h.TNNO) AS TNNO, h.NetTotal AS NetTotal, UPPER(h.Confirmed) AS Confirmed
        FROM tbl_transferreturnheader h WHERE 1=1 ${filters()} ORDER BY h.TRtnDate DESC, h.TRtnNo DESC LIMIT ${limit}
      `;
    }catch{ return NextResponse.json({success:true,data:[]}); }
    return NextResponse.json({success:true,data: rows.map(r=>({
      trtnNo: trim(r.TRtnNo), fromLocCode: trim(r.FromLocCode), fromLocDes: trim(r.FromLocDes), toLoc: trim(r.ToLoc), toLocDes: trim(r.ToLocDes),
      trtnDate: r.TRtnDate, tnNo: trim(r.TNNO), netTotal: Number(r.NetTotal||0), confirmed: trim(r.Confirmed)==='Y'
    }))});
  }catch(err){ return invFail(err,"GET /api/inventory/transfer/return"); }
}

export async function POST(req:NextRequest){
  const tag="POST /api/inventory/transfer/return";
  try{
    const actor=await invActor(req);
    const body=await req.json() as Record<string,unknown>;
    const tnRaw=invId(body.tnNo ?? body.TNNO, "Transfer Note No", 10);
    const fromRaw=invId(body.fromLocCode,"From Location",10);
    const toRaw=invId(body.toLoc,"To Location",10);
    if(fromRaw===toRaw) throw new InvError("From and To must differ.");
    const trRtnDate=invDateField(body.trRtnDate ?? body.TRtnDate ?? new Date().toISOString().slice(0,10),"Return Date");
    const remarks=trim(body.remarks).slice(0,1000);
    const confirmNow=body.confirm===true || trim(body.confirm)==='1' || trim(body.confirm)==='Y';
        const retOf=(l:any)=> Number(l?.rtnQty ?? l?.RtnQty ?? l?.retQty ?? l?.tranRtnQty ?? l?.TranRtnQty ?? 0);
    const rawLines=(Array.isArray(body.lines) ? (body.lines as any[]) : []).filter((l:any)=> retOf(l) > 0);
    if(rawLines.length===0) throw new InvError("Add at least one line with Returned QTY above zero.");
    const result=await prisma.$transaction(async(tx)=>{
      const fromLoc=await findLocation(tx,fromRaw); if(!fromLoc) throw new InvError(`Unknown From ${fromRaw}`,400);
      const toLoc=await findLocation(tx,toRaw); if(!toLoc) throw new InvError(`Unknown To ${toRaw}`,400);
      // verify TN exists
      const tnRows=await tx.$queryRaw<{TranNo:string}[]>`SELECT RTRIM(TranNo) AS TranNo FROM tbl_transfernoteheader WHERE ${keySql("TranNo")}=${keyVal(tnRaw)} LIMIT 1`;
      if(!tnRows.length) throw new InvError(`Transfer Note ${tnRaw} not found.`,404);
      const items=await resolveItems(tx, fromLoc, rawLines.map(l=> String(l.itemCode||"").trim()));
      const lines=rawLines.map((l:any)=>{
        const code=String(l.itemCode||"").trim().toUpperCase();
        const it=items.get(code);
        if(!it) throw new InvError(`Item ${code} not in ${fromLoc}`,400);
        const tnQty=invQty(l.tnQty ?? l.TNQty, `TN QTY of ${it.des}`);
        const rtnQty=invQty(l.tranRtnQty ?? l.TranRtnQty ?? l.rtnQty ?? l.retQty ?? 0, `Returned QTY of ${it.des}`, {allowZero:true});
        const cost=trim(l.costPrice)==="" ? it.costPrice : invPrice(l.costPrice, `Cost ${it.des}`);
        return {itemCode: it.code, unitID: invId(l.unitID||it.unitID,"Unit",10), costPrice: cost, tnQty, rtnQty, itemValue: cost*rtnQty};
      });
      const netTotal=lines.reduce((s,l)=> s+l.itemValue,0);
      const now=new Date();
      let trtnNo="";
      try{ trtnNo=await nextSerialTx(tx as any, SERIAL_CODES.transferReturn,{width:6}); if(!trtnNo.toUpperCase().startsWith("TR")) trtnNo=`TR${trtnNo.slice(-6)}`; trtnNo=trtnNo.slice(0,10).toUpperCase(); }catch{
        const max=await tx.$queryRaw<{m:string|null}[]>`SELECT MAX(RTRIM(TRtnNo)) AS m FROM tbl_transferreturnheader WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)}`;
        const n=(Number(String(max[0]?.m||"").replace(/\D/g,""))||0)+1; trtnNo=`TR${String(n).padStart(6,"0")}`;
      }
      const sysSerNo=trtnNo;
      await tx.$executeRaw`
        INSERT INTO tbl_transferreturnheader
          (FromLocCode,ToLoc,TRtnNo,TRtnDate,NetTotal,UserID,Remarks,TxnDate,SysSerialNo,ConUserID,Confirmed,ConDatetime,TNNO)
        VALUES
          (${invChar(fromLoc,10)},${invChar(toLoc,10)},${invChar(trtnNo,10)},${trRtnDate},${netTotal},
           ${invChar(actor.userId,10)},${remarks},${now},${invChar(sysSerNo,10)},${invChar(confirmNow?actor.userId:"",10)},${confirmNow?"Y":"N"},${confirmNow?now:new Date("1900-01-01")},${invChar(tnRaw,10)})
      `;
      for(const l of lines){
        await tx.$executeRaw`
          INSERT INTO tbl_transferreturndetail
            (FromLocCode,ToLoc,TRtnNo,ItemCode,UnitID,CostPrice,TNQty,TranRtnQty,ItemValue,TranConfNo)
          VALUES
            (${invChar(fromLoc,10)},${invChar(toLoc,10)},${invChar(trtnNo,10)},${invChar(l.itemCode,10)},${invChar(l.unitID,10)},
             ${l.costPrice},${l.tnQty},${l.rtnQty},${l.itemValue},${invChar(trtnNo,10)})
        `;
      }
            // the returning location and TRTI back into the receiving one; TranRtnQTY
      // grows on the transfer note; TakenForTransferRtn flips to 1 only once the
      // whole note has been returned (see src/lib/transferPosting.ts).
      let moved=0;
      let noteTakenFully=false;
      if(confirmNow){
        const posting=await postReturnConfirmation(tx as any, {
          trtnNo, fromLoc, toLoc, tnNo: tnRaw,
          lines: lines.map((l:any)=>({ itemCode: l.itemCode, qty: l.rtnQty })),
          sysSerialId: Number(trtnNo.replace(/\D/g,""))||0, userId: actor.userId,
        });
        moved=posting.moved;
        noteTakenFully=posting.takenFully;
      }
      return {trtnNo, fromLoc, toLoc, netTotal, lines:lines.length, confirmed:confirmNow, moved, noteTakenFully};
    },{timeout:30000});
    return NextResponse.json({success:true,data:result, message: result.confirmed? `Transfer Return ${result.trtnNo} confirmed — stock moved (${result.moved} line(s)).`:`Transfer Return ${result.trtnNo} saved.`});
  }catch(err){ return invFail(err,tag); }
}
