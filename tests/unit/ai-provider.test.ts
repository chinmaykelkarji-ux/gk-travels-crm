// The schema the model is asked to answer in, which provider answers, and the
// honest "not configured" status. Nothing here reaches the network.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { toJsonSchema } from '../../src/shared/calc/jsonSchema';
import { aiProvider, aiStatus, resetAiProvider } from '../../server/src/ai/index';
import { RecordedProvider, recordingKey } from '../../server/src/ai/recorded';
import { ClaudeProvider, filePart } from '../../server/src/ai/claude';
import { AiOutputError } from '../../server/src/ai/types';

const ENV_KEYS = ['AI_PROVIDER', 'AI_MODEL', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'AI_RECORDINGS_DIR', 'STORAGE_PROVIDER'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetAiProvider();
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  resetAiProvider();
});

describe('extraction schema', () => {
  const Ticket = z.object({
    pnr: z.string().nullable().describe('The booking reference printed on the ticket'),
    mode: z.enum(['FLIGHT', 'TRAIN', 'BUS']),
    seats: z.number().int().min(1).max(60).nullable(),
    refundable: z.boolean().nullable(),
    passengers: z.array(z.object({ name: z.string(), seat: z.string().nullable() })),
  });

  it('asks for every field, allows null for what a document does not show, and carries the wording', () => {
    const s = toJsonSchema(Ticket);
    expect(s.type).toBe('object');
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['pnr', 'mode', 'seats', 'refundable', 'passengers']);
    expect(s.properties!.pnr).toEqual({ type: ['string', 'null'], description: 'The booking reference printed on the ticket' });
    expect(s.properties!.mode).toEqual({ type: 'string', enum: ['FLIGHT', 'TRAIN', 'BUS'] });
    expect(s.properties!.seats).toEqual({ type: ['integer', 'null'], minimum: 1, maximum: 60 });
    expect(s.properties!.refundable).toEqual({ type: ['boolean', 'null'] });
    expect(s.properties!.passengers).toEqual({
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['name', 'seat'], properties: { name: { type: 'string' }, seat: { type: ['string', 'null'] } } },
    });
  });

  it('refuses a shape it cannot describe faithfully, rather than describing it wrongly', () => {
    expect(() => toJsonSchema(z.object({ x: z.map(z.string(), z.string()) }))).toThrow(/unsupported/);
    expect(() => toJsonSchema(z.union([z.string(), z.number()]))).toThrow(/literals/);
  });
});

describe('which provider, and is it configured', () => {
  it('says "not configured" instead of pretending, and names what to set', () => {
    const s = aiStatus();
    expect(s.extraction).toMatchObject({ provider: 'claude', configured: false });
    expect(s.extraction.hint).toContain('ANTHROPIC_API_KEY');
    expect(s.ready).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/sk-|key["']?\s*:\s*["'][A-Za-z0-9]/);
  });

  it('uses Claude for both jobs when it has a key, and Gemini for wording when only Gemini has one', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.STORAGE_PROVIDER = 'local';
    resetAiProvider();
    expect(aiProvider('extraction').name).toBe('claude');
    expect(aiProvider('prose').name).toBe('claude');
    expect(aiStatus().extraction.configured).toBe(true);

    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    resetAiProvider();
    expect(aiProvider('prose').name).toBe('gemini');
    const s = aiStatus();
    expect(s.prose).toMatchObject({ provider: 'gemini', configured: true });
    expect(s.extraction.configured).toBe(false);   // wording is not reading
    expect(s.ready).toBe(false);
  });

  it('the model can be pointed at another one, for the evaluation harness', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_MODEL = 'claude-sonnet-5';
    resetAiProvider();
    expect(aiProvider('extraction').model).toBe('claude-sonnet-5');
  });
});

describe('the document as the model sees it', () => {
  it('sends the file itself — the PDF or the photo — and refuses anything it cannot read', () => {
    const pdf = filePart({ fileName: 'ticket.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4') });
    expect(pdf).toMatchObject({ type: 'document', title: 'ticket.pdf', source: { type: 'base64', media_type: 'application/pdf' } });
    const jpg = filePart({ fileName: 'scan.jpg', mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8]) });
    expect(jpg).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(() => filePart({ fileName: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: Buffer.from('x') }))
      .toThrow(AiOutputError);
  });

  it('refuses to send a document bigger than one request can hold', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = new ClaudeProvider();
    await expect(provider.extract({
      task: 'extract:test', instructions: 'x', question: 'y', schema: z.object({ a: z.string() }),
      files: [{ fileName: 'big.pdf', mimeType: 'application/pdf', data: Buffer.alloc(21 * 1024 * 1024) }],
    })).rejects.toThrow(/too large/);
  });
});

describe('recorded answers (replay)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rec-'));
  const Schema = z.object({ pnr: z.string().nullable() });
  const req = { task: 'extract:FLIGHT_TICKET', instructions: 'i', question: 'q', schema: Schema, files: [{ fileName: 'a.pdf', mimeType: 'application/pdf', data: Buffer.from('one') }] };

  it('replays what a real model answered, and never invents one it has not got', async () => {
    const p = new RecordedProvider(dir);
    await expect(p.extract(req)).rejects.toThrow(/No recorded answer/);

    p.write(recordingKey(req.task, req.question, req.files), { task: req.task, model: 'claude-opus-5', data: { pnr: 'AB12CD' } });
    const out = await p.extract(req);
    expect(out.data).toEqual({ pnr: 'AB12CD' });
    expect(out.model).toBe('claude-opus-5');

    // A different document is a different key: no accidental reuse.
    await expect(p.extract({ ...req, files: [{ ...req.files[0], data: Buffer.from('two') }] })).rejects.toThrow(/No recorded answer/);
  });

  it('checks an old recording against today\'s fields instead of replaying a stale shape', async () => {
    const p = new RecordedProvider(dir);
    p.write(recordingKey('extract:OLD', 'q', []), { task: 'extract:OLD', model: 'claude-opus-5', data: { pnr: 42 } });
    await expect(p.extract({ task: 'extract:OLD', instructions: 'i', question: 'q', schema: Schema }))
      .rejects.toThrow(/no longer fits/);
  });
});
