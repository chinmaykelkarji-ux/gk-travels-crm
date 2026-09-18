import { describe, it, expect } from 'vitest';
import { defaultSchedule, validateSchedule, allocatePayments, scheduleSummary } from '../../src/shared/calc/schedule';

describe('defaultSchedule', () => {
  it('splits 50/50 with the balance 15 days before departure', () => {
    const s = defaultSchedule(55_861, { today: '2026-09-18', departureDate: '2026-11-10' });
    expect(s).toEqual([
      { seq: 1, label: 'Advance', dueDate: '2026-09-18', amount: 27_931 },
      { seq: 2, label: 'Balance', dueDate: '2026-10-26', amount: 27_930 },
    ]);
    expect(s[0].amount + s[1].amount).toBe(55_861);
  });
  it('collapses to a single instalment for short-notice or undated trips', () => {
    expect(defaultSchedule(10_000, { today: '2026-09-18', departureDate: '2026-09-25' })).toEqual([{ seq: 1, label: 'Full payment', dueDate: '2026-09-18', amount: 10_000 }]);
    expect(defaultSchedule(10_000, { today: '2026-09-18' })).toHaveLength(1);
    expect(defaultSchedule(0, { today: '2026-09-18' })).toEqual([]);
  });
  it('honours a custom advance percentage', () => {
    expect(defaultSchedule(100_000, { today: '2026-09-18', departureDate: '2026-12-01', advancePct: 30 })[0].amount).toBe(30_000);
  });
});

describe('validateSchedule', () => {
  it('requires instalments that sum to the total, are positive and dated in order', () => {
    expect(validateSchedule([], 100)).toContain('At least one instalment is required');
    expect(validateSchedule([{ seq: 1, label: 'A', dueDate: '2026-09-18', amount: 60 }, { seq: 2, label: 'B', dueDate: '2026-09-10', amount: 50 }], 100)).toEqual([
      'Instalments total ₹110 but the contract is ₹100',
      'Instalment 2 is due before the previous one',
    ]);
    expect(validateSchedule([{ seq: 1, label: 'A', dueDate: '2026-09-18', amount: 100 }], 100)).toEqual([]);
  });
});

describe('allocatePayments', () => {
  const items = [{ seq: 1, label: 'Advance', dueDate: '2026-09-10', amount: 500 }, { seq: 2, label: 'Balance', dueDate: '2026-09-22', amount: 500 }, { seq: 3, label: 'Extra', dueDate: '2026-10-30', amount: 200 }];
  it('fills instalments in order and flags overdue, due-soon and upcoming', () => {
    const st = allocatePayments(items, 700, '2026-09-18');
    expect(st.map(s => [s.paidAmount, s.status])).toEqual([[500, 'PAID'], [200, 'PARTIAL'], [0, 'UPCOMING']]);
    const none = allocatePayments(items, 0, '2026-09-18');
    expect(none.map(s => s.status)).toEqual(['OVERDUE', 'DUE', 'UPCOMING']);
    const sum = scheduleSummary(st);
    expect(sum).toMatchObject({ total: 1200, paid: 700, balance: 500, overdue: 0 });
    expect(sum.next?.seq).toBe(2);
  });
  it('overdue partial payments stay overdue', () => {
    expect(allocatePayments(items, 100, '2026-09-18')[0].status).toBe('OVERDUE');
    expect(scheduleSummary(allocatePayments(items, 100, '2026-09-18')).overdue).toBe(400);
  });
});
