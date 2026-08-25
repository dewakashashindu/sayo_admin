// app/api/admin/units/route.ts
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

type UnitType = 'master' | 'sub' | 'conversion';

function getType(req: NextRequest): UnitType | null {
  const type = req.nextUrl.searchParams.get('type');
  if (type === 'master' || type === 'sub' || type === 'conversion') return type;
  return null;
}

async function nextMasterUnitID(): Promise<string> {
  const all = await prisma.tbl_UnitMaster.findMany({ select: { MasterUnitID: true } });
  const nums = all
    .map((m) => parseInt(m.MasterUnitID.replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `UNT${String(next).padStart(2, '0')}`;
}

async function nextSubUnitID(): Promise<string> {
  const all = await prisma.tbl_UnitSub.findMany({ select: { SubUnitID: true } });
  const nums = all
    .map((s) => parseInt(s.SubUnitID.replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `S${String(next).padStart(2, '0')}`;
}

/* ══════════════════════════════════════════════════════════
   GET
   /api/admin/units?type=master
   /api/admin/units?type=master&masterUnitID=UNT01
   /api/admin/units?type=master&search=kg

   /api/admin/units?type=sub
   /api/admin/units?type=sub&subUnitID=S01
   /api/admin/units?type=sub&search=gram

   /api/admin/units?type=conversion
   /api/admin/units?type=conversion&masterUnitID=UNT01&subUnitID=S01
   /api/admin/units?type=conversion&search=kg
══════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const type = getType(req);
  if (!type) return err('Query param "type" must be one of: master, sub, conversion');

  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim();

  try {
    /* ───────── MASTER UNIT ───────── */
    if (type === 'master') {
      const masterUnitID = searchParams.get('masterUnitID');

      if (masterUnitID) {
        const found = await prisma.tbl_UnitMaster.findUnique({
          where: { MasterUnitID: masterUnitID },
        });
        if (!found) return err('Master unit not found', 404);
        return ok(found);
      }

      const list = await prisma.tbl_UnitMaster.findMany({
        where: search
          ? { OR: [{ MasterUnitID: { contains: search } }, { UnitDes: { contains: search } }] }
          : undefined,
        orderBy: { MasterUnitID: 'asc' },
      });
      return ok(list);
    }

    /* ───────── SUB UNIT ───────── */
    if (type === 'sub') {
      const subUnitID = searchParams.get('subUnitID');

      if (subUnitID) {
        const found = await prisma.tbl_UnitSub.findUnique({
          where: { SubUnitID: subUnitID },
        });
        if (!found) return err('Sub unit not found', 404);
        return ok(found);
      }

      const list = await prisma.tbl_UnitSub.findMany({
        where: search
          ? { OR: [{ SubUnitID: { contains: search } }, { SubUnitDes: { contains: search } }] }
          : undefined,
        orderBy: { SubUnitID: 'asc' },
      });
      return ok(list);
    }

    /* ───────── UNIT CONVERSION ───────── */
    if (type === 'conversion') {
      const masterUnitID = searchParams.get('masterUnitID');
      const subUnitID = searchParams.get('subUnitID');

      if (masterUnitID && subUnitID) {
        const found = await prisma.tbl_UnitConversion.findUnique({
          where: { MasterUnitID_SubUnitID: { MasterUnitID: masterUnitID, SubUnitID: subUnitID } },
        });
        if (!found) return err('Conversion not found', 404);
        return ok(found);
      }

      const list = await prisma.tbl_UnitConversion.findMany({
        orderBy: [{ MasterUnitID: 'asc' }, { SubUnitID: 'asc' }],
      });

      if (!search) return ok(list);

      const [masters, subs] = await Promise.all([
        prisma.tbl_UnitMaster.findMany({ select: { MasterUnitID: true, UnitDes: true } }),
        prisma.tbl_UnitSub.findMany({ select: { SubUnitID: true, SubUnitDes: true } }),
      ]);
      const masterMap = new Map(masters.map((m) => [m.MasterUnitID, m.UnitDes]));
      const subMap = new Map(subs.map((s) => [s.SubUnitID, s.SubUnitDes]));

      const s = search.toLowerCase();
      const filtered = list.filter((c) =>
        c.MasterUnitID.toLowerCase().includes(s) ||
        c.SubUnitID.toLowerCase().includes(s) ||
        (masterMap.get(c.MasterUnitID) ?? '').toLowerCase().includes(s) ||
        (subMap.get(c.SubUnitID) ?? '').toLowerCase().includes(s)
      );
      return ok(filtered);
    }

    return err('Invalid type');
  } catch (e) {
    console.error(`GET /units?type=${type} error:`, e);
    return err('Failed to fetch data', 500);
  }
}

/* ══════════════════════════════════════════════════════════
   POST
   /api/admin/units?type=master   Body: { unitDes, enable? }
   /api/admin/units?type=sub      Body: { subUnitDes, enable? }
   /api/admin/units?type=conversion  Body: { masterUnitID, subUnitID, noOfUnits, enable? }
══════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  const type = getType(req);
  if (!type) return err('Query param "type" must be one of: master, sub, conversion');

  try {
    const body = await req.json();

    /* ───────── MASTER UNIT ───────── */
    if (type === 'master') {
      const unitDes: string | undefined = body.unitDes?.trim();
      if (!unitDes) return err('unitDes (Unit Description) is required');
      if (unitDes.length > 50) return err('unitDes must be 50 characters or less');

      const enable: boolean = body.enable ?? true;

      const dup = await prisma.tbl_UnitMaster.findFirst({
        where: { UnitDes: { equals: unitDes.toUpperCase() } },
      });
      if (dup) return err(`Unit description "${unitDes}" already exists`);

      const masterUnitID = await nextMasterUnitID();
      const created = await prisma.tbl_UnitMaster.create({
        data: { MasterUnitID: masterUnitID, UnitDes: unitDes.toUpperCase(), Enable: enable },
      });
      return ok(created, 201);
    }

    /* ───────── SUB UNIT ───────── */
    if (type === 'sub') {
      const subUnitDes: string | undefined = body.subUnitDes?.trim();
      if (!subUnitDes) return err('subUnitDes (Sub Unit Description) is required');
      if (subUnitDes.length > 50) return err('subUnitDes must be 50 characters or less');

      const enable: boolean = body.enable ?? true;

      const dup = await prisma.tbl_UnitSub.findFirst({
        where: { SubUnitDes: { equals: subUnitDes.toUpperCase() } },
      });
      if (dup) return err(`Sub unit description "${subUnitDes}" already exists`);

      const subUnitID = await nextSubUnitID();
      const created = await prisma.tbl_UnitSub.create({
        data: { SubUnitID: subUnitID, SubUnitDes: subUnitDes.toUpperCase(), Enable: enable },
      });
      return ok(created, 201);
    }

    /* ───────── UNIT CONVERSION ───────── */
    if (type === 'conversion') {
      const masterUnitID: string | undefined = body.masterUnitID;
      const subUnitID: string | undefined = body.subUnitID;
      const noOfUnits: number = Number(body.noOfUnits);
      const enable: boolean = body.enable ?? true;

      if (!masterUnitID || !subUnitID) return err('masterUnitID and subUnitID are required');
      if (!noOfUnits || noOfUnits <= 0) return err('noOfUnits must be greater than 0');

      const [masterExists, subExists] = await Promise.all([
        prisma.tbl_UnitMaster.findUnique({ where: { MasterUnitID: masterUnitID } }),
        prisma.tbl_UnitSub.findUnique({ where: { SubUnitID: subUnitID } }),
      ]);
      if (!masterExists) return err('Selected Master Unit does not exist');
      if (!subExists) return err('Selected Sub Unit does not exist');

      const dup = await prisma.tbl_UnitConversion.findUnique({
        where: { MasterUnitID_SubUnitID: { MasterUnitID: masterUnitID, SubUnitID: subUnitID } },
      });
      if (dup) return err('This Master Unit → Sub Unit combination already exists');

      const created = await prisma.tbl_UnitConversion.create({
        data: { MasterUnitID: masterUnitID, SubUnitID: subUnitID, NoOfUnits: noOfUnits, Enable: enable },
      });
      return ok(created, 201);
    }

    return err('Invalid type');
  } catch (e) {
    console.error(`POST /units?type=${type} error:`, e);
    return err('Failed to create record', 500);
  }
}

