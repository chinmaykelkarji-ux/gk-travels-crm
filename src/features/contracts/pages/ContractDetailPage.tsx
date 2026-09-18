import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Trash2, Plus } from 'lucide-react';
import { PageHeader, KeyValue, Money, StatusPill, Drawer, DataTable, EmptyState, Field, TextInput, Select, Textarea, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate, fmtDateTime } from '@/shared/utils/date';
import { formatPhone } from '@/shared/calc/phone';
import { validateSchedule, type ScheduleItem } from '@/shared/calc/schedule';
import { CONTRACT_TRANSITIONS, type ContractStatus } from '@/shared/contracts/contracts';
import { ApiError } from '@/lib/api';
import { useContract, useContractMutations } from '../hooks';
import { CONTRACT_TONE, INSTALMENT_TONE } from './ContractsPage';
import type { ContractDetail } from '../api';

export default function ContractDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useContract(id);
  const m = useContractMutations();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Booking not found' : 'Could not load booking'} description={e.message} action={<Button size="sm" variant="outline" onClick={() => navigate('/contracts')}>Back</Button>} /></div>; }
  const c = q.data;
  const canWrite = can('bookings:write');
  const showMoney = can('finance:read') || can('trips:write');
  const open = c.status === 'CONFIRMED' || c.status === 'IN_PROGRESS';
  const next = CONTRACT_TRANSITIONS[c.status] ?? [];
  const err = (e: unknown) => toast.error('Action failed', (e as Error).message);

  const svcCols: Column<ContractDetail['services'][number]>[] = [
    { key: 'type', header: 'Service', render: s => <StatusPill>{s.type.toLowerCase()}</StatusPill> },
    { key: 'notes', header: 'Description', render: s => s.notes ?? '—' },
    { key: 'serviceDate', header: 'Date', render: s => fmtDate(s.serviceDate) },
    { key: 'supplier', header: 'Supplier', hideBelow: 'md', render: s => s.supplier?.name ?? <span className="text-slate-400">to assign</span> },
    { key: 'status', header: 'Status', render: s => s.status.toLowerCase() },
    ...(showMoney ? [{ key: 'sell', header: 'Sell', align: 'right', render: s => <Money value={s.sellPrice} /> } as Column<ContractDetail['services'][number]>, { key: 'cost', header: 'Cost', align: 'right', hideBelow: 'lg', render: s => <Money value={s.costPrice} muted /> } as Column<ContractDetail['services'][number]>] : []),
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader crumbs={[{ label: 'Bookings', to: '/contracts' }, { label: c.contractNumber }]} title={`${c.destination} — ${c.customer.name}${c.partyName ? ` (${c.partyName})` : ''}`}
        badge={<StatusPill tone={CONTRACT_TONE[c.status]}>{c.status.replace('_', ' ').toLowerCase()}</StatusPill>}
        subtitle={<span className="flex flex-wrap gap-x-4">
          <Link to={`/customers/${c.customer.id}`} className="hover:text-slate-800">{c.customer.name} · {formatPhone(c.customer.phone)}</Link>
          <Link to={`/quotes/${c.salesQuoteId}`} className="hover:text-slate-800">Quotation {c.quote.quoteNumber}</Link>
          {c.tripId && <Link to={`/trips/${c.tripId}`} className="hover:text-slate-800">Trip {c.tripId}</Link>}
          <span>{fmtDate(c.departureDate)}{c.returnDate ? ` → ${fmtDate(c.returnDate)}` : ''} · {c.adults} adults{c.children ? `, ${c.children} children` : ''}{c.infants ? `, ${c.infants} infants` : ''}</span>
        </span>}
        actions={<>
          {canWrite && open && <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}><CalendarClock className="w-4 h-4 mr-1.5" />Payment schedule</Button>}
          {canWrite && next.length > 0 && <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>Status…</Button>}
        </>} />
      {c.status === 'CANCELLED' && <div className="mx-5 mt-4 text-sm bg-red-50 border border-red-200 rounded-md px-3 py-2">Cancelled on {fmtDate(c.cancelledAt)}{c.cancellationReason ? `: ${c.cancellationReason}` : ''}</div>}

      <div className="px-5 py-4 grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4 min-w-0">
          <section>
            <h2 className="text-sm font-medium text-slate-800 mb-2">Services</h2>
            <DataTable dense columns={svcCols} rows={c.services} rowKey={s => s.id} emptyTitle="No services" />
            <p className="text-xs text-slate-500 mt-1">Suppliers, confirmations and vouchers are managed from the trip until the Phase 3 trip control centre lands.</p>
          </section>
          <section className="bg-white border border-slate-200 rounded-md p-4">
            <KeyValue columns={2} items={[{ label: 'Payment policy', value: c.paymentPolicy }, { label: 'Cancellation policy', value: c.cancellationPolicy }, { label: 'Notes', value: c.notes, span: 2 }]} />
          </section>
          <section>
            <h2 className="text-sm font-medium text-slate-800 mb-2">Activity</h2>
            <ol className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{c.activity.map(a => <li key={a.id} className="px-3 py-2 text-sm flex gap-3"><span className="text-xs text-slate-500 w-32 shrink-0">{fmtDateTime(a.timestamp)}</span><span>{a.description}</span></li>)}</ol>
          </section>
        </div>
        <aside className="space-y-3">
          {showMoney && (
            <section className="bg-white border border-slate-200 rounded-md p-4 text-sm space-y-1.5">
              <h2 className="text-sm font-medium text-slate-800 mb-2">Money</h2>
              <Row label="Contract value"><Money value={c.totalAmount} /></Row>
              <Row label="Received"><Money value={c.received} /></Row>
              <Row label="Balance" strong><span className={c.payments.overdue > 0 ? 'text-red-600' : ''}><Money value={c.payments.balance} /></span></Row>
              {c.payments.overdue > 0 && <Row label="Overdue"><span className="text-red-600"><Money value={c.payments.overdue} /></span></Row>}
              <div className="border-t border-slate-100 my-2" />
              <Row label="Supplier cost"><Money value={c.costAmount} muted /></Row>
              <Row label="Margin"><Money value={c.totalAmount - c.taxAmount - c.costAmount} /></Row>
            </section>
          )}
          <section className="bg-white border border-slate-200 rounded-md p-4 text-sm">
            <h2 className="text-sm font-medium text-slate-800 mb-2">Payment schedule</h2>
            <ul className="space-y-2">{c.schedule.map(s => <li key={s.seq} className="flex items-center justify-between gap-2"><div><div>{s.label}</div><div className="text-xs text-slate-500">due {fmtDate(s.dueDate)}</div></div><div className="text-right"><Money value={s.amount} /><div><StatusPill tone={INSTALMENT_TONE[s.status]}>{s.status.toLowerCase()}{s.status === 'PARTIAL' ? ` ₹${s.paidAmount.toLocaleString('en-IN')}` : ''}</StatusPill></div></div></li>)}</ul>
            <p className="text-xs text-slate-500 mt-3">Receipts recorded on the trip are applied to instalments in order.</p>
          </section>
        </aside>
      </div>

      <Drawer open={scheduleOpen} onOpenChange={setScheduleOpen} title="Payment schedule" description={`Instalments must add up to ₹${c.totalAmount.toLocaleString('en-IN')}.`}>
        <ScheduleEditor total={c.totalAmount} initial={c.schedule.map(s => ({ seq: s.seq, label: s.label, dueDate: s.dueDate, amount: s.amount }))} submitting={m.schedule.isPending} onSubmit={items => m.schedule.mutate({ id, body: { items } }, { onSuccess: () => { toast.success('Schedule saved'); setScheduleOpen(false); }, onError: err })} />
      </Drawer>
      <Drawer open={statusOpen} onOpenChange={setStatusOpen} title="Update booking status">
        <StatusForm options={next} submitting={m.status.isPending} onSubmit={(status, reason) => m.status.mutate({ id, status, reason }, { onSuccess: () => { toast.success('Status updated'); setStatusOpen(false); }, onError: err })} />
      </Drawer>
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return <div className={`flex justify-between gap-2 ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}><span>{label}</span><span className="tabular-nums text-right">{children}</span></div>;
}

function ScheduleEditor({ total, initial, submitting, onSubmit }: { total: number; initial: ScheduleItem[]; submitting: boolean; onSubmit: (items: ScheduleItem[]) => void }) {
  const [items, setItems] = useState<ScheduleItem[]>(initial);
  const errors = validateSchedule(items, total);
  const upd = (seq: number, patch: Partial<ScheduleItem>) => setItems(items.map(i => (i.seq === seq ? { ...i, ...patch } : i)));
  return (
    <div className="space-y-3">
      {items.map((i, idx) => (
        <div key={i.seq} className="grid grid-cols-[1fr_130px_120px_28px] gap-2 items-end">
          <Field label={idx === 0 ? 'Label' : ''} htmlFor={`l-${i.seq}`}><TextInput id={`l-${i.seq}`} value={i.label} onChange={e => upd(i.seq, { label: e.target.value })} /></Field>
          <Field label={idx === 0 ? 'Due' : ''} htmlFor={`d-${i.seq}`}><TextInput id={`d-${i.seq}`} type="date" value={i.dueDate} onChange={e => upd(i.seq, { dueDate: e.target.value })} /></Field>
          <Field label={idx === 0 ? 'Amount' : ''} htmlFor={`a-${i.seq}`}><TextInput id={`a-${i.seq}`} type="number" min={1} value={i.amount} onChange={e => upd(i.seq, { amount: Number(e.target.value) })} /></Field>
          <button type="button" aria-label="Remove instalment" className="h-9 text-slate-400 hover:text-red-600" onClick={() => setItems(items.filter(x => x.seq !== i.seq).map((x, k) => ({ ...x, seq: k + 1 })))}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setItems([...items, { seq: items.length + 1, label: 'Instalment', dueDate: new Date().toISOString().slice(0, 10), amount: Math.max(0, total - items.reduce((s, i) => s + i.amount, 0)) }])}><Plus className="w-4 h-4 mr-1" />Add instalment</Button>
      {errors.length > 0 && <ul className="text-xs text-amber-700 space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div className="flex justify-end"><Button loading={submitting} disabled={errors.length > 0} onClick={() => onSubmit(items)}>Save schedule</Button></div>
    </div>
  );
}

function StatusForm({ options, submitting, onSubmit }: { options: ContractStatus[]; submitting: boolean; onSubmit: (s: ContractStatus, reason: string | null) => void }) {
  const [status, setStatus] = useState<ContractStatus>(options[0]);
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3">
      <Field label="Status" htmlFor="cs"><Select id="cs" value={status} onChange={e => setStatus(e.target.value as ContractStatus)}>{options.map(o => <option key={o} value={o}>{o.replace('_', ' ').toLowerCase()}</option>)}</Select></Field>
      {status === 'CANCELLED' && <Field label="Reason" htmlFor="cr" required><Textarea id="cr" rows={2} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
      <div className="flex justify-end"><Button size="sm" loading={submitting} disabled={status === 'CANCELLED' && !reason.trim()} onClick={() => onSubmit(status, reason.trim() || null)}>Update</Button></div>
    </div>
  );
}
