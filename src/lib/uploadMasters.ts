// src/lib/uploadMasters.ts
// ─────────────────────────────────────────────────────────────────────────────
// What each master is called, and the columns the upload screen writes.
//
// Every column name here is the REAL column of the legacy table, taken from the
// table's own CREATE TABLE, so the header row of the preview is the same list an
// exported file has to carry. The sources:
//   Main Categories   tbl_itemcategory1   — /app/categories
//   Sub Categories 1  tbl_itemcategory2
//   Sub Categories 2  tbl_itemcategory3
//   Sub Categories 3  tbl_itemcategory4
//   Item Master       tbl_itemmaster      — /app/service
//   Item Details      tbl_itemdetail
//   Suppliers         tbl_suppliermaster  — /app/suppliers
//
// Each of the four category levels is its own master rather than one list with a
// "Level" column, because each level is a separate table with its own rows.
//
// Columns the application maintains by itself are deliberately left out — the
// shop has nothing to say about them and cannot type them into a spreadsheet:
//   tbl_itemmaster   ItemPic (an image blob), CreateDate, CreateBy, UpdDate, UpdBy
//   tbl_suppliermaster  CreateUser, CreateDatetime
// They keep their table defaults, so a row still inserts cleanly without them.
// ─────────────────────────────────────────────────────────────────────────────

export type ColKind = 'text' | 'flag' | 'number' | 'date';

export interface MasterColumn {
  /** the table's own column name — this is what goes into the file */
  name: string;
  kind: ColKind;
}

export interface Master {
  key: string;
  label: string;
  /** one line explaining what a row in this file means */
  blurb: string;
  /** the columns that identify a row — marked in the preview */
  keyColumns: string[];
  columns: MasterColumn[];
}

/** The four category tables share one shape, so they share one column list. */
const CATEGORY_COLUMNS: MasterColumn[] = [
  { name: 'CatCode', kind: 'text' },
  { name: 'CatDes',  kind: 'text' },
  { name: 'Enable',  kind: 'flag' },
];

function categoryMaster(
  key: string,
  label: string,
  blurb: string,
): Master {
  return { key, label, blurb, keyColumns: ['CatCode'], columns: CATEGORY_COLUMNS.map((c) => ({ ...c })) };
}

export const MASTERS: Master[] = [
  {
    key: 'supplier',
    label: 'Suppliers',
    blurb: 'One row per supplier. DebtAmount is what the salon currently owes them.',
    keyColumns: ['SupID'],
    columns: [
      { name: 'SupID',       kind: 'text' },
      { name: 'SupName',     kind: 'text' },
      { name: 'SuppAdd1',    kind: 'text' },
      { name: 'ContactNO',   kind: 'text' },
      { name: 'Emails',      kind: 'text' },
      { name: 'Web',         kind: 'text' },
      { name: 'DebtAmount',  kind: 'number' },
      { name: 'Remarks',     kind: 'text' },
      { name: 'Enable',      kind: 'flag' },
    ],
  },
  categoryMaster(
    'category1',
    'Main Categories',
    'The top category level every item is filed under.',
  ),
  categoryMaster(
    'category2',
    'Sub Categories 1',
    'The second category level, sitting under a main category.',
  ),
  categoryMaster(
    'category3',
    'Sub Categories 2',
    'The third category level, sitting under a sub category 1.',
  ),
  categoryMaster(
    'category4',
    'Sub Categories 3',
    'The deepest category level, sitting under a sub category 2.',
  ),
  {
    key: 'item',
    label: 'Item Master',
    blurb: 'Products and services. MOF is the gender the service belongs to: M, F or O.',
    keyColumns: ['LocCode', 'ItemCode'],
    columns: [
      { name: 'LocCode',          kind: 'text' },
      { name: 'ItemCode',         kind: 'text' },
      { name: 'ServiceItem',      kind: 'flag' },
      { name: 'ItemDes',          kind: 'text' },
      { name: 'ItemPrintDes',     kind: 'text' },
      { name: 'MasterUnitID',     kind: 'text' },
      { name: 'Category1',        kind: 'text' },
      { name: 'Category2',        kind: 'text' },
      { name: 'Category3',        kind: 'text' },
      { name: 'Category4',        kind: 'text' },
      { name: 'SupID',            kind: 'text' },
      { name: 'ROL',              kind: 'number' },
      { name: 'ROQ',              kind: 'number' },
      { name: 'MinQty',           kind: 'number' },
      { name: 'MaxQty',           kind: 'number' },
      { name: 'RawCost',          kind: 'number' },
      { name: 'CostMarkup',       kind: 'number' },
      { name: 'OverallCost',      kind: 'number' },
      { name: 'SalesMargin',      kind: 'number' },
      { name: 'StockBalance',     kind: 'number' },
      { name: 'ExpiryItem',       kind: 'flag' },
      { name: 'Retailprice',      kind: 'number' },
      { name: 'WSApp',            kind: 'flag' },
      { name: 'WSQty',            kind: 'number' },
      { name: 'WSPrice',          kind: 'number' },
      { name: 'PackedItem',       kind: 'flag' },
      { name: 'PackSize',         kind: 'number' },
      { name: 'PackPrice',        kind: 'number' },
      { name: 'SemiFinishedProd', kind: 'flag' },
      { name: 'Enable',           kind: 'flag' },
      { name: 'SerDuration',      kind: 'number' },
      { name: 'MOF',              kind: 'text' },
    ],
  },
  {
    key: 'itemdetail',
    label: 'Item Details',
    blurb: 'Stock held per branch per item per expiry date.',
    keyColumns: ['LocCode', 'ItemCode', 'ExpiryDate'],
    columns: [
      { name: 'LocCode',    kind: 'text' },
      { name: 'ItemCode',   kind: 'text' },
      { name: 'ExpiryDate', kind: 'date' },
      { name: 'ItemQty',    kind: 'number' },
    ],
  },
];

export function masterByKey(key: string): Master {
  return MASTERS.find((m) => m.key === key) ?? MASTERS[0];
}

/**
 * Column names arrive from a spreadsheet in whatever shape the person typed
 * them — "LocCode", "loc code", "LOC_CODE". Fold both sides to one comparable
 * form so a file exported by hand still lines up with the table.
 */
export function normaliseHeader(text: string): string {
  return String(text ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Match the header row of a file to the master's columns.
 * `null` means "the file has no column for this one".
 */
export function matchHeaders(
  header: string[],
  master: Master,
): (number | null)[] {
  const byNorm = new Map<string, number>();
  header.forEach((h, i) => {
    const key = normaliseHeader(h);
    if (key && !byNorm.has(key)) byNorm.set(key, i);
  });
  return master.columns.map((col) => {
    const at = byNorm.get(normaliseHeader(col.name));
    return at === undefined ? null : at;
  });
}

/** Columns the file did not carry — the reason a row could not be written. */
export function missingColumns(header: string[], master: Master): MasterColumn[] {
  const map = matchHeaders(header, master);
  return master.columns.filter((_, i) => map[i] === null);
}

/** "1", "yes", "true", "y", "t" and friends all mean on. */
export function toFlag(value: string): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '') return false;
  return ['1', 'y', 'yes', 'true', 't', 'on'].includes(v);
}
