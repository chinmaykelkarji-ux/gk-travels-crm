import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Ids the copilot mentions become links to the screen they came from, so a
// person can check the answer against the record in one tap.
const ID = /\b(GK-\d{4}-\d{4}|CUS-\d{4}-\d{4})\b/g;
const BOLD = /\*\*([^*]+)\*\*/g;

function linkIds(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(ID)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const to = m[1].startsWith('GK-') ? `/trips/${m[1]}` : `/customers/${m[1]}`;
    out.push(<Link key={`${key}-${at}`} to={to} className="text-sky-700 underline underline-offset-2 hover:text-sky-900">{m[1]}</Link>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...linkIds(text.slice(last, at), `${key}-t${at}`));
    out.push(<strong key={`${key}-b${at}`} className="font-semibold">{linkIds(m[1], `${key}-bi${at}`)}</strong>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(...linkIds(text.slice(last), `${key}-e`));
  return out;
}

/** The model's short answer: paragraphs and simple lists, nothing more. */
export function AnswerText({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { blocks.push({ list: false, lines: [] }); continue; }
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    const prev = blocks[blocks.length - 1];
    if (item) {
      if (prev?.list) prev.lines.push(item[1]); else blocks.push({ list: true, lines: [item[1]] });
    } else if (prev && !prev.list && prev.lines.length) prev.lines.push(line.replace(/^#+\s*/, ''));
    else blocks.push({ list: false, lines: [line.replace(/^#+\s*/, '')] });
  }
  return (
    <div className="space-y-2 text-sm text-slate-800 leading-relaxed break-words">
      {blocks.filter(b => b.lines.length).map((b, i) => b.list
        ? <ul key={i} className="list-disc pl-5 space-y-0.5">{b.lines.map((l, j) => <li key={j}>{inline(l, `${i}-${j}`)}</li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${i}-${j}`)}</Fragment>)}</p>)}
    </div>
  );
}
