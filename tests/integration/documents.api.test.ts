// Document centre foundation through the real app with the local storage
// provider: register → presigned PUT → complete → list/link/download → delete
// rules, validation, tenant isolation, and the "not configured" path.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, seedUser, ensureOrganization } from './helpers/db';
import { app, as, USER_IDS } from './helpers/app';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

async function register(role: 'ADMIN' | 'OPERATIONS' = 'OPERATIONS', extra: Record<string, unknown> = {}) {
  return as(role).post('/api/v2/documents', {
    fileName: 'IndiGo-6E123.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length, type: 'FLIGHT_TICKET',
    links: [{ entityType: 'trip', entityId: 'GK-2026-0001', role: 'TICKET' }],
    ...extra,
  });
}

async function uploadAndComplete(role: 'ADMIN' | 'OPERATIONS' = 'OPERATIONS') {
  const reg = await register(role);
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  const put = await request(app!).put(reg.body.upload.url).set('content-type', 'application/pdf').send(PDF);
  expect(put.status).toBe(200);
  const done = await as(role).post(`/api/v2/documents/${reg.body.document.id}/complete`);
  expect(done.status).toBe(200);
  return done.body as { id: string; status: string; sizeBytes: number; sha256: string | null; links: Array<{ id: string }> };
}

describe.skipIf(!hasTestDb)('documents v2', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('register → presigned PUT → complete → metadata with hash and links', async () => {
    const reg = await register();
    expect(reg.body.document).toMatchObject({ status: 'PENDING_UPLOAD', type: 'FLIGHT_TICKET', title: 'IndiGo-6E123', organizationId: 'org_gktravels' });
    expect(reg.body.upload).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/pdf' } });
    expect(reg.body.upload.url).toMatch(/^\/api\/v2\/storage\/local\/org_gktravels\/\d{4}\/\d{2}\/[0-9a-f]{32}\.pdf\?op=put/);
    expect(reg.body.document.storageKey).not.toContain('GK-2026-0001'); // keys are random, never entity ids

    // Download before upload is refused.
    expect((await as('OPERATIONS').get(`/api/v2/documents/${reg.body.document.id}/download`)).status).toBe(409);

    const put = await request(app!).put(reg.body.upload.url).set('content-type', 'application/pdf').send(PDF);
    expect(put.status).toBe(200);
    const done = await as('OPERATIONS').post(`/api/v2/documents/${reg.body.document.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'UPLOADED', sizeBytes: PDF.length });
    expect(done.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.body.links[0]).toMatchObject({ entityType: 'trip', entityId: 'GK-2026-0001', role: 'TICKET' });
    expect(await prisma.activityLog.count({ where: { action: 'document_uploaded', entityId: done.body.id } })).toBe(1);
  });

  it('upload URLs are signed and expire; tampering is refused', async () => {
    const reg = await register();
    const url: string = reg.body.upload.url;
    expect((await request(app!).put(url.replace(/sig=[0-9a-f]+/, 'sig=deadbeef')).send(PDF)).status).toBe(403);
    expect((await request(app!).put(url.replace(/exp=\d+/, 'exp=1')).send(PDF)).status).toBe(403);
    expect((await request(app!).put(url.replace('op=put', 'op=get')).send(PDF)).status).toBe(403);
    // Completing before any bytes arrived is a state conflict, not a crash.
    expect((await as('OPERATIONS').post(`/api/v2/documents/${reg.body.document.id}/complete`)).status).toBe(409);
  });

  it('lists by entity, filters by type, and issues short-lived download links that serve the file', async () => {
    const doc = await uploadAndComplete();
    const list = await as('ACCOUNTS').get('/api/v2/documents?entityType=trip&entityId=GK-2026-0001');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(doc.id);
    expect((await as('ACCOUNTS').get('/api/v2/documents?type=PASSPORT')).body.total).toBe(0);
    expect((await as('ACCOUNTS').get('/api/v2/documents?entityType=trip&entityId=OTHER')).body.total).toBe(0);

    const dl = await as('BOOKING').get(`/api/v2/documents/${doc.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.body.url).toMatch(/op=get/);
    const file = await request(app!).get(dl.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('IndiGo-6E123.pdf');
    expect(Buffer.from(file.body).equals(PDF) || file.text === PDF.toString()).toBe(true);
  });

  it('validates type, size and shape', async () => {
    const bad = await register('OPERATIONS', { mimeType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect((await register('OPERATIONS', { sizeBytes: 30 * 1024 * 1024 })).status).toBe(400);
    expect((await register('OPERATIONS', { links: [{ entityType: 'spaceship', entityId: 'x' }] })).status).toBe(400);
    expect((await as('OPERATIONS').post('/api/v2/documents', {})).status).toBe(400);
  });

  it('links can be added and removed; delete is refused for processed or financial documents', async () => {
    const doc = await uploadAndComplete();
    const link = await as('OPERATIONS').post(`/api/v2/documents/${doc.id}/links`, { entityType: 'customer', entityId: 'CUS-2026-0001', role: 'ID' });
    expect(link.status).toBe(201);
    expect((await as('OPERATIONS').get(`/api/v2/documents/${doc.id}`)).body.links).toHaveLength(2);
    expect((await as('OPERATIONS').delete(`/api/v2/documents/${doc.id}/links/${link.body.id}`)).status).toBe(200);

    await prisma.document.update({ where: { id: doc.id }, data: { status: 'EXTRACTED' } });
    expect((await as('OPERATIONS').delete(`/api/v2/documents/${doc.id}`)).status).toBe(409);
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'UPLOADED' } });
    await as('ACCOUNTS').post(`/api/v2/documents/${doc.id}/links`, { entityType: 'invoice', entityId: 'INV-1' });
    expect((await as('OPERATIONS').delete(`/api/v2/documents/${doc.id}`)).status).toBe(409);

    const plain = await uploadAndComplete();
    expect((await as('OPERATIONS').delete(`/api/v2/documents/${plain.id}`)).status).toBe(200);
    expect(await prisma.document.findUnique({ where: { id: plain.id } })).toBeNull();
  });

  it('is tenant-scoped: another organisation cannot see or download the document', async () => {
    const doc = await uploadAndComplete();
    await ensureOrganization('org_b', 'B');
    const { runAsOrganization } = await import('../../server/src/core/requestContext.js');
    const visible = await runAsOrganization('org_b', () => prisma.document.findUnique({ where: { id: doc.id } }));
    expect(visible).toBeNull();
    expect(await prisma.document.count()).toBe(1);
  });

  it('a newer copy is a version: the old one is kept with its links, and only the newest is listed', async () => {
    const first = await uploadAndComplete();
    const v2 = await as('OPERATIONS').post(`/api/v2/documents/${first.id}/versions`, {
      fileName: 'IndiGo-6E123-reissued.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length,
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    expect(v2.body.document).toMatchObject({ version: 2, previousVersionId: first.id, status: 'PENDING_UPLOAD' });
    expect(v2.body.document.links.map((l: { entityType: string; entityId: string }) => `${l.entityType}:${l.entityId}`)).toEqual(['trip:GK-2026-0001']);
    await request(app!).put(v2.body.upload.url).set('content-type', 'application/pdf').send(PDF);
    expect((await as('OPERATIONS').post(`/api/v2/documents/${v2.body.document.id}/complete`)).status).toBe(200);

    const listed = (await as('OPERATIONS').get('/api/v2/documents?entityType=trip&entityId=GK-2026-0001')).body;
    expect(listed.items.map((d: { id: string }) => d.id)).toEqual([v2.body.document.id]);
    const all = (await as('OPERATIONS').get('/api/v2/documents?entityType=trip&entityId=GK-2026-0001&includeSuperseded=true')).body;
    expect(all.items).toHaveLength(2);

    // The original stays reachable, and cannot be deleted while a newer copy points at it.
    const old = await as('OPERATIONS').get(`/api/v2/documents/${first.id}`);
    expect(old.status).toBe(200);
    expect(old.body.versions.map((v: { version: number }) => v.version)).toEqual([2]);
    const del = await as('OPERATIONS').delete(`/api/v2/documents/${first.id}`);
    expect(del.status).toBe(409);
  });

  it('details can be corrected, and an identity document can never be marked customer-visible', async () => {
    const doc = await uploadAndComplete();
    const patched = await as('OPERATIONS').patch(`/api/v2/documents/${doc.id}`, {
      title: 'Kashi group — outbound ticket', expiresAt: '2027-03-31', notes: 'Group PNR for 42 yatris', customerVisible: true,
    });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body).toMatchObject({ title: 'Kashi group — outbound ticket', customerVisible: true, notes: 'Group PNR for 42 yatris' });
    expect(patched.body.expiresAt.slice(0, 10)).toBe('2027-03-31');
    expect(await prisma.activityLog.count({ where: { action: 'document_updated', entityId: doc.id } })).toBe(1);

    // Turning it into a passport takes the visibility away with it.
    const asPassport = await as('OPERATIONS').patch(`/api/v2/documents/${doc.id}`, { type: 'PASSPORT' });
    expect(asPassport.body).toMatchObject({ type: 'PASSPORT', customerVisible: false });
    expect((await as('OPERATIONS').patch(`/api/v2/documents/${doc.id}`, { customerVisible: true })).body.customerVisible).toBe(false);
    expect((await as('OPERATIONS').patch(`/api/v2/documents/${doc.id}`, {})).status).toBe(400);
  });

  it('finds a document by its words, and lists what expires before a date', async () => {
    const doc = await uploadAndComplete();
    await as('OPERATIONS').patch(`/api/v2/documents/${doc.id}`, { title: 'Yatri passport copy', type: 'PASSPORT', expiresAt: '2026-12-31' });
    const other = await register('OPERATIONS', { fileName: 'hotel.pdf', type: 'HOTEL_CONFIRMATION', title: 'Ganga View confirmation', links: [] });

    const found = (await as('OPERATIONS').get('/api/v2/documents?q=passport')).body;
    expect(found.items.map((d: { id: string }) => d.id)).toEqual([doc.id]);
    const expiring = (await as('OPERATIONS').get('/api/v2/documents?expiringBefore=2027-01-31')).body;
    expect(expiring.items.map((d: { id: string }) => d.id)).toEqual([doc.id]);
    expect((await as('OPERATIONS').get('/api/v2/documents?expiringBefore=2026-06-30')).body.items).toHaveLength(0);
    expect((await as('OPERATIONS').get('/api/v2/documents?type=HOTEL_CONFIRMATION')).body.items.map((d: { id: string }) => d.id)).toEqual([other.body.document.id]);
  });

  it('says honestly what the machine can do today, to anyone who may see documents, and never shows a key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const ai = await import('../../server/src/ai/index.js');
    ai.resetAiProvider();
    try {
      const r = await as('OPERATIONS').get('/api/v2/ai/status');
      expect(r.status).toBe(200);
      expect(r.body.extraction).toMatchObject({ provider: 'claude', configured: false });
      expect(r.body.extraction.hint).toContain('ANTHROPIC_API_KEY');
      expect(r.body.storage.configured).toBe(true);       // local disk in tests
      expect(r.body.ready).toBe(false);
      expect(JSON.stringify(r.body)).not.toContain('sk-');

      process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
      ai.resetAiProvider();
      const on = await as('ACCOUNTS').get('/api/v2/ai/status');
      expect(on.body).toMatchObject({ ready: true, extraction: { configured: true } });
      expect(on.body.extraction.model).toMatch(/^claude-/);
      expect(JSON.stringify(on.body)).not.toContain('test-key-not-used');
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
      ai.resetAiProvider();
    }
  });

  it('reports "not configured" cleanly when no provider is available', async () => {
    const storage = await import('../../server/src/core/storage.js');
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    storage.resetStorageProvider();
    try {
      expect(storage.isStorageConfigured()).toBe(false);
      const r = await register();
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('NOT_CONFIGURED');
    } finally {
      process.env.NODE_ENV = savedEnv;
      storage.resetStorageProvider();
    }
  });
});
