// The copilot end to end, against recorded model replies: a person asks, the
// model asks for tools, the tools run as that person, every call is recorded,
// and the answer comes back with what it looked at. Nothing reaches the
// network. The phase's exit criterion is here: a role without finance:read
// cannot get finance through the copilot, even when the model asks for it.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS, type Role } from './helpers/app';
import type { AiTurn, AiToolCall } from '../../server/src/ai/types';

const ai = hasTestDb ? await import('../../server/src/ai/index.js') : null;
const recorded = hasTestDb ? await import('../../server/src/ai/recorded.js') : null;
const tools = hasTestDb ? await import('../../server/src/modules/copilot/tools.js') : null;
const copilot = hasTestDb ? await import('../../server/src/modules/copilot/service.js') : null;
const context = hasTestDb ? await import('../../server/src/core/requestContext.js') : null;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'travelos-copilot-'));
const saved: Record<string, string | undefined> = {};
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

type Step = { calls: { name: string; input: Record<string, unknown> }[]; text?: string } | { answer: string };

/**
 * Records a whole exchange the way a real run would have stored it. Each
 * step is keyed by the conversation so far, tool results included, so the
 * tool results are produced by running the same tools as the same person.
 */
async function script(role: Role, message: string, steps: Step[], history: AiTurn[] = []): Promise<AiTurn[]> {
  const provider = new recorded!.RecordedProvider(dir);
  const toolNames = tools!.toolSpecs(role).map(t => t.name);
  const turns: AiTurn[] = [...history, { role: 'user', content: message }];
  let n = 0;
  for (const step of steps) {
    const key = recorded!.chatKey('copilot', turns, toolNames);
    if ('answer' in step) {
      provider.write(key, { task: 'copilot', model: 'claude-opus-5', text: step.answer, done: true, usage: { inputTokens: 900, outputTokens: 80 } });
      turns.push({ role: 'assistant', content: step.answer.trim() });
      continue;
    }
    const calls: AiToolCall[] = step.calls.map(c => ({ id: `toolu_${history.length}_${n++}`, name: c.name, input: c.input }));
    provider.write(key, { task: 'copilot', model: 'claude-opus-5', text: step.text ?? '', toolCalls: calls, done: false, usage: { inputTokens: 800, outputTokens: 40 } });
    turns.push({ role: 'assistant', content: step.text ?? '', toolCalls: calls });
    for (const call of calls) {
      const { output } = await context!.runWithContext(
        { organizationId: 'org_gktravels', userId: USER_IDS[role], userRole: role, source: 'HUMAN' },
        () => copilot!.toolOutcome(call, { userId: USER_IDS[role], role }),
      );
      turns.push({ role: 'tool', callId: call.id, name: call.name, output });
    }
  }
  return turns;
}

