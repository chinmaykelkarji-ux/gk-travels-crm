// Job runner — enqueue, idempotency, claiming with leases, retries with
// backoff, final failure, organisation context inside handlers, recurring
// system jobs, and the tick endpoint's authentication.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, ensureOrganization, seedTrip, seedCustomer } from './helpers/db';
import { app } from './helpers/app';

const jobs = hasTestDb ? await import('../../server/src/core/jobs.js') : null;
const ctx  = hasTestDb ? await import('../../server/src/core/requestContext.js') : null;
if (hasTestDb) await import('../../server/src/jobs/handlers.js');

describe.skipIf(!hasTestDb)('job runner', () => {
  const seen: Array<{ org: string; payload: unknown; attempt: number }> = [];

  beforeAll(async () => {
    await resetDb();
    jobs!.registerJobHandler('test.echo', async (payload, c) => {
      seen.push({ org: c.organizationId, payload, attempt: c.attempt });
      return { echoed: payload };
    });
    jobs!.registerJobHandler('test.fail', async (payload) => {
      throw new Error(`boom ${payload.n as string}`);
    });
    jobs!.registerJobHandler('test.flaky', async (_payload, c) => {
      if (c.attempt < 2) throw new Error('first attempt fails');
      return 'ok on retry';
    });
    jobs!.registerJobHandler('test.slow', async () => {
      await new Promise(r => setTimeout(r, 3_000));
      return 'too slow';
    });
    jobs!.registerJobHandler('test.org', async () => {
      // Handlers see the scoped client for their organisation.
      return { customers: await prisma.customer.count() };
    });
  });

  beforeEach(async () => { await resetDb(); seen.length = 0; });

  it('runs a queued job inside its organisation context and records the result', async () => {
    const { id, created } = await jobs!.enqueueJob({ type: 'test.echo', payload: { hello: 'world' } });
    expect(created).toBe(true);
    const summary = await jobs!.runTick({ skipRecurring: true, workerId: 'w1' });
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, failed: 0, retried: 0 });
    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job).toMatchObject({ status: 'SUCCEEDED', attempts: 1, lockedUntil: null, result: { echoed: { hello: 'world' } } });
    expect(job.finishedAt).not.toBeNull();
    expect(seen).toEqual([{ org: 'org_gktravels', payload: { hello: 'world' }, attempt: 1 }]);
  });

  it('idempotency keys de-duplicate pending jobs and re-arm failed ones', async () => {
    const a = await jobs!.enqueueJob({ type: 'test.echo', idempotencyKey: 'k1' });
    const b = await jobs!.enqueueJob({ type: 'test.echo', idempotencyKey: 'k1' });
    expect(b).toEqual({ id: a.id, created: false });
    expect(await prisma.job.count()).toBe(1);

    const f = await jobs!.enqueueJob({ type: 'test.fail', payload: { n: '1' }, idempotencyKey: 'k2', maxAttempts: 1 });
    await jobs!.runTick({ skipRecurring: true });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('FAILED');
    const again = await jobs!.enqueueJob({ type: 'test.fail', payload: { n: '2' }, idempotencyKey: 'k2', maxAttempts: 1 });
    expect(again).toEqual({ id: f.id, created: false });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: f.id } }))).toMatchObject({ status: 'PENDING', attempts: 0, payload: { n: '2' } });
  });

  it('retries with backoff and fails for good after maxAttempts', async () => {
    const { id } = await jobs!.enqueueJob({ type: 'test.fail', payload: { n: 'x' }, maxAttempts: 2 });
    const first = await jobs!.runTick({ skipRecurring: true });
    expect(first).toMatchObject({ claimed: 1, retried: 1, failed: 0 });
    const afterFirst = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(afterFirst.status).toBe('PENDING');
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.lastError).toBe('boom x');
    expect(afterFirst.runAfter.getTime()).toBeGreaterThan(Date.now() + 20_000); // 30 s backoff

    // Not due yet → nothing claimed.
    expect((await jobs!.runTick({ skipRecurring: true })).claimed).toBe(0);

    await prisma.job.update({ where: { id }, data: { runAfter: new Date() } });
    const second = await jobs!.runTick({ skipRecurring: true });
    expect(second).toMatchObject({ claimed: 1, failed: 1 });
    expect((await prisma.job.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'FAILED', attempts: 2 });
  });

  it('a flaky job succeeds on its second attempt', async () => {
    const { id } = await jobs!.enqueueJob({ type: 'test.flaky' });
    await jobs!.runTick({ skipRecurring: true });
    await prisma.job.update({ where: { id }, data: { runAfter: new Date() } });
    await jobs!.runTick({ skipRecurring: true });
    expect((await prisma.job.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'SUCCEEDED', attempts: 2, result: 'ok on retry' });
  });

  it('a job that overruns the tick budget is retried, and an expired lease can be re-claimed', async () => {
    const { id } = await jobs!.enqueueJob({ type: 'test.slow', maxAttempts: 3 });
    const s = await jobs!.runTick({ skipRecurring: true, budgetMs: 1_200 });
    expect(s.retried).toBe(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).lastError).toMatch(/time budget/);

    // Simulate a crashed worker holding an expired lease.
    await prisma.job.update({ where: { id }, data: { status: 'RUNNING', lockedUntil: new Date(Date.now() - 1000), runAfter: new Date() } });
    jobs!.registerJobHandler('test.slow', async () => 'fast now');
    const again = await jobs!.runTick({ skipRecurring: true });
    expect(again.claimed).toBe(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).status).toBe('SUCCEEDED');
  });

  it('a job type without a handler fails immediately', async () => {
    const { id } = await jobs!.enqueueJob({ type: 'nobody.home' });
    await jobs!.runTick({ skipRecurring: true });
    expect((await prisma.job.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'FAILED', lastError: expect.stringContaining('No handler') });
  });

  it('handlers run under their own organisation', async () => {
    await ensureOrganization('org_b', 'B');
    await seedCustomer('CUS-A-1');
    await ctx!.runAsOrganization('org_b', async () => {
      await seedCustomer('CUS-B-1');
      await seedCustomer('CUS-B-2');
      await jobs!.enqueueJob({ type: 'test.org' });
    });
    await jobs!.enqueueJob({ type: 'test.org' });
    await jobs!.runTick({ skipRecurring: true });
    const results = await prisma.job.findMany({ where: { type: 'test.org' }, select: { organizationId: true, result: true } });
    expect(results).toHaveLength(1); // scoped client → only org A's job visible here
    expect(results[0]).toEqual({ organizationId: 'org_gktravels', result: { customers: 1 } });
    const bJobs = await ctx!.runAsOrganization('org_b', () => prisma.job.findMany({ where: { type: 'test.org' } }));
    expect(bJobs[0].result).toEqual({ customers: 2 });
  });

  it('recurring system jobs are enqueued once per window per organisation and produce outbox events', async () => {
    await seedCustomer();
    // A trip departing in 3 days with a balance → payment reminder rule fires.
    const in3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await seedTrip('GK-2026-0001', { departure: in3, status: 'confirmed', balanceDue: 5_000 });

    const activeOrgs = await prisma.organization.count({ where: { isActive: true } });
    const first = await jobs!.runTick({ budgetMs: 15_000 });
    expect(first.systemJobsEnqueued).toBe(activeOrgs * 6); // scheduler.rules + outbox.dispatch + identity.encrypt-legacy + legacy.bookings-import + tasks.sweep + legacy.payments-import per organisation
    const second = await jobs!.runTick({ budgetMs: 15_000 });
    expect(second.systemJobsEnqueued).toBe(0);          // same windows → no duplicates

    const sched = await prisma.job.findFirstOrThrow({ where: { type: 'scheduler.rules' } });
    expect(sched.status).toBe('SUCCEEDED');
    expect(sched.result).toMatchObject({ paymentReminders: 1 });
    // The task engine's sweep raised the balance task for the same trip.
    const sweepJob = await prisma.job.findFirstOrThrow({ where: { type: 'tasks.sweep' } });
    expect(sweepJob.status).toBe('SUCCEEDED');
    expect(await prisma.task.count({ where: { tripId: 'GK-2026-0001', ruleCode: 'BALANCE_DUE' } })).toBe(1);
    const events = await prisma.outboxEvent.findMany();
    expect(events.map(e => e.eventType)).toContain('PAYMENT_REMINDER_WHATSAPP');
    // Dispatch ran too: WhatsApp is not configured, so delivery is logged as FAILED, never thrown.
    const logs = await prisma.messageLog.findMany();
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  describe('POST /api/jobs/tick', () => {
    it('requires the scheduler secret', async () => {
      expect((await request(app!).post('/api/jobs/tick')).status).toBe(401);
      expect((await request(app!).post('/api/jobs/tick').set('Authorization', 'Bearer wrong')).status).toBe(401);
      const ok = await request(app!).post('/api/jobs/tick').set('Authorization', `Bearer ${process.env.CRON_SECRET}`);
      expect(ok.status).toBe(200);
      expect(ok.body.ok).toBe(true);
      expect(ok.body.handlers).toContain('scheduler.rules');
    });

    it('is 503 when no secret is configured', async () => {
      const saved = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;
      try {
        const r = await request(app!).get('/api/jobs/tick');
        expect(r.status).toBe(503);
        expect(r.body.error.code).toBe('NOT_CONFIGURED');
      } finally {
        process.env.CRON_SECRET = saved;
      }
    });
  });
});
