import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  cloudPrisma: PrismaClient | undefined;
};

type PrismaMariaDbConfig = Exclude<ConstructorParameters<typeof PrismaMariaDb>[0], string>;

// ── URL parser ──────────────────────────────────────────────────────────────
function parseDbUrl(url: string): PrismaMariaDbConfig {
  const normalized = url.replace(/^mysql:\/\//, 'mariadb://');
  const parsed = new URL(normalized);

  const config: PrismaMariaDbConfig = {
    host:            parsed.hostname,
    port:            parseInt(parsed.port || '3306', 10),
    user:            decodeURIComponent(parsed.username),
    password:        decodeURIComponent(parsed.password),
    database:        parsed.pathname.replace(/^\//, ''),
    connectionLimit: 5,
    connectTimeout:  15_000,
    acquireTimeout:  15_000,
    idleTimeout:     60_000,
  };

  const sslParam =
    parsed.searchParams.get('sslaccept') ||
    parsed.searchParams.get('sslmode')   ||
    parsed.searchParams.get('ssl');

  if (sslParam === 'strict' || sslParam === 'require' || sslParam === 'true') {
    config.ssl = { rejectUnauthorized: true };
  }

  return config;
}

// ── Configs — require CLOUD_DATABASE_URL only (single cloud DB)
const cloudRawUrl = process.env.CLOUD_DATABASE_URL || '';
if (!cloudRawUrl) {
  throw new Error('CLOUD_DATABASE_URL environment variable is required when using a single cloud database.');
}
const cloudConfig = parseDbUrl(cloudRawUrl);

// ── Prisma singletons ────────────────────────────────────────────────────────
export const cloudPrisma: PrismaClient =
  globalForPrisma.cloudPrisma ??
  new PrismaClient({
    adapter: new PrismaMariaDb(cloudConfig),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// ── Persist across hot reloads in dev ───────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.cloudPrisma = cloudPrisma;
}

// ── Export default alias for single-instance routes ─────────────────────────
export const prisma = cloudPrisma;