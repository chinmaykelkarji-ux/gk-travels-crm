// Express app + signed session cookies per role for supertest.
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { hasTestDb } from './db';

export type Role = 'ADMIN' | 'BOOKING' | 'ACCOUNTS' | 'OPERATIONS';

export const USER_IDS: Record<Role, string> = {
  ADMIN:      'U-ADMIN',
  BOOKING:    'U-BOOKING',
  ACCOUNTS:   'U-ACCOUNTS',
  OPERATIONS: 'U-OPERATIONS',
};

export const app = hasTestDb
  ? (await import('../../../server/src/app.js')).default
  : null;

export function cookieFor(role: Role): string {
  const token = jwt.sign(
    { id: USER_IDS[role], email: `${role.toLowerCase()}@example.test`, name: role, role, orgId: 'org_gktravels', sid: `S-${role}` },
    process.env.JWT_SECRET as string,
    { expiresIn: '10m' },
  );
  return `gkcrm_session=${token}`;
}

export function as(role: Role) {
  if (!app) throw new Error('app not available without TEST_DATABASE_URL');
  const agent = request(app);
  const cookie = cookieFor(role);
  return {
    get:    (path: string) => agent.get(path).set('Cookie', cookie),
    post:   (path: string, body?: unknown) => agent.post(path).set('Cookie', cookie).send(body as object),
    put:    (path: string, body?: unknown) => agent.put(path).set('Cookie', cookie).send(body as object),
    delete: (path: string) => agent.delete(path).set('Cookie', cookie),
  };
}

export function anonymous() {
  if (!app) throw new Error('app not available without TEST_DATABASE_URL');
  return request(app);
}
