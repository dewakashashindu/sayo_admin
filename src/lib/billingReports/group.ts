export function groupBy<T>(rows: T[], key: (row: T) => string): { key: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const k = key(row) || "UNKNOWN";
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  });
  return [...map.entries()].map(([k, r]) => ({ key: k, rows: r }));
}

export function sum(rows: { [k: string]: unknown }[] | number[], pick?: (n: never) => number): number {
  if (!rows.length) return 0;
  if (typeof rows[0] === "number") {
    return (rows as number[]).reduce((a, b) => a + b, 0);
  }
  const fn = pick as (n: never) => number;
  return (rows as never[]).reduce((a, b) => a + (fn(b) || 0), 0);
}
