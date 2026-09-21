// src/lib/transferPrint.ts
// Helpers for Transfer printing — mirrors poPrint but for internal transfers.
// Re-uses poPrint formatting (dates, money, qty) so transfer sheets look same as PO.
import {
  poPrintColumnCount as baseColCount,
  poPrintCopyLabel,
  poPrintDate,
  poPrintClock,
  poPrintMoney,
  poPrintQty,
  poPrintRows as baseRows,
  poPrintTotal as baseTotal,
  PO_PRINT_COPY_CHOICES,
  type PoPrintCopy,
  type PoPrintRow,
} from "./poPrint";

export type TransferPrintCopy = PoPrintCopy;
export const TRANSFER_PRINT_COPY_CHOICES = PO_PRINT_COPY_CHOICES;
export { poPrintCopyLabel, poPrintDate, poPrintClock, poPrintMoney, poPrintQty, poPrintRows, poPrintTotal, poPrintColumnCount as transferPrintColumnCount, poPrintValueColumns as transferPrintValueColumns } from "./poPrint";
export type TransferPrintRow = PoPrintRow;

// Title per transfer doc type
export function transferPrintTitle(kind: "requisition"|"note"|"return"): string {
  if(kind==="note") return "Transfer Note";
  if(kind==="return") return "Transfer Return Note";
  return "Transfer Requisition Note";
}

// Attachment file name: TC000006.pdf etc.
export function transferPdfFileName(docNo: string): string {
  const clean = String(docNo||"").trim().replace(/[^A-Za-z0-9_-]+/g,"");
  return `${clean||"transfer"}.pdf`;
}

export function transferEmailSubject(kind: "requisition"|"note"|"return", docNo: string, companyName: string): string {
  const title = transferPrintTitle(kind);
  const comp = String(companyName||"").trim();
  const no = String(docNo||"").trim();
  return comp ? `${title} ${no} — ${comp}` : `${title} ${no}`;
}

export function transferEmailBody(opts: {kind:"requisition"|"note"|"return"; docNo:string; companyName:string; from:string; to:string; docDate:string; dueDate?:string; lineCount:number; copy: TransferPrintCopy}): string {
  const title = transferPrintTitle(opts.kind);
  const lines: string[] = [];
  lines.push(`Please find ${title} ${opts.docNo} attached as PDF (${transferPdfFileName(opts.docNo)}).`);
  lines.push(`From: ${opts.from}  →  To: ${opts.to}`);
  if(opts.docDate) lines.push(`Date: ${opts.docDate}`);
  if(opts.dueDate) lines.push(`Due: ${opts.dueDate}`);
  lines.push(`${opts.lineCount} item line(s).`);
  lines.push("");
  lines.push(`Copy: ${poPrintCopyLabel(opts.copy)}`);
  lines.push(opts.companyName || "Thank you,");
  return lines.join("\n");
}

// SMTP helpers re-export from poEmail
export { smtpMissingEnv, smtpConfigured, smtpSetupMessage } from "./poEmail";
