import { describe, expect, it } from 'vitest';
import { countByMonth, lastMonths, median, monthKey, rate, topBy } from '../../src/shared/calc/analytics';

describe('report maths', () => {
  it('months are India time, oldest first, across a year end', () => {
    expect(monthKey('2026-03-31T20:00:00Z')).toBe('2026-04');       // 1:30 am IST on 1 April
    expect(lastMonths(3, '2026-02-10')).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(countByMonth(['2026-01-05', '2026-01-20', '2025-06-01'], ['2025-12', '2026-01'])).toEqual([{ month: '2025-12', count: 0 }, { month: '2026-01', count: 2 }]);
  });
  it('rates and medians never divide by nothing', () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(1, 0)).toBeNull();
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('ties are broken by name so the order is stable', () => {
    expect(topBy([{ name: 'b', v: 1 }, { name: 'a', v: 1 }, { name: 'c', v: 2 }], r => r.v).map(r => r.name)).toEqual(['c', 'a', 'b']);
  });
});
