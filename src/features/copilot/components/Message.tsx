import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import type { CopilotMessage } from '@/shared/contracts/copilot';
import { AnswerText } from './AnswerText';
import { ProposalCard } from './ProposalCard';

/** What it looked at, under the answer — so every figure can be checked on its own screen. */
function Looked({ looked }: { looked: Extract<CopilotMessage, { role: 'assistant' }>['looked'] }) {
  const [open, setOpen] = useState(false);
  if (!looked.length) return <p className="mt-2 text-xs text-slate-400">Answered without looking anything up.</p>;
  const refused = looked.filter(l => !l.ok).length;
  return (
    <div className="mt-2 border-t border-slate-100 pt-1.5">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Looked at {looked.length} thing{looked.length === 1 ? '' : 's'}{refused ? ` · ${refused} not available` : ''}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {looked.map((l, i) => (
            <li key={i} className={`flex items-start gap-1.5 text-xs ${l.ok ? 'text-slate-600' : 'text-amber-800'}`}>
              {l.ok ? <Eye className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 mt-px shrink-0" />}
              <span className="min-w-0">{l.label}{!l.ok && l.note ? ` — ${l.note}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Message({ m }: { m: CopilotMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-slate-900 text-white px-3.5 py-2 text-sm whitespace-pre-wrap break-words">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] sm:max-w-[85%] rounded-lg bg-white border border-slate-200 px-3.5 py-2.5">
        <AnswerText text={m.text} />
        {m.looked.filter(l => l.proposal).map(l => <ProposalCard key={l.proposal!.id} p={l.proposal!} />)}
        <Looked looked={m.looked} />
      </div>
    </div>
  );
}
