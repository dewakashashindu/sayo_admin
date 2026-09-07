// src/app/api/booking-catalog/route.ts
// Public catalog feed for the booking page.
//
// The booking UI was previously driven by hard-coded mock data inside
// src/app/booking/page.tsx. This endpoint reads the live master tables so the
// public booking flow always reflects what is configured in the POS:
//   • enabled branches (tbl_locationmaster)
//   • service items + price + duration (tbl_itemmaster)
//   • enabled staff and their areas of expertise (tbl_userdetails +
//     tbl_technicianspecilities + tbl_technicianspecilityassignment)
//
// A booking page that consumes this simply renders whatever is returned. When
// there is no configured service data yet (empty / freshly seeded DB) the
// endpoint returns `empty: true` and the client falls back to its curated
// default catalog — the page never goes blank.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ─────────────────────────────────────────────────────────────────────────────
   Constants / helpers
───────────────────────────────────────────────────────────────────────────── */

// The booking page exposes a fixed set of salon categories. We normalise the
// free-text POS category names and staff specialities into these so that the
// page's category tabs, provider filtering and i18n all keep working no matter
// what codes/descriptions the live database uses.
const KNOWN_CATEGORIES = ['BRIDAL', 'WAX', 'HAIR', 'SKIN', 'NAIL', 'BODY'];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  BRIDAL: ['bridal', 'wedding', 'makeup', 'groom', 'bride'],
  WAX:    ['wax', 'waxing'],
  HAIR:   ['hair', 'hairstyl', 'cut', 'color', 'bleach', 'keratin', 'styl'],
  SKIN:   ['skin', 'facial', 'acne', 'cleanup', 'cleanse', 'glow', 'treatment'],
  NAIL:   ['nail', 'manicure', 'pedicure', 'gel'],
  BODY:   ['body', 'massage', 'scrub', 'wrap', 'aroma', 'spa'],
};

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCode(value: unknown): string {
  const code = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return code || 'OTHER';
}

/** Map an arbitrary POS category / speciality label to a known slot (or a
 *  derived code) so the booking page's category tabs stay meaningful. */
function normalizeCategory(label: unknown): string {
  const input = clean(label).toLowerCase();
  if (!input) return 'OTHER';

  for (const category of KNOWN_CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords.some((keyword) => input.includes(keyword))) {
      return category;
    }
  }

  // No keyword match — keep the raw code (or its description) so nothing is lost.
  return normalizeCode(label);
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
  category: string;
  itemCode: string;
  mof: string;
}

