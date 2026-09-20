// POST /api/inventory/supplier-return/:srnNo/email  body:{ locCode, to? }
// Emails the SRN sheet to the supplier — like PO email but for returns.
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { invActor, invFail, invId, InvError, keySql, keyVal } from '@/lib/inventoryServer';
import { loadCompanyLetterhead, letterheadAddress, letterheadName } from '@/lib/companyLetterhead';
import { primarySupplierEmail, smtpMissingEnv, smtpSetupMessage } from '@/lib/poEmail';
export const runtime='nodejs'; export const dynamic='force-dynamic'; export const revalidate=0;
const globalForPrisma=globalThis as unknown as { prisma?: PrismaClient };
const prisma=globalForPrisma.prisma ?? new PrismaClient();
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
    const toOverride=trim(body.to);
    const headRows=await prisma.$queryRaw<{ SRNNO:string; SupID:string; SRNDate:Date|null; NetTotal:number|null; Remarks:string|null }[]>`SELECT RTRIM(SRNNO) AS SRNNO, RTRIM(SupID) AS SupID, SRNDate, NetTotal, Remarks FROM tbl_srnheader WHERE ${keySql('LocCode')}=${keyVal(locCode)} AND ${keySql('SRNNO')}=${keyVal(srnNo)}`;
    if(!headRows.length) throw new InvError(`SRN ${srnNo} not found at ${locCode}.`,404);
    const supID=trim(headRows[0].SupID);
    const supRows=await prisma.$queryRaw<{ SupName:string|null; Emails:string|null }[]>`SELECT SupName, Emails FROM tbl_suppliermaster WHERE ${keySql('SupID')}=${keyVal(supID)}`;
    const supplierName=trim(supRows[0]?.SupName)||supID;
    const storedEmails=String(supRows[0]?.Emails||'');
    const to = toOverride || primarySupplierEmail(storedEmails);
    if(!to) throw new InvError(`Supplier ${supplierName} has no email on record${storedEmails?` (stored: “${storedEmails}”)`:` — add one to tbl_suppliermaster.Emails`}.`,400);
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(to.replace(/\\/g,'')) && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(to)) {
      // fallback simple check
    }
    if(!to.includes('@')) throw new InvError(`“${to}” is not a valid email address.`,400);
    const missing=smtpMissingEnv(process.env as Record<string,string|undefined>);
    if(missing.length) return NextResponse.json({ success:false, message: smtpSetupMessage(missing), missingEnv: missing }, {status:503});
    const lineRows=await prisma.$queryRaw<{ ItemCode:string; ItemDes:string|null; UnitID:string; UnitDes:string|null; SRNQty:number; CostPrice:number; ItemValue:number }[]>`SELECT RTRIM(d.ItemCode) AS ItemCode, (SELECT ItemDes FROM tbl_itemmaster im WHERE ${keySql('im.LocCode')}=${keyVal(locCode)} AND ${keySql('im.ItemCode')}=${keySql('d.ItemCode')} LIMIT 1) AS ItemDes, RTRIM(d.UnitID) AS UnitID, (SELECT UnitDes FROM tbl_unitmaster um WHERE ${keySql('um.MasterUnitID')}=${keyVal('d.UnitID')} LIMIT 1) AS UnitDes, d.SRNQty, d.CostPrice, d.ItemValue FROM tbl_srndetails d WHERE ${keySql('d.LocCode')}=${keyVal(locCode)} AND ${keySql('d.SRNNo')}=${keyVal(srnNo)} ORDER BY d.ItemCode`;
    if(!lineRows.length) throw new InvError(`SRN ${srnNo} has no lines.`,400);
    const company=await loadCompanyLetterhead(prisma);
    const companyName=letterheadName(company);
    const companyAddress=letterheadAddress(company);
    const subject=`Supplier Return Note ${srnNo} — ${supplierName}`;
    const bodyText=`Dear ${supplierName},\n\nPlease find attached Supplier Return Note ${srnNo} dated ${headRows[0].SRNDate? new Date(headRows[0].SRNDate).toLocaleDateString():''} (Location ${locCode}).\nNet Total: ${Number(headRows[0].NetTotal||0).toFixed(2)}\n\nSent by ${actor.name} from ${companyName}.\n${headRows[0].Remarks?`Remarks: ${headRows[0].Remarks}\n`:''}`;
    const rowsHtml=lineRows.map(r=> `<tr><td>${trim(r.ItemCode)}</td><td>${trim(r.ItemDes)||trim(r.ItemCode)}</td><td>${trim(r.UnitDes)||trim(r.UnitID)}</td><td align="right">${Number(r.SRNQty||0).toFixed(2)}</td><td align="right">${Number(r.CostPrice||0).toFixed(2)}</td><td align="right">${Number(r.ItemValue||0).toFixed(2)}</td></tr>`).join('');
    const html=`<div style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#000"><h2 style="margin:0 0 8px">Supplier Return Note ${srnNo}</h2><p>${companyName} — ${companyAddress}</p><p>Supplier: <b>${supplierName} (${supID})</b><br/>Location: ${locCode} · Date: ${headRows[0].SRNDate? new Date(headRows[0].SRNDate).toLocaleDateString():''}<br/>Net Total: <b>${Number(headRows[0].NetTotal||0).toFixed(2)}</b></p><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>ItemCode</th><th>Description</th><th>Unit</th><th>SRN Qty</th><th>Cost Price</th><th>Item Value</th></tr></thead><tbody>${rowsHtml}</tbody></table><p>${(headRows[0].Remarks||'')}</p><p>— Sent by ${actor.name}</p></div>`;
    const transporter=nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT||587), secure: String(process.env.SMTP_SECURE)==='true',
      auth: process.env.SMTP_USER? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }: undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM||process.env.SMTP_USER||`no-reply@${process.env.SMTP_HOST}`, to, subject, text: bodyText, html });
    return NextResponse.json({ success:true, message:`SRN ${srnNo} emailed to ${to} ✓` });
  }catch(err){ return invFail(err, tag); }
}
