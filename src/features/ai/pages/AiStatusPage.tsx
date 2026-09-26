import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { EmptyState, PageHeader, StatusPill } from '@/design-system';
import type { ApiError } from '@/lib/api';
import { aiApi, type AiFeatureStatus } from '../api';

function Row({ title, what, s }: { title: string; what: string; s: AiFeatureStatus }) {
  return (
    <li className="p-4 flex flex-wrap items-start gap-3">
      <span className={`mt-0.5 ${s.configured ? 'text-emerald-600' : 'text-slate-400'}`}>
        {s.configured ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{title}</span>
          {s.configured
            ? <StatusPill tone="success">{s.provider} · {s.model}</StatusPill>
            : <StatusPill tone="neutral">Not configured</StatusPill>}
        </div>
        <p className="text-sm text-slate-600 mt-0.5">{what}</p>
        {s.hint && <p className="text-xs text-slate-500 mt-1">{s.hint}</p>}
      </div>
    </li>
  );
}

/** What the machine can and cannot do today — no guessing, on either side. */
export default function AiStatusPage() {
  const q = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status });

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Document intelligence" subtitle="What TravelOS can read and write for you, and what is still switched off" />
      <div className="px-5 py-4 space-y-4 max-w-3xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not read the status" description={(q.error as ApiError).message} />}
        {q.data && (
          <>
            <section className="bg-white border border-slate-200 rounded-md">
              <ul className="divide-y divide-slate-100">
                <Row title="Reading documents" s={q.data.extraction}
                  what="Tickets, hotel confirmations and supplier bills are read into fields for you to check. Nothing is saved until a person approves it." />
                <Row title="Wording" s={q.data.prose}
                  what="Itinerary text and message drafts, written over facts already in TravelOS — never invented." />
                <Row title="Copilot" s={q.data.copilot}
                  what="Answers staff questions from the same screens they could open themselves. It only looks; it never changes anything on its own." />
                <Row title="Document storage" s={{ provider: 'storage', model: 'files', configured: q.data.storage.configured, hint: q.data.storage.hint }}
                  what="Where the original file is kept. Documents with identity numbers stay in the private bucket, behind short-lived links." />
              </ul>
            </section>

            <p className="text-sm text-slate-600">
              {q.data.ready
                ? 'Documents uploaded to a trip, a customer or a supplier can be read and proposed for approval.'
                : 'Until the missing pieces above are set on the server, documents can still be uploaded and kept — only the reading is switched off.'}
            </p>
            <p className="text-xs text-slate-500">
              Keys are set on the server, never in TravelOS, and are never shown on this page. A change takes effect on the next deploy.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
