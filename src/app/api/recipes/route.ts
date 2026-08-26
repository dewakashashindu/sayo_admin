//E:\sayo_admin\sayo-admin\src\app\api\recipes\route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/* ── GET: Fetch all recipes + Master lookup data ── */
export async function GET() {
  try {
    const [recipes, menuItems, rawItems, units, subUnits, locations] = await Promise.all([
      prisma.tbl_Recipes.findMany(),

      // ✅ Service items only (Menu items - for recipe header)
      prisma.tbl_ItemMaster.findMany({
        where: { ServiceItem: true, Enable: true },
        select: { ItemCode: true, ItemDes: true },
      }),

      // ✅ FIX: ALL enabled items (removed ServiceItem: false filter)
      // Service items වලටත් ingredients add කරන්න ඕනෙ නිසා
      prisma.tbl_ItemMaster.findMany({
        where: { Enable: true },
        select: {
          ItemCode:     true,
          ItemDes:      true,
          MasterUnitID: true,
          RawCost:      true,
        },
      }),

      prisma.tbl_UnitMaster.findMany({ where: { Enable: true } }),
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

    return NextResponse.json({
      success: true,
      recipes: formattedRecipes,

      menuItems: menuItems.map(m => ({
        code: m.ItemCode.trim(),
        des:  m.ItemDes,
      })),

      // ✅ FIX: All enabled items returned as rawItems
      rawItems: rawItems.map(r => ({
        code: r.ItemCode.trim(),
        des:  r.ItemDes,
        unit: r.MasterUnitID.trim(),
        cost: r.RawCost,
      })),

      units: units.map(u => ({
        id:  u.MasterUnitID.trim(),
        des: u.UnitDes,
      })),

      subUnits: subUnits.map(s => ({
        id:  s.SubUnitID.trim(),
        des: s.SubUnitDes,
      })),

      locations: locations.map(l => ({
        code: l.LocCode.trim(),
        name: l.LocDes,
      })),
    });
  } catch (err) {
    console.error('GET /api/recipes error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch recipes data' },
      { status: 500 }
    );
  }
}

/* ── POST: Save / Upsert recipe for a MenuItmID ── */
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

    // ✅ Group lines by locCode so we delete+insert per location
    const byLoc = new Map<string, typeof lines>();
    for (const l of lines) {
      const lc = l.locCode?.trim() || '01';
      if (!byLoc.has(lc)) byLoc.set(lc, []);
      byLoc.get(lc)!.push(l);
    }

    // ✅ For each location: delete existing rows then insert fresh
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

    return NextResponse.json({
      success: true,
      message: 'Recipe saved successfully',
    });
  } catch (err) {
    console.error('POST /api/recipes error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to save recipe' },
      { status: 500 }
    );
  }
}