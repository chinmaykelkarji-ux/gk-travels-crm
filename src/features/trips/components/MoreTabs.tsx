import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileUp, Plus } from 'lucide-react';
import { Drawer, EmptyState, Money, Select } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { fmtDateTime } from '@/shared/utils/date';
import { ApiError } from '@/lib/api';
import { TicketForm } from '@/features/tickets/components/TicketForm';
import { TicketStatusPill } from '@/features/tickets/components/TicketStatusPill';
import { ticketsApi } from '@/features/tickets/api';
import type { TicketInput } from '@/shared/contracts/tickets';
import { tripsApi, type TripWorkspace } from '../api';
import { useTripMutation, tripKeys } from '../hooks';
import { useQueryClient } from '@tanstack/react-query';

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

const DOC_TYPES = ['OTHER', 'FLIGHT_TICKET', 'TRAIN_TICKET', 'BUS_TICKET', 'HOTEL_CONFIRMATION', 'ACTIVITY_VOUCHER', 'VEHICLE_VOUCHER', 'SUPPLIER_INVOICE', 'PAYMENT_RECEIPT', 'INSURANCE', 'VISA'];

/** Trip documents: private storage, presigned upload, short-lived download links. */
export function DocumentsTab({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const [type, setType] = useState('OTHER');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const reg = await tripsApi.registerDocument({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, type, links: [{ entityType: 'trip', entityId: ws.trip.id }] });
      const put = await fetch(reg.upload.url, { method: 'PUT', headers: reg.upload.headers, body: file, credentials: 'include' });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await tripsApi.completeDocument(reg.document.id);
      toast.success('Document uploaded', file.name);
      void qc.invalidateQueries({ queryKey: tripKeys.detail(ws.trip.id) });
    } catch (e) {
      toast.error('Upload failed', e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function download(id: string) {
    try { const l = await tripsApi.downloadDocument(id); window.open(l.url, '_blank', 'noopener'); }
    catch (e) { toast.error('Could not open', (e as ApiError).message); }
  }
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select aria-label="Document type" className="w-auto" value={type} onChange={e => setType(e.target.value)}>{DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>)}</Select>
          <input ref={input} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.docx,.xlsx,.csv" onChange={e => void upload(e.target.files?.[0])} />
          <Button size="sm" loading={busy} onClick={() => input.current?.click()}><FileUp className="w-4 h-4 mr-1.5" />Upload</Button>
        </div>
      )}
      {ws.documents.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="No documents on this trip" description="Tickets, hotel vouchers, supplier invoices — kept private, opened with short-lived links." /></div> : (
        <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{ws.documents.map(d => (
          <li key={d.linkId} className="p-3 flex items-center justify-between gap-2 text-sm">
            <div><div className="text-slate-900">{d.title}</div><div className="text-xs text-slate-500">{d.type.replace(/_/g, ' ').toLowerCase()} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB · {fmtDateTime(d.createdAt)}{d.status === 'PENDING_UPLOAD' ? ' · upload not finished' : ''}</div></div>
            {d.status !== 'PENDING_UPLOAD' && <button type="button" onClick={() => void download(d.id)} className="inline-flex items-center gap-1 text-xs text-indigo-600"><Download className="w-3.5 h-3.5" />Open</button>}
          </li>
        ))}</ul>
      )}
    </div>
  );
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
