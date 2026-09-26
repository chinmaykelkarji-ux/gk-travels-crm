// Custom roles: exactly the permissions ticked, everywhere permissions are
// checked (routes, the copilot's tools, /me), effective at once, and a role
// change always means signing in again.
import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany } from './helpers/db';
import { app, as, USER_IDS } from './helpers/app';

const tools = hasTestDb ? await import('../../server/src/modules/copilot/tools.js') : null;
const principals = hasTestDb ? await import('../../server/src/core/principals.js') : null;

async function cookieAs(userId: string, role: string) {
  const s = await prisma.session.create({ data: { userId, expiresAt: new Date(Date.now() + 86_400_000) } });
  return `gkcrm_session=${jwt.sign({ id: userId, email: 'x@example.test', name: 'X', role, orgId: 'org_gktravels', sid: s.id }, process.env.JWT_SECRET as string)}`;
}
const senior = { name: 'Senior sales', baseRole: 'BOOKING', description: 'Sales who also follow up money', permissions: ['customers:read', 'trips:read', 'finance:read', 'copilot:use', 'insights:read'] };

describe.skipIf(!hasTestDb)('custom roles', () => {
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
  });

  it('only the owner makes roles, and never "everything" or managing people', async () => {
    expect((await as('BOOKING').post('/api/v2/roles', senior)).status).toBe(403);
    const bad = await as('ADMIN').post('/api/v2/roles', { ...senior, permissions: ['users:write', '*'] });
    expect(bad.status).toBe(400);
    const ok = await as('ADMIN').post('/api/v2/roles', senior);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await as('ADMIN').post('/api/v2/roles', senior)).status).toBe(409);
    const list = (await as('ADMIN').get('/api/v2/roles')).body;
    expect(list.catalogue.map((c: { key: string }) => c.key)).not.toContain('users:write');
    expect(list.custom[0]).toMatchObject({ name: 'Senior sales', people: 0 });
  });

  it('a person with a custom role can do exactly what was ticked — through routes, /me and the copilot — at once', async () => {
    const role = (await as('ADMIN').post('/api/v2/roles', senior)).body;
    const assigned = await as('ADMIN').post('/api/v2/roles/assign', { userId: USER_IDS.BOOKING, roleId: role.id });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    // Their old sessions end.
    expect((await prisma.session.findUniqueOrThrow({ where: { id: 'S-BOOKING' } })).revokedAt).toBeInstanceOf(Date);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_IDS.BOOKING } })).toMatchObject({ role: 'BOOKING', customRoleId: role.id });

    const key = `custom:${role.id}`;
    const cookie = await cookieAs(USER_IDS.BOOKING, key);
    const get = (path: string) => request(app!).get(path).set('Cookie', cookie);
    expect((await get('/api/v2/finance/receivables')).status).toBe(200);      // sales normally cannot
    expect((await get('/api/v2/tasks/today')).status).toBe(403);             // sales normally can
    expect((await get('/api/v2/me')).body.permissions).toEqual([...senior.permissions].sort());
    expect(tools!.toolsFor(key).map(t => t.name)).toEqual(expect.arrayContaining(['get_receivables', 'get_money_summary', 'search_trips']));
    expect(tools!.toolsFor(key).map(t => t.name)).not.toContain('get_open_tasks');

    // Taking a permission away works on the next request.
    await as('ADMIN').put(`/api/v2/roles/${role.id}`, { ...senior, permissions: ['customers:read', 'trips:read'] });
    expect((await get('/api/v2/finance/receivables')).status).toBe(403);
    expect(await prisma.activityLog.count({ where: { action: { in: ['role_created', 'role_updated', 'role_assigned'] } } })).toBe(3);

    // Removing the role puts them back on their system role and signs them out.
    expect((await as('ADMIN').delete(`/api/v2/roles/${role.id}`)).status).toBe(204);
    expect((await get('/api/v2/trips')).status).toBe(401);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_IDS.BOOKING } })).toMatchObject({ role: 'BOOKING', customRoleId: null });
  });

  it('signing in carries the custom role, and an unknown role key gets nothing', async () => {
    const role = (await as('ADMIN').post('/api/v2/roles', senior)).body;
    await prisma.user.update({ where: { id: USER_IDS.OPERATIONS }, data: { passwordHash: await bcrypt.hash('Secret#123', 4), email: 'ops@example.test' } });
    await as('ADMIN').post('/api/v2/roles/assign', { userId: USER_IDS.OPERATIONS, roleId: role.id });
    const login = await request(app!).post('/api/auth/login').send({ email: 'ops@example.test', password: 'Secret#123' });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).join(';');
    const me = await request(app!).get('/api/v2/me').set('Cookie', cookie);
    expect(me.body).toMatchObject({ role: 'BOOKING', user: { customRole: { name: 'Senior sales' } } });
    expect(me.body.permissions).toContain('finance:read');

    principals!.forgetPrincipal('custom:nosuchrole');
    const forged = await cookieAs(USER_IDS.ACCOUNTS, 'custom:nosuchrole');
    expect((await request(app!).get('/api/v2/trips').set('Cookie', forged)).status).toBe(401);
  });

  it('the owner and drivers keep their own roles', async () => {
    const role = (await as('ADMIN').post('/api/v2/roles', senior)).body;
    expect((await as('ADMIN').post('/api/v2/roles/assign', { userId: USER_IDS.ADMIN, roleId: role.id })).status).toBe(409);
    expect((await as('ADMIN').post('/api/v2/roles/assign', { userId: USER_IDS.DRIVER, roleId: role.id })).status).toBe(409);
  });
});
