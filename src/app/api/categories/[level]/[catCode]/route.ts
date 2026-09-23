import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { newRobustPrisma } from "@/lib/prismaRobust";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || newRobustPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ level: string; catCode: string }> };

function getModel(level: string) {
  switch (level) {
    case '1': return prisma.tbl_ItemCategory1;
    case '2': return prisma.tbl_ItemCategory2;
    case '3': return prisma.tbl_ItemCategory3;
    case '4': return prisma.tbl_ItemCategory4;
    default:  return prisma.tbl_ItemCategory1;
  }
}

/* PUT — update */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    
    const resolvedParams = await params;
    const catCode = decodeURIComponent(resolvedParams.catCode).trim();
    const model   = getModel(resolvedParams.level);
    const b       = await req.json();

    if (!b.catDes?.trim())
      return NextResponse.json({ success: false, message: 'Description is required' }, { status: 400 });

    const updated = await (model as typeof prisma.tbl_ItemCategory1).update({
      where: { CatCode: catCode },
      data:  { CatDes: b.catDes.trim(), Enable: Boolean(b.enable ?? true) },
    });

    return NextResponse.json({
      success: true,
      data: { catCode: updated.CatCode.trim(), catDes: updated.CatDes, enable: updated.Enable },
    });
  } catch (err) {
    console.error('PUT /api/categories error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update category' }, { status: 500 });
  }
}

/* DELETE — blocked while any item still uses the category */
export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    
    const resolvedParams = await params;
    const catCode = decodeURIComponent(resolvedParams.catCode).trim();
    const model   = getModel(resolvedParams.level);
    const levelNum = ['1', '2', '3', '4'].includes(resolvedParams.level) ? resolvedParams.level : '1';

    const usageWhere = { [`Category${levelNum}`]: catCode } as unknown as Prisma.Tbl_ItemMasterWhereInput;
    const used = await prisma.tbl_ItemMaster.count({ where: usageWhere });
    if (used > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `"${catCode}" is used by ${used} item(s) in the Item Master — it cannot be deleted.`,
        },
        { status: 409 },
      );
    }

    await (model as typeof prisma.tbl_ItemCategory1).delete({ where: { CatCode: catCode } });
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/categories error:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete category' }, { status: 500 });
  }
}