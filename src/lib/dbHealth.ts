import { PrismaClient } from "@prisma/client";
import { newRobustPrisma } from "@/lib/prismaRobust";

export interface DbTarget {
  /** host:port */
  host: string;
  database: string;
  user: string;
  /** `mysql://…` was not a usable MySQL URL. */
  malformed: boolean;
}

/** Read host / port / database / user out of DATABASE_URL (never the password). */
export function describeDbTarget(url = process.env.DATABASE_URL ?? ""): DbTarget {
  if (!url) {
    return { host: "(DATABASE_URL is not set)", database: "", user: "", malformed: false };
  }
  try {
    const parsed = new URL(url);
    return {
      host: `${parsed.hostname}:${parsed.port || "3306"}`,
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      user: decodeURIComponent(parsed.username),
      malformed: parsed.protocol !== "mysql:",
    };
  } catch {
    return { host: "(DATABASE_URL is not a valid URL)", database: "", user: "", malformed: true };
  }
}

export interface DbHealth {
  reachable: boolean;
  latencyMs: number;
  target: DbTarget;
  serverVersion?: string;
  error?: string;
  code?: string;
  hint?: string;
}

const HINTS: { test: RegExp | string; hint: string }[] = [
  {
    test: "P1000",
    hint: "The host answered, but the user name or password was rejected. Reset the database password in the hosting panel and copy it into DATABASE_URL exactly.",
  },
  {
    test: "P1001",
    hint:
      "The application could not open a connection to the MySQL server at all. Check the host in DATABASE_URL against the hosting panel (it changes when the database is moved), make sure the database is not suspended, and make sure remote access is allowed for your internet connection. If the host is correct and still unreachable, your ISP or firewall may be blocking port 3306.",
  },
  {
    test: "P1003",
    hint: "The database name in DATABASE_URL does not exist on that server.",
  },
  {
    test: "P1008",
    hint: "The connection timed out — the server is up but too slow to answer (or a firewall is silently dropping the packets).",
  },
  {
    test: "P1017",
    hint: "The server closed the connection — usually too many open connections from a shared hosting database. Add ?connection_limit=1 to DATABASE_URL.",
  },
  {
    test: "P2024",
    hint: "No free connection in the pool. Add ?connection_limit=1&pool_timeout=20 to DATABASE_URL.",
  },
  {
    test: "DATABASE_URL is not set",
    hint: "Create a .env file in the project folder with DATABASE_URL=mysql://user:password@host:3306/database",
  },
  {
    test: "not a valid URL",
    hint: "DATABASE_URL must look like mysql://user:password@host:3306/database — no quotes, no spaces, and the password must be URL-encoded (an @ in a password becomes %40).",
  },
];

function hintFor(error: string, code: string): string {
  const haystack = `${code} ${error}`;
  for (const entry of HINTS) {
    if (haystack.includes(String(entry.test))) return entry.hint;
  }
  return "Check DATABASE_URL and the hosting panel, then try again.";
}

/** Run `SELECT 1` with a hard timeout so the page never hangs on a dead host. */
export async function checkDatabase(
  timeoutMs = 6000,
): Promise<DbHealth> {
  const target = describeDbTarget();
  const started = Date.now();

  if (target.malformed || target.host.startsWith("(")) {
    return {
      reachable: false,
      latencyMs: 0,
      target,
      error: target.malformed
        ? "DATABASE_URL is not a valid URL."
        : "DATABASE_URL is not set.",
      hint: hintFor(target.host, ""),
    };
  }

  const prisma = newRobustPrisma({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  try {
    const result = await Promise.race([
      prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timed out after ${timeoutMs} ms`)),
          timeoutMs,
        ),
      ),
    ]);
    return {
      reachable: true,
      latencyMs: Date.now() - started,
      target,
      serverVersion: String(result?.[0]?.v ?? ""),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code ?? "";
    return {
      reachable: false,
      latencyMs: Date.now() - started,
      target,
      error: error.split("\n").filter(Boolean).slice(0, 3).join(" · "),
      code,
      hint: hintFor(error, code),
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
