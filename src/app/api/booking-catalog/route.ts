import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { genderFromMof, type GenderValue } from '@/lib/genderOptions';
import {
  itemSpecKey,
  itemSpecMap,
  listSpecialities,
  specialtiesByUser,
} from '@/lib/technicianSpecialities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── what drives the booking page ───────────────────────────────────────────
// The tabs, the service list and the staff list are all built from ONE thing:
// the technician specialities on Administration → Technician Specialities.
//
//   a tab          = one speciality
//   the services   = the items Item Master filed under that speciality
//   the staff      = the users Users filed under that speciality
//
// So a speciality that is added there shows up as a tab, and an item or a
// person that nobody has filed under one never appears anywhere. Nothing on
// this page guesses from a category name any more — the tabs used to be six
// hard-coded words matched against item descriptions, which put "Protein
// Treatment" under SKIN and "Aroma Massage" under HAIR when the branch itself
// said otherwise.
//
// A service item with no speciality is left out on purpose: it has not been
// filed anywhere yet, and showing it under a made-up tab would hide the fact
// that Item Master still has work to do.

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPrice(value: unknown): string {
  const price = Number(value) || 0;
  return `LKR ${price.toLocaleString('en-US')}`;
}

function formatDuration(minutes: number): string {
  // Keep the page's existing "<n> min" convention — the slot evaluator and
  // summary UI parse a leading integer (60+" min" like "120 min").
  const safe = minutes > 0 ? minutes : 30;
  return `${safe} min`;
}

function avatarLetter(name: string): string {
  return (clean(name).charAt(0) || '?').toUpperCase();
}

interface CatalogService {
  name: string;
  price: string;
  duration: string;
  durationMin: number;
  /** The speciality code this item is filed under. */
  category: string;
  itemCode: string;
  locCode: string;
  /** male / female / other — read from tbl_itemmaster.MOF. */
  gender: GenderValue;
}

interface CatalogProvider {
  name: string;
  role: string;
  avatar: string;
  /** Speciality codes this person does. */
  expertise: string[];
  techID: string;
}

export async function GET() {
  try {
    const [locations, items, users, specialities, assignments, itemSpecs] =
      await Promise.all([
        prisma.tbl_LocationMaster.findMany({
          where: { Enable: true },
          orderBy: { LocCode: 'asc' },
        }),
        // ServiceItem = 1 only: this is the booking page, so physical stock
        // never reaches it.
        prisma.tbl_ItemMaster.findMany({
          where: { Enable: true, ServiceItem: true },
          select: {
            LocCode: true,
            ItemCode: true,
            ItemDes: true,
            ItemPrintDes: true,
            Retailprice: true,
            SerDuration: true,
            MOF: true,
            ServiceItem: true,
          },
        }),
        prisma.tbl_userdetails.findMany({ where: { Enable: true } }),
        listSpecialities(prisma),
        specialtiesByUser(),
        itemSpecMap(prisma),
      ]);

    const locMap = new Map<string, string>();
    for (const location of locations) {
      const code = clean(location.LocCode).toUpperCase();
      const name = clean(location.LocDes);
      locMap.set(code, name || code);
    }

    // code → name, for the tab labels and the little badges on each provider.
    const categoryNames: Record<string, string> = {};
    const specialitiesByCode = new Map<string, string>();
    for (const spec of specialities) {
      const code = clean(spec.SpecAreaID).toUpperCase();
      if (!code) continue;
      const name = clean(spec.Specilities) || code;
      specialitiesByCode.set(code, name);
      categoryNames[code] = name;
    }

    // Dedupe per BRANCH, not per code: the same service carries its own price,
    // duration and availability in every location, and the booking page shows
    // only the chosen branch.
    const seenKeys = new Set<string>();
    const seenServiceKeys = new Set<string>();
    const services: CatalogService[] = [];

    for (const item of items) {
      const locCode = clean(item.LocCode).toUpperCase();
      if (!locMap.has(locCode)) continue; // item filed under a disabled branch

      const itemCode = clean(item.ItemCode);
      if (!itemCode) continue;

      // Which speciality this service belongs to. Read outside Prisma because
      // the column is worked out from the live database, not from a model.
      const specialtyCode =
        itemSpecs.get(itemSpecKey(clean(item.LocCode), itemCode)) ?? '';
      // A service nobody has filed under a speciality is not on this page.
      if (!specialtyCode) continue;
      if (!specialitiesByCode.has(specialtyCode)) continue;

      const key = `${locCode}|${itemCode.toUpperCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const durationMin = Math.max(0, Math.floor(Number(item.SerDuration) || 0));
      const name = clean(item.ItemPrintDes) || clean(item.ItemDes) || itemCode;
      const price = formatPrice(item.Retailprice);

      // Identical display rows inside one branch would be indistinguishable.
      const serviceKey = `${key}|${name.toLowerCase()}|${price.toLowerCase()}`;
      if (seenServiceKeys.has(serviceKey)) continue;
      seenServiceKeys.add(serviceKey);

      services.push({
        name,
        price,
        duration: formatDuration(durationMin),
        durationMin,
        category: specialtyCode,
        itemCode,
        locCode,
        gender: genderFromMof(item.MOF),
      });
    }

    /* Staff grouped by the branch they work at (display name). Only people who
       hold at least one speciality are bookable — that is the same rule the
       page has always used, now with a real source for the list. */
    const providersByLocation: Record<string, CatalogProvider[]> = {};
    for (const user of users) {
      const userID = clean(user.UserId);
      const held = assignments.get(userID) ?? [];
      const expertise = Array.from(
        new Set(held.map((c) => c.toUpperCase()).filter((c) => specialitiesByCode.has(c))),
      );
      if (expertise.length === 0) continue; // not a bookable service provider

      const locCode = clean(user.WorkingLocID).toUpperCase();
      const branchName = locMap.get(locCode);
      if (!branchName) continue; // staff not assigned to an enabled branch

      const provider: CatalogProvider = {
        name: clean(user.UserName) || userID,
        role: clean(user.Rmks) || 'Specialist',
        avatar: avatarLetter(clean(user.UserName) || userID),
        expertise,
        techID: userID,
      };

      const branchProviders = providersByLocation[branchName] ?? [];
      branchProviders.push(provider);
      providersByLocation[branchName] = branchProviders;
    }

    /* Tabs follow the order the specialities were entered on Administration,
       and only the ones that actually have something behind them — a tab that
       can never show a service reads as a broken page. */
    const inUse = new Set(services.map((service) => service.category));
    const orderedCategories = [...specialitiesByCode.keys()].filter((code) => inUse.has(code));

    // No usable service data → tell the client there is nothing, so it can say
    // so rather than falling back to a made-up list of services.
    if (services.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        locations: locations.map((location) => ({
          code: clean(location.LocCode),
          name: locMap.get(clean(location.LocCode).toUpperCase()) || clean(location.LocCode),
        })),
        categoryNames,
      });
    }

    return NextResponse.json({
      success: true,
      empty: false,
      locations: locations.map((location) => ({
        code: clean(location.LocCode),
        name: locMap.get(clean(location.LocCode).toUpperCase()) || clean(location.LocCode),
      })),
      categories: orderedCategories,
      categoryNames,
      services,
      providers: providersByLocation,
    });
  } catch (error) {
    console.error('[BOOKING_CATALOG_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load the booking catalog.' },
      { status: 500 },
    );
  }
}
