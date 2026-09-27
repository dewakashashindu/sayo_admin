// src/lib/accessCipher.ts
// Reversible obfuscation for Tbl_UserAccess_StdProfile — VB6-style XOR cipher
// with a base64url safe layer, so FuncID/ACCESS look unreadable in the table
// but decode back to plain codes without any extra key storage.
// (obfuscation, not real encryption — anyone with the app source can decode)
//
// The key comes ONLY from the ACCESS_CIPHER_KEY env variable (your .env).
// CHANGING the key makes previously saved ciphered rows unreadable —
// re-save each group's profile afterwards.

function getKey(): string {
  const k = process.env.ACCESS_CIPHER_KEY?.slice(0, 64);
  if (!k) {
    throw new Error(
      "ACCESS_CIPHER_KEY is not set. Add it to your .env file, e.g. ACCESS_CIPHER_KEY=your-secret-key",
    );
  }
  return k;
}

export function cipher(text: string): string {
  const key = getKey();
  const raw = Buffer.from(text.split("").map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length)));
  return raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decipher(enc: string): string {
  const key = getKey();
  try {
    const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    const raw = Buffer.from(b64, "base64").toString("binary");
    return raw
      .split("")
      .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
      .join("");
  } catch {
    return "";
  }
}
