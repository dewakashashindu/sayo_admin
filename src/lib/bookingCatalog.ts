// src/lib/bookingCatalog.ts
// Shared types + transform helpers for the DB-driven booking catalog.
//
// The public booking page used to be driven by hard-coded mock data. It now
// consumes /api/booking-catalog and maps the result into this Catalog shape,
// which mirrors the page's existing ServiceItem / Provider structures so the
// rest of the UI needs almost no changes.

export interface CatalogService {
  name: string;
  price: string;
  duration: string;
  durationMin: number;
  category: string;
  itemCode: string;
  mof: string;
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
    providersByLocation: providers,
  };
}
