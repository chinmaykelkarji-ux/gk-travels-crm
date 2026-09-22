import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { EmptyState, PageHeader, StatusPill } from '@/design-system';
import { aiApi } from '@/features/ai/api';
import { DOCUMENT_TYPE_LABEL } from '@/shared/contracts/documents';
import { EXTRACTION_STATUS_LABEL } from '@/shared/contracts/extraction';
import { usePendingReviews } from '../hooks';
import { ReviewPanel } from '../components/ReviewPanel';

const TONE = { QUEUED: 'neutral', READING: 'info', READY: 'warning', FAILED: 'danger' } as const;

/** Everything a document has said, waiting for a person to agree with it. */
export default function ReviewPage() {
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status });
  const pending = usePendingReviews();
  const [open, setOpen] = useState<string | null>(null);

  const items = pending.data?.items ?? [];
  useEffect(() => {
    if (open && !items.some(x => x.id === open)) setOpen(null);
    if (!open && items.length) setOpen(items.find(x => x.status === 'READY')?.id ?? items[0].id);
  }, [items, open]);
  const current = items.find(x => x.id === open) ?? null;

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Documents to check" subtitle="What each document said, beside the document itself — nothing is saved until you agree with it"
        actions={<Link to="/documents" className="text-xs text-slate-500 hover:text-slate-800">All documents</Link>} />

      <div className="px-5 py-4 space-y-4">
        {status.data && !status.data.extraction.configured && (
          <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Reading documents is <strong>not configured</strong> on this server. {status.data.extraction.hint}{' '}
            <Link className="text-indigo-700 hover:underline" to="/settings/ai">Document intelligence</Link>
          </div>
        )}

        {pending.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {pending.data && items.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-md">
            <EmptyState title="Nothing to check" description="Send a document to be read from the document centre, or from the trip it belongs to." />
          </div>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
            <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 h-fit">
              {items.map(x => (
                <li key={x.id}>
                  <button type="button" onClick={() => setOpen(x.id)}
                    className={`w-full text-left px-3 py-2.5 ${open === x.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />{x.document?.title ?? x.documentId}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={TONE[x.status as keyof typeof TONE] ?? 'neutral'}>{EXTRACTION_STATUS_LABEL[x.status]}</StatusPill>
                      {x.kind && <span className="text-[11px] text-slate-500">{DOCUMENT_TYPE_LABEL[x.kind]}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="bg-white border border-slate-200 rounded-md p-4">
              {current ? <ReviewPanel extraction={current} onDone={() => setOpen(null)} /> : <p className="text-sm text-slate-500">Choose a document on the left.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
