// src/lib/transferPdf.ts — PDF for Transfer sheets (reuses poPdf layout but with transfer title/panel)
import PDFDocument from "pdfkit";
import { poPrintValueColumns, poPrintColumnCount, type PoPrintCopy, type PoPrintRow } from "./poPrint";

export interface TransferPdfData {
  kind: "requisition"|"note"|"return";
  title: string;
  copy: PoPrintCopy;
  copyLabel: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  branch: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  docNo: string;
  docDate: string;
  dueDate?: string;
  issueRef?: string;
  printDate: string;
  printTime: string;
  user: string;
  rows: PoPrintRow[];
  total: string;
  remarks: string;
}

function oneLine(width:number){ return {width, lineBreak:false as const}; }
function fitToWidth(doc: PDFKit.PDFDocument, text:string, width:number): string {
  const v = String(text??"");
  if(doc.widthOfString(v) <= width) return v;
  let cut=v;
  while(cut.length>1 && doc.widthOfString(`${cut}…`) > width) cut=cut.slice(0,-1);
  return `${cut.trimEnd()}…`;
}
const PAGE_W=595.28, PAGE_H=841.89, MARGIN=40, INNER_W=PAGE_W-MARGIN*2, FRAME_TOP=30, FRAME_H=PAGE_H-60;
const GREEN="#EEF6FF", CREAM="#F7EACC", BLUE="#BADDF7", RULE="#000000";

