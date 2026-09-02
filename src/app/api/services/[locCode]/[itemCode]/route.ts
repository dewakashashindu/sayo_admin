import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

type Ctx = {
  params: Promise<{
    locCode: string;
    itemCode: string;
  }>;
};

interface LocationInput {
  locCode?: string;
  enable?: boolean;
  salesMargin?: number;
  retailPrice?: number;
  wsPrice?: number;
  locStockBalance?: number;
}

class StockBalanceError extends Error {
  locCode: string;
  stock: number;

  constructor(locCode: string, stock: number) {
    super(
      `Cannot disable location ${locCode}. Stock balance is ${stock}; stock must be 0 before disabling.`,
    );
    this.name = "StockBalanceError";
    this.locCode = locCode;
    this.stock = stock;
  }
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

function imageToBuffer(value: unknown): Buffer | null | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value === "string" &&
    value.startsWith("data:image") &&
    value.includes(",")
  ) {
    return Buffer.from(value.split(",")[1], "base64");
  }
  return null;
}

async function getStockBalance(
  tx: PrismaClient | any,
  locCode: string,
  itemCode: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ ItemQty: number | null }[]>`
    SELECT COALESCE(SUM(ItemQty), 0) AS ItemQty
    FROM tbl_itemdetail
    WHERE LocCode = ${locCode}
      AND ItemCode = ${itemCode}
  `;

  // For an edit, a stock-query failure must abort the transaction. Treating
  // an unknown stock balance as zero could incorrectly allow a disable.
  return num(rows[0]?.ItemQty);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const resolvedParams = await params;
    const pathLocCode = decodeURIComponent(resolvedParams.locCode).trim();
    const itemCode = decodeURIComponent(resolvedParams.itemCode)
      .trim()
      .toUpperCase();
    const body = await req.json();

    if (!pathLocCode || !itemCode || !body.itemDes?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Location, ItemCode and Item Description are required",
        },
        { status: 400 },
      );
    }

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

    const detailByLocation = new Map<string, LocationInput>();

    for (const detail of requestedDetails) {
      const code = text(detail?.locCode);
      if (code) detailByLocation.set(code.toUpperCase(), detail);
    }

    // Always process every active location. This is what allows a missing
    // location row to be created when the user enables it in the UI.
    const targetLocations = locations.map((location) => ({
      code: location.LocCode.trim(),
      detail: detailByLocation.get(location.LocCode.trim().toUpperCase()),
    }));

    // If the path location is not currently in the enabled-location list,
    // still keep the master row editable.
    if (
      targetLocations.length === 0 ||
      !targetLocations.some(
        (location) => location.code.toUpperCase() === pathLocCode.toUpperCase(),
      )
    ) {
      targetLocations.push({
        code: pathLocCode,
        detail: detailByLocation.get(pathLocCode.toUpperCase()),
      });
    }

    const updated = await prisma.$transaction(
      async (tx) => {
        const baseRow = await tx.tbl_ItemMaster.findUnique({
          where: {
            LocCode_ItemCode: {
              LocCode: pathLocCode,
              ItemCode: itemCode,
            },
          },
        });

        if (!baseRow) {
          throw Object.assign(new Error("Item not found"), { statusCode: 404 });
        }

        const picBuffer = imageToBuffer(body.itemPic);
        const commonData = {
          ItemCode: itemCode,
          ServiceItem: bool(body.serviceItem),
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
          ExpiryItem: bool(body.expiryItem),
          WSApp: bool(body.wsApp),
          WSQty: num(body.wsQty),
          PackedItem: bool(body.packedItem),
          PackSize: num(body.packSize),
          PackPrice: num(body.packPrice),
          SemiFinishedProd: bool(body.semiFinishedProd),
          DurationMin: num(body.durationMin) || 30,
          UpdBy: text(body.updBy, "ADMIN"),
          ...(picBuffer !== undefined ? { ItemPic: picBuffer } : {}),
        };

        let updatedBase: any = null;

        for (const target of targetLocations) {
          const existing = await tx.tbl_ItemMaster.findUnique({
            where: {
              LocCode_ItemCode: {
                LocCode: target.code,
                ItemCode: itemCode,
              },
            },
          });

          const detail = target.detail;
          const desiredEnable =
            detail?.enable !== undefined
              ? Boolean(detail.enable)
              : (existing?.Enable ??
                (target.code === pathLocCode ? baseRow.Enable : false));

          // Never trust the read-only value sent by the browser. Check the
          // actual stock table only when an enabled row is being disabled.
          // An already-disabled row can remain disabled even if it has old
          // stock data; this prevents unrelated edits from being blocked.
          const wasEnabled = existing?.Enable ?? false;
          if (wasEnabled && !desiredEnable) {
            const stock = await getStockBalance(tx, target.code, itemCode);
            if (stock !== 0) {
              throw new StockBalanceError(target.code, stock);
            }
          }

          const rowData = {
            ...commonData,
            LocCode: target.code,
            SalesMargin: num(
              detail?.salesMargin ?? existing?.SalesMargin ?? body.salesMargin,
            ),
            Retailprice: num(
              detail?.retailPrice ?? existing?.Retailprice ?? body.retailPrice,
            ),
            WSPrice: num(detail?.wsPrice ?? existing?.WSPrice ?? body.wsPrice),
            Enable: desiredEnable,
          };

          if (existing) {
            const row = await tx.tbl_ItemMaster.update({
              where: {
                LocCode_ItemCode: {
                  LocCode: target.code,
                  ItemCode: itemCode,
                },
              },
              data: rowData,
            });

            if (target.code.toUpperCase() === pathLocCode.toUpperCase()) {
              updatedBase = row;
            }
          } else {
            const row = await tx.tbl_ItemMaster.create({
              data: {
                ...rowData,
                StockBalance: 0,
                CreateBy: text(body.createBy, "ADMIN"),
              },
            });

            if (target.code.toUpperCase() === pathLocCode.toUpperCase()) {
              updatedBase = row;
            }
          }
        }

        return updatedBase ?? baseRow;
      },
      {
        // Updating every enabled location can require several database
        // queries. Prisma's default interactive transaction timeout is only
        // 5 seconds, which is too short for this operation.
        maxWait: 10000,
        timeout: 30000,
      },
    );

    return NextResponse.json({
      success: true,
      message: "Item and location details updated successfully",
      data: {
        locCode: updated.LocCode.trim(),
        itemCode: updated.ItemCode.trim(),
      },
    });
  } catch (err: any) {
    console.error("PUT /api/services/[locCode]/[itemCode] error:", err);

    if (err instanceof StockBalanceError) {
      return NextResponse.json(
        {
          success: false,
          code: "STOCK_NOT_ZERO",
          message: err.message,
          locCode: err.locCode,
          stock: err.stock,
        },
        { status: 409 },
      );
    }

    if (err?.statusCode === 404 || err?.code === "P2025") {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update item",
        detail: err?.message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const resolvedParams = await params;
    const locCode = decodeURIComponent(resolvedParams.locCode).trim();
    const itemCode = decodeURIComponent(resolvedParams.itemCode).trim();

    await prisma.tbl_ItemMaster.delete({
      where: {
        LocCode_ItemCode: {
          LocCode: locCode,
          ItemCode: itemCode,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Item location row deleted successfully",
    });
  } catch (err) {
    console.error("DELETE /api/services/[locCode]/[itemCode] error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete item location row" },
      { status: 500 },
    );
  }
}
