// GST invoicing helpers — financial-year labels, place-of-supply logic,
// CGST/SGST/IGST splitting with paise-exact rounding, document numbering.
import { describe, it, expect } from 'vitest';
import {
  getFinancialYear,
  getStateCodeFromGstin,
  getStateNameByCode,
  determineGstType,
  splitGst,
  sumGstSplits,
  formatDocNumber,
  INVOICE_SEQ_PAD,
  CREDIT_DEBIT_SEQ_PAD,
} from '../../src/shared/utils/gst';

describe('getFinancialYear', () => {
  it('runs 1 April – 31 March', () => {
    expect(getFinancialYear('2026-04-01')).toBe('2026-27');
    expect(getFinancialYear('2026-09-18')).toBe('2026-27');
    expect(getFinancialYear('2027-03-31')).toBe('2026-27');
    expect(getFinancialYear('2026-03-31')).toBe('2025-26');
  });

  it('pads the short year across the century boundary', () => {
    expect(getFinancialYear('2099-06-01')).toBe('2099-00');
  });
});

describe('GSTIN and state codes', () => {
  it('reads the state from the first two GSTIN digits', () => {
    expect(getStateCodeFromGstin('29ABCDE1234F1Z5')).toBe('29');
    expect(getStateCodeFromGstin('')).toBeNull();
    expect(getStateCodeFromGstin(null)).toBeNull();
    expect(getStateCodeFromGstin('2')).toBeNull();
  });

  it('maps codes to names', () => {
    expect(getStateNameByCode('29')).toBe('Karnataka');
    expect(getStateNameByCode('27')).toBe('Maharashtra');
    expect(getStateNameByCode('99')).toBe('Centre Jurisdiction');
    expect(getStateNameByCode('00')).toBeNull();
  });
});

describe('determineGstType', () => {
  it('INTRA for the same state, INTER otherwise, INTRA when unknown', () => {
    expect(determineGstType('29', '29')).toBe('INTRA');
    expect(determineGstType('29', '27')).toBe('INTER');
    expect(determineGstType(null, '27')).toBe('INTRA');
    expect(determineGstType('29', undefined)).toBe('INTRA');
  });
});

describe('splitGst', () => {
  it('INTRA halves the GST into CGST and SGST', () => {
    expect(splitGst(1_000, 18, 'INTRA')).toEqual({
      taxableAmount: 1_000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, totalGstAmount: 180, totalAmount: 1_180,
    });
  });

  it('INTER puts everything in IGST', () => {
    expect(splitGst(1_000, 18, 'INTER')).toEqual({
      taxableAmount: 1_000, cgstAmount: 0, sgstAmount: 0, igstAmount: 180, totalGstAmount: 180, totalAmount: 1_180,
    });
  });

  it('CGST + SGST always equals the total GST even when the half lands on a half-paisa', () => {
    // 1234.57 × 5% = 61.7285 → 61.73; half = 30.865 → CGST 30.87, SGST takes the remainder 30.86
    const r = splitGst(1_234.57, 5, 'INTRA');
    expect(r.totalGstAmount).toBe(61.73);
    expect(r.cgstAmount).toBe(30.87);
    expect(r.sgstAmount).toBe(30.86);
    expect(Math.round((r.cgstAmount + r.sgstAmount) * 100) / 100).toBe(r.totalGstAmount);
    expect(r.totalAmount).toBe(1_296.3);
  });

  it('rounds the taxable amount and GST to paise', () => {
    const r = splitGst(333.333, 18, 'INTRA');
    expect(r.taxableAmount).toBe(333.33);
    expect(r.totalGstAmount).toBe(60);
    expect(r.totalAmount).toBe(393.33);
  });

  it('handles zero-rated lines', () => {
    expect(splitGst(500, 0, 'INTRA')).toMatchObject({ cgstAmount: 0, sgstAmount: 0, totalGstAmount: 0, totalAmount: 500 });
  });
});

describe('sumGstSplits', () => {
  it('sums each component with paise rounding', () => {
    const total = sumGstSplits([
      splitGst(1_000, 18, 'INTRA'),
      splitGst(1_234.57, 5, 'INTRA'),
      splitGst(250.5, 12, 'INTRA'),
    ]);
    expect(total.taxableAmount).toBe(2_485.07);
    expect(total.totalGstAmount).toBe(271.79);
    expect(total.cgstAmount).toBe(135.9);
    expect(total.sgstAmount).toBe(135.89);
    expect(total.igstAmount).toBe(0);
    expect(total.totalAmount).toBe(2_756.86);
  });

  it('is empty-safe', () => {
    expect(sumGstSplits([])).toEqual({ taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGstAmount: 0, totalAmount: 0 });
  });
});

describe('formatDocNumber', () => {
  it('formats invoice and note numbers with their configured padding', () => {
    expect(formatDocNumber('GK', '2026-27', 4, INVOICE_SEQ_PAD)).toBe('GK/2026-27/04');
    expect(formatDocNumber('GK', '2026-27', 123, INVOICE_SEQ_PAD)).toBe('GK/2026-27/123');
    expect(formatDocNumber('CN', '2026-27', 2, CREDIT_DEBIT_SEQ_PAD)).toBe('CN/2026-27/0002');
    expect(formatDocNumber('DN', '2026-27', 10_000, CREDIT_DEBIT_SEQ_PAD)).toBe('DN/2026-27/10000');
  });
});
