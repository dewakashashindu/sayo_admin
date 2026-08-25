import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function clean(v: string | null | undefined) {
  if (!v || v.trim() === ' ' || v.trim() === '') return '';
  return v.trim();
}

/* ── GET all suppliers ── */
export async function GET() {
  try {
    const rows = await prisma.tbl_SupplierMaster.findMany({
      orderBy: { SupID: 'asc' },
    });

    const data = rows.map((r, i) => ({
      id:             i + 1,
      supID:          r.SupID.trim(),
      supName:        r.SupName,
      suppAdd1:       clean(r.SuppAdd1),
      contactNO:      clean(r.ContactNO),
      emails:         clean(r.Emails),
      web:            clean(r.Web),
      debtAmount:     r.DebtAmount,
      createUser:     r.CreateUser,
      createDatetime: r.CreateDatetime.toISOString().slice(0, 10),
      remarks:        clean(r.Remarks),
      enable:         r.Enable,
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

/* ── POST create supplier ── */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    if (!b.supID?.trim())   return NextResponse.json({ success: false, message: 'Supplier ID is required' },   { status: 400 });
    if (!b.supName?.trim()) return NextResponse.json({ success: false, message: 'Supplier Name is required' }, { status: 400 });

    const supID = b.supID.trim().toUpperCase();

    const exists = await prisma.tbl_SupplierMaster.findUnique({ where: { SupID: supID } });
    if (exists) return NextResponse.json({ success: false, message: `Supplier ID "${supID}" already exists` }, { status: 409 });

    const created = await prisma.tbl_SupplierMaster.create({
      data: {
        SupID:      supID,
        SupName:    b.supName.trim(),
        SuppAdd1:   b.suppAdd1?.trim()  || ' ',
        ContactNO:  b.contactNO?.trim() || ' ',
        Emails:     b.emails?.trim()    || ' ',
        Web:        b.web?.trim()       || ' ',
        DebtAmount: Number(b.debtAmount ?? 0),
        CreateUser: b.createUser?.trim() || 'ADMIN',
        Remarks:    b.remarks?.trim()   || ' ',
        Enable:     Boolean(b.enable ?? true),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id:             0,
        supID:          created.SupID.trim(),
        supName:        created.SupName,
        suppAdd1:       clean(created.SuppAdd1),
        contactNO:      clean(created.ContactNO),
        emails:         clean(created.Emails),
        web:            clean(created.Web),
        debtAmount:     created.DebtAmount,
        createUser:     created.CreateUser,
        createDatetime: created.CreateDatetime.toISOString().slice(0, 10),
        remarks:        clean(created.Remarks),
        enable:         created.Enable,
      },
    }, { status: 201 });

  } catch (err) {
    console.error('POST /api/suppliers error:', err);
    return NextResponse.json({ success: false, message: 'Failed to create supplier' }, { status: 500 });
  }
}