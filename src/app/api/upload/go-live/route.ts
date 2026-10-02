// src/app/api/upload/go-live/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload/go-live — the one write path into a real master table.
//
// This is the only place an uploaded row reaches tbl_itemmaster or any other
// master. It takes a batch id, moves every row waiting under it, and is the
// same upsert the Item Master screen does: a row whose key is already in the
// table is updated, a row whose key is not there is inserted.
//
// Two deliberate properties:
//   · the batch is only cleared from the Temp table once every row landed, so a
//     failure can be pressed again rather than being lost
//   · the batch id is the only input — which table gets written is decided by
//     looking the id up, never by the request
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/sessionGuard';
import { goLive, discardBatch } from '@/lib/uploadStaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (!guard.ok) return guard.response;

  let body: { batch?: string; discard?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }

  const batch = String(body.batch ?? '').trim();
  if (!batch) return NextResponse.json({ error: 'No batch was named.' }, { status: 400 });

  try {
    // Throwing the batch away is the "no, leave the database alone" answer and
    // also needs the live-write permission, so a read-only profile cannot use
    // this route to remove rows from the pending list either.
    if (body.discard) {
      const gone = await discardBatch(batch);
      if (!gone) return NextResponse.json({ error: 'That batch is no longer waiting.' }, { status: 404 });
      return NextResponse.json({ discarded: true });
    }

    const outcome = await goLive(batch);
    if (!outcome.inserted && !outcome.updated && !outcome.errors.length) {
      return NextResponse.json({ error: 'That batch is no longer waiting.' }, { status: 404 });
    }
    return NextResponse.json(outcome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Could not move this batch live: ${msg.split('\n')[0]}` }, { status: 500 });
  }
}
