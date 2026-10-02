// src/lib/uploadTypes.ts
// ─────────────────────────────────────────────────────────────────────────────
// The shapes that travel between the server and the Upload Data screen.
//
// They live on their own, apart from uploadStaging.ts, because that module
// imports Prisma and is server-only. The browser half of this feature needs to
// name the same objects, and a `import type` from a server module is one
// refactor away from dragging the database client into the page bundle.
// ─────────────────────────────────────────────────────────────────────────────

/** What VERIFY concluded about one cell of one row. */
export type CellVerdict =
  /** the file says what the database already says — nothing to do */
  | 'same'
  /** the file would change a value that is already live */
  | 'changed'
  /** the row is not in the database, so every cell is new */
  | 'new'
  /** the file left this cell empty */
  | 'blank'
  /** the value does not fit the column, e.g. "Maybe" in a Yes/No column */
  | 'problem';

export interface VerifiedCell {
  column: string;
  /** what the file said, after it was converted to the column's own type */
  incoming: string;
  /** what the database holds today — '' when the row is new */
  current: string;
  verdict: CellVerdict;
  note?: string;
}

export interface VerifiedRow {
  /** 1-based row number in the file, so "row 14" means something to the shop */
  fileRow: number;
  key: Record<string, string>;
  /** 'new' → INSERT when it goes live; 'update' → UPDATE */
  status: 'new' | 'update';
  cells: VerifiedCell[];
  /** why this row cannot be staged, if it cannot */
  problems: string[];
  blocked: boolean;
}

export interface VerifyResult {
  master: string;
  rows: VerifiedRow[];
  newCount: number;
  updateCount: number;
  problemCount: number;
  /** set when the check could not run at all — a missing table, a missing column */
  fatal?: string;
  error?: string;
}

export interface StageResponse {
  batch: string;
  staged: number;
  skipped: number;
  errors: string[];
  error?: string;
}

export interface PendingBatch {
  batch: string;
  masterKey: string;
  masterLabel: string;
  tempTable: string;
  liveTable: string;
  rows: number;
  newRows: number;
  updateRows: number;
}

export interface PendingDetail {
  batch: string;
  master: { key: string; label: string; table: string; tempTable: string; columns: string[] };
  rows: Record<string, string>[];
  error?: string;
}

export interface GoLiveResponse {
  inserted: number;
  updated: number;
  failed: number;
  errors: string[];
  error?: string;
}
