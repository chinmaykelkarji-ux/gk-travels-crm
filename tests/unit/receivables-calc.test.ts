import { describe, expect, it } from 'vitest';
import { ageInvoices, customerPosition, tripProfit, type InvoiceForAging } from '../../src/shared/calc/receivables';

const inv = (number: string, date: string, dueDate: string | null, rupees: number): InvoiceForAging =>
  ({ id: number, number, date, dueDate, totalPaise: rupees * 100, customerId: 'CUS-1', customerName: 'Shri Patil' });

describe('ageing what a customer owes', () => {
  const list = [inv('B', '2026-05-10', '2026-05-20', 30_000), inv('A', '2026-03-01', '2026-03-10', 50_000), inv('C', '2026-06-25', '2026-07-25', 20_000)];
  const today = '2026-06-30';

  it('puts money against the oldest invoice first', () => {
    const aged = ageInvoices(list, 60_000_00, today);
    expect(aged.map(a => [a.number, a.paidPaise / 100, a.outstandingPaise / 100])).toEqual([['A', 50_000, 0], ['B', 10_000, 20_000], ['C', 0, 20_000]]);
  });
  it('counts days late from the due date, and not at all when it is paid', () => {
    const aged = ageInvoices(list, 60_000_00, today);
    expect(aged.find(a => a.number === 'A')!.daysOverdue).toBe(0);   // settled
    expect(aged.find(a => a.number === 'B')!.daysOverdue).toBe(41);
    expect(aged.find(a => a.number === 'B')!.bucket).toBe('31-60');
    expect(aged.find(a => a.number === 'C')!.bucket).toBe('current'); // not due yet
  });
  it('falls back to the invoice date when there is no due date', () => {
    const aged = ageInvoices([inv('D', '2026-01-01', null, 1_000)], 0, today);
    expect(aged[0].daysOverdue).toBe(180);
    expect(aged[0].bucket).toBe('90+');
  });
  it('sums the position, including money not yet used', () => {
    const aged = ageInvoices(list, 60_000_00, today);
    expect(customerPosition(aged, 5_000_00)).toEqual({ outstandingPaise: 40_000_00, overduePaise: 20_000_00, unusedAdvancePaise: 5_000_00, netPaise: 35_000_00 });
  });
});

describe('what a trip made', () => {
  const base = {
    invoicedPaise: 100_000_00, contractedPaise: 120_000_00, receivedPaise: 60_000_00,
    actualCostPaise: [{ code: '5000', label: '5000', amountPaise: 34_000_00 }, { code: '5010', label: '5010', amountPaise: 6_000_00 }],
    plannedCostPaise: [{ label: 'Hotels', amountPaise: 30_000_00 }, { label: 'Transport', amountPaise: 8_000_00 }],
  };
  it('uses what has been billed, and names the costs in plain words', () => {
    const p = tripProfit(base);
    expect(p).toMatchObject({ revenuePaise: 100_000_00, revenueBasis: 'invoiced', actualCostPaise: 40_000_00, plannedCostPaise: 38_000_00, marginPaise: 60_000_00, marginPct: 60 });
    expect(p.costLines).toEqual([
      { label: 'Hotels', actualPaise: 34_000_00, plannedPaise: 30_000_00 },
      { label: 'Transport', actualPaise: 6_000_00, plannedPaise: 8_000_00 },
    ]);
    expect(p.balancePaise).toBe(40_000_00);
  });
  it('falls back to what the bookings are worth before anything is billed, and says so', () => {
    const p = tripProfit({ ...base, invoicedPaise: 0 });
    expect(p).toMatchObject({ revenueBasis: 'contracted', revenuePaise: 120_000_00, marginPaise: 80_000_00 });
  });
  it('shows a loss honestly and does not divide by zero', () => {
    expect(tripProfit({ ...base, invoicedPaise: 30_000_00 }).marginPaise).toBe(-10_000_00);
    expect(tripProfit({ ...base, invoicedPaise: 0, contractedPaise: 0 })).toMatchObject({ marginPct: 0, revenuePaise: 0, marginPaise: -40_000_00 });
  });
});
