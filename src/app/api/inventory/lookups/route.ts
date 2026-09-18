// src/app/api/inventory/lookups/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/lookups
//
// Every dropdown the Purchase Order / GRN screens need, in ONE round trip:
//
//   { success, locations[], suppliers[], units[], company{}, errors{} }
//
// `company` is the letterhead the printed Purchase Order carries
// (`navconfig.logo_text` / `footerconfig`), read best-effort — a database
// without those tables still returns the three dropdown lists.
//
// THE RULE (asked for in the round): the lists must be EXACTLY what the
// database holds —
//
//   · read straight from tbl_locationmaster / tbl_suppliermaster /
//     tbl_unitmaster — no hard-coded lists, no sample data, no cache
//   · CHAR columns are RTRIM'd (a padded CHAR(10) would show as "LOC0000004   ")
//   · NOTHING is filtered out: a row with Enable = 0 is returned too and marked
//     `enable: false`, so the screen can show it as "(Inactive)" instead of the
//     value silently disappearing
//   · the three lists are loaded independently: if one table cannot be read the
//     other two still arrive, and the failing one reports why in `errors`
//
// Sorted so the screen is predictable: active rows first, then by name/code.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { invFail } from "@/lib/inventoryServer";
import { loadCompanyLetterhead } from "@/lib/companyLetterhead";
import { primarySupplierEmail } from "@/lib/poEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface LookupLocation {
  code: string;
  des: string;
  address: string;
  enable: boolean;
}
export interface LookupSupplier {
  supID: string;
  name: string;
  contact: string;
  /** the raw Emails column (may hold several addresses, or junk) */
  emails: string;
  /** the first address that is really an address — what "Email to Supplier" fills in */
  email: string;
  enable: boolean;
}
export interface LookupUnit {
  id: string;
  des: string;
  enable: boolean;
}

/** Read one list; a failure here must not take the other two down. */
async function load<T>(
  errors: Record<string, string>,
  key: string,
  run: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[inventory-lookups] ${key} failed:`, err);
    errors[key] = message.slice(0, 300);
    return [];
  }
}

export async function GET() {
  try {
    const errors: Record<string, string> = {};
    const company = await loadCompanyLetterhead(prisma);

    const locations = await load(errors, "locations", async () => {
      const rows = await prisma.$queryRaw<
        { code: string; des: string; address: string; enable: number }[]
      >`
        SELECT
          RTRIM(LocCode)                      AS code,
          LocDes                              AS des,
          COALESCE(RTRIM(Address), '')        AS address,
          COALESCE(CAST(Enable AS UNSIGNED), 1) AS enable
        FROM tbl_locationmaster
        ORDER BY enable DESC, LocDes ASC, LocCode ASC
      `;
      return rows.map<LookupLocation>((r) => ({
        code: String(r.code ?? "").trim(),
        des: String(r.des ?? "").trim(),
        address: String(r.address ?? "").trim(),
        enable: Number(r.enable) === 1,
      }));
    });

    const suppliers = await load(errors, "suppliers", async () => {
      const rows = await prisma.$queryRaw<
        { supID: string; name: string; contact: string; emails: string; enable: number }[]
      >`
        SELECT
          RTRIM(SupID)                          AS supID,
          SupName                               AS name,
          COALESCE(RTRIM(ContactNO), '')        AS contact,
          COALESCE(RTRIM(Emails), '')           AS emails,
          COALESCE(CAST(Enable AS UNSIGNED), 1) AS enable
        FROM tbl_suppliermaster
        ORDER BY enable DESC, SupName ASC, SupID ASC
      `;
      return rows.map<LookupSupplier>((r) => {
        const emails = String(r.emails ?? "").trim();
        return {
          supID: String(r.supID ?? "").trim(),
          name: String(r.name ?? "").trim(),
          contact: String(r.contact ?? "").trim(),
          emails,
          email: primarySupplierEmail(emails),
          enable: Number(r.enable) === 1,
        };
      });
    });

    const units = await load(errors, "units", async () => {
      const rows = await prisma.$queryRaw<
        { id: string; des: string; enable: number }[]
      >`
        SELECT
          RTRIM(MasterUnitID)                   AS id,
          UnitDes                               AS des,
          COALESCE(CAST(Enable AS UNSIGNED), 1) AS enable
        FROM tbl_unitmaster
        ORDER BY enable DESC, UnitDes ASC, MasterUnitID ASC
      `;
      return rows.map<LookupUnit>((r) => ({
        id: String(r.id ?? "").trim(),
        des: String(r.des ?? "").trim(),
        enable: Number(r.enable) === 1,
      }));
    });

    return NextResponse.json({
      success: true,
      locations,
      suppliers,
      units,
      company,
      counts: {
        locations: locations.length,
        suppliers: suppliers.length,
        units: units.length,
      },
      errors,
    });
  } catch (err) {
    return invFail(err, "GET /api/inventory/lookups");
  }
}

/* Prisma is imported for the Sql types used by the other inventory routes. */
void Prisma;
