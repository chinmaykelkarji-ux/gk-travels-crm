// ============================================================
// Small, exact helpers for the reports. Dependency-free and unit-tested:
// every number on the Reports screen is a count, a sum in paise, a rate or a
// median computed here from rows the server read — never estimated.
// ============================================================

/** "2026-09" for a date in India time. */
export function monthKey(d: Date | string): string {
  const t = typeof d === 'string' ? (d.length === 10 ? Date.parse(`${d}T00:00:00+05:30`) : Date.parse(d)) : d.getTime();
  return new Date(t + 330 * 60_000).toISOString().slice(0, 7);
}

/** The last `n` months ending with the month of `today` (YYYY-MM-DD), oldest first. */
export function lastMonths(n: number, today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** A percentage to one decimal, or null when there is nothing to divide by. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Counts per month for the months asked, zero where there is nothing. */
export function countByMonth(dates: (Date | string)[], months: string[]): { month: string; count: number }[] {
  const by = new Map(months.map(m => [m, 0]));
  for (const d of dates) { const k = monthKey(d); if (by.has(k)) by.set(k, by.get(k)! + 1); }
  return months.map(month => ({ month, count: by.get(month)! }));
}

/** Top `n` by a number, ties broken by name so the order never jumps between visits. */
export function topBy<T extends { name: string }>(rows: T[], value: (r: T) => number, n = 10): T[] {
  return [...rows].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name)).slice(0, n);
}
