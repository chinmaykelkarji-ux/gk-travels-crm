import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Drawer, EmptyState, Money, StatusPill, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { fmtDate } from '@/shared/utils/date';
import { receiptsApi, type Receipt } from '../api';
import { useReceipts, useReceiptMutation } from '../hooks';
import { ReceiptForm } from './ReceiptForm';

/** The money trail for one booking or trip, with the buttons to add to it. */
export function ReceiptsPanel({ contractId, tripId, customerId, who }: { contractId?: string; tripId?: string; customerId?: string | null; who?: string }) {
  const { can } = usePermissions();
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<Receipt | null>(null);
  const [reason, setReason] = useState('');
  const q = useReceipts({ contractId, tripId, includeCancelled: true }, can('payments:read'));
  const cancel = useReceiptMutation((id: string) => receiptsApi.cancel(id, reason));
  if (!can('payments:read')) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-md">
      <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-slate-800">Receipts</h2>
          {q.data && <p className="text-xs text-slate-500">Received <Money value={q.data.totals.received} paise />{q.data.totals.refunded > 0 && <> · refunded <Money value={q.data.totals.refunded} paise /></>} · net <Money value={q.data.totals.net} paise /></p>}
        </div>
        {can('payments:write') && <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" />Record money</Button>}
      </header>
      {q.isPending ? <p className="p-4 text-sm text-slate-500">Loading…</p>
        : (q.data?.items.length ?? 0) === 0 ? <EmptyState compact title="Nothing received yet" description={can('payments:write') ? 'Record the advance when it comes in.' : undefined} />
        : (
          <ul className="divide-y divide-slate-100">
            {q.data!.items.map(r => (
              <li key={r.id} className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm ${r.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                <div>
                  <div className="text-slate-900">
                    {r.id} · {r.modeLabel}{r.reference ? ` · ${r.reference}` : ''}
                    {r.kind === 'REFUND' && <StatusPill tone="warning" className="ml-2">refund</StatusPill>}
                    {r.status === 'CANCELLED' && <StatusPill tone="neutral" className="ml-2">cancelled</StatusPill>}
                    {r.legacyPaymentId && <span className="ml-2 text-[11px] text-slate-400">from the classic screen</span>}
                  </div>
                  <div className="text-xs text-slate-500">{fmtDate(r.receivedAt)}{r.notes ? ` · ${r.notes}` : ''}{r.cancelReason ? ` · ${r.cancelReason}` : ''}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Money value={r.kind === 'REFUND' ? -r.amount : r.amount} paise />
                  {can('payments:write') && r.status === 'POSTED' && <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => { setCancelling(r); setReason(''); }}>Cancel</button>}
                </div>
              </li>
            ))}
          </ul>
        )}

      <Drawer open={adding} onOpenChange={setAdding} title="Record money">
        {adding && <ReceiptForm contractId={contractId} tripId={tripId} customerId={customerId} who={who} onDone={() => setAdding(false)} />}
      </Drawer>
      <Drawer open={!!cancelling} onOpenChange={o => { if (!o) { setCancelling(null); cancel.reset(); } }} title={cancelling ? `Cancel ${cancelling.id}` : ''}>
        {cancelling && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">The receipt stays in the records and its entry in the books is reversed, so nothing disappears.</p>
            <TextInput placeholder="Why is it being cancelled?" value={reason} onChange={e => setReason(e.target.value)} />
            {cancel.error && <p className="text-sm text-red-600">{(cancel.error as ApiError).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelling(null)}>Back</Button>
              <Button variant="destructive" loading={cancel.isPending} disabled={reason.trim().length < 3}
                onClick={() => cancel.mutate(cancelling.id, { onSuccess: () => { toast.success('Receipt cancelled'); setCancelling(null); } })}>Cancel the receipt</Button>
            </div>
          </div>
        )}
      </Drawer>
    </section>
  );
}
