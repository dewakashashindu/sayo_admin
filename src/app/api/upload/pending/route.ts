// src/app/api/upload/pending/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/upload/pending — what is waiting in the Temp tables.
//
//   no batch  → every waiting batch, newest first, with its row counts
//   ?batch=ID → the rows of that one batch, ready to show
//
// Read only. Nothing here can move a row, and nothing here can reach the live
// table.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/sessionGuard';
import { pendingBatches, pendingRows } from '@/lib/uploadStaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (!guard.ok) return guard.response;

  const batch = new URL(req.url).searchParams.get('batch');

  try {
    if (batch) {
      const found = await pendingRows(batch);
      if (!found) {
        return NextResponse.json({ error: 'That batch is no longer waiting.' }, { status: 404 });
      }
      // Only this master's own columns plus the four staging ones — a Temp
      // table is created from the live table's shape, which may carry columns
      // the upload screen does not show.
      const keep = new Set([
        ...found.master.columns.map((c) => c.name),
        'UpBatch', 'UpFileRow', 'UpStatus', 'UpNote',
      ]);
      const rows = found.rows.map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          if (!keep.has(k)) continue;
          out[k] = v instanceof Date ? v.toISOString() : String(v ?? '');
        }
        return out;
      });
      return NextResponse.json({
        batch,
        master: {
          key: found.master.key,
          label: found.master.label,
          table: found.master.table,
          tempTable: found.master.tempTable,
          columns: found.master.columns.map((c) => c.name),
        },
        rows,
      });
    }

    return NextResponse.json({ batches: await pendingBatches() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Could not read the pending list: ${msg.split('\n')[0]}` }, { status: 500 });
  }
}
