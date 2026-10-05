// src/lib/passwordPolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// ONE password rule for the whole app.
//
// Before this file the minimum length was 3 in the staff reset, 6 for customer
// sign-up / reset, 8 in the staff Settings screens, and no check at all in
// POST /api/security/users — so the weakest door decided how weak a password
// could be. Every screen that SETS a password now calls passwordProblem().
//
// The rule (kept deliberately simple, and enforced on the SERVER so the UI
// cannot be bypassed):
//   • at least 8 characters
//   • at least one letter and one digit
//   • at most 72 bytes — bcrypt silently ignores anything past 72, so a longer
//     password would feel stronger without being stronger
//
// It is NEVER applied on the login screen: an old account whose password was
// created under the old rules must still be able to sign in.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

/** The shortest password this app accepts anywhere. */
export function isLongEnough(password: string): boolean {
  return String(password ?? "").length >= MIN_PASSWORD_LENGTH;
}

/**
 * Check a NEW password. Returns null when it is acceptable, otherwise the one
 * sentence to show the user. `who` only changes the wording ("customer" gets
 * the same rules, just a friendlier sentence).
 */
export function passwordProblem(password: string, who: "staff" | "customer" = "staff"): string | null {
  const value = String(password ?? "");

  if (!value.trim()) {
    return "Type a password first.";
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) {
    return `The password is too long (max ${MAX_PASSWORD_BYTES} characters).`;
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "The password must contain at least one letter and one number.";
  }
  if (who === "customer" && /\s{2,}/.test(value)) {
    return "The password cannot contain two spaces in a row.";
  }
  return null;
}

/** Shown next to the field so people know the rule before they are told off. */
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`;
