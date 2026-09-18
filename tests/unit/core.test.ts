// core/errors, core/validate, core/requestContext, core/tenant — no database.
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { AppError, toErrorResponse, errorHandler, notFoundHandler, notFound, conflict } from '../../server/src/core/errors';
import { validate, valid } from '../../server/src/core/validate';
import { requestContextMiddleware, runWithContext, getContext, currentOrganizationId, DEFAULT_ORGANIZATION_ID } from '../../server/src/core/requestContext';
import { TENANT_MODELS } from '../../server/src/core/tenant';

describe('toErrorResponse', () => {
  it('maps AppError to its status and code', () => {
    const r = toErrorResponse(notFound('Trip'));
    expect(r.status).toBe(404);
    expect(r.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Trip not found' });
    expect(toErrorResponse(conflict('busy')).status).toBe(409);
    expect(toErrorResponse(new AppError('RATE_LIMITED', 429, 'slow down')).status).toBe(429);
  });

  it('maps zod issues to a 400 with per-field messages', () => {
    const schema = z.object({ name: z.string().min(2), pax: z.number().int().positive() });
    let err: unknown;
    try { schema.parse({ name: 'a', pax: -1 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ZodError);
    const r = toErrorResponse(err);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(r.body.error.fields ?? {})).toEqual(['name', 'pax']);
  });

  it('maps Prisma known errors without leaking query text', () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', { code: 'P2002', clientVersion: 'x', meta: { target: ['email'] } });
    expect(toErrorResponse(dup)).toMatchObject({ status: 409, body: { error: { code: 'CONFLICT', message: 'A record with the same email already exists' } } });
    const missing = new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'x' });
    expect(toErrorResponse(missing).status).toBe(404);
    const fk = new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'x' });
    expect(toErrorResponse(fk).status).toBe(409);
  });

  it('hides internals on unknown errors', () => {
    const r = toErrorResponse(new Error('SELECT * FROM secrets WHERE password = ...'));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(r.body)).not.toContain('secrets');
  });
});

describe('validate middleware + error envelope through Express', () => {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  const Body = z.object({ name: z.string().min(2), tags: z.array(z.string()).default([]) });
  const Query = z.object({ page: z.coerce.number().int().min(1).default(1) });
  app.post('/things', validate({ body: Body, query: Query }), (_req, res) => {
    const v = valid<z.infer<typeof Body>, z.infer<typeof Query>>(res);
    res.json({ got: v.body, page: v.query.page, requestId: getContext()?.requestId });
  });
  app.get('/boom', () => { throw notFound('Thing'); });
  app.get('/async-boom', async () => { throw new Error('db exploded'); });
  app.use(notFoundHandler);
  app.use(errorHandler);

  it('strips unknown keys, coerces the query and exposes the request id', async () => {
    const r = await request(app).post('/things?page=3').set('x-request-id', 'abc-12345678').send({ name: 'Kashmir', tags: ['a'], organizationId: 'evil', isAdmin: true });
    expect(r.status).toBe(200);
    expect(r.body.got).toEqual({ name: 'Kashmir', tags: ['a'] });
    expect(r.body.page).toBe(3);
    expect(r.body.requestId).toBe('abc-12345678');
    expect(r.headers['x-request-id']).toBe('abc-12345678');
  });

  it('returns the 400 envelope with fields on invalid input', async () => {
    const r = await request(app).post('/things').send({ name: 'K' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.fields.name).toBeDefined();
    expect(typeof r.body.error.requestId).toBe('string');
  });

  it('thrown AppErrors and async failures reach the handler', async () => {
    expect((await request(app).get('/boom')).body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Thing not found' });
    const r = await request(app).get('/async-boom');
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(r.body)).not.toContain('exploded');
    expect((await request(app).get('/nope')).status).toBe(404);
  });
});

describe('requestContext', () => {
  it('defaults to the single-tenant organisation outside a request', () => {
    expect(getContext()).toBeUndefined();
    expect(currentOrganizationId()).toBe(DEFAULT_ORGANIZATION_ID);
  });

  it('starts a lazy thenable (like a Prisma query) inside the scope', async () => {
    // A thenable that only reads the context when .then() is invoked — exactly
    // how Prisma's PrismaPromise behaves. Without special handling the caller's
    // await would run it outside the scope and see the default organisation.
    const lazy = { then(resolve: (v: string) => void) { resolve(currentOrganizationId()); } };
    const seen = await runWithContext({ organizationId: 'org_lazy' }, () => lazy as unknown as Promise<string>);
    expect(seen).toBe('org_lazy');
    const seenAsync = await runWithContext({ organizationId: 'org_async' }, async () => {
      await new Promise(r => setTimeout(r, 1));
      return currentOrganizationId();
    });
    expect(seenAsync).toBe('org_async');
  });

  it('runWithContext scopes nested calls', () => {
    runWithContext({ organizationId: 'org_x', source: 'AI', userId: 'u1' }, () => {
      expect(currentOrganizationId()).toBe('org_x');
      expect(getContext()).toMatchObject({ source: 'AI', userId: 'u1' });
      runWithContext({ organizationId: 'org_y' }, () => expect(currentOrganizationId()).toBe('org_y'));
      expect(currentOrganizationId()).toBe('org_x');
    });
    expect(currentOrganizationId()).toBe(DEFAULT_ORGANIZATION_ID);
  });
});

describe('tenant model list matches schema.prisma', () => {
  it('every model with organizationId is scoped, and only those', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const withOrg = new Set<string>();
    const all = new Set<string>();
    for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      all.add(m[1]);
      if (/^\s+organizationId\s+String/m.test(m[2])) withOrg.add(m[1]);
    }
    expect([...withOrg].sort()).toEqual([...TENANT_MODELS].sort());
    expect(all.has('Organization')).toBe(true);
    expect(withOrg.has('Organization')).toBe(false);
  });
});
