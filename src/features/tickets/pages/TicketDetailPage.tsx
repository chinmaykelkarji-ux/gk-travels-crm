import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, XCircle } from 'lucide-react';
import { PageHeader, KeyValue, Money, Drawer, EmptyState, Field, TextInput, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDateTime } from '@/shared/utils/date';
import { SegmentInput, type TicketCancel } from '@/shared/contracts/tickets';
import { ApiError } from '@/lib/api';
import { ticketsApi } from '../api';
import { useTicket, useTicketMutation } from '../hooks';
import { PassengerGrid } from '../components/PassengerGrid';
import { SegmentFields, EMPTY_SEGMENT, type SegmentDraft } from '../components/SegmentFields';
import { TicketStatusPill } from '../components/TicketStatusPill';

export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useTicket(id);
  const [addingLeg, setAddingLeg] = useState(false);
  const [leg, setLeg] = useState<SegmentDraft>({ ...EMPTY_SEGMENT });
  const [legErrors, setLegErrors] = useState<Record<string, string>>({});
  const [newPax, setNewPax] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const addLeg = useTicketMutation((b: SegmentInput) => ticketsApi.addSegment(id, b));
  const addPax = useTicketMutation((names: string[]) => ticketsApi.addPassengers(id, names.map(name => ({ name, paxType: 'ADULT' as const, travellerId: null, boardingPoint: null }))));
  const cancel = useTicketMutation((b: TicketCancel) => ticketsApi.cancel(id, b));

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Ticket not found' : 'Could not load ticket'} description={e.message} action={<Button variant="outline" size="sm" onClick={() => navigate('/tickets')}>Back</Button>} /></div>; }
  const t = q.data;
  const canWrite = can('operations:write') && t.status !== 'CANCELLED';

  function saveLeg() {
    const parsed = SegmentInput.safeParse(leg);
    if (!parsed.success) { setLegErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    addLeg.mutate(parsed.data, { onSuccess: () => { toast.success('Leg added'); setAddingLeg(false); setLeg({ ...EMPTY_SEGMENT }); }, onError: e => toast.error('Could not add', (e as ApiError).summary) });
  }

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title={`${t.displayNumber} · ${t.route}`} subtitle={[t.mode.toLowerCase(), t.pnr && `PNR ${t.pnr}`, t.carrier, t.quota?.replace('_', ' ').toLowerCase()].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Tickets', to: '/tickets' }, { label: t.displayNumber ?? t.id }]}
        badge={<><TicketStatusPill status={t.status} />{t.chartPrepared && <StatusPill tone="info">chart prepared</StatusPill>}</>}
        actions={canWrite && <Button size="sm" variant="outline" className="text-red-600" onClick={() => setCancelling(true)}><XCircle className="w-4 h-4 mr-1.5" />Cancel ticket</Button>} />
      <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <PassengerGrid ticket={t} canWrite={canWrite} />
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {!addingLeg && t.segments.length < 8 && <Button size="sm" variant="outline" onClick={() => { const last = t.segments[t.segments.length - 1]; setLeg({ ...EMPTY_SEGMENT, fromName: last?.toName ?? '', fromCode: last?.toCode ?? '' }); setAddingLeg(true); }}><Plus className="w-4 h-4 mr-1.5" />Leg</Button>}
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const names = newPax.split(',').map(s => s.trim()).filter(Boolean); if (names.length) addPax.mutate(names, { onSuccess: () => { setNewPax(''); toast.success('Passenger added'); }, onError: er => toast.error('Could not add', (er as ApiError).message) }); }}>
                <TextInput aria-label="Add passengers" placeholder="Add passenger (names, comma separated)" value={newPax} onChange={e => setNewPax(e.target.value)} className="w-72" />
                <Button size="sm" type="submit" variant="outline" loading={addPax.isPending}>Add</Button>
              </form>
            </div>
          )}
          {addingLeg && (
            <div className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
              <SegmentFields mode={t.mode} idPrefix="newleg" value={leg} onChange={setLeg} errors={legErrors} />
              <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAddingLeg(false)}>Cancel</Button><Button size="sm" onClick={saveLeg} loading={addLeg.isPending}>Add leg</Button></div>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-md p-4">
            <h2 className="text-sm font-medium text-slate-800 mb-3">Fare</h2>
            <KeyValue columns={1} items={[
              { label: 'Base fare', value: <Money value={t.fare.baseFare} paise /> }, { label: 'Taxes', value: <Money value={t.fare.taxes} paise /> },
              { label: 'Other charges', value: <Money value={t.fare.otherCharges} paise /> },
              ...(t.fare.serviceFee !== null ? [{ label: 'Service fee', value: <span><Money value={t.fare.serviceFee} paise /> + GST {t.fare.serviceFeeGstPct}% <Money value={t.fare.serviceFeeGst} paise /></span> }, { label: 'Our cost', value: <Money value={t.fare.costAmount} paise /> }] : []),
              { label: 'Customer pays', value: <strong><Money value={t.fare.totalFare} paise /></strong> },
            ]} />
          </section>
          <section className="bg-white border border-slate-200 rounded-md p-4">
            <KeyValue columns={1} items={[
              { label: 'Trip', value: t.tripId ? <Link className="text-indigo-600 hover:underline" to={`/trips/${t.tripId}`}>{t.tripId} · {t.trip?.destination}</Link> : null },
              { label: 'Customer', value: t.customer ? <Link className="text-indigo-600 hover:underline" to={`/customers/${t.customer.id}`}>{t.customer.name}</Link> : null },
              { label: 'Booked through', value: t.vendor?.name ?? null }, { label: 'Booking ref', value: t.bookingRef },
              { label: 'Chart checked', value: t.chartCheckedAt ? fmtDateTime(t.chartCheckedAt) : null },
              { label: 'Cancelled', value: t.cancelReason ? `${t.cancelReason}` : null },
              { label: 'Internal notes', value: t.internalNotes }, { label: 'Classic booking', value: t.legacyBookingId },
            ]} />
          </section>
          {t.activity && t.activity.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-md p-4"><h2 className="text-sm font-medium text-slate-800 mb-2">History</h2>
              <ul className="space-y-1.5">{t.activity.slice(0, 15).map(a => <li key={a.id} className="text-xs text-slate-600"><span className="text-slate-400">{fmtDateTime(a.timestamp)}</span> · {a.description}</li>)}</ul>
            </section>
          )}
        </aside>
      </div>
      <Drawer open={cancelling} onOpenChange={setCancelling} title="Cancel the whole ticket?" width="md"
        footer={<><Button variant="outline" onClick={() => setCancelling(false)}>Keep</Button><Button className="bg-red-600 hover:bg-red-700" disabled={reason.trim().length < 3} loading={cancel.isPending}
          onClick={() => cancel.mutate({ reason }, { onSuccess: () => { toast.success('Ticket cancelled'); setCancelling(false); }, onError: e => toast.error('Could not cancel', (e as ApiError).message) })}>Cancel ticket</Button></>}>
        <p className="text-sm text-slate-600 mb-3">Every passenger on every leg is marked cancelled. To cancel only some passengers, set their status on the passenger rows.</p>
        <Field label="Reason" htmlFor="tc-reason" required><TextInput id="tc-reason" value={reason} onChange={e => setReason(e.target.value)} /></Field>
      </Drawer>
    </div>
  );
}
