// ============================================================
// Documents v2 — the document centre's API (foundation for Phase 5).
//
//   POST   /api/v2/documents               register a file → presigned upload
//   POST   /api/v2/documents/:id/complete  confirm the upload landed
//   GET    /api/v2/documents               list (filters: entityType+entityId, type, status)
//   GET    /api/v2/documents/:id           metadata + links
//   GET    /api/v2/documents/:id/download  short-lived signed URL
//   POST   /api/v2/documents/:id/links     attach to an entity
//   DELETE /api/v2/documents/:id/links/:linkId
//   DELETE /api/v2/documents/:id           only while unprocessed
//
// Every response goes through the tenant-scoped client, so a document of
// another organisation is a 404. Files are never served by this router.
// ============================================================

import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { AppError, notFound, notConfigured, stateConflict } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { getStorage, newStorageKey } from '../../core/storage.js';
import { currentOrganizationId } from '../../core/requestContext.js';

const router = Router();
router.use(requireAuth);

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['text/csv', 'csv'],
]);

const DocumentType = z.enum([
  'FLIGHT_TICKET', 'TRAIN_TICKET', 'BUS_TICKET', 'HOTEL_CONFIRMATION', 'ACTIVITY_VOUCHER', 'VEHICLE_VOUCHER',
  'SUPPLIER_INVOICE', 'CUSTOMER_INVOICE', 'PAYMENT_RECEIPT', 'INSURANCE', 'PASSPORT', 'VISA', 'ID_PROOF', 'OTHER',
]);
const EntityType = z.enum([
  'customer', 'traveller', 'trip', 'booking', 'hotel', 'vehicle', 'driver', 'vendor',
  'invoice', 'payment', 'activity', 'quotation', 'enquiry', 'lead',
]);
const LinkInput = z.object({ entityType: EntityType, entityId: z.string().min(1).max(64), role: z.string().max(40).optional() });

const CreateBody = z.object({
  fileName:  z.string().min(1).max(200),
  mimeType:  z.string().min(3).max(120),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  type:      DocumentType.default('OTHER'),
  title:     z.string().max(200).optional(),
  notes:     z.string().max(2000).optional(),
  expiresAt: z.string().date().optional(),
  customerVisible: z.boolean().default(false),
  links:     z.array(LinkInput).max(10).default([]),
});

const ListQuery = z.object({
  entityType: EntityType.optional(),
  entityId:   z.string().max(64).optional(),
  type:       DocumentType.optional(),
  status:     z.enum(['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'EXTRACTED', 'NEEDS_REVIEW', 'LINKED', 'FAILED']).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
});

const withLinks = { links: { orderBy: { createdAt: 'asc' as const } } };

// ── Register + presigned upload ───────────────────────────────

router.post('/', requirePermission('documents:write'), validate({ body: CreateBody }), async (req: AuthRequest, res) => {
  const input = valid<z.infer<typeof CreateBody>>(res).body;
  const storage = getStorage();
  if (!storage) throw notConfigured('Document storage');

  const ext = ALLOWED_MIME.get(input.mimeType);
  if (!ext) throw new AppError('VALIDATION_ERROR', 400, `File type ${input.mimeType} is not accepted`, { mimeType: 'Allowed: PDF, JPEG, PNG, WebP, HEIC, DOCX, XLSX, CSV' });

  const key = newStorageKey(currentOrganizationId(), ext);
  const document = await prisma.document.create({
    data: {
      type:         input.type,
      title:        input.title ?? path.parse(input.fileName).name,
      fileName:     input.fileName,
      mimeType:     input.mimeType,
      sizeBytes:    input.sizeBytes,
      storageKey:   key,
      status:       'PENDING_UPLOAD',
      uploadedById: req.userId ?? null,
      expiresAt:    input.expiresAt ? new Date(input.expiresAt) : null,
      notes:        input.notes ?? null,
      customerVisible: input.customerVisible,
      links: { create: input.links.map(l => ({ entityType: l.entityType, entityId: l.entityId, role: l.role ?? null })) },
    },
    include: withLinks,
  });

  const upload = await storage.presignUpload(key, input.mimeType, input.sizeBytes);
  res.status(201).json({ document, upload });
});

// ── Complete ──────────────────────────────────────────────────

router.post('/:id/complete', requirePermission('documents:write'), async (req: AuthRequest, res) => {
  const storage = getStorage();
  if (!storage) throw notConfigured('Document storage');
  const id = String(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!doc) throw notFound('Document');
  if (doc.status !== 'PENDING_UPLOAD') { res.json(doc); return; }

  const info = await storage.head(doc.storageKey);
  if (!info) throw stateConflict('The file has not been uploaded yet');
  if (info.sizeBytes > MAX_DOCUMENT_BYTES) {
    await storage.delete(doc.storageKey);
    throw new AppError('PAYLOAD_TOO_LARGE', 413, 'Uploaded file exceeds 25 MB');
  }

  const updated = await prisma.$transaction(async tx => {
    const u = await tx.document.update({
      where: { id },
      data:  { status: 'UPLOADED', uploadedAt: new Date(), sizeBytes: info.sizeBytes, sha256: info.sha256 ?? null },
      include: withLinks,
    });
    await audit(tx, {
      action: 'document_uploaded', entityType: 'document', entityId: id,
      description: `Document "${u.fileName}" uploaded (${u.type}, ${Math.round(info.sizeBytes / 1024)} KB)`,
      after: { type: u.type, fileName: u.fileName, sizeBytes: u.sizeBytes, links: u.links.map(l => `${l.entityType}:${l.entityId}`) },
    });
    return u;
  });
  res.json(updated);
});

// ── List + read ───────────────────────────────────────────────

router.get('/', requirePermission('documents:read'), validate({ query: ListQuery }), async (_req, res) => {
  const q = valid<unknown, z.infer<typeof ListQuery>>(res).query;
  const where = {
    ...(q.type   ? { type: q.type }     : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.entityType && q.entityId ? { links: { some: { entityType: q.entityType, entityId: q.entityId } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, include: withLinks, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.document.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

router.get('/:id', requirePermission('documents:read'), async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) }, include: withLinks });
  if (!doc) throw notFound('Document');
  res.json(doc);
});

router.get('/:id/download', requirePermission('documents:read'), async (req: AuthRequest, res) => {
  const storage = getStorage();
  if (!storage) throw notConfigured('Document storage');
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) } });
  if (!doc) throw notFound('Document');
  if (doc.status === 'PENDING_UPLOAD') throw stateConflict('The file has not been uploaded yet');
  const link = await storage.presignDownload(doc.storageKey, doc.fileName);
  await audit(prisma, {
    action: 'document_downloaded', entityType: 'document', entityId: doc.id,
    description: `Download link issued for "${doc.fileName}"`, metadata: { expiresAt: link.expiresAt },
  });
  res.json(link);
});

// ── Links ─────────────────────────────────────────────────────

router.post('/:id/links', requirePermission('documents:write'), validate({ body: LinkInput }), async (req, res) => {
  const id = String(req.params.id);
  const input = valid<z.infer<typeof LinkInput>>(res).body;
  const doc = await prisma.document.findUnique({ where: { id }, select: { id: true } });
  if (!doc) throw notFound('Document');
  const link = await prisma.documentLink.upsert({
    where:  { documentId_entityType_entityId: { documentId: id, entityType: input.entityType, entityId: input.entityId } },
    create: { documentId: id, entityType: input.entityType, entityId: input.entityId, role: input.role ?? null },
    update: { role: input.role ?? null },
  });
  res.status(201).json(link);
});

router.delete('/:id/links/:linkId', requirePermission('documents:write'), async (req, res) => {
  const r = await prisma.documentLink.deleteMany({ where: { id: String(req.params.linkId), documentId: String(req.params.id) } });
  if (!r.count) throw notFound('Link');
  res.json({ ok: true });
});

// ── Delete (only while unprocessed) ───────────────────────────

router.delete('/:id', requirePermission('documents:write'), async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!doc) throw notFound('Document');
  if (!['PENDING_UPLOAD', 'UPLOADED', 'FAILED'].includes(doc.status)) {
    throw stateConflict('Documents that have been processed are kept as evidence; unlink them instead');
  }
  if (doc.links.some(l => ['invoice', 'payment'].includes(l.entityType))) {
    throw stateConflict('This document is attached to a financial record and cannot be deleted');
  }
  const storage = getStorage();
  await prisma.$transaction(async tx => {
    await tx.document.delete({ where: { id } });
    await audit(tx, { action: 'document_deleted', entityType: 'document', entityId: id, description: `Document "${doc.fileName}" deleted`, before: { fileName: doc.fileName, type: doc.type, status: doc.status } });
  });
  if (storage) await storage.delete(doc.storageKey);
  res.json({ ok: true });
});

export default router;