interface CatalogProvider {
  name: string;
  role: string;
  avatar: string;
  expertise: string[];
  techID: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   GET  /api/booking-catalog
───────────────────────────────────────────────────────────────────────────── */
export async function GET() {
  try {
    const [locations, items, category1, users, specialities, assignments] =
      await Promise.all([
        prisma.tbl_LocationMaster.findMany({
          where: { Enable: true },
          orderBy: { LocCode: 'asc' },
        }),
        prisma.tbl_ItemMaster.findMany({
          where: { Enable: true },
          select: {
            LocCode: true,
            ItemCode: true,
            ItemDes: true,
            ItemPrintDes: true,
            Retailprice: true,
            SerDuration: true,
            Category1: true,
            Category2: true,
            Category3: true,
            Category4: true,
            MOF: true,
            ServiceItem: true,
          },
        }),
        prisma.tbl_ItemCategory1.findMany({ where: { Enable: true } }),
        prisma.tbl_userdetails.findMany({ where: { Enable: true } }),
        prisma.tbl_technicianspecilities.findMany(),
        prisma.tbl_technicianspecilityassignment.findMany(),
      ]);

    const locMap = new Map<string, string>();
    for (const location of locations) {
      const code = clean(location.LocCode).toUpperCase();
      const name = clean(location.LocDes);
      locMap.set(code, name || code);
    }

    const catDesMap = new Map<string, string>();
    for (const row of category1) {
      catDesMap.set(clean(row.CatCode).toUpperCase(), clean(row.CatDes));
    }

    const seenCodes = new Set<string>();
    // The booking page identifies a service by `name + price` (how it toggles
    // selection). Collapse rows that resolve to the exact same display name and
    // price so the UI never shows two indistinguishable entries — the master
    // table can hold several rows with the same ItemPrintDes but different
    // seconds/volumes. Distinct-by-price rows are kept.
    const seenServiceKeys = new Set<string>();
    const services: CatalogService[] = [];

    for (const item of items) {
      const serviceItem = Boolean(item.ServiceItem);
      if (!serviceItem) continue;

      const itemCode = clean(item.ItemCode);
      if (!itemCode) continue;

      // The booking page shows one service list independent of branch, so
      // deduplicate by ItemCode and prefer the first row we see.
      if (seenCodes.has(itemCode)) continue;
      seenCodes.add(itemCode);

      const catRaw =
        clean(item.Category1) !== '' && clean(item.Category1).toUpperCase() !== ' '
          ? catDesMap.get(clean(item.Category1).toUpperCase()) || item.Category1
          : item.ItemDes;

      const category = normalizeCategory(catRaw || item.Category1 || item.ItemDes);
      const durationMin = Math.max(0, Math.floor(Number(item.SerDuration) || 0));
      const name = clean(item.ItemPrintDes) || clean(item.ItemDes) || itemCode;
      const price = formatPrice(item.Retailprice);

      const serviceKey = `${name.toLowerCase()}||${price.toLowerCase()}`;
      if (seenServiceKeys.has(serviceKey)) continue; // identical display row
      seenServiceKeys.add(serviceKey);

      services.push({
        name,
        price,
        duration: formatDuration(durationMin),
        durationMin,
        category,
        itemCode,
        mof: clean(item.MOF || 'O').toUpperCase().slice(0, 1) || 'O',
      });
    }

    /* Providers grouped by the branch they work at (display name), keyed by
       the same name the user sees on the location cards. Only staff with an
       area-of-speciality assignment are treated as bookable providers. */
    const specByID = new Map<string, string>();
    for (const spec of specialities) {
      specByID.set(clean(spec.SpecAreaID).toUpperCase(), clean(spec.Specilities));
    }

    const assignmentsByUser = new Map<string, string[]>();
    for (const assignment of assignments) {
      const userID = clean(assignment.UserID).toUpperCase();
      const specID = clean(assignment.SpecAreaID).toUpperCase();
      const list = assignmentsByUser.get(userID) ?? [];
      const label = specByID.get(specID);
      if (label) list.push(label);
      assignmentsByUser.set(userID, list);
    }

    const providersByLocation: Record<string, CatalogProvider[]> = {};
    for (const user of users) {
      const userID = clean(user.UserId);
      const expertiseRaw = assignmentsByUser.get(userID.toUpperCase()) ?? [];
      if (expertiseRaw.length === 0) continue; // not a bookable service provider

      const locCode = clean(user.WorkingLocID).toUpperCase();
      const branchName = locMap.get(locCode);
      if (!branchName) continue; // staff not assigned to an enabled branch

      const expertise = Array.from(new Set(expertiseRaw.map(normalizeCategory)));
      const role = clean(user.Rmks) || 'Specialist';

      const provider: CatalogProvider = {
        name: clean(user.UserName) || userID,
        role,
        avatar: avatarLetter(clean(user.UserName) || userID),
        expertise,
        techID: userID,
      };

      const branchProviders = providersByLocation[branchName] ?? [];
      branchProviders.push(provider);
      providersByLocation[branchName] = branchProviders;
    }

    // Category tabs: known categories first, then any derived/extra codes.
    const serviceCategories = Array.from(
      new Set(services.map((service) => service.category)),
    );
    const orderedCategories = [
      ...KNOWN_CATEGORIES.filter((category) => serviceCategories.includes(category)),
      ...serviceCategories.filter(
        (category) => !KNOWN_CATEGORIES.includes(category),
      ),
    ];

    // No usable service data → tell the client to keep its curated default.
    if (services.length === 0) {
      return NextResponse.json({ success: true, empty: true });
    }

    return NextResponse.json({
      success: true,
      empty: false,
      locations: locations.map((location) => ({
        code: clean(location.LocCode),
        name: locMap.get(clean(location.LocCode).toUpperCase()) || clean(location.LocCode),
      })),
      categories: orderedCategories,
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
