import { describe, it, expect } from 'vitest';
import { computeQuote, itemAmounts, gstSplit, customerSafeTotals, type ItemInput } from '../../src/shared/calc/quotation';

const hotel: ItemInput = { id: 'h', description: 'Hotel', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 2, nights: 3 };
const flightA: ItemInput = { id: 'fa', description: 'IndiGo 6E-123', pricingBasis: 'PER_PERSON', optionGroupId: 'flights', isSelectedOption: true, rates: [{ band: 'ADULT', count: 2, costPrice: 6000, sellPrice: 6500 }, { band: 'CHILD', count: 1, costPrice: 4500, sellPrice: 5000 }, { band: 'INFANT', count: 1, costPrice: 1000, sellPrice: 1200 }] };
const flightB: ItemInput = { id: 'fb', description: 'Air India AI-456', pricingBasis: 'PER_PERSON', optionGroupId: 'flights', isSelectedOption: false, rates: [{ band: 'ADULT', count: 2, costPrice: 8000, sellPrice: 9000 }, { band: 'CHILD', count: 1, costPrice: 6000, sellPrice: 7000 }, { band: 'INFANT', count: 1, costPrice: 1500, sellPrice: 1800 }] };
const transfer: ItemInput = { id: 't', description: 'Airport transfers', pricingBasis: 'PER_GROUP', costPrice: 3000, sellPrice: 4000 };

describe('itemAmounts', () => {
  it('prices each basis correctly', () => {
    expect(itemAmounts(hotel)).toEqual({ cost: 24000, sell: 30000 });
    expect(itemAmounts(flightA)).toEqual({ cost: 17500, sell: 19200 });
    expect(itemAmounts(transfer)).toEqual({ cost: 3000, sell: 4000 });
    expect(itemAmounts({ id: 'u', pricingBasis: 'PER_UNIT', costPrice: 100, sellPrice: 150, quantity: 4 })).toEqual({ cost: 400, sell: 600 });
    expect(itemAmounts({ id: 'n', pricingBasis: 'PER_UNIT', costPrice: 100, sellPrice: 150, quantity: 2, nights: 3 })).toEqual({ cost: 600, sell: 900 });
  });
});

describe('gstSplit', () => {
  it('handles excluded, included and none', () => {
    expect(gstSplit(1000, 5, 'EXCLUDED')).toEqual({ taxable: 1000, tax: 50, gross: 1050 });
    expect(gstSplit(1050, 5, 'INCLUDED')).toEqual({ taxable: 1000, tax: 50, gross: 1050 });
    expect(gstSplit(1000, 5, 'NONE')).toEqual({ taxable: 1000, tax: 0, gross: 1000 });
    expect(gstSplit(1000, 0, 'EXCLUDED').tax).toBe(0);
  });
});

