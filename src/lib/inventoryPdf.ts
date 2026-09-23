import PDFDocument from 'pdfkit';
import { poPrintValueColumns, poPrintColumnCount, type PoPrintCopy, type PoPrintRow } from './poPrint';

export interface InventoryPdfData {
  /** e.g. 'Good Received Note', 'Supplier Return Note', 'Damage Note', 'Stock Reconciliation Note' */
  title: string;
  copy: PoPrintCopy;
  copyLabel: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  branch: string;
  partnerCode: string;
  partnerName: string;
  partnerAddress: string;
  docNo: string;
  docDate: string;
  dueDate?: string;
  printDate: string;
  printTime: string;
  user: string;
  rows: PoPrintRow[];
  total: string;
  totalLabel?: string;
  extraLines?: { k: string; v: string }[]; // e.g. [{k:'Deli.Add',v:''},{k:'Remarks',v:''}]
  deliAdd?: string;
  remarks?: string;
}

function oneLine(width: number){ return { width, lineBreak:false as const }; }
function fitToWidth(doc: PDFKit.PDFDocument, text: string, width: number): string {
  const value = String(text??'');
  if(doc.widthOfString(value)<=width) return value;
  let cut=value;
  while(cut.length>1 && doc.widthOfString(`${cut}…`)>width) cut=cut.slice(0,-1);
  return `${cut.trimEnd()}…`;
}
const PAGE_W=595.28; const PAGE_H=841.89; const MARGIN=40; const INNER_W=PAGE_W-MARGIN*2;
const FRAME_TOP=30; const FRAME_H=PAGE_H-60;
const GREEN='#EAF7EE'; const CREAM='#F7EACC'; const BLUE='#BADDF7'; const RULE='#000000';

