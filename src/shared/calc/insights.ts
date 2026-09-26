// ============================================================
// Insights — what needs the owner's attention, worded without a model.
//
// Every insight is counted by a plain query on the server; this file turns
// the counts into sentences that read well on their own. A model may later
// re-phrase the sentences into a short note, but only if it adds no number
// that is not already here (`numbersAddedBy`). Dependency-free.
// ============================================================

import { formatInr, type Paise } from './money.js';

export type InsightCode = 'DEPARTING_UNCONFIRMED' | 'MONEY_OVERDUE' | 'TICKETS_WAITLISTED' | 'THIN_MARGIN' | 'PASSPORTS';
export type InsightSeverity = 'high' | 'medium';

export interface InsightItem { label: string; detail: string; link: string | null }
export interface Insight {
  code: InsightCode;
  severity: InsightSeverity;
  /** A sentence that stands on its own — the fallback whenever a model is off or unsure. */
  text: string;
  count: number;
  amount: number | null;
  link: string;
  items: InsightItem[];
}

/** Defaults the owner can reason about; the server passes them to the queries too. */
export const INSIGHT_LIMITS = {
  departingWithinDays: 14,
  overdueDays: 30,
  thinMarginPct: 10,
  passportWithinDays: 90,
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function departingText(trips: number, withinDays: number): string {
  return `${plural(trips, 'trip')} leaving in the next ${withinDays} days ${trips === 1 ? 'has' : 'have'} something not yet confirmed.`;
}

export function overdueText(customers: number, amountPaise: Paise, days: number): string {
  return `${formatInr(amountPaise)} is overdue by more than ${days} days, from ${plural(customers, 'customer')}.`;
}

export function waitlistText(tickets: number): string {
  return `${plural(tickets, 'ticket')} for upcoming travel ${tickets === 1 ? 'is' : 'are'} still waitlisted, RAC or only part confirmed.`;
}

export function thinMarginText(trips: number, pct: number): string {
  return `${plural(trips, 'open trip')} ${trips === 1 ? 'has' : 'have'} a margin below ${pct}% on the costs recorded so far.`;
}

export function passportText(travellers: number, withinDays: number): string {
  return `${plural(travellers, 'traveller')} on international trips in the next ${withinDays} days ${travellers === 1 ? 'has a passport' : 'have passports'} that ${travellers === 1 ? 'is' : 'are'} missing, expired or short of six months.`;
}

/** Most urgent first: high before medium, then the order the owner reads money in. */
const ORDER: InsightCode[] = ['DEPARTING_UNCONFIRMED', 'PASSPORTS', 'TICKETS_WAITLISTED', 'MONEY_OVERDUE', 'THIN_MARGIN'];
export function sortInsights(list: Insight[]): Insight[] {
  return [...list].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) || ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}

/**
 * The numbers a text states, normalised so "₹1,23,456", "123456" and
 * "1,23,456.00" compare equal. Dates count as their parts.
 */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.add(String(n));
  }
  return out;
}

/** Numbers the wording states that the facts do not. Empty means the wording is safe to show. */
export function numbersAddedBy(wording: string, facts: string): string[] {
  const known = numbersIn(facts);
  return [...numbersIn(wording)].filter(n => !known.has(n));
}

/**
 * The margin a trip is heading for: revenue less the larger of what is in the
 * books and what is booked, so a supplier bill that has not arrived yet still
 * counts. Null when no cost is recorded at all — there is nothing to judge.
 */
export function expectedMargin(revenuePaise: Paise, actualCostPaise: Paise, plannedCostPaise: Paise): { marginPaise: Paise; marginPct: number } | null {
  const cost = Math.max(actualCostPaise, plannedCostPaise);
  if (revenuePaise <= 0 || cost <= 0) return null;
  const marginPaise = revenuePaise - cost;
  return { marginPaise, marginPct: Math.round((marginPaise / revenuePaise) * 1000) / 10 };
}
