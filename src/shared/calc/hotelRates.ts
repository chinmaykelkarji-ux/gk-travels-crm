// Hotel rate sheets: season rows per room type and meal plan, priced per
// night. Pure so the rate editor, the CSV import and the hotel-booking form
// all agree on overlaps and on what a stay costs.

import { toPaise, toRupees, sumPaise, type Paise } from './money';

export interface RateRow {
  id?:          string;
  mealPlan:     string;
  validFrom:    string; // YYYY-MM-DD, inclusive
  validTo:      string; // YYYY-MM-DD, inclusive
  costPerNight: number;
  sellPerNight?: number | null;
}

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Returns the first row that overlaps `candidate` for the same meal plan, ignoring the row itself. */
export function findRateOverlap(candidate: RateRow, existing: RateRow[]): RateRow | null {
  const a0 = parse(candidate.validFrom), a1 = parse(candidate.validTo);
  for (const r of existing) {
    if (r.mealPlan !== candidate.mealPlan) continue;
    if (candidate.id && r.id === candidate.id) continue;
    if (parse(r.validFrom) <= a1 && a0 <= parse(r.validTo)) return r;
  }
  return null;
}

/** Nights of a stay: check-in date up to (not including) check-out. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const start = parse(checkIn), end = parse(checkOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const out: string[] = [];
  for (let t = start; t < end; t += DAY) out.push(fmt(t));
  return out;
}

export interface StayQuote {
  nights:        number;
  perNight:      { date: string; rateId: string | null; cost: number | null; sell: number | null }[];
  /** Nights with no rate on file — the quote is incomplete. */
  missingDates:  string[];
  /** Per room, all nights, ₹ (only the priced nights). */
  costPerRoom:   number;
  sellPerRoom:   number | null;
  costTotal:     number;
  sellTotal:     number | null;
}

/** Prices a stay night by night across seasons for `rooms` rooms. */
export function quoteStay(rates: RateRow[], mealPlan: string, checkIn: string, checkOut: string, rooms = 1): StayQuote {
  const dates = stayNights(checkIn, checkOut);
  const plan = rates.filter(r => r.mealPlan === mealPlan);
  const perNight = dates.map(date => {
    const t = parse(date);
    const r = plan.find(x => parse(x.validFrom) <= t && t <= parse(x.validTo)) ?? null;
    return { date, rateId: r?.id ?? null, cost: r ? r.costPerNight : null, sell: r ? (r.sellPerNight ?? null) : null };
  });
  const cost: Paise = sumPaise(perNight.map(n => toPaise(n.cost)));
  const allSell = perNight.every(n => n.sell !== null);
  const sell: Paise = sumPaise(perNight.map(n => toPaise(n.sell)));
  return {
    nights: dates.length,
    perNight,
    missingDates: perNight.filter(n => n.rateId === null).map(n => n.date),
    costPerRoom: toRupees(cost),
    sellPerRoom: allSell ? toRupees(sell) : null,
    costTotal: toRupees(cost * rooms),
    sellTotal: allSell ? toRupees(sell * rooms) : null,
  };
}