export async function buildInventoryPdf(data: InventoryPdfData): Promise<Buffer>{
  const cols=poPrintValueColumns(data.copy);
  const colCount=poPrintColumnCount(data.copy);
  const doc=new PDFDocument({
    size:'A4',
    margins:{top:0,bottom:0,left:0,right:0},
    autoFirstPage:true,
    info:{ Title:`${data.title} ${data.docNo}`, Author:data.companyName, Subject:`${data.copyLabel} — ${data.title} ${data.docNo}`, Creator:'SAYO — Inventory'},
  });
  const chunks: Buffer[]=[]; const done=new Promise<Buffer>((resolve,reject)=>{ doc.on('data',(c:Buffer)=>chunks.push(c)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject); });
  doc.lineWidth(0.8).strokeColor(RULE); doc.rect(MARGIN,FRAME_TOP,INNER_W,FRAME_H).stroke();
  let y=FRAME_TOP+22;
  const TITLE_SIZE=11.5; doc.font('Helvetica-Bold').fontSize(TITLE_SIZE);
  const titleW=doc.widthOfString(data.title); const titleLeft=(PAGE_W-titleW)/2; const nameW=Math.max(110,titleLeft-(MARGIN+16)-14);
  doc.font('Helvetica-Bold').fontSize(11); doc.fillColor(RULE);
  doc.text(fitToWidth(doc,data.companyName,nameW),MARGIN+16,y,oneLine(nameW));
  doc.font('Helvetica').fontSize(8.5);
  if(data.companyAddress) doc.text(fitToWidth(doc,data.companyAddress,nameW),MARGIN+16,y+15,oneLine(nameW));
  if(data.companyPhone) doc.text(fitToWidth(doc,data.companyPhone,nameW),MARGIN+16,y+26,oneLine(nameW));
  doc.font('Helvetica-Bold').fontSize(TITLE_SIZE);
  doc.text(data.title,titleLeft,y+1,oneLine(titleW+2));
  const boxRight=PAGE_W-MARGIN-16; const labelX=boxRight-190; const valueW=120;
  const meta:[string,string][]=[
    [data.title.includes('Return')?'SRN NO': data.title.includes('Damage')?'Damage No': data.title.includes('Recon')?'Rec. No': data.title.includes('GRN')||data.title.includes('Good')?'GRN NO':'No', data.docNo],
    ['Date', data.docDate],
    ...(data.dueDate? [['Due Date', data.dueDate] as [string,string] ]: []),
    ['', ''],
    ['Print Date', data.printDate],
    ['Print Time', data.printTime],
    ['User', data.user],
  ];
  let metaY=y-2;
  for(const [label,value] of meta){
    if(label){ doc.font('Helvetica-Bold').fontSize(8.5).fillColor(RULE); doc.text(label,labelX,metaY,oneLine(90)); doc.font('Helvetica').fillColor(RULE); doc.text(':',labelX+92,metaY,oneLine(8)); doc.text(value,boxRight-valueW,metaY,{...oneLine(valueW),align:'right'}); }
    metaY+= label?11.5:8;
  }
  const panelW=INNER_W*0.56; const panelX=MARGIN+16; const panelY=y+60; const panelH=66;
  doc.save(); doc.rect(panelX,panelY,panelW,panelH).fillColor(GREEN).fill(); doc.restore();
  doc.fillColor(RULE).font('Helvetica').fontSize(8.5);
  // partner label changes per doc: Supplier or Location
  const partnerLabel = data.title.includes('Damage')||data.title.includes('Recon') ? 'Location' : 'Supplier';
  doc.text(partnerLabel,panelX+8,panelY+8,oneLine(panelW-16));
  doc.font('Helvetica-Bold'); doc.text(data.partnerCode,panelX+14,panelY+24,oneLine(90));
  doc.font('Helvetica').text(fitToWidth(doc,data.partnerName,panelW-124),panelX+110,panelY+24,oneLine(panelW-124));
  const addr=data.partnerAddress||''; if(addr) doc.text(fitToWidth(doc,addr,panelW-28),panelX+14,panelY+42,oneLine(panelW-28));
  const colWidths = cols.costPrice ? {code:84, unit:58, qty:38, cost:52, value:58} : {code:84, unit:100, qty:60, cost:0, value:0};
  const descW=INNER_W-6-(colWidths.code+colWidths.unit+colWidths.qty+colWidths.cost+colWidths.value);
  const colX:Record<string,number>={}; let x=MARGIN; colX.code=x; x+=colWidths.code; colX.desc=x; x+=descW; colX.unit=x; x+=colWidths.unit; colX.qty=x; x+=colWidths.qty; colX.cost=x; x+=colWidths.cost; colX.value=x;
  const rowH=13; let tableY=panelY+panelH+18; const tableRight=MARGIN+INNER_W;
  doc.save(); doc.rect(MARGIN,tableY-3,INNER_W,rowH+3).fillColor(CREAM).fill(); doc.restore();
  const headY=tableY+1; doc.font('Helvetica-Bold').fontSize(8.5).fillColor(RULE);
  doc.text('ItemCode',colX.code,headY,oneLine(colWidths.code-4));
  doc.text('Item Description',colX.desc,headY,oneLine(descW-6));
  doc.text('Unit',colX.unit,headY,oneLine(colWidths.unit-4));
  doc.text('Qty',colX.qty,headY,{...oneLine(colWidths.qty-4),align:'right'});
  if(cols.costPrice) doc.text('Cost Price',colX.cost,headY,{...oneLine(colWidths.cost-4),align:'right'});
  if(cols.itemValue) doc.text('Item Value',colX.value,headY,{...oneLine(colWidths.value),align:'right'});
  tableY+=rowH+1;
  doc.save(); doc.rect(MARGIN,tableY-2,INNER_W,rowH).fillColor(CREAM).fill(); doc.restore();
  doc.font('Helvetica-Bold').fontSize(8.5); doc.text(data.docNo,colX.code,tableY+2,oneLine(INNER_W)); tableY+=rowH;
  doc.font('Helvetica').fontSize(8.5);
  const printRows=data.rows.length? data.rows: [{itemCode:'',name:'No item lines',unit:'',qty:'',costPrice:'',itemValue:''}];
  for(const row of printRows){
    doc.text(fitToWidth(doc,row.itemCode,colWidths.code-4),colX.code,tableY+2,oneLine(colWidths.code-4));
    doc.text(fitToWidth(doc,row.name,descW-6),colX.desc,tableY+2,oneLine(descW-6));
    doc.text(fitToWidth(doc,row.unit,colWidths.unit-6),colX.unit,tableY+2,oneLine(colWidths.unit-6));
    doc.text(row.qty,colX.qty,tableY+2,{...oneLine(colWidths.qty-4),align:'right'});
    if(cols.costPrice) doc.text(row.costPrice,colX.cost,tableY+2,{...oneLine(colWidths.cost-4),align:'right'});
    if(cols.itemValue) doc.text(row.itemValue,colX.value,tableY+2,{...oneLine(colWidths.value),align:'right'});
    tableY+=rowH;
  }
  if(cols.total){
    doc.save(); doc.rect(MARGIN,tableY-2,INNER_W,rowH+2).fillColor(BLUE).fill(); doc.restore();
    doc.font('Helvetica-Bold').fontSize(8.5);
    const totalLabel=data.totalLabel||'Total';
    doc.text(totalLabel,colX.code,tableY+2,oneLine(descW));
    doc.text(data.total,colX.value,tableY+2,{...oneLine(colWidths.value),align:'right'});
    tableY+=rowH+2;
  }
  doc.font('Helvetica').fontSize(8.5).fillColor(RULE);
  let footY=tableY+16;
  const extra = data.extraLines && data.extraLines.length ? data.extraLines : [
    ...(data.deliAdd? [{k:'Deli. Add',v:data.deliAdd} as const]:[]),
    ...(data.remarks? [{k:'Remarks',v:data.remarks} as const]:[]),
  ];
  for(const line of extra){
    doc.text(line.k,colX.code,footY,oneLine(60));
    doc.text(fitToWidth(doc,line.v,INNER_W-66),colX.code+60,footY,oneLine(INNER_W-66));
    footY+=14;
  }
  const footer=`${data.companyName}${data.branch && data.branch!==data.companyName?` — ${data.branch}`:''}`;
  const footerY=FRAME_TOP+FRAME_H-18;
  doc.font('Helvetica').fontSize(7.5).fillColor(RULE);
  doc.text(footer,colX.code,footerY,oneLine(INNER_W*0.4));
  doc.text('Page 1 of 1',MARGIN,footerY,{...oneLine(INNER_W),align:'center'});
  doc.text(data.copyLabel,tableRight-168,footerY,{...oneLine(160),align:'right'});
  doc.end();
  return done;
}
