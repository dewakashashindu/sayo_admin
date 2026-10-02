// src/app/api/upload/stage/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload/stage — park a verified batch in the Temp table.
//
// The screen only calls this once VERIFY has come back clean and the shop has
// answered the "this already exists" question for every row that hit one. The
// batch is not an input from the browser: the rows are re-read from the
// verification this request names, so what lands in the Temp table is always
// something the database has already been asked about.
//
// A fresh batch id is minted here, and it is what the Pending tab and
// "Go to Live" both work from.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/sessionGuard';
import { MASTERS } from '@/lib/uploadMasters';
import { stageRows, newBatchId } from '@/lib/uploadStaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 5000;

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (!guard.ok) return guard.response;

  let body: { master?: string; rows?: { values?: Record<string, string> }[]; statuses?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }

  const master = MASTERS.find((m) => m.key === body.master);
  if (!master) return NextResponse.json({ error: 'Unknown master.' }, { status: 400 });

  const incoming = Array.isArray(body.rows) ? body.rows : [];
  if (!incoming.length) return NextResponse.json({ error: 'There is nothing to save.' }, { status: 400 });
  if (incoming.length > MAX_ROWS) {
    return NextResponse.json({ error: `Please upload up to ${MAX_ROWS} rows at a time.` }, { status: 400 });
  }

  const allowed = new Set(master.columns.map((c) => c.name.toLowerCase()));
  const rows = incoming.map((r, i) => {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (allowed.has(k.toLowerCase())) values[k] = String(v ?? '');
    }
    const status = body.statuses?.[i] === 'update' ? 'update' : 'new';
    const changes = Object.keys(values).length;
    return {
      fileRow: i + 1,
      status: status as 'new' | 'update',
      values,
      note: status === 'update' ? 'Shop chose to update the existing row' : 'New record',
      changes,
    };
  });

  try {
    const batch = newBatchId();
    const outcome = await stageRows(master, batch, rows.map((r) => ({
      fileRow: r.fileRow, status: r.status, values: r.values, note: r.note,
    })));

    if (!outcome.staged) {
      return NextResponse.json(
        { error: outcome.errors[0] ?? 'Nothing could be saved.', errors: outcome.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({
      batch,
      staged: outcome.staged,
      skipped: outcome.skipped,
      errors: outcome.errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Could not save this batch: ${msg.split('\n')[0]}` }, { status: 500 });
  }
}
