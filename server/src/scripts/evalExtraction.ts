// ============================================================
// The evaluation harness: how well does a model actually read GK Travels'
// own documents, and what does it cost?
//
// It runs over the real PDFs in `eval-docs/` (gitignored, never committed).
// Beside each document sits the answer a person wrote down:
//
//   eval-docs/train-ticket-01.pdf
//   eval-docs/train-ticket-01.expected.json
//     { "type": "TRAIN_TICKET",
//       "fields": { "pnr": "2345678901", "quota": "TATKAL",
//                   "segments": [{ "fromName": "Belagavi", ... }] } }
//
// A field the document does not show is written as null — the harness then
// checks the model also answered null instead of guessing (hard rule 8).
//
// The report NEVER prints what a document says. Field names, verdicts and
// totals only, unless --show-values is passed deliberately (hard rule 6).
//
// PowerShell:
//   $env:ANTHROPIC_API_KEY = "…"
//   npx tsx server/src/scripts/evalExtraction.ts                 # read and score
//   npx tsx server/src/scripts/evalExtraction.ts --record        # keep the answers
//   npx tsx server/src/scripts/evalExtraction.ts --replay        # score again, free
//   npx tsx server/src/scripts/evalExtraction.ts --model claude-sonnet-5
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { aiProvider, resetAiProvider } from '../ai/index.js';
import { RecordedProvider, recordingKey } from '../ai/recorded.js';
import { classifyPrompt, extractPrompt } from '../modules/extraction/prompts.js';
import { Classification, EXTRACTION_SCHEMAS, isExtractable, type ExtractableType } from '../../../src/shared/contracts/extraction.js';
import { scoreFields, summarise, scoreAll, verdictOf, type FieldScore, type ScoreSummary } from '../../../src/shared/calc/evalScore.js';
import type { ZodType } from 'zod';

interface Args { record: boolean; replay: boolean; model?: string; dir: string; out: string; showValues: boolean; only?: string }

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    record: argv.includes('--record'),
    replay: argv.includes('--replay'),
    showValues: argv.includes('--show-values'),
    model: get('--model'),
    only: get('--only'),
    dir: get('--docs') ?? 'eval-docs',
    out: get('--out') ?? 'eval-results',
  };
}

const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

interface Case { name: string; file: string; mimeType: string; expectedType: string; expectedFields: Record<string, unknown> }

function loadCases(dir: string, only?: string): Case[] {
  if (!fs.existsSync(dir)) return [];
  const cases: Case[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const ext = path.extname(entry).toLowerCase();
    if (!MIME[ext]) continue;
    const name = path.basename(entry, ext);
    if (only && !name.includes(only)) continue;
    const expectedPath = path.join(dir, `${name}.expected.json`);
    if (!fs.existsSync(expectedPath)) {
      console.log(`  ${name}: no ${name}.expected.json beside it — skipped`);
      continue;
    }
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8')) as { type: string; fields: Record<string, unknown> };
    cases.push({ name, file: path.join(dir, entry), mimeType: MIME[ext], expectedType: expected.type, expectedFields: expected.fields ?? {} });
  }
  return cases.sort((a, b) => a.name.localeCompare(b.name));
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function line(label: string, s: ScoreSummary, extra = '') {
  console.log(
    `  ${label.padEnd(28)} read ${pct(s.recall).padStart(6)}  right ${pct(s.precision).padStart(6)}  ` +
    `guessed ${String(s.extra).padStart(3)}  wrong ${String(s.wrong).padStart(3)}  missed ${String(s.missed).padStart(3)}  ${extra}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.model) process.env.AI_MODEL = args.model;
  if (args.replay) process.env.AI_PROVIDER = 'recorded';
  process.env.AI_RECORDINGS_DIR = process.env.AI_RECORDINGS_DIR ?? path.join(args.out, 'recordings');
  resetAiProvider();

  const provider = aiProvider('extraction');
  if (!provider.isConfigured()) {
    console.error(`\n${provider.name} is not configured. Set ANTHROPIC_API_KEY (or run with --replay against recorded answers).\n`);
    process.exit(2);
  }

  const cases = loadCases(args.dir, args.only);
  if (!cases.length) {
    console.log(`\nNo documents to score in ${args.dir}/.`);
    console.log('Put the real PDFs there (the folder is never committed) with a <name>.expected.json beside each one.\n');
    process.exit(1);
  }

  console.log(`\nReading ${cases.length} document(s) with ${provider.name} · ${provider.model}${args.replay ? ' (replaying recorded answers)' : ''}\n`);
  const recorder = args.record ? new RecordedProvider(process.env.AI_RECORDINGS_DIR!) : null;

  const perType = new Map<string, FieldScore[][]>();
  const rows: { name: string; type: string; classified: string; summary: ScoreSummary; ms: number; inTok: number; outTok: number; error?: string }[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalMs = 0;

  for (const c of cases) {
    const file = { fileName: path.basename(c.file), mimeType: c.mimeType, data: fs.readFileSync(c.file) };
    try {
      const cls = classifyPrompt();
      const classified = await provider.extract({ task: 'classify', instructions: cls.instructions, question: cls.question, schema: Classification, files: [file], maxTokens: 1000 });
      if (recorder) recorder.write(recordingKey('classify', cls.question, [file]), { task: 'classify', model: classified.model, data: classified.data, usage: classified.usage });

      const type = classified.data.type;
      let scores: FieldScore[] = [];
      let ms = classified.latencyMs;
      let inTok = classified.usage.inputTokens;
      let outTok = classified.usage.outputTokens;

      if (type !== c.expectedType) {
        scores = [{ path: 'type', verdict: 'wrong', expectedEmpty: false }];
      } else if (isExtractable(type)) {
        const ex = extractPrompt(type as ExtractableType);
        const schema = EXTRACTION_SCHEMAS[type as ExtractableType] as unknown as ZodType<Record<string, unknown>>;
        const out = await provider.extract({ task: `extract:${type}`, instructions: ex.instructions, question: ex.question, schema, files: [file], maxTokens: 8000 });
        if (recorder) recorder.write(recordingKey(`extract:${type}`, ex.question, [file]), { task: `extract:${type}`, model: out.model, data: out.data, usage: out.usage });
        scores = scoreFields(c.expectedFields, out.data);
        ms += out.latencyMs; inTok += out.usage.inputTokens; outTok += out.usage.outputTokens;
        if (args.showValues) console.log(`  [${c.name}] ${JSON.stringify(out.data)}`);
      }

      const summary = summarise(scores);
      rows.push({ name: c.name, type: c.expectedType, classified: type, summary, ms, inTok, outTok });
      perType.set(c.expectedType, [...(perType.get(c.expectedType) ?? []), scores]);
      totalIn += inTok; totalOut += outTok; totalMs += ms;
      const wrongPaths = scores.filter(s => s.verdict === 'wrong' || s.verdict === 'extra').map(s => `${s.path}(${s.verdict})`);
      line(c.name, summary, `${(ms / 1000).toFixed(1)}s`);
      if (wrongPaths.length) console.log(`      ${wrongPaths.join(', ')}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({ name: c.name, type: c.expectedType, classified: '-', summary: summarise([]), ms: 0, inTok: 0, outTok: 0, error: message });
      console.log(`  ${c.name.padEnd(28)} could not be read: ${message}`);
    }
  }

  console.log('\nBy kind of document');
  for (const [type, scores] of perType) line(type, scoreAll(scores));

  const overall = scoreAll([...perType.values()].flat());
  console.log('\nOverall');
  line('all documents', overall, `${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  tokens: ${totalIn.toLocaleString('en-IN')} in, ${totalOut.toLocaleString('en-IN')} out over ${cases.length} document(s)`);
  console.log(`  verdict: ${verdictOf(overall).toUpperCase()}${overall.extra ? '  (it guessed — that must be zero)' : ''}\n`);

  fs.mkdirSync(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(args.out, `${provider.name}-${provider.model}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    provider: provider.name, model: provider.model, at: new Date().toISOString(),
    documents: rows.map(r => ({ ...r, summary: r.summary })), byType: Object.fromEntries([...perType].map(([t, s]) => [t, scoreAll(s)])),
    overall, tokens: { input: totalIn, output: totalOut }, totalMs,
  }, null, 2));
  console.log(`Written to ${file} (field names and counts only — no document contents)\n`);
  process.exit(overall.extra > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
