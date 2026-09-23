// POST /api/inventory/grn/:grnNo/email  body:{ locCode, to?, copy?, subject?, message? }
// Emails the GRN / Direct GRN sheet to supplier — like PO email (PDF attachment, SMTP)
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";
import nodemailer from 'nodemailer';
import { logActivity } from '@/lib/activityLog';
import { invActor, invFail, invId, InvError, keySql, keyVal } from '@/lib/inventoryServer';
import { loadCompanyLetterhead, letterheadAddress, letterheadName } from '@/lib/companyLetterhead';
import { poPrintClock, poPrintCopyLabel, poPrintDate, poPrintRows, poPrintTotal, type PoPrintCopy } from '@/lib/poPrint';
import { invalidSupplierEmailParts, poPdfFileName, primarySupplierEmail, smtpMissingEnv, smtpSetupMessage } from '@/lib/poEmail';
import { buildInventoryPdf } from '@/lib/inventoryPdf';
export const runtime='nodejs'; export const dynamic='force-dynamic'; export const revalidate=0;
const globalForPrisma=globalThis as unknown as { prisma?: PrismaClient };
const prisma=globalForPrisma.prisma ?? newRobustPrisma();
if(process.env.NODE_ENV!=='production') globalForPrisma.prisma=prisma;
type Ctx={ params: Promise<{ grnNo:string }> };
const trim=(v:unknown)=>String(v??'').trim();
export async function POST(req:NextRequest, ctx:Ctx){
  const tag='POST /api/inventory/grn/[grnNo]/email';
  try{
    const actor=await invActor(req);
    const { grnNo: raw }=await ctx.params;
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const locCode=invId(body.locCode,'Location',10);
    const grnNo=invId(raw,'GRN number',15);
    const copy:PoPrintCopy = trim(body.copy)==='supplier' ? 'supplier' : 'standard';
    const toOverride=trim(body.to);
    const headRows=await prisma.$queryRaw<{ GRNNO:string; SupID:string; GRNDate:Date|null; NetTotal:number|null; Remarks:string|null; PONO:string|null; SupInvNo:string|null; GRNTYPE:string|null }[]>`SELECT RTRIM(GRNNO) AS GRNNO, RTRIM(SupID) AS SupID, GRNDate, NetTotal, Remarks, RTRIM(PONO) AS PONO, SupInvNo, RTRIM(GRNTYPE) AS GRNTYPE FROM tbl_grnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('GRNNO')}=${keyVal(grnNo)}`;
    if(!headRows.length) throw new InvError(`GRN ${grnNo} not found at ${locCode}.`,404);
    const head=headRows[0];
    const supID=trim(head.SupID);
    const supRows=await prisma.$queryRaw<{ SupName:string|null; Emails:string|null; SuppAdd1:string|null; ContactNO:string|null }[]>`SELECT SupName, Emails, SuppAdd1, ContactNO FROM tbl_suppliermaster WHERE ${keySql('SupID')}=${keyVal(supID)}`;
    const supplierName=trim(supRows[0]?.SupName)||supID;
    const stored=String(supRows[0]?.Emails||'');
    let to = toOverride || primarySupplierEmail(stored);
    // For GRN, if no supplier email fall back to requiring To
    if(!to) throw new InvError(`Supplier ${supplierName} (${supID}) has no e-mail address — type one in To.`,400);
    if(!to.includes('@')) throw new InvError(`“${to}” is not a valid email.`,400);
    const rejected=invalidSupplierEmailParts(trim(body.to)?'': stored);
    const locationRows=await prisma.$queryRaw<{ LocDes:string|null; Address:string|null }[]>`SELECT LocDes, Address FROM tbl_locationmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)}`;
    const location=locationRows[0];
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company, trim(location?.LocDes));
    const companyAddress=letterheadAddress(company, trim(location?.Address));
    const lineRows=await prisma.$queryRaw<{ ItemCode:string; ItemDes:string|null; UnitID:string; UnitName:string|null; CostPrice:number|null; GRNQty:number|null; FreeQty:number|null; ItemValue:number|null }[]>`SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes, RTRIM(d.UnitID) AS UnitID, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keyVal('d.UnitID')} LIMIT 1) AS UnitName, d.CostPrice, d.GRNQty, d.FreeQty, d.ItemValue FROM tbl_grndetails d WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.GRNNo')}=${keyVal(grnNo)} ORDER BY d.LineNo`;
    if(!lineRows.length) throw new InvError(`GRN ${grnNo} has no lines.`,400);
    const lines=lineRows.map(l=>{
      const qty=(Number(l.GRNQty||0)+Number(l.FreeQty||0));
      return { itemCode: trim(l.ItemCode), name: trim(l.ItemDes)||trim(l.ItemCode), unitID: trim(l.UnitID), unitName: trim(l.UnitName), costPrice: Number(l.CostPrice||0), poQty: qty };
    });
    const rows=poPrintRows(lines);
    const total=poPrintTotal(lines);
    const now=new Date(); const clock=poPrintClock(now);
    const title = trim(head.GRNTYPE)==='DG' ? 'Direct Good Received Note' : 'Good Received Note';
    const pdf=await buildInventoryPdf({
      title, copy, copyLabel: poPrintCopyLabel(copy),
      companyName, companyAddress, companyPhone: company.phone, branch: trim(location?.LocDes),
      partnerCode: supID, partnerName: supplierName, partnerAddress: trim(supRows[0]?.SuppAdd1)||trim(supRows[0]?.ContactNO)||'',
      docNo: grnNo, docDate: poPrintDate(head.GRNDate), printDate: clock.date, printTime: clock.time, user: actor.name||actor.userId,
      rows, total, totalLabel:'Net Value', deliAdd: trim(head.PONO)? `PO: ${trim(head.PONO)}` : '', remarks: trim(head.Remarks),
    });
    const missing=smtpMissingEnv(process.env as Record<string,string|undefined>);
    if(missing.length) return NextResponse.json({ success:false, message: smtpSetupMessage(missing), missingEnv: missing },{status:503});
    const fileName=poPdfFileName(grnNo);
    const subject=trim(body.subject) || `${title} ${grnNo} — ${supplierName}`;
    const text=trim(body.message) || `Dear ${supplierName},\n\nPlease find attached ${title} ${grnNo} dated ${poPrintDate(head.GRNDate)} (${rows.length} line(s)).\nPO: ${trim(head.PONO)||'—'} · Sup Inv: ${trim(head.SupInvNo)||'—'}\nNet Value: ${total}\n\nSent by ${actor.name||actor.userId} from ${companyName}.\n${trim(head.Remarks)?`Remarks: ${trim(head.Remarks)}\n`:''}`;
    const transporter=nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT||587), secure: String(process.env.SMTP_SECURE)==='true',
      auth: process.env.SMTP_USER? {user:process.env.SMTP_USER, pass:process.env.SMTP_PASS}: undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM||process.env.SMTP_USER||`no-reply@${process.env.SMTP_HOST}`, to, subject, text, attachments:[{filename:fileName, content: pdf, contentType:'application/pdf'}] });
    await logActivity(actor.name,'inventory',`${title} ${grnNo} emailed to ${supplierName} <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`);
    return NextResponse.json({ success:true, data:{ grnNo, locCode, to, copy, fileName, bytes: pdf.length, lines: rows.length, total }, message:`${title} ${grnNo} emailed to ${supplierName} <${to}> — ${poPrintCopyLabel(copy)} attached as ${fileName}.`, ignored: rejected });
  }catch(err){ return invFail(err, tag); }
}
void Prisma;
