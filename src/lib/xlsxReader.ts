// src/lib/xlsxReader.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read an .xlsx / .csv file in the browser, with no npm dependency.
//
// Why not a library: the upload screen only needs to SHOW what is in the file
// before anything is written, and `xlsx` on npm is a ~1 MB bundle with known
// advisories. An .xlsx file is just a ZIP of XML parts, and every browser this
// app supports can inflate a deflate stream natively through
// `DecompressionStream`, so the whole reader is the two helpers below.
//
// Scope, stated plainly:
//   • .xlsx (ZIP + OOXML) and .csv are read.
//   • The old binary .xls (BIFF8) format is NOT — it is a different container
//     entirely. `isSupported()` reports that so the screen can say so instead
//     of failing with a blank table.
//   • The first worksheet is used; that is what an export from these masters
//     produces.
//
// Nothing here writes anywhere. It returns strings, and the screen decides what
// to do with them.
// ─────────────────────────────────────────────────────────────────────────────

/** A sheet as plain text, with the gaps left by empty cells kept in place. */
export type SheetData = {
  /** Row 1 by convention — treated as the header row by the caller. */
  rows: string[][];
  sheetName: string;
};

const enc = new TextEncoder();

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Decode one ZIP entry with the browser's own inflate. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

interface ZipEntry { name: string; data: Uint8Array }

/**
 * Walk the ZIP central directory. Local headers cannot be trusted for offsets
 * (a file name may be longer there than in the directory), so every entry is
 * located through its central-directory record.
 */
async function readZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);

  // End Of Central Directory: scan backwards for the 0x06054b50 signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a readable Excel (.xlsx) workbook.');

  const entryCount = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < entryCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break; // central directory header

    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);

    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // The local header repeats the name/extra lengths, and those may differ.
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);

    if (!name.endsWith('/')) {
      out.set(name, method === 0 ? raw.slice() : await inflateRaw(raw));
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** `<c r="B2" t="s"><v>7</v></c>` → column 1, shared-string index 7. */
const CELL_RE = /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
const ATTR_RE = /([\w:]+)\s*=\s*"([^"]*)"/g;

function attrs(blob: string): Record<string, string> {
  const a: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(blob))) a[m[1]] = m[2];
  return a;
}

/** "BC12" → 54 (zero-based). */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? '';
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return Math.max(0, n - 1);
}

function xmlText(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) out.push(unescapeXml(tParts(m[1])));
  return out;
}

/** Concatenate the <t> runs of a cell — a value split by formatting is still one value. */
function tParts(xml: string): string {
  let text = '';
  const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let t: RegExpExecArray | null;
  while ((t = tRe.exec(xml))) text += unescapeXml(t[1]);
  return text;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

async function readXlsx(buf: ArrayBuffer): Promise<SheetData> {
  const zip = await readZip(buf);

  const shared = xmlText(new TextDecoder().decode(zip.get('xl/sharedStrings.xml') ?? new Uint8Array()));

  // Prefer the first sheet part in workbook order; fall back to the first one
  // present, which is what a single-sheet export produces.
  const sheetNames = [...zip.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => (Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0])));
  const sheetKey = sheetNames[0];
  if (!sheetKey) throw new Error('This workbook has no worksheets.');

  let sheetName = sheetKey;
  const wbXml = new TextDecoder().decode(zip.get('xl/workbook.xml') ?? new Uint8Array());
  const wbSheet = wbXml.match(/<sheet\b[^>]*name="([^"]*)"[^>]*>/);
  if (wbSheet) sheetName = wbSheet[1];

  const sheetXml = new TextDecoder().decode(zip.get(sheetKey)!);
  const rows: string[][] = [];

  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowM: RegExpExecArray | null;
  while ((rowM = rowRe.exec(sheetXml))) {
    const cells: string[] = [];
    let at = 0;

    CELL_RE.lastIndex = 0;
    let c: RegExpExecArray | null;
    while ((c = CELL_RE.exec(rowM[1]))) {
      const open = c[1] ?? c[2] ?? '';
      const inner = c[3] ?? '';
      const a = attrs(open);
      const idx = a.r ? colIndex(a.r) : at;

      let value = '';
      if (a.t === 's') {
        const i = Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? NaN);
        value = shared[i] ?? '';
      } else if (a.t === 'inlineStr') {
        /* Inline strings live in <is><t>…</t></is> — NOT in a <si> block, so
           the shared-string reader must not be used here. */
        value = tParts(inner);
      } else if (a.t === 'str') {
        value = unescapeXml(inner);
      } else {
        value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      }

      while (cells.length < idx) cells.push(''); // keep empty columns
      cells[idx] = value.replace(/\s+$/, '');
      at = idx + 1;
    }

    // A row with nothing in it is not a record. A file exported by hand often
    // ends with blank lines, and the upload screen must not count those.
    if (cells.every((c) => c.trim() === '')) continue;
    rows.push(cells);
  }

  return { rows, sheetName };
}

/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF or LF line endings. */
function readCsv(text: string): SheetData {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') continue;
    if (c === '\n') { endRow(); continue; }
    field += c;
  }
  if (field !== '' || row.length > 0) endRow();

  return { rows, sheetName: 'CSV' };
}

/** .xls (BIFF) is not a ZIP container, so it cannot be read this way. */
export function isLegacyXls(fileName: string): boolean {
  return /\.xls$/i.test(fileName);
}

/** Read the file and return its first sheet as text rows. */
export async function readSpreadsheet(file: File): Promise<SheetData> {
  if (isLegacyXls(file.name)) {
    throw new Error('The old .xls format cannot be read here. Save it as .xlsx or .csv first.');
  }
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
  if (!isZip) return readCsv(new TextDecoder().decode(buf));
  return readXlsx(buf);
}
