// E:\sayo_admin\sayo-admin\src\app\api\services\route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

function bufferToDataUrl(buf: Buffer | null) {
  if (!buf) return null;
  return `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
}

/* Raw SQL result type for tbl_itemdetail */
interface ItemDetailRow {
  LocCode:  string;
  ItemCode: string;
  ItemQty:  number;
}

export async function GET() {
  try {
    const [items, locations, units, suppliers, cat1, cat2, cat3, cat4] = await Promise.all([
      prisma.tbl_ItemMaster.findMany({ orderBy: { ItemCode: 'asc' } }),
      prisma.tbl_LocationMaster.findMany({ where: { Enable: true } }),
      prisma.tbl_UnitMaster.findMany({ where: { Enable: true } }),
      prisma.tbl_SupplierMaster.findMany({ where: { Enable: true } }),
      prisma.tbl_ItemCategory1.findMany({ where: { Enable: true } }),
      prisma.tbl_ItemCategory2.findMany({ where: { Enable: true } }),
      prisma.tbl_ItemCategory3.findMany({ where: { Enable: true } }),
      prisma.tbl_ItemCategory4.findMany({ where: { Enable: true } }),
    ]);

    /* ✅ Raw SQL — works without Prisma model for tbl_itemdetail */
    let itemDetails: ItemDetailRow[] = [];
    try {
      itemDetails = await prisma.$queryRaw<ItemDetailRow[]>`
        SELECT LocCode, ItemCode, SUM(ItemQty) AS ItemQty
        FROM tbl_itemdetail
        GROUP BY LocCode, ItemCode
      `;
    } catch {
      /* table might not exist yet — silently use empty array */
      itemDetails = [];
    }

    /* Build stock lookup map: "LocCode|ItemCode" → total qty */
    const detailMap = new Map<string, number>();
    for (const d of itemDetails) {
      const key = `${String(d.LocCode).trim()}|${String(d.ItemCode).trim()}`;
      detailMap.set(key, Number(d.ItemQty) ?? 0);
    }

    /* Group items by ItemCode */
    const itemsByCode = new Map<string, typeof items>();
    for (const it of items) {
      const key = it.ItemCode.trim();
      if (!itemsByCode.has(key)) itemsByCode.set(key, []);
      itemsByCode.get(key)!.push(it);
    }

    /* Unique items — first occurrence per ItemCode as master row */
    const uniqueItems = new Map<string, typeof items[0]>();
    for (const it of items) {
      const key = it.ItemCode.trim();
      if (!uniqueItems.has(key)) uniqueItems.set(key, it);
    }

    let idx = 1;
    const formattedItems = Array.from(uniqueItems.values()).map(it => {
      const locDetails = (itemsByCode.get(it.ItemCode.trim()) ?? []).map(loc => {
        const lm = locations.find(l => l.LocCode.trim() === loc.LocCode.trim());
        const stockKey = `${loc.LocCode.trim()}|${loc.ItemCode.trim()}`;
        return {
          locCode:         loc.LocCode.trim(),
          locName:         lm?.LocDes ?? loc.LocCode.trim(),
          enable:          loc.Enable,
          locStockBalance: detailMap.get(stockKey) ?? 0, 
          salesMargin:     loc.SalesMargin,
          retailPrice:     loc.Retailprice,
          wsPrice:         loc.WSPrice,
        };
      });

      return {
        id:               idx++,
        locCode:          it.LocCode.trim(),
        itemCode:         it.ItemCode.trim(),
        serviceItem:      it.ServiceItem,
        itemDes:          it.ItemDes,
        itemPrintDes:     it.ItemPrintDes.trim(),
        masterUnitID:     it.MasterUnitID.trim(),
        category1:        it.Category1.trim() === ' ' ? '' : it.Category1.trim(),
        category2:        it.Category2.trim() === ' ' ? '' : it.Category2.trim(),
        category3:        it.Category3.trim() === ' ' ? '' : it.Category3.trim(),
        category4:        it.Category4.trim() === ' ' ? '' : it.Category4.trim(),
        supID:            it.SupID.trim() === '0' ? '' : it.SupID.trim(),
        rol:              it.ROL,
        roq:              it.ROQ,
        minQty:           it.MinQty,
        maxQty:           it.MaxQty,
        rawCost:          it.RawCost,
        costMarkup:       it.CostMarkup,
        overallCost:      it.OverallCost,
        salesMargin:      it.SalesMargin,
        stockBalance:     it.StockBalance,
        expiryItem:       it.ExpiryItem,
        retailPrice:      it.Retailprice,
        wsApp:            it.WSApp,
        wsQty:            it.WSQty,
        wsPrice:          it.WSPrice,
        packedItem:       it.PackedItem,
        packSize:         it.PackSize,
        packPrice:        it.PackPrice,
        semiFinishedProd: it.SemiFinishedProd,
        itemPic:          bufferToDataUrl(it.ItemPic),
        createDate:       it.CreateDate.toISOString().slice(0, 10),
        createBy:         it.CreateBy.trim(),
        updDate:          it.UpdDate.toISOString().slice(0, 10),
        updBy:            it.UpdBy.trim(),
        enable:           it.Enable,
        locationDetails:  locDetails,
      };
    });

    return NextResponse.json({
      success:   true,
      items:     formattedItems,
      locations: locations.map(l => ({ code: l.LocCode.trim(), name: l.LocDes })),
      units:     units.map(u => ({ id: u.MasterUnitID.trim(), des: u.UnitDes })),
      suppliers: suppliers.map(s => ({ id: s.SupID.trim(), name: s.SupName })),
      category1: cat1.map(c => ({ code: c.CatCode.trim(), des: c.CatDes })),
      category2: cat2.map(c => ({ code: c.CatCode.trim(), des: c.CatDes })),
      category3: cat3.map(c => ({ code: c.CatCode.trim(), des: c.CatDes })),
      category4: cat4.map(c => ({ code: c.CatCode.trim(), des: c.CatDes })),
    });

  } catch (err) {
    console.error('GET /api/services error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    if (!b.locCode?.trim() || !b.itemCode?.trim() || !b.itemDes?.trim()) {
      return NextResponse.json(
        { success: false, message: 'LocCode, ItemCode and ItemDes are required' },
        { status: 400 }
      );
    }

    const locCode  = b.locCode.trim();
    const itemCode = b.itemCode.trim().toUpperCase();

    const exists = await prisma.tbl_ItemMaster.findUnique({
      where: { LocCode_ItemCode: { LocCode: locCode, ItemCode: itemCode } },
    });
    if (exists) {
      return NextResponse.json(
        { success: false, message: `ItemCode "${itemCode}" already exists for Location "${locCode}"` },
        { status: 409 }
      );
    }

    let picBuffer: Buffer | null = null;
    if (b.itemPic && typeof b.itemPic === 'string' && b.itemPic.startsWith('data:image')) {
      picBuffer = Buffer.from(b.itemPic.split(',')[1], 'base64');
    }

    const created = await prisma.tbl_ItemMaster.create({
      data: {
        LocCode:          locCode,
        ItemCode:         itemCode,
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
        StockBalance:     0,
        ExpiryItem:       Boolean(b.expiryItem),
        Retailprice:      Number(b.retailPrice ?? 0),
        WSApp:            Boolean(b.wsApp),
        WSQty:            Number(b.wsQty    ?? 0),
        WSPrice:          Number(b.wsPrice  ?? 0),
        PackedItem:       Boolean(b.packedItem),
        PackSize:         Number(b.packSize  ?? 0),
        PackPrice:        Number(b.packPrice ?? 0),
        SemiFinishedProd: Boolean(b.semiFinishedProd),
        ItemPic:          picBuffer,
        CreateBy:         b.createBy?.trim() || 'ADMIN',
        UpdBy:            b.updBy?.trim()    || 'ADMIN',
        Enable:           Boolean(b.enable ?? true),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        locCode:  created.LocCode.trim(),
        itemCode: created.ItemCode.trim(),
        itemDes:  created.ItemDes,
        itemPic:  bufferToDataUrl(created.ItemPic),
      },
    }, { status: 201 });

  } catch (err) {
    console.error('POST /api/services error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to create item' },
      { status: 500 }
    );
  }
}