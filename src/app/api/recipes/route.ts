// E:\sayo_admin\sayo-admin\src\app\api\recipes\route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET() {
  try {
    const [recipes, allItems, subUnits, locations] = await Promise.all([
      prisma.tbl_Recipes.findMany(),
      prisma.tbl_ItemMaster.findMany({
        where: { Enable: true },
        select: {
          ItemCode:         true,
          ItemDes:          true,
          MasterUnitID:     true,
          RawCost:          true,
          ServiceItem:      true,
          SemiFinishedProd: true,
        },
      }),
      prisma.tbl_UnitSub.findMany({ where: { Enable: true } }),
      prisma.tbl_LocationMaster.findMany({ where: { Enable: true } }),
    ]);

    const formattedRecipes = recipes.map((r, i) => ({
      id:           i + 1,
      menuItmID:    r.MenuItmID.trim(),
      rowItemCode:  r.RowItemCode.trim(),
      masterUnitID: r.MasterUnitID.trim(),
      subUnitID:    r.SubUnitID.trim(),
      qty:          r.Qty,
      locCode:      r.LocCode.trim(),
      itemCost:     r.ItemCost,
    }));

    // ✅ Raw items for recipe ingredients = NOT service items
    // Service items can add semi-finished + raw items as ingredients
    // Semi-finished can add raw items only
    const rawItems = allItems
      .filter(r => !r.ServiceItem) // exclude service items from ingredient list
      .map(r => ({
        code:             r.ItemCode.trim(),
        des:              r.ItemDes,
        unit:             r.MasterUnitID.trim(),
        cost:             r.RawCost,
        isSemiFinished:   r.SemiFinishedProd,
      }));

    return NextResponse.json({
      success:  true,
      recipes:  formattedRecipes,
      rawItems,
      subUnits: subUnits.map(s => ({ id: s.SubUnitID.trim(), des: s.SubUnitDes })),
      locations: locations.map(l => ({ code: l.LocCode.trim(), name: l.LocDes })),
    });
  } catch (err) {
    console.error('GET /api/recipes error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch recipes data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { menuItmID, lines } = body;

    if (!menuItmID?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Menu Item ID is required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { success: false, message: 'At least one ingredient line is required' },
        { status: 400 }
      );
    }

    const trimmedMenuID = menuItmID.trim();

    const byLoc = new Map<string, typeof lines>();
    for (const l of lines) {
      const lc = l.locCode?.trim() || '01';
      if (!byLoc.has(lc)) byLoc.set(lc, []);
      byLoc.get(lc)!.push(l);
    }

    for (const [lc, locLines] of byLoc.entries()) {
      await prisma.$transaction([
        prisma.tbl_Recipes.deleteMany({
          where: { MenuItmID: trimmedMenuID, LocCode: lc },
        }),
        prisma.tbl_Recipes.createMany({
          data: locLines.map((l: {
            rowItemCode:  string;
            masterUnitID?: string;
            subUnitID?:    string;
            qty?:          number;
            locCode?:      string;
            itemCost?:     number;
          }) => ({
            MenuItmID:    trimmedMenuID,
            RowItemCode:  l.rowItemCode.trim().toUpperCase(),
            MasterUnitID: l.masterUnitID?.trim() || ' ',
            SubUnitID:    l.subUnitID?.trim()    || ' ',
            Qty:          Number(l.qty      ?? 0),
            LocCode:      lc,
            ItemCost:     Number(l.itemCost ?? 0),
          })),
        }),
      ]);
    }

    return NextResponse.json({ success: true, message: 'Recipe saved successfully' });
  } catch (err) {
    console.error('POST /api/recipes error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to save recipe' },
      { status: 500 }
    );
  }
}