// ============================================================
// Recorded provider — answers only from replies a real model already gave.
//
// It exists for two honest uses:
//   - the test suite, which must never reach the network
//   - the evaluation harness, which replays the same documents against a
//     stored run so a scoring change can be compared without paying twice
//
// It never invents an answer: a document it has no recording for raises an
// error. Settings shows it as "recorded answers (replay)", so nobody can
// mistake a replay for a live model (hard rule 9).
// ============================================================

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AiOutputError, type AiProvider, type AiTask, type ExtractRequest, type ExtractResponse, type ProseRequest, type ProseResponse } from './types.js';

export interface Recording {
  task: string;
  model: string;
  data?: unknown;
  text?: string;
  usage?: { inputTokens: number; outputTokens: number };
  /** Set when the recorded run itself failed, so replays fail the same way. */
  error?: string;
}

/** The key a request is stored under: the job, the question and the bytes seen. */
export function recordingKey(task: string, question: string, files: { data: Buffer }[] = [], text?: string): string {
  const h = createHash('sha256');
  h.update(task).update('\n').update(question).update('\n').update(text ?? '');
  for (const f of files) h.update(createHash('sha256').update(f.data).digest());
  return `${task.replace(/[^a-zA-Z0-9._-]/g, '_')}-${h.digest('hex').slice(0, 16)}`;
}

export class RecordedProvider implements AiProvider {
  readonly name = 'recorded';
  readonly model: string;

  constructor(readonly dir: string = process.env.AI_RECORDINGS_DIR || '.ai-recordings', model = 'recorded') {
    this.model = model;
  }

  isConfigured(): boolean { return fs.existsSync(this.dir); }
  supports(_task: AiTask): boolean { return true; }

  private read(key: string): Recording {
    const file = path.join(this.dir, `${key}.json`);
    if (!fs.existsSync(file)) {
      throw new AiOutputError('No recorded answer for this document', `Expected ${key}.json in ${this.dir}. Record it first with a real provider.`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Recording;
  }

  /** Used by the harness to store a real answer for replay. */
  write(key: string, recording: Recording): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, `${key}.json`), JSON.stringify(recording, null, 2));
  }

  async extract<T>(req: ExtractRequest<T>): Promise<ExtractResponse<T>> {
    const rec = this.read(recordingKey(req.task, req.question, req.files, req.text));
    if (rec.error) throw new AiOutputError(rec.error);
    // A recording is still checked against the schema: a contract change must
    // fail loudly rather than replay an answer that no longer fits.
    const parsed = req.schema.safeParse(rec.data);
    if (!parsed.success) {
      throw new AiOutputError('The recorded answer no longer fits the fields', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return { data: parsed.data as T, model: rec.model, usage: { inputTokens: 0, outputTokens: 0, ...rec.usage }, latencyMs: 0 };
  }

  async writeProse(req: ProseRequest): Promise<ProseResponse> {
    const rec = this.read(recordingKey(req.task, req.question));
    if (rec.error) throw new AiOutputError(rec.error);
    return { text: rec.text ?? '', model: rec.model, usage: { inputTokens: 0, outputTokens: 0, ...rec.usage }, latencyMs: 0 };
  }
}
