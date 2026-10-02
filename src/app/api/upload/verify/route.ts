// src/app/api/upload/verify/route.ts
// ────────────────────────────────────────────────────────────────────────────
// POST /api/upload/verify — check a loaded file against the live table.
//
// Called the moment a file is picked, not as a separate step the shop has to
// remember to press. The answer comes back AS A STREAM, one line of JSON per
// thing that is learned, so the grid on the screen fills in cell by cell while
// the check is still running.
//
//   {"t":"cell", ...}  one cell has been compared
//   {"t":"row",  ...}  one row is finished — new, or already in the database
//   {"t":"done", ...}  the file is finished, with the totals
//   {"t":"error",...}  the check could not run
//
// A caller that would rather have it all at once gets that too: send
// {"stream":false} and the same check comes back as one JSON object.
//
// Nothing here writes. The table name is never taken from the request — it is
// looked up from the master key, so this route cannot be pointed at a table it
// should not touch, and any column name the master does not have is dropped
// before a query is built.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/sessionGuard';
import { MASTERS } from '@/lib/uploadMasters';
import { checkRows, type CheckEvent } from '@/lib/uploadStaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 5000;

type Wire = CheckEvent | { t: 'error'; message: string };

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (!guard.ok) return guard.response;

  let body: { master?: string; stream?: boolean; rows?: { values?: Record<string, string> }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }

  const master = MASTERS.find((m) => m.key === body.master);
  if (!master) return NextResponse.json({ error: 'Unknown master.' }, { status: 400 });

  const incoming = Array.isArray(body.rows) ? body.rows : [];
  if (!incoming.length) {
    return NextResponse.json({ error: 'There are no rows in this file.' }, { status: 400 });
  }
  if (incoming.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `This file has ${incoming.length} rows. Please upload up to ${MAX_ROWS} at a time.` },
      { status: 400 },
    );
  }

  // Keep only the columns this master actually has, so a crafted name cannot
  // reach the query and a spreadsheet cannot smuggle one in either.
  const allowed = new Set(master.columns.map((c) => c.name.toLowerCase()));
  const rows = incoming.map((r) => {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (allowed.has(k.toLowerCase())) values[k] = String(v ?? '');
    }
    return { values };
  });

  if (body.stream === false) {
    try {
      const result = await checkRows(master, rows);
      if (result.fatal) return NextResponse.json({ error: result.fatal }, { status: 400 });
      return NextResponse.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Could not check this file: ${msg.split('\n')[0]}` }, { status: 500 });
    }
  }

  // ── the streaming answer ──
  // One JSON object per line, flushed as it is produced. A failure part way
  // through is sent as an `error` line rather than left as a truncated body,
  // so the screen can say what went wrong instead of hanging.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Wire) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(e) + '\n')); } catch { /* already closed */ }
      };
      try {
        const result = await checkRows(master, rows, (e) => { send(e); });
        if (result.fatal) send({ t: 'error', message: result.fatal });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ t: 'error', message: `Could not check this file: ${msg.split('\n')[0]}` });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no', // stop any proxy holding the answers back
    },
  });
}
