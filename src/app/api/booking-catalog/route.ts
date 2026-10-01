import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { genderFromMof, type GenderValue } from '@/lib/genderOptions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  locCode: string;
  /** male / female / other — read from tbl_itemmaster.MOF. */
  gender: GenderValue;
}

interface CatalogProvider {
  name: string;
  role: string;
  avatar: string;
  expertise: string[];
  techID: string;
}

export async function GET() {
  try {
    const [locations, items, category1, category2, category3, category4, users, specialities, assignments] =
      await Promise.all([
        prisma.tbl_LocationMaster.findMany({
          where: { Enable: true },
          orderBy: { LocCode: 'asc' },
        }),
        prisma.tbl_ItemMaster.findMany({
          where: { Enable: true, ServiceItem: true },
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
        prisma.tbl_ItemCategory2.findMany({ where: { Enable: true } }),
        prisma.tbl_ItemCategory3.findMany({ where: { Enable: true } }),
        prisma.tbl_ItemCategory4.findMany({ where: { Enable: true } }),
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

    /* One lookup for all four category levels. An item may be filed under
       Category1..Category4, and the deepest level that actually holds a code
       is the one the customer should see ("Hair > Treatment > Protein"). */
    const catDesMap = new Map<string, string>();
    for (const level of [category1, category2, category3, category4]) {
      for (const row of level) {
        catDesMap.set(clean(row.CatCode).toUpperCase(), clean(row.CatDes));
      }
    }

    // Dedupe per BRANCH, not per code: the same service carries its own price,
    // duration and availability in every location, and the booking page shows
    // only the chosen branch. Collapsing across branches (as this route used
    // to) kept the first row seen and showed another branch's price.
    const seenKeys = new Set<string>();
    const seenServiceKeys = new Set<string>();
    const services: CatalogService[] = [];

    for (const item of items) {
      const locCode = clean(item.LocCode).toUpperCase();
      if (!locMap.has(locCode)) continue;   // item filed under a disabled branch

      const itemCode = clean(item.ItemCode);
      if (!itemCode) continue;

      const key = `${locCode}|${itemCode.toUpperCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      /* Category1 is the top-level group the page's tabs follow; Category2-4
         are refinements of it. Using the DEEPEST populated level instead put
         "Protein Treatment" under SKIN (the word "treatment" is a SKIN
         keyword) and "Aroma Massage" under BODY while its parent said HAIR —
         the branch's own grouping is the one the customer recognises. */
      const chain = [item.Category1, item.Category2, item.Category3, item.Category4];
      let catLabel = '';
      for (const raw of chain) {
        const code = clean(raw);
        if (!code) continue;
        catLabel = catDesMap.get(code.toUpperCase()) || code;
        break;
      }
      if (!catLabel) catLabel = clean(item.ItemDes) || itemCode;

      const category = normalizeCategory(catLabel);
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
        category,
        itemCode,
        locCode,
        gender: genderFromMof(item.MOF),
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

    // Category tabs: known categories first, then any derived/extra codes. The
    // union is taken over every branch on purpose — the page narrows the list
    // again for the chosen branch and gender, and a tab that vanished when a
    // branch was picked read as a bug.
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