describe.skipIf(!hasTestDb)('the copilot', () => {
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
    await seedCustomer('CUS-2026-0001', { name: 'Ramesh Patil', city: 'Belagavi' });
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', customer: 'Ramesh Patil', tourName: 'Kashi Yatra', destination: 'Varanasi', departure: day(5), returnDate: day(10), pax: 42 });
    await seedTrip('GK-2026-0002', { customerId: 'CUS-2026-0001', customer: 'Ramesh Patil', tourName: 'Goa Family', destination: 'Goa', departure: day(40), returnDate: day(44) });
    // An unpaid, overdue invoice so "who owes us" has a real answer.
    const inv = await as('ACCOUNTS').post('/api/invoices', {
      invoiceDate: day(-45), dueDate: day(-35), customerId: 'CUS-2026-0001', customerName: 'Ramesh Patil', placeOfSupplyStateCode: '29',
      tripIds: [], items: [{ description: 'Tour package', quantity: 1, rate: 40_000, gstRate: 5 }],
    });
    expect(inv.status, JSON.stringify(inv.body)).toBeLessThan(300);
  });

  it('answers the owner from the tools it ran, records every call, and keeps the conversation', async () => {
    const question = 'Who owes us money, and is the Kashi trip ready?';
    const turns = await script('ADMIN', question, [
      { calls: [{ name: 'get_receivables', input: {} }, { name: 'search_trips', input: { q: 'Kashi', from: null, to: null, includeClosed: null } }] },
      { calls: [{ name: 'get_trip', input: { tripId: 'GK-2026-0001' } }], text: 'Opening the trip.' },
      { answer: 'Ramesh Patil owes ₹42,000, overdue by 35 days. Kashi Yatra (GK-2026-0001) leaves in 5 days and is not yet ready.' },
    ]);
    // The tool results the model saw are the real numbers from the books.
    const receivables = turns.find(t => t.role === 'tool' && t.name === 'get_receivables') as { output: { total: number; overdue: number } };
    expect(receivables.output).toMatchObject({ total: 42_000, overdue: 42_000 });
    const trip = turns.find(t => t.role === 'tool' && t.name === 'get_trip') as { output: { stillOpen: { what: string }[] } };
    expect(trip.output).toMatchObject({
      trip: { id: 'GK-2026-0001', name: 'Kashi Yatra', pax: 42 },
      counts: { travellers: 0, hotels: { total: 0, confirmed: 0 } },
      money: { totalPayable: 105_000, stillToCollect: 105_000 },
    });
    expect(trip.output.stillOpen.map(c => c.what)).toContain('Add the travellers');

    const r = await as('ADMIN').post('/api/v2/copilot/ask', { message: question });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.stoppedEarly).toBe(false);
    expect(r.body.answer.text).toContain('₹42,000');
    expect(r.body.answer.looked.map((l: { label: string }) => l.label)).toEqual([
      'Read who owes us', 'Searched the trips · “Kashi”', 'Opened a trip · GK-2026-0001',
    ]);
    expect(r.body.answer.looked.every((l: { ok: boolean }) => l.ok)).toBe(true);

    const actions = await prisma.aiAction.findMany({ where: { sessionId: r.body.sessionId }, orderBy: { createdAt: 'asc' } });
    expect(actions.map(a => [a.tool, a.kind, a.ok, a.requestedById])).toEqual([
      ['get_receivables', 'read', true, USER_IDS.ADMIN],
      ['search_trips', 'read', true, USER_IDS.ADMIN],
      ['get_trip', 'read', true, USER_IDS.ADMIN],
    ]);
    expect(actions[0].output).toMatchObject({ total: 42_000 });

    const session = await prisma.aiSession.findUniqueOrThrow({ where: { id: r.body.sessionId } });
    expect(session).toMatchObject({ userId: USER_IDS.ADMIN, role: 'ADMIN', provider: 'recorded', model: 'claude-opus-5', inputTokens: 2500, outputTokens: 160 });

    // A follow-up in the same conversation carries what came before.
    await script('ADMIN', 'Thank you', [{ answer: 'Namaste Ji.' }], turns);
    const again = await as('ADMIN').post('/api/v2/copilot/ask', { message: 'Thank you', sessionId: r.body.sessionId });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.answer).toEqual({ role: 'assistant', text: 'Namaste Ji.', looked: [] });

    const list = await as('ADMIN').get('/api/v2/copilot/sessions');
    expect(list.body.items).toEqual([expect.objectContaining({ id: r.body.sessionId, title: question, messages: 2 })]);
    const one = await as('ADMIN').get(`/api/v2/copilot/sessions/${r.body.sessionId}`);
    expect(one.body.transcript.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(one.body.transcript[1].looked).toHaveLength(3);
  });

  it('every tool answers the owner with real fields, not an error', async () => {
    const inputs: Record<string, Record<string, unknown>> = {
      search_trips: { q: 'Kashi', from: null, to: null, includeClosed: null }, get_trip: { tripId: 'GK-2026-0001' },
      search_customers: { q: 'Ramesh' }, get_customer: { customerId: 'CUS-2026-0001' }, get_open_tasks: { mine: null },
      get_money_summary: { from: null, to: null }, get_receivables: {}, get_trip_profit: { tripId: 'GK-2026-0001' },
      get_supplier_dues: {}, find_documents: { q: null, tripId: null, expiringWithinDays: 180 }, get_documents_to_check: {},
      search_enquiries: { q: null, includeClosed: null },
    };
    expect(Object.keys(inputs).sort()).toEqual(tools!.TOOLS.filter(t => t.kind === 'read').map(t => t.name).sort());
    for (const [name, input] of Object.entries(inputs)) {
      const r = await copilot!.toolOutcome({ id: name, name, input }, { userId: USER_IDS.ADMIN, role: 'ADMIN' });
      expect(r.error, `${name}: ${JSON.stringify(r.output)}`).toBeNull();
      expect(JSON.stringify(r.output)).not.toMatch(/undefined/);
    }
    const customer = await copilot!.toolOutcome({ id: 'c', name: 'get_customer', input: { customerId: 'CUS-2026-0001' } }, { userId: USER_IDS.ADMIN, role: 'ADMIN' });
    expect(customer.output).toMatchObject({ tripCount: 2, money: { outstanding: 42_000 } });
    const ops = await copilot!.toolOutcome({ id: 'c', name: 'get_customer', input: { customerId: 'CUS-2026-0001' } }, { userId: USER_IDS.OPERATIONS, role: 'OPERATIONS' });
    expect(ops.output).toMatchObject({ money: 'not theirs to see' });
  });

  it('EXIT CRITERION: sales staff cannot get finance through the copilot, even if the model asks for it', async () => {
    // BOOKING has no finance:read. Its tool list does not include the money tools,
    // so this recording is keyed on the smaller list — and the model asks anyway.
    expect(tools!.toolSpecs('BOOKING').map(t => t.name)).not.toContain('get_receivables');
    const question = 'How much do customers owe us in total?';
    await script('BOOKING', question, [
      { calls: [{ name: 'get_receivables', input: {} }, { name: 'get_money_summary', input: { from: null, to: null } }] },
      { answer: 'That is not available to you: money owed is for the accounts team. Please ask them.' },
    ]);

    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: question });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.answer.looked).toEqual([
      expect.objectContaining({ tool: 'get_receivables', ok: false }),
      expect.objectContaining({ tool: 'get_money_summary', ok: false }),
    ]);
    const actions = await prisma.aiAction.findMany({ where: { sessionId: r.body.sessionId } });
    expect(actions).toHaveLength(2);
    for (const a of actions) {
      expect(a).toMatchObject({ ok: false, error: 'not_permitted', requestedById: USER_IDS.BOOKING });
      expect(JSON.stringify(a.output)).not.toMatch(/42000|42,000|total/);
    }
    // Nothing the model saw carried a figure from the books.
    const session = await prisma.aiSession.findUniqueOrThrow({ where: { id: r.body.sessionId } });
    expect(JSON.stringify(session.turns)).not.toMatch(/42000|"overdue"|"owedToUs"/);
    expect(JSON.stringify(r.body)).not.toMatch(/42000/);
  });

  it('the same question from accounts does reach the books', async () => {
    const question = 'How much do customers owe us in total?';
    await script('ACCOUNTS', question, [
      { calls: [{ name: 'get_receivables', input: {} }] },
      { answer: 'Customers owe ₹42,000 in total, all of it overdue.' },
    ]);
    const r = await as('ACCOUNTS').post('/api/v2/copilot/ask', { message: question });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.answer.looked).toEqual([expect.objectContaining({ tool: 'get_receivables', ok: true })]);
  });

  it('a conversation belongs to the person who started it', async () => {
    await script('ADMIN', 'Hello', [{ answer: 'Namaste.' }]);
    const r = await as('ADMIN').post('/api/v2/copilot/ask', { message: 'Hello' });
    expect(r.status).toBe(200);
    expect((await as('BOOKING').get(`/api/v2/copilot/sessions/${r.body.sessionId}`)).status).toBe(404);
    expect((await as('BOOKING').post('/api/v2/copilot/ask', { message: 'Hello', sessionId: r.body.sessionId })).status).toBe(404);
    expect((await as('BOOKING').get('/api/v2/copilot/sessions')).body.items).toEqual([]);
  });

  it('stops after its step limit and says so plainly instead of guessing', async () => {
    const steps: Step[] = Array.from({ length: copilot!.MAX_STEPS }, () => ({ calls: [{ name: 'search_trips', input: { q: 'Goa', from: null, to: null, includeClosed: null } }] }));
    await script('ADMIN', 'Tell me everything', steps);
    const r = await as('ADMIN').post('/api/v2/copilot/ask', { message: 'Tell me everything' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.stoppedEarly).toBe(true);
    expect(r.body.answer.text).toBe(copilot!.STOPPED_EARLY);
    expect(await prisma.aiAction.count({ where: { sessionId: r.body.sessionId } })).toBe(copilot!.MAX_STEPS);
  });

  it('a bad tool input is refused and recorded, not run', async () => {
    await script('ADMIN', 'Open trip', [
      { calls: [{ name: 'get_trip', input: { tripId: 42 } }] },
      { answer: 'I could not open that trip.' },
    ]);
    const r = await as('ADMIN').post('/api/v2/copilot/ask', { message: 'Open trip' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [a] = await prisma.aiAction.findMany({ where: { sessionId: r.body.sessionId } });
    expect(a).toMatchObject({ tool: 'get_trip', ok: false, error: 'invalid_input' });
  });

  it('who may ask at all: every staff role, never a driver', async () => {
    expect((await as('DRIVER').post('/api/v2/copilot/ask', { message: 'Hi' })).status).toBe(403);
    expect((await as('OPERATIONS').get('/api/v2/copilot/sessions')).status).toBe(200);
    expect((await as('ADMIN').post('/api/v2/copilot/ask', { message: '' })).status).toBe(400);
  });

  it('says "not configured" when no model is set up', async () => {
    process.env.AI_PROVIDER = 'claude';
    delete process.env.ANTHROPIC_API_KEY;
    ai!.resetAiProvider();
    try {
      const r = await as('ADMIN').post('/api/v2/copilot/ask', { message: 'Who owes us?' });
      expect(r.status).toBe(503);
      expect(r.body.error).toMatchObject({ code: 'NOT_CONFIGURED', message: 'The copilot (AI) is not configured on this server' });
      expect(await prisma.aiSession.count()).toBe(0);
    } finally {
      process.env.AI_PROVIDER = 'recorded';
      ai!.resetAiProvider();
    }
  });

  it('a replay it has no recording for fails honestly and invents nothing', async () => {
    const r = await as('ADMIN').post('/api/v2/copilot/ask', { message: 'Something never recorded' });
    expect(r.status).toBe(502);
    expect(r.body.error.message).toMatch(/could not answer/);
  });

  // ── 6.2: proposals ───────────────────────────────────────────

  const proposalOf = (body: { answer: { looked: { proposal?: { id: string; status: string; summary: string; preview: Record<string, unknown> } }[] } }, i = 0) => body.answer.looked[i].proposal!;

  it('a task is only proposed; it exists once the person approves, as theirs, and only once', async () => {
    const question = 'Remind me to call the Kashi hotel tomorrow';
    const tasksBefore = await prisma.task.count();
    await script('BOOKING', question, [
      { calls: [{ name: 'create_task', input: { title: 'Call the Kashi hotel about room allotment', details: null, priority: 'high', due: day(1), tripId: 'GK-2026-0001' } }] },
      { answer: 'I have proposed a task for tomorrow on GK-2026-0001. Please check it and approve it below.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: question });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const p = proposalOf(r.body);
    expect(p).toMatchObject({ status: 'PROPOSED', summary: expect.stringContaining('Call the Kashi hotel') });
    expect(p.preview).toMatchObject({ task: { title: 'Call the Kashi hotel about room allotment', priority: 'high', tripId: 'GK-2026-0001' } });
    // Proposed, not saved.
    expect(await prisma.task.count()).toBe(tasksBefore);

    // Somebody else cannot see or approve it.
    expect((await as('ADMIN').post(`/api/v2/copilot/proposals/${p.id}/approve`, {})).status).toBe(404);

    const ok = await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/approve`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', result: { type: 'task', link: '/trips/GK-2026-0001' } });
    const task = await prisma.task.findUniqueOrThrow({ where: { id: ok.body.result.id } });
    expect(task).toMatchObject({ title: 'Call the Kashi hotel about room allotment', tripId: 'GK-2026-0001', priority: 'high', source: 'MANUAL' });

    const action = await prisma.aiAction.findUniqueOrThrow({ where: { id: p.id } });
    expect(action).toMatchObject({ kind: 'write', status: 'APPROVED', approvedById: USER_IDS.BOOKING, requestedById: USER_IDS.BOOKING });
    expect(action.approvedAt).toBeInstanceOf(Date);
    const created = await prisma.activityLog.findFirstOrThrow({ where: { action: 'task_created', entityId: task.id } });
    expect(created).toMatchObject({ userId: USER_IDS.BOOKING, source: 'HUMAN' });
    const approved = await prisma.activityLog.findFirstOrThrow({ where: { action: 'copilot_proposal_approved' } });
    expect(approved).toMatchObject({ entityType: 'task', entityId: task.id, userId: USER_IDS.BOOKING, source: 'HUMAN' });
    expect(approved.metadata).toMatchObject({ aiActionId: p.id, tool: 'create_task' });

    // Once only.
    expect((await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/approve`, {})).status).toBe(409);
    expect((await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/reject`)).status).toBe(409);
    expect(await prisma.task.count({ where: { title: task.title } })).toBe(1);

    // The conversation shows it as approved, under the answer that proposed it.
    const one = await as('BOOKING').get(`/api/v2/copilot/sessions/${r.body.sessionId}`);
    expect(one.body.transcript[1].looked[0].proposal).toMatchObject({ id: p.id, status: 'APPROVED' });
  });

  it('a trip change that is rejected changes nothing', async () => {
    const question = 'Move the Kashi trip one day later';
    await script('BOOKING', question, [
      { calls: [{ name: 'propose_trip_update', input: { tripId: 'GK-2026-0001', tourName: null, departure: day(6), returnDate: day(11), noteToAdd: 'Moved a day later at the group\'s request' } }] },
      { answer: 'I have proposed moving GK-2026-0001 by one day. Please approve it below.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: question });
    const p = proposalOf(r.body);
    expect(p.preview.changes).toEqual([
      { field: 'Departure', from: day(5), to: day(6) },
      { field: 'Return', from: day(10), to: day(11) },
      expect.objectContaining({ field: 'Note added', from: null }),
    ]);
    const no = await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/reject`);
    expect(no.status).toBe(200);
    expect(no.body).toMatchObject({ status: 'REJECTED', result: null });
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).toMatchObject({ departure: day(5), returnDate: day(10) });
    expect(await prisma.aiAction.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: 'REJECTED', rejectedById: USER_IDS.BOOKING, approvedById: null });
    expect(await prisma.activityLog.count({ where: { action: 'copilot_proposal_rejected', entityId: p.id } })).toBe(1);
    expect((await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/approve`, {})).status).toBe(409);
  });

  it('an approved trip change goes through the ordinary trip update, with its audit', async () => {
    await script('BOOKING', 'Add a note', [
      { calls: [{ name: 'propose_trip_update', input: { tripId: 'GK-2026-0001', tourName: 'Kashi Yatra 2026', departure: null, returnDate: null, noteToAdd: 'Group wants a Ganga aarti evening' } }] },
      { answer: 'Proposed. Please approve it below.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: 'Add a note' });
    const ok = await as('BOOKING').post(`/api/v2/copilot/proposals/${proposalOf(r.body).id}/approve`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } });
    expect(trip.tourName).toBe('Kashi Yatra 2026');
    expect(trip.notes).toMatch(/\[\d{4}-\d{2}-\d{2}\] Group wants a Ganga aarti evening$/);
    expect(await prisma.activityLog.findFirstOrThrow({ where: { action: 'trip_updated', entityId: 'GK-2026-0001' } })).toMatchObject({ userId: USER_IDS.BOOKING });
  });

  it('approving re-checks the permission: a proposal cannot be approved by a role that lacks it', async () => {
    await script('BOOKING', 'Rename', [
      { calls: [{ name: 'propose_trip_update', input: { tripId: 'GK-2026-0001', tourName: 'Renamed', departure: null, returnDate: null, noteToAdd: null } }] },
      { answer: 'Proposed.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: 'Rename' });
    const id = proposalOf(r.body).id;
    const proposals = await import('../../server/src/modules/copilot/proposals.js');
    // The same person, if their role no longer includes trips:write.
    await expect(proposals.approveProposal(id, { userId: USER_IDS.BOOKING, role: 'OPERATIONS' })).rejects.toMatchObject({ status: 403 });
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).tourName).toBe('Kashi Yatra');
    expect((await prisma.aiAction.findUniqueOrThrow({ where: { id } })).status).toBe('PROPOSED');
  });

  it('a drafted message is never sent: approving hands back a link for the person to send', async () => {
    const text = 'Namaste Shri Ramesh Patil Ji, your Kashi Yatra (GK-2026-0001) departs soon.';
    await script('BOOKING', 'Draft a reminder to Ramesh', [
      { calls: [{ name: 'draft_message', input: { customerId: 'CUS-2026-0001', channel: 'whatsapp', subject: null, text } }] },
      { answer: 'Here is a draft. Please check the wording and approve it below; TravelOS will not send it.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: 'Draft a reminder to Ramesh' });
    const p = proposalOf(r.body);
    expect(p.preview).toMatchObject({ message: { to: 'Ramesh Patil', channel: 'whatsapp', text }, canOpen: true, note: 'Nothing is sent by TravelOS.' });
    const edited = `${text} Please carry your Aadhaar card.`;
    const ok = await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/approve`, { text: edited });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.result).toMatchObject({ type: 'message_draft', id: null, external: true });
    expect(ok.body.result.link).toBe(`https://wa.me/919999900001?text=${encodeURIComponent(edited)}`);
    const action = await prisma.aiAction.findUniqueOrThrow({ where: { id: p.id } });
    expect(action.result).toMatchObject({ editedInput: { text: edited } });
    expect(action.input).toMatchObject({ text });   // what the model proposed stays on record
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(await prisma.activityLog.findFirstOrThrow({ where: { action: 'copilot_proposal_approved' } })).toMatchObject({ entityType: 'customer', entityId: 'CUS-2026-0001' });
  });

  it('a follow-up on an enquiry is proposed, then created by the enquiry service', async () => {
    const enq = await as('BOOKING').post('/api/v2/enquiries', { customerId: 'CUS-2026-0001', source: 'WHATSAPP', destination: 'Rameshwaram', adults: 4 });
    expect(enq.status, JSON.stringify(enq.body)).toBe(201);
    const found = await copilot!.toolOutcome({ id: 'x', name: 'search_enquiries', input: { q: 'Rameshwaram', includeClosed: null } }, { userId: USER_IDS.BOOKING, role: 'BOOKING' });
    expect(found.output).toMatchObject({ total: 1, enquiries: [{ id: enq.body.id, customer: 'Ramesh Patil', destination: 'Rameshwaram' }] });
    await script('BOOKING', 'Follow up the Rameshwaram enquiry on Monday', [
      { calls: [{ name: 'create_followup', input: { enquiryId: enq.body.id, dueDate: day(3), note: 'Send the hotel options' } }] },
      { answer: 'Proposed a follow-up. Please approve it below.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: 'Follow up the Rameshwaram enquiry on Monday' });
    const p = proposalOf(r.body);
    expect(p.preview).toMatchObject({ followUp: { customer: 'Ramesh Patil', destination: 'Rameshwaram', dueDate: day(3) } });
    const ok = await as('BOOKING').post(`/api/v2/copilot/proposals/${p.id}/approve`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: ok.body.result.id } })).toMatchObject({ dueDate: day(3), customerId: 'CUS-2026-0001' });
    expect(await prisma.activityLog.count({ where: { action: 'enquiry_follow_up', entityId: enq.body.id } })).toBe(1);
  });

  it('a proposal that cannot be made is refused and never becomes approvable', async () => {
    await script('BOOKING', 'Nothing', [
      { calls: [{ name: 'propose_trip_update', input: { tripId: 'GK-2026-0001', tourName: 'Kashi Yatra', departure: null, returnDate: null, noteToAdd: null } }] },
      { answer: 'Nothing would change.' },
    ]);
    const r = await as('BOOKING').post('/api/v2/copilot/ask', { message: 'Nothing' });
    expect(r.body.answer.looked[0]).toMatchObject({ ok: false, note: 'Nothing would change on this trip' });
    expect(r.body.answer.looked[0].proposal).toBeUndefined();
    const [a] = await prisma.aiAction.findMany({ where: { sessionId: r.body.sessionId } });
    expect(a).toMatchObject({ status: 'DONE', ok: false, error: 'invalid_input' });
    expect((await as('BOOKING').post(`/api/v2/copilot/proposals/${a.id}/approve`, {})).status).toBe(409);
  });
});
