// API keys: shown once, read-only, only what they were given, ended at once by revoking.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany, seedCustomer, seedTrip } from './helpers/db';
import { app, as, USER_IDS } from './helpers/app';

describe.skipIf(!hasTestDb)('API keys', () => {
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
    await seedTrip();
  });

  it('a key reads exactly what it was given, nothing more, and never writes', async () => {
    expect((await as('BOOKING').post('/api/v2/api-keys', { name: 'x', permissions: ['trips:read'] })).status).toBe(403);
    expect((await as('ADMIN').post('/api/v2/api-keys', { name: 'Writer', permissions: ['trips:write'] })).status).toBe(400);
    const made = await as('ADMIN').post('/api/v2/api-keys', { name: 'Accounting export', permissions: ['trips:read'], days: 30 });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const key = made.body.key as string;
    expect(key).toMatch(/^tos_[a-z0-9]{8}_/);
    const stored = await prisma.apiKey.findFirstOrThrow();
    expect(JSON.stringify(stored)).not.toContain(key.split('_')[2]);

    const get = (path: string) => request(app!).get(path).set('Authorization', `Bearer ${key}`);
    const trips = await get('/api/v2/trips');
    expect(trips.status, JSON.stringify(trips.body)).toBe(200);
    expect(trips.body.items[0]).toMatchObject({ id: 'GK-2026-0001' });
    expect(trips.body.items[0]).not.toHaveProperty('supplierCost');           // redaction applies to keys too
    expect((await get('/api/v2/customers')).status).toBe(403);                   // not given
    expect((await request(app!).post('/api/v2/tasks').set('Authorization', `Bearer ${key}`).send({ title: 'x' })).status).toBe(403);
    expect((await get('/api/data/all')).status).toBe(403);                        // classic routes are not open to keys
    expect((await prisma.apiKey.findFirstOrThrow()).useCount).toBe(1);

    await as('ADMIN').post(`/api/v2/api-keys/${stored.id}/revoke`);
    expect((await get('/api/v2/trips')).status).toBe(401);
    expect((await request(app!).get('/api/v2/trips').set('Authorization', 'Bearer tos_abcdefgh_' + 'x'.repeat(48))).status).toBe(401);
  });
});
