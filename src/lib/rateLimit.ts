// src/lib/rateLimit.ts
// ─────────────────────────────────────────────────────────────────────────────
// A small in-memory rate limiter, shared by every public endpoint.
//
// WHY: the booking form, the register form and the password-reset screens can be
// opened by anyone without logging in — and each of them sends an SMS or an
// e-mail. A script calling them in a loop empties the Text.lk balance and gets
// the Gmail account blocked. So every one of those endpoints is now counted per
// caller, per account and per phone number.
//
// WHAT IT IS NOT: a distributed limiter. The counters live in this process, so
// if the app is ever started as several processes behind a load balancer, each
// process counts on its own. For a single server (this shop) that is exactly
// what is needed, and it needs no Redis and no extra service.
//
// The arithmetic is kept pure and separate from the storage, so
// `bash scripts/run-billing-tests.sh` can check the rules without a server.
// ─────────────────────────────────────────────────────────────────────────────

/** How a bucket behaves. `limit` requests are allowed per `windowMs`. */
export interface RateRule {
  /** Which counter this is: "login:ip", "booking:phone", … */
  bucket: string;
  /** Who is being counted: an IP address, an e-mail, a phone number … */
  key: string;
  /** How many are allowed inside one window. */
  limit: number;
  /** Length of the window in milliseconds. */
  windowMs: number;
}

export interface RateDecision {
  /** May this request go through? */
  ok: boolean;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — for the `Retry-After` header. */
  retryAfterSec: number;
  /** How many requests were counted in this window (after counting this one). */
  count: number;
}

interface Counter {
  count: number;
  /** When the current window started. */
  first: number;
}

/** The counters. Keyed by `bucket|key`. */
const counters = new Map<string, Counter>();

/** Never let the map grow without a limit, however odd the traffic is. */
const MAX_COUNTERS = 20_000;

function counterKey(rule: RateRule): string {
  return `${rule.bucket}|${String(rule.key ?? "").slice(0, 200).toLowerCase()}`;
}

/**
 * The whole rule, as a pure function: given the counter as it was and the
 * clock, say whether the request counts and what the counter becomes.
 * A window that has run out starts again with this request as its first.
 */
export function decideRate(
  previous: Counter | undefined,
  now: number,
  rule: { limit: number; windowMs: number },
): { decision: RateDecision; counter: Counter } {
  const limit = Math.max(1, Math.floor(rule.limit));
  const windowMs = Math.max(1000, Math.floor(rule.windowMs));

  const fresh = !previous || now - previous.first >= windowMs;
  const count = fresh ? 1 : previous.count + 1;
  const first = fresh ? now : previous.first;
  const retryAfterSec = Math.max(1, Math.ceil((first + windowMs - now) / 1000));
  const ok = count <= limit;

  return {
    decision: {
      ok,
      remaining: ok ? limit - count : 0,
      retryAfterSec,
      count,
    },
    counter: { count, first },
  };
}

/** Drop every counter whose window has finished. Cheap; runs on each call. */
export function sweepCounters(now: number, windowFallbackMs = 60 * 60 * 1000): void {
  for (const [key, value] of counters) {
    if (now - value.first > windowFallbackMs) counters.delete(key);
  }
  if (counters.size > MAX_COUNTERS) {
    /* still too many: keep the newest half */
    const entries = [...counters.entries()].sort((a, b) => b[1].first - a[1].first);
    counters.clear();
    for (const [key, value] of entries.slice(0, Math.floor(MAX_COUNTERS / 2))) {
      counters.set(key, value);
    }
  }
}

/**
 * Count this request against the rule.
 * Call it ONCE per request: every call counts.
 */
export function rateLimit(rule: RateRule, now = Date.now()): RateDecision {
  sweepCounters(now);
  const key = counterKey(rule);
  const { decision, counter } = decideRate(counters.get(key), now, rule);
  counters.set(key, counter);
  return decision;
}

/** Look at a rule WITHOUT counting — “is this caller already over the line?” */
export function rateLimitPeek(rule: RateRule, now = Date.now()): RateDecision {
  const key = counterKey(rule);
  const previous = counters.get(key);
  if (!previous || now - previous.first >= Math.max(1000, rule.windowMs)) {
    return {
      ok: true,
      remaining: Math.max(1, Math.floor(rule.limit)),
      retryAfterSec: 0,
      count: 0,
    };
  }
  const ok = previous.count < Math.max(1, Math.floor(rule.limit));
  return {
    ok,
    remaining: ok ? Math.max(1, Math.floor(rule.limit)) - previous.count : 0,
    retryAfterSec: Math.max(
      1,
      Math.ceil((previous.first + rule.windowMs - now) / 1000),
    ),
    count: previous.count,
  };
}

/** Forget one counter — used when a login succeeds, so a good password resets it. */
export function clearRate(bucket: string, key: string): void {
  counters.delete(`${bucket}|${String(key ?? "").slice(0, 200).toLowerCase()}`);
}

/** Tests only: how many counters are alive right now. */
export function rateCounterCount(): number {
  return counters.size;
}

/** Tests only: throw the whole table away. */
export function resetAllRates(): void {
  counters.clear();
}

/** “Try again in 12 minutes.” — the sentence a person reads on a 429. */
export function waitWords(retryAfterSec: number): string {
  const seconds = Math.max(1, Math.floor(retryAfterSec));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * The message each endpoint shows when its limit is reached. Kept here so the
 * wording is the same everywhere and can be tested.
 */
export function rateMessage(kind: RateMessageKind, retryAfterSec: number): string {
  const wait = waitWords(retryAfterSec);
  switch (kind) {
    case "booking":
      return `Too many booking requests from this device. Please wait ${wait} and try again, or call the salon.`;
    case "register":
      return `Too many sign-up attempts from this device. Please wait ${wait} and try again.`;
    case "login":
      return `Too many sign-in attempts. For your safety the account is paused for ${wait}.`;
    case "otp_send":
      return `Too many reset codes were requested. Please wait ${wait} and try again.`;
    case "otp_reset":
      return `Too many reset attempts. Please wait ${wait} and try again.`;
    case "health":
      return `Too many health checks. Please wait ${wait}.`;
    default:
      return `Too many requests. Please wait ${wait} and try again.`;
  }
}

export type RateMessageKind =
  | "booking"
  | "register"
  | "login"
  | "otp_send"
  | "otp_reset"
  | "health"
  | "other";
