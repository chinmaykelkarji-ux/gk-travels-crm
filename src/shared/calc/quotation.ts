// ============================================================
// Unified quotation maths. Pure and dependency-free: the API stores what this
// returns, the builder shows it live, and unit tests pin the rules.
//
// Pricing bases
//   PER_PERSON  Σ over bands (adult/child/infant): rate × count   [× nights if set]
//   PER_UNIT    unit price × quantity                              [× nights if set]
//   PER_ROOM    room price × quantity (rooms) × nights
//   PER_GROUP   flat price for the whole party/group
// Option groups: alternatives (three flight options). Only the selected
// item in a group counts. Parties: a family or sub-group; items with a
// partyId are totalled per party, the rest belong to the whole group.
// GST: EXCLUDED adds tax on top of the sell price; INCLUDED treats the sell
// price as tax-inclusive; NONE charges no tax. Rounded to paise per item,
// totals rounded to the rupee at the end (Indian invoicing convention).
// ============================================================

export type PricingBasis = 'PER_PERSON' | 'PER_UNIT' | 'PER_ROOM' | 'PER_GROUP';
export type Band = 'ADULT' | 'CHILD' | 'INFANT';
export type GstMode = 'EXCLUDED' | 'INCLUDED' | 'NONE';

export interface RateInput { band: Band; count: number; costPrice: number; sellPrice: number }
export interface ItemInput {
  id: string;
  description?: string;
  serviceType?: string;
  pricingBasis: PricingBasis;
  /** PER_UNIT / PER_ROOM / PER_GROUP prices. Ignored for PER_PERSON. */
  costPrice?: number | null;
  sellPrice?: number | null;
  quantity?: number | null;
  nights?: number | null;
  rates?: RateInput[];
  optionGroupId?: string | null;
  isSelectedOption?: boolean;
  partyId?: string | null;
  /** Per-item GST override (percent). Null = quote default. */
  taxRate?: number | null;
}
export interface PartyInput { id: string; name: string; adults?: number; children?: number; infants?: number }
export interface QuoteInput {
  items: ItemInput[];
  parties?: PartyInput[];
  discountAmount?: number;
  gstMode: GstMode;
  gstRate: number;
  /** Group size for per-person figures; falls back to the sum of party pax or PER_PERSON counts. */
  adults?: number; children?: number; infants?: number;
}

