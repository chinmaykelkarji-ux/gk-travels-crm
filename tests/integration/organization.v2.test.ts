// The organisation: its own numbers change what TravelOS counts; the setup
// checklist is honest; a new organisation starts empty and separate.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { app, as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const SECRET = 'platform-secret-0123456789abcdef';

describe.skipIf(!hasTestDb)('organisation', () => {
  const saved = process.env.PLATFORM_ADMIN_SECRET;
  afterEach(() => { if (saved === undefined) delete process.env.PLATFORM_ADMIN_SECRET; else process.env.PLATFORM_ADMIN_SECRET = saved; });
  beforeEach(async () => {
    await resetDb();
    // resetDb keeps organisations; the one this suite makes is removed so a re-run starts clean.
    await prisma.$executeRawUnsafe(`DELETE FROM "organizations" WHERE "slug" = 'sai-tours'`);
    for (const role of ['ADMIN', 'BOOKING', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany();
    await seedCustomer();
    await seedTrip('GK-2026-0001', { tourName: 'Kashi Yatra', departure: day(20), returnDate: day(25), stage: 'CONFIRMING' });
  });

  it('the owner\'s numbers change what the insights count', async () => {
    const before = (await as('ADMIN').get('/api/v2/insights')).body.items.map((i: { code: string }) => i.code);
    expect(before).not.toContain('DEPARTING_UNCONFIRMED');                    // 20 days is outside the default 14
    expect((await as('BOOKING').patch('/api/v2/organization', { insights: { departingWithinDays: 30 } })).status).toBe(403);
    const saved = await as('ADMIN').patch('/api/v2/organization', { name: 'GK Travels Belagavi', insights: { departingWithinDays: 30 } });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.settings.insights).toMatchObject({ departingWithinDays: 30, overdueDays: 30 });
    const after = (await as('ADMIN').get('/api/v2/insights')).body.items;
    expect(after[0]).toMatchObject({ code: 'DEPARTING_UNCONFIRMED', text: '1 trip leaving in the next 30 days has something not yet confirmed.' });
    expect((await as('ADMIN').patch('/api/v2/organization', { insights: { thinMarginPct: 90 } })).status).toBe(400);
    expect(await prisma.activityLog.count({ where: { action: 'organization_settings_updated' } })).toBe(1);
  });

  it('the setup checklist says honestly what is missing', async () => {
    const r = await as('ADMIN').get('/api/v2/organization/setup');
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.body.items.map((i: { key: string; done: boolean }) => [i.key, i.done]));
    expect(by).toMatchObject({ team: true, customers: true, whatsapp: false, meta_templates: false, portal: false });
    expect(r.body.done).toBeLessThan(r.body.total);
    expect((await as('BOOKING').get('/api/v2/organization/setup')).status).toBe(403);
  });

  it('a new organisation: only the platform operator makes it, and it starts empty and separate', async () => {
    const body = { name: 'Sai Tours', slug: 'sai-tours', adminName: 'Sai Owner', adminEmail: 'owner@sai.example', adminPassword: 'LongPassword#1' };
    delete process.env.PLATFORM_ADMIN_SECRET;
    expect((await request(app!).post('/api/platform/organizations').send(body)).status).toBe(503);
    process.env.PLATFORM_ADMIN_SECRET = SECRET;
    expect((await request(app!).post('/api/platform/organizations').set('x-platform-secret', 'wrong').send(body)).status).toBe(401);
    const made = await request(app!).post('/api/platform/organizations').set('x-platform-secret', SECRET).send(body);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect((await request(app!).post('/api/platform/organizations').set('x-platform-secret', SECRET).send(body)).status).toBe(409);

    const login = await request(app!).post('/api/auth/login').send({ email: 'owner@sai.example', password: 'LongPassword#1' });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).join(';');
    const trips = await request(app!).get('/api/v2/trips').set('Cookie', cookie);
    expect(trips.body.items).toEqual([]);                                     // GK's trips are not theirs
    const org = await request(app!).get('/api/v2/organization').set('Cookie', cookie);
    expect(org.body).toMatchObject({ slug: 'sai-tours', name: 'Sai Tours' });
    const templates = await request(app!).get('/api/v2/templates').set('Cookie', cookie);
    expect(templates.body.items.length).toBeGreaterThan(0);                 // written on first use, for them
    expect(await prisma.messageTemplate.count({ where: { organizationId: made.body.organization.id } })).toBe(templates.body.items.length);
  });
});
