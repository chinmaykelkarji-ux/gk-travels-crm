// Money in integer paise (hard rule 3). The database stores Decimal(12,2);
// every sum, product or split goes through paise so float drift never
// reaches a total. Rupee numbers enter and leave only at the edges.

export type Paise = number;

/** ₹ → paise, rounding half away from zero at the paisa. */
export function toPaise(rupees: number | string | null | undefined): Paise {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const n = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  // toFixed(4) first so 1.005 (really 1.00499999…) still rounds to 1.01.
  return sign * Math.round(Number((Math.abs(n) * 100).toFixed(4)));
}

/** paise → ₹ with exactly two decimals of precision. */
export function toRupees(paise: Paise): number {
  return Math.round(paise) / 100;
}

export function sumPaise(values: Paise[]): Paise {
  return values.reduce((s, v) => s + v, 0);
}

/** Integer × rate (e.g. nights × nightly rate) stays exact. */
export function mulPaise(paise: Paise, factor: number): Paise {
  return Math.round(paise * factor);
}

/** Percentage of an amount (GST, margin), rounded to the paisa. */
export function pctOf(paise: Paise, percent: number): Paise {
  return Math.round((paise * percent) / 100);
}

/**
 * Splits an amount into parts proportional to weights with no paisa lost:
 * the rounding remainder goes to the largest weights first.
 */
export function allocatePaise(total: Paise, weights: number[]): Paise[] {
  if (total < 0) return allocatePaise(-total, weights).map(v => -v);
  const sumW = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (sumW <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map(w => (total * Math.max(0, w)) / sumW);
  const out = raw.map(r => Math.floor(r));
  let rest = total - out.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] })).sort((a, b) => b.frac - a.frac || b.w - a.w);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k].i] += 1;
  return out;
}

/** "₹1,23,456.50" (Indian digit grouping). */
export function formatInr(paise: Paise): string {
  const r = toRupees(paise);
  return `₹${r.toLocaleString('en-IN', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
