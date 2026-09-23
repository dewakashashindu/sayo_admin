import { Prisma, PrismaClient } from "@prisma/client";
import { withDbRetry } from "./dbRetry";

// The remote MySQL host needs slow-connection timeouts. Values already set in
// DATABASE_URL win; these defaults only fill the gaps.
function withDefaultTimeouts(url: string): string {
  if (!url) return url;
  const qIndex = url.indexOf("?");
  const base = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const params = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : "");
  if (!params.has("connect_timeout")) params.set("connect_timeout", "30");
  if (!params.has("pool_timeout")) params.set("pool_timeout", "30");
  if (!params.has("connection_limit")) params.set("connection_limit", "5");
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// A Prisma client whose every query retries transient connection errors
// (the remote MySQL host drops/delays connections) before surfacing them
// to route handlers. Used in place of `new PrismaClient()`.
export function newRobustPrisma(options?: Prisma.PrismaClientOptions): PrismaClient {
  const url = withDefaultTimeouts(process.env.DATABASE_URL ?? "");
  const base = new PrismaClient({
    ...(url ? { datasourceUrl: url } : {}),
    ...options,
  });
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        return withDbRetry(() => query(args));
      },
    },
  }) as unknown as PrismaClient;
}
