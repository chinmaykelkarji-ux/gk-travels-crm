// Local storage transport — only mounted when the local provider is active.
// PUT writes the object under STORAGE_LOCAL_DIR, GET streams it back. Both
// require a valid HMAC signature and unexpired timestamp minted by
// core/storage.ts, so the URLs behave like presigned bucket URLs.
import { Router } from 'express';
import express from 'express';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { verifyLocal, localPathFor } from '../../core/storage.js';
import { AppError } from '../../core/errors.js';

const router = Router();
const MAX_LOCAL_UPLOAD = 25 * 1024 * 1024;

const INLINE_TYPES: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Express 5 wildcards ("/*key") capture the segments as an array.
function keyOf(params: Record<string, unknown>): string {
  const k = params.key;
  return Array.isArray(k) ? k.join('/') : String(k ?? '');
}

function checkSignature(key: string, op: 'put' | 'get', query: Record<string, unknown>): void {
  const exp = Number(query.exp);
  const sig = typeof query.sig === 'string' ? query.sig : '';
  if (query.op !== op || !verifyLocal(key, op, exp, sig)) {
    throw new AppError('FORBIDDEN', 403, 'Storage link is invalid or has expired');
  }
}

router.put('/*key', express.raw({ type: () => true, limit: MAX_LOCAL_UPLOAD }), async (req, res) => {
  const key = keyOf(req.params as Record<string, unknown>);
  checkSignature(key, 'put', req.query as Record<string, unknown>);
  const file = localPathFor(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError('VALIDATION_ERROR', 400, 'Empty upload');
  await fs.writeFile(file, body);
  res.status(200).json({ ok: true, sizeBytes: body.length });
});

router.get('/*key', async (req, res) => {
  const key = keyOf(req.params as Record<string, unknown>);
  checkSignature(key, 'get', req.query as Record<string, unknown>);
  const file = localPathFor(key);
  try { await fs.access(file); } catch { throw new AppError('NOT_FOUND', 404, 'Object not found'); }
  const name = typeof req.query.name === 'string' ? req.query.name.replace(/["\r\n]/g, '_') : path.basename(key);
  // Only a PDF or a picture is ever shown inside the app; anything else
  // downloads, so a stored file can never be rendered as script by the browser.
  const type = INLINE_TYPES[path.extname(name).toLowerCase()];
  const inline = req.query.disp === 'inline' && !!type;
  res.setHeader('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.setHeader('content-type', inline ? type : 'application/octet-stream');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'private, no-store');
  createReadStream(file).pipe(res);
});

export default router;
