// ============================================================
// Which provider does what, and whether it is configured at all.
//
//   AI_PROVIDER=claude|gemini|recorded   picks the extraction provider
//                                        (default: claude)
//   AI_MODEL=<model id>                  overrides the model, so the
//                                        evaluation harness can compare
//   ANTHROPIC_API_KEY / GEMINI_API_KEY   the keys themselves
//
// Nothing here throws when a key is missing. Callers ask `aiStatus()` and the
// screens say "Not configured" — an unconfigured feature is never hidden and
// never pretended (hard rule 9).
// ============================================================

import { isStorageConfigured } from '../core/storage.js';
import { ClaudeProvider } from './claude.js';
import { GeminiProvider } from './gemini.js';
import { RecordedProvider } from './recorded.js';
import type { AiProvider, AiTask } from './types.js';

export * from './types.js';
export { recordingKey, type Recording } from './recorded.js';

let cached: { key: string; provider: AiProvider } | null = null;

function build(name: string): AiProvider {
  switch (name) {
    case 'gemini':   return new GeminiProvider();
    case 'recorded': return new RecordedProvider();
    default:         return new ClaudeProvider();
  }
}

/** The provider for a job. Prose falls back to Gemini when only Gemini has a key. */
export function aiProvider(task: AiTask = 'extraction'): AiProvider {
  const name = (process.env.AI_PROVIDER || 'claude').toLowerCase();
  const key = `${name}:${process.env.AI_MODEL ?? ''}:${task}`;
  if (cached?.key === key) return cached.provider;
  let provider = build(name);
  if (task === 'prose' && !provider.isConfigured()) {
    const gemini = new GeminiProvider();
    if (gemini.isConfigured()) provider = gemini;
  }
  cached = { key, provider };
  return provider;
}

/** Tests and the settings screen re-read the environment after it changes. */
export function resetAiProvider(): void { cached = null; }

export interface AiFeatureStatus {
  provider: string;
  model: string;
  configured: boolean;
  /** What to do about it, in plain words — never the key itself. */
  hint: string | null;
}

export interface AiStatus {
  extraction: AiFeatureStatus;
  prose: AiFeatureStatus;
  storage: { configured: boolean; hint: string | null };
  /** True only when a document can actually be read end to end today. */
  ready: boolean;
}

const HINT: Record<string, string> = {
  claude:   'Set ANTHROPIC_API_KEY on the server to let TravelOS read documents.',
  gemini:   'Set GEMINI_API_KEY on the server to let TravelOS write wording.',
  recorded: 'No recordings folder found (AI_RECORDINGS_DIR).',
};

function statusOf(p: AiProvider, task: AiTask): AiFeatureStatus {
  const configured = p.isConfigured() && p.supports(task);
  return {
    provider: p.name,
    model: p.model,
    configured,
    hint: configured ? null
      : p.supports(task) ? (HINT[p.name] ?? 'This provider is not configured on the server.')
      : `${p.name} does not do ${task === 'extraction' ? 'document reading' : 'wording'}.`,
  };
}

export function aiStatus(): AiStatus {
  const extraction = statusOf(aiProvider('extraction'), 'extraction');
  const prose = statusOf(aiProvider('prose'), 'prose');
  const storage = isStorageConfigured();
  return {
    extraction,
    prose,
    storage: { configured: storage, hint: storage ? null : 'Document storage is not configured (R2 bucket or local disk).' },
    ready: extraction.configured && storage,
  };
}
