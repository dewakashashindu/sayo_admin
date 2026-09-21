// POST /api/inventory/damage/:damNo/email  body:{ locCode, to, copy?, subject?, message? }
// Emails the Damage Note sheet — internal document, so To must be supplied (no supplier). PDF like PO.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { logActivity } from '@/lib/activityLog';
import { invActor, invFail, invId, InvError, keySql, keyVal } from '@/lib/inventoryServer';
import { loadCompanyLetterhead, letterheadAddress, letterheadName } from '@/lib/companyLetterhead';
import { poPrintClock, poPrintCopyLabel, poPrintDate, poPrintRows, poPrintTotal, type PoPrintCopy } from '@/lib/poPrint';
import { smtpMissingEnv, smtpSetupMessage } from '@/lib/poEmail';
import { buildInventoryPdf } from '@/lib/inventoryPdf';
export const runtime='nodejs'; export const dynamic='force-dynamic'; export const revalidate=0;
const globalForPrisma=globalThis as unknown as { prisma?: PrismaClient };
const prisma=globalForPrisma.prisma ?? new PrismaClient();
if(process.env.NODE_ENV!=='production') globalForPrisma.prisma=prisma;
type Ctx={ params: Promise<{ damNo:string }> };
const trim=(v:unknown)=>String(v??'').trim();
export async function POST(req:NextRequest, ctx:Ctx){
  const tag='POST /api/inventory/damage/[damNo]/email';
  try{
    const actor=await invActor(req);
    const { damNo: raw }=await ctx.params;
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const locCode=invId(body.locCode,'Location',10);
    const damNo=invId(raw,'Damage number',10);
    const copy:PoPrintCopy = trim(body.copy)==='supplier' ? 'supplier' : 'standard';
    const to=trim(body.to);
    if(!to) throw new InvError('Enter the e-mail address to send this Damage Note to (To).',400);
    if(!to.includes('@')) throw new InvError(`“${to}” is not a valid email.`,400);
    const headRows=await prisma.$queryRaw<{ DamNo:string; NetTotal:number|null; Remarks:string|null; TxnDate:Date|null; Confirmed:string|null }[]>`SELECT RTRIM(DamNo) AS DamNo, NetTotal, Remarks, TxnDate, Confirmed FROM tbl_damageheder WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('DamNo')}=${keyVal(damNo)}`;
    if(!headRows.length) throw new InvError(`Damage Note ${damNo} not found at ${locCode}.`,404);
    const head=headRows[0];
    const locationRows=await prisma.$queryRaw<{ LocDes:string|null; Address:string|null }[]>`SELECT LocDes, Address FROM tbl_locationmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)}`;
    const location=locationRows[0];
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company, trim(location?.LocDes));
    const companyAddress=letterheadAddress(company, trim(location?.Address));
    const lineRows=await prisma.$queryRaw<{ ItemCode:string; ItemDes:string|null; UnitId:string; UnitDes:string|null; DmgQty:number|null; CostPrice:number|null; ItemValue:number|null }[]>`SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes, RTRIM(d.UnitId) AS UnitId, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keyVal('d.UnitId')} LIMIT 1) AS UnitDes, d.DmgQty, d.CostPrice, d.ItemValue FROM tbl_damagedetails d WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.DamNo')}=${keyVal(damNo)} ORDER BY d.ItemCode`;
    if(!lineRows.length) throw new InvError(`Damage Note ${damNo} has no lines.`,400);
    const lines=lineRows.map(l=>({ itemCode: trim(l.ItemCode), name: trim(l.ItemDes)||trim(l.ItemCode), unitID: trim(l.UnitId), unitName: trim(l.UnitDes), costPrice: Number(l.CostPrice||0), poQty: Number(l.DmgQty||0)}));
    const rows=poPrintRows(lines);
    const total=poPrintTotal(lines);
    const now=new Date(); const clock=poPrintClock(now);
    const pdf=await buildInventoryPdf({
      title:'Damage Note', copy, copyLabel: poPrintCopyLabel(copy),
      companyName, companyAddress, companyPhone: company.phone, branch: trim(location?.LocDes),
      partnerCode: locCode, partnerName: trim(location?.LocDes)||locCode, partnerAddress: trim(location?.Address)||'',
      docNo: damNo, docDate: poPrintDate(head.TxnDate), printDate: clock.date, printTime: clock.time, user: actor.name||actor.userId,
      rows, total, totalLabel:'Damage Cost', remarks: trim(head.Remarks),
    });
    const missing=smtpMissingEnv(process.env as Record<string,string|undefined>);
    if(missing.length) return NextResponse.json({ success:false, message: smtpSetupMessage(missing), missingEnv: missing },{status:503});
    const fileName=`${damNo.trim()||'damage-note'}.pdf`;
    const subject=trim(body.subject) || `Damage Note ${damNo} — ${trim(location?.LocDes)||locCode}`;
    const text=trim(body.message) || `Damage Note ${damNo} dated ${poPrintDate(head.TxnDate)} at ${trim(location?.LocDes)||locCode} (${rows.length} line(s)).\nDamage Cost: ${total}\n\nSent by ${actor.name||actor.userId} from ${companyName}.\n${trim(head.Remarks)?`Remarks: ${trim(head.Remarks)}\n`:''}`;
    const transporter=nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT||587), secure: String(process.env.SMTP_SECURE)==='true',
      auth: process.env.SMTP_USER? {user:process.env.SMTP_USER, pass:process.env.SMTP_PASS}: undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM||process.env.SMTP_USER||`no-reply@${process.env.SMTP_HOST}`, to, subject, text, attachments:[{filename:fileName, content: pdf, contentType:'application/pdf'}] });
    await logActivity(actor.name,'inventory',`Damage Note ${damNo} emailed to <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`);
    return NextResponse.json({ success:true, data:{ damNo, locCode, to, copy, fileName, bytes: pdf.length }, message:`Damage Note ${damNo} emailed to <${to}> — ${poPrintCopyLabel(copy)} attached as ${fileName}.` });
  }catch(err){ return invFail(err, tag); }
}
void Prisma;
