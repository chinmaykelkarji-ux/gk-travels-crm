import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Drawer, EmptyState, Money } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { fmtDateTime } from '@/shared/utils/date';
import { ApiError } from '@/lib/api';
import { TicketForm } from '@/features/tickets/components/TicketForm';
import { TicketStatusPill } from '@/features/tickets/components/TicketStatusPill';
import { ticketsApi } from '@/features/tickets/api';
import type { TicketInput } from '@/shared/contracts/tickets';
import { DocumentsPanel } from '@/features/documents/components/DocumentsPanel';
import { type TripWorkspace } from '../api';
import { useTripMutation } from '../hooks';

export function TicketsTab({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const [creating, setCreating] = useState(false);
  const create = useTripMutation((b: TicketInput) => ticketsApi.create(b));
  return (
    <div className="space-y-3">
      {canWrite && <div className="flex justify-end"><Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Ticket</Button></div>}
      {ws.tickets.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="No tickets on this trip yet" /></div> : (
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{ws.tickets.map(t => (
          <Link key={t.id} to={`/tickets/${t.id}`} className="p-4 flex flex-wrap items-start justify-between gap-3 hover:bg-slate-50">
            <div><div className="font-medium text-slate-900">{t.route} <TicketStatusPill status={t.status} /></div>
              <div className="text-sm text-slate-600">{t.mode.toLowerCase()}{t.pnr ? ` · PNR ${t.pnr}` : ''}{t.carrier ? ` · ${t.carrier}` : ''} · {t.departLocal?.replace('T', ' ') ?? 'date not set'} · {t.paxCount} pax</div></div>
            <div className="text-sm"><Money value={t.fare.totalFare} /></div>
          </Link>
        ))}</div>
      )}
      <Drawer open={creating} onOpenChange={o => { setCreating(o); if (!o) create.reset(); }} title="New ticket" width="xl">
        {creating && <TicketForm tripId={ws.trip.id} submitting={create.isPending} error={create.error as ApiError | null} onCancel={() => setCreating(false)}
          onSubmit={b => create.mutate(b, { onSuccess: () => { toast.success('Ticket saved'); setCreating(false); } })} />}
      </Drawer>
    </div>
  );
}


/**
 * The trip's documents, kept by the document centre so a ticket looks the
 * same here and there: versions, expiry dates and the identity rules included.
 */
export function DocumentsTab({ ws }: { ws: TripWorkspace; canWrite?: boolean }) {
  return <DocumentsPanel entityType="trip" entityId={ws.trip.id} title="Documents on this trip" linkRole="TRIP" />;
}

export function TimelineTab({ ws }: { ws: TripWorkspace }) {
  return ws.timeline.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="Nothing recorded yet" /></div> : (
    <ol className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{ws.timeline.map(e => (
      <li key={e.id} className="px-4 py-2 text-sm flex gap-3">
        <span className="text-xs text-slate-400 w-36 flex-shrink-0">{fmtDateTime(e.timestamp)}</span>
        <span className="text-slate-700">{e.description}{e.source !== 'HUMAN' && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">{e.source.toLowerCase()}</span>}</span>
      </li>
    ))}</ol>
  );
}
