// Retries a database call when the remote MySQL host drops or delays the
// connection. Free MySQL hosts are slow/flaky, so the first attempt can hit
// the 5s connect timeout (P1001) or a closed idle connection (P1017).
const RETRYABLE_CODES = new Set(["P1001", "P1008", "P1017", "P2024"]);

export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const code = (err as { code?: string } | null)?.code;
      if (!code || !RETRYABLE_CODES.has(code) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}
