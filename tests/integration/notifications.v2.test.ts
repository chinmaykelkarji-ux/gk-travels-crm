// Notifications: raised by what happens, for the right person, once, and
// never for someone's own act.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const comms = hasTestDb ? await import('../../server/src/comms/index.js') : null;
const svc = hasTestDb ? await import('../../server/src/modules/comms/service.js') : null;
const notifications = hasTestDb ? await import('../../server/src/modules/notifications/service.js') : null;
const saved = process.env.COMMS_TRANSPORT;

describe.skipIf(!hasTestDb)('notifications', () => {
  afterAll(() => { if (saved === undefined) delete process.env.COMMS_TRANSPORT; else process.env.COMMS_TRANSPORT = saved; });
  beforeEach(async () => {
    process.env.COMMS_TRANSPORT = 'memory';
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany({ phone: '08312400000' });
    await seedCustomer('CUS-2026-0001', { name: 'Ramesh Patil', phone: '98765 43210', email: 'ramesh@example.com' });
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', tourName: 'Kashi Yatra', departure: '2026-11-12', returnDate: '2026-11-18' });
  });

  it('a task given to someone reaches them — once — and not the person who gave it', async () => {
    const t = await as('BOOKING').post('/api/v2/tasks', { title: 'Collect passport copies', tripId: 'GK-2026-0001', assignedToUserId: USER_IDS.OPERATIONS });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    const ops = await as('OPERATIONS').get('/api/v2/notifications');
    expect(ops.body).toMatchObject({ unread: 1, items: [{ type: 'task_assigned', title: 'Task for you: Collect passport copies', link: '/trips/GK-2026-0001', read: false }] });
    expect((await as('BOOKING').get('/api/v2/notifications')).body.unread).toBe(0);

    // Re-assigning to the same person does not announce it again; to another does.
    await as('BOOKING').patch(`/api/v2/tasks/${t.body.id}`, { priority: 'high' });
    await as('BOOKING').patch(`/api/v2/tasks/${t.body.id}`, { assignedToUserId: USER_IDS.ACCOUNTS });
    await as('BOOKING').patch(`/api/v2/tasks/${t.body.id}`, { assignedToUserId: USER_IDS.OPERATIONS });
    expect((await as('OPERATIONS').get('/api/v2/notifications')).body.items).toHaveLength(1);
    expect((await as('ACCOUNTS').get('/api/v2/notifications')).body.unread).toBe(1);
    // Taking a task yourself tells nobody.
    await as('ADMIN').post('/api/v2/tasks', { title: 'Mine', assignedToUserId: USER_IDS.ADMIN });
    expect((await as('ADMIN').get('/api/v2/notifications')).body.unread).toBe(0);
  });

  it('a message that could not be sent reaches whoever queued it', async () => {
    const t = (await as('ADMIN').get('/api/v2/templates')).body.items.find((x: { key: string; channel: string }) => x.key === 'booking_confirmed' && x.channel === 'EMAIL');
    expect(t).toBeTruthy();
    const r = await as('BOOKING').post('/api/v2/communications/send', { templateKey: 'booking_confirmed', channel: 'EMAIL', tripId: 'GK-2026-0001' });
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    comms!.captureControl.failNext = { error: 'Mailbox does not exist', retryable: false };
    await svc!.deliver(r.body.id);
    const list = (await as('BOOKING').get('/api/v2/notifications')).body;
    expect(list.items[0]).toMatchObject({ type: 'message_failed', title: 'A message to ramesh@example.com was not sent', body: 'Mailbox does not exist', link: '/trips/GK-2026-0001?tab=messages' });
  });

  it('only your own: read one, read all, and nobody else can touch them', async () => {
    await notifications!.notify({ userIds: [USER_IDS.OPERATIONS], type: 't', title: 'One', dedupeKey: 'a' });
    await notifications!.notify({ userIds: [USER_IDS.OPERATIONS], type: 't', title: 'One again', dedupeKey: 'a' });
    await notifications!.notify({ roles: ['OPERATIONS', 'ACCOUNTS'], type: 't', title: 'Two' });
    const mine = (await as('OPERATIONS').get('/api/v2/notifications')).body;
    expect(mine.items.map((n: { title: string }) => n.title).sort()).toEqual(['One', 'Two']);
    expect((await as('ACCOUNTS').post(`/api/v2/notifications/${mine.items[0].id}/read`)).status).toBe(404);
    expect((await as('OPERATIONS').post(`/api/v2/notifications/${mine.items[0].id}/read`)).body.unread).toBe(1);
    expect((await as('OPERATIONS').post('/api/v2/notifications/read-all')).body.unread).toBe(0);
    expect(await prisma.notification.count({ where: { userId: USER_IDS.ACCOUNTS, readAt: null } })).toBe(1);
  });
});
