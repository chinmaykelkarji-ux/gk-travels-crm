import { describe, it, expect } from 'vitest';
import { normalizePhone, formatPhone } from '../../src/shared/calc/phone';

describe('normalizePhone', () => {
  it('collapses Indian formats to the 10-digit subscriber number', () => {
    for (const v of ['+91 98765 43210', '098765 43210', '9876543210', '+91-98765-43210', '0091 9876543210', '91 9876543210']) {
      expect(normalizePhone(v), v).toBe('9876543210');
    }
  });
  it('keeps other international numbers as digits and rejects junk', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('442079460958');
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
  it('formats 10-digit numbers for display', () => {
    expect(formatPhone('+919876543210')).toBe('98765 43210');
    expect(formatPhone('442079460958')).toBe('442079460958');
  });
});
