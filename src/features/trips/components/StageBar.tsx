import { useState } from 'react';
import { Check as CheckIcon, AlertTriangle, XCircle } from 'lucide-react';
import { Drawer, Field, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { STAGE_LABEL, type TripStage } from '@/shared/calc/tripStage';
import { ApiError } from '@/lib/api';
import { tripsApi, type TripWorkspace } from '../api';
import { useTripMutation } from '../hooks';

const FLOW: TripStage[] = ['PLANNING', 'CONFIRMING', 'READY', 'ONGOING', 'COMPLETED'];
const ACTION: Record<TripStage, string> = { PLANNING: 'Back to planning', CONFIRMING: 'Start confirming', READY: 'Mark ready', ONGOING: 'Start tour', COMPLETED: 'Complete tour', CANCELLED: 'Cancel trip' };

/** Stage stepper with the allowed moves; blocked moves show why. */
export function StageBar({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const stage = ws.trip.stage;
  const idx = FLOW.indexOf(stage);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const move = useTripMutation(({ to, reason: r }: { to: TripStage; reason?: string }) => tripsApi.stage(ws.trip.id, to, r ?? null));
  const go = (to: TripStage, r?: string) => move.mutate({ to, reason: r }, {
    onSuccess: () => { toast.success(`Trip is now ${STAGE_LABEL[to].toLowerCase()}`); setCancelOpen(false); setReason(''); },
    onError: e => toast.error('Not moved', (e as ApiError).message),
  });

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-3 space-y-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Trip stage">
        {stage === 'CANCELLED' ? <li className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200"><XCircle className="w-3.5 h-3.5" />Cancelled{ws.trip.cancelReason ? ` — ${ws.trip.cancelReason}` : ''}</li>
          : FLOW.map((s, i) => (
            <li key={s} className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${i < idx ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : i === idx ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
              {i < idx && <CheckIcon className="w-3.5 h-3.5" />}{STAGE_LABEL[s]}
            </li>
          ))}
      </ol>
      {canWrite && ws.readiness.transitions.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          {ws.readiness.transitions.map(t => t.to === 'CANCELLED' ? (
            <Button key={t.to} size="sm" variant="outline" className="text-red-600" onClick={() => setCancelOpen(true)}>{ACTION[t.to]}</Button>
          ) : (
            <div key={t.to} className="space-y-1">
              <Button size="sm" variant={FLOW.indexOf(t.to) > idx ? 'default' : 'outline'} disabled={!t.allowed} loading={move.isPending && move.variables?.to === t.to} onClick={() => go(t.to)}>{ACTION[t.to]}</Button>
              {!t.allowed && <ul className="text-xs text-red-700 space-y-0.5">{t.blockers.map(b => <li key={b.code} className="flex gap-1"><XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{b.message}{b.items?.length ? `: ${b.items.slice(0, 3).join(', ')}${b.items.length > 3 ? '…' : ''}` : ''}</li>)}</ul>}
              {t.allowed && t.warnings.length > 0 && <ul className="text-xs text-amber-700 space-y-0.5">{t.warnings.map(w => <li key={w.code} className="flex gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{w.message}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
      <Drawer open={cancelOpen} onOpenChange={setCancelOpen} width="md" title="Cancel this trip?"
        footer={<><Button variant="outline" onClick={() => setCancelOpen(false)}>Keep the trip</Button><Button className="bg-red-600 hover:bg-red-700" disabled={reason.trim().length < 3} loading={move.isPending} onClick={() => go('CANCELLED', reason)}>Cancel trip</Button></>}>
        <p className="text-sm text-slate-600 mb-3">Every open booking on the trip is cancelled with it. Supplier cancellations and refunds still need to be done with each supplier.</p>
        <Field label="Reason" htmlFor="tc-reason" required><TextInput id="tc-reason" value={reason} onChange={e => setReason(e.target.value)} /></Field>
      </Drawer>
    </div>
  );
}
