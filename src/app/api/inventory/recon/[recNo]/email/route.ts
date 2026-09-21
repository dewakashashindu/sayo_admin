// POST /api/inventory/recon/:recNo/email  body:{ locCode, to, copy?, subject?, message? }
// Emails the Stock Reconciliation Note — internal document, To required, PDF like PO.
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
type Ctx={ params: Promise<{ recNo:string }> };
const trim=(v:unknown)=>String(v??'').trim();
export async function POST(req:NextRequest, ctx:Ctx){
  const tag='POST /api/inventory/recon/[recNo]/email';
  try{
    const actor=await invActor(req);
    const { recNo: raw }=await ctx.params;
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const locCode=invId(body.locCode,'Location',10);
    const recNo=invId(raw,'Recon number',10);
    const copy:PoPrintCopy = trim(body.copy)==='supplier' ? 'supplier' : 'standard';
    const to=trim(body.to);
    if(!to) throw new InvError('Enter the e-mail address to send this Reconciliation Note to (To).',400);
    if(!to.includes('@')) throw new InvError(`“${to}” is not a valid email.`,400);
    const headRows=await prisma.$queryRaw<{ RecNo:string; RecDate:Date|null; NetValue:number|null; Remarks:string|null }[]>`SELECT RTRIM(RecNo) AS RecNo, RecDate, NetValue, Remarks FROM tbl_reconcilheder WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('RecNo')}=${keyVal(recNo)}`;
    if(!headRows.length) throw new InvError(`Stock Reconciliation Note ${recNo} not found at ${locCode}.`,404);
    const head=headRows[0];
    const locationRows=await prisma.$queryRaw<{ LocDes:string|null; Address:string|null }[]>`SELECT LocDes, Address FROM tbl_locationmaster WHERE ${keySql('LocCode')}=${keyVal(locCode)}`;
    const location=locationRows[0];
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company, trim(location?.LocDes));
    const companyAddress=letterheadAddress(company, trim(location?.Address));
    const lineRows=await prisma.$queryRaw<{ ItemCode:string; ItemDes:string|null; UnitId:string; UnitDes:string|null; SysQty:number|null; RecQty:number|null; CostPrice:number|null; RecItemValue:number|null }[]>`SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes, RTRIM(d.UnitId) AS UnitId, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keyVal('d.UnitId')} LIMIT 1) AS UnitDes, d.SysQty, d.RecQty, d.CostPrice, d.RecItemValue FROM tbl_reconcildetails d WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.RecNo')}=${keyVal(recNo)} ORDER BY d.ItemCode`;
    if(!lineRows.length) throw new InvError(`Recon ${recNo} has no lines.`,400);
    // For recon PDF, Qty is Phy Qty (RecQty), total is sum of differences? Use RecItemValue based total? But we use poPrintTotal difference? Actually use RecItemValue sum.
    const lines=lineRows.map(l=>{
      const diff=(Number(l.RecQty||0)-Number(l.SysQty||0));
      // If RecItemValue exists use it, else diff*cost
      const cost=Number(l.CostPrice||0);
      const qty=Number(l.RecQty||0);
      // InventoryPdf expects qty column = phy qty, total = sum of itemValue (diff*cost)
      // So we stash diff value for total but rows qty is RecQty. We'll compute total separately.
      return { itemCode: trim(l.ItemCode), name: trim(l.ItemDes)||trim(l.ItemCode), unitID: trim(l.UnitId), unitName: trim(l.UnitDes), costPrice: cost, poQty: qty, _itemValue: Number(l.RecItemValue)!=0? Number(l.RecItemValue): diff*cost } as any;
    });
    const rows=lines.map(l=>({ itemCode: l.itemCode, name: l.name, unit: l.unitName||l.unitID, qty: Number(l.poQty).toFixed(2), costPrice: Number(l.costPrice).toFixed(2), itemValue: Number((l as any)._itemValue).toFixed(2) }));
    const total = lines.reduce((s,l)=> s+ Number((l as any)._itemValue),0).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
    const now=new Date(); const clock=poPrintClock(now);
    const pdf=await buildInventoryPdf({
      title:'Stock Reconciliation Note', copy, copyLabel: poPrintCopyLabel(copy),
      companyName, companyAddress, companyPhone: company.phone, branch: trim(location?.LocDes),
      partnerCode: locCode, partnerName: trim(location?.LocDes)||locCode, partnerAddress: trim(location?.Address)||'',
      docNo: recNo, docDate: poPrintDate(head.RecDate), printDate: clock.date, printTime: clock.time, user: actor.name||actor.userId,
      rows: rows as any, total, totalLabel:'Net Value', remarks: trim(head.Remarks),
    });
    const missing=smtpMissingEnv(process.env as Record<string,string|undefined>);
    if(missing.length) return NextResponse.json({ success:false, message: smtpSetupMessage(missing), missingEnv: missing },{status:503});
    const fileName=`${recNo.trim()||'recon-note'}.pdf`;
    const subject=trim(body.subject) || `Stock Reconciliation Note ${recNo} — ${trim(location?.LocDes)||locCode}`;
    const text=trim(body.message) || `Stock Reconciliation Note ${recNo} dated ${poPrintDate(head.RecDate)} at ${trim(location?.LocDes)||locCode} (${rows.length} line(s)).\nNet Value: ${total}\n\nSent by ${actor.name||actor.userId} from ${companyName}.\n${trim(head.Remarks)?`Remarks: ${trim(head.Remarks)}\n`:''}`;
    const transporter=nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT||587), secure: String(process.env.SMTP_SECURE)==='true',
      auth: process.env.SMTP_USER? {user:process.env.SMTP_USER, pass:process.env.SMTP_PASS}: undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM||process.env.SMTP_USER||`no-reply@${process.env.SMTP_HOST}`, to, subject, text, attachments:[{filename:fileName, content: pdf, contentType:'application/pdf'}] });
    await logActivity(actor.name,'inventory',`Recon ${recNo} emailed to <${to}> as ${fileName} (${poPrintCopyLabel(copy)})`);
    return NextResponse.json({ success:true, data:{ recNo, locCode, to, copy, fileName, bytes: pdf.length }, message:`Stock Reconciliation Note ${recNo} emailed to <${to}> — ${poPrintCopyLabel(copy)} attached as ${fileName}.` });
  }catch(err){ return invFail(err, tag); }
}
void Prisma;
