// src/app/api/bookings/[bookingID]/extras/route.ts
// Per-booking technician additions (post check-in):
//   • supporting technicians  → Tbl_BookingServiceItemAddTech
//   • materials actually used → Tbl_BookingServiceRecipe
//
// GET  /api/bookings/:bookingID/extras            → read both sets (+ names/prices)
// PUT  /api/bookings/:bookingID/extras            → replace either set
//      body: { addTech?: [...], recipe?: [...], recipeScope?: [...] }
//
// Writes are only allowed while the booking is checked-in, not marked done
// and not billed yet.
//
// NOTE: uses raw SQL (like the legacy appointments API) so the route works
// even if the generated Prisma client on the server is stale.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (v: unknown) => String(v ?? "").trim();

function pad10(v: string): string {
  return v.padEnd(10, " ").slice(0, 10);
}

const EPOCH_1900 = new Date("1900-01-01T00:00:00Z").getTime();

interface HeaderRow {
  LocCode: string;
  Status: string;
  BillingTime: Date | null;
}
interface CheckInRow {
  t: Date | null;
}
interface AddTechRow {
  GuessID: string;
  ServiceItemID: string;
  TechID: string;
}
interface RecipeRow {
  GuessID: string;
  ServiceItemID: string;
  RawItemCode: string;
  MasterUnitID: string;
  SubUnitID: string;
  QTY: number;
  ItemCost: number;
}
interface TechRow {
  UserId: string;
  UserName: string;
}
interface ItemRow {
  ItemCode: string;
  ItemDes: string | null;
  ItemPrintDes: string | null;
  Retailprice: number | null;
}

