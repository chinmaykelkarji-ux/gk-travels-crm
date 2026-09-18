// Login, sessions, revocation, rate limiting and security headers through the real app.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, seedUser } from './helpers/db';
import { app, as, USER_IDS } from './helpers/app';

const PASSWORD = 'correct horse battery staple 42';

async function seedLoginUsers() {
  await resetDb();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await prisma.user.create({ data: { id: 'U-LOGIN', email: 'login@example.test', passwordHash, name: 'Login User', role: 'BOOKING', isActive: true } });
  await seedUser(USER_IDS.ADMIN, 'ADMIN');
}

function cookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find(x => x.startsWith('gkcrm_session='));
  if (!c) throw new Error('no session cookie');
  return c.split(';')[0];
}

async function login(email = 'login@example.test', password = PASSWORD) {
  return request(app!).post('/api/auth/login').send({ email, password });
}

describe.skipIf(!hasTestDb)('sessions and hardening', () => {
  let passwordHash = '';
  beforeAll(async () => { await seedLoginUsers(); passwordHash = await bcrypt.hash(PASSWORD, 4); });
  beforeEach(async () => {
    const { clearSessionCache } = await import('../../server/src/core/sessions.js');
    clearSessionCache();
    // Every test starts from the same login user, whatever the previous one did to it.
    await prisma.user.update({ where: { id: 'U-LOGIN' }, data: { isActive: true, role: 'BOOKING', passwordHash } });
  });

  it('login creates a session row and the cookie works; logout revokes it', async () => {
    const r = await login();
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: 'login@example.test', role: 'BOOKING', organizationId: 'org_gktravels' });
    const cookie = cookieOf(r);
    expect(cookie).toMatch(/^gkcrm_session=/);
    expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/);

    const sessions = await prisma.session.findMany({ where: { userId: 'U-LOGIN' } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].revokedAt).toBeNull();

    const me = await request(app!).get('/api/v2/me').set('Cookie', cookie);
    expect(me.status).toBe(200);

    const out = await request(app!).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: sessions[0].id } })).revokedAt).not.toBeNull();

    const after = await request(app!).get('/api/v2/me').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('rejects wrong passwords and inactive users with the same message', async () => {
    const wrong = await login('login@example.test', 'nope nope nope nope');
    expect(wrong.status).toBe(401);
    await prisma.user.update({ where: { id: 'U-LOGIN' }, data: { isActive: false } });
    const inactive = await login();
    expect(inactive.status).toBe(401);
    expect(inactive.body.error).toBe(wrong.body.error);
  });

  it('tokens without a session id are rejected (pre-tenancy sessions)', async () => {
    // helpers/app.ts signs bare tokens (no sid) for the matrix tests; those
    // routes accept them only because the matrix seeds sessions explicitly.
    const jwt = (await import('jsonwebtoken')).default;
    const bare = jwt.sign({ id: 'U-LOGIN', email: 'login@example.test', name: 'x', role: 'BOOKING', orgId: 'org_gktravels' }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
    const r = await request(app!).get('/api/v2/me').set('Cookie', `gkcrm_session=${bare}`);
    expect(r.status).toBe(401);
  });

  it('deactivating a user, changing their role or resetting their password revokes their sessions immediately', async () => {
    const cookie = cookieOf(await login());
    expect((await request(app!).get('/api/v2/me').set('Cookie', cookie)).status).toBe(200);

    // Role change by an admin → 401 on the next request, even within the cache window.
    const admin = as('ADMIN');
    expect((await admin.put('/api/users/U-LOGIN', { role: 'OPERATIONS' })).status).toBe(200);
    expect((await request(app!).get('/api/v2/me').set('Cookie', cookie)).status).toBe(401);

    const cookie2 = cookieOf(await login());
    expect((await admin.put('/api/users/U-LOGIN/password', { newPassword: 'another strong password 99' })).status).toBe(200);
    expect((await request(app!).get('/api/v2/me').set('Cookie', cookie2)).status).toBe(401);

    const cookie3 = cookieOf(await login('login@example.test', 'another strong password 99'));
    expect((await admin.put('/api/users/U-LOGIN', { isActive: false })).status).toBe(200);
    expect((await request(app!).get('/api/v2/me').set('Cookie', cookie3)).status).toBe(401);

    const revoked = await prisma.session.findMany({ where: { userId: 'U-LOGIN' } });
    expect(revoked.every(s => s.revokedAt !== null)).toBe(true);
    const reasons = new Set(revoked.map(s => s.revokedReason));
    for (const r of ['role_changed', 'password_reset', 'deactivated']) expect(reasons.has(r), r).toBe(true);
  });

  it('limits repeated sign-in attempts per account', async () => {
    process.env.RATE_LIMIT_IN_TESTS = 'yes';
    try {
      let last: request.Response | undefined;
      for (let i = 0; i < 11; i++) last = await login('victim@example.test', 'guess ' + i);
      expect(last!.status).toBe(429);
      expect(last!.body.error.code).toBe('RATE_LIMITED');
      // Other accounts are unaffected.
      expect((await login()).status).toBe(200);
    } finally {
      delete process.env.RATE_LIMIT_IN_TESTS;
    }
  });

  it('sends security headers', async () => {
    const r = await request(app!).get('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBeDefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  afterAll(async () => { await resetDb(); });
});
