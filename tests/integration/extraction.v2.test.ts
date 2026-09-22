// Reading a document end to end, against recorded answers a real model gave:
// classify → extract → match → a person checks it → the record is created.
// Nothing reaches the network, and nothing is written before approval.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedTrip, seedVendor, seedCompany } from './helpers/db';
import { app, as, USER_IDS } from './helpers/app';

const jobs = hasTestDb ? await import('../../server/src/core/jobs.js') : null;
if (hasTestDb) await import('../../server/src/jobs/handlers.js');
const ai = hasTestDb ? await import('../../server/src/ai/index.js') : null;
const prompts = hasTestDb ? await import('../../server/src/modules/extraction/prompts.js') : null;
const recorded = hasTestDb ? await import('../../server/src/ai/recorded.js') : null;

const PDF = Buffer.from('%PDF-1.4\nIndiGo 6E-123 BLR-VNS\n%%EOF\n');
const HOTEL_PDF = Buffer.from('%PDF-1.4\nGanga View confirmation GV-889\n%%EOF\n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'travelos-recordings-'));
const saved: Record<string, string | undefined> = {};

const field = <T>(value: T | null, confidence: 'high' | 'medium' | 'low' = 'high') => ({ value, confidence });

/** Stores an answer the way a real run would have recorded it. */
function record(task: string, question: string, file: Buffer, data: unknown) {
  const { RecordedProvider, recordingKey } = recorded!;
  new RecordedProvider(dir).write(recordingKey(task, question, [{ data: file }]), { task, model: 'claude-opus-5', data, usage: { inputTokens: 1200, outputTokens: 300 } });
}

function recordTicket(file: Buffer, over: Record<string, unknown> = {}) {
  const classify = prompts!.classifyPrompt();
  record('classify', classify.question, file, { type: 'TRAIN_TICKET', confidence: 'high', reason: 'IRCTC electronic reservation slip with a PNR' });
  const extract = prompts!.extractPrompt('TRAIN_TICKET');
  record('extract:TRAIN_TICKET', extract.question, file, {
    mode: field('TRAIN'), pnr: field('2345678901'), airlineOrOperator: field('Indian Railways'),
    ticketNumber: field(null), travelClass: field('3A'), quota: field('TATKAL'), bookedOn: field('2026-10-30'), fare: field(14_500),
    segments: [{
      fromName: field('Belagavi'), fromCode: field('BGM'), toName: field('Varanasi'), toCode: field('BSB'),
      departDate: field('2026-11-10'), departTime: field('22:30'), arriveDate: field('2026-11-12'), arriveTime: field('05:10'),
      serviceNumber: field('12779 Goa Express'), travelClass: field('3A'),
    }],
    passengers: [
      { name: field('Ramesh Patil'), age: field(62), gender: field('M'), seat: field('B2 14'), status: field('CNF') },
      { name: field('Sunita Patil'), age: field(58), gender: field('F'), seat: field('B2 15'), status: field('CNF') },
    ],
    ...over,
  });
}

async function keepDocument(file: Buffer, body: Record<string, unknown> = {}) {
  const reg = await as('OPERATIONS').post('/api/v2/documents', {
    fileName: 'ticket.pdf', mimeType: 'application/pdf', sizeBytes: file.length, type: 'OTHER', links: [], ...body,
  });
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  await request(app!).put(reg.body.upload.url).set('content-type', 'application/pdf').send(file);
  const done = await as('OPERATIONS').post(`/api/v2/documents/${reg.body.document.id}/complete`);
  expect(done.status).toBe(200);
  return done.body as { id: string; title: string };
}

/** Runs ticks until the queue is empty, the way the scheduler would. */
async function drainJobs(max = 10) {
  for (let i = 0; i < max; i++) {
    const summary = await jobs!.runTick({ skipRecurring: true, workerId: `t${i}` });
    if (!summary.claimed) return;
  }
}

describe.skipIf(!hasTestDb)('reading documents', () => {
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
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany();
    await seedCustomer();
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', tourName: 'Kashi Yatra', destination: 'Varanasi', departure: '2026-11-10', returnDate: '2026-11-15' });
    await prisma.traveller.create({ data: { id: 'PAX-1', firstName: 'Ramesh', lastName: 'Patil', displayName: 'Ramesh Patil', customerId: 'CUS-2026-0001', createdDate: '2026-09-01' } });
    await prisma.tripTraveller.create({ data: { tripId: 'GK-2026-0001', travellerId: 'PAX-1' } });
  });

  it('reads a ticket, proposes it against the right trip, and writes nothing until a person approves', async () => {
    recordTicket(PDF);
    const doc = await keepDocument(PDF);

    const queued = await as('OPERATIONS').post(`/api/v2/documents/${doc.id}/read`);
    expect(queued.status, JSON.stringify(queued.body)).toBe(202);
    expect(queued.body).toMatchObject({ status: 'QUEUED', step: 'classify', provider: 'recorded' });
    expect((await prisma.document.findUnique({ where: { id: doc.id } }))!.status).toBe('PROCESSING');

    await drainJobs();

    const extraction = (await as('OPERATIONS').get(`/api/v2/documents/${doc.id}/extractions`)).body.items[0];
    expect(extraction).toMatchObject({ status: 'READY', step: 'done', kind: 'TRAIN_TICKET', kindConfidence: 'high', tripId: 'GK-2026-0001' });
    expect(extraction.proposal).toMatchObject({ kind: 'TICKET', mode: 'TRAIN', pnr: '2345678901', travelClass: '3A', quota: 'TATKAL' });
    expect(extraction.proposal.segments[0]).toMatchObject({ fromName: 'Belagavi', toName: 'Varanasi', departAt: '2026-11-10T22:30:00+05:30' });
    expect(extraction.proposal.passengers.map((p: { name: string }) => p.name)).toEqual(['Ramesh Patil', 'Sunita Patil']);
    expect(extraction.matches.trip[0]).toMatchObject({ id: 'GK-2026-0001' });
    expect(extraction.matches.trip[0].why.join(' ')).toMatch(/dates|names/);

    // Read, but nothing written: no ticket exists yet and the document waits.
    expect(await prisma.ticket.count()).toBe(0);
    expect((await prisma.document.findUnique({ where: { id: doc.id } }))!.status).toBe('NEEDS_REVIEW');
    expect(await prisma.activityLog.count({ where: { action: 'document_read', source: 'AI' } })).toBe(1);

    // A person corrects the class and approves; now the ticket exists.
    const approved = await as('OPERATIONS').post(`/api/v2/extractions/${extraction.id}/approve`, {
      values: { travelClass: '2A' }, tripId: 'GK-2026-0001', note: 'Checked against the SMS',
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body).toMatchObject({ status: 'APPLIED', appliedKind: 'ticket', reviewedById: USER_IDS.OPERATIONS });

    const ticket = await prisma.ticket.findFirstOrThrow({ include: { segments: { include: { passengers: true } } } });
    expect(ticket).toMatchObject({ mode: 'TRAIN', pnr: '2345678901', travelClass: '2A', quota: 'TATKAL', tripId: 'GK-2026-0001', sourceDocumentId: doc.id });
    expect(ticket.segments).toHaveLength(1);
    expect(ticket.segments[0].passengers).toHaveLength(2);

    // The document is attached to what it produced, and the approval is a person's act.
    expect((await prisma.document.findUnique({ where: { id: doc.id } }))!.status).toBe('LINKED');
    const links = await prisma.documentLink.findMany({ where: { documentId: doc.id } });
    expect(links.map(l => l.entityType).sort()).toEqual(['booking', 'trip']);
    const approval = await prisma.activityLog.findFirstOrThrow({ where: { action: 'document_proposal_approved' } });
    expect(approval.source).toBe('HUMAN');
    expect(approval.userId).toBe(USER_IDS.OPERATIONS);
    expect(approval.description).toContain('Checked against the SMS');
  });

  it('says what it could not read instead of guessing, and a set-aside proposal writes nothing', async () => {
    recordTicket(PDF, {
      pnr: field(null),
      passengers: [{ name: field('Ramesh Patil'), age: field(null), gender: field(null, 'low'), seat: field(null), status: field('CNF') }],
    });
    const doc = await keepDocument(PDF);
    await as('OPERATIONS').post(`/api/v2/documents/${doc.id}/read`);
    await drainJobs();

    const extraction = (await as('OPERATIONS').get(`/api/v2/documents/${doc.id}/extractions`)).body.items[0];
    expect(extraction.status).toBe('READY');
    expect(extraction.proposal.pnr).toBeNull();
    expect(extraction.proposal.summary.unreadable).toEqual(expect.arrayContaining(['pnr', 'passengers 1 age', 'passengers 1 seat']));
    expect(extraction.proposal.summary.toCheck).toBeGreaterThan(0);

    const rejected = await as('OPERATIONS').post(`/api/v2/extractions/${extraction.id}/reject`, { reason: 'Old ticket, already cancelled' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('REJECTED');
    expect(await prisma.ticket.count()).toBe(0);
    expect((await prisma.document.findUnique({ where: { id: doc.id } }))!.status).toBe('UPLOADED');
    expect((await as('OPERATIONS').post(`/api/v2/extractions/${extraction.id}/approve`, { values: {} })).status).toBe(409);
  });

  it('a supplier bill goes to the accounts, and its own numbers must add up', async () => {
    await seedVendor('VEN-2026-0001', { name: 'Ganga View Hotel', gstNumber: '09AAACG1234F1Z5' });
    const classify = prompts!.classifyPrompt();
    record('classify', classify.question, HOTEL_PDF, { type: 'SUPPLIER_INVOICE', confidence: 'high', reason: 'Tax invoice addressed to GK Travels' });
    const extract = prompts!.extractPrompt('SUPPLIER_INVOICE');
    record('extract:SUPPLIER_INVOICE', extract.question, HOTEL_PDF, {
      supplierName: field('Ganga View Hotel'), supplierGstin: field('09AAACG1234F1Z5'), billNumber: field('GV/2026/41'),
      billDate: field('2026-11-13'), dueDate: field('2026-11-30'), description: field('12 rooms, 2 nights, CP'),
      taxableAmount: field(80_000), gstAmount: field(16_000), totalAmount: field(96_000), tripHint: field('Kashi Yatra'),
    });
    const doc = await keepDocument(HOTEL_PDF, { fileName: 'gv-bill.pdf', type: 'SUPPLIER_INVOICE' });
    await as('ACCOUNTS').post(`/api/v2/documents/${doc.id}/read`);
    await drainJobs();

    const extraction = (await as('ACCOUNTS').get(`/api/v2/documents/${doc.id}/extractions`)).body.items[0];
    expect(extraction).toMatchObject({ status: 'READY', kind: 'SUPPLIER_INVOICE', vendorId: 'VEN-2026-0001' });
    expect(extraction.proposal).toMatchObject({ kind: 'VENDOR_BILL', billNumber: 'GV/2026/41', totalAmount: 96_000, addsUp: true });
    expect(extraction.matches.vendor[0].why[0]).toContain('GSTIN');

    // Operations cannot save a supplier bill, however much it may want to.
    expect((await as('OPERATIONS').post(`/api/v2/extractions/${extraction.id}/approve`, { values: {} })).status).toBe(403);

    // Numbers that do not add up are refused, and the books stay untouched.
    const wrong = await as('ACCOUNTS').post(`/api/v2/extractions/${extraction.id}/approve`, { values: { gstAmount: 5_000 } });
    expect(wrong.status).toBe(400);
    expect(await prisma.vendorBill.count()).toBe(0);

    const ok = await as('ACCOUNTS').post(`/api/v2/extractions/${extraction.id}/approve`, { values: {}, tripId: 'GK-2026-0001' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const bill = await prisma.vendorBill.findFirstOrThrow();
    expect(bill).toMatchObject({ vendorId: 'VEN-2026-0001', billNumber: 'GV/2026/41', tripId: 'GK-2026-0001' });
    expect(Number(bill.amount)).toBe(96_000);
    expect(Number(bill.gstAmount)).toBe(16_000);
    // The bill is in the books, posted by the supplier-bill module as usual.
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);
  });

  it('a kind TravelOS cannot read is said plainly, not guessed at', async () => {
    const classify = prompts!.classifyPrompt();
    record('classify', classify.question, PDF, { type: 'INSURANCE', confidence: 'high', reason: 'Policy schedule from an insurer' });
    const doc = await keepDocument(PDF);
    await as('OPERATIONS').post(`/api/v2/documents/${doc.id}/read`);
    await drainJobs();

    const extraction = (await as('OPERATIONS').get(`/api/v2/documents/${doc.id}/extractions`)).body.items[0];
    expect(extraction.status).toBe('FAILED');
    expect(extraction.error).toContain('does not read Insurance yet');
    expect((await prisma.document.findUnique({ where: { id: doc.id } }))!.status).toBe('FAILED');
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('refuses to read anything when no provider is configured, rather than pretending', async () => {
    process.env.AI_PROVIDER = 'claude';
    delete process.env.ANTHROPIC_API_KEY;
    ai!.resetAiProvider();
    try {
      const doc = await keepDocument(PDF);
      const r = await as('OPERATIONS').post(`/api/v2/documents/${doc.id}/read`);
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('NOT_CONFIGURED');
      expect(await prisma.documentExtraction.count()).toBe(0);
    } finally {
      process.env.AI_PROVIDER = 'recorded';
      ai!.resetAiProvider();
    }
  });
});
