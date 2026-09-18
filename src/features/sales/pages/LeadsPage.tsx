import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Phone, ArrowRightCircle, Trash2 } from 'lucide-react';
import { PageHeader, Toolbar, SearchInput, Drawer, Select, StatusPill, Money, KeyValue, Field, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate, fmtDateTime } from '@/shared/utils/date';
import { formatPhone } from '@/shared/calc/phone';
import { LEAD_TRANSITIONS, type LeadListQuery, type LeadStatus } from '@/shared/contracts/sales';
import { ApiError } from '@/lib/api';
import { useLeadList, useLead, useLeadMutations, useTeam } from '../hooks';
import { LeadForm } from '../components/LeadForm';
import { Board, LEAD_COLUMNS, PRIORITY_TONE, StatusBadge, StatusChangeForm, NoteForm, AssigneeSelect } from '../components/common';
import type { Lead } from '../api';

export default function LeadsPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const openId = params.get('open');
  const m = useLeadMutations();
  const team = useTeam();

  const query: Partial<LeadListQuery> = useMemo(() => ({
    q: params.get('q') || undefined, assignedToUserId: params.get('assignee') || undefined, source: params.get('source') || undefined,
    includeClosed: params.get('closed') === '1', pageSize: 200,
  }), [params]);
  const setParam = (k: string, v: string | undefined) => { const n = new URLSearchParams(params); if (!v) n.delete(k); else n.set(k, v); setParams(n, { replace: true }); };
  const list = useLeadList(query);
  const columns = query.includeClosed ? LEAD_COLUMNS : LEAD_COLUMNS.filter(c => c.status !== 'converted' && c.status !== 'lost');

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Leads" subtitle={list.data ? `${list.data.total} open lead${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={can('enquiries:write') && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5" />New lead</Button>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={!!query.includeClosed} onChange={e => setParam('closed', e.target.checked ? '1' : undefined)} />Show converted & lost</label>}>
        <SearchInput value={query.q ?? ''} onChange={v => setParam('q', v || undefined)} placeholder="Name, phone, destination…" />
        <Select aria-label="Assignee" className="w-auto" value={query.assignedToUserId ?? ''} onChange={e => setParam('assignee', e.target.value || undefined)}>
          <option value="">Anyone</option>{(team.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Toolbar>
      {list.isError && <div className="mx-5 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
      <Board columns={columns} items={list.data?.items ?? []} statusOf={l => l.status} keyOf={l => l.id} emptyLabel={list.isPending ? 'Loading…' : 'No leads'}
        renderCard={l => <LeadCard lead={l} onOpen={() => setParam('open', l.id)} />} />

      <Drawer open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) m.create.reset(); }} title="New lead" description="Raw interest from WhatsApp, Instagram, a call or a walk-in. Convert it once the customer is real.">
        <LeadForm submitting={m.create.isPending} error={m.create.error as ApiError | null} onCancel={() => setCreateOpen(false)} submitLabel="Add lead"
          onSubmit={v => m.create.mutate(v, { onSuccess: l => { toast.success('Lead added', `${l.id} · ${l.name}`); setCreateOpen(false); }, onError: e => { if (!(e instanceof ApiError) || (!e.fields && e.code !== 'CONFLICT')) toast.error('Could not add lead', (e as Error).message); } })} />
      </Drawer>

      <Drawer open={!!openId} onOpenChange={o => { if (!o) setParam('open', undefined); }} title={openId ? <LeadTitle id={openId} /> : ''} width="xl">
        {openId && <LeadPanel id={openId} onClose={() => setParam('open', undefined)} />}
      </Drawer>
    </div>
  );
}

function LeadTitle({ id }: { id: string }) { const q = useLead(id); return <>{q.data?.name ?? id}</>; }

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left bg-white border border-slate-200 rounded-md p-3 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-medium text-slate-900 truncate">{lead.name}</div><div className="text-xs text-slate-500">{formatPhone(lead.phone)} · {lead.source}</div></div>
        {lead.priority === 'high' && <StatusPill tone="danger">high</StatusPill>}
      </div>
      {(lead.destination || lead.travelDate) && <div className="text-sm text-slate-700 mt-1.5 truncate">{lead.destination || 'Destination TBD'}{lead.travelDate ? ` · ${fmtDate(lead.travelDate)}` : ''} · {lead.pax} pax</div>}
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <span>{lead.assignee ? lead.assignee.name : 'Unassigned'}</span>
        {lead.budget != null && <Money value={lead.budget} muted />}
      </div>
      {lead.followUpDate && <div className="text-[11px] text-amber-700 mt-1">Follow up {fmtDate(lead.followUpDate)}</div>}
    </button>
  );
}

function LeadPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useLead(id);
  const m = useLeadMutations();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  if (q.isPending) return <p className="text-sm text-slate-500">Loading…</p>;
  if (q.isError) return <p className="text-sm text-red-600">{(q.error as ApiError).message}</p>;
  const l = q.data;
  const canWrite = can('enquiries:write');
  const nextStatuses = (LEAD_TRANSITIONS[l.status] ?? []).filter(s => s !== 'converted').map(s => ({ status: s, label: LEAD_COLUMNS.find(c => c.status === s)?.label ?? s }));

  if (editing) return <LeadForm initial={l} submitting={m.update.isPending} error={m.update.error as ApiError | null} onCancel={() => setEditing(false)}
    onSubmit={({ force: _f, ...body }) => m.update.mutate({ id, body }, { onSuccess: () => { toast.success('Lead updated'); setEditing(false); }, onError: e => { if (!(e instanceof ApiError) || !e.fields) toast.error('Could not save', (e as Error).message); } })} />;

  if (converting) return <ConvertForm lead={l} submitting={m.convert.isPending} onCancel={() => setConverting(false)} onSubmit={body => m.convert.mutate({ id, body }, {
    onSuccess: r => { toast.success('Lead converted', `${r.customerId} · ${r.enquiry.enquiryNumber ?? ''}`); onClose(); navigate(`/enquiries/${r.enquiry.id}`); },
    onError: e => toast.error('Could not convert', (e as Error).message),
  })} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={l.status} columns={LEAD_COLUMNS} /><StatusPill tone={PRIORITY_TONE[l.priority]}>{l.priority}</StatusPill><span className="text-xs text-slate-500">{l.id} · added {fmtDate(l.createdAt)}</span>
        <div className="ml-auto flex gap-2">
          <a href={`tel:${l.phone}`} className="inline-flex"><Button size="sm" variant="outline"><Phone className="w-4 h-4 mr-1" />Call</Button></a>
          {canWrite && l.status !== 'converted' && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {canWrite && l.status !== 'converted' && l.status !== 'lost' && <Button size="sm" onClick={() => setConverting(true)}><ArrowRightCircle className="w-4 h-4 mr-1" />Convert</Button>}
        </div>
      </div>
      {l.status === 'converted' && (
        <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">Converted on {fmtDate(l.convertedAt)} → {l.convertedCustomer && <Link className="underline" to={`/customers/${l.convertedCustomer.id}`}>{l.convertedCustomer.name}</Link>}{l.convertedEnquiry && <> · <Link className="underline" to={`/enquiries/${l.convertedEnquiry.id}`}>{l.convertedEnquiry.enquiryNumber ?? 'enquiry'}</Link></>}</div>
      )}
      {l.status === 'lost' && l.lostReason && <div className="text-sm bg-slate-100 rounded-md px-3 py-2">Lost: {l.lostReason}</div>}
      <KeyValue columns={3} items={[
        { label: 'Phone', value: formatPhone(l.phone) }, { label: 'Email', value: l.email }, { label: 'Source', value: l.source },
        { label: 'Destination', value: l.destination || null }, { label: 'Travel date', value: l.travelDate ? fmtDate(l.travelDate) : null }, { label: 'Pax', value: String(l.pax) },
        { label: 'Budget', value: l.budget != null ? <Money value={l.budget} /> : null }, { label: 'Trip type', value: l.tripType || null }, { label: 'Follow up', value: l.followUpDate ? fmtDate(l.followUpDate) : null },
        { label: 'Notes', value: l.notes ? <span className="whitespace-pre-wrap">{l.notes}</span> : null, span: 2 },
      ]} />
      {canWrite && l.status !== 'converted' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section className="border border-slate-200 rounded-md p-3"><h3 className="text-xs font-medium text-slate-600 mb-2">Stage</h3>
            <StatusChangeForm options={nextStatuses} lostValue={'lost' as LeadStatus} submitting={m.status.isPending} onSubmit={v => m.status.mutate({ id, ...v }, { onSuccess: () => toast.success('Lead updated'), onError: e => toast.error('Could not update', (e as Error).message) })} />
          </section>
          <section className="border border-slate-200 rounded-md p-3 space-y-3"><h3 className="text-xs font-medium text-slate-600">Owner</h3>
            <AssigneeSelect value={l.assignedToUserId} onChange={userId => m.assign.mutate({ id, userId }, { onError: e => toast.error('Could not assign', (e as Error).message) })} label={null} />
            {can('customers:write') && <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Remove this lead?', variant: 'destructive', confirmLabel: 'Remove' })) m.remove.mutate(id, { onSuccess: () => { toast.success('Lead removed'); onClose(); }, onError: e => toast.error('Could not remove', (e as Error).message) }); }}><Trash2 className="w-4 h-4 mr-1" />Remove</Button>}
          </section>
        </div>
      )}
      <section>
        <h3 className="text-xs font-medium text-slate-600 mb-2">Timeline</h3>
        {canWrite && <div className="mb-3"><NoteForm submitting={m.note.isPending} onSubmit={note => m.note.mutate({ id, note }, { onError: e => toast.error('Could not add note', (e as Error).message) })} /></div>}
        <ol className="border border-slate-200 rounded-md divide-y divide-slate-100 bg-white">
          {[...l.timeline].reverse().map((t, i) => <li key={i} className="px-3 py-2 text-sm flex gap-3"><span className="text-xs text-slate-500 w-32 shrink-0">{fmtDateTime(t.at)}</span><span className="flex-1">{t.text}</span><StatusPill>{t.type}</StatusPill></li>)}
        </ol>
      </section>
    </div>
  );
}

