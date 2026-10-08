// src/app/api/recipes/[menuItmID]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;


type Ctx = { params: Promise<{ menuItmID: string }> };

/**
 * GET /api/recipes/[menuItmID]?locCode=XX
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const resolvedParams = await params;
    const menuItmID = decodeURIComponent(resolvedParams.menuItmID).trim();
    const locCode   = req.nextUrl.searchParams.get('locCode')?.trim() ?? '';

    const rows0 = await prisma.tbl_Recipes.findMany({
      where: {
        MenuItmID: menuItmID,
        ...(locCode ? { LocCode: locCode } : {}),
      },
    });

    /* A recipe is the service's material definition; branches share it unless
       they keep their own override. When the requested branch has no rows of
       its own (the screenshot case: booking at LOCO0000001, recipe stored for
       LOC07), fall back to the fullest recipe stored for this service so the
       technician still sees the real ingredients instead of an empty sample. */
    let rows = rows0;
    if (locCode && rows0.length === 0) {
      const all = await prisma.tbl_Recipes.findMany({
        where: { MenuItmID: menuItmID },
      });
      const groups = new Map<string, typeof all>();
      for (const r of all as any[]) {
        const k = String(r.LocCode ?? '').trim();
        const g = groups.get(k) ?? [];
        g.push(r);
        groups.set(k, g);
      }
      rows = [...groups.values()].sort(
        (a, b) => b.length - a.length || String(a[0].LocCode).localeCompare(String(b[0].LocCode)),
      )[0] ?? [];
    }

    const itemCodes = [
      ...new Set(rows.map((r: any) => r.RowItemCode.trim())),
    ] as string[];

    
    const itemMasters = itemCodes.length
      ? await prisma.tbl_ItemMaster.findMany({
          where: { ItemCode: { in: itemCodes } },
          select: {
            ItemCode:     true,
            ItemDes:      true,
            MasterUnitID: true,
          },
        })
      : [];

    const itemMap = new Map<string, { des: string; masterUnitID: string }>();
    for (const im of itemMasters) {
      itemMap.set(im.ItemCode.trim(), {
        des:          im.ItemDes,
        masterUnitID: im.MasterUnitID.trim(),
      });
    }

    const subUnits = await prisma.tbl_UnitSub.findMany({
      where:   { Enable: true },
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
      success:  true,
      rows:     formattedRows,
      subUnits: subUnits.map((u: any) => ({
        id:  u.SubUnitID.trim(),
        des: u.SubUnitDes,
      })),
    });
  } catch (err) {
    console.error('GET /api/recipes/[menuItmID] error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch recipes' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/recipes/[menuItmID]
 * Body: { locCode: string, rows: RecipeRow[] }
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const resolvedParams = await params;
    const menuItmID = decodeURIComponent(resolvedParams.menuItmID).trim();
    const b = await req.json() as {
      locCode: string;
      rows: Array<{
        rowItemCode:  string;
        masterUnitID: string;
        subUnitID:    string;
        qty:          number;
        itemCost:     number;
      }>;
    };

    const locCode = b.locCode?.trim();
    if (!locCode) {
      return NextResponse.json(
        { success: false, message: 'locCode is required' },
        { status: 400 }
      );
    }

    const validRows = (b.rows ?? []).filter(r => r.rowItemCode?.trim());

    await prisma.$transaction([
      prisma.tbl_Recipes.deleteMany({
        where: { MenuItmID: menuItmID, LocCode: locCode },
      }),
      ...(validRows.length
        ? [prisma.tbl_Recipes.createMany({
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

    return NextResponse.json({
      success: true,
      message: 'Recipe saved successfully',
    });
  } catch (err) {
    console.error('PUT /api/recipes/[menuItmID] error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to save recipe' },
      { status: 500 }
    );
  }
}