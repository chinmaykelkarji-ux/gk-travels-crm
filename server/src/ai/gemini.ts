// ============================================================
// Gemini adapter — prose only.
//
// Gemini writes wording over facts the caller already holds (itinerary days,
// message drafts). It is deliberately not offered for extraction: reading a
// document into fields is measured by the evaluation harness, and this
// adapter has no structured-output guarantee to measure.
// ============================================================

import { callGemini, isAiConfigured } from '../lib/gemini.js';
import { AiOutputError, type AiProvider, type AiTask, type ExtractRequest, type ExtractResponse, type ProseRequest, type ProseResponse } from './types.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model = DEFAULT_GEMINI_MODEL;

  isConfigured(): boolean { return isAiConfigured(); }
  supports(task: AiTask): boolean { return task === 'prose'; }

  async extract<T>(_req: ExtractRequest<T>): Promise<ExtractResponse<T>> {
    throw new AiOutputError('Gemini is configured for wording only', 'Reading documents into fields needs the Claude provider.');
  }

  async writeProse(req: ProseRequest): Promise<ProseResponse> {
    const started = Date.now();
    const text = await callGemini(req.instructions, req.question, req.maxTokens ?? 2000);
    // Gemini's free tier does not return usage we can rely on; zero is honest here.
    return { text, model: this.model, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: Date.now() - started };
  }
}
