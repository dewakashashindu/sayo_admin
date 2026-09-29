// src/lib/rateLimitDb.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit counters that survive a restart.
//
// The in-memory limiter (src/lib/rateLimit.ts) is fine for "slow this down",
// but every counter dies when the process does — an IIS app-pool recycle, a
// deploy, a crash — and then a brute-force run starts again with a clean slate.
// On a hosted Windows plan that happens on a schedule the attacker can simply
// wait for.
//
// This module keeps the SAME rule shape, but the counter lives in MySQL
// (Tbl_RateLimit), so the window is shared by every worker and every restart.
// If the table or the database is unavailable it falls back to the in-memory
// limiter instead of failing the request — a limiter that throws would take
// sign-in down with it.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit, type RateDecision, type RateRule } from "@/lib/rateLimit";
import { ensureAuthTables } from "@/lib/authTables";

let warnedOnce = false;

function keyHash(key: string): string {
  return crypto.createHash("sha256").update(String(key ?? "").toLowerCase().slice(0, 200)).digest("hex");
}

function decisionFrom(count: number, ageSec: number, rule: RateRule): RateDecision {
  const limit = Math.max(1, Math.floor(rule.limit));
  const windowSec = Math.max(1, Math.ceil(rule.windowMs / 1000));
  const ok = count <= limit;
  return {
    ok,
    remaining: ok ? Math.max(0, limit - count) : 0,
    retryAfterSec: Math.max(1, windowSec - Math.max(0, Math.floor(ageSec))),
    count,
  };
}

/**
 * Count one request. Persisted in MySQL when possible, in memory otherwise.
 * Never throws.
 */
export async function rateLimitStrong(rule: RateRule, now = Date.now()): Promise<RateDecision> {
  const windowSec = Math.max(1, Math.ceil(rule.windowMs / 1000));
  const hash = keyHash(rule.key);

  try {
    await ensureAuthTables();
    await prisma.$executeRawUnsafe(
      `INSERT INTO Tbl_RateLimit (Bucket, KeyHash, Cnt, WindowStart)
       VALUES (?, ?, 1, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         Cnt = IF(TIMESTAMPDIFF(SECOND, WindowStart, UTC_TIMESTAMP(3)) >= ?, 1, Cnt + 1),
         WindowStart = IF(TIMESTAMPDIFF(SECOND, WindowStart, UTC_TIMESTAMP(3)) >= ?, UTC_TIMESTAMP(3), WindowStart)`,
      rule.bucket.slice(0, 60),
      hash,
      windowSec,
      windowSec,
    );

    const rows = await prisma.$queryRawUnsafe<{ Cnt: number; AgeSec: number }[]>(
      `SELECT Cnt, TIMESTAMPDIFF(SECOND, WindowStart, UTC_TIMESTAMP(3)) AS AgeSec
         FROM Tbl_RateLimit WHERE Bucket = ? AND KeyHash = ?`,
      rule.bucket.slice(0, 60),
      hash,
    );
    const row = rows[0];
    if (!row) return rateLimit(rule, now); // row vanished — fall back
    return decisionFrom(Number(row.Cnt ?? 0), Number(row.AgeSec ?? 0), rule);
  } catch (err) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.error(
        "[rateLimitDb] falling back to in-memory counters:",
        err instanceof Error ? err.message : String(err),
      );
    }
    return rateLimit(rule, now);
  }
}

/** Look at a rule WITHOUT counting — “is this caller already over the line?” */
export async function rateLimitStrongPeek(rule: RateRule): Promise<RateDecision> {
  const windowSec = Math.max(1, Math.ceil(rule.windowMs / 1000));
  const hash = keyHash(rule.key);
  try {
    await ensureAuthTables();
    const rows = await prisma.$queryRawUnsafe<{ Cnt: number; AgeSec: number }[]>(
      `SELECT Cnt, TIMESTAMPDIFF(SECOND, WindowStart, UTC_TIMESTAMP(3)) AS AgeSec
         FROM Tbl_RateLimit WHERE Bucket = ? AND KeyHash = ?`,
      rule.bucket.slice(0, 60),
      hash,
    );
    const row = rows[0];
    if (!row) return decisionFrom(0, windowSec, rule);
    if (Number(row.AgeSec ?? 0) >= windowSec) return decisionFrom(0, windowSec, rule);
    return decisionFrom(Number(row.Cnt ?? 0) + 1, Number(row.AgeSec ?? 0), rule);
  } catch {
    return decisionFrom(0, windowSec, rule);
  }
}

/** A good password / a correct code resets the account's counter. */
export async function clearRateStrong(bucket: string, key: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM Tbl_RateLimit WHERE Bucket = ? AND KeyHash = ?`,
      bucket.slice(0, 60),
      keyHash(key),
    );
  } catch {
    /* best effort — the memory fallback is not affected */
  }
}

/** Housekeeping: drop counters whose window closed more than a day ago. */
export async function pruneRateLimits(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM Tbl_RateLimit WHERE WindowStart < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)`,
    );
  } catch {
    /* best effort */
  }
}
