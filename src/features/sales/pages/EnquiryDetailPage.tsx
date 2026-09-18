import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, FileText, CalendarPlus, Trash2 } from 'lucide-react';
import { PageHeader, KeyValue, Money, StatusPill, Drawer, DataTable, EmptyState, Field, TextInput, Textarea, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate, fmtDateTime } from '@/shared/utils/date';
import { formatPhone } from '@/shared/calc/phone';
import { ENQUIRY_TRANSITIONS, type EnquiryStatus } from '@/shared/contracts/sales';
import { ApiError } from '@/lib/api';
import { useEnquiry, useEnquiryMutations } from '../hooks';
import { EnquiryForm } from '../components/EnquiryForm';
import { ENQUIRY_COLUMNS, PRIORITY_TONE, StatusBadge, StatusChangeForm, NoteForm, AssigneeSelect, paxLabel } from '../components/common';
import type { EnquiryDetail } from '../api';

export default function EnquiryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useEnquiry(id);
  const m = useEnquiryMutations();
  const [editOpen, setEditOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Enquiry not found' : 'Could not load enquiry'} description={e.message} action={<Button variant="outline" size="sm" onClick={() => navigate('/enquiries')}>Back</Button>} /></div>; }
  const e = q.data;
  const closed = e.status === 'WON' || e.status === 'LOST';
  const canWrite = can('enquiries:write');
  const nextStatuses = (ENQUIRY_TRANSITIONS[e.status] ?? []).map(s => ({ status: s, label: ENQUIRY_COLUMNS.find(c => c.status === s)?.label ?? s }));

  const quoteCols: Column<EnquiryDetail['quotes'][number]>[] = [
    { key: 'quoteNumber', header: 'Quote', render: r => <span className="font-medium">{r.quoteNumber}</span> },
    { key: 'status', header: 'Status', render: r => <StatusPill tone={r.status === 'ACCEPTED' ? 'success' : r.status === 'SENT' || r.status === 'VIEWED' ? 'accent' : r.status === 'REJECTED' || r.status === 'EXPIRED' ? 'danger' : 'neutral'}>{r.status.toLowerCase()}</StatusPill> },
    { key: 'totalAmount', header: 'Total', align: 'right', render: r => <Money value={r.totalAmount} /> },
    { key: 'validUntil', header: 'Valid until', render: r => fmtDate(r.validUntil) },
    { key: 'createdAt', header: 'Created', render: r => fmtDate(r.createdAt) },
    { key: 'trip', header: 'Trip', render: r => r.convertedTripId ? <Link className="underline" to={`/trips/${r.convertedTripId}`} onClick={ev => ev.stopPropagation()}>{r.convertedTripId}</Link> : '—' },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: e.enquiryNumber ?? e.id }]} title={`${e.destination} for ${e.customer.name}`}
        badge={<><StatusBadge status={e.status} columns={ENQUIRY_COLUMNS} /><StatusPill tone={PRIORITY_TONE[e.priority]}>{e.priority}</StatusPill></>}
        subtitle={<span className="flex flex-wrap gap-x-4">
          <Link to={`/customers/${e.customer.id}`} className="hover:text-slate-800">{e.customer.name} · {formatPhone(e.customer.phone)}</Link>
          <span>{e.departureDate ? `${fmtDate(e.departureDate)}${e.returnDate ? ` → ${fmtDate(e.returnDate)}` : ''}` : e.flexibleDates ? 'Flexible dates' : 'Dates TBD'}</span>
          <span>{paxLabel(e)}{e.rooms ? ` · ${e.rooms} room${e.rooms > 1 ? 's' : ''}` : ''}</span>
          {e.assignee && <span>Owner: {e.assignee.name}</span>}
        </span>}
        actions={<>
          {canWrite && !closed && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-1.5" />Edit</Button>}
          {canWrite && !closed && <Button size="sm" variant="outline" onClick={() => setFollowUpOpen(true)}><CalendarPlus className="w-4 h-4 mr-1.5" />Follow-up</Button>}
          {can('sales-quotes:write') && !closed && <Button size="sm" onClick={() => navigate(`/sales-quotes/new?enquiryId=${e.id}`)}><FileText className="w-4 h-4 mr-1.5" />New quote</Button>}
        </>} />

      {e.status === 'LOST' && e.lostReason && <div className="mx-5 mt-4 text-sm bg-slate-100 rounded-md px-3 py-2">Lost on {fmtDate(e.lostAt)}: {e.lostReason}</div>}
      {e.status === 'WON' && <div className="mx-5 mt-4 text-sm bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">Won on {fmtDate(e.wonAt)}.</div>}

      <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white border border-slate-200 rounded-md p-4">
            <h2 className="text-sm font-medium text-slate-800 mb-3">Requirement</h2>
            <KeyValue columns={3} items={[
              { label: 'From', value: e.origin }, { label: 'Trip type', value: e.tripType }, { label: 'Source', value: e.source.toLowerCase() },
              { label: 'Hotel', value: e.hotelCategory }, { label: 'Meal plan', value: e.mealPlan }, { label: 'Budget', value: e.budget != null ? <><Money value={e.budget} />{e.budgetMax != null ? <> – <Money value={e.budgetMax} /></> : null}</> : null },
              { label: 'Requirements', value: e.requirements ? <span className="whitespace-pre-wrap">{e.requirements}</span> : null, span: 2 },
              { label: 'Preferences', value: Object.keys(e.preferences ?? {}).length ? Object.entries(e.preferences).map(([k, v]) => `${k}: ${v}`).join(' · ') : null },
              { label: 'Internal notes', value: e.notes ? <span className="whitespace-pre-wrap">{e.notes}</span> : null, span: 2 },
              { label: 'Lead', value: e.lead ? <Link className="underline" to={`/leads?open=${e.lead.id}&closed=1`}>{e.lead.id} · {e.lead.source}</Link> : null },
            ]} />
          </section>
          <section>
            <h2 className="text-sm font-medium text-slate-800 mb-2">Quotations</h2>
            <DataTable dense columns={quoteCols} rows={e.quotes} rowKey={r => r.id} onRowClick={r => navigate(`/sales-quotes/${r.id}`)} emptyTitle="No quotation yet" emptyHint="Build one from the requirement above." emptyAction={can('sales-quotes:write') && !closed ? <Button size="sm" onClick={() => navigate(`/sales-quotes/new?enquiryId=${e.id}`)}>New quote</Button> : undefined} />
          </section>
          <section>
            <h2 className="text-sm font-medium text-slate-800 mb-2">Activity</h2>
            {canWrite && <div className="mb-2"><NoteForm submitting={m.note.isPending} onSubmit={note => m.note.mutate({ id, note }, { onError: err => toast.error('Could not add note', (err as Error).message) })} /></div>}
            <ol className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
              {e.activity.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No activity yet.</li>}
              {e.activity.map(a => <li key={a.id} className="px-3 py-2 text-sm flex gap-3"><span className="text-xs text-slate-500 w-32 shrink-0">{fmtDateTime(a.timestamp)}</span><span className="flex-1">{a.description ?? a.action.replace(/_/g, ' ')}</span></li>)}
            </ol>
          </section>
        </div>
        <div className="space-y-4">
          {canWrite && (
            <section className="bg-white border border-slate-200 rounded-md p-4"><h2 className="text-sm font-medium text-slate-800 mb-3">Stage</h2>
              <StatusChangeForm options={nextStatuses} lostValue={'LOST' as EnquiryStatus} submitting={m.status.isPending} onSubmit={v => m.status.mutate({ id, ...v }, { onSuccess: () => toast.success('Enquiry updated'), onError: err => toast.error('Could not update', (err as Error).message) })} />
            </section>
          )}
          {canWrite && (
            <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3"><h2 className="text-sm font-medium text-slate-800">Owner</h2>
              <AssigneeSelect value={e.assignedToUserId} onChange={userId => m.assign.mutate({ id, userId }, { onError: err => toast.error('Could not assign', (err as Error).message) })} label={null} />
              {e.quotes.length === 0 && <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Remove this enquiry?', variant: 'destructive', confirmLabel: 'Remove' })) m.remove.mutate(id, { onSuccess: () => { toast.success('Enquiry removed'); navigate('/enquiries'); }, onError: err => toast.error('Could not remove', (err as Error).message) }); }}><Trash2 className="w-4 h-4 mr-1" />Remove</Button>}
            </section>
          )}
          <section className="bg-white border border-slate-200 rounded-md p-4"><h2 className="text-sm font-medium text-slate-800 mb-2">Open follow-ups</h2>
            {e.tasks.length === 0 ? <p className="text-sm text-slate-500">None scheduled.</p> : <ul className="space-y-1.5">{e.tasks.map(t => <li key={t.id} className="text-sm flex justify-between gap-2"><span className="truncate">{t.title}</span><span className="text-xs text-slate-500 whitespace-nowrap">{t.dueDate ? fmtDate(t.dueDate) : ''}{t.assignedTo ? ` · ${t.assignedTo}` : ''}</span></li>)}</ul>}
          </section>
        </div>
      </div>

      <Drawer open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) m.update.reset(); }} title={`Edit ${e.enquiryNumber ?? 'enquiry'}`} width="xl">
        <EnquiryForm initial={e} submitting={m.update.isPending} error={m.update.error as ApiError | null} onCancel={() => setEditOpen(false)}
          onSubmit={({ customerId: _c, newCustomer: _n, leadId: _l, ...body }) => m.update.mutate({ id, body }, { onSuccess: () => { toast.success('Enquiry updated'); setEditOpen(false); }, onError: err => { if (!(err instanceof ApiError) || !err.fields) toast.error('Could not save', (err as Error).message); } })} />
      </Drawer>
      <Drawer open={followUpOpen} onOpenChange={setFollowUpOpen} title="Schedule a follow-up" description="Creates a task for the owner on the chosen date.">
        <FollowUpForm submitting={m.followUp.isPending} defaultAssignee={e.assignedToUserId} onSubmit={b => m.followUp.mutate({ id, ...b }, { onSuccess: () => { toast.success('Follow-up scheduled'); setFollowUpOpen(false); }, onError: err => toast.error('Could not schedule', (err as Error).message) })} />
      </Drawer>
    </div>
  );
}

function FollowUpForm({ submitting, defaultAssignee, onSubmit }: { submitting: boolean; defaultAssignee: string | null; onSubmit: (b: { dueDate: string; note: string | null; assignedToUserId: string | null }) => void }) {
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState<string | null>(defaultAssignee);
  return (
    <div className="space-y-4">
      <Field label="Due date" htmlFor="fuDate" required><TextInput id="fuDate" type="date" value={dueDate} onChange={ev => setDueDate(ev.target.value)} /></Field>
      <AssigneeSelect value={assignee} onChange={setAssignee} id="fuAssignee" />
      <Field label="What to do" htmlFor="fuNote"><Textarea id="fuNote" rows={3} value={note} onChange={ev => setNote(ev.target.value)} placeholder="Call back with hotel options…" /></Field>
      <div className="flex justify-end"><Button loading={submitting} disabled={!dueDate} onClick={() => onSubmit({ dueDate, note: note.trim() || null, assignedToUserId: assignee })}>Schedule</Button></div>
    </div>
  );
}
