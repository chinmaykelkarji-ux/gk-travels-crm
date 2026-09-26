// ============================================================
// Claude adapter (Anthropic Messages API).
//
// The document goes to the model as the file itself — the PDF or the photo —
// never as text we typed out of it, so nothing is lost or invented on the way
// in. The answer comes back inside a strict JSON schema built from the same
// zod contract that then validates it.
//
// The client is built on first use, never at import time: AI is optional, and
// a missing key must not take down the API (same reason as lib/gemini.ts).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { toJsonSchema } from '../../../src/shared/calc/jsonSchema.js';
import { AiOutputError, type AiFilePart, type AiProvider, type AiTask, type AiToolCall, type AiTurn, type AiUsage, type ChatRequest, type ChatResponse, type ExtractRequest, type ExtractResponse, type ProseRequest, type ProseResponse } from './types.js';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** The request itself is capped well below the API's 32 MB so a big scan fails clearly. */
export const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiOutputError('Claude is not configured — ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Exported for the tests: the file as the model sees it. */
export function filePart(file: AiFilePart): Anthropic.ContentBlockParam {
  const data = file.data.toString('base64');
  if (file.mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: file.fileName };
  }
  if (IMAGE_TYPES.has(file.mimeType)) {
    return { type: 'image', source: { type: 'base64', media_type: file.mimeType as 'image/jpeg', data } };
  }
  throw new AiOutputError(`This file type cannot be read by the model (${file.mimeType})`, 'Upload a PDF or a photo (JPG, PNG, WEBP).');
}

function usageOf(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }): AiUsage {
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: u.cache_read_input_tokens ?? 0 };
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
}

/**
 * The conversation as the API wants it: a tool result is a user turn carrying
 * `tool_result` blocks, and consecutive results are merged into one turn.
 */
export function toMessages(turns: AiTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') { out.push({ role: 'user', content: turn.content }); continue; }
    if (turn.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      if (turn.content) content.push({ type: 'text', text: turn.content });
      for (const c of turn.toolCalls ?? []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      if (content.length) out.push({ role: 'assistant', content });
      continue;
    }
    const block: Anthropic.ContentBlockParam = {
      type: 'tool_result',
      tool_use_id: turn.callId,
      content: [{ type: 'text', text: JSON.stringify(turn.output) }],
    };
    const last = out[out.length - 1];
    if (last?.role === 'user' && Array.isArray(last.content)) (last.content as Anthropic.ContentBlockParam[]).push(block);
    else out.push({ role: 'user', content: [block] });
  }
  return out;
}

export class ClaudeProvider implements AiProvider {
  readonly name = 'claude';
  constructor(readonly model: string = process.env.AI_MODEL || DEFAULT_CLAUDE_MODEL) {}

  isConfigured(): boolean { return Boolean(process.env.ANTHROPIC_API_KEY); }
  supports(_task: AiTask): boolean { return true; }

  async extract<T>(req: ExtractRequest<T>): Promise<ExtractResponse<T>> {
    const files = req.files ?? [];
    const bytes = files.reduce((n, f) => n + f.data.length, 0);
    if (bytes > MAX_REQUEST_BYTES) {
      throw new AiOutputError('The document is too large to read in one go', `${Math.round(bytes / 1024 / 1024)} MB; the limit is ${MAX_REQUEST_BYTES / 1024 / 1024} MB.`);
    }
    const content: Anthropic.ContentBlockParam[] = files.map(filePart);
    if (req.text) content.push({ type: 'text', text: req.text });
    content.push({ type: 'text', text: req.question });

    const started = Date.now();
    const response = await getClient().messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      system: req.instructions,
      messages: [{ role: 'user', content }],
      output_config: {
        ...(req.effort ? { effort: req.effort } : {}),
        format: { type: 'json_schema', schema: toJsonSchema(req.schema) as Record<string, unknown> },
      },
    });
    const latencyMs = Date.now() - started;

    if (response.stop_reason === 'refusal') {
      throw new AiOutputError('The model declined to read this document', response.stop_details?.explanation ?? undefined);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AiOutputError('The answer was cut short', 'The document may be longer than one request can hold.');
    }
    const raw = textOf(response.content);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AiOutputError('The model did not answer in the shape that was asked for');
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiOutputError('The answer did not fit the fields it had to fill', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return { data: parsed.data as T, model: response.model, usage: usageOf(response.usage), latencyMs };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const response = await getClient().messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.instructions,
      messages: toMessages(req.turns),
      ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      tools: req.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        // Every argument arrives in the shape the tool declared, or not at all.
        strict: true,
      })),
    });
    if (response.stop_reason === 'refusal') {
      throw new AiOutputError('The model declined to answer this', response.stop_details?.explanation ?? undefined);
    }
    const toolCalls: AiToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
    return {
      text: textOf(response.content),
      toolCalls,
      done: response.stop_reason !== 'tool_use' && toolCalls.length === 0,
      model: response.model,
      usage: usageOf(response.usage),
      latencyMs: Date.now() - started,
    };
  }

  async writeProse(req: ProseRequest): Promise<ProseResponse> {
    const started = Date.now();
    const response = await getClient().messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2000,
      system: req.instructions,
      messages: [{ role: 'user', content: req.question }],
    });
    if (response.stop_reason === 'refusal') throw new AiOutputError('The model declined to write this');
    return { text: textOf(response.content), model: response.model, usage: usageOf(response.usage), latencyMs: Date.now() - started };
  }
}
