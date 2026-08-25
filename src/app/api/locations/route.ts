// app/api/admin/locations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

async function nextLocCode(): Promise<string> {
  const all = await prisma.tbl_LocationMaster.findMany({
    select: { LocCode: true },
  });
  const nums = all
    .map((l) => parseInt(l.LocCode.replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `LOC${String(next).padStart(2, '0')}`;
}

/* ─────────────────────────────────────────
   GET  /api/admin/locations
   GET  /api/admin/locations?locCode=LOC01
   GET  /api/admin/locations?search=kandy
───────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const locCode = searchParams.get('locCode');
    const search  = searchParams.get('search')?.trim();

    /* single record */
    if (locCode) {
      const found = await prisma.tbl_LocationMaster.findUnique({
        where: { LocCode: locCode },
      });
      if (!found) return err('Location not found', 404);
      return ok(found);
    }

    /* list with optional search */
    const list = await prisma.tbl_LocationMaster.findMany({
      where: search
        ? {
            OR: [
              { LocCode: { contains: search } },
              { LocDes:  { contains: search } },
              { Address: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { LocCode: 'asc' },
    });

    return ok(list);
  } catch (e) {
    console.error('GET /locations error:', e);
    return err('Failed to fetch locations', 500);
  }
}

/* ─────────────────────────────────────────
   POST  /api/admin/locations
   Body: { locDes, address?, enable? }
   → auto-generates LocCode
───────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const locDes: string | undefined = body.locDes?.trim();

    if (!locDes) return err('locDes (Location Description) is required');
    if (locDes.length > 50) return err('locDes must be 50 characters or less');

    const address: string = (body.address?.trim() || ' ').slice(0, 300);
    const enable: boolean = body.enable ?? true;

    /* duplicate description check */
    const dup = await prisma.tbl_LocationMaster.findFirst({
      where: { LocDes: { equals: locDes.toUpperCase() } },
    });
    if (dup) return err(`Location description "${locDes}" already exists`);

    const locCode = await nextLocCode();

    const created = await prisma.tbl_LocationMaster.create({
      data: {
        LocCode: locCode,
        LocDes:  locDes.toUpperCase(),
        Address: address,
        Enable:  enable,
      },
    });

    return ok(created, 201);
  } catch (e) {
    console.error('POST /locations error:', e);
    return err('Failed to create location', 500);
  }
}

/* ─────────────────────────────────────────
   PUT  /api/admin/locations
   Body: { locCode, locDes, address?, enable? }
───────────────────────────────────────── */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const locCode: string | undefined = body.locCode;
    const locDes:  string | undefined = body.locDes?.trim();

    if (!locCode) return err('locCode is required');
    if (!locDes)  return err('locDes (Location Description) is required');
    if (locDes.length > 50) return err('locDes must be 50 characters or less');

    const existing = await prisma.tbl_LocationMaster.findUnique({
      where: { LocCode: locCode },
    });
    if (!existing) return err('Location not found', 404);

    /* duplicate description check (exclude self) */
    const dup = await prisma.tbl_LocationMaster.findFirst({
      where: {
        LocDes:  { equals: locDes.toUpperCase() },
        LocCode: { not: locCode },
      },
    });
    if (dup) return err(`Location description "${locDes}" already exists`);

    const address: string = (body.address?.trim() || existing.Address).slice(0, 300);
    const enable: boolean = body.enable ?? existing.Enable;

    const updated = await prisma.tbl_LocationMaster.update({
      where: { LocCode: locCode },
      data: {
        LocDes:  locDes.toUpperCase(),
        Address: address,
        Enable:  enable,
      },
    });

    return ok(updated);
  } catch (e) {
    console.error('PUT /locations error:', e);
    return err('Failed to update location', 500);
  }
}

/* ─────────────────────────────────────────
   DELETE  /api/admin/locations?locCode=LOC01
───────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  try {
    const locCode = req.nextUrl.searchParams.get('locCode');
    if (!locCode) return err('locCode query param is required');

    const existing = await prisma.tbl_LocationMaster.findUnique({
      where: { LocCode: locCode },
    });
    if (!existing) return err('Location not found', 404);

    await prisma.tbl_LocationMaster.delete({ where: { LocCode: locCode } });

    return ok({ deleted: existing });
  } catch (e) {
    console.error('DELETE /locations error:', e);
    return err('Failed to delete location', 500);
  }
}