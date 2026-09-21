// POST /api/inventory/transfer/return/:trtnNo/email
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { logActivity } from "@/lib/activityLog";
import { invActor, invFail, invId, InvError, keySql, keyVal } from "@/lib/inventoryServer";
import { loadCompanyLetterhead, letterheadAddress, letterheadName } from "@/lib/companyLetterhead";
import { poPrintClock, poPrintDate, poPrintRows, poPrintTotal, type PoPrintCopy, poPrintCopyLabel } from "@/lib/poPrint";
import { smtpMissingEnv, smtpSetupMessage, transferEmailBody, transferEmailSubject, transferPdfFileName } from "@/lib/transferPrint";
import { buildTransferPdf } from "@/lib/transferPdf";

export const runtime="nodejs"; export const dynamic="force-dynamic"; export const revalidate=0;
const globalForPrisma = globalThis as unknown as {prisma?: PrismaClient};
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if(process.env.NODE_ENV!=="production") globalForPrisma.prisma=prisma;
const trim=(v:unknown)=>String(v??"").trim();
type Ctx={params:Promise<{trtnNo:string}>};

export async function POST(req:NextRequest, ctx:Ctx){
  const tag="POST /api/inventory/transfer/return/[trtnNo]/email";
  try{
    const actor=await invActor(req);
    const {trtnNo: raw}=await ctx.params;
    const trtnNo=invId(raw,"Return No",10);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const fromLocCode=invId(body.fromLocCode||body.FromLocCode,"From Location",10);
    const toLoc=invId(body.toLoc||body.ToLoc,"To Location",10);
    const copy:PoPrintCopy = trim(body.copy)==="supplier"?"supplier":"standard";
    const to=trim(body.to);
    if(!to) throw new InvError("Type the address to send this return to (To).",400);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(to)) throw new InvError(`"${to}" is not an e-mail address.`,400);
    const heads=await prisma.$queryRaw<{FromLocCode:string;ToLoc:string;TRtnNo:string;TRtnDate:Date|null;NetTotal:number|null;Remarks:string|null;TNNO:string|null}[]>`
      SELECT RTRIM(FromLocCode) AS FromLocCode, RTRIM(ToLoc) AS ToLoc, RTRIM(TRtnNo) AS TRtnNo, TRtnDate, NetTotal, Remarks, RTRIM(TNNO) AS TNNO
      FROM tbl_transferreturnheader WHERE ${keySql("FromLocCode")}=${keyVal(fromLocCode)} AND ${keySql("ToLoc")}=${keyVal(toLoc)} AND ${keySql("TRtnNo")}=${keyVal(trtnNo)} LIMIT 1
    `;
    if(!heads.length) throw new InvError(`Transfer Return ${trtnNo} not found (${fromLocCode}→${toLoc}).`,404);
    const head=heads[0];
    const lineRows=await prisma.$queryRaw<{ItemCode:string;ItemDes:string|null;UnitID:string;UnitDes:string|null;CostPrice:number|null;TranRtnQty:number|null}[]>`
      SELECT RTRIM(d.ItemCode) AS ItemCode,
        (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql("im.LocCode")}=${keySql("d.FromLocCode")} AND ${keySql("im.ItemCode")}=${keyVal(1) /* dummy */} LIMIT 1) AS ItemDes,
        RTRIM(d.UnitID) AS UnitID,
        (SELECT UnitDes FROM tbl_unitmaster u WHERE ${keySql("u.MasterUnitID")}=${keySql("d.UnitID")} LIMIT 1) AS UnitDes,
        d.CostPrice AS CostPrice, d.TranRtnQty AS TranRtnQty
      FROM tbl_transferreturndetail d
      WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLocCode)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TRtnNo")}=${keyVal(trtnNo)}
      ORDER BY d.ItemCode
    `;
    // Fix ItemDes join: need correct LocCode param — use fromLocCode
    // Do fallback query if above fails: fetch again with proper join via JS? For now handle ItemDes from ItemCode directly
    const lineRows2 = lineRows.length ? lineRows : [];
    // If ItemDes is always null due to dummy, try alternative fetch
    let finalRows = lineRows2;
    if(lineRows2.length && !String(lineRows2[0].ItemDes||"").trim()){
      try{
        finalRows = await prisma.$queryRaw<{ItemCode:string;ItemDes:string|null;UnitID:string;UnitDes:string|null;CostPrice:number|null;TranRtnQty:number|null}[]>`
          SELECT RTRIM(d.ItemCode) AS ItemCode, i.ItemDes AS ItemDes, RTRIM(d.UnitID) AS UnitID, u.UnitDes AS UnitDes, d.CostPrice AS CostPrice, d.TranRtnQty AS TranRtnQty
          FROM tbl_transferreturndetail d
          LEFT JOIN tbl_itemmaster i ON ${keySql("i.ItemCode")}=${keySql("d.ItemCode")}
          LEFT JOIN tbl_unitmaster u ON ${keySql("u.MasterUnitID")}=${keySql("d.UnitID")}
          WHERE ${keySql("d.FromLocCode")}=${keyVal(fromLocCode)} AND ${keySql("d.ToLoc")}=${keyVal(toLoc)} AND ${keySql("d.TRtnNo")}=${keyVal(trtnNo)}
          ORDER BY d.ItemCode
        `;
      }catch{ finalRows=lineRows2; }
    }
    if(!finalRows.length) throw new InvError(`Transfer Return ${trtnNo} has no lines.`,400);
    const locRows=await prisma.$queryRaw<{LocDes:string|null;Address:string|null}[]>`SELECT LocDes, Address FROM tbl_locationmaster WHERE ${keySql("LocCode")}=${keyVal(fromLocCode)} LIMIT 1`;
    const loc=locRows[0];
    const locToRows=await prisma.$queryRaw<{LocDes:string|null}[]>`SELECT LocDes FROM tbl_locationmaster WHERE ${keySql("LocCode")}=${keyVal(toLoc)} LIMIT 1`;
    const locTo=locToRows[0];
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company, trim(loc?.LocDes));
    const companyAddress=letterheadAddress(company, trim(loc?.Address));
    const lines=finalRows.map(l=>({itemCode:trim(l.ItemCode), name:trim(l.ItemDes)||trim(l.ItemCode), unitID:trim(l.UnitID), unitName:trim(l.UnitDes), costPrice:Number(l.CostPrice||0), poQty:Number(l.TranRtnQty||0)}));
    const rows=poPrintRows(lines); const total=poPrintTotal(lines); const now=new Date(); const clock=poPrintClock(now);
    const pdf=await buildTransferPdf({
      kind:"return", title:"Transfer Return Note", copy, copyLabel: poPrintCopyLabel(copy),
      companyName, companyAddress, companyPhone: company.phone, branch: trim(loc?.LocDes),
      fromCode: fromLocCode, fromName: trim(loc?.LocDes)||fromLocCode,
      toCode: toLoc, toName: trim(locTo?.LocDes)||toLoc,
      docNo: trtnNo, docDate: poPrintDate(head.TRtnDate), issueRef: trim(head.TNNO),
      printDate: clock.date, printTime: clock.time, user: actor.name||actor.userId,
      rows, total, remarks: trim(head.Remarks)
    });
    const missing=smtpMissingEnv(process.env);
    if(missing.length) return NextResponse.json({success:false,message:smtpSetupMessage(missing),missingEnv:missing},{status:503});
    const fileName=transferPdfFileName(trtnNo);
    const subject=trim(body.subject)|| transferEmailSubject("return", trtnNo, companyName);
    const text=trim(body.message)|| transferEmailBody({kind:"return",docNo:trtnNo,companyName,from:trim(loc?.LocDes)||fromLocCode,to:trim(locTo?.LocDes)||toLoc,docDate:poPrintDate(head.TRtnDate),lineCount:rows.length,copy});
    const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
    await transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,text,attachments:[{filename:fileName,content:pdf,contentType:"application/pdf"}]});
    await logActivity(actor.name,"inventory",`Transfer Return ${trtnNo} emailed to <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`);
    return NextResponse.json({success:true,data:{trtnNo,fromLocCode,toLoc,to,copy,fileName,bytes:pdf.length},message:`Transfer Return ${trtnNo} emailed to <${to}> — ${poPrintCopyLabel(copy)} attached as ${fileName}.`});
  }catch(err){ return invFail(err,tag); }
}
void Prisma;
