// POST /api/inventory/supplier-return/:srnNo/email  body:{ locCode, to?, copy?, subject?, message? }
// Emails the SRN sheet to the supplier — like PO email (PDF attachment, copy choice, SMTP via .env)
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
type Ctx={ params: Promise<{ srnNo: string }> };
const trim=(v:unknown)=>String(v??'').trim();
export async function POST(req:NextRequest, ctx:Ctx){
  const tag='POST /api/inventory/supplier-return/[srnNo]/email';
  try{
    const actor=await invActor(req);
    const { srnNo: raw } = await ctx.params;
    const body= await req.json().catch(()=>({})) as Record<string,unknown>;
    const locCode=invId(body.locCode,'Location',10);
    const srnNo=invId(raw,'SRN number',15);
    const copy: PoPrintCopy = trim(body.copy)==='supplier' ? 'supplier' : 'standard';
    const toOverride=trim(body.to);
    const headRows=await prisma.$queryRaw<{ SRNNO:string; SupID:string; SRNDate:Date|null; NetTotal:number|null; Remarks:string|null; SupInvNo:string|null }[]>`SELECT RTRIM(SRNNO) AS SRNNO, RTRIM(SupID) AS SupID, SRNDate, NetTotal, Remarks, SupInvNo FROM tbl_srnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNO')}=${keyVal(srnNo)}`;
    if(!headRows.length) throw new InvError(`Supplier Return Note ${srnNo} not found at ${locCode}. Save it first.`,404);
    const head=headRows[0];
    const supID=trim(head.SupID);
    const supRows=await prisma.$queryRaw<{ SupName:string|null; Emails:string|null; SuppAdd1:string|null; ContactNO:string|null }[]>`SELECT SupName, Emails, SuppAdd1, ContactNO FROM tbl_suppliermaster WHERE ${keySql('SupID')}=${keyVal(supID)}`;
    const supplierName=trim(supRows[0]?.SupName)||supID;
    const storedEmails=String(supRows[0]?.Emails||'');
    const to = toOverride || primarySupplierEmail(storedEmails);
    if(!to) throw new InvError(`Supplier ${supplierName} (${supID}) has no e-mail address on its record${storedEmails?` — stored “${storedEmails}” is not an address`:'.'} Put an address on the supplier or type one in To.`,400);
    if(!to.includes('@')) throw new InvError(`“${to}” is not a valid email address.`,400);
    const rejectedParts = invalidSupplierEmailParts(trim(body.to)?'': storedEmails);
    const locationRows=await prisma.$queryRaw<{ LocDes:string|null; Address:string|null }[]>`SELECT LocDes, Address FROM tbl_locationmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)}`;
    const location=locationRows[0];
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company, trim(location?.LocDes));
    const companyAddress=letterheadAddress(company, trim(location?.Address));
    const lineRows=await prisma.$queryRaw<{ ItemCode:string; ItemDes:string|null; UnitID:string; UnitName:string|null; SRNQty:number|null; CostPrice:number|null; ItemValue:number|null }[]>`SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes, RTRIM(d.UnitID) AS UnitID, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keyVal('d.UnitID')} LIMIT 1) AS UnitName, d.SRNQty, d.CostPrice, d.ItemValue FROM tbl_srndetails d WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.SRNNo')}=${keyVal(srnNo)} ORDER BY d.ItemCode`;
    if(!lineRows.length) throw new InvError(`SRN ${srnNo} has no item lines.`,400);
    const lines=lineRows.map(l=>({ itemCode: trim(l.ItemCode), name: trim(l.ItemDes)||trim(l.ItemCode), unitID: trim(l.UnitID), unitName: trim(l.UnitName), costPrice: Number(l.CostPrice||0), poQty: Number(l.SRNQty||0)}));
    const rows=poPrintRows(lines);
    const total=poPrintTotal(lines);
    const now=new Date(); const clock=poPrintClock(now);
    const pdf=await buildInventoryPdf({
      title:'Supplier Return Note', copy, copyLabel: poPrintCopyLabel(copy),
      companyName, companyAddress, companyPhone: company.phone, branch: trim(location?.LocDes),
      partnerCode: supID, partnerName: supplierName, partnerAddress: trim(supRows[0]?.SuppAdd1)||trim(supRows[0]?.ContactNO)||'',
      docNo: srnNo, docDate: poPrintDate(head.SRNDate), printDate: clock.date, printTime: clock.time, user: actor.name||actor.userId,
      rows, total, totalLabel:'Net Total', deliAdd: head.SupInvNo? `Sup Inv: ${trim(head.SupInvNo)}`: '', remarks: trim(head.Remarks),
    });
    const missing=smtpMissingEnv(process.env as Record<string,string|undefined>);
    if(missing.length) return NextResponse.json({ success:false, message: smtpSetupMessage(missing), missingEnv: missing },{status:503});
    const fileName=poPdfFileName(srnNo);
    const subject=trim(body.subject) || `Supplier Return Note ${srnNo} — ${supplierName}`;
    const text=trim(body.message) || `Dear ${supplierName},\n\nPlease find attached Supplier Return Note ${srnNo} dated ${poPrintDate(head.SRNDate)} (${rows.length} line(s)).\nNet Total: ${total}\n\nSent by ${actor.name||actor.userId} from ${companyName}.\n${trim(head.Remarks)?`Remarks: ${trim(head.Remarks)}\n`:''}`;
    const transporter=nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT||587), secure: String(process.env.SMTP_SECURE)==='true',
      auth: process.env.SMTP_USER? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS}: undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM||process.env.SMTP_USER||`no-reply@${process.env.SMTP_HOST}`, to, subject, text, attachments:[{filename:fileName, content: pdf, contentType:'application/pdf'}] });
    await logActivity(actor.name,'inventory',`SRN ${srnNo} emailed to ${supplierName} <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`);
    return NextResponse.json({ success:true, data:{ srnNo, locCode, to, copy, fileName, bytes: pdf.length, lines: rows.length, total }, message:`Supplier Return Note ${srnNo} emailed to ${supplierName} <${to}> — ${poPrintCopyLabel(copy)} attached as ${fileName}.`, ignored: rejectedParts });
  }catch(err){ return invFail(err, tag); }
}
void Prisma;
