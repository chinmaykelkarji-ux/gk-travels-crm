// ============================================================
// The copilot — questions answered from the same screens a person could open.
//
//   ask(message, sessionId?)
//     load or start the conversation (it belongs to the person asking)
//     → up to MAX_STEPS times: the model answers, or asks for a tool
//        → the tool is looked up, its permission checked AGAIN for this
//          person, its input validated, it runs, and an `ai_actions` row
//          records what was asked and what came back
//     → the answer, with what it looked at
//
// The model never sees a tool the person could not use, and a tool it asks
// for anyway is refused here, not in the adapter (architecture H.6). Nothing
// in this file writes to a business record: every tool is a read.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { hasPermission } from '../../lib/permissions.js';
import { AppError, isAppError, notConfigured, notFound, stateConflict } from '../../core/errors.js';
import { aiProvider, AiOutputError, type AiToolCall, type AiTurn } from '../../ai/index.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import type { CopilotAnswer, CopilotAsk, CopilotSession, CopilotSessionSummary } from '../../../../src/shared/contracts/copilot.js';
import { TOOL_BY_NAME, toolSpecs, type ToolContext } from './tools.js';
import { transcript, userMessageCount } from './transcript.js';

/** Model steps per question. Each step may ask for several tools at once. */
export const MAX_STEPS = 6;
/** A conversation this long is better started afresh; the model re-reads all of it each time. */
export const MAX_QUESTIONS_PER_SESSION = 30;

export const STOPPED_EARLY =
  'I looked at several things but could not finish the answer in the steps I am allowed. Please ask a narrower question — for example one trip, one customer or one month.';

export interface Asker { userId: string; role: string; name?: string | null }

export function copilotInstructions(asker: Asker, today = istToday()): string {
  return [
    'You are the TravelOS copilot for GK Travels, a travel agency in Belagavi, Karnataka.',
    'You answer questions from the staff member using ONLY the results of the tools you are given.',
    '',
    'Rules:',
    '- Every fact and every number in your answer must come from a tool result in this conversation. Never invent, estimate or round a number beyond what a tool returned.',
    '- If a tool returns nothing, say plainly that nothing was found. Do not guess.',
    '- If a tool returns an error or says something is not theirs to see, tell the person plainly that it is not available to them. Do not work around it.',
    '- If you have no tool that can answer the question, say that this is outside what you can look up for them.',
    '- Money is in Indian rupees: write it as ₹1,23,456 (Indian digit grouping). Tax figures are for information; say "verify with the CA" when you mention GST or TCS.',
    `- Today is ${today} (India Standard Time). Write dates as 12 Nov 2026.`,
    '- Mention trip and customer ids (e.g. GK-2026-0007) so the person can open them.',
    '- Be brief and plain: short sentences or a short list. No preamble.',
    '- You cannot change anything. If asked to, say what they could do on the screen instead.',
    '',
    `The person asking has the role ${asker.role}.`,
  ].join('\n');
}

/** Tool results travel as plain JSON: dates as strings, Decimals as their string form. */
const plain = (v: unknown): unknown => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export interface ToolOutcome { output: unknown; error: string | null }

/**
 * What one tool call returns for this person. The permission is checked here
 * even though a tool the person lacks is never offered: a model that asks for
 * it anyway gets "not theirs to see", never the data.
 */
export async function toolOutcome(call: AiToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  const tool = TOOL_BY_NAME.get(call.name);
  if (!tool) return { error: 'unknown_tool', output: { error: 'unknown_tool', message: `There is no tool called ${call.name}.` } };
  if (!hasPermission(ctx.role as never, tool.permission)) {
    return { error: 'not_permitted', output: { error: 'not_permitted', message: 'This is not theirs to see: their role does not include it.' } };
  }
  const parsed = tool.input.safeParse(call.input ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return { error: 'invalid_input', output: { error: 'invalid_input', message } };
  }
  try {
    return { error: null, output: plain(await tool.run(parsed.data as never, ctx)) };
  } catch (err) {
    if (isAppError(err) && err.status === 404) return { error: 'not_found', output: { error: 'not_found', message: err.message } };
    if (isAppError(err) && err.status === 403) return { error: 'not_permitted', output: { error: 'not_permitted', message: 'This is not theirs to see.' } };
    // The model gets a plain message, never the internals.
    console.error('[copilot] tool failed', call.name, err instanceof Error ? err.message : err);
    return { error: 'failed', output: { error: 'failed', message: 'The lookup failed. Nothing was found.' } };
  }
}

