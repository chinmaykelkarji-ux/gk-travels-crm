// Communications end to end: the template filled from real records, nothing
// sent with a gap or through an unconfigured channel, sending on the job
// runner with honest retries, Meta's delivery ticks, one log per record.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, anonymous, USER_IDS } from './helpers/app';

const jobs = hasTestDb ? await import('../../server/src/core/jobs.js') : null;
if (hasTestDb) await import('../../server/src/jobs/handlers.js');
const comms = hasTestDb ? await import('../../server/src/comms/index.js') : null;
const svc = hasTestDb ? await import('../../server/src/modules/comms/service.js') : null;

const saved: Record<string, string | undefined> = {};
const KEYS = ['COMMS_TRANSPORT', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];

async function drainJobs(max = 10) {
  for (let i = 0; i < max; i++) {
    const s = await jobs!.runTick({ skipRecurring: true, workerId: `t${i}` });
    if (!s.claimed) return;
  }
}
const send = (over: Record<string, unknown> = {}) => ({ templateKey: 'booking_confirmed', channel: 'WHATSAPP', tripId: 'GK-2026-0001', ...over });
async function approveMeta(key = 'booking_confirmed') {
  const t = (await as('ADMIN').get('/api/v2/templates')).body.items.find((x: { key: string; channel: string }) => x.key === key && x.channel === 'WHATSAPP');
  await as('ADMIN').patch(`/api/v2/templates/${t.id}`, { metaTemplateName: `${key}_v1` });
}
const signed = (body: unknown, secret = 'app-secret') => {
  const raw = JSON.stringify(body);
  return { raw, sig: `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` };
};

describe.skipIf(!hasTestDb)('communications', () => {
  beforeAll(() => { for (const k of KEYS) saved[k] = process.env[k]; });
  afterAll(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  beforeEach(async () => {
    process.env.COMMS_TRANSPORT = 'memory';
    comms!.captured.length = 0;
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany({ phone: '08312400000' });
    await seedCustomer('CUS-2026-0001', { name: 'Ramesh Patil', phone: '98765 43210', email: 'ramesh@example.com' });
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', customer: 'Ramesh Patil', tourName: 'Kashi Yatra', destination: 'Varanasi', departure: '2026-11-12', returnDate: '2026-11-18' });
  });

  it('fills a template from the real records and says what is missing', async () => {
    const p = await as('BOOKING').post('/api/v2/communications/preview', send({ channel: 'EMAIL' }));
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body).toMatchObject({ to: 'ramesh@example.com', subject: 'Booking confirmed — Kashi Yatra', missing: [], cannotSend: null });
    expect(p.body.text).toBe('Namaste Ramesh Patil Ji,\nYour Kashi Yatra (GK-2026-0001) is confirmed, departing 12 Nov 2026 and returning 18 Nov 2026. Thank you for travelling with us.\n— GK Travels, 08312400000');

    // A payment reminder sent by hand knows when the money is due: here, no schedule, so the departure.
    await prisma.trip.update({ where: { id: 'GK-2026-0001' }, data: { balanceDue: 45_000 } });
    const pay = await as('BOOKING').post('/api/v2/communications/preview', send({ templateKey: 'payment_reminder', channel: 'EMAIL' }));
    expect(pay.body).toMatchObject({ missing: [] });
    expect(pay.body.text).toContain('₹45,000 is due by 12 Nov 2026 for Kashi Yatra');

    const gap = await as('BOOKING').post('/api/v2/communications/preview', send({ templateKey: 'departure_reminder' }));
    expect(gap.body.missing.sort()).toEqual(['pickup_point', 'pickup_time']);
    const refused = await as('BOOKING').post('/api/v2/communications/send', send({ templateKey: 'departure_reminder', channel: 'EMAIL' }));
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain('{{pickup_point}}');
    expect(await prisma.communication.count()).toBe(0);
  });

  it('WhatsApp needs a template Meta approved; then it is queued, sent on the job runner and logged', async () => {
    const early = await as('BOOKING').post('/api/v2/communications/send', send());
    expect(early.status).toBe(409);
    expect(early.body.error.message).toMatch(/Meta-approved/);

    await approveMeta();
    const r = await as('BOOKING').post('/api/v2/communications/send', send());
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    expect(r.body).toMatchObject({ status: 'QUEUED', via: 'TRAVELOS', to: '98765 43210' });
    expect(comms!.captured).toHaveLength(0);          // the request never waits on Meta

    await drainJobs();
    expect(comms!.captured).toHaveLength(1);
    expect(comms!.captured[0].message).toMatchObject({ template: 'booking_confirmed_v1', language: 'en', to: '98765 43210',
      params: ['Ramesh Patil', 'Kashi Yatra', 'GK-2026-0001', '12 Nov 2026', '18 Nov 2026', 'GK Travels', '08312400000'] });
    const row = await prisma.communication.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(row).toMatchObject({ status: 'SENT', providerMessageId: 'mem-1', attempts: 1, userId: USER_IDS.BOOKING, tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001' });
    expect(await prisma.activityLog.count({ where: { action: 'message_queued', entityId: 'GK-2026-0001' } })).toBe(1);

    const log = await as('ACCOUNTS').get('/api/v2/communications?customerId=CUS-2026-0001');
    expect(log.body.items[0]).toMatchObject({ status: 'SENT', statusLabel: 'Sent', by: 'U-BOOKING' });
  });

  it('retries only what a retry can fix, at most three times, then says why it failed', async () => {
    await approveMeta();
    const r = await as('BOOKING').post('/api/v2/communications/send', send());
    comms!.captureControl.failNext = { error: 'Meta is busy', retryable: true };
    await expect(svc!.deliver(r.body.id)).rejects.toThrow(/Meta is busy/);
    expect(await prisma.communication.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ status: 'QUEUED', attempts: 1, statusReason: 'Attempt 1 failed: Meta is busy' });

    comms!.captureControl.failNext = { error: 'Recipient is not a WhatsApp user', retryable: false };
    expect(await svc!.deliver(r.body.id)).toEqual({ status: 'FAILED' });
    expect(await prisma.communication.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ status: 'FAILED', statusReason: 'Recipient is not a WhatsApp user' });
    expect(await svc!.deliver(r.body.id)).toEqual({ status: 'FAILED' });    // a finished message is never re-sent
    expect(comms!.captured).toHaveLength(0);
  });

  it('an unconfigured channel refuses to send and the preview says so', async () => {
    delete process.env.COMMS_TRANSPORT;
    const p = await as('BOOKING').post('/api/v2/communications/preview', send({ channel: 'EMAIL' }));
    expect(p.body.cannotSend).toBe('Email is not configured on this server');
    expect(p.body.openLink).toMatch(/^mailto:ramesh@example\.com\?subject=/);
    const r = await as('BOOKING').post('/api/v2/communications/send', send({ channel: 'EMAIL' }));
    expect(r.status).toBe(503);
    expect((await as('BOOKING').get('/api/v2/communications/status')).body.whatsapp).toMatchObject({ configured: false, provider: 'Meta WhatsApp Cloud API' });
  });

  it('Meta\'s signed delivery ticks move a message forward, never back', async () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    await approveMeta();
    const r = await as('BOOKING').post('/api/v2/communications/send', send());
    await drainJobs();
    const post = async (status: string, extra: Record<string, unknown> = {}) => {
      const { raw, sig } = signed({ entry: [{ changes: [{ value: { statuses: [{ id: 'mem-1', status, ...extra }] } }] }] });
      return anonymous().post('/api/webhooks/whatsapp').set('content-type', 'application/json').set('x-hub-signature-256', sig).send(raw);
    };
    expect((await post('delivered')).body).toEqual({ received: 1, updated: 1 });
    expect((await post('read')).body.updated).toBe(1);
    expect((await post('sent')).body.updated).toBe(0);
    expect(await prisma.communication.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ status: 'READ', deliveredAt: expect.any(Date), readAt: expect.any(Date) });

    const { raw } = signed({ entry: [] });
    expect((await anonymous().post('/api/webhooks/whatsapp').set('content-type', 'application/json').set('x-hub-signature-256', 'sha256=bad').send(raw)).status).toBe(401);
    expect((await anonymous().get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42')).text).toBe('42');
    expect((await anonymous().get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42')).status).toBe(403);
  });

  it('one log per record: TravelOS sends, messages opened in an app, and the classic scheduler\'s rows', async () => {
    const opened = await as('OPERATIONS').post('/api/v2/communications/opened', { channel: 'WHATSAPP', tripId: 'GK-2026-0001', to: '98765 43210', text: 'Namaste Ji, pickup at 9.' });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    await prisma.messageLog.create({ data: { tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001', channel: 'whatsapp', templateName: 'payment_reminder', recipient: '9876543210', content: 'Reminder', status: 'failed', error: 'WHATSAPP_BSP_URL not configured' } });
    const log = await as('ACCOUNTS').get('/api/v2/communications?tripId=GK-2026-0001');
    expect(log.body.items.map((m: { via: string; status: string }) => [m.via, m.status]).sort()).toEqual([['APP', 'LOGGED'], ['LEGACY', 'FAILED']]);
  });

  it('who may do what', async () => {
    expect((await as('ACCOUNTS').post('/api/v2/communications/send', send())).status).toBe(403);
    expect((await as('DRIVER').get('/api/v2/communications?tripId=GK-2026-0001')).status).toBe(403);
    expect((await as('BOOKING').get('/api/v2/communications')).status).toBe(400);
  });
});
