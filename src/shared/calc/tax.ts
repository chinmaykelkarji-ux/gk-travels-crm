// ============================================================
// Tax rules — pure. Rates are configuration, never constants in code
// (hard rule 3): the catalogue below is only the starting set, each entry
// saying where the number comes from and what the owner must check with
// their CA. The rate that applies is the one in force on the day.
//
// Nothing here decides *whether* a tax applies to a particular sale — that
// is the owner's call with their CA; the rules just carry the numbers.
// ============================================================

import { pctOf, sumPaise, toPaise } from './money';

export type TaxKind = 'GST' | 'TCS';

export interface TaxRuleDef {
  code: string;
  name: string;
  kind: TaxKind;
  /** What it is charged on: the full value, only the agency's fee, or the margin. */
  basis: 'FULL_VALUE' | 'SERVICE_FEE' | 'MARGIN';
  defaultRate: number;
  /** Amount in a financial year below which it does not apply (TCS). */
  defaultThreshold?: number;
  note: string;
}

export const TAX_RULES: TaxRuleDef[] = [
  {
    code: 'GST_TOUR_PACKAGE', name: 'GST on tour packages', kind: 'GST', basis: 'FULL_VALUE', defaultRate: 5,
    note: '5% on the full package value without input credit is the common choice for tour operators. The alternative (18% on the margin, or with input credit) changes what you may claim — verify with CA.',
  },
  {
    code: 'GST_TICKET_SERVICE_FEE', name: 'GST on ticketing service fee', kind: 'GST', basis: 'SERVICE_FEE', defaultRate: 18,
    note: '18% applies to the agency fee only, not to the air, rail or bus fare itself — verify with CA.',
  },
  {
    code: 'GST_HOTEL_ONLY', name: 'GST on a hotel-only booking', kind: 'GST', basis: 'FULL_VALUE', defaultRate: 5,
    note: 'Used when you bill a stay with no other service. The rate follows the room tariff slab — verify with CA.',
  },
  {
    code: 'TCS_OVERSEAS_PACKAGE', name: 'TCS on overseas tour packages', kind: 'TCS', basis: 'FULL_VALUE', defaultRate: 5, defaultThreshold: 700_000,
    note: 'Tax collected at source on overseas packages, above the yearly limit per customer. The rate and the limit have changed more than once and a higher slab applies beyond it — verify with CA before switching this on.',
  },
];
export const TAX_RULE_BY_CODE = new Map(TAX_RULES.map(r => [r.code, r]));

export interface TaxRuleValue {
  code: string;
  rate: number;
  threshold: number;
  enabled: boolean;
  /** First day the rate applies; rules are stacked newest-first. */
  effectiveFrom: string;
  effectiveTo?: string | null;
}

/** The rule in force on a day: the newest one that has started and has not ended. */
export function ruleOn(rules: TaxRuleValue[], code: string, day: string): TaxRuleValue | null {
  return rules
    .filter(r => r.code === code && r.effectiveFrom <= day && (!r.effectiveTo || r.effectiveTo >= day))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

/** The rate to use on a day; falls back to the catalogue default when nothing is stored. */
export function rateOn(rules: TaxRuleValue[], code: string, day: string): number {
  const r = ruleOn(rules, code, day);
  if (r) return r.enabled ? r.rate : 0;
  return TAX_RULE_BY_CODE.get(code)?.defaultRate ?? 0;
}

export interface GstSplit { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalTaxPaise: number }

/** Same state: CGST and SGST take half each. Another state: all of it is IGST. */
export function splitGstPaise(taxablePaise: number, ratePct: number, intraState: boolean): GstSplit {
  const total = pctOf(taxablePaise, ratePct);
  if (intraState) {
    const half = Math.round(total / 2);
    return { taxablePaise, cgstPaise: half, sgstPaise: total - half, igstPaise: 0, totalTaxPaise: total };
  }
  return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: total, totalTaxPaise: total };
}

/** Adds up several splits (one per invoice line). */
export function sumSplits(splits: GstSplit[]): GstSplit {
  return {
    taxablePaise: sumPaise(splits.map(s => s.taxablePaise)),
    cgstPaise: sumPaise(splits.map(s => s.cgstPaise)),
    sgstPaise: sumPaise(splits.map(s => s.sgstPaise)),
    igstPaise: sumPaise(splits.map(s => s.igstPaise)),
    totalTaxPaise: sumPaise(splits.map(s => s.totalTaxPaise)),
  };
}

/** A price that already includes tax, split back into value and tax. */
export function removeTax(grossPaise: number, ratePct: number): { taxablePaise: number; taxPaise: number } {
  const taxable = Math.round(grossPaise * 100 / (100 + ratePct));
  return { taxablePaise: taxable, taxPaise: grossPaise - taxable };
}

/**
 * TCS on an overseas package: charged only on the part of this sale that
 * takes the customer past the year's limit. `alreadyBilled` is what the same
 * customer has been billed for overseas packages in the same financial year.
 */
export function tcsOn(amountPaise: number, alreadyBilledPaise: number, ratePct: number, thresholdPaise: number) {
  const before = Math.max(0, thresholdPaise - alreadyBilledPaise);
  const chargeable = Math.max(0, amountPaise - before);
  return { chargeablePaise: chargeable, tcsPaise: pctOf(chargeable, ratePct), freeAllowancePaise: before };
}

/** Financial year (April–March) a date falls in, as "2026-27". */
export function financialYear(day: string): string {
  const [y, m] = day.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First and last day of a financial year like "2026-27". */
export function financialYearRange(fy: string): { from: string; to: string } {
  const start = Number(fy.split('-')[0]);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** Rupee helpers for callers that work in whole rupees. */
export const taxOf = (amount: number, ratePct: number) => pctOf(toPaise(amount), ratePct);
