import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Ctx = { params: { supID: string } };

function clean(v: string | null | undefined) {
  if (!v || v.trim() === ' ' || v.trim() === '') return '';
  return v.trim();
}

function mapRow(r: {
  SupID: string; SupName: string; SuppAdd1: string; ContactNO: string;
  Emails: string; Web: string; DebtAmount: number; CreateUser: string;
  CreateDatetime: Date; Remarks: string; Enable: boolean;
}) {
  return {
    id:             0,
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
  };
}

/* ── GET single ── */
export async function GET(_: NextRequest, { params }: Ctx) {
  try {
    const rec = await prisma.tbl_SupplierMaster.findUnique({
      where: { SupID: params.supID },
    });
    if (!rec) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: mapRow(rec) });
  } catch (err) {
    console.error('GET /api/suppliers/[supID] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch supplier' }, { status: 500 });
  }
}

/* ── PUT update ── */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const b = await req.json();

    if (!b.supName?.trim())
      return NextResponse.json({ success: false, message: 'Supplier Name is required' }, { status: 400 });

    const updated = await prisma.tbl_SupplierMaster.update({
      where: { SupID: params.supID },
      data: {
        SupName:    b.supName.trim(),
        SuppAdd1:   b.suppAdd1?.trim()  || ' ',
        ContactNO:  b.contactNO?.trim() || ' ',
        Emails:     b.emails?.trim()    || ' ',
        Web:        b.web?.trim()       || ' ',
        DebtAmount: Number(b.debtAmount ?? 0),
        Remarks:    b.remarks?.trim()   || ' ',
        Enable:     Boolean(b.enable ?? true),
      },
    });

    return NextResponse.json({ success: true, data: mapRow(updated) });
  } catch (err) {
    console.error('PUT /api/suppliers/[supID] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update supplier' }, { status: 500 });
  }
}

/* ── DELETE ── */
export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    await prisma.tbl_SupplierMaster.delete({ where: { SupID: params.supID } });
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/suppliers/[supID] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete supplier' }, { status: 500 });
  }
}