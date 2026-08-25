// src/app/api/recipes/[menuItmID]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type Ctx = { params: { menuItmID: string } };

/**
 * GET /api/recipes/[menuItmID]?locCode=XX
 * Returns all recipe rows for the given menu item + location,
 * plus the full sub-unit list for the dropdowns.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const menuItmID = decodeURIComponent(params.menuItmID).trim();
    const locCode   = req.nextUrl.searchParams.get('locCode')?.trim() ?? '';

    // Fetch recipe rows for this service item + location
    const rows = await (prisma as any).tbl_Recipes.findMany({
      where: {
        MenuItmID: menuItmID,
        ...(locCode ? { LocCode: locCode } : {}),
      },
    });

    // Fetch item descriptions so the UI can auto-fill them
    const itemCodes = [...new Set(rows.map((r: any) => r.RowItemCode.trim()))] as string[];
    const itemMasters = itemCodes.length
      ? await (prisma as any).tbl_ItemMaster.findMany({
          where: { ItemCode: { in: itemCodes } },
          select: { ItemCode: true, ItemDes: true, MasterUnitID: true },
        })
      : [];

    const itemMap = new Map<string, { des: string; masterUnitID: string }>();
    for (const im of itemMasters) {
      itemMap.set(im.ItemCode.trim(), { des: im.ItemDes, masterUnitID: im.MasterUnitID.trim() });
    }

    // Fetch all active sub-units for dropdown
    const subUnits = await (prisma as any).tbl_UnitSub.findMany({
      where: { Enable: true },
      orderBy: { SubUnitID: 'asc' },
    });

    const formattedRows = rows.map((r: any) => {
      const info = itemMap.get(r.RowItemCode.trim());
      return {
        menuItmID:    r.MenuItmID.trim(),
        rowItemCode:  r.RowItemCode.trim(),
        rowItemDes:   info?.des ?? '',
        masterUnitID: r.MasterUnitID.trim(),
        subUnitID:    r.SubUnitID.trim(),
        qty:          r.Qty,
        locCode:      r.LocCode.trim(),
        itemCost:     r.ItemCost,
      };
    });

    return NextResponse.json({
      success: true,
      rows:    formattedRows,
      subUnits: subUnits.map((u: any) => ({ id: u.SubUnitID.trim(), des: u.SubUnitDes })),
    });
  } catch (err) {
    console.error('GET /api/recipes error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch recipes' }, { status: 500 });
  }
}

/**
 * PUT /api/recipes/[menuItmID]
 * Body: { locCode: string, rows: RecipeRow[] }
 * Performs a full replace (delete all existing rows for this item+loc, then insert fresh).
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const menuItmID = decodeURIComponent(params.menuItmID).trim();
    const b = await req.json() as { locCode: string; rows: Array<{
      rowItemCode:  string;
      masterUnitID: string;
      subUnitID:    string;
      qty:          number;
      itemCost:     number;
    }> };

    const locCode = b.locCode?.trim();
    if (!locCode) {
      return NextResponse.json({ success: false, message: 'locCode is required' }, { status: 400 });
    }

    // Validate each row has at minimum a rowItemCode
    const validRows = (b.rows ?? []).filter(r => r.rowItemCode?.trim());

    // Transaction: delete existing + create new
    await (prisma as any).$transaction([
      (prisma as any).tbl_Recipes.deleteMany({
        where: { MenuItmID: menuItmID, LocCode: locCode },
      }),
      ...(validRows.length
        ? [(prisma as any).tbl_Recipes.createMany({
            data: validRows.map(r => ({
              MenuItmID:    menuItmID,
              RowItemCode:  r.rowItemCode.trim().toUpperCase(),
              MasterUnitID: r.masterUnitID?.trim() || ' ',
              SubUnitID:    r.subUnitID?.trim()    || ' ',
              Qty:          Number(r.qty      ?? 0),
              LocCode:      locCode,
              ItemCost:     Number(r.itemCost ?? 0),
            })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    return NextResponse.json({ success: true, message: 'Recipe saved successfully' });
  } catch (err) {
    console.error('PUT /api/recipes error:', err);
    return NextResponse.json({ success: false, message: 'Failed to save recipe' }, { status: 500 });
  }
}