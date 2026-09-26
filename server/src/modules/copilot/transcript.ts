// ============================================================
// A stored conversation, as a person reads it.
//
// `ai_sessions.turns` keeps every step the model took, tool calls and raw
// tool results included, because the model needs them next time. A person
// needs less: what they asked, what it answered, and — under each answer —
// what it looked at. Pure, so it is unit-tested without a database.
// ============================================================

import type { AiToolCall, AiTurn } from '../../ai/types.js';
import { toolLabel, type CopilotLook, type CopilotMessage } from '../../../../src/shared/contracts/copilot.js';

/** The words that make a look recognisable: which trip, which search. */
function detailOf(call: AiToolCall): string | null {
  const i = call.input ?? {};
  const pick = (k: string) => (typeof i[k] === 'string' && i[k] ? String(i[k]) : null);
  return pick('tripId') ?? pick('customerId') ?? (pick('q') ? `“${pick('q')}”` : null);
}

/** Why a tool result counts as a failed look, in words a person can read. */
export function failureOf(output: unknown): string | null {
  if (output && typeof output === 'object' && 'error' in output) {
    const o = output as { error: unknown; message?: unknown };
    return typeof o.message === 'string' ? o.message : String(o.error);
  }
  return null;
}

export function lookOf(call: AiToolCall, output: unknown): CopilotLook {
  const detail = detailOf(call);
  const note = failureOf(output);
  return { tool: call.name, label: detail ? `${toolLabel(call.name)} · ${detail}` : toolLabel(call.name), ok: note === null, note };
}

export function transcript(turns: AiTurn[]): CopilotMessage[] {
  const out: CopilotMessage[] = [];
  let looked: CopilotLook[] = [];
  const calls = new Map<string, AiToolCall>();
  for (const turn of turns) {
    if (turn.role === 'user') {
      looked = [];
      out.push({ role: 'user', text: turn.content });
    } else if (turn.role === 'tool') {
      const call = calls.get(turn.callId) ?? { id: turn.callId, name: turn.name, input: {} };
      looked.push(lookOf(call, turn.output));
    } else {
      for (const c of turn.toolCalls ?? []) calls.set(c.id, c);
      // Only a turn with no further tool calls is the answer a person reads.
      if (!turn.toolCalls?.length) {
        out.push({ role: 'assistant', text: turn.content, looked });
        looked = [];
      }
    }
  }
  return out;
}

export function userMessageCount(turns: AiTurn[]): number {
  return turns.filter(t => t.role === 'user').length;
}
