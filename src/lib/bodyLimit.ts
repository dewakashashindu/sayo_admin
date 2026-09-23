import { NextRequest } from "next/server";

export class PayloadTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Payload too large (max ${Math.round(maxBytes / 1024)} KB)`);
    this.name = "PayloadTooLargeError";
  }
}

export function isPayloadTooLarge(err: unknown): err is PayloadTooLargeError {
  return err instanceof PayloadTooLargeError;
}

/**
 * Reads a JSON body while enforcing a byte cap, streamed, so a huge request
 * body can never fill the server memory before it is rejected.
 */
export async function readJsonWithLimit<T = unknown>(
  req: NextRequest,
  maxBytes: number,
): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new PayloadTooLargeError(maxBytes);

  const body = req.body;
  if (!body) return (await req.json()) as T; // already-parsed framework body

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.byteLength ?? 0;
      if (received > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError(maxBytes);
      }
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const text = new TextDecoder().decode(
    chunks.length === 1
      ? chunks[0]
      : (() => {
          const all = new Uint8Array(received);
          let at = 0;
          for (const c of chunks) { all.set(c, at); at += c.byteLength; }
          return all;
        })(),
  );
  return JSON.parse(text) as T;
}
