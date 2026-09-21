import { describe, expect, it } from 'vitest';
import {
  financialYear, financialYearRange, rateOn, removeTax, ruleOn, splitGstPaise, sumSplits, TAX_RULES, tcsOn, type TaxRuleValue,
} from '../../src/shared/calc/tax';

describe('the rule catalogue', () => {
  it('has unique codes and says what to verify with the CA', () => {
    expect(new Set(TAX_RULES.map(r => r.code)).size).toBe(TAX_RULES.length);
    for (const r of TAX_RULES) {
      expect(r.defaultRate, r.code).toBeGreaterThanOrEqual(0);
      expect(r.note, r.code).toMatch(/verify with CA/i);
    }
    expect(TAX_RULES.find(r => r.kind === 'TCS')!.defaultThreshold).toBe(700_000);
  });
});

describe('which rate applies', () => {
  const rules: TaxRuleValue[] = [
    { code: 'GST_TOUR_PACKAGE', rate: 5, threshold: 0, enabled: true, effectiveFrom: '2024-04-01', effectiveTo: '2026-03-31' },
    { code: 'GST_TOUR_PACKAGE', rate: 12, threshold: 0, enabled: true, effectiveFrom: '2026-04-01' },
    { code: 'TCS_OVERSEAS_PACKAGE', rate: 5, threshold: 700_000, enabled: false, effectiveFrom: '2024-04-01' },
  ];
  it('uses the rule in force on the day, newest first', () => {
    expect(rateOn(rules, 'GST_TOUR_PACKAGE', '2025-06-10')).toBe(5);
    expect(rateOn(rules, 'GST_TOUR_PACKAGE', '2026-04-01')).toBe(12);
    expect(ruleOn(rules, 'GST_TOUR_PACKAGE', '2023-01-01')).toBeNull();
  });
  it('falls back to the catalogue default when nothing is stored, and a rule that is off charges nothing', () => {
    expect(rateOn([], 'GST_TICKET_SERVICE_FEE', '2026-06-01')).toBe(18);
    expect(rateOn(rules, 'TCS_OVERSEAS_PACKAGE', '2026-06-01')).toBe(0);
    expect(rateOn([], 'NOT_A_RULE', '2026-06-01')).toBe(0);
  });
});

describe('GST maths', () => {
  it('splits within the state and charges IGST outside it', () => {
    expect(splitGstPaise(10_000_00, 5, true)).toMatchObject({ cgstPaise: 250_00, sgstPaise: 250_00, igstPaise: 0, totalTaxPaise: 500_00 });
    expect(splitGstPaise(10_000_00, 5, false)).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 500_00, totalTaxPaise: 500_00 });
  });
  it('keeps the halves adding up when the tax is an odd number of paise', () => {
    const s = splitGstPaise(333_33, 5, true);
    expect(s.cgstPaise + s.sgstPaise).toBe(s.totalTaxPaise);
    expect(s.totalTaxPaise).toBe(16_67);
  });
  it('adds up several lines', () => {
    const total = sumSplits([splitGstPaise(1_000_00, 5, true), splitGstPaise(2_000_00, 5, true)]);
    expect(total).toMatchObject({ taxablePaise: 3_000_00, totalTaxPaise: 150_00, cgstPaise: 75_00, sgstPaise: 75_00 });
  });
  it('takes tax back out of a price that includes it', () => {
    expect(removeTax(10_500_00, 5)).toEqual({ taxablePaise: 10_000_00, taxPaise: 500_00 });
  });
});

describe('TCS on overseas packages', () => {
  it('charges only the part above the year’s limit', () => {
    expect(tcsOn(500_000_00, 0, 5, 700_000_00)).toMatchObject({ chargeablePaise: 0, tcsPaise: 0, freeAllowancePaise: 700_000_00 });
    expect(tcsOn(500_000_00, 400_000_00, 5, 700_000_00)).toMatchObject({ chargeablePaise: 200_000_00, tcsPaise: 10_000_00 });
    expect(tcsOn(100_000_00, 900_000_00, 5, 700_000_00)).toMatchObject({ chargeablePaise: 100_000_00, tcsPaise: 5_000_00, freeAllowancePaise: 0 });
  });
});

describe('financial year', () => {
  it('runs April to March', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2026-01-15')).toBe('2025-26');
    expect(financialYearRange('2026-27')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });
});
