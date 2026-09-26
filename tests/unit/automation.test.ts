// The automation catalogue: every message rule uses a real template, ships
// switched off, and the owner's numbers are checked before they are used.
import { describe, expect, it } from 'vitest';
import { AUTOMATION_RULES, AUTOMATION_BY_KEY, effectiveParams, runStatus, validateParams, describeAction } from '../../src/shared/calc/automation';
import { SYSTEM_TEMPLATES } from '../../src/shared/calc/templates';

describe('the catalogue', () => {
  it('every send uses a system template, and every rule that messages customers is marked so', () => {
    const keys = new Set(SYSTEM_TEMPLATES.map(t => t.key));
    for (const r of AUTOMATION_RULES) {
      const sends = r.defaultActions.filter(a => a.type === 'send');
      for (const a of sends) expect(keys.has((a as { templateKey: string }).templateKey), r.key).toBe(true);
      expect(r.customerFacing, r.key).toBe(sends.length > 0);
    }
  });
  it('replaces the three rules of the classic scheduler', () => {
    expect(AUTOMATION_RULES.filter(r => r.replaces).map(r => r.key).sort()).toEqual(['departure_reminder', 'payment_reminder', 'supplier_unconfirmed']);
    expect(AUTOMATION_BY_KEY.get('payment_reminder')!.defaultParams).toEqual({ days: [7, 3, 1] });
  });
});

describe('the owner\'s numbers', () => {
  const pay = AUTOMATION_BY_KEY.get('payment_reminder')!;
  const sup = AUTOMATION_BY_KEY.get('supplier_unconfirmed')!;
  it('are used when valid, otherwise the defaults stand', () => {
    expect(effectiveParams(pay, { days: [3, 10, 3] })).toEqual({ days: [10, 3] });
    expect(effectiveParams(pay, { days: [0] })).toEqual({ days: [7, 3, 1] });
    expect(effectiveParams(sup, { hours: 24 })).toEqual({ hours: 24 });
    expect(effectiveParams(sup, { hours: 2 })).toEqual({ hours: 48 });
  });
  it('are refused with a reason when they make no sense', () => {
    expect(validateParams(pay, { days: [7, 3] })).toEqual({});
    expect(validateParams(pay, { days: [0] })).toEqual({ days: 'Use whole numbers from 1 to 60' });
    expect(validateParams(sup, { hours: [24, 48] })).toMatchObject({ hours: 'One number only' });
    expect(validateParams(sup, { minutes: 5 })).toEqual({ minutes: 'This rule has no such setting' });
  });
});

describe('a run', () => {
  it('is done, skipped or failed from what its actions did', () => {
    expect(runStatus([{ ok: true, detail: '' }])).toBe('DONE');
    expect(runStatus([{ ok: false, skipped: true, detail: '' }])).toBe('SKIPPED');
    expect(runStatus([{ ok: true, detail: '' }, { ok: false, detail: 'not configured' }])).toBe('FAILED');
    expect(describeAction({ type: 'notify', roles: ['ADMIN', 'OPERATIONS'] })).toBe('Notify the owner, operations');
    expect(describeAction({ type: 'send', channel: 'EMAIL', templateKey: 'payment_received' })).toBe('Send "payment received" by email');
  });
});
