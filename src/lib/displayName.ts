// src/lib/displayName.ts
// ─────────────────────────────────────────────────────────────────────────────
// What the panel puts next to the avatar.
//
// The shop's staff rows keep whatever was typed at user-creation time — often
// “MR. KAMAL”, sometimes “MR KAMAL PERERA”, sometimes just the login name with
// no user name at all. The header shows the PERSON'S OWN name now, so this is
// the one place that decides how it looks:
//
//   · a leading title (MR / MRS / MS / MISS / DR / REV / PROF / SIR / MADAM) is
//     dropped — “MR. SAYO” is a title, not a name;
//   · the rest is collapsed to single spaces;
//   · an empty user name falls back to the login name, and only if BOTH are
//     missing does the caller's placeholder survive.
//
// Kept deliberately small and dependency-free: the server (session payload) and
// the browser (useMyAccess) both use it.
// ─────────────────────────────────────────────────────────────────────────────

const TITLES = [
  "mr", "mrs", "ms", "miss", "mstr", "master",
  "dr", "rev", "prof", "sir", "madam", "madam", "mr&mrs",
];

/** “MR. KAMAL PERERA” → “KAMAL PERERA”; “miss  nadee” → “nadee” */
export function stripTitle(raw: unknown): string {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";

  /* one optional title, optionally followed by a dot, then a space */
  const match = value.match(/^([A-Za-z&.]{2,8})\.?\s+(.*)$/);
  if (match) {
    const head = match[1].toLowerCase().replace(/\.$/, "");
    if (TITLES.includes(head) && match[2].trim()) return match[2].trim();
  }
  return value;
}

/** The name to print: the person's own, else their login name, else the fallback. */
export function displayNameOf(
  userName?: string | null,
  loginName?: string | null,
  fallback = "",
): string {
  const own = stripTitle(userName);
  if (own) return own;
  const login = stripTitle(loginName);
  if (login) return login;
  return String(fallback ?? "").trim();
}

/** The single letter in the round avatar. */
export function initialOf(name?: string | null, fallback = "A"): string {
  const value = stripTitle(name).toUpperCase();
  return value.charAt(0) || fallback;
}
