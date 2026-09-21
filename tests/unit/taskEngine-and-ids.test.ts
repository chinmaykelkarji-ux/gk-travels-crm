import { describe, it, expect } from 'vitest';
import { generateTasksFromCategories, computeDueDate, TASK_RULE_TABLE } from '../../src/shared/utils/taskEngine';
import {
  nextTripId, nextLeadId, nextCustomerId, nextBookingId, nextTaskId, nextPayId,
  nextQuotationId, nextReceivableEntryId, uid,
} from '../../src/shared/utils/id';

const YEAR = new Date().getFullYear();

describe('taskEngine', () => {
  it('computes due dates as N days before departure', () => {
    expect(computeDueDate('2026-10-20', 21)).toBe('2026-09-29');
    expect(computeDueDate('2026-10-20', 0)).toBe('2026-10-20');
    expect(computeDueDate(null, 3)).toBeUndefined();
    expect(computeDueDate('not-a-date', 3)).toBeUndefined();
  });

  it('generates one task per category, de-duplicating synonyms, ignoring unknowns', () => {
    const tasks = generateTasksFromCategories({
      categories: ['flight', 'Hotel', 'cab', 'transfer', 'sightseeing', 'activity', 'unknown-thing'],
      tripId: 'GK-2026-0042',
      customerId: 'CUS-2026-0007',
      departure: '2026-10-20',
    });
    expect(tasks.map(t => t.title)).toEqual([
      'Book flight tickets',
      'Confirm hotel booking',
      'Arrange airport transfer',
      'Confirm sightseeing vendor',
    ]);
    expect(tasks.map(t => t.dueDate)).toEqual(['2026-09-29', '2026-10-06', '2026-10-17', '2026-10-13']);
    expect(tasks.every(t => t.tripId === 'GK-2026-0042' && t.customerId === 'CUS-2026-0007' && t.status === 'pending')).toBe(true);
    expect(tasks[0].priority).toBe(TASK_RULE_TABLE.flight.priority);
  });

  it('returns no tasks for an empty category list', () => {
    expect(generateTasksFromCategories({ categories: [], tripId: 'GK-2026-0001' })).toEqual([]);
  });
});

describe('id generators', () => {
  it('continue from the highest existing sequence for the current year', () => {
    expect(nextTripId([`GK-${YEAR}-0001`, `GK-${YEAR}-0009`, 'junk', ''])).toBe(`GK-${YEAR}-0010`);
    expect(nextLeadId([])).toBe(`L-${YEAR}-0001`);
    expect(nextCustomerId([`CUS-${YEAR}-0120`])).toBe(`CUS-${YEAR}-0121`);
    expect(nextBookingId([`BK-${YEAR}-9999`])).toBe(`BK-${YEAR}-10000`);
    expect(nextQuotationId([`Q-${YEAR}-0003`])).toBe(`Q-${YEAR}-0004`);
  });

  it('task, payment and receivable-entry ids use their own formats', () => {
    expect(nextTaskId(['T-001', 'T-007'])).toBe('T-008');
    expect(nextPayId('PAY', ['PAY-003'])).toBe('PAY-004');
    expect(nextPayId('SP', [])).toBe('SP-001');
    expect(nextReceivableEntryId(['RCE-002'])).toBe('RCE-003');
  });

  it('uid values are unique across a burst', () => {
    // These become primary keys, so a burst inside one millisecond must not collide.
    const ids = new Set(Array.from({ length: 5_000 }, () => uid()));
    expect(ids.size).toBe(5_000);
  });
});
