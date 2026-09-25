// src/app/api/inventory/issue/requisition/route.ts
// GET  /api/inventory/issue/requisition?status=confirmed|pending|all&q=&fromLoc=&toLoc=&limit=300
// POST /api/inventory/issue/requisition  body: {fromLocCode,toLoc,irDate,irDueDate,remarks,lines:[{itemCode,unitID,costPrice,irQty}], confirm?:boolean}
// Mirrors the transfer requisition route, but on tbl_issuereqheder / tbl_issuereqdetail
// (serial "IR" -> IR000001). Confirming a requisition never moves stock.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";
import { logActivity } from "@/lib/activityLog";
import { itemCode } from "@/lib/itemCode";
import { nextSerialTx, SERIAL_CODES } from "@/lib/serials";
import {
  findLocation,
  invActor,
  invChar,
  invDateField,
  invFail,
  invId,
  invPrice,
  invQty,
  InvError,
  resolveItems,
  keySql,
  keyVal,
} from "@/lib/inventoryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const trim = (v: unknown) => String(v ?? "").trim();

interface RawLine { itemCode?: unknown; unitID?: unknown; costPrice?: unknown; irQty?: unknown; }

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = trim(sp.get("status")).toLowerCase(); // confirmed|pending|all
    const q = trim(sp.get("q"));
    const fromLoc = trim(sp.get("fromLoc"));
    const toLoc = trim(sp.get("toLoc"));
    const limit = Math.min(Math.max(Number(sp.get("limit") || 300) || 300, 1), 500);

    const where: Prisma.Sql[] = [];
    if (fromLoc) where.push(Prisma.sql`AND ${keySql("h.FromLocCode")} = ${keyVal(fromLoc)}`);
    if (toLoc) where.push(Prisma.sql`AND ${keySql("h.ToLoc")} = ${keyVal(toLoc)}`);
    if (status === "confirmed") where.push(Prisma.sql`AND UPPER(h.Confirmed)='Y'`);
    if (status === "pending") where.push(Prisma.sql`AND UPPER(h.Confirmed)<>'Y'`);
    if (q) where.push(Prisma.sql`AND (RTRIM(h.IRNO) LIKE ${`%${q}%`} OR RTRIM(h.FromLocCode) LIKE ${`%${q}%`} OR RTRIM(h.ToLoc) LIKE ${`%${q}%`})`);

    const filters = (): Prisma.Sql => (where.length ? Prisma.join(where, " ") : Prisma.empty);

    let rows: any[] = [];
    try {
      rows = await prisma.$queryRaw<{ IRNO: string; FromLocCode: string; FromLocDes: string|null; ToLoc: string; ToLocDes: string|null; IRDate: Date; IRDueDate: Date; NetTotal: number; Confirmed: string; Taken: string; UserID: string; UserName: string|null }[]>`
        SELECT
          RTRIM(h.IRNO) AS IRNO,
          RTRIM(h.FromLocCode) AS FromLocCode,
          (SELECT LocDes FROM tbl_locationmaster l WHERE ${keySql("l.LocCode")}=${keySql("h.FromLocCode")} LIMIT 1) AS FromLocDes,
          RTRIM(h.ToLoc) AS ToLoc,
          (SELECT LocDes FROM tbl_locationmaster l2 WHERE ${keySql("l2.LocCode")}=${keySql("h.ToLoc")} LIMIT 1) AS ToLocDes,
          h.IRDate AS IRDate,
          h.IRDueDate AS IRDueDate,
          h.NetTotal AS NetTotal,
          UPPER(h.Confirmed) AS Confirmed,
          UPPER(h.TakenForIssue) AS Taken,
          RTRIM(h.UserID) AS UserID,
          (SELECT UserName FROM tbl_userdetails u WHERE ${keySql("u.UserId")}=${keySql("h.UserID")} LIMIT 1) AS UserName
        FROM tbl_issuereqheder h
        WHERE 1=1 ${filters()}
        ORDER BY h.IRDate DESC, h.IRNO DESC
        LIMIT ${limit}
      `;
    } catch {
      // tables not created yet
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        irNo: trim(r.IRNO),
        fromLocCode: trim(r.FromLocCode),
        fromLocDes: trim(r.FromLocDes),
        toLoc: trim(r.ToLoc),
        toLocDes: trim(r.ToLocDes),
        irDate: r.IRDate,
        irDueDate: r.IRDueDate,
        netTotal: Number(r.NetTotal || 0),
        confirmed: trim(r.Confirmed) === 'Y',
        takenFully: trim(r.Taken) === '1' || trim(r.Taken) === 'Y',
        userId: trim(r.UserID),
        userName: trim(r.UserName) || trim(r.UserID),
      })),
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/issue/requisition");
  }
}

export async function POST(req: NextRequest) {
  const tag = "POST /api/inventory/issue/requisition";
  try {
    const actor = await invActor(req);
    const body = (await req.json()) as Record<string, unknown>;

    const fromRaw = invId(body.fromLocCode, "From Location", 10);
    const toRaw = invId(body.toLoc, "To Location", 10);
    if (fromRaw === toRaw) throw new InvError("From and To locations must be different.");
    const irDate = invDateField(body.irDate ?? body.IRDate ?? new Date().toISOString().slice(0,10), "IR Date");
    const irDueDate = invDateField(body.irDueDate ?? body.IRDueDate ?? irDate, "IR Due Date");
    const remarks = trim(body.remarks).slice(0, 500);
    const confirmNow = body.confirm === true || trim(body.confirm) === '1' || trim(body.confirm) === 'Y';

    const rawLines = Array.isArray(body.lines) ? (body.lines as RawLine[]) : [];
    if (rawLines.length === 0) throw new InvError("Add at least one item line before saving.");

    const result = await prisma.$transaction(async (tx) => {
      const fromLoc = await findLocation(tx, fromRaw);
      if (!fromLoc) throw new InvError(`Unknown From location “${fromRaw}”.`, 400);
      const toLoc = await findLocation(tx, toRaw);
      if (!toLoc) throw new InvError(`Unknown To location “${toRaw}”.`, 400);

      // items are read at the From location — that is where the note will issue them from
      const items = await resolveItems(tx, fromLoc, rawLines.map(l => itemCode(l.itemCode)));
      const missing = rawLines.map(l => invId(l.itemCode, "Item code", 50)).filter(c => !items.has(itemCode(c)));
      if (missing.length) throw new InvError(`These item codes are not in the item master for ${fromLoc}: ${missing.join(", ")}.`, 400);

      const lines = rawLines.map((line, idx) => {
        const code = itemCode(line.itemCode);
        const it = items.get(code)!;
        const qty = invQty(line.irQty, `IR QTY of ${it.des}`);
        const cost = trim(line.costPrice) === "" ? it.costPrice : invPrice(line.costPrice, `Cost price of ${it.des}`);
        return {
          lineNo: idx + 1,
          itemCode: it.code,
          unitID: invId(line.unitID || it.unitID || "", `Unit of ${it.des}`, 10),
          costPrice: cost,
          irQty: qty,
          itemValue: Number(cost) * Number(qty),
        };
      });

      const netTotal = lines.reduce((s, l) => s + l.itemValue, 0);
      const now = new Date();

      // IR number from tbl_serials (serial "IR", 6 digits -> IR000001)
      let irNo = "";
      try {
        irNo = await nextSerialTx(tx as any, SERIAL_CODES.issueReq, { width: 6 });
        if (!irNo.toUpperCase().startsWith("IR")) irNo = `IR${irNo.slice(-6)}`;
        irNo = irNo.trim().toUpperCase().slice(0, 10);
      } catch {
        const maxRows = await tx.$queryRaw<{ m: string | null }[]>`SELECT MAX(RTRIM(IRNO)) AS m FROM tbl_issuereqheder WHERE ${keySql("FromLocCode")}=${keyVal(fromLoc)}`;
        const max = trim(maxRows[0]?.m) || "IR000000";
        const n = (Number(max.replace(/\D/g, "")) || 0) + 1;
        irNo = `IR${String(n).padStart(6, "0")}`;
      }
      const sysSerNo = Number(irNo.replace(/\D/g, "")) || 0;

      const confirmedFlag = confirmNow ? "Y" : "N";
      const conUser = confirmNow ? actor.userId : "";
      const conTime = confirmNow ? now : new Date("1900-01-01");

      await tx.$executeRaw`
        INSERT INTO tbl_issuereqheder
          (FromLocCode, ToLoc, IRNO, IRDate, IRDueDate, NetTotal, UserID, Remarks, TxnDate, SysSerialNo, ConUserID, Confirmed, ConDatetime, TakenForIssue)
        VALUES
          (${invChar(fromLoc, 10)}, ${invChar(toLoc, 10)}, ${invChar(irNo, 10)}, ${irDate}, ${irDueDate}, ${netTotal},
           ${invChar(actor.userId, 10)}, ${remarks}, ${now}, ${sysSerNo},
           ${invChar(conUser, 10)}, ${confirmedFlag}, ${conTime}, ${'N'})
      `;

      for (const l of lines) {
        await tx.$executeRaw`
          INSERT INTO tbl_issuereqdetail
            (FromLocCode, ToLoc, IRNo, ItemCode, UnitID, CostPrice, IRQty, ItemValue, DirectPOConfNo, IssuedQTY)
          VALUES
            (${invChar(fromLoc, 10)}, ${invChar(toLoc, 10)}, ${invChar(irNo, 50)}, ${invChar(l.itemCode, 20)}, ${invChar(l.unitID, 10)},
             ${l.costPrice}, ${l.irQty}, ${l.itemValue}, ${invChar(irNo, 20)}, 0)
        `;
      }

      return { irNo: irNo.trim(), fromLoc, toLoc, netTotal, lines: lines.length, confirmed: confirmNow, irDate, irDueDate };
    }, { timeout: 30000 });

    try { await logActivity(actor.name, "inventory", `Issue Requisition ${result.irNo} ${result.confirmed ? 'confirmed' : 'saved'}`); } catch {}

    return NextResponse.json({
      success: true,
      data: result,
      message: result.confirmed ? `Issue Requisition ${result.irNo} confirmed — ${result.lines} line(s) saved.` : `Issue Requisition ${result.irNo} saved (${result.lines} lines).`
    });
  } catch (err) {
    return invFail(err, tag);
  }
}
