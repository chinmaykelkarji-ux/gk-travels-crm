// Automation rules: off until the owner switches them on, each event acted on
// once, only events after switching on, and every run recorded with what
// each action did — including why a message was not sent.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const comms = hasTestDb ? await import('../../server/src/comms/index.js') : null;
const auto = hasTestDb ? await import('../../server/src/modules/automation/service.js') : null;
const saved = process.env.COMMS_TRANSPORT;
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const rule = async (key: string) => (await as('ADMIN').get('/api/v2/automations')).body.items.find((r: { key: string }) => r.key === key);
async function approveMeta(key: string) {
  const t = (await as('ADMIN').get('/api/v2/templates')).body.items.find((x: { key: string; channel: string }) => x.key === key && x.channel === 'WHATSAPP');
  await as('ADMIN').patch(`/api/v2/templates/${t.id}`, { metaTemplateName: `${key}_v1` });
}

describe.skipIf(!hasTestDb)('automation rules', () => {
  afterAll(() => { if (saved === undefined) delete process.env.COMMS_TRANSPORT; else process.env.COMMS_TRANSPORT = saved; });
  beforeEach(async () => {
    process.env.COMMS_TRANSPORT = 'memory';
    comms!.captured.length = 0;
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany({ phone: '08312400000' });
    await seedCustomer('CUS-2026-0001', { name: 'Ramesh Patil', phone: '98765 43210', email: 'ramesh@example.com' });
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', tourName: 'Kashi Yatra', stage: 'CONFIRMING', departure: day(3), returnDate: day(8), balanceDue: 45_000 });
  });

  it('messages to customers start off; team alerts start on; only the owner switches them', async () => {
    const items = (await as('BOOKING').get('/api/v2/automations')).body.items;
    expect(Object.fromEntries(items.map((r: { key: string; enabled: boolean }) => [r.key, r.enabled]))).toEqual({
      payment_reminder: false, departure_reminder: false, supplier_unconfirmed: true, ticket_waitlisted: true, payment_received: false, feedback_request: false,
    });
    expect((await as('BOOKING').patch('/api/v2/automations/payment_reminder', { enabled: true })).status).toBe(403);
    expect((await as('ADMIN').patch('/api/v2/automations/payment_reminder', { params: { days: [0] } })).status).toBe(400);
  });

  it('a payment reminder goes out once, only after the owner switches it on, and the run says what happened', async () => {
    await approveMeta('payment_reminder');
    expect(await auto!.sweep()).toMatchObject({ events: 0 });
    expect(comms!.captured).toHaveLength(0);

    const on = await as('ADMIN').patch('/api/v2/automations/payment_reminder', { enabled: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(await auto!.sweep()).toMatchObject({ events: 1, done: 1 });
    expect(await auto!.sweep()).toMatchObject({ events: 0 });           // once only
    const msg = await prisma.communication.findFirstOrThrow();
    expect(msg).toMatchObject({ source: 'AUTOMATION', status: 'QUEUED', templateKey: 'payment_reminder', tripId: 'GK-2026-0001', userId: null });
    expect(msg.body).toContain('₹45,000');
    const runs = (await as('BOOKING').get('/api/v2/automations/payment_reminder/runs')).body.items;
    expect(runs).toEqual([expect.objectContaining({ status: 'DONE', summary: expect.stringContaining('leaves in 3 days'), outcomes: [{ ok: true, detail: 'Queued WhatsApp to 98765 43210' }] })]);
    expect(await prisma.activityLog.count({ where: { action: 'automation_rule_updated', userId: USER_IDS.ADMIN } })).toBe(1);
  });

  it('a rule that cannot send records why and tells the owner once', async () => {
    await as('ADMIN').patch('/api/v2/automations/payment_reminder', { enabled: true });   // no Meta template name
    await seedTrip('GK-2026-0002', { customerId: 'CUS-2026-0001', tourName: 'Goa', stage: 'READY', departure: day(7), returnDate: day(9), balanceDue: 5_000 });
    expect(await auto!.sweep()).toMatchObject({ events: 2, failed: 2 });
    const runs = (await as('ADMIN').get('/api/v2/automations/payment_reminder/runs')).body.items;
    expect(runs[0].outcomes[0]).toEqual({ ok: false, detail: 'This template has no Meta-approved template name yet, so WhatsApp will not deliver it' });
    expect(await prisma.notification.count({ where: { userId: USER_IDS.ADMIN, type: 'automation_failed' } })).toBe(1);
    expect(await prisma.communication.count()).toBe(0);
  });

  it('the team hears about a hotel still not confirmed close to check-in', async () => {
    await prisma.hotelBooking.create({ data: { tripId: 'GK-2026-0001', hotelName: 'Ganga View', checkIn: new Date(`${day(1)}T00:00:00Z`), checkOut: new Date(`${day(3)}T00:00:00Z`), status: 'REQUESTED' } });
    expect(await auto!.sweep()).toMatchObject({ done: 1 });
    const ops = (await as('OPERATIONS').get('/api/v2/notifications')).body.items;
    expect(ops[0]).toMatchObject({ type: 'automation', title: expect.stringMatching(/^Ganga View is not confirmed — check-in .*Kashi Yatra \(GK-2026-0001\)$/), link: '/trips/GK-2026-0001?tab=hotels' });
    expect((await as('BOOKING').get('/api/v2/notifications')).body.items).toHaveLength(0);
  });

  it('only payments recorded after the rule was switched on are thanked', async () => {
    await approveMeta('payment_received');
    const before = await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 10_000, mode: 'CASH', receivedAt: istToday() });
    expect(before.status, JSON.stringify(before.body)).toBe(201);
    await as('ADMIN').patch('/api/v2/automations/payment_received', { enabled: true });
    const after = await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 5_000, mode: 'UPI', receivedAt: istToday() });
    expect(await auto!.sweep()).toMatchObject({ events: 1, done: 1 });
    const msg = await prisma.communication.findFirstOrThrow({ where: { templateKey: 'payment_received' } });
    expect(msg.body).toContain('₹5,000');
    expect(msg.body).toContain(after.body.id ?? after.body.receipt?.id);
  });

  it('the classic outbox is closed, never sent', async () => {
    await prisma.outboxEvent.create({ data: { eventType: 'PAYMENT_REMINDER_WHATSAPP', payload: {}, idempotencyKey: 'old-1' } });
    const { retireLegacyOutbox, RETIRED_REASON } = await import('../../server/src/workers/outboxWorker.js');
    expect(await retireLegacyOutbox()).toEqual({ retired: 1 });
    expect(await prisma.outboxEvent.findFirstOrThrow()).toMatchObject({ status: 'FAILED', lastError: RETIRED_REASON });
  });
});