async function loadContext(bookingID: string) {
  const headerRows = await prisma.$queryRaw<HeaderRow[]>`
    SELECT LocCode, Status, BillingTime
    FROM tbl_bookingheder
    WHERE BookingID = ${pad10(bookingID)}
    LIMIT 1
  `;
  const header = headerRows[0];
  if (!header) return null;

  // Check-in time lives on tbl_bookingtxndetail (one row per guest), not on
  // the booking header — same rule the appointments API uses.
  const txnRows = await prisma.$queryRaw<CheckInRow[]>`
    SELECT MAX(CheckInTime) AS t
    FROM tbl_bookingtxndetail
    WHERE BookingID = ${pad10(bookingID)}
  `;
  const rawCheckIn = txnRows[0]?.t ?? null;
  const checkedIn =
    rawCheckIn !== null &&
    new Date(rawCheckIn).getTime() > EPOCH_1900;

  return { header, checkedIn };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    const context = await loadContext(bookingID);
    if (!context) {
      return NextResponse.json(
        { success: false, message: "Booking not found" },
        { status: 404 },
      );
    }
    const { header, checkedIn } = context;
    const locCode = header.LocCode.trim();
    const bookingPadded = pad10(bookingID);

    const [addTechRows, recipeRows] = await Promise.all([
      prisma.$queryRaw<AddTechRow[]>`
        SELECT GuessID, ServiceItemID, TechID
        FROM Tbl_BookingServiceItemAddTech
        WHERE BookingID = ${bookingPadded}
      `,
      prisma.$queryRaw<RecipeRow[]>`
        SELECT GuessID, ServiceItemID, RawItemCode, MasterUnitID, SubUnitID,
               QTY, ItemCost
        FROM Tbl_BookingServiceRecipe
        WHERE BookingID = ${bookingPadded}
      `,
    ]);

    const techIDs = Array.from(
      new Set(addTechRows.map((r) => r.TechID.trim()).filter(Boolean)),
    );
    const techRows = techIDs.length
      ? await prisma.$queryRaw<TechRow[]>`
          SELECT UserId, UserName
          FROM tbl_userdetails
          WHERE UserId IN (${Prisma.join(techIDs.map((id) => pad10(id)))})
        `
      : [];
    const itemRows = await prisma.$queryRaw<ItemRow[]>`
      SELECT ItemCode, ItemDes, ItemPrintDes, Retailprice
      FROM tbl_itemmaster
      WHERE LocCode = ${pad10(locCode)}
    `;

    const techNames = new Map(
      techRows.map((t) => [t.UserId.trim(), t.UserName.trim()]),
    );
    const itemByShortCode = new Map(
      itemRows.map((i) => [
        i.ItemCode.trim().slice(0, 10),
        {
          des: (i.ItemPrintDes || i.ItemDes || "").trim(),
          retail: Number(i.Retailprice ?? 0),
        },
      ]),
    );

    return NextResponse.json({
      success: true,
      locCode,
      checkedIn,
      billed: header.BillingTime !== null,
      status: trim(header.Status),
      addTech: addTechRows.map((r) => ({
        guessID: r.GuessID.trim(),
        serviceItemID: r.ServiceItemID.trim(),
        techID: r.TechID.trim(),
        techName: techNames.get(r.TechID.trim()) || r.TechID.trim(),
      })),
      recipe: recipeRows.map((r) => {
        const raw = r.RawItemCode.trim();
        const item = itemByShortCode.get(raw);
        return {
          guessID: r.GuessID.trim(),
          serviceItemID: r.ServiceItemID.trim(),
          rawItemCode: raw,
          rawItemDes: item?.des || raw,
          masterUnitID: r.MasterUnitID.trim(),
          subUnitID: r.SubUnitID.trim(),
          qty: Number(r.QTY ?? 0),
          itemCost: Number(r.ItemCost ?? 0),
          retailPrice: item?.retail ?? 0,
        };
      }),
    });
  } catch (err) {
    console.error("[booking-extras] GET failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load booking extras" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const bookingID = trim(decodeURIComponent((await params).bookingID));
    if (!bookingID) {
      return NextResponse.json(
        { success: false, message: "bookingID is required" },
        { status: 400 },
      );
    }

    const context = await loadContext(bookingID);
    if (!context) {
      return NextResponse.json(
        { success: false, message: "Booking not found" },
        { status: 404 },
      );
    }
    const { header, checkedIn } = context;
    if (!checkedIn) {
      return NextResponse.json(
        {
          success: false,
          message: "Client must be checked in before adding items or technicians",
        },
        { status: 409 },
      );
    }
    if (header.BillingTime !== null) {
      return NextResponse.json(
        {
          success: false,
          message: "Booking is already billed — additions are locked",
        },
        { status: 409 },
      );
    }
    if (trim(header.Status).toUpperCase() === "DONE") {
      return NextResponse.json(
        {
          success: false,
          message: "Work is marked done — additions are locked",
        },
        { status: 409 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      addTech?: unknown;
      recipe?: unknown;
      recipeScope?: unknown;
    };

    const locPadded = pad10(header.LocCode.trim());
    const bookingPadded = pad10(bookingID);

    await prisma.$transaction(async (tx) => {
      if (Array.isArray(body.addTech)) {
        const seen = new Set<string>();
        const rows: { guessID: string; serviceItemID: string; techID: string }[] = [];
        for (const entry of body.addTech as Array<Record<string, unknown>>) {
          const guessID = trim(entry.guessID) || "MAIN";
          const serviceItemID = trim(entry.serviceItemID);
          const techID = trim(entry.techID);
          if (!serviceItemID || !techID || techID === "0") continue;
          const key = [guessID, serviceItemID, techID].join("|").toUpperCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ guessID, serviceItemID, techID });
        }
        await tx.$executeRaw`
          DELETE FROM Tbl_BookingServiceItemAddTech
          WHERE BookingID = ${bookingPadded}
        `;
        for (const row of rows) {
          await tx.$executeRaw`
            INSERT INTO Tbl_BookingServiceItemAddTech
              (LocCode, BookingID, GuessID, ServiceItemID, TechID)
            VALUES (
              ${locPadded},
              ${bookingPadded},
              ${pad10(row.guessID)},
              ${pad10(row.serviceItemID)},
              ${pad10(row.techID)}
            )
          `;
        }
      }

      if (Array.isArray(body.recipe)) {
        const seen = new Set<string>();
        const rows: {
          guessID: string;
          serviceItemID: string;
          rawItemCode: string;
          masterUnitID: string;
          subUnitID: string;
          qty: number;
          itemCost: number;
        }[] = [];
        for (const entry of body.recipe as Array<Record<string, unknown>>) {
          const guessID = trim(entry.guessID) || "MAIN";
          const serviceItemID = trim(entry.serviceItemID);
          const rawItemCode = trim(entry.rawItemCode);
          const qty = Number(entry.qty);
          const itemCost = Number(entry.itemCost);
          if (!serviceItemID || !rawItemCode) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;
          const key = [guessID, serviceItemID, rawItemCode]
            .join("|")
            .toUpperCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            guessID,
            serviceItemID,
            rawItemCode,
            masterUnitID: trim(entry.masterUnitID) || " ",
            subUnitID: trim(entry.subUnitID) || " ",
            qty,
            itemCost: Number.isFinite(itemCost) ? itemCost : 0,
          });
        }

        // Replace only the (guest, service) pairs touched by this payload so
        // saving one service card never wipes another service's rows.
        const scope = Array.isArray(body.recipeScope)
          ? (body.recipeScope as Array<Record<string, unknown>>)
              .map((entry) => ({
                guessID: trim(entry.guessID) || "MAIN",
                serviceItemID: trim(entry.serviceItemID),
              }))
              .filter((pair) => pair.serviceItemID !== "")
          : [];
        const pairs = (
          scope.length
            ? scope
            : Array.from(
                new Set(
                  rows.map((r) => `${r.guessID}|${r.serviceItemID}`),
                ),
              ).map((key) => {
                const [guessID, serviceItemID] = key.split("|");
                return { guessID, serviceItemID };
              })
        ).filter((pair) => pair.serviceItemID !== "");

        for (const pair of pairs) {
          await tx.$executeRaw`
            DELETE FROM Tbl_BookingServiceRecipe
            WHERE BookingID = ${bookingPadded}
              AND GuessID = ${pad10(pair.guessID)}
              AND ServiceItemID = ${pad10(pair.serviceItemID)}
          `;
        }
        for (const row of rows) {
          await tx.$executeRaw`
            INSERT INTO Tbl_BookingServiceRecipe
              (LocCode, BookingID, GuessID, ServiceItemID, RawItemCode,
               MasterUnitID, SubUnitID, QTY, ItemCost)
            VALUES (
              ${locPadded},
              ${bookingPadded},
              ${pad10(row.guessID)},
              ${pad10(row.serviceItemID)},
              ${pad10(row.rawItemCode)},
              ${pad10(row.masterUnitID)},
              ${pad10(row.subUnitID)},
              ${row.qty},
              ${row.itemCost}
            )
          `;
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[booking-extras] PUT failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save booking extras" },
      { status: 500 },
    );
  }
}
