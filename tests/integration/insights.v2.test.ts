// What needs attention today, counted by queries — never by a model — and
// only for a role that could open the screen behind each insight.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const ai = hasTestDb ? await import('../../server/src/ai/index.js') : null;
const recorded = hasTestDb ? await import('../../server/src/ai/recorded.js') : null;
const insights = hasTestDb ? await import('../../server/src/modules/insights/service.js') : null;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'travelos-insights-'));
const saved: Record<string, string | undefined> = {};
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const codes = (body: { items: { code: string }[] }) => body.items.map(i => i.code);

describe.skipIf(!hasTestDb)('insights', () => {
  beforeAll(() => {
    for (const k of ['AI_PROVIDER', 'AI_RECORDINGS_DIR', 'ANTHROPIC_API_KEY']) saved[k] = process.env[k];
    process.env.AI_PROVIDER = 'recorded';
    process.env.AI_RECORDINGS_DIR = dir;
    ai!.resetAiProvider();
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    ai!.resetAiProvider();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany({ stateCode: '29', state: 'Karnataka' });
    await seedCustomer('CUS-2026-0001', { name: 'Ramesh Patil' });
  });

  async function seedEverything() {
    // Leaves in 5 days with no travellers and nothing booked.
    await seedTrip('GK-2026-0001', { tourName: 'Kashi Yatra', destination: 'Varanasi', departure: day(5), returnDate: day(10) });
    // International, in 20 days: one passport short of six months, one missing, one fine.
    await seedTrip('GK-2026-0002', { tourName: 'Dubai Family', destination: 'Dubai', departure: day(20), returnDate: day(25), isInternational: true });
    const pax = [['PAX-1', 'Sunita', addMonths(3)], ['PAX-2', 'Anil', null], ['PAX-3', 'Kavya', addMonths(24)]] as const;
    for (const [id, name, expiry] of pax) {
      await prisma.traveller.create({ data: { id, firstName: name, lastName: 'Patil', customerId: 'CUS-2026-0001', passportExpiry: expiry, createdDate: istToday() } });
      await prisma.tripTraveller.create({ data: { tripId: 'GK-2026-0002', travellerId: id } });
    }
    // A waitlisted train, and a thin-margin trip: sold for ₹1,05,000, tickets cost ₹1,00,000.
    await seedTrip('GK-2026-0003', { tourName: 'Shirdi Darshan', destination: 'Shirdi', departure: day(40), returnDate: day(42), totalPayable: 105_000 });
    await prisma.ticket.create({ data: {
      tripId: 'GK-2026-0003', mode: 'TRAIN', status: 'WAITLISTED', pnr: '4567890123', costAmount: 100_000,
      segments: { create: [{ seq: 1, fromName: 'Belagavi', toName: 'Kopargaon', departAt: new Date(`${day(40)}T20:00:00+05:30`) }] },
    } });
    // Overdue: one bill 45 days late (counts), one 10 days late (does not).
    for (const [issued, due, rate] of [[-55, -45, 40_000], [-20, -10, 10_000]] as const) {
      const r = await as('ACCOUNTS').post('/api/invoices', {
        invoiceDate: day(issued), dueDate: day(due), customerId: 'CUS-2026-0001', customerName: 'Ramesh Patil', placeOfSupplyStateCode: '29',
        tripIds: [], items: [{ description: 'Tour package', quantity: 1, rate, gstRate: 5 }],
      });
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    }
  }
  function addMonths(n: number) {
    const d = new Date(`${day(20)}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10);
  }

  it('the owner sees every insight, most urgent first, each with a sentence that stands on its own', async () => {
    await seedEverything();
    const r = await as('ADMIN').get('/api/v2/insights');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(codes(r.body)).toEqual(['DEPARTING_UNCONFIRMED', 'PASSPORTS', 'TICKETS_WAITLISTED', 'MONEY_OVERDUE', 'THIN_MARGIN']);
    const by = Object.fromEntries(r.body.items.map((i: { code: string }) => [i.code, i]));

    // Only the Kashi trip is inside 14 days; Dubai (20 days) is not counted here.
    expect(by.DEPARTING_UNCONFIRMED).toMatchObject({ count: 1, text: '1 trip leaving in the next 14 days has something not yet confirmed.' });
    expect(by.DEPARTING_UNCONFIRMED.items[0]).toMatchObject({ label: expect.stringContaining('Kashi Yatra (GK-2026-0001)'), link: '/trips/GK-2026-0001' });
    expect(by.DEPARTING_UNCONFIRMED.items[0].detail).toMatch(/Add the travellers/);

    expect(by.PASSPORTS).toMatchObject({ count: 2 });
    expect(by.PASSPORTS.items.map((i: { label: string; detail: string }) => [i.label.split(' · ')[0], i.detail]).sort()).toEqual([
      ['Anil Patil', 'no passport expiry on file'], ['Sunita Patil', 'less than six months left at travel'],
    ]);

    expect(by.TICKETS_WAITLISTED).toMatchObject({ count: 1, items: [{ label: expect.stringContaining('PNR 4567890123 · Belagavi → Kopargaon'), detail: 'waitlisted' }] });
    // 40,000 + 5% GST, 45 days late; the bill 10 days late is not counted.
    expect(by.MONEY_OVERDUE).toMatchObject({ count: 1, amount: 42_000, text: '₹42,000 is overdue by more than 30 days, from 1 customer.' });
    expect(by.THIN_MARGIN).toMatchObject({ count: 1, items: [{ label: 'Shirdi Darshan (GK-2026-0003)', detail: 'margin 4.8% (₹5,000) on ₹1,05,000' }] });
  });

  it('each role only gets the insights behind screens it can open', async () => {
    await seedEverything();
    expect(codes((await as('OPERATIONS').get('/api/v2/insights')).body)).toEqual(['DEPARTING_UNCONFIRMED', 'PASSPORTS', 'TICKETS_WAITLISTED']);
    expect(codes((await as('BOOKING').get('/api/v2/insights')).body)).toEqual(['DEPARTING_UNCONFIRMED', 'PASSPORTS', 'TICKETS_WAITLISTED', 'THIN_MARGIN']);
    expect(codes((await as('ACCOUNTS').get('/api/v2/insights')).body)).toEqual(['DEPARTING_UNCONFIRMED', 'PASSPORTS', 'TICKETS_WAITLISTED', 'MONEY_OVERDUE', 'THIN_MARGIN']);
    expect((await as('DRIVER').get('/api/v2/insights')).status).toBe(403);
    const ops = JSON.stringify((await as('OPERATIONS').get('/api/v2/insights')).body);
    expect(ops).not.toMatch(/42,000|margin/);
  });

  it('nothing to report is an empty list, not an invented one', async () => {
    const r = await as('ADMIN').get('/api/v2/insights');
    expect(r.body.items).toEqual([]);
    expect((await as('ADMIN').post('/api/v2/insights/phrase')).body).toMatchObject({ text: null, reason: expect.stringMatching(/Nothing needs attention/) });
  });

  it('a model may re-word them, and its wording is dropped if it adds a number', async () => {
    await seedEverything();
    const facts = (await as('ADMIN').get('/api/v2/insights')).body.items.map((i: { text: string }) => `- ${i.text}`).join('\n');
    const key = recorded!.recordingKey('insights', facts);
    const provider = new recorded!.RecordedProvider(dir);

    provider.write(key, { task: 'insights', model: 'claude-opus-5', text: 'One trip in the next 14 days still has something to confirm, and 2 travellers on international trips have passport problems. ₹42,000 is more than 30 days overdue.' });
    const ok = await as('ADMIN').post('/api/v2/insights/phrase');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ text: expect.stringContaining('₹42,000'), reason: null, facts });

    provider.write(key, { task: 'insights', model: 'claude-opus-5', text: 'About ₹45,000 is overdue and 3 trips need work.' });
    const bad = await as('ADMIN').post('/api/v2/insights/phrase');
    expect(bad.body).toMatchObject({ text: null, facts, reason: expect.stringContaining('45000') });
  });

  it('phrasing says "not configured" when no model is set up; the list itself never needs one', async () => {
    await seedEverything();
    process.env.AI_PROVIDER = 'claude';
    delete process.env.ANTHROPIC_API_KEY;
    ai!.resetAiProvider();
    try {
      expect((await as('ADMIN').post('/api/v2/insights/phrase')).status).toBe(503);
      expect((await as('ADMIN').get('/api/v2/insights')).body.items.length).toBe(5);
    } finally {
      process.env.AI_PROVIDER = 'recorded';
      ai!.resetAiProvider();
    }
  });

  it('insights are the same numbers the service computes directly', async () => {
    await seedEverything();
    const direct = await insights!.insightsFor('ADMIN');
    const api = (await as('ADMIN').get('/api/v2/insights')).body;
    expect(api.items).toEqual(JSON.parse(JSON.stringify(direct.items)));
  });
});
