import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import type { ApiError } from '@/lib/api';
import type { CopilotProposal } from '@/shared/contracts/copilot';
import { useDecide } from '../hooks';

type Change = { field: string; from: string | null; to: string };

/** What the proposal would do, in the shape a person checks it. */
function Preview({ p, text, setText, editable }: { p: CopilotProposal; text: string; setText: (v: string) => void; editable: boolean }) {
  const v = p.preview as Record<string, unknown>;
  if (p.tool === 'draft_message') {
    const m = v.message as { to: string; channel: string; subject: string | null };
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-slate-500">{m.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} to {m.to}{m.subject ? ` · ${m.subject}` : ''}</p>
        {editable
          ? <textarea aria-label="Message wording" value={text} onChange={e => setText(e.target.value)} rows={4}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          : <p className="text-sm whitespace-pre-wrap text-slate-800">{text}</p>}
        {typeof v.canOpen === 'string' && <p className="text-xs text-amber-800">{v.canOpen}</p>}
      </div>
    );
  }
  if (p.tool === 'propose_trip_update') {
    return (
      <ul className="text-sm space-y-0.5">
        {(v.changes as Change[]).map(c => (
          <li key={c.field} className="break-words"><span className="text-slate-500">{c.field}:</span> {c.from ? <><s className="text-slate-400">{c.from}</s> → </> : null}{c.to}</li>
        ))}
      </ul>
    );
  }
  const t = (v.task ?? v.followUp) as Record<string, string | null> | undefined;
  if (!t) return null;
  const rows = p.tool === 'create_followup'
    ? [['Enquiry', `${t.enquiry} · ${t.customer} · ${t.destination}`], ['Due', t.dueDate], ['Note', t.note]]
    : [['Task', t.title], ['Due', t.due], ['Priority', t.priority], ['Trip', t.tripId], ['Details', t.details]];
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
      {rows.filter(([, val]) => val).map(([k, val]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-800 break-words">{val}</dd></Fragment>)}
    </dl>
  );
}

/** A proposal from the copilot. Nothing is saved until the person presses Approve. */
export function ProposalCard({ p }: { p: CopilotProposal }) {
  const decide = useDecide();
  const original = (p.input.text as string | undefined) ?? '';
  // An approved message shows the wording the person actually approved.
  const approvedText = (p.result as { editedInput?: { text?: string } } | null)?.editedInput?.text;
  const [text, setText] = useState(approvedText ?? original);
  const open = p.status === 'PROPOSED';
  const busy = decide.isPending || p.status === 'APPROVING';

  return (
    <div className={`mt-2 rounded-md border px-3 py-2.5 ${open ? 'border-amber-300 bg-amber-50/60' : p.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
        {open ? 'Proposed — not saved' : p.status === 'APPROVED' ? 'Approved' : p.status === 'REJECTED' ? 'Rejected' : 'Saving…'}
      </p>
      <p className="text-sm font-medium text-slate-900 mb-1.5 break-words">{p.summary}</p>
      <Preview p={p} text={open ? text : approvedText ?? original} setText={setText} editable={open} />

      {open && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy || (p.tool === 'draft_message' && text.trim().length < 2)}
            onClick={() => decide.mutate({ id: p.id, approve: true, text: p.tool === 'draft_message' && text !== original ? text : undefined })}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide.mutate({ id: p.id, approve: false })}>
            <X className="w-4 h-4 mr-1" />Reject
          </Button>
          {p.tool === 'draft_message' && <span className="text-xs text-slate-500">Approving does not send it.</span>}
        </div>
      )}
      {decide.isError && <p role="alert" className="mt-1.5 text-sm text-red-700">{(decide.error as ApiError).message}</p>}

      {p.status === 'APPROVED' && p.result && (
        <p className="mt-2 text-sm">
          {p.result.external
            ? (p.result.link
              ? <a href={p.result.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 underline">Open in {p.tool === 'draft_message' && (p.preview.message as { channel: string }).channel === 'email' ? 'mail' : 'WhatsApp'} to send it yourself<ExternalLink className="w-3.5 h-3.5" /></a>
              : <span className="text-amber-800">No contact on file — copy the wording above.</span>)
            : p.result.link && <Link to={p.result.link} className="text-sky-700 underline">Open {p.result.label}</Link>}
        </p>
      )}
    </div>
  );
}
