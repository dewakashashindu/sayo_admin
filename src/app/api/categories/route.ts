import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type CatLevel = '1' | '2' | '3' | '4';

async function getModel(level: CatLevel) {
  switch (level) {
    case '1': return prisma.tbl_ItemCategory1;
    case '2': return prisma.tbl_ItemCategory2;
    case '3': return prisma.tbl_ItemCategory3;
    case '4': return prisma.tbl_ItemCategory4;
  }
}

/* GET /api/categories?level=1 */
export async function GET(req: NextRequest) {
  try {
    const level = (req.nextUrl.searchParams.get('level') ?? '1') as CatLevel;
    const model = await getModel(level);
    const rows  = await (model as typeof prisma.tbl_ItemCategory1).findMany({
      orderBy: { CatCode: 'asc' },
    });
    return NextResponse.json({
      success: true,
      data: rows.map(r => ({
        catCode: r.CatCode.trim(),
        catDes:  r.CatDes,
        enable:  r.Enable,
      })),
    });
  } catch (err) {
    console.error('GET /api/categories error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch categories' }, { status: 500 });
  }
}

/* POST /api/categories  — create */
export async function POST(req: NextRequest) {
  try {
    const b     = await req.json();
    const level = (b.level ?? '1') as CatLevel;

    if (!b.catCode?.trim()) return NextResponse.json({ success: false, message: 'Category Code is required' }, { status: 400 });
    if (!b.catDes?.trim())  return NextResponse.json({ success: false, message: 'Category Description is required' }, { status: 400 });

    const model   = await getModel(level);
    const catCode = b.catCode.trim().toUpperCase();

    const exists = await (model as typeof prisma.tbl_ItemCategory1).findUnique({ where: { CatCode: catCode } });
    if (exists) return NextResponse.json({ success: false, message: `Code "${catCode}" already exists` }, { status: 409 });

    const created = await (model as typeof prisma.tbl_ItemCategory1).create({
      data: { CatCode: catCode, CatDes: b.catDes.trim(), Enable: Boolean(b.enable ?? true) },
    });

    return NextResponse.json({
      success: true,
      data: { catCode: created.CatCode.trim(), catDes: created.CatDes, enable: created.Enable },
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/categories error:', err);
    return NextResponse.json({ success: false, message: 'Failed to create category' }, { status: 500 });
  }
}