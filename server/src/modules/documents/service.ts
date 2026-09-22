// ============================================================
// The document centre.
//
// A file is registered first, uploaded straight to storage with a short-lived
// signed PUT, and only then confirmed — so a browser never streams a 20 MB
// scan through the API, and a half-finished upload is visible as
// "waiting for the file" rather than a lie.
//
// Rules that live here rather than in a screen:
//   - identity documents (passport, visa, ID) can never be marked
//     customer-visible, whatever the caller sends (hard rule 7)
//   - a newer copy is a new version that keeps the old one and its links;
//     nothing is overwritten, and the original is always retrievable
//   - a document that has been read into a record is evidence: it is unlinked,
//     never deleted, and a document on a financial record cannot go at all
//   - every upload, download link, change and deletion is audited
// ============================================================

import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, notConfigured, stateConflict } from '../../core/errors.js';
import { getStorage, newStorageKey, type Disposition } from '../../core/storage.js';
import { currentOrganizationId } from '../../core/requestContext.js';
import {
  ALLOWED_MIME, IDENTITY_TYPES, MAX_DOCUMENT_BYTES,
  type DocumentCreate, type DocumentListQuery, type DocumentLinkInput, type DocumentUpdate, type DocumentVersionCreate,
} from '../../../../src/shared/contracts/documents.js';
import { page } from '../masters/common.js';

const withLinks = { links: { orderBy: { createdAt: 'asc' as const } } };
/** A document can be removed only while nothing has been done with it. */
const REMOVABLE = ['PENDING_UPLOAD', 'UPLOADED', 'FAILED'];
const FINANCIAL_ENTITIES = ['invoice', 'payment'];

function storageOrFail() {
  const storage = getStorage();
  if (!storage) throw notConfigured('Document storage');
  return storage;
}

function extensionFor(mimeType: string): string {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) throw new AppError('VALIDATION_ERROR', 400, `File type ${mimeType} is not accepted`, { mimeType: 'Allowed: PDF, JPEG, PNG, WebP, HEIC, DOCX, XLSX, CSV' });
  return ext;
}

/** An identity document is never shown to a customer, whoever asks. */
function visibility(type: string, wanted: boolean): boolean {
  return IDENTITY_TYPES.includes(type as never) ? false : wanted;
}

export async function registerDocument(input: DocumentCreate, userId?: string) {
  const storage = storageOrFail();
  const key = newStorageKey(currentOrganizationId(), extensionFor(input.mimeType));
  const document = await prisma.document.create({
    data: {
      type: input.type,
      title: input.title ?? path.parse(input.fileName).name,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: key,
      status: 'PENDING_UPLOAD',
      uploadedById: userId ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      notes: input.notes ?? null,
      customerVisible: visibility(input.type, input.customerVisible),
      links: { create: input.links.map(l => ({ entityType: l.entityType, entityId: l.entityId, role: l.role ?? null })) },
    },
    include: withLinks,
  });
  const upload = await storage.presignUpload(key, input.mimeType, input.sizeBytes);
  return { document, upload };
}

/** A newer copy: same links, same visibility, the old one kept and marked superseded. */
export async function registerVersion(id: string, input: DocumentVersionCreate, userId?: string) {
  const storage = storageOrFail();
  const previous = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!previous) throw notFound('Document');
  if (previous.status === 'PENDING_UPLOAD') throw stateConflict('The first version has not been uploaded yet');

  const type = input.type ?? previous.type;
  const key = newStorageKey(currentOrganizationId(), extensionFor(input.mimeType));
  const document = await prisma.document.create({
    data: {
      type,
      title: input.title ?? previous.title,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: key,
      status: 'PENDING_UPLOAD',
      uploadedById: userId ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : previous.expiresAt,
      notes: input.notes ?? previous.notes,
      customerVisible: visibility(type, previous.customerVisible),
      version: previous.version + 1,
      previousVersionId: previous.id,
      links: { create: previous.links.map(l => ({ entityType: l.entityType, entityId: l.entityId, role: l.role })) },
    },
    include: withLinks,
  });
  const upload = await storage.presignUpload(key, input.mimeType, input.sizeBytes);
  return { document, upload };
}

export async function completeUpload(id: string) {
  const storage = storageOrFail();
  const doc = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!doc) throw notFound('Document');
  if (doc.status !== 'PENDING_UPLOAD') return doc;

  const info = await storage.head(doc.storageKey);
  if (!info) throw stateConflict('The file has not been uploaded yet');
  if (info.sizeBytes > MAX_DOCUMENT_BYTES) {
    await storage.delete(doc.storageKey);
    throw new AppError('PAYLOAD_TOO_LARGE', 413, 'Uploaded file exceeds 25 MB');
  }

  return prisma.$transaction(async tx => {
    const u = await tx.document.update({
      where: { id },
      data: { status: 'UPLOADED', uploadedAt: new Date(), sizeBytes: info.sizeBytes, sha256: info.sha256 ?? null },
      include: withLinks,
    });
    await audit(tx, {
      action: 'document_uploaded', entityType: 'document', entityId: id,
      description: `Document "${u.fileName}" uploaded (${u.type}, ${Math.round(info.sizeBytes / 1024)} KB)${u.version > 1 ? `, version ${u.version}` : ''}`,
      after: { type: u.type, fileName: u.fileName, sizeBytes: u.sizeBytes, version: u.version, links: u.links.map(l => `${l.entityType}:${l.entityId}`) },
    });
    return u;
  });
}

