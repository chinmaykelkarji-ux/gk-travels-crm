// Identity numbers (passport, Aadhaar, other government IDs): normalisation,
// validation and masking. Pure and dependency-free so the SPA and the API
// agree on what a masked value looks like. Encryption lives on the server
// (server/src/core/crypto.ts); only the last four characters ever leave it
// unless a user explicitly reveals the value (which is audited).

export const MASK_PREFIX = 'XXXX-XXXX-';

/** Upper-case, strip spaces, hyphens, dots and slashes. */
export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[\s\-./]/g, '');
}

export function last4(value: string): string {
  const n = normalizeIdNumber(value);
  return n.slice(-4);
}

/** The display form of a stored identity number: XXXX-XXXX-1234. */
export function maskFromLast4(lastFour: string | null | undefined): string | null {
  return lastFour ? `${MASK_PREFIX}${lastFour}` : null;
}

export function maskIdNumber(value: string | null | undefined): string | null {
  return value ? maskFromLast4(last4(value)) : null;
}

/** True when a client echoed a masked value back (meaning "unchanged"). */
export function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.toUpperCase().startsWith(MASK_PREFIX);
}

// ── Aadhaar: 12 digits, first digit 2–9, Verhoeff check digit ──
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][rev[i]]];
  return c === 0;
}

export function isValidAadhaar(value: string): boolean {
  const n = normalizeIdNumber(value);
  return /^[2-9]\d{11}$/.test(n) && verhoeffValid(n);
}

/** Indian passport: one letter + seven digits. Foreign passports vary, so only a loose shape check. */
export function isPlausiblePassport(value: string): boolean {
  const n = normalizeIdNumber(value);
  return /^[A-Z0-9]{6,12}$/.test(n);
}

export function isValidPan(value: string): boolean {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(normalizeIdNumber(value));
}

export type GovtIdKind = 'AADHAAR' | 'PAN' | 'VOTER_ID' | 'DRIVING_LICENCE' | 'PASSPORT' | 'OTHER';

/** Returns an error message, or null when the number is acceptable for its kind. */
export function validateGovtId(kind: GovtIdKind, value: string): string | null {
  const n = normalizeIdNumber(value);
  if (!n) return 'Enter the ID number';
  switch (kind) {
    case 'AADHAAR':  return isValidAadhaar(n) ? null : 'Not a valid Aadhaar number (12 digits with a valid check digit)';
    case 'PAN':      return isValidPan(n) ? null : 'PAN must look like ABCDE1234F';
    case 'PASSPORT': return isPlausiblePassport(n) ? null : 'Passport number looks wrong';
    default:         return n.length >= 4 && n.length <= 30 ? null : 'ID number must be 4–30 characters';
  }
}
