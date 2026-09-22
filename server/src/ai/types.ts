// ============================================================
// The AI provider interface.
//
// Everything the system asks a model to do goes through this interface, so a
// provider can be swapped after the evaluation harness has measured them
// (decision P5-1) and so tests never reach the network.
//
// Two jobs, deliberately separate:
//   - extract(): read a document and answer inside a strict schema. Used by
//     the document pipeline. The answer is a proposal for a person to approve;
//     nothing it returns is ever written straight to a record (hard rule 8).
//   - writeProse(): wording only, over facts the caller already holds.
//
// A provider that is not configured says so (`isConfigured()`), and the
// screens show "Not configured" rather than pretending (hard rule 9).
// ============================================================

import type { z } from 'zod';

export type AiTask = 'extraction' | 'prose';
export type AiEffort = 'low' | 'medium' | 'high';

/** A file exactly as it was uploaded — never a transcription of it. */
export interface AiFilePart {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface ExtractRequest<T> {
  /** Short name of the job, for logs and the eval harness (e.g. `classify`, `extract:FLIGHT_TICKET`). */
  task: string;
  /** The system prompt: who the model is and the rules it must follow. */
  instructions: string;
  /** The question asked of this document. */
  question: string;
  /** The shape the answer must take; also validates what comes back. */
  schema: z.ZodType<T>;
  files?: AiFilePart[];
  text?: string;
  maxTokens?: number;
  effort?: AiEffort;
}

export interface ExtractResponse<T> {
  data: T;
  model: string;
  usage: AiUsage;
  latencyMs: number;
}

export interface ProseRequest {
  task: string;
  instructions: string;
  question: string;
  maxTokens?: number;
}

export interface ProseResponse {
  text: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
}

export interface AiProvider {
  /** `claude`, `gemini`, `recorded` — shown in settings and stored on every proposal. */
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  supports(task: AiTask): boolean;
  extract<T>(req: ExtractRequest<T>): Promise<ExtractResponse<T>>;
  writeProse(req: ProseRequest): Promise<ProseResponse>;
}

/** Raised when the model answered, but not in a way we can trust or use. */
export class AiOutputError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'AiOutputError';
  }
}