export async function listDocuments(q: DocumentListQuery) {
  const where: Prisma.DocumentWhereInput = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.entityType && q.entityId ? { links: { some: { entityType: q.entityType, entityId: q.entityId } } } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { fileName: { contains: q.q, mode: 'insensitive' } }, { notes: { contains: q.q, mode: 'insensitive' } }] } : {}),
    ...(q.expiringBefore ? { expiresAt: { not: null, lte: new Date(`${q.expiringBefore}T23:59:59.999Z`) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.document.findMany({ where, include: withLinks, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.document.count({ where }),
  ]);
  if (q.includeSuperseded) return page(rows, total, q);
  // A version points at the one before it, so anything pointed at is old news.
  const superseded = new Set(rows.map(r => r.previousVersionId).filter((x): x is string => !!x));
  const latest = rows.filter(r => !superseded.has(r.id));
  return page(latest, total - (rows.length - latest.length), q);
}

export async function getDocument(id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!doc) throw notFound('Document');
  const versions = await prisma.document.findMany({
    where: { OR: [{ previousVersionId: id }, { id: doc.previousVersionId ?? '__none__' }] },
    select: { id: true, version: true, fileName: true, uploadedAt: true, status: true },
    orderBy: { version: 'asc' },
  });
  return { ...doc, versions };
}

export async function downloadLink(id: string, disposition: Disposition = 'attachment') {
  const storage = storageOrFail();
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw notFound('Document');
  if (doc.status === 'PENDING_UPLOAD') throw stateConflict('The file has not been uploaded yet');
  const link = await storage.presignDownload(doc.storageKey, doc.fileName, undefined, disposition);
  await audit(prisma, {
    action: 'document_downloaded', entityType: 'document', entityId: doc.id,
    description: `Download link issued for "${doc.fileName}"`, metadata: { expiresAt: link.expiresAt },
  });
  return link;
}

export async function updateDocument(id: string, input: DocumentUpdate, userId?: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!doc) throw notFound('Document');
  const type = input.type ?? doc.type;
  const data: Prisma.DocumentUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
    ...(input.customerVisible !== undefined || input.type !== undefined
      ? { customerVisible: visibility(type, input.customerVisible ?? doc.customerVisible) } : {}),
  };
  return prisma.$transaction(async tx => {
    const u = await tx.document.update({ where: { id }, data, include: withLinks });
    await audit(tx, {
      action: 'document_updated', entityType: 'document', entityId: id, userId,
      description: `Document "${u.title}" updated`,
      before: { title: doc.title, type: doc.type, expiresAt: doc.expiresAt, customerVisible: doc.customerVisible, notes: doc.notes },
      after: { title: u.title, type: u.type, expiresAt: u.expiresAt, customerVisible: u.customerVisible, notes: u.notes },
    });
    return u;
  });
}

export async function addLink(id: string, input: DocumentLinkInput) {
  const doc = await prisma.document.findUnique({ where: { id }, select: { id: true } });
  if (!doc) throw notFound('Document');
  return prisma.documentLink.upsert({
    where: { documentId_entityType_entityId: { documentId: id, entityType: input.entityType, entityId: input.entityId } },
    create: { documentId: id, entityType: input.entityType, entityId: input.entityId, role: input.role ?? null },
    update: { role: input.role ?? null },
  });
}

export async function removeLink(id: string, linkId: string) {
  const r = await prisma.documentLink.deleteMany({ where: { id: linkId, documentId: id } });
  if (!r.count) throw notFound('Link');
  return { ok: true as const };
}

export async function deleteDocument(id: string, userId?: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: withLinks });
  if (!doc) throw notFound('Document');
  if (!REMOVABLE.includes(doc.status)) {
    throw stateConflict('Documents that have been processed are kept as evidence; unlink them instead');
  }
  if (doc.links.some(l => FINANCIAL_ENTITIES.includes(l.entityType))) {
    throw stateConflict('This document is attached to a financial record and cannot be deleted');
  }
  const newer = await prisma.document.count({ where: { previousVersionId: id } });
  if (newer) throw stateConflict('A newer version points at this one; delete that first');

  const storage = getStorage();
  await prisma.$transaction(async (tx: DbClient) => {
    await tx.document.delete({ where: { id } });
    await audit(tx, {
      action: 'document_deleted', entityType: 'document', entityId: id, userId,
      description: `Document "${doc.fileName}" deleted`,
      before: { fileName: doc.fileName, type: doc.type, status: doc.status },
    });
  });
  if (storage) await storage.delete(doc.storageKey);
  return { ok: true as const };
}
