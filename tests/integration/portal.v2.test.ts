// The customer portal: a private link reaches one customer's own page and
// nothing else; nothing internal reaches a portal response; on a group tour
// a family sees its own party only; a one-time code guards the page when
// asked; feedback comes back to the office.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany, seedCustomer } from './helpers/db';
import { app, as, anonymous, USER_IDS } from './helpers/app';

const comms = hasTestDb ? await import('../../server/src/comms/index.js') : null;
const YEAR = new Date().getFullYear();
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const saved = { t: process.env.COMMS_TRANSPORT, u: process.env.PUBLIC_APP_URL };

/** Keys that must never appear anywhere in a portal response. */
const INTERNAL = /cost|margin|supplier|vendor|internal|commission|sellamount|basefare|passportnumber|aadhaar|govtid|createdby|userid|organizationid|tokenhash|codehash|profit|ledger|gst|params/i;
function internalKeys(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => internalKeys(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [...(INTERNAL.test(k) ? [`${path}.${k}`] : []), ...internalKeys(x, `${path}.${k}`)]);
  return [];
}

async function groupTour() {
  const e = (await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Kelkar Family', phone: '9000000001' }, destination: 'Kashi', adults: 4, departureDate: iso(40), returnDate: iso(46) })).body;
  const t1 = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Chinmay', lastName: 'Kelkar', customerId: e.customer.id })).body;
  const t2 = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Rohan', lastName: 'Shah', customerId: e.customer.id })).body;
  const q = (await as('BOOKING').post('/api/v2/quotations', {
    enquiryId: e.id, gstMode: 'EXCLUDED', gstRate: 5,
    parties: [{ key: 'k', name: 'Kelkar', adults: 2, travellerIds: [t1.id] }, { key: 's', name: 'Shah', adults: 2, travellerIds: [t2.id] }],
    items: [
      { key: 'hk', serviceType: 'HOTEL', description: 'Room K', pricingBasis: 'PER_ROOM', costPrice: 4111, sellPrice: 5000, quantity: 1, nights: 2, partyKey: 'k' },
      { key: 'hs', serviceType: 'HOTEL', description: 'Room S', pricingBasis: 'PER_ROOM', costPrice: 4222, sellPrice: 6000, quantity: 1, nights: 2, partyKey: 's' },
    ],
  })).body;
  await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
  const acc = (await as('BOOKING').post(`/api/v2/quotations/${q.id}/accept`, { splitByParty: true })).body;
  const contracts = await prisma.bookingContract.findMany({ where: { id: { in: acc.bookings } }, orderBy: { partyName: 'asc' } });
  const [kelkar, shah] = contracts;                           // Kelkar < Shah
  // The Shah family books as their own customer.
  const shahCustomer = await seedCustomer('CUS-SHAH', { name: 'Shah Family', phone: '9000000002' });
  await prisma.bookingContract.update({ where: { id: shah.id }, data: { customerId: shahCustomer.id } });
  return { tripId: kelkar.tripId!, kelkar, shah, kelkarCustomer: e.customer.id as string, t1, t2 };
}

async function link(customerId: string, body: Record<string, unknown> = {}) {
  const r = await as('BOOKING').post('/api/v2/portal-links', { customerId, days: 30, ...body });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.path.replace('/p/', '') as string;
}

describe.skipIf(!hasTestDb)('customer portal', () => {
  afterAll(() => {
    if (saved.t === undefined) delete process.env.COMMS_TRANSPORT; else process.env.COMMS_TRANSPORT = saved.t;
    if (saved.u === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = saved.u;
  });
  beforeEach(async () => {
    process.env.COMMS_TRANSPORT = 'memory';
    delete process.env.PUBLIC_APP_URL;
    comms!.captured.length = 0;
    await resetDb();
    await seedCompany({ phone: '0831 240 0000', email: 'office@gk.example' });
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await prisma.numberingSequence.upsert({ where: { organizationId_docType_financialYear: { organizationId: 'org_gktravels', docType: 'GK', financialYear: String(YEAR) } }, create: { id: `org_gktravels-GK-${YEAR}`, organizationId: 'org_gktravels', docType: 'GK', financialYear: String(YEAR), lastNumber: 0 }, update: { lastNumber: 0 } });
  });

  it('a link opens one customer\'s page; a wrong, revoked or lapsed link opens nothing; the link is never stored', async () => {
    const g = await groupTour();
    const token = await link(g.kelkarCustomer);
    const home = await anonymous().get(`/api/portal/${token}`);
    expect(home.status, JSON.stringify(home.body)).toBe(200);
    expect(home.body).toMatchObject({ locked: false, customer: { name: 'Kelkar Family' }, agency: { name: 'GK Travels', phone: '0831 240 0000' }, trips: [{ id: g.tripId, name: expect.any(String), status: expect.any(String) }] });
    const row = await prisma.portalAccess.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.useCount).toBe(1);

    expect((await anonymous().get(`/api/portal/${'x'.repeat(43)}`)).status).toBe(404);
    expect((await anonymous().get('/api/portal/short')).status).toBe(404);
    await as('BOOKING').post(`/api/v2/portal-links/${row.id}/revoke`);
    expect((await anonymous().get(`/api/portal/${token}`)).status).toBe(404);
    const lapsed = await link(g.kelkarCustomer);
    await prisma.portalAccess.updateMany({ where: { revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await anonymous().get(`/api/portal/${lapsed}`)).status).toBe(404);
    // A staff route is not reachable with a portal link.
    expect((await anonymous().get(`/api/v2/trips/${g.tripId}`)).status).toBe(401);
    expect(await prisma.activityLog.count({ where: { action: 'portal_link_issued' } })).toBe(2);
  });

  it('a family on a group tour sees its own travellers and money only, and nothing internal at all', async () => {
    const g = await groupTour();
    await prisma.trip.update({ where: { id: g.tripId }, data: { supplierCost: 99_911, grossMargin: 12_345, notes: 'Owner note: negotiate hotel', stage: 'CONFIRMING' } });
    await prisma.hotelBooking.create({ data: { tripId: g.tripId, contractId: g.shah.id, hotelName: 'Shah Only Hotel', checkIn: new Date(`${iso(40)}T00:00:00Z`), checkOut: new Date(`${iso(42)}T00:00:00Z`), costAmount: 7777, sellAmount: 8888, status: 'CONFIRMED', confirmationNo: 'SH-1' } });
    await prisma.hotelBooking.create({ data: { tripId: g.tripId, hotelName: 'Group Hotel', checkIn: new Date(`${iso(42)}T00:00:00Z`), checkOut: new Date(`${iso(44)}T00:00:00Z`), costAmount: 6666, status: 'REQUESTED', confirmationNo: 'NOT-YET' } });

    const kelkarToken = await link(g.kelkarCustomer);
    const shahToken = await link('CUS-SHAH');
    const k = (await anonymous().get(`/api/portal/${kelkarToken}/trips/${g.tripId}`)).body;
    const s = (await anonymous().get(`/api/portal/${shahToken}/trips/${g.tripId}`)).body;

    expect(k.travellers.map((t: { name: string }) => t.name)).toEqual(['Chinmay Kelkar']);
    expect(s.travellers.map((t: { name: string }) => t.name)).toEqual(['Rohan Shah']);
    expect(k.payments.map((p: { party: string }) => p.party)).toEqual(['Kelkar']);
    expect(s.payments.map((p: { party: string }) => p.party)).toEqual(['Shah']);
    expect(k.stays.map((h: { hotel: string }) => h.hotel)).toEqual(['Group Hotel']);
    expect(s.stays.map((h: { hotel: string; confirmationNo: string | null }) => [h.hotel, h.confirmationNo])).toEqual([['Shah Only Hotel', 'SH-1'], ['Group Hotel', null]]);

    for (const body of [k, s, (await anonymous().get(`/api/portal/${kelkarToken}`)).body]) {
      expect(internalKeys(body)).toEqual([]);
      const text = JSON.stringify(body);
      for (const secret of ['99911', '12345', '7777', '8888', '6666', '4111', '4222', 'Owner note', 'negotiate']) expect(text).not.toContain(secret);
    }
    // One family's link cannot open the other's contract-only trip view through another trip id either.
    expect((await anonymous().get(`/api/portal/${shahToken}/trips/GK-${YEAR}-9999`)).status).toBe(404);
  });

  it('the driver is shared only for a confirmed duty, from two days before it starts', async () => {
    const g = await groupTour();
    const soon = new Date(Date.now() + 24 * 3_600_000);
    const later = new Date(Date.now() + 10 * 86_400_000);
    for (const [startAt, status] of [[soon, 'CONFIRMED'], [later, 'CONFIRMED'], [new Date(soon.getTime() + 60_000), 'REQUESTED']] as const) {
      await prisma.vehicleAssignment.create({ data: { tripId: g.tripId, vehicleType: 'Tempo Traveller', startAt, endAt: new Date(startAt.getTime() + 5 * 86_400_000), status, driverName: 'Suresh', driverPhone: '9876500000' } });
    }
    const t = (await anonymous().get(`/api/portal/${await link(g.kelkarCustomer)}/trips/${g.tripId}`)).body;
    // Ordered by start: confirmed-soon shows the driver; requested-soon does not (nothing to promise yet); confirmed-later says when.
    expect(t.transport.map((d: { status: string; driver: unknown; driverNote: string | null }) => [d.status, Boolean(d.driver), d.driverNote])).toEqual([
      ['Confirmed', true, null], ['Being arranged', false, null], ['Confirmed', false, 'Driver details appear here two days before.'],
    ]);
    const shown = t.transport.find((d: { driver: unknown }) => d.driver);
    expect(shown.driver).toEqual({ name: 'Suresh', phone: '9876500000', vehicleNumber: null });
    expect(t.transport.filter((d: { driver: unknown }) => d.driver)).toHaveLength(1);
  });

  it('documents: only those marked for the customer, through a short-lived link', async () => {
    const g = await groupTour();
    const reg = async (title: string, visible: boolean) => {
      const r = await as('OPERATIONS').post('/api/v2/documents', { fileName: `${title}.pdf`, mimeType: 'application/pdf', sizeBytes: 9, type: 'OTHER', title, customerVisible: visible, links: [{ entityType: 'trip', entityId: g.tripId }] });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      await request(app!).put(r.body.upload.url).set('content-type', 'application/pdf').send(Buffer.from('%PDF-1.4\n'));
      await as('OPERATIONS').post(`/api/v2/documents/${r.body.document.id}/complete`);
      return r.body.document.id as string;
    };
    const shared = await reg('Hotel voucher', true);
    const hidden = await reg('Supplier invoice', false);
    const token = await link(g.kelkarCustomer);
    const t = (await anonymous().get(`/api/portal/${token}/trips/${g.tripId}`)).body;
    expect(t.documents.map((d: { title: string }) => d.title)).toEqual(['Hotel voucher']);
    const url = await anonymous().get(`/api/portal/${token}/documents/${shared}/url`);
    expect(url.status, JSON.stringify(url.body)).toBe(200);
    expect(url.body.url).toBeTruthy();
    expect((await anonymous().get(`/api/portal/${token}/documents/${hidden}/url`)).status).toBe(404);
  });

  it('a page that needs a code: locked until the right code, few tries, code masked in the office log', async () => {
    const g = await groupTour();
    await prisma.customer.update({ where: { id: g.kelkarCustomer }, data: { email: 'kelkar@example.com' } });
    const token = await link(g.kelkarCustomer, { requireCode: true, codeChannel: 'EMAIL' });
    expect((await anonymous().get(`/api/portal/${token}`)).body).toEqual({ locked: true, codeChannel: 'EMAIL' });
    expect((await anonymous().get(`/api/portal/${token}/trips/${g.tripId}`)).status).toBe(401);

    const sent = await anonymous().post(`/api/portal/${token}/code`);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.sentTo).toBe('k•••@example.com');
    expect((await anonymous().post(`/api/portal/${token}/code`)).status).toBe(429);   // one a minute
    const jobs = await import('../../server/src/core/jobs.js');
    await import('../../server/src/jobs/handlers.js');
    await jobs.runTick({ skipRecurring: true, workerId: 'portal' });
    const mail = comms!.captured[0].message as { text: string };
    const code = /\b(\d{6})\b/.exec(mail.text)![1];

    const wrong = code === '000000' ? '111111' : '000000';
    expect((await anonymous().post(`/api/portal/${token}/code/verify`).send({ code: wrong })).status).toBe(400);
    const ok = await anonymous().post(`/api/portal/${token}/code/verify`).send({ code });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const cookie = ok.headers['set-cookie'] as unknown as string[];
    expect(cookie.join(';')).toMatch(/gk_portal=.*Path=\/api\/portal.*HttpOnly/i);
    const page = await anonymous().get(`/api/portal/${token}/trips/${g.tripId}`).set('Cookie', cookie);
    expect(page.status).toBe(200);
    // The code is single-use.
    expect((await anonymous().post(`/api/portal/${token}/code/verify`).send({ code })).status).toBe(400);

    const log = (await as('BOOKING').get(`/api/v2/communications?customerId=${g.kelkarCustomer}`)).body.items;
    expect(log[0].text).toContain('••••••');
    expect(JSON.stringify(log)).not.toContain(code);
    const stored = await prisma.communication.findFirstOrThrow({ where: { templateKey: 'portal_code' } });
    expect(stored.body).not.toContain(code);
    expect(stored.params).toBeNull();
  });

  it('feedback: once the trip has started, from the customer, back to the office', async () => {
    const g = await groupTour();
    const token = await link(g.kelkarCustomer);
    expect((await anonymous().post(`/api/portal/${token}/trips/${g.tripId}/feedback`).send({ rating: 5 })).status).toBe(409);
    await prisma.trip.update({ where: { id: g.tripId }, data: { stage: 'COMPLETED' } });
    const f = await anonymous().post(`/api/portal/${token}/trips/${g.tripId}/feedback`).send({ rating: 4, comments: 'Lovely darshan, bus was late once.' });
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    await anonymous().post(`/api/portal/${token}/trips/${g.tripId}/feedback`).send({ rating: 5, comments: 'Changed my mind — excellent.' });
    const office = (await as('OPERATIONS').get(`/api/v2/feedback?tripId=${g.tripId}`)).body.items;
    expect(office).toEqual([expect.objectContaining({ customer: 'Kelkar Family', rating: 5, comments: 'Changed my mind — excellent.' })]);
    expect(await prisma.notification.count({ where: { userId: USER_IDS.ADMIN, type: 'feedback' } })).toBe(2);
    expect(await prisma.activityLog.count({ where: { action: 'portal_feedback', entityId: g.tripId } })).toBe(2);
    expect((await anonymous().post(`/api/portal/${token}/trips/${g.tripId}/feedback`).send({ rating: 9 })).status).toBe(400);
  });

  it('a message with {{portal_link}} carries a fresh private link that opens the page', async () => {
    process.env.PUBLIC_APP_URL = 'https://travelos.example';
    const g = await groupTour();
    await prisma.customer.update({ where: { id: g.kelkarCustomer }, data: { email: 'kelkar@example.com' } });
    const preview = await as('BOOKING').post('/api/v2/communications/preview', { templateKey: 'portal_link', channel: 'EMAIL', customerId: g.kelkarCustomer });
    expect(preview.body.missing).toEqual([]);
    expect(await prisma.portalAccess.count()).toBe(0);                // a preview makes nothing
    const r = await as('BOOKING').post('/api/v2/communications/send', { templateKey: 'portal_link', channel: 'EMAIL', customerId: g.kelkarCustomer });
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    const token = /https:\/\/travelos\.example\/p\/([A-Za-z0-9_-]+)/.exec(r.body.text)![1];
    expect((await anonymous().get(`/api/portal/${token}`)).body.customer.name).toBe('Kelkar Family');
    delete process.env.PUBLIC_APP_URL;
    const without = await as('BOOKING').post('/api/v2/communications/preview', { templateKey: 'portal_link', channel: 'EMAIL', customerId: g.kelkarCustomer });
    expect(without.body.missing).toEqual(['portal_link']);
  });

  it('who may make links', async () => {
    await seedCustomer('CUS-X', { name: 'X', email: null });
    expect((await as('OPERATIONS').post('/api/v2/portal-links', { customerId: 'CUS-X', days: 30 })).status).toBe(403);
    expect((await as('ACCOUNTS').get('/api/v2/portal-links?customerId=CUS-X')).status).toBe(200);
    const noEmail = await as('BOOKING').post('/api/v2/portal-links', { customerId: 'CUS-X', days: 30, requireCode: true, codeChannel: 'EMAIL' });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.error.message).toBe('The customer has no email address for the code');
    delete process.env.COMMS_TRANSPORT;
    expect((await as('BOOKING').post('/api/v2/portal-links', { customerId: 'CUS-X', days: 30, requireCode: true, codeChannel: 'WHATSAPP' })).status).toBe(503);
  });
});