export async function buildTransferPdf(data: TransferPdfData): Promise<Buffer>{
  const cols = poPrintValueColumns(data.copy);
  const doc = new PDFDocument({size:"A4", margins:{top:0,bottom:0,left:0,right:0}, autoFirstPage:true, info:{Title:`${data.title} ${data.docNo}`, Author:data.companyName, Subject:`${data.copyLabel} — ${data.title} ${data.docNo}`, Creator:"SAYO — Transfer"}});
  const chunks: Buffer[]=[]; const done=new Promise<Buffer>((res,rej)=>{ doc.on("data",(c:Buffer)=>chunks.push(c)); doc.on("end",()=>res(Buffer.concat(chunks))); doc.on("error",rej); });
  doc.lineWidth(0.8).strokeColor(RULE); doc.rect(MARGIN, FRAME_TOP, INNER_W, FRAME_H).stroke();
  let y=FRAME_TOP+22;
  const TITLE_SIZE=11.5; doc.font("Helvetica-Bold").fontSize(TITLE_SIZE);
  const titleW=doc.widthOfString(data.title); const titleLeft=(PAGE_W-titleW)/2; const nameW=Math.max(110, titleLeft-(MARGIN+16)-14);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(RULE);
  doc.text(fitToWidth(doc,data.companyName,nameW), MARGIN+16, y, oneLine(nameW));
  doc.font("Helvetica").fontSize(8.5);
  if(data.companyAddress) doc.text(fitToWidth(doc,data.companyAddress,nameW), MARGIN+16, y+15, oneLine(nameW));
  if(data.companyPhone) doc.text(fitToWidth(doc,data.companyPhone,nameW), MARGIN+16, y+26, oneLine(nameW));
  doc.font("Helvetica-Bold").fontSize(TITLE_SIZE); doc.text(data.title, titleLeft, y+1, oneLine(titleW+2));
  const boxRight=PAGE_W-MARGIN-16;
  const labelX=boxRight-190; const valueW=120;
  const meta:[string,string][]=[
    [data.kind==="requisition"?"TR No":data.kind==="return"?"Rtn No":"Trn No", data.docNo],
    ["Date", data.docDate],
    ...(data.dueDate?[["Due Date", data.dueDate] as [string,string]]:[]),
    ...(data.issueRef?[["Ref", data.issueRef] as [string,string]]:[]),
    ["",""],
    ["Print Date", data.printDate],
    ["Print Time", data.printTime],
    ["User", data.user],
  ];
  let metaY=y-2;
  for(const [label,value] of meta){
    if(label){ doc.font("Helvetica-Bold").fontSize(8.5).fillColor(RULE); doc.text(label,labelX,metaY,oneLine(90)); doc.font("Helvetica").text(":",labelX+92,metaY,oneLine(8)); doc.text(value,boxRight-valueW,metaY,{...oneLine(valueW),align:"right"}); }
    metaY+= label?11.5:8;
  }
  // From/To panel
  const panelW=INNER_W; const panelX=MARGIN+16; const panelY=y+60; const panelH=42;
  doc.save(); doc.rect(MARGIN+6, panelY, INNER_W-12, panelH).fillColor(GREEN).fill(); doc.restore();
  doc.fillColor(RULE).font("Helvetica-Bold").fontSize(8.5);
  doc.text("From", panelX, panelY+8, oneLine(60));
  doc.font("Helvetica").text(`${data.fromCode}  ${data.fromName}`, panelX+46, panelY+8, oneLine(panelW*0.5-60));
  doc.font("Helvetica-Bold").text("To", panelX+ panelW*0.5, panelY+8, oneLine(30));
  doc.font("Helvetica").text(`${data.toCode}  ${data.toName}`, panelX+ panelW*0.5+26, panelY+8, oneLine(panelW*0.5-60));
  // Table
  const colWidths = cols.costPrice ? {code:84, unit:58, qty:38, cost:52, value:58} : {code:84, unit:100, qty:60, cost:0, value:0};
  const descW=INNER_W-6-(colWidths.code+colWidths.unit+colWidths.qty+colWidths.cost+colWidths.value);
  const colX:Record<string,number>={}; let x=MARGIN; colX.code=x; x+=colWidths.code; colX.desc=x; x+=descW; colX.unit=x; x+=colWidths.unit; colX.qty=x; x+=colWidths.qty; colX.cost=x; x+=colWidths.cost; colX.value=x;
  let tableY=panelY+panelH+18; const tableRight=MARGIN+INNER_W; const rowH=13;
  doc.save(); doc.rect(MARGIN, tableY-3, INNER_W, rowH+3).fillColor(CREAM).fill(); doc.restore();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(RULE);
  doc.text("ItemCode",colX.code,tableY+1,oneLine(colWidths.code-4));
  doc.text("Description",colX.desc,tableY+1,oneLine(descW-6));
  doc.text("Unit",colX.unit,tableY+1,oneLine(colWidths.unit-4));
  doc.text("Qty",colX.qty,tableY+1,{...oneLine(colWidths.qty-4),align:"right"});
  if(cols.costPrice) doc.text("Cost Price",colX.cost,tableY+1,{...oneLine(colWidths.cost-4),align:"right"});
  if(cols.itemValue) doc.text("ItemValue",colX.value,tableY+1,{...oneLine(colWidths.value),align:"right"});
  tableY+=rowH+1;
  doc.save(); doc.rect(MARGIN, tableY-2, INNER_W, rowH).fillColor(CREAM).fill(); doc.restore();
  doc.font("Helvetica-Bold").fontSize(8.5); doc.text(data.docNo,colX.code,tableY+2,oneLine(INNER_W)); tableY+=rowH;
  doc.font("Helvetica").fontSize(8.5);
  const printRows=data.rows.length?data.rows:[{itemCode:"",name:"No item lines",unit:"",qty:"",costPrice:"",itemValue:""}];
  for(const row of printRows){
    doc.text(fitToWidth(doc,row.itemCode,colWidths.code-4),colX.code,tableY+2,oneLine(colWidths.code-4));
    doc.text(fitToWidth(doc,row.name,descW-6),colX.desc,tableY+2,oneLine(descW-6));
    doc.text(fitToWidth(doc,row.unit,colWidths.unit-6),colX.unit,tableY+2,oneLine(colWidths.unit-6));
    doc.text(row.qty,colX.qty,tableY+2,{...oneLine(colWidths.qty-4),align:"right"});
    if(cols.costPrice) doc.text(row.costPrice,colX.cost,tableY+2,{...oneLine(colWidths.cost-4),align:"right"});
    if(cols.itemValue) doc.text(row.itemValue,colX.value,tableY+2,{...oneLine(colWidths.value),align:"right"});
    tableY+=rowH;
  }
  if(cols.total){
    doc.save(); doc.rect(MARGIN,tableY-2,INNER_W,rowH+2).fillColor(BLUE).fill(); doc.restore();
    doc.font("Helvetica-Bold").fontSize(8.5); doc.text("Total",colX.code,tableY+2,oneLine(descW));
    doc.text(data.total,colX.value,tableY+2,{...oneLine(colWidths.value),align:"right"}); tableY+=rowH+2;
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(RULE);
  const footY=tableY+16;
  if(data.remarks){ doc.text("Remarks",colX.code,footY,oneLine(60)); doc.text(fitToWidth(doc,data.remarks,INNER_W-66),colX.code+60,footY,oneLine(INNER_W-66)); }
  const footer=`${data.companyName}${data.branch && data.branch!==data.companyName?` — ${data.branch}`:""}`;
  const footerY=FRAME_TOP+FRAME_H-18;
  doc.font("Helvetica").fontSize(7.5).fillColor(RULE);
  doc.text(footer,colX.code,footerY,oneLine(INNER_W*0.4));
  doc.text("Page 1 of 1",MARGIN,footerY,{...oneLine(INNER_W),align:"center"});
  doc.text(data.copyLabel,tableRight-168,footerY,{...oneLine(160),align:"right"});
  doc.end(); return done;
}
