// E:\sayo_admin\sayo-admin\src\app\api\services\[locCode]\[itemCode]\route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ locCode: string; itemCode: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const resolvedParams = await params;
    const locCode  = decodeURIComponent(resolvedParams.locCode).trim();
    const itemCode = decodeURIComponent(resolvedParams.itemCode).trim();
    const b        = await req.json();

    if (!b.itemDes?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Item Description is required' },
        { status: 400 }
      );
    }

    let picBuffer: Buffer | null | undefined = undefined;
    if (b.itemPic !== undefined) {
      if (b.itemPic && typeof b.itemPic === 'string' && b.itemPic.startsWith('data:image')) {
        picBuffer = Buffer.from(b.itemPic.split(',')[1], 'base64');
      } else {
        picBuffer = null;
      }
    }

    await prisma.tbl_ItemMaster.update({
      where: { LocCode_ItemCode: { LocCode: locCode, ItemCode: itemCode } },
      data: {
        ServiceItem:      Boolean(b.serviceItem),
        ItemDes:          b.itemDes.trim(),
        ItemPrintDes:     b.itemPrintDes?.trim()  || ' ',
        MasterUnitID:     b.masterUnitID?.trim()  || 'UNT03',
        Category1:        b.category1?.trim()     || ' ',
        Category2:        b.category2?.trim()     || ' ',
        Category3:        b.category3?.trim()     || ' ',
        Category4:        b.category4?.trim()     || ' ',
        SupID:            b.supID?.trim()         || '0',
        ROL:              Number(b.rol      ?? 0),
        ROQ:              Number(b.roq      ?? 0),
        MinQty:           Number(b.minQty   ?? 0),
        MaxQty:           Number(b.maxQty   ?? 0),
        RawCost:          Number(b.rawCost  ?? 0),
        CostMarkup:       Number(b.costMarkup  ?? 0),
        OverallCost:      Number(b.rawCost ?? 0) * (1 + Number(b.costMarkup ?? 0) / 100),
        SalesMargin:      Number(b.salesMargin ?? 0),
        ExpiryItem:       Boolean(b.expiryItem),
        Retailprice:      Number(b.retailPrice ?? 0),
        WSApp:            Boolean(b.wsApp),
        WSQty:            Number(b.wsQty    ?? 0),
        WSPrice:          Number(b.wsPrice  ?? 0),
        PackedItem:       Boolean(b.packedItem),
        PackSize:         Number(b.packSize  ?? 0),
        PackPrice:        Number(b.packPrice ?? 0),
        SemiFinishedProd: Boolean(b.semiFinishedProd),
        ...(picBuffer !== undefined ? { ItemPic: picBuffer } : {}),
        UpdBy:            b.updBy?.trim() || 'ADMIN',
        Enable:           Boolean(b.enable ?? true),
      },
    });

    // Update location details (enable, salesMargin, retailPrice, wsPrice only - NOT stockBalance)
    if (Array.isArray(b.locationDetails)) {
      for (const ld of b.locationDetails) {
        const ldLocCode = ld.locCode?.trim();
        if (!ldLocCode) continue;

        const rowExists = await prisma.tbl_ItemMaster.findUnique({
          where: { LocCode_ItemCode: { LocCode: ldLocCode, ItemCode: itemCode } },
        });
        if (!rowExists) continue;

        await prisma.tbl_ItemMaster.update({
          where: { LocCode_ItemCode: { LocCode: ldLocCode, ItemCode: itemCode } },
          data: {
            Enable:      Boolean(ld.enable ?? true),
            SalesMargin: Number(ld.salesMargin ?? 0),
            Retailprice: Number(ld.retailPrice ?? 0),
            WSPrice:     Number(ld.wsPrice ?? 0),
            UpdBy:       b.updBy?.trim() || 'ADMIN',
          },
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Item updated successfully' });
  } catch (err) {
    console.error('PUT /api/services/[locCode]/[itemCode] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const resolvedParams = await params;
    const locCode  = decodeURIComponent(resolvedParams.locCode).trim();
    const itemCode = decodeURIComponent(resolvedParams.itemCode).trim();

    await prisma.tbl_ItemMaster.delete({
      where: { LocCode_ItemCode: { LocCode: locCode, ItemCode: itemCode } },
    });

    return NextResponse.json({ success: true, message: 'Item deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/services/[locCode]/[itemCode] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete item' }, { status: 500 });
  }
}