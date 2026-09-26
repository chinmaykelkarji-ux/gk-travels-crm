import { describe, expect, it } from 'vitest';
import { readSettings } from '../../src/shared/contracts/organization';
import { INSIGHT_LIMITS } from '../../src/shared/calc/insights';

describe('organisation settings', () => {
  it('keeps each valid value and defaults the rest — a bad value never breaks the page', () => {
    expect(readSettings(null)).toEqual({ insights: { ...INSIGHT_LIMITS }, portal: { defaultLinkDays: 90 } });
    expect(readSettings({ insights: { overdueDays: 45, thinMarginPct: 'lots', unknown: 1 }, portal: { defaultLinkDays: 9999 } }))
      .toEqual({ insights: { ...INSIGHT_LIMITS, overdueDays: 45 }, portal: { defaultLinkDays: 90 } });
  });
});
