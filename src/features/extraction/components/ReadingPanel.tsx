import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { aiApi } from '@/features/ai/api';
import { EXTRACTION_STATUS_LABEL, isExtractable } from '@/shared/contracts/extraction';
import { extractionApi } from '../api';
import { useExtractionMutation, useExtractionsFor } from '../hooks';

const TONE = { QUEUED: 'neutral', READING: 'info', READY: 'warning', APPLIED: 'success', REJECTED: 'neutral', FAILED: 'danger' } as const;

/**
 * Reading a document is offered only when it is actually configured; when it
 * is not, the panel says so instead of showing a button that would fail.
 */
export function ReadingPanel({ documentId, documentType }: { documentId: string; documentType?: string }) {
  const { can } = usePermissions();
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status, staleTime: 60_000 });
  const list = useExtractionsFor(documentId);
  const read = useExtractionMutation(() => extractionApi.read(documentId));

  const items = list.data?.items ?? [];
  const latest = items[0];
  const busy = latest?.status === 'QUEUED' || latest?.status === 'READING';
  const ready = latest?.status === 'READY';

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1"><ScanLine className="w-3.5 h-3.5" />Reading</h3>

      {status.data && !status.data.extraction.configured ? (
        <p className="text-sm text-slate-600">
          Not configured on this server. <Link className="text-indigo-700 hover:underline" to="/settings/ai">Document intelligence</Link>
        </p>
      ) : (
        <div className="space-y-2">
          {latest ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill tone={TONE[latest.status] ?? 'neutral'}>{EXTRACTION_STATUS_LABEL[latest.status]}</StatusPill>
              {latest.kind && <span className="text-slate-600">read as {latest.kind.replace(/_/g, ' ').toLowerCase()}</span>}
              {latest.status === 'APPLIED' && latest.appliedId && (
                <span className="text-slate-600">· saved as {latest.appliedKind?.replace(/_/g, ' ')} {latest.appliedId}</span>
              )}
              {latest.error && <span className="text-red-600">{latest.error}</span>}
              {ready && <Link className="text-indigo-700 hover:underline" to="/documents/review">Check it</Link>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {documentType && !isExtractable(documentType)
                ? 'TravelOS reads tickets, hotel confirmations and supplier bills. This one is kept as it is.'
                : 'Not read yet.'}
            </p>
          )}

          {can('documents:write') && !busy && (
            <Button size="sm" variant="outline" loading={read.isPending}
              onClick={() => read.mutate(undefined, {
                onSuccess: () => toast.success('Sent to be read', 'It takes a few seconds; you will check it before anything is saved.'),
                onError: e => toast.error('Could not start', (e as ApiError).message),
              })}>
              <ScanLine className="w-3.5 h-3.5 mr-1" />{latest ? 'Read it again' : 'Read it'}
            </Button>
          )}
          {busy && <p className="text-xs text-slate-500">Being read… this page will catch up on its own.</p>}
        </div>
      )}
    </section>
  );
}