describe('computeQuote', () => {
  it('counts only the selected option per group, adds GST on top, rounds the total to the rupee', () => {
    const t = computeQuote({ items: [hotel, flightA, flightB, transfer], gstMode: 'EXCLUDED', gstRate: 5, adults: 2, children: 1, infants: 1 });
    expect(t.items.find(i => i.id === 'fb')?.included).toBe(false);
    expect(t.subtotal).toBe(30000 + 19200 + 4000);
    expect(t.cost).toBe(24000 + 17500 + 3000);
    expect(t.tax).toBe(2660);
    expect(t.total).toBe(55860);
    expect(t.margin).toBe(53200 - 44500);
    expect(t.marginPct).toBeCloseTo(16.35, 1);
    expect(t.pax).toBe(4);
    expect(t.perPerson).toBe(13965);
    expect(t.warnings).toEqual([]);
  });

  it('switching the selected option changes the totals', () => {
    const t = computeQuote({ items: [hotel, { ...flightA, isSelectedOption: false }, { ...flightB, isSelectedOption: true }, transfer], gstMode: 'EXCLUDED', gstRate: 5 });
    expect(t.subtotal).toBe(30000 + 26800 + 4000);
  });

  it('warns on option groups with none or several selected, and on negative margins', () => {
    const none = computeQuote({ items: [{ ...flightA, isSelectedOption: false }, flightB], gstMode: 'NONE', gstRate: 0 });
    expect(none.warnings[0]).toMatch(/no selected option/);
    expect(none.subtotal).toBe(0);
    const two = computeQuote({ items: [flightA, { ...flightB, isSelectedOption: true }], gstMode: 'NONE', gstRate: 0 });
    expect(two.warnings[0]).toMatch(/2 selected options/);
    expect(two.subtotal).toBe(19200);
    const loss = computeQuote({ items: [{ id: 'x', description: 'Loss leader', pricingBasis: 'PER_UNIT', costPrice: 200, sellPrice: 100 }], gstMode: 'NONE', gstRate: 0 });
    expect(loss.warnings[0]).toMatch(/cost exceeds sell/);
    expect(loss.margin).toBe(-100);
  });

  it('applies discounts pro-rata before tax and caps them at the subtotal', () => {
    const t = computeQuote({ items: [hotel, transfer], discountAmount: 3400, gstMode: 'EXCLUDED', gstRate: 5 });
    expect(t.discountAmount).toBe(3400);
    expect(t.taxable).toBe(30600);
    expect(t.tax).toBe(1530);
    expect(t.total).toBe(32130);
    const capped = computeQuote({ items: [transfer], discountAmount: 9999, gstMode: 'NONE', gstRate: 0 });
    expect(capped.discountAmount).toBe(4000);
    expect(capped.total).toBe(0);
    expect(capped.warnings[0]).toMatch(/capped/);
  });

  it('INCLUDED mode keeps the sell price as the gross and backs out the tax', () => {
    const t = computeQuote({ items: [{ id: 'p', pricingBasis: 'PER_GROUP', costPrice: 9000, sellPrice: 10500 }], gstMode: 'INCLUDED', gstRate: 5 });
    expect(t.total).toBe(10500);
    expect(t.taxable).toBe(10000);
    expect(t.tax).toBe(500);
    expect(t.margin).toBe(1000);
  });

  it('honours per-item tax overrides', () => {
    const t = computeQuote({ items: [{ id: 'v', pricingBasis: 'PER_UNIT', costPrice: 0, sellPrice: 1000, quantity: 1, taxRate: 18 }, transfer], gstMode: 'EXCLUDED', gstRate: 5 });
    expect(t.tax).toBe(180 + 200);
  });

  it('splits per party: own items plus a pax-weighted share of shared items', () => {
    const parties = [{ id: 'A', name: 'Kelkar family', adults: 2, children: 1 }, { id: 'B', name: 'Shah family', adults: 2 }];
    const items: ItemInput[] = [
      { id: 'hA', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 2, partyId: 'A' },
      { id: 'hB', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 6000, quantity: 1, nights: 2, partyId: 'B' },
      { id: 'bus', description: 'Tempo traveller', pricingBasis: 'PER_GROUP', costPrice: 8000, sellPrice: 10000 },
    ];
    const t = computeQuote({ items, parties, gstMode: 'NONE', gstRate: 0 });
    expect(t.pax).toBe(5);
    const a = t.parties.find(p => p.partyId === 'A')!, b = t.parties.find(p => p.partyId === 'B')!;
    expect(a.sell).toBe(10000 + 6000);
    expect(b.sell).toBe(12000 + 4000);
    expect(a.total + b.total).toBe(t.total);
    expect(a.perPerson).toBe(Math.round(16000 / 3));
    expect(t.total).toBe(32000);
  });

  it('customerSafeTotals never carries cost or margin', () => {
    const t = computeQuote({ items: [hotel, flightA, flightB], parties: [{ id: 'A', name: 'All', adults: 4 }], gstMode: 'EXCLUDED', gstRate: 5 });
    const safe = JSON.stringify(customerSafeTotals(t));
    expect(safe).not.toMatch(/cost|margin/i);
    expect(customerSafeTotals(t).items.map(i => i.id)).toEqual(['h', 'fa']);
  });
});
