import { NextRequest, NextResponse } from "next/server";
import { locationGuard } from "@/lib/locationScope";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { createItemCodeIndex, ITEM_CODE_LENGTH } from "@/lib/itemCode";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma || newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Ctx = { params: Promise<{ bookingID: string }> };

const trim = (v: unknown) => String(v ?? "").trim();

function pad10(v: string): string {
  return v.padEnd(10, " ").slice(0, 10);
}

/**
 * Pad an ITEM code for INSERTs into the CHAR(15) item-code columns
 * (Tbl_BookingServiceRecipe.ServiceItemID / RawItemCode,
 * Tbl_BookingServiceItemAddTech.ServiceItemID). Item codes are never cut to 10
 * characters: the same prefix can belong to two different items.
 */
function padItemCode(v: string): string {
  return v.trim().padEnd(ITEM_CODE_LENGTH, " ").slice(0, ITEM_CODE_LENGTH);
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
  Category1: string;
  Category2: string;
  Category3: string;
  Category4: string;
}

async function loadContext(bookingID: string) {
  const headerRows = await prisma.$queryRaw<HeaderRow[]>`
    SELECT LocCode, Status, BillingTime
    FROM tbl_bookingheder
    WHERE RTRIM(BookingID) = ${bookingID}
    LIMIT 1
  `;
  const header = headerRows[0];
  if (!header) return null;

  // Check-in time lives on tbl_bookingtxndetail (one row per guest), not on
  // the booking header — same rule the appointments API uses.
  const txnRows = await prisma.$queryRaw<CheckInRow[]>`
    SELECT MAX(CheckInTime) AS t
    FROM tbl_bookingtxndetail
    WHERE RTRIM(BookingID) = ${bookingID}
  `;
  const rawCheckIn = txnRows[0]?.t ?? null;
  const checkedIn =
    rawCheckIn !== null &&
    new Date(rawCheckIn).getTime() > EPOCH_1900;

  return { header, checkedIn };
}

export async function GET(req: NextRequest, { params }: Ctx) {
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
    /* branch guard — the booking's location must be one this caller was given */
    {
      const stop = await locationGuard(req, locCode);
      if (stop) return stop;
    }


    const [addTechRows, recipeRows] = await Promise.all([
      prisma.$queryRaw<AddTechRow[]>`
        SELECT GuessID, ServiceItemID, TechID
        FROM Tbl_BookingServiceItemAddTech
        WHERE RTRIM(BookingID) = ${bookingID}
      `,
      prisma.$queryRaw<RecipeRow[]>`
        SELECT GuessID, ServiceItemID, RawItemCode, MasterUnitID, SubUnitID,
               QTY, ItemCost
        FROM Tbl_BookingServiceRecipe
        WHERE RTRIM(BookingID) = ${bookingID}
      `,
    ]);

    const techIDs = Array.from(
      new Set(addTechRows.map((r) => r.TechID.trim()).filter(Boolean)),
    );
    const techRows = techIDs.length
      ? await prisma.$queryRaw<TechRow[]>`
          SELECT UserId, UserName
          FROM tbl_userdetails
          WHERE RTRIM(UserId) IN (${Prisma.join(techIDs)})
        `
      : [];
    const itemRows = await prisma.$queryRaw<ItemRow[]>`
      SELECT ItemCode, ItemDes, ItemPrintDes, Retailprice,
             RTRIM(Category1) AS Category1, RTRIM(Category2) AS Category2,
             RTRIM(Category3) AS Category3, RTRIM(Category4) AS Category4
      FROM tbl_itemmaster
      WHERE RTRIM(LocCode) = ${locCode}
    `;

    const techNames = new Map(
      techRows.map((t) => [t.UserId.trim(), t.UserName.trim()]),
    );
    // Item code → description + retail price. Resolves the full CHAR(15) code
    // and, for rows written before the migration, the legacy 10-character
    // prefix — but only while that prefix belongs to one item.
    const itemIndex = createItemCodeIndex(
      itemRows.map((i) => ({
        code: i.ItemCode.trim(),
        des: (i.ItemPrintDes || i.ItemDes || "").trim(),
        retail: Number(i.Retailprice ?? 0),
        cat: [
          String(i.Category1 ?? "").trim(),
          String(i.Category2 ?? "").trim(),
          String(i.Category3 ?? "").trim(),
          String(i.Category4 ?? "").trim(),
        ] as [string, string, string, string],
      })),
      (i) => i.code,
    );

    /* Conversion factors so the bill screen can price a material line the
       way the recipe does: (Unit Cost / NoOfUnits) * Qty. Falls back to the
       factor written in the sub-unit description ("PACK 1M FROM 10" → 10). */
    const [convRows, subRows] = await Promise.all([
      prisma.$queryRaw<{ M: string; S: string; N: number | null }[]>`
        SELECT RTRIM(MasterUnitID) AS M, RTRIM(SubUnitID) AS S, NoOfUnits AS N
        FROM tbl_unitconversion WHERE Enable = 1
      `,
      prisma.$queryRaw<{ ID: string; DES: string | null }[]>`
        SELECT RTRIM(SubUnitID) AS ID, SubUnitDes AS DES
        FROM tbl_unitsub WHERE Enable = 1
      `,
    ]);
    const subDes = new Map(subRows.map((s) => [s.ID, String(s.DES ?? "")]));
    const noUnitsFor = (master: string, sub: string): number => {
      const c = convRows.find(
        (x) => x.M === master && x.S === sub,
      );
      if (c && Number(c.N) > 0) return Number(c.N);
      const from = /FROM\s*([0-9]+(?:\.[0-9]+)?)/i.exec(subDes.get(sub) ?? "");
      if (from) return Number(from[1]) || 1;
      const last = /([0-9]+(?:\.[0-9]+)?)\s*$/.exec((subDes.get(sub) ?? "").trim());
      return last ? Number(last[1]) || 1 : 1;
    };

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
        const item = itemIndex.get(raw);
        const master = r.MasterUnitID.trim();
        const sub = r.SubUnitID.trim();
        const noUnits = noUnitsFor(master, sub);
        return {
          guessID: r.GuessID.trim(),
          serviceItemID: r.ServiceItemID.trim(),
          rawItemCode: raw,
          rawItemDes: item?.des || raw,
          masterUnitID: master,
          subUnitID: sub,
          qty: Number(r.QTY ?? 0),
          itemCost: Number(r.ItemCost ?? 0),
          retailPrice: item?.retail ?? 0,
          /* How many sub units make one master unit — the bill prices a
             material line at itemCost / noOfUnits (rev 27). */
          noOfUnits: noUnits,
          /* Category chain so the workstation can scope the ingredient
             search even for booking-saved recipe rows (rev 26b). */
          category1: item?.cat[0] ?? "",
          category2: item?.cat[1] ?? "",
          category3: item?.cat[2] ?? "",
          category4: item?.cat[3] ?? "",
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

    /* The booking-wide stamp checked above only proves SOMEONE is in the chair.
       A group booking's guests arrive at their own times, so every guest this
       request names must have its own tbl_bookingtxndetail.CheckInTime before
       anything is written against it. */
    const namedGuests = new Set<string>();
    for (const list of [body.addTech, body.recipe, body.recipeScope]) {
      if (!Array.isArray(list)) continue;
      for (const entry of list as Array<Record<string, unknown>>) {
        namedGuests.add((trim(entry.guessID) || "MAIN").toUpperCase());
      }
    }
    if (namedGuests.size > 0) {
      const guestIDs = [...namedGuests];
      const guestRows = await prisma.$queryRaw<
        { GuessID: string; CheckInTime: Date | string | null }[]
      >`
        SELECT RTRIM(GuessID) AS GuessID, MAX(CheckInTime) AS CheckInTime
        FROM tbl_bookingtxndetail
        WHERE RTRIM(BookingID) = ${bookingID}
          AND RTRIM(GuessID) IN (${Prisma.join(
            guestIDs.map((guestID) => Prisma.sql`${guestID}`),
          )})
        GROUP BY RTRIM(GuessID)
      `;
      const arrived = new Set(
        guestRows
          .filter(
            (row) =>
              row.CheckInTime !== null &&
              new Date(row.CheckInTime).getTime() > EPOCH_1900,
          )
          .map((row) => trim(row.GuessID).toUpperCase()),
      );
      const notArrived = guestIDs.filter(
        (guestID) => !arrived.has(guestID.toUpperCase()),
      );
      if (notArrived.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `Guest ${notArrived.join(", ")} is not checked in yet — materials and technicians are locked until that guest arrives`,
          },
          { status: 409 },
        );
      }
    }

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
          WHERE RTRIM(BookingID) = ${bookingID}
        `;
        for (const row of rows) {
          await tx.$executeRaw`
            INSERT INTO Tbl_BookingServiceItemAddTech
              (LocCode, BookingID, GuessID, ServiceItemID, TechID)
            VALUES (
              ${locPadded},
              ${bookingPadded},
              ${pad10(row.guessID)},
              ${padItemCode(row.serviceItemID)},
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
            WHERE RTRIM(BookingID) = ${bookingID}
              AND RTRIM(GuessID) = ${pair.guessID}
              AND RTRIM(ServiceItemID) = ${pair.serviceItemID}
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
              ${padItemCode(row.serviceItemID)},
              ${padItemCode(row.rawItemCode)},
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