function ConvertForm({ lead, submitting, onSubmit, onCancel }: { lead: Lead; submitting: boolean; onSubmit: (b: { customerId: string | null; destination: string | null; departureDate: string | null; returnDate: string | null; adults: number; children: number; infants: number; budget: number | null; requirements: string | null }) => void; onCancel: () => void }) {
  const [destination, setDestination] = useState(lead.destination);
  const [departureDate, setDeparture] = useState(lead.travelDate ?? '');
  const [returnDate, setReturn] = useState('');
  const [adults, setAdults] = useState(Math.max(1, lead.pax));
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [budget, setBudget] = useState(lead.budget != null ? String(lead.budget) : '');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">A customer is matched by phone number or created, and an enquiry is opened with these details.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Destination" htmlFor="cDest" className="col-span-2 sm:col-span-3"><TextInput id="cDest" value={destination} onChange={e => setDestination(e.target.value)} /></Field>
        <Field label="Departure" htmlFor="cDep"><TextInput id="cDep" type="date" value={departureDate} onChange={e => setDeparture(e.target.value)} /></Field>
        <Field label="Return" htmlFor="cRet"><TextInput id="cRet" type="date" value={returnDate} onChange={e => setReturn(e.target.value)} /></Field>
        <Field label="Budget (₹)" htmlFor="cBud"><TextInput id="cBud" type="number" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
        <Field label="Adults" htmlFor="cA"><TextInput id="cA" type="number" min={1} value={adults} onChange={e => setAdults(Number(e.target.value))} /></Field>
        <Field label="Children" htmlFor="cC"><TextInput id="cC" type="number" min={0} value={children} onChange={e => setChildren(Number(e.target.value))} /></Field>
        <Field label="Infants" htmlFor="cI"><TextInput id="cI" type="number" min={0} value={infants} onChange={e => setInfants(Number(e.target.value))} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Back</Button><Button loading={submitting} onClick={() => onSubmit({ customerId: null, destination: destination || null, departureDate: departureDate || null, returnDate: returnDate || null, adults, children, infants, budget: budget ? Number(budget) : null, requirements: lead.notes || null })}>Convert to customer + enquiry</Button></div>
    </div>
  );
}
