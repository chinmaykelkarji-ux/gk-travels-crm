import { describe, it, expect } from 'vitest';
import { backoffMs, MAX_BACKOFF_MS } from '../../server/src/core/jobs';
import { newStorageKey, signLocal, verifyLocal, localPathFor } from '../../server/src/core/storage';

describe('job backoff', () => {
  it('doubles from 30 seconds and caps at one hour', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(10)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(0)).toBe(30_000);
  });
});

describe('storage keys and local signatures', () => {
  it('keys are random, organisation-prefixed and carry a sanitised extension', () => {
    const a = newStorageKey('org_x', 'pdf');
    const b = newStorageKey('org_x', 'P.D/F');
    expect(a).toMatch(/^org_x\/\d{4}\/\d{2}\/[0-9a-f]{32}\.pdf$/);
    expect(b).toMatch(/\.pdf$/);
    expect(a).not.toBe(newStorageKey('org_x', 'pdf'));
  });

  it('signatures bind key, operation and expiry', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signLocal('org/2026/09/abc.pdf', 'put', exp);
    expect(verifyLocal('org/2026/09/abc.pdf', 'put', exp, sig)).toBe(true);
    expect(verifyLocal('org/2026/09/abc.pdf', 'get', exp, sig)).toBe(false);
    expect(verifyLocal('org/2026/09/xyz.pdf', 'put', exp, sig)).toBe(false);
    expect(verifyLocal('org/2026/09/abc.pdf', 'put', exp - 120, signLocal('org/2026/09/abc.pdf', 'put', exp - 120))).toBe(false);
    expect(verifyLocal('org/2026/09/abc.pdf', 'put', exp, 'ff')).toBe(false);
  });

  it('refuses path traversal in keys', () => {
    expect(() => localPathFor('../etc/passwd')).toThrow();
    expect(() => localPathFor('org/../../x')).toThrow();
    expect(() => localPathFor('org/2026/09/ok.pdf')).not.toThrow();
  });
});
