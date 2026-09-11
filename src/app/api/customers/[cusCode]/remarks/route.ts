// src/app/api/customers/[cusCode]/remarks/route.ts
// Technician remarks ABOUT a customer → Tbl_CustomerMaster.Rmks (VarChar 400).
// New remarks are APPENDED to existing text (" | " separator). If the combined
// text exceeds 400 chars, the oldest text is trimmed off the front.
//
// GET   /api/customers/:cusCode/remarks  → { success, cusCode, cusName, rmks }
// PATCH /api/customers/:cusCode/remarks  { remark } → { success, rmks, truncated }
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const MAX_LEN = 400;

type Ctx = { params: Promise<{ cusCode: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const cusCode = decodeURIComponent((await params).cusCode).trim();
    if (!cusCode) {
      return NextResponse.json(
        { success: false, message: "cusCode is required" },
        { status: 400 },
      );
    }
    const row = await prisma.tbl_CustomerMaster.findFirst({
      where: { CusCode: cusCode },
      select: { CusCode: true, CusName: true, Rmks: true },
    });
    if (!row) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      cusCode: row.CusCode.trim(),
      cusName: (row.CusName || "").trim(),
      rmks: (row.Rmks || "").trim(),
    });
  } catch (err) {
    console.error("GET /api/customers/[cusCode]/remarks error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load customer remarks" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const cusCode = decodeURIComponent((await params).cusCode).trim();
    const body = (await req.json()) as { remark?: string };
    // Single-line: the column is VarChar(400), so collapse whitespace.
    const remark = (body.remark || "").replace(/\s+/g, " ").trim();
    if (!cusCode) {
      return NextResponse.json(
        { success: false, message: "cusCode is required" },
        { status: 400 },
      );
    }
    if (!remark) {
      return NextResponse.json(
        { success: false, message: "remark is required" },
        { status: 400 },
      );
    }

    const row = await prisma.tbl_CustomerMaster.findFirst({
      where: { CusCode: cusCode },
      select: { Rmks: true },
    });
    if (!row) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 },
      );
    }

    const current = (row.Rmks || "").trim();
    const combined = current ? `${current} | ${remark}` : remark;
    const truncated = combined.length > MAX_LEN;
    const finalText = truncated ? combined.slice(-MAX_LEN) : combined;

    await prisma.tbl_CustomerMaster.updateMany({
      where: { CusCode: cusCode },
      data: { Rmks: finalText },
    });

    return NextResponse.json({ success: true, rmks: finalText, truncated });
  } catch (err) {
    console.error("PATCH /api/customers/[cusCode]/remarks error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save customer remark" },
      { status: 500 },
    );
  }
}
