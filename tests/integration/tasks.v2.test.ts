// Task engine: rules raise tasks from real records inside the same write,
// follow changes, close themselves (and reopen), never re-create a task a
// person closed; rule settings change timings at once (admin only); the
// Today view sorts by urgency; manual tasks; audit and permissions.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const istIso = (local: string) => new Date(Date.parse(`${local}:00+05:30`)).toISOString();

async function runSweep() {
  const { sweep } = await import('../../server/src/modules/tasks/engine');
  const { runWithContext } = await import('../../server/src/core/requestContext');
  return runWithContext({ organizationId: 'org_gktravels', source: 'SYSTEM' }, () => sweep());
}
const ruleTasks = (tripId: string, ruleCode: string) => prisma.task.findMany({ where: { tripId, ruleCode }, orderBy: { createdAt: 'asc' } });

describe.skipIf(!hasTestDb)('task engine v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
  });

  it('raises tasks from trip records in the same write, follows changes, closes and reopens itself, and never re-creates a closed one', async () => {
    const trip = (await as('BOOKING').post('/api/v2/trips', { tourName: 'Kashi Yatra', destination: 'Varanasi', departure: day(10), returnDate: day(14), customerId: 'CUS-2026-0001' })).body.trip;
    await as('OPERATIONS').put(`/api/v2/trips/${trip.id}`, { assignedOpsUserId: USER_IDS.OPERATIONS });

    // A requested hotel → a confirmation task, due 7 days before check-in at 10:00, for the trip's ops owner.
    const hotel = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/hotel-bookings`, { hotelName: 'Ganga View', checkIn: day(11), checkOut: day(13) })).body;
    let [h] = await ruleTasks(trip.id, 'HOTEL_CONFIRMATION');
    expect(h).toMatchObject({ source: 'RULE', status: 'pending', ruleKey: `HOTEL_CONFIRMATION:${hotel.id}`, assignedToUserId: USER_IDS.OPERATIONS, entityType: 'hotel_booking', entityId: hotel.id });
    expect(h.dueAt!.toISOString()).toBe(istIso(`${day(4)}T10:00`));

    // Confirmed → closed automatically; a date change needs re-confirmation → the same task reopens.
    await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${hotel.id}/status`, { status: 'CONFIRMED', confirmationNo: 'GV-1' });
    [h] = await ruleTasks(trip.id, 'HOTEL_CONFIRMATION');
    expect(h).toMatchObject({ status: 'completed', closeReason: expect.stringMatching(/No longer needed/) });
    expect(h.autoClosedAt).not.toBeNull();
    await as('OPERATIONS').put(`/api/v2/ops/hotel-bookings/${hotel.id}`, { checkIn: day(12), checkOut: day(14) });
    const reopened = await ruleTasks(trip.id, 'HOTEL_CONFIRMATION');
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({ status: 'pending', autoClosedAt: null });
    expect(reopened[0].dueAt!.toISOString()).toBe(istIso(`${day(5)}T10:00`));

    // Train legs: Tatkal not yet booked → window reminder; waitlisted → today's check and the chart task.
    const tatkal = (await as('BOOKING').post('/api/v2/tickets', { tripId: trip.id, mode: 'TRAIN', quota: 'TATKAL', travelClass: '3A', segments: [{ fromName: 'Belagavi', toName: 'Varanasi', departAt: `${day(10)}T22:30` }], passengers: [{ name: 'Yatri One' }] })).body;
    const [tq] = await ruleTasks(trip.id, 'TATKAL_OPENS');
    expect(tq.dueAt!.toISOString()).toBe(istIso(`${day(9)}T09:45`));
    const wl = (await as('BOOKING').post('/api/v2/tickets', { tripId: trip.id, mode: 'TRAIN', segments: [{ fromName: 'Varanasi', toName: 'Belagavi', departAt: `${day(5)}T06:00` }], passengers: [{ name: 'Yatri One' }] })).body;
    await as('OPERATIONS').put(`/api/v2/tickets/rows/${wl.segments[0].passengers[0].id}`, { currentStatus: 'WL 12' });
    expect(await ruleTasks(trip.id, 'TRAIN_WL_CHECK')).toHaveLength(1);
    expect(await ruleTasks(trip.id, 'TRAIN_CHART')).toHaveLength(1);
    // Booked in Tatkal → its reminder closes itself.
    await as('OPERATIONS').put(`/api/v2/tickets/rows/${tatkal.segments[0].passengers[0].id}`, { currentStatus: 'CNF B2 14' });
    expect((await ruleTasks(trip.id, 'TATKAL_OPENS'))[0].status).toBe('completed');

    // A person completes the WL check: sweeps never bring it back.
    const [w] = await ruleTasks(trip.id, 'TRAIN_WL_CHECK');
    expect((await as('OPERATIONS').patch(`/api/v2/tasks/${w.id}`, { status: 'completed', note: 'Still WL 12, informed group' })).status).toBe(200);
    await runSweep();
    await runSweep();
    const again = await ruleTasks(trip.id, 'TRAIN_WL_CHECK');
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ status: 'completed', completedById: USER_IDS.OPERATIONS, closeReason: 'Still WL 12, informed group', autoClosedAt: null });

    // Cancelling the trip closes every open rule task.
    await as('OPERATIONS').post(`/api/v2/trips/${trip.id}/stage`, { stage: 'CANCELLED', reason: 'Group postponed' });
    expect(await prisma.task.count({ where: { tripId: trip.id, source: 'RULE', status: { in: ['pending', 'in_progress'] } } })).toBe(0);

    const audit = await prisma.activityLog.findMany({ where: { entityType: 'task' }, select: { action: true, source: true } });
    expect(audit.filter(a => a.action === 'task_created').every(a => a.source === 'SYSTEM')).toBe(true);
    expect(audit.map(a => a.action)).toEqual(expect.arrayContaining(['task_created', 'task_auto_closed', 'task_reopened', 'task_completed']));
  });

  it('rule settings: admin changes timings (applied at once) or turns a rule off; others cannot', async () => {
    const trip = (await as('BOOKING').post('/api/v2/trips', { destination: 'Pandharpur', departure: day(20), returnDate: day(22) })).body.trip;
    const hotel = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/hotel-bookings`, { hotelName: 'Vitthal Lodge', checkIn: day(20), checkOut: day(22) })).body;
    expect((await ruleTasks(trip.id, 'HOTEL_CONFIRMATION'))[0].dueAt!.toISOString()).toBe(istIso(`${day(13)}T10:00`));

    const rules = (await as('OPERATIONS').get('/api/v2/task-rules')).body;
    expect(rules.find((r: { code: string }) => r.code === 'HOTEL_CONFIRMATION')).toMatchObject({ enabled: true, values: { daysBefore: 7, atHour: 10 }, openTasks: 1 });
    expect(rules.find((r: { code: string }) => r.code === 'TATKAL_OPENS').note).toMatch(/verify/i);

    expect((await as('BOOKING').put('/api/v2/task-rules/HOTEL_CONFIRMATION', { params: { daysBefore: 2 } })).status).toBe(403);
    const bad = await as('ADMIN').put('/api/v2/task-rules/HOTEL_CONFIRMATION', { params: { daysBefore: 500 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields).toEqual({ daysBefore: 'Whole number from 0 to 60' });
    const ok = await as('ADMIN').put('/api/v2/task-rules/HOTEL_CONFIRMATION', { params: { daysBefore: 2, atHour: 9 } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await ruleTasks(trip.id, 'HOTEL_CONFIRMATION'))[0].dueAt!.toISOString()).toBe(istIso(`${day(18)}T09:00`));

    await as('ADMIN').put('/api/v2/task-rules/HOTEL_CONFIRMATION', { enabled: false });
    expect((await ruleTasks(trip.id, 'HOTEL_CONFIRMATION'))[0]).toMatchObject({ status: 'completed', entityId: hotel.id });
    const log = await prisma.activityLog.findMany({ where: { action: 'task_rule_updated' }, orderBy: { createdAt: 'asc' } });
    expect(log).toHaveLength(2);
    expect(log[0].description).toMatch(/days before check-in 2 days/);
    expect(await as('ADMIN').get('/api/v2/task-rules').then(r => r.body.find((x: { code: string }) => x.code === 'HOTEL_CONFIRMATION'))).toMatchObject({ enabled: false, values: { daysBefore: 2, atHour: 9 } });
  });

  it('Today view: most urgent first, mine vs everyone; manual tasks; rule tasks keep their title and due time; snooze', async () => {
    const now = Date.now();
    const at = (ms: number) => new Date(now + ms).toISOString();
    const mk = (title: string, dueAt: string | null, extra: Record<string, unknown> = {}) => as('BOOKING').post('/api/v2/tasks', { title, dueAt, ...extra });
    const overdue = (await mk('Call Shri Joshi back', at(-3 * 3_600_000), { priority: 'low' })).body;
    const soon = (await mk('Send hotel voucher', at(3_600_000), { priority: 'urgent', assignedToUserId: USER_IDS.OPERATIONS })).body;
    await mk('Collect Aadhaar copies', at(3 * 86_400_000), { priority: 'high' });
    await mk('Someday', at(40 * 86_400_000));
    expect(soon.assignedTo).toBe(USER_IDS.OPERATIONS); // seeded users are named after their id

    const t = (await as('OPERATIONS').get('/api/v2/tasks/today')).body;
    expect(t.buckets.map((b: { bucket: string }) => b.bucket)).toEqual(['OVERDUE', 'NOW', 'THIS_WEEK']);
    expect(t.buckets[0].tasks.map((x: { title: string }) => x.title)).toEqual(['Call Shri Joshi back']);
    const mine = (await as('OPERATIONS').get('/api/v2/tasks/today?mine=true')).body;
    expect(mine.buckets.flatMap((b: { tasks: { id: string }[] }) => b.tasks.map(x => x.id))).toEqual([soon.id]);

    // Snooze the overdue one to tomorrow morning.
    const snoozed = await as('BOOKING').patch(`/api/v2/tasks/${overdue.id}`, { snoozedUntil: `${day(1)}T09:00` });
    expect(snoozed.status).toBe(200);
    const after = (await as('BOOKING').get('/api/v2/tasks/today')).body;
    expect(after.buckets.find((b: { bucket: string }) => b.bucket === 'TOMORROW').tasks.map((x: { id: string }) => x.id)).toEqual([overdue.id]);

    // Rule tasks: title and due time belong to the rule.
    const trip = (await as('BOOKING').post('/api/v2/trips', { destination: 'Tirupati', departure: day(3), returnDate: day(5) })).body.trip;
    await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/activity-bookings`, { name: 'Special darshan', date: day(4) });
    const [act] = await ruleTasks(trip.id, 'ACTIVITY_CONFIRMATION');
    expect((await as('BOOKING').patch(`/api/v2/tasks/${act.id}`, { title: 'Renamed' })).status).toBe(409);
    const reassigned = await as('BOOKING').patch(`/api/v2/tasks/${act.id}`, { assignedToUserId: USER_IDS.BOOKING, priority: 'urgent' });
    expect(reassigned.body).toMatchObject({ assignedToUserId: USER_IDS.BOOKING, priority: 'urgent', ruleName: 'Activity confirmation pending', trip: { id: trip.id } });
    // A hand assignment sticks when the trip owner changes.
    await as('OPERATIONS').put(`/api/v2/trips/${trip.id}`, { assignedOpsUserId: USER_IDS.OPERATIONS });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: act.id } })).assignedToUserId).toBe(USER_IDS.BOOKING);

    // Validation and permissions.
    expect((await as('BOOKING').post('/api/v2/tasks', { title: '' })).status).toBe(400);
    expect((await as('BOOKING').post('/api/v2/tasks', { title: 'x', assignedToUserId: 'nobody' })).status).toBe(400);
    expect((await as('BOOKING').post('/api/v2/tasks', { title: 'x', tripId: 'GK-0000-0000' })).status).toBe(400);
    const list = (await as('ACCOUNTS').get('/api/v2/tasks?status=open&q=voucher')).body;
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([soon.id]);
  });

  it('sales: an open lead raises a follow-up on its date; losing the lead closes it', async () => {
    const lead = (await as('BOOKING').post('/api/v2/leads', { name: 'Kulkarni family', phone: '9811111111', source: 'Walk-in', followUpDate: day(1), assignedToUserId: USER_IDS.BOOKING })).body;
    await runSweep();
    const [f] = await prisma.task.findMany({ where: { ruleCode: 'LEAD_FOLLOW_UP' } });
    expect(f).toMatchObject({ ruleKey: `LEAD_FOLLOW_UP:${lead.id}:${day(1)}`, assignedToUserId: USER_IDS.BOOKING, entityType: 'lead', entityId: lead.id, title: 'Follow up lead: Kulkarni family' });
    expect(f.dueAt!.toISOString()).toBe(istIso(`${day(1)}T10:00`));
    await as('BOOKING').post(`/api/v2/leads/${lead.id}/status`, { status: 'lost', lostReason: 'Booked elsewhere' });
    await runSweep();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('completed');
  });
});
