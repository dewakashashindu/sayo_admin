// src/lib/sqlIdent.ts
// ─────────────────────────────────────────────────────────────────────────────
// A backtick-quoted SQL identifier.
//
// Raw SQL is unavoidable in a few places (information_schema lookups, the
// legacy tables Prisma does not model, statements Prisma has no builder for).
// In those places a column or table name can come from configuration, and a
// stray backtick would let a name break out of its quoting. Every name goes
// through here first: a backtick inside the name is doubled, which is how SQL
// escapes it, so the result is always one identifier and never two.
//
// This is a quoting helper, not a permission check. A name that is not on the
// allow-list should never reach it at all.
// ─────────────────────────────────────────────────────────────────────────────

/** `tbl_itemmaster` → `` `tbl_itemmaster` ``, with any backtick in the name doubled. */
export function quoteIdent(name: string): string {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

/** A `'value'` SQL string literal, with any single quote doubled. */
export function quoteLiteral(value: string): string {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
