// POST /api/inventory/transfer/note/:tranNo/email
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import nodemailer from "nodemailer";
import { logActivity } from "@/lib/activityLog";
import { invActor, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";
import { loadCompanyLetterhead, letterheadAddress, letterheadName } from "@/lib/companyLetterhead";
import { poPrintClock, poPrintDate, poPrintRows, poPrintTotal, type PoPrintCopy, poPrintCopyLabel } from "@/lib/poPrint";
import { smtpMissingEnv, smtpSetupMessage, transferEmailBody, transferEmailSubject, transferPdfFileName } from "@/lib/transferPrint";
import { buildTransferPdf } from "@/lib/transferPdf";

export const runtime="nodejs"; export const dynamic="force-dynamic"; export const revalidate=0;
const globalForPrisma = globalThis as unknown as {prisma?: PrismaClient};
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if(process.env.NODE_ENV!=="production") globalForPrisma.prisma=prisma;
const trim=(v:unknown)=>String(v??"").trim();
type Ctx={params:Promise<{tranNo:string}>};

export async function POST(req:NextRequest, ctx:Ctx){
  const tag="POST /api/inventory/transfer/note/[tranNo]/email";
  try{
    const actor=await invActor(req);
    const {tranNo: raw}=await ctx.params;
    const tranNo=invId(raw,"Tran No",15);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const fromLocCode=invId(body.fromLocCode||body.FromLocCode,"From Location",10);
    const toLoc=invId(body.toLoc||body.ToLoc,"To Location",10);
    const copy:PoPrintCopy = trim(body.copy)==="supplier"?"supplier":"standard";
    const to=trim(body.to);
    if(!to) throw new InvError("Type the address to send this transfer note to (To).",400);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(to)) throw new InvError(`"${to}" is not an e-mail address.`,400);
    const heads=await prisma.$queryRaw<{FromLocCode:string;ToLoc:string;TranNo:string;TraDate:Date|null;NetTotal:number|null;Remarks:string|null;TReqNO:string|null}[]>`
      SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(TranNo) AS TranNo, TraDate, NetTotal, Remarks, RTRIM(TReqNO) AS TReqNO
      FROM tbl_transfernoteheader WHERE ${keySql("FromLocCode")}=${keyVal(fromLocCode)} AND ${keySql("ToLoc")}=${keyVal(toLoc)} AND ${keySql("TranNo")}=${keyVal(tranNo)} LIMIT 1
    `;
    if(!heads.length) throw new InvError(`Transfer Note ${tranNo} not found (${fromLocCode}→${toLoc}).`,404);
    const head=heads[0];
    const lineRows=await prisma.$queryRaw<{ItemCode:string;ItemDes:string|null;UnitID:string;UnitDes:string|null;CostPrice:number|null;TranQty:number|null}[]>`
      SELECT RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keySql("d.ItemCode")} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster u WHERE ${keySql("u.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.TranQty AS TranQty
      FROM tbl_transfernotedetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLocCode)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TranNo")}=${keyVal(tranNo)}
      ORDER BY d.ItemCode
    `;
    if(!lineRows.length) throw new InvError(`Transfer Note ${tranNo} has no lines.`,400);
    const locRows=await prisma.$queryRaw<{LocDes:string|null;Address:string|null}[]>`SELECT LocDes, Address FROM tbl_locationmaster WHERE ${keySql("LocCode")}=${keyVal(fromLocCode)} LIMIT 1`;
    const loc=locRows[0];
    const locToRows=await prisma.$queryRaw<{LocDes:string|null}[]>`SELECT LocDes FROM tbl_locationmaster WHERE ${keySql("LocCode")}=${keyVal(toLoc)} LIMIT 1`;
    const locTo=locToRows[0];
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company, trim(loc?.LocDes));
    const companyAddress=letterheadAddress(company, trim(loc?.Address));
    const lines=lineRows.map(l=>({itemCode:trim(l.ItemCode), name:trim(l.ItemDes)||trim(l.ItemCode), unitID:trim(l.UnitID), unitName:trim(l.UnitDes), costPrice:Number(l.CostPrice||0), poQty:Number(l.TranQty||0)}));
    const rows=poPrintRows(lines); const total=poPrintTotal(lines); const now=new Date(); const clock=poPrintClock(now);
    const pdf=await buildTransferPdf({
      kind:"note", title:"Transfer Note", copy, copyLabel: poPrintCopyLabel(copy),
      companyName, companyAddress, companyPhone: company.phone, branch: trim(loc?.LocDes),
      fromCode: fromLocCode, fromName: trim(loc?.LocDes)||fromLocCode,
      toCode: toLoc, toName: trim(locTo?.LocDes)||toLoc,
      docNo: tranNo, docDate: poPrintDate(head.TraDate), issueRef: trim(head.TReqNO),
      printDate: clock.date, printTime: clock.time, user: actor.name||actor.userId,
      rows, total, remarks: trim(head.Remarks)
    });
    const missing=smtpMissingEnv(process.env);
    if(missing.length) return NextResponse.json({success:false,message:smtpSetupMessage(missing),missingEnv:missing},{status:503});
    const fileName=transferPdfFileName(tranNo);
    const subject=trim(body.subject)|| transferEmailSubject("note", tranNo, companyName);
    const text=trim(body.message)|| transferEmailBody({kind:"note",docNo:tranNo,companyName,from:trim(loc?.LocDes)||fromLocCode,to:trim(locTo?.LocDes)||toLoc,docDate:poPrintDate(head.TraDate),lineCount:rows.length,copy});
    const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
    await transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,text,attachments:[{filename:fileName,content:pdf,contentType:"application/pdf"}]});
    await logActivity(actor.name,"inventory",`Transfer Note ${tranNo} emailed to <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`);
    return NextResponse.json({success:true,data:{tranNo,fromLocCode,toLoc,to,copy,fileName,bytes:pdf.length},message:`Transfer Note ${tranNo} emailed to <${to}> — ${poPrintCopyLabel(copy)} attached as ${fileName}.`});
  }catch(err){ return invFail(err,tag); }
}
void Prisma;