export interface ItemTotals { id: string; included: boolean; cost: number; sell: number; margin: number; marginPct: number; taxRate: number; tax: number; taxable: number; partyId: string | null }
export interface PartyTotals { partyId: string | null; name: string; pax: number; cost: number; sell: number; tax: number; total: number; perPerson: number | null }
export interface QuoteTotals {
  items: ItemTotals[];
  parties: PartyTotals[];
  subtotal: number;        // selected items' sell, before discount
  discountAmount: number;
  taxable: number;         // amount GST is computed on (after discount)
  tax: number;
  total: number;           // customer pays
  cost: number;            // supplier cost of selected items
  margin: number;          // total − tax − cost  (margin excludes GST)
  marginPct: number;       // margin / (total − tax)
  pax: number;
  perPerson: number | null;
  warnings: string[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r0 = (n: number) => Math.round(n + Number.EPSILON);

export function itemAmounts(item: ItemInput): { cost: number; sell: number } {
  const nights = Math.max(1, Number(item.nights ?? 1) || 1);
  const qty = Math.max(0, Number(item.quantity ?? 1) || 0);
  switch (item.pricingBasis) {
    case 'PER_PERSON': {
      let cost = 0, sell = 0;
      for (const r of item.rates ?? []) {
        const c = Math.max(0, Number(r.count) || 0);
        cost += (Number(r.costPrice) || 0) * c;
        sell += (Number(r.sellPrice) || 0) * c;
      }
      return { cost: r2(cost * nights), sell: r2(sell * nights) };
    }
    case 'PER_ROOM':
      return { cost: r2((Number(item.costPrice) || 0) * qty * nights), sell: r2((Number(item.sellPrice) || 0) * qty * nights) };
    case 'PER_GROUP':
      return { cost: r2((Number(item.costPrice) || 0) * nights), sell: r2((Number(item.sellPrice) || 0) * nights) };
    case 'PER_UNIT':
    default:
      return { cost: r2((Number(item.costPrice) || 0) * qty * nights), sell: r2((Number(item.sellPrice) || 0) * qty * nights) };
  }
}

/** Splits a sell amount into taxable + tax under the given mode. */
export function gstSplit(amount: number, ratePct: number, mode: GstMode): { taxable: number; tax: number; gross: number } {
  const rate = Math.max(0, Number(ratePct) || 0);
  if (mode === 'NONE' || rate === 0) return { taxable: r2(amount), tax: 0, gross: r2(amount) };
  if (mode === 'INCLUDED') {
    const taxable = r2(amount * 100 / (100 + rate));
    return { taxable, tax: r2(amount - taxable), gross: r2(amount) };
  }
  const tax = r2(amount * rate / 100);
  return { taxable: r2(amount), tax, gross: r2(amount + tax) };
}

export function isItemIncluded(item: ItemInput): boolean {
  return !item.optionGroupId || item.isSelectedOption !== false;
}

export function computeQuote(q: QuoteInput): QuoteTotals {
  const warnings: string[] = [];
  const discount = Math.max(0, Number(q.discountAmount ?? 0) || 0);

  // Option groups: exactly one selected item per group.
  const groups = new Map<string, ItemInput[]>();
  for (const it of q.items) if (it.optionGroupId) groups.set(it.optionGroupId, [...(groups.get(it.optionGroupId) ?? []), it]);
  for (const [gid, members] of groups) {
    const selected = members.filter(m => m.isSelectedOption !== false);
    if (selected.length === 0) warnings.push(`Option group ${gid} has no selected option`);
    if (selected.length > 1) warnings.push(`Option group ${gid} has ${selected.length} selected options; only the first counts`);
  }
  const seenGroup = new Set<string>();

  const items: ItemTotals[] = q.items.map(it => {
    let included = isItemIncluded(it);
    if (included && it.optionGroupId) { if (seenGroup.has(it.optionGroupId)) included = false; else seenGroup.add(it.optionGroupId); }
    const { cost, sell } = itemAmounts(it);
    const taxRate = it.taxRate ?? q.gstRate;
    const split = gstSplit(sell, taxRate, q.gstMode);
    if (included && sell > 0 && cost > sell) warnings.push(`${it.description ?? it.id}: cost exceeds sell price`);
    return { id: it.id, included, cost, sell, margin: r2(split.taxable - cost), marginPct: split.taxable > 0 ? r2((split.taxable - cost) / split.taxable * 100) : 0, taxRate, tax: split.tax, taxable: split.taxable, partyId: it.partyId ?? null };
  });

  const selected = items.filter(i => i.included);
  const subtotal = r2(selected.reduce((s, i) => s + i.sell, 0));
  const cost = r2(selected.reduce((s, i) => s + i.cost, 0));

  // Discount is spread pro-rata across selected items so tax stays right.
  const effDiscount = Math.min(discount, subtotal);
  if (discount > subtotal) warnings.push('Discount exceeds the subtotal; capped');
  let taxable = 0, tax = 0;
  for (const i of selected) {
    const share = subtotal > 0 ? i.sell / subtotal : 0;
    const net = r2(i.sell - effDiscount * share);
    const split = gstSplit(net, i.taxRate, q.gstMode);
    taxable += split.taxable; tax += split.tax;
  }
  taxable = r2(taxable); tax = r2(tax);
  const total = r0(q.gstMode === 'INCLUDED' ? r2(subtotal - effDiscount) : r2(taxable + tax));

  // Pax for per-person figures.
  const bandPax = (q.adults ?? 0) + (q.children ?? 0) + (q.infants ?? 0);
  const partyPax = (q.parties ?? []).reduce((s, p) => s + (p.adults ?? 0) + (p.children ?? 0) + (p.infants ?? 0), 0);
  const ratePax = Math.max(0, ...q.items.filter(i => i.pricingBasis === 'PER_PERSON' && isItemIncluded(i)).map(i => (i.rates ?? []).reduce((s, r) => s + (Number(r.count) || 0), 0)));
  const pax = bandPax || partyPax || ratePax || 0;

  // Per-party roll-up: party items + the party's share of shared items (by pax).
  const parties: PartyTotals[] = [];
  const partyList = q.parties ?? [];
  if (partyList.length) {
    const sharedSel = selected.filter(i => !i.partyId);
    const sharedSell = sharedSel.reduce((s, i) => s + i.sell, 0), sharedCost = sharedSel.reduce((s, i) => s + i.cost, 0), sharedTax = sharedSel.reduce((s, i) => s + i.tax, 0);
    const totalPartyPax = partyPax || 1;
    for (const p of partyList) {
      const ppax = (p.adults ?? 0) + (p.children ?? 0) + (p.infants ?? 0);
      const share = partyPax ? ppax / totalPartyPax : 1 / partyList.length;
      const own = selected.filter(i => i.partyId === p.id);
      const sell = r2(own.reduce((s, i) => s + i.sell, 0) + sharedSell * share);
      const pcost = r2(own.reduce((s, i) => s + i.cost, 0) + sharedCost * share);
      const ptax = r2(own.reduce((s, i) => s + i.tax, 0) + sharedTax * share);
      const discShare = subtotal > 0 ? effDiscount * (sell / subtotal) : 0;
      const ptotal = r0(q.gstMode === 'INCLUDED' ? sell - discShare : sell - discShare + ptax * (1 - (subtotal > 0 ? effDiscount / subtotal : 0)));
      parties.push({ partyId: p.id, name: p.name, pax: ppax, cost: pcost, sell, tax: ptax, total: ptotal, perPerson: ppax ? r0(ptotal / ppax) : null });
    }
    const orphan = selected.filter(i => i.partyId && !partyList.some(p => p.id === i.partyId));
    if (orphan.length) warnings.push(`${orphan.length} item(s) reference a party that no longer exists`);
  }

  const netOfTax = r2(total - tax);
  return {
    items, parties, subtotal, discountAmount: effDiscount, taxable, tax, total, cost,
    margin: r2(netOfTax - cost), marginPct: netOfTax > 0 ? r2((netOfTax - cost) / netOfTax * 100) : 0,
    pax, perPerson: pax > 0 ? r0(total / pax) : null, warnings,
  };
}

/** Strips cost and margin for the customer-facing document. */
export function customerSafeTotals(t: QuoteTotals) {
  return {
    subtotal: t.subtotal, discountAmount: t.discountAmount, taxable: t.taxable, tax: t.tax, total: t.total, pax: t.pax, perPerson: t.perPerson,
    items: t.items.filter(i => i.included).map(({ id, sell, tax, partyId }) => ({ id, sell, tax, partyId })),
    parties: t.parties.map(({ partyId, name, pax, sell, tax, total, perPerson }) => ({ partyId, name, pax, sell, tax, total, perPerson })),
  };
}