/* ══════════════════════════════════════════════════════════
   PUT
   /api/admin/units?type=master      Body: { masterUnitID, unitDes, enable? }
   /api/admin/units?type=sub         Body: { subUnitID, subUnitDes, enable? }
   /api/admin/units?type=conversion  Body: { currentMasterUnitID, currentSubUnitID, masterUnitID, subUnitID, noOfUnits, enable? }
══════════════════════════════════════════════════════════ */
export async function PUT(req: NextRequest) {
  const type = getType(req);
  if (!type) return err('Query param "type" must be one of: master, sub, conversion');

  try {
    const body = await req.json();

    /* ───────── MASTER UNIT ───────── */
    if (type === 'master') {
      const masterUnitID: string | undefined = body.masterUnitID;
      const unitDes: string | undefined = body.unitDes?.trim();

      if (!masterUnitID) return err('masterUnitID is required');
      if (!unitDes) return err('unitDes (Unit Description) is required');
      if (unitDes.length > 50) return err('unitDes must be 50 characters or less');

      const existing = await prisma.tbl_UnitMaster.findUnique({ where: { MasterUnitID: masterUnitID } });
      if (!existing) return err('Master unit not found', 404);

      const dup = await prisma.tbl_UnitMaster.findFirst({
        where: { UnitDes: { equals: unitDes.toUpperCase() }, MasterUnitID: { not: masterUnitID } },
      });
      if (dup) return err(`Unit description "${unitDes}" already exists`);

      const enable: boolean = body.enable ?? existing.Enable;
      const updated = await prisma.tbl_UnitMaster.update({
        where: { MasterUnitID: masterUnitID },
        data: { UnitDes: unitDes.toUpperCase(), Enable: enable },
      });
      return ok(updated);
    }

    /* ───────── SUB UNIT ───────── */
    if (type === 'sub') {
      const subUnitID: string | undefined = body.subUnitID;
      const subUnitDes: string | undefined = body.subUnitDes?.trim();

      if (!subUnitID) return err('subUnitID is required');
      if (!subUnitDes) return err('subUnitDes (Sub Unit Description) is required');
      if (subUnitDes.length > 50) return err('subUnitDes must be 50 characters or less');

      const existing = await prisma.tbl_UnitSub.findUnique({ where: { SubUnitID: subUnitID } });
      if (!existing) return err('Sub unit not found', 404);

      const dup = await prisma.tbl_UnitSub.findFirst({
        where: { SubUnitDes: { equals: subUnitDes.toUpperCase() }, SubUnitID: { not: subUnitID } },
      });
      if (dup) return err(`Sub unit description "${subUnitDes}" already exists`);

      const enable: boolean = body.enable ?? existing.Enable;
      const updated = await prisma.tbl_UnitSub.update({
        where: { SubUnitID: subUnitID },
        data: { SubUnitDes: subUnitDes.toUpperCase(), Enable: enable },
      });
      return ok(updated);
    }

    /* ───────── UNIT CONVERSION ───────── */
    if (type === 'conversion') {
      const currentMasterUnitID: string | undefined = body.currentMasterUnitID;
      const currentSubUnitID: string | undefined = body.currentSubUnitID;
      const masterUnitID: string | undefined = body.masterUnitID;
      const subUnitID: string | undefined = body.subUnitID;
      const noOfUnits: number = Number(body.noOfUnits);

      if (!currentMasterUnitID || !currentSubUnitID) {
        return err('currentMasterUnitID and currentSubUnitID are required to locate the record');
      }
      if (!masterUnitID || !subUnitID) return err('masterUnitID and subUnitID are required');
      if (!noOfUnits || noOfUnits <= 0) return err('noOfUnits must be greater than 0');

      const existing = await prisma.tbl_UnitConversion.findUnique({
        where: {
          MasterUnitID_SubUnitID: { MasterUnitID: currentMasterUnitID, SubUnitID: currentSubUnitID },
        },
      });
      if (!existing) return err('Conversion not found', 404);

      const [masterExists, subExists] = await Promise.all([
        prisma.tbl_UnitMaster.findUnique({ where: { MasterUnitID: masterUnitID } }),
        prisma.tbl_UnitSub.findUnique({ where: { SubUnitID: subUnitID } }),
      ]);
      if (!masterExists) return err('Selected Master Unit does not exist');
      if (!subExists) return err('Selected Sub Unit does not exist');

      const enable: boolean = body.enable ?? existing.Enable;
      const keyChanged = masterUnitID !== currentMasterUnitID || subUnitID !== currentSubUnitID;

      if (keyChanged) {
        const dup = await prisma.tbl_UnitConversion.findUnique({
          where: { MasterUnitID_SubUnitID: { MasterUnitID: masterUnitID, SubUnitID: subUnitID } },
        });
        if (dup) return err('This Master Unit → Sub Unit combination already exists');

        const [, created] = await prisma.$transaction([
          prisma.tbl_UnitConversion.delete({
            where: {
              MasterUnitID_SubUnitID: { MasterUnitID: currentMasterUnitID, SubUnitID: currentSubUnitID },
            },
          }),
          prisma.tbl_UnitConversion.create({
            data: { MasterUnitID: masterUnitID, SubUnitID: subUnitID, NoOfUnits: noOfUnits, Enable: enable },
          }),
        ]);
        return ok(created);
      }

      const updated = await prisma.tbl_UnitConversion.update({
        where: { MasterUnitID_SubUnitID: { MasterUnitID: masterUnitID, SubUnitID: subUnitID } },
        data: { NoOfUnits: noOfUnits, Enable: enable },
      });
      return ok(updated);
    }

    return err('Invalid type');
  } catch (e) {
    console.error(`PUT /units?type=${type} error:`, e);
    return err('Failed to update record', 500);
  }
}

/* ══════════════════════════════════════════════════════════
   DELETE
   /api/admin/units?type=master&masterUnitID=UNT01
   /api/admin/units?type=sub&subUnitID=S01
   /api/admin/units?type=conversion&masterUnitID=UNT01&subUnitID=S01
══════════════════════════════════════════════════════════ */
export async function DELETE(req: NextRequest) {
  const type = getType(req);
  if (!type) return err('Query param "type" must be one of: master, sub, conversion');

  const { searchParams } = req.nextUrl;

  try {
    /* ───────── MASTER UNIT ───────── */
    if (type === 'master') {
      const masterUnitID = searchParams.get('masterUnitID');
      if (!masterUnitID) return err('masterUnitID query param is required');

      const existing = await prisma.tbl_UnitMaster.findUnique({ where: { MasterUnitID: masterUnitID } });
      if (!existing) return err('Master unit not found', 404);

      const usedInConv = await prisma.tbl_UnitConversion.findFirst({ where: { MasterUnitID: masterUnitID } });
      if (usedInConv) {
        return err(
          `Cannot delete "${existing.UnitDes}" — it is used in one or more unit conversions. Delete those conversions first.`,
          409,
        );
      }

      await prisma.tbl_UnitMaster.delete({ where: { MasterUnitID: masterUnitID } });
      return ok({ deleted: existing });
    }

    /* ───────── SUB UNIT ───────── */
    if (type === 'sub') {
      const subUnitID = searchParams.get('subUnitID');
      if (!subUnitID) return err('subUnitID query param is required');

      const existing = await prisma.tbl_UnitSub.findUnique({ where: { SubUnitID: subUnitID } });
      if (!existing) return err('Sub unit not found', 404);

      const usedInConv = await prisma.tbl_UnitConversion.findFirst({ where: { SubUnitID: subUnitID } });
      if (usedInConv) {
        return err(
          `Cannot delete "${existing.SubUnitDes}" — it is used in one or more unit conversions. Delete those conversions first.`,
          409,
        );
      }

      await prisma.tbl_UnitSub.delete({ where: { SubUnitID: subUnitID } });
      return ok({ deleted: existing });
    }

    /* ───────── UNIT CONVERSION ───────── */
    if (type === 'conversion') {
      const masterUnitID = searchParams.get('masterUnitID');
      const subUnitID = searchParams.get('subUnitID');
      if (!masterUnitID || !subUnitID) {
        return err('masterUnitID and subUnitID query params are required');
      }

      const existing = await prisma.tbl_UnitConversion.findUnique({
        where: { MasterUnitID_SubUnitID: { MasterUnitID: masterUnitID, SubUnitID: subUnitID } },
      });
      if (!existing) return err('Conversion not found', 404);

      await prisma.tbl_UnitConversion.delete({
        where: { MasterUnitID_SubUnitID: { MasterUnitID: masterUnitID, SubUnitID: subUnitID } },
      });
      return ok({ deleted: existing });
    }

    return err('Invalid type');
  } catch (e) {
    console.error(`DELETE /units?type=${type} error:`, e);
    return err('Failed to delete record', 500);
  }
}