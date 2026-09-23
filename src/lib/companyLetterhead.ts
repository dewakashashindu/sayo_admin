import type { PrismaClient } from "@prisma/client";

export interface CompanyLetterhead {
  name: string;
  address: string;
  phone: string;
}

/** Anything that can run `findUnique` — the client or a transaction. */
type CompanyDb = Pick<PrismaClient, "navconfig" | "footerconfig">;

export async function loadCompanyLetterhead(db: CompanyDb): Promise<CompanyLetterhead> {
  const company: CompanyLetterhead = { name: "", address: "", phone: "" };
  try {
    const nav = await db.navconfig.findUnique({ where: { id: 1 } });
    company.name = String(nav?.logo_text ?? "").trim();
  } catch {
    /* this database has no navconfig — the fallbacks cover it */
  }
  try {
    const footer = await db.footerconfig.findUnique({ where: { id: 1 } });
    company.name = company.name || String(footer?.brand_name ?? "").trim();
    company.address = String(footer?.contact_address ?? "").trim();
    company.phone = String(footer?.contact_phone ?? "").trim();
  } catch {
    /* no footerconfig either */
  }
  return company;
}

/**
 * The name to print when the database says nothing: the branch the order is
 * for, and only then a plain "SAYO".
 */
export function letterheadName(company: CompanyLetterhead, branchName?: string): string {
  return (company.name || String(branchName ?? "").trim() || "SAYO").trim();
}

/** The address line to print: the salon's own address, else the branch's. */
export function letterheadAddress(company: CompanyLetterhead, branchAddress?: string): string {
  return (company.address || String(branchAddress ?? "").trim()).trim();
}