/** Runs one tool call and records it in `ai_actions`: what was asked, what came back. */
export async function runTool(call: AiToolCall, ctx: ToolContext, sessionId: string): Promise<unknown> {
  const started = Date.now();
  const { output, error } = await toolOutcome(call, ctx);
  await prisma.aiAction.create({
    data: {
      sessionId,
      tool: call.name,
      kind: TOOL_BY_NAME.get(call.name)?.kind ?? 'read',
      input: (call.input ?? {}) as Prisma.InputJsonValue,
      output: output as Prisma.InputJsonValue,
      ok: error === null,
      error,
      latencyMs: Date.now() - started,
      requestedById: ctx.userId,
    },
  });
  return output;
}

function providerFailure(err: unknown): never {
  if (isAppError(err)) throw err;
  const detail = err instanceof AiOutputError ? err.message : 'The AI service did not answer';
  throw new AppError('INTERNAL', 502, `The copilot could not answer: ${detail}. Please try again.`);
}

export async function ask(input: CopilotAsk, asker: Asker): Promise<CopilotAnswer> {
  const provider = aiProvider('chat');
  if (!provider.isConfigured() || !provider.supports('chat')) throw notConfigured('The copilot (AI)');

  const session = input.sessionId
    ? await prisma.aiSession.findFirst({ where: { id: input.sessionId, userId: asker.userId } })
    : await prisma.aiSession.create({
      data: {
        userId: asker.userId, role: asker.role, title: input.message.slice(0, 80),
        turns: [], provider: provider.name, model: provider.model,
      },
    });
  if (!session) throw notFound('Conversation');

  const history = (session.turns ?? []) as unknown as AiTurn[];
  if (userMessageCount(history) >= MAX_QUESTIONS_PER_SESSION) {
    throw stateConflict('This conversation is long. Start a new one so the answers stay quick and accurate.');
  }

  const ctx: ToolContext = { userId: asker.userId, role: asker.role };
  const tools = toolSpecs(asker.role);
  const instructions = copilotInstructions(asker);
  const turns: AiTurn[] = [...history, { role: 'user', content: input.message }];
  const firstNew = history.length;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let model = provider.model;
  let answer: string | null = null;

  for (let step = 0; step < MAX_STEPS && answer === null; step++) {
    const res = await provider.chat({ task: 'copilot', instructions, turns, tools, maxTokens: 2000 }).catch(providerFailure);
    usage = { inputTokens: usage.inputTokens + res.usage.inputTokens, outputTokens: usage.outputTokens + res.usage.outputTokens };
    model = res.model;
    if (res.done || res.toolCalls.length === 0) {
      answer = res.text.trim() || 'I could not find an answer to that.';
      turns.push({ role: 'assistant', content: answer });
      break;
    }
    turns.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
    for (const call of res.toolCalls) {
      turns.push({ role: 'tool', callId: call.id, name: call.name, output: await runTool(call, ctx, session.id) });
    }
  }
  const stoppedEarly = answer === null;
  if (stoppedEarly) turns.push({ role: 'assistant', content: STOPPED_EARLY });

  await prisma.aiSession.update({
    where: { id: session.id },
    data: {
      turns: turns as unknown as Prisma.InputJsonValue,
      provider: provider.name, model,
      inputTokens: { increment: usage.inputTokens },
      outputTokens: { increment: usage.outputTokens },
    },
  });

  const said = transcript(turns.slice(firstNew)).filter(m => m.role === 'assistant');
  const last = said[said.length - 1];
  return {
    sessionId: session.id,
    title: session.title,
    answer: last && last.role === 'assistant' ? last : { role: 'assistant', text: STOPPED_EARLY, looked: [] },
    stoppedEarly,
    model,
  };
}

export async function listSessions(userId: string): Promise<CopilotSessionSummary[]> {
  const rows = await prisma.aiSession.findMany({
    where: { userId }, orderBy: { updatedAt: 'desc' }, take: 50,
    select: { id: true, title: true, turns: true, updatedAt: true },
  });
  return rows
    .map(r => ({ id: r.id, title: r.title, messages: userMessageCount(r.turns as unknown as AiTurn[]), updatedAt: r.updatedAt.toISOString() }))
    .filter(r => r.messages > 0);
}

/** A person only ever sees their own conversations. */
export async function getSession(id: string, userId: string): Promise<CopilotSession> {
  const row = await prisma.aiSession.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Conversation');
  const turns = row.turns as unknown as AiTurn[];
  return {
    id: row.id, title: row.title, model: row.model, messages: userMessageCount(turns),
    updatedAt: row.updatedAt.toISOString(), transcript: transcript(turns),
  };
}

