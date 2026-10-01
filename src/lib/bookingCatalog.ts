
import type { GenderValue } from '@/lib/genderOptions';

export interface CatalogService {
  name: string;
  price: string;
  duration: string;
  durationMin: number;
  category: string;
  itemCode: string;
  /** Which branch this row belongs to — the public page shows one branch. */
  locCode: string;
  /** male / female / other, read from tbl_itemmaster.MOF. */
  gender: GenderValue;
}

export interface CatalogProvider {
  name: string;
  role: string;
  avatar: string;
  expertise: string[];
  techID: string;
}

export interface CatalogLocation {
  code: string;
  name: string;
}

export interface Catalog {
  locations: CatalogLocation[];
  categories: string[];
  servicesByCategory: Record<string, CatalogService[]>;
  /** Flat list, so the page can narrow it by branch and gender. */
  services: CatalogService[];
  providersByLocation: Record<string, CatalogProvider[]>;
}

/** Raw shape returned by GET /api/booking-catalog. */
export interface CatalogApiResponse {
  success: boolean;
  empty?: boolean;
  locations?: CatalogLocation[];
  categories?: string[];
  services?: CatalogService[];
  providers?: Record<string, CatalogProvider[]>;
}

/** Turn the API payload into the shape the booking page consumes. */
export function buildCatalogFromApi(
  data: CatalogApiResponse,
): Catalog | null {
  if (!data?.success || data.empty) return null;

  const locations = data.locations ?? [];
  const categories = data.categories ?? [];
  const services = data.services ?? [];
  const providers = data.providers ?? {};

  // No usable branches / services → treat as empty so callers fall back.
  if (locations.length === 0 || services.length === 0) return null;

  const servicesByCategory: Record<string, CatalogService[]> = {};
  for (const service of services) {
    const bucket = servicesByCategory[service.category] ?? [];
    bucket.push(service);
    servicesByCategory[service.category] = bucket;
  }

  // Keep a stable category order (known first, then the rest) with only the
  // categories that actually have services.
  const presentCategories = categories.filter(
    (category) => (servicesByCategory[category]?.length ?? 0) > 0,
  );
  const leftover = Object.keys(servicesByCategory).filter(
    (category) => !presentCategories.includes(category),
  );
  const orderedCategories = [...presentCategories, ...leftover];

  return {
    locations,
    categories: orderedCategories,
    servicesByCategory,
    services,
    providersByLocation: providers,
  };
}

/**
 * The list the public page may offer for one branch + one gender.
 *
 * The catalog holds every branch's rows (each service has its own price and
 * availability per branch), so it has to be narrowed twice: first to the chosen
 * branch, then to the chosen gender. "other" is the neutral answer and is never
 * filtered.
 *
 * `fallback` is true when the branch has nothing filed under that gender — the
 * caller shows the whole branch list and says so, because an empty list
 * dead-ends the booking.
 */
export function filterServicesFor(
  services: CatalogService[],
  locCode: string,
  gender: string,
): { list: CatalogService[]; fallback: boolean } {
  const wanted = (locCode || '').trim().toUpperCase();
  const branchServices = services.filter(
    (s) => !wanted || !s.locCode || s.locCode.toUpperCase() === wanted,
  );
  if (!gender || gender === 'other') return { list: branchServices, fallback: false };

  const byGender = branchServices.filter((s) => !s.gender || s.gender === gender);
  if (byGender.length === 0) return { list: branchServices, fallback: true };
  return { list: byGender, fallback: false };
}

/** The LocCode behind a branch DISPLAY name (the page's `location` state). */
export function locCodeForName(
  locations: CatalogLocation[],
  name: string,
): string {
  const match = locations.find((l) => l.name === name);
  return (match?.code ?? '').trim().toUpperCase();
}
