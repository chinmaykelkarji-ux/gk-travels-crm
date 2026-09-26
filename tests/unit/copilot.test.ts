// What the copilot may look at, and how a stored conversation reads.
// Pure: no database, no network.
import { describe, expect, it, afterEach } from 'vitest';
import { TOOLS, toolsFor, toolSpecs } from '../../server/src/modules/copilot/tools';
import { transcript, userMessageCount, lookOf } from '../../server/src/modules/copilot/transcript';
import { copilotInstructions } from '../../server/src/modules/copilot/service';
import { hasPermission, ROLE_PERMISSIONS } from '../../server/src/lib/permissions';
import { aiStatus, resetAiProvider } from '../../server/src/ai/index';
import { TOOL_LABELS, CopilotAsk } from '../../src/shared/contracts/copilot';
import type { AiTurn } from '../../server/src/ai/types';

const FINANCE_TOOLS = ['get_money_summary', 'get_receivables', 'get_supplier_dues'];
const names = (role: string) => toolsFor(role).map(t => t.name).sort();

describe('the tools a person gets', () => {
  it('every tool declares a permission that exists in some role; only the write tools can apply anything', () => {
    const all = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const t of TOOLS) {
      expect(all.has(t.permission), `${t.name} needs ${t.permission}`).toBe(true);
      expect(TOOL_LABELS[t.name], `${t.name} has a screen label`).toBeTruthy();
      expect(Boolean(t.apply), `${t.name}: apply only on a write`).toBe(t.kind === 'write');
    }
    expect(TOOLS.filter(t => t.kind === 'write').map(t => t.name).sort()).toEqual(['create_followup', 'create_task', 'draft_message', 'propose_trip_update']);
  });

  it('money, invoices, receipts, cancellations and sending are never tools', () => {
    for (const t of TOOLS) {
      expect(t.name).not.toMatch(/invoice|receipt|payment|refund|cancel|send|stage/);
      if (t.kind === 'write') expect(t.permission).not.toMatch(/^(finance|invoices|payments|gst|credit-notes|debit-notes):/);
    }
  });

  it('who may propose what: each write tool needs the permission its own screen needs', () => {
    expect(names('BOOKING')).toEqual(expect.arrayContaining(['create_task', 'create_followup', 'draft_message', 'propose_trip_update']));
    expect(names('OPERATIONS')).toEqual(expect.arrayContaining(['create_task', 'draft_message']));
    expect(names('OPERATIONS')).not.toEqual(expect.arrayContaining(['create_followup']));
    expect(names('OPERATIONS')).not.toContain('propose_trip_update');
    expect(names('ACCOUNTS')).toContain('create_task');
    for (const t of ['draft_message', 'propose_trip_update', 'create_followup']) expect(names('ACCOUNTS')).not.toContain(t);
  });

  it('the owner gets every tool', () => {
    expect(names('ADMIN')).toEqual(TOOLS.map(t => t.name).sort());
  });

  it('no role is handed a tool its own permissions would refuse', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      for (const t of toolsFor(role)) expect(hasPermission(role as never, t.permission)).toBe(true);
    }
  });

  it('sales staff (no finance:read) are never offered the money tools', () => {
    const booking = names('BOOKING');
    for (const t of FINANCE_TOOLS) expect(booking).not.toContain(t);
    expect(booking).toEqual(expect.arrayContaining(['search_trips', 'get_trip', 'get_customer', 'get_trip_profit']));
  });

  it('operations staff see neither the books nor a trip\'s profit', () => {
    const ops = names('OPERATIONS');
    for (const t of [...FINANCE_TOOLS, 'get_trip_profit']) expect(ops).not.toContain(t);
    expect(ops).toContain('get_open_tasks');
  });

  it('accounts get the money tools but not a trip\'s profit, which needs trips:write', () => {
    const acc = names('ACCOUNTS');
    expect(acc).toEqual(expect.arrayContaining(FINANCE_TOOLS));
    expect(acc).not.toContain('get_trip_profit');
  });

  it('a driver gets nothing at all', () => {
    expect(toolsFor('DRIVER')).toEqual([]);
  });

  it('describes each tool to the model as a strict object schema', () => {
    for (const spec of toolSpecs('ADMIN')) {
      expect(spec.description.length).toBeGreaterThan(20);
      expect(spec.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      const s = spec.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      // Strict tool use: every property is listed as required (nullable instead of optional).
      expect((s.required ?? []).sort()).toEqual(Object.keys(s.properties ?? {}).sort());
    }
  });
});

