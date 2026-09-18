// ============================================================
// Field encryption for identity data (hard rule 7).
//
//   sealed = "v1:" + base64(iv[12] | ciphertext | tag[16])   AES-256-GCM
//   hash   = HMAC-SHA256(indexKey, purpose + ":" + normalised)  (blind index)
//
// The data key comes from DATA_ENCRYPTION_KEY (32 bytes, base64 or hex).
// Encryption and index keys are derived from it with HKDF so the stored
// hash cannot be used to test guesses without the key. The purpose string
// is bound as GCM additional data: a sealed passport number cannot be
// pasted into another column and decrypt there.
//
// In production a missing key is a hard NOT_CONFIGURED error (nothing is
// ever stored in clear instead). Development and tests fall back to a fixed
// key that is useless outside this repository.
// ============================================================

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { notConfigured } from './errors.js';
import { normalizeIdNumber } from '../../../src/shared/calc/identity.js';

const VERSION = 'v1';
const DEV_KEY = Buffer.from('travelos-development-only-key-000', 'utf8').subarray(0, 32);

interface Keys { enc: Buffer; idx: Buffer }
let cached: { raw: string | undefined; keys: Keys } | null = null;

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (buf.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or 44 base64 characters)');
  return buf;
}

function keys(): Keys {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (cached && cached.raw === raw) return cached.keys;
  let master: Buffer;
  if (raw) master = parseKey(raw);
  else if (process.env.NODE_ENV === 'production') throw notConfigured('Identity data encryption (DATA_ENCRYPTION_KEY)');
  else master = DEV_KEY;
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', master, Buffer.from('travelos'), Buffer.from(info), 32));
  const k = { enc: derive('field-encryption'), idx: derive('blind-index') };
  cached = { raw, keys: k };
  return k;
}

/** True when a real key is configured (Settings shows this). */
export function encryptionConfigured(): boolean {
  return Boolean(process.env.DATA_ENCRYPTION_KEY);
}

export function seal(plain: string, purpose: string): string {
  const { enc } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', enc, iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64')}`;
}

export function open(sealed: string, purpose: string): string {
  const { enc } = keys();
  const [version, payload] = sealed.split(':', 2);
  if (version !== VERSION || !payload) throw new Error('Unsupported sealed value');
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 12 + 16) throw new Error('Sealed value is truncated');
  const decipher = createDecipheriv('aes-256-gcm', enc, buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([decipher.update(buf.subarray(12, buf.length - 16)), decipher.final()]).toString('utf8');
}

/** Deterministic keyed hash for exact-match lookups (duplicates, search). */
export function blindIndex(value: string, purpose: string): string {
  const { idx } = keys();
  return createHmac('sha256', idx).update(`${purpose}:${normalizeIdNumber(value)}`).digest('hex');
}

/** For tests: forget the derived keys after changing the environment. */
export function resetCryptoCache(): void {
  cached = null;
}
