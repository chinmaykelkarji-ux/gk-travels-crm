import { describe, it, expect, afterEach } from 'vitest';
import {
  normalizeIdNumber, last4, maskIdNumber, maskFromLast4, isMaskedValue, verhoeffValid, isValidAadhaar,
  isValidPan, isPlausiblePassport, validateGovtId,
} from '../../src/shared/calc/identity';
import { seal, open, blindIndex, resetCryptoCache, encryptionConfigured } from '../../server/src/core/crypto';

describe('identity numbers (pure)', () => {
  it('normalises, masks and recognises masked echoes', () => {
    expect(normalizeIdNumber(' k 123-4567 ')).toBe('K1234567');
    expect(last4('K1234567')).toBe('4567');
    expect(maskIdNumber('k1234567')).toBe('XXXX-XXXX-4567');
    expect(maskFromLast4(null)).toBeNull();
    expect(maskIdNumber('')).toBeNull();
    expect(isMaskedValue('XXXX-XXXX-4567')).toBe(true);
    expect(isMaskedValue('xxxx-xxxx-4567')).toBe(true);
    expect(isMaskedValue('K1234567')).toBe(false);
    expect(isMaskedValue(null)).toBe(false);
  });

  it('validates Aadhaar with the Verhoeff check digit', () => {
    expect(verhoeffValid('2363')).toBe(true);           // textbook example
    expect(isValidAadhaar('2341 2341 2346')).toBe(true);
    expect(isValidAadhaar('234123412345')).toBe(false); // wrong check digit
    expect(isValidAadhaar('134123412346')).toBe(false); // cannot start with 0 or 1
    expect(isValidAadhaar('23412341234')).toBe(false);  // 11 digits
  });

  it('validates PAN and passport shapes and reports per kind', () => {
    expect(isValidPan('abcde1234f')).toBe(true);
    expect(isValidPan('ABCDE12345')).toBe(false);
    expect(isPlausiblePassport('K1234567')).toBe(true);
    expect(isPlausiblePassport('K1')).toBe(false);
    expect(validateGovtId('AADHAAR', '987654321012')).toBeNull();
    expect(validateGovtId('AADHAAR', '987654321013')).toMatch(/Aadhaar/);
    expect(validateGovtId('PAN', 'ABCDE1234F')).toBeNull();
    expect(validateGovtId('VOTER_ID', 'AB')).toMatch(/4–30/);
    expect(validateGovtId('OTHER', '')).toMatch(/Enter/);
  });
});

describe('field encryption (core/crypto)', () => {
  const saved = { key: process.env.DATA_ENCRYPTION_KEY, env: process.env.NODE_ENV };
  afterEach(() => {
    process.env.DATA_ENCRYPTION_KEY = saved.key; if (saved.key === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    process.env.NODE_ENV = saved.env;
    resetCryptoCache();
  });

  it('round-trips, uses a fresh IV every time and never contains the plaintext', () => {
    const a = seal('K1234567', 'traveller.passportNumber');
    const b = seal('K1234567', 'traveller.passportNumber');
    expect(a).toMatch(/^v1:/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('K1234567');
    expect(open(a, 'traveller.passportNumber')).toBe('K1234567');
  });

  it('refuses a value moved to another column or tampered with', () => {
    const a = seal('K1234567', 'traveller.passportNumber');
    expect(() => open(a, 'customer.passportNo')).toThrow();
    const raw = Buffer.from(a.slice(3), 'base64');
    raw[14] ^= 0xff;
    expect(() => open(`v1:${raw.toString('base64')}`, 'traveller.passportNumber')).toThrow();
    expect(() => open('v2:abc', 'traveller.passportNumber')).toThrow(/Unsupported/);
  });

  it('blind index ignores formatting but depends on purpose and key', () => {
    expect(blindIndex('k 123-4567', 'passport')).toBe(blindIndex('K1234567', 'passport'));
    expect(blindIndex('K1234567', 'passport')).not.toBe(blindIndex('K1234567', 'govt-id'));
    const devHash = blindIndex('K1234567', 'passport');
    process.env.DATA_ENCRYPTION_KEY = 'ab'.repeat(32);
    resetCryptoCache();
    expect(encryptionConfigured()).toBe(true);
    expect(blindIndex('K1234567', 'passport')).not.toBe(devHash);
    const sealed = seal('X', 'p');
    process.env.DATA_ENCRYPTION_KEY = 'cd'.repeat(32);
    resetCryptoCache();
    expect(() => open(sealed, 'p')).toThrow();
  });

  it('refuses to run in production without a key, and rejects keys of the wrong length', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    resetCryptoCache();
    expect(() => seal('K1234567', 'p')).toThrow(/not configured/);
    process.env.DATA_ENCRYPTION_KEY = 'short';
    resetCryptoCache();
    expect(() => seal('K1234567', 'p')).toThrow(/32 bytes/);
  });
});