describe('a conversation as a person reads it', () => {
  const turns: AiTurn[] = [
    { role: 'user', content: 'Which trips leave this week?' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'search_trips', input: { q: 'Kashi', from: null, to: null, includeClosed: null } }] },
    { role: 'tool', callId: 'c1', name: 'search_trips', output: { total: 1, trips: [] } },
    { role: 'assistant', content: 'Let me open it.', toolCalls: [{ id: 'c2', name: 'get_trip', input: { tripId: 'GK-2026-0001' } }, { id: 'c3', name: 'get_receivables', input: {} }] },
    { role: 'tool', callId: 'c2', name: 'get_trip', output: { trip: { id: 'GK-2026-0001' } } },
    { role: 'tool', callId: 'c3', name: 'get_receivables', output: { error: 'not_permitted', message: 'Not theirs to see.' } },
    { role: 'assistant', content: 'One trip: GK-2026-0001.' },
    { role: 'user', content: 'Thanks' },
    { role: 'assistant', content: 'Namaste.' },
  ];

  it('shows the questions, the answers, and what was looked at under each answer', () => {
    const t = transcript(turns);
    expect(t.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(t[1]).toMatchObject({ text: 'One trip: GK-2026-0001.' });
    const looked = (t[1] as { looked: { label: string; ok: boolean; note?: string | null }[] }).looked;
    expect(looked.map(l => l.label)).toEqual(['Searched the trips · “Kashi”', 'Opened a trip · GK-2026-0001', 'Read who owes us']);
    expect(looked.map(l => l.ok)).toEqual([true, true, false]);
    expect(looked[2].note).toBe('Not theirs to see.');
    expect((t[3] as { looked: unknown[] }).looked).toEqual([]);
  });

  it('counts the questions asked', () => {
    expect(userMessageCount(turns)).toBe(2);
    expect(lookOf({ id: 'x', name: 'mystery_tool', input: {} }, {}).label).toBe('mystery tool');
  });
});

describe('the rules it is given', () => {
  it('answers only from tools, never invents a number, rupees, IST date, and says when it is not theirs', () => {
    const p = copilotInstructions({ userId: 'U', role: 'BOOKING' }, '2026-09-26');
    expect(p).toMatch(/ONLY the results of the tools/);
    expect(p).toMatch(/Never invent/);
    expect(p).toMatch(/nothing was found/);
    expect(p).toMatch(/₹/);
    expect(p).toContain('2026-09-26 (India Standard Time)');
    expect(p).toMatch(/not available to them/);
    expect(p).toMatch(/verify with the CA/);
    expect(p).toMatch(/only PROPOSE/);
    expect(p).toMatch(/Never say it is done, saved or sent/);
  });

  it('tells the model what the person decided about its earlier proposals', () => {
    const p = copilotInstructions({ userId: 'U', role: 'ADMIN' }, '2026-09-26', ['- Create task “Call hotel”: approved and saved']);
    expect(p).toContain('the person decided:\n- Create task “Call hotel”: approved and saved');
  });

  it('refuses an empty question or a very long one', () => {
    expect(CopilotAsk.safeParse({ message: '   ' }).success).toBe(false);
    expect(CopilotAsk.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
    expect(CopilotAsk.parse({ message: ' Who owes us? ' }).message).toBe('Who owes us?');
  });
});

describe('copilot status', () => {
  const saved = { p: process.env.AI_PROVIDER, k: process.env.ANTHROPIC_API_KEY };
  afterEach(() => {
    if (saved.p === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = saved.p;
    if (saved.k === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.k;
    resetAiProvider();
  });

  it('says "not configured" with what to set, and uses Claude even when Gemini is picked', () => {
    delete process.env.ANTHROPIC_API_KEY; process.env.AI_PROVIDER = 'gemini'; resetAiProvider();
    const s = aiStatus().copilot;
    expect(s).toMatchObject({ provider: 'claude', configured: false });
    expect(s.hint).toContain('copilot');
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'; resetAiProvider();
    expect(aiStatus().copilot).toMatchObject({ provider: 'claude', configured: true, hint: null });
  });
});

describe('opening a drafted message in the person\'s own app', () => {
  it('builds WhatsApp and mail links, and nothing when there is no number or address', async () => {
    const { whatsappLink, mailtoLink } = await import('../../src/shared/calc/messageLinks');
    expect(whatsappLink('+91 98765 43210', 'Namaste Ji')).toBe('https://wa.me/919876543210?text=Namaste%20Ji');
    expect(whatsappLink('098765 43210', 'x')).toBe('https://wa.me/919876543210?text=x');
    expect(whatsappLink(null, 'x')).toBeNull();
    expect(mailtoLink('a@b.in', 'Your trip', 'Hi & bye')).toBe('mailto:a@b.in?subject=Your%20trip&body=Hi%20%26%20bye');
    expect(mailtoLink('not-an-email', null, 'x')).toBeNull();
  });
});

describe('replaying a conversation', () => {
  it('keys a step by meaning, not by the key order JSONB hands back', async () => {
    const { chatKey } = await import('../../server/src/ai/recorded');
    const a: AiTurn[] = [{ role: 'tool', callId: 'c1', name: 'get_trip', output: { trip: { id: 'X', stage: 'BOOKED' }, ready: false } }];
    const b = [{ output: { ready: false, trip: { stage: 'BOOKED', id: 'X' } }, name: 'get_trip', callId: 'c1', role: 'tool' }] as AiTurn[];
    expect(chatKey('copilot', a, ['get_trip'])).toBe(chatKey('copilot', b, ['get_trip']));
    expect(chatKey('copilot', a, ['get_trip'])).not.toBe(chatKey('copilot', a, ['get_trip', 'search_trips']));
  });
});
