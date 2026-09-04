// src/app/api/services/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function bufferToDataUrl(buf: Buffer | null) {
  if (!buf) return null;
  return `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
}

interface ItemDetailRow {
  LocCode: string;
  ItemCode: string;
  ItemQty: number;
}

interface LocationInput {
  locCode?: string;
  enable?: boolean;
  salesMargin?: number;
  retailPrice?: number;
  wsPrice?: number;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return value === undefined || value === null ? fallback : Boolean(value);
}

type MofValue = "M" | "F" | "O";

function normalizeMof(value: unknown): MofValue {
  const normalized = text(value).toUpperCase();
  if (normalized === "M" || normalized === "MALE") return "M";
  if (normalized === "F" || normalized === "FEMALE") return "F";
  return "O";
}

function normalizeServiceDuration(value: unknown, isService: boolean): number {
  if (!isService) return 0;
  return Math.max(0, Math.floor(num(value)));
}

export async function GET() {
  try {
    const [items, locations, units, suppliers, cat1, cat2, cat3, cat4] =
      await Promise.all([
        prisma.tbl_ItemMaster.findMany({
          orderBy: { ItemCode: "asc" },
        }),
        prisma.tbl_LocationMaster.findMany({
          where: { Enable: true },
        }),
        prisma.tbl_UnitMaster.findMany({
          where: { Enable: true },
        }),
        prisma.tbl_SupplierMaster.findMany({
          where: { Enable: true },
        }),
        prisma.tbl_ItemCategory1.findMany({
          where: { Enable: true },
        }),
        prisma.tbl_ItemCategory2.findMany({
          where: { Enable: true },
        }),
        prisma.tbl_ItemCategory3.findMany({
          where: { Enable: true },
        }),
        prisma.tbl_ItemCategory4.findMany({
          where: { Enable: true },
        }),
      ]);

    let itemDetails: ItemDetailRow[] = [];

    try {
      itemDetails = await prisma.$queryRaw<ItemDetailRow[]>`
        SELECT
          LocCode,
          ItemCode,
          SUM(ItemQty) AS ItemQty
        FROM tbl_itemdetail
        GROUP BY LocCode, ItemCode
      `;
    } catch {
      // If the stock table is unavailable, show zero stock rather than
      // blocking the Item Master screen.
      itemDetails = [];
    }

    const detailMap = new Map<string, number>();

    for (const detail of itemDetails) {
      const key = `${String(detail.LocCode).trim()}|${String(detail.ItemCode).trim()}`;
      detailMap.set(key, num(detail.ItemQty));
    }

    const itemsByCode = new Map<string, typeof items>();

    for (const item of items) {
      const itemCode = item.ItemCode.trim();
      const rows = itemsByCode.get(itemCode) ?? [];
      rows.push(item);
      itemsByCode.set(itemCode, rows);
    }

    const uniqueItems = new Map<string, (typeof items)[number]>();

    for (const item of items) {
      const itemCode = item.ItemCode.trim();
      if (!uniqueItems.has(itemCode)) {
        uniqueItems.set(itemCode, item);
      }
    }

    let idx = 1;

    const formattedItems = Array.from(uniqueItems.values()).map((item) => {
      const itemCode = item.ItemCode.trim();
      const itemRows = itemsByCode.get(itemCode) ?? [];

      /*
       * Important:
       * Return every active location here, even if the item row does not
       * exist there yet. A missing row is shown as disabled and can later be
       * enabled from Location Details; PUT will create that row.
       */
      const locationDetails = locations.map((location) => {
        const locCode = location.LocCode.trim();
        const row = itemRows.find(
          (candidate) => candidate.LocCode.trim() === locCode,
        );
        const stockKey = `${locCode}|${itemCode}`;

        return {
          locCode,
          locName: location.LocDes,
          enable: row?.Enable ?? false,
          locStockBalance: detailMap.get(stockKey) ?? 0,
          salesMargin: num(row?.SalesMargin ?? item.SalesMargin),
          retailPrice: num(row?.Retailprice ?? item.Retailprice),
          wsPrice: num(row?.WSPrice ?? item.WSPrice),
        };
      });

      return {
        id: idx++,
        locCode: item.LocCode.trim(),
        itemCode,
        serviceItem: item.ServiceItem,
        mof: normalizeMof(item.MOF),
        itemDes: item.ItemDes,
        itemPrintDes: item.ItemPrintDes.trim(),
        masterUnitID: item.MasterUnitID.trim(),
        category1: item.Category1.trim() === " " ? "" : item.Category1.trim(),
        category2: item.Category2.trim() === " " ? "" : item.Category2.trim(),
        category3: item.Category3.trim() === " " ? "" : item.Category3.trim(),
        category4: item.Category4.trim() === " " ? "" : item.Category4.trim(),
        supID: item.SupID.trim() === "0" ? "" : item.SupID.trim(),
        rol: num(item.ROL),
        roq: num(item.ROQ),
        minQty: num(item.MinQty),
        maxQty: num(item.MaxQty),
        rawCost: num(item.RawCost),
        costMarkup: num(item.CostMarkup),
        overallCost: num(item.OverallCost),
        salesMargin: num(item.SalesMargin),
        stockBalance: num(item.StockBalance),
        expiryItem: item.ExpiryItem,
        retailPrice: num(item.Retailprice),
        // SerDuration is stored as zero by default. Booking/availability code
        // applies its existing 30-minute fallback when a service has no value.
        durationMin: Math.max(0, num(item.SerDuration)),
        wsApp: item.WSApp,
        wsQty: num(item.WSQty),
        wsPrice: num(item.WSPrice),
        packedItem: item.PackedItem,
        packSize: num(item.PackSize),
        packPrice: num(item.PackPrice),
        semiFinishedProd: item.SemiFinishedProd,
        itemPic: bufferToDataUrl(item.ItemPic),
        createDate: item.CreateDate.toISOString().slice(0, 10),
        createBy: item.CreateBy.trim(),
        updDate: item.UpdDate.toISOString().slice(0, 10),
        updBy: item.UpdBy.trim(),

        // Derived value for the item list only. The editable Enable value
        // remains inside each locationDetails row.
        enable: locationDetails.some((location) => location.enable),
        locationDetails,
      };
    });

    return NextResponse.json({
      success: true,
      items: formattedItems,
      locations: locations.map((location) => ({
        code: location.LocCode.trim(),
        name: location.LocDes,
      })),
      units: units.map((unit) => ({
        id: unit.MasterUnitID.trim(),
        des: unit.UnitDes,
      })),
      suppliers: suppliers.map((supplier) => ({
        id: supplier.SupID.trim(),
        name: supplier.SupName,
      })),
      category1: cat1.map((category) => ({
        code: category.CatCode.trim(),
        des: category.CatDes,
      })),
      category2: cat2.map((category) => ({
        code: category.CatCode.trim(),
        des: category.CatDes,
      })),
      category3: cat3.map((category) => ({
        code: category.CatCode.trim(),
        des: category.CatDes,
      })),
      category4: cat4.map((category) => ({
        code: category.CatCode.trim(),
        des: category.CatDes,
      })),
    });
  } catch (err) {
    console.error("GET /api/services error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to fetch items" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (
      !body.locCode?.trim() ||
      !body.itemCode?.trim() ||
      !body.itemDes?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "LocCode, ItemCode and ItemDes are required",
        },
        { status: 400 },
      );
    }

    const itemCode = body.itemCode.trim().toUpperCase();
    const serviceItem = bool(body.serviceItem);
    const requestedDetails: LocationInput[] = Array.isArray(
      body.locationDetails,
    )
      ? body.locationDetails
      : [];

    const locations = await prisma.tbl_LocationMaster.findMany({
      where: { Enable: true },
      select: { LocCode: true, LocDes: true },
      orderBy: { LocCode: "asc" },
    });

    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, message: "No enabled locations were found" },
        { status: 422 },
      );
    }

    const detailByLocation = new Map<string, LocationInput>();

    for (const detail of requestedDetails) {
      const code = text(detail?.locCode);
      if (code) detailByLocation.set(code.toUpperCase(), detail);
    }

    const targetLocations = locations.map((location) => ({
      code: location.LocCode.trim(),
      detail: detailByLocation.get(location.LocCode.trim().toUpperCase()),
    }));

    // ItemCode is the logical item identity. A new item must not partially
    // collide with an item that already exists in another location.
    const existing = await prisma.$queryRaw<{ LocCode: string }[]>`
      SELECT LocCode
      FROM tbl_itemmaster
      WHERE RTRIM(ItemCode) = ${itemCode}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `ItemCode "${itemCode}" already exists. Select it from Browse to edit it.`,
        },
        { status: 409 },
      );
    }

    let picBuffer: Buffer | null = null;

    if (
      body.itemPic &&
      typeof body.itemPic === "string" &&
      body.itemPic.startsWith("data:image")
    ) {
      picBuffer = Buffer.from(body.itemPic.split(",")[1], "base64");
    }

    const created = await prisma.$transaction(
      async (tx) => {
        let firstCreated: any = null;

        for (const target of targetLocations) {
          const detail = target.detail;
          const createdRow = await tx.tbl_ItemMaster.create({
            data: {
              LocCode: target.code,
              ItemCode: itemCode,
              ServiceItem: serviceItem,
              MOF: normalizeMof(body.mof ?? body.gender),
              ItemDes: text(body.itemDes),
              ItemPrintDes: text(body.itemPrintDes, " "),
              MasterUnitID: text(body.masterUnitID, "UNT03"),
              Category1: text(body.category1),
              Category2: text(body.category2),
              Category3: text(body.category3),
              Category4: text(body.category4),
              SupID: text(body.supID, "0"),
              ROL: num(body.rol),
              ROQ: num(body.roq),
              MinQty: num(body.minQty),
              MaxQty: num(body.maxQty),
              RawCost: num(body.rawCost),
              CostMarkup: num(body.costMarkup),
              OverallCost: num(body.rawCost) * (1 + num(body.costMarkup) / 100),

              // New items can have location-specific prices and margins.
              SalesMargin: num(detail?.salesMargin ?? body.salesMargin),
              Retailprice: num(detail?.retailPrice ?? body.retailPrice),
              WSPrice: num(detail?.wsPrice ?? body.wsPrice),

              StockBalance: 0,
              ExpiryItem: bool(body.expiryItem),
              WSApp: bool(body.wsApp),
              WSQty: num(body.wsQty),
              PackedItem: bool(body.packedItem),
              PackSize: num(body.packSize),
              PackPrice: num(body.packPrice),
              SemiFinishedProd: bool(body.semiFinishedProd),
              SerDuration: normalizeServiceDuration(
                body.serDuration ?? body.durationMin,
                serviceItem,
              ),
              ItemPic: picBuffer,
              CreateBy: text(body.createBy, "ADMIN"),
              UpdBy: text(body.updBy, "ADMIN"),

              // Enable is per location, never a global Flags value.
              Enable: bool(detail?.enable, true),
            },
          });

          if (!firstCreated) firstCreated = createdRow;
        }

        return firstCreated;
      },
      {
        // One item is inserted once per enabled location. Increase Prisma's
        // default 5-second interactive transaction limit for that loop.
        maxWait: 10000,
        timeout: 30000,
      },
    );

    return NextResponse.json(
      {
        success: true,
        message: `Item created for ${targetLocations.length} location(s)`,
        data: {
          locCode: created.LocCode.trim(),
          itemCode: created.ItemCode.trim(),
          itemDes: created.ItemDes,
          itemPic: bufferToDataUrl(created.ItemPic),
          locationCount: targetLocations.length,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("POST /api/services error:", err);

    if (err?.code === "P2002") {
      return NextResponse.json(
        { success: false, message: "This ItemCode already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create item",
        detail: err?.message,
      },
      { status: 500 },
    );
  }
}
