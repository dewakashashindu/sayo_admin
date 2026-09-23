import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? newRobustPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type PayModeRow = {
  PayCode: string;
  PayDes: string;
  PayGroup: string | null;
  PayGroupID: string | null;
  Enable: number | boolean;
  DoNotShowInSales: number | boolean | null;
  ZeroVal: number | null;
  RmksNeed: number | null;
};

function normBool(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Buffer.isBuffer(v)) return (v as Buffer)[0] ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? (n ? 1 : 0) : 0;
}
function normStr(v: unknown): string {
  return String(v ?? "").trim();
}

export async function GET() {
  try {
    // 1) Preferred: the view exactly as the MSSQL system defines it.
    //    MySQL port: CREATE VIEW Vw_PaymentModes AS SELECT ... LEFT JOIN ...
    let rows: PayModeRow[] | null = null;
    try {
      const viewRows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT PayCode, PayDes, PayGroup, PayGroupID, (Enable + 0) AS Enable, (DoNotShowInSales + 0) AS DoNotShowInSales, (ZeroVal + 0) AS ZeroVal, (RmksNeed + 0) AS RmksNeed FROM Vw_PaymentModes ORDER BY PayGroupID, PayDes`;
      rows = viewRows.map((r) => ({
        PayCode: normStr(r.PayCode),
        PayDes: normStr(r.PayDes) || normStr(r.PayCode),
        PayGroup: r.PayGroup != null ? normStr(r.PayGroup) : null,
        PayGroupID: r.PayGroupID != null ? normStr(r.PayGroupID) : null,
        Enable: normBool(r.Enable),
        DoNotShowInSales: r.DoNotShowInSales != null ? normBool(r.DoNotShowInSales) : 0,
        ZeroVal: r.ZeroVal != null ? Number(r.ZeroVal) : null,
        RmksNeed: r.RmksNeed != null ? Number(r.RmksNeed) : null,
      }));
    } catch {
      rows = null;
    }

    // 2) Fallback: raw tables when the view hasn't been created yet (older DB).
    if (!rows) {
      try {
        const raw = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT m.PayCode, m.PayDes, g.PayGroup AS PayGroup, m.PayGroupID, (m.Enable + 0) AS Enable, (m.DoNotShowInSales + 0) AS DoNotShowInSales, (m.ZeroVal + 0) AS ZeroVal, (m.RmksNeed + 0) AS RmksNeed FROM Tbl_PaymentModes m LEFT JOIN Tbl_PaymentGroup g ON m.PayGroupID = g.PaygroupID ORDER BY m.PayGroupID, m.PayDes`;
        rows = raw.map((r) => ({
          PayCode: normStr(r.PayCode),
          PayDes: normStr(r.PayDes) || normStr(r.PayCode),
          PayGroup: r.PayGroup != null ? normStr(r.PayGroup) : null,
          PayGroupID: r.PayGroupID != null ? normStr(r.PayGroupID) : null,
          Enable: normBool(r.Enable),
          DoNotShowInSales: r.DoNotShowInSales != null ? normBool(r.DoNotShowInSales) : 0,
          ZeroVal: r.ZeroVal != null ? Number(r.ZeroVal) : null,
          RmksNeed: r.RmksNeed != null ? Number(r.RmksNeed) : null,
        }));
      } catch {
        return NextResponse.json({ success: false, message: "Payment modes table/view not found. Create Vw_PaymentModes or Tbl_PaymentModes." }, { status: 500 });
      }
    }

    const enabled = rows.filter((r) => r.Enable === 1 && r.DoNotShowInSales !== 1 && r.PayCode && r.PayDes);

    // Group by PayGroup for the quick-buttons (Cash / Card / Online / Voucher ...)
    const groups: Record<string, PayModeRow[]> = {};
    for (const r of enabled) {
      const g = (r.PayGroup || "Other").trim() || "Other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(r);
    }

    return NextResponse.json({ success: true, data: enabled, groups });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Failed to load payment modes" }, { status: 500 });
  }
}
