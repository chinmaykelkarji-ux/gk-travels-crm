// ============================================================
// Storage — private object storage behind presigned URLs.
//
// Providers:
//   s3     any S3-compatible bucket (Cloudflare R2 is the target):
//          STORAGE_BUCKET, STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID,
//          STORAGE_SECRET_ACCESS_KEY (+ STORAGE_REGION, default "auto")
//   local  a directory on disk served through signed API URLs; used for
//          development and tests, never chosen in production
//
// Rules (docs/travelos/02-target-architecture.md H.1, decision 5):
//   - the browser uploads and downloads directly against a short-lived
//     presigned URL; the API never proxies file bytes to a bucket
//   - object keys are random and never derived from entity ids
//   - there is no public URL for any document
// ============================================================

import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUpload   { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string }
export interface PresignedDownload { url: string; expiresAt: string }
export interface ObjectInfo        { sizeBytes: number; contentType?: string | null; sha256?: string | null }

export interface StorageProvider {
  readonly kind: 'local' | 's3';
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;
  presignDownload(key: string, fileName: string, ttlSeconds?: number): Promise<PresignedDownload>;
  head(key: string): Promise<ObjectInfo | null>;
  delete(key: string): Promise<void>;
}

export const UPLOAD_TTL_SECONDS   = 15 * 60;
export const DOWNLOAD_TTL_SECONDS = 60;

/** Random, opaque, and prefixed by organisation so a bucket listing stays navigable. */
export function newStorageKey(organizationId: string, extension: string): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  const now = new Date();
  return `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(16).toString('hex')}${ext ? '.' + ext : ''}`;
}

// ── Local provider ────────────────────────────────────────────
// Files live under STORAGE_LOCAL_DIR (default .storage/). URLs point at
// /api/v2/storage/local/<key>?op=put|get&exp=<unix>&sig=<hmac>, verified by
// routes/v2/storageLocal.ts with the same secret.

function localSecret(): string {
  return process.env.STORAGE_LOCAL_SECRET ?? process.env.JWT_SECRET ?? 'local-storage-secret';
}

export function signLocal(key: string, op: 'put' | 'get', exp: number): string {
  return createHmac('sha256', localSecret()).update(`${key}|${op}|${exp}`).digest('hex');
}

export function verifyLocal(key: string, op: 'put' | 'get', exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(signLocal(key, op, exp));
  const given    = Buffer.from(sig || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function localDir(): string {
  return path.resolve(process.env.STORAGE_LOCAL_DIR ?? '.storage');
}

export function localPathFor(key: string): string {
  if (!/^[\w./-]+$/.test(key) || key.includes('..')) throw new Error('invalid storage key');
  return path.join(localDir(), key);
}

class LocalStorageProvider implements StorageProvider {
  readonly kind = 'local' as const;

  async presignUpload(key: string, contentType: string, _maxBytes: number): Promise<PresignedUpload> {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
    return {
      url: `/api/v2/storage/local/${key}?op=put&exp=${exp}&sig=${signLocal(key, 'put', exp)}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async presignDownload(key: string, fileName: string, ttlSeconds = DOWNLOAD_TTL_SECONDS): Promise<PresignedDownload> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return {
      url: `/api/v2/storage/local/${key}?op=get&exp=${exp}&sig=${signLocal(key, 'get', exp)}&name=${encodeURIComponent(fileName)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const file = localPathFor(key);
      const stat = await fs.stat(file);
      const hash = createHash('sha256');
      await new Promise<void>((resolve, reject) => {
        createReadStream(file).on('data', c => hash.update(c)).on('end', () => resolve()).on('error', reject);
      });
      return { sizeBytes: stat.size, sha256: hash.digest('hex') };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try { await fs.unlink(localPathFor(key)); } catch { /* already gone */ }
  }
}

// ── S3 / R2 provider ──────────────────────────────────────────

class S3StorageProvider implements StorageProvider {
  readonly kind = 's3' as const;
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region:      process.env.STORAGE_REGION ?? 'auto',
      endpoint:    process.env.STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId:     process.env.STORAGE_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY as string,
      },
    });
  }

  async presignUpload(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload> {
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: UPLOAD_TTL_SECONDS });
    return { url, method: 'PUT', headers: { 'content-type': contentType, 'x-max-bytes': String(maxBytes) }, expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString() };
  }

  async presignDownload(key: string, fileName: string, ttlSeconds = DOWNLOAD_TTL_SECONDS): Promise<PresignedDownload> {
    const safeName = fileName.replace(/["\r\n]/g, '_');
    const url = await getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket, Key: key, ResponseContentDisposition: `attachment; filename="${safeName}"`,
    }), { expiresIn: ttlSeconds });
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? null, sha256: null };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// ── Factory ───────────────────────────────────────────────────

let cached: StorageProvider | null | undefined;

export function getStorage(): StorageProvider | null {
  if (cached !== undefined) return cached;
  const bucket = process.env.STORAGE_BUCKET;
  if (bucket && process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY) {
    cached = new S3StorageProvider(bucket);
  } else if (process.env.NODE_ENV !== 'production' || process.env.STORAGE_ALLOW_LOCAL_IN_PRODUCTION === 'yes') {
    cached = new LocalStorageProvider();
  } else {
    cached = null;
  }
  return cached;
}

export function isStorageConfigured(): boolean {
  return getStorage() !== null;
}

/** Test hook. */
export function resetStorageProvider(): void {
  cached = undefined;
}
