import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2, Merge, Phone, Mail, MapPin, Link2, X } from 'lucide-react';
import { PageHeader, KeyValue, Money, StatusPill, Drawer, DataTable, EmptyState, Field, Select, TextInput, type Column, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate, fmtDateTime } from '@/shared/utils/date';
import { formatPhone } from '@/shared/calc/phone';
import { ApiError } from '@/lib/api';
import { useCustomer, useUpdateCustomer, useDeleteCustomer, useMergeCustomers, useRelationships } from '../hooks';
import { CustomerForm } from '../components/CustomerForm';
import { CustomerPicker } from '../components/CustomerPicker';
import type { Customer360 } from '../api';
import { TravellerForm } from '@/features/travellers/components/TravellerForm';
import { PassportPill } from '@/features/travellers/components/PassportPill';
import { useCreateTraveller } from '@/features/travellers/hooks';

const TRIP_TONE: Record<string, Tone> = { draft: 'neutral', quotation: 'info', confirmed: 'accent', in_progress: 'warning', completed: 'success', cancelled: 'danger' };
const TABS = ['Overview', 'Trips', 'Sales', 'Finance', 'Travellers', 'Documents', 'Activity'] as const;
type Tab = typeof TABS[number];

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can, role } = usePermissions();
  const q = useCustomer(id);
  const update = useUpdateCustomer(id);
  const remove = useDeleteCustomer();
  const merge = useMergeCustomers();
  const rels = useRelationships(id);
  const [tab, setTab] = useState<Tab>('Overview');
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) {
    const err = q.error as ApiError;
    return <div className="p-6"><EmptyState title={err.status === 404 ? 'Customer not found' : 'Could not load customer'} description={err.message} action={<Button variant="outline" size="sm" onClick={() => navigate('/customers')}>Back to customers</Button>} /></div>;
  }
  const data = q.data;
  const c = data.customer;
  const canWrite = can('customers:write') && !c.deletedAt;
  const canSeeFinance = can('finance:read');

  async function onDelete() {
    const ok = await confirm({ title: `Remove ${c.name}?`, description: 'The customer is archived, not erased. Trips, invoices and payments are kept. Customers with active trips or a balance cannot be removed.', confirmLabel: 'Remove', variant: 'destructive' });
    if (!ok) return;
    remove.mutate(id, {
      onSuccess: () => { toast.success('Customer removed'); navigate('/customers'); },
      onError: e => toast.error('Could not remove customer', (e as Error).message),
    });
  }

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader
        crumbs={[{ label: 'Customers', to: '/customers' }, { label: c.id }]}
        title={c.name}
        badge={<>
          <StatusPill tone={c.type === 'CORPORATE' ? 'accent' : 'neutral'}>{c.type === 'CORPORATE' ? 'Corporate' : 'Individual'}</StatusPill>
          {c.deletedAt && <StatusPill tone="danger">{c.mergedIntoId ? 'merged' : 'removed'}</StatusPill>}
        </>}
        subtitle={<span className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-slate-800"><Phone className="w-3.5 h-3.5" />{formatPhone(c.phone)}</a>
          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-slate-800"><Mail className="w-3.5 h-3.5" />{c.email}</a>}
          {c.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{c.city}{c.state ? `, ${c.state}` : ''}</span>}
        </span>}
        actions={<>
          {canWrite && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-1.5" />Edit</Button>}
          {role === 'ADMIN' && !c.deletedAt && <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)}><Merge className="w-4 h-4 mr-1.5" />Merge</Button>}
          {role === 'ADMIN' && !c.deletedAt && <Button size="sm" variant="outline" className="text-red-600" onClick={onDelete} loading={remove.isPending}><Trash2 className="w-4 h-4 mr-1.5" />Remove</Button>}
        </>}
      />

      {c.mergedIntoId && (
        <div className="mx-5 mt-4 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          This record was merged into <Link className="underline" to={`/customers/${c.mergedIntoId}`}>{c.mergedIntoId}</Link>.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 pt-4">
        <Stat label="Trips" value={String(data.stats.tripCount)} sub={data.stats.lastTripAt ? `last ${fmtDate(data.stats.lastTripAt)}` : 'none yet'} />
        {canSeeFinance ? <>
          <Stat label="Lifetime value" value={<Money value={data.stats.lifetimeValue} />} />
          <Stat label="Paid" value={<Money value={data.stats.lifetimePaid} />} />
          <Stat label="Outstanding" value={<Money value={data.stats.outstanding} className={data.stats.outstanding > 0 ? 'text-amber-700' : ''} />} />
        </> : <Stat label="Since" value={fmtDate(c.createdAt)} />}
      </div>

      <div className="px-5 mt-4 border-b border-slate-200 flex gap-4 overflow-x-auto">
        {TABS.filter(t => t !== 'Finance' || canSeeFinance).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`pb-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t}{count(t, data) !== null && <span className="ml-1 text-xs text-slate-400">{count(t, data)}</span>}
          </button>
        ))}
      </div>

      <div className="px-5 py-4">
        {tab === 'Overview' && <Overview data={data} canWrite={canWrite} onAddRelationship={() => setRelOpen(true)} onRemoveRelationship={relId => rels.remove.mutate(relId, { onError: e => toast.error('Could not remove link', (e as Error).message) })} />}
        {tab === 'Trips' && <TripsTab data={data} showMoney={canSeeFinance} />}
        {tab === 'Sales' && <SalesTab data={data} />}
        {tab === 'Finance' && canSeeFinance && <FinanceTab data={data} />}
        {tab === 'Travellers' && <TravellersTab data={data} canWrite={canWrite} />}
        {tab === 'Documents' && <DocumentsTab data={data} />}
        {tab === 'Activity' && <ActivityTab data={data} />}
      </div>

      <Drawer open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) update.reset(); }} title={`Edit ${c.name}`}>
        <CustomerForm initial={c} submitting={update.isPending} error={update.error as ApiError | null} onCancel={() => setEditOpen(false)}
          onSubmit={({ force: _f, ...values }) => update.mutate(values, {
            onSuccess: () => { toast.success('Customer updated'); setEditOpen(false); },
            onError: e => { if (!(e instanceof ApiError) || !e.fields) toast.error('Could not save', (e as Error).message); },
          })} />
      </Drawer>

      <Drawer open={mergeOpen} onOpenChange={setMergeOpen} title="Merge another customer into this one" description={`Pick the duplicate. Its trips, invoices, payments, travellers and documents move to ${c.id}; the duplicate is archived.`}>
        <CustomerPicker excludeId={id} onPick={async other => {
          const ok = await confirm({ title: `Merge ${other.name} into ${c.name}?`, description: `${other.id} will be archived. This cannot be undone.`, confirmLabel: 'Merge', variant: 'destructive' });
          if (!ok) return;
          merge.mutate({ targetId: id, sourceId: other.id }, {
            onSuccess: r => { const moved = Object.entries(r.moved).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', '); toast.success(`Merged ${other.name}`, moved || 'Nothing else to move'); setMergeOpen(false); },
            onError: e => toast.error('Merge failed', (e as Error).message),
          });
        }} />
      </Drawer>

      <Drawer open={relOpen} onOpenChange={setRelOpen} title="Link a related customer" description="Family members, travel groups and company contacts show on both profiles.">
        <RelationshipForm excludeId={id} submitting={rels.add.isPending} onSubmit={body => rels.add.mutate(body, {
          onSuccess: () => { toast.success('Customers linked'); setRelOpen(false); },
          onError: e => toast.error('Could not link', (e as Error).message),
        })} />
      </Drawer>
    </div>
  );
}

function count(tab: Tab, d: Customer360): number | null {
  switch (tab) {
    case 'Trips': return d.trips.length;
    case 'Sales': return d.enquiries.length + d.quotations.length;
    case 'Finance': return d.invoices.length;
    case 'Travellers': return d.travellers.length;
    case 'Documents': return d.documents.length;
    default: return null;
  }
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Overview({ data, canWrite, onAddRelationship, onRemoveRelationship }: { data: Customer360; canWrite: boolean; onAddRelationship: () => void; onRemoveRelationship: (id: string) => void }) {
  const c = data.customer;
  const prefs = c.preferences ?? {};
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Contact & billing">
          <KeyValue items={[
            { label: 'Phone', value: formatPhone(c.phone) }, { label: 'Alternate phone', value: c.altPhone ? formatPhone(c.altPhone) : null },
            { label: 'Email', value: c.email }, { label: 'Source', value: c.source },
            { label: 'Address', value: c.address, span: 2 }, { label: 'Billing address', value: c.billingAddress, span: 2 },
            ...(c.type === 'CORPORATE' ? [{ label: 'Company', value: c.companyName }, { label: 'GSTIN', value: c.gstNumber ? `${c.gstNumber}${c.gstRegistered ? ' (registered)' : ''}` : null }] : []),
            { label: 'Tags', value: c.tags.length ? c.tags.map(t => <Link key={t} to={`/customers?tag=${encodeURIComponent(t)}`} className="inline-block mr-1"><StatusPill tone="neutral">{t}</StatusPill></Link>) : null, span: 2 },
            { label: 'Referred by', value: c.referredBy ? <Link className="underline" to={`/customers/${c.referredBy.id}`}>{c.referredBy.name}</Link> : null },
            { label: 'Customer since', value: fmtDate(c.createdAt) },
          ]} />
        </Card>
        <Card title="Identity & preferences">
          <KeyValue items={[
            { label: 'Passport', value: c.passportNo ? `${c.passportNo}${c.passportCountry ? ` (${c.passportCountry})` : ''}` : null },
            { label: 'Passport expiry', value: c.passportExpiry ? <PassportExpiry date={c.passportExpiry} /> : null },
            { label: 'PAN', value: c.panNumber },
            { label: 'Seat', value: prefs.seatPreference }, { label: 'Meal', value: prefs.mealPreference }, { label: 'Hotel', value: prefs.hotelPreference },
            { label: 'Notes', value: c.notes ? <span className="whitespace-pre-wrap">{c.notes}</span> : null, span: 2 },
          ]} />
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Related customers" action={canWrite ? <Button size="sm" variant="ghost" onClick={onAddRelationship}><Link2 className="w-4 h-4 mr-1" />Link</Button> : undefined}>
          {c.relationships.length === 0 && data.referrals.length === 0 ? <p className="text-sm text-slate-500">No linked customers.</p> : (
            <ul className="space-y-2">
              {c.relationships.map(r => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <StatusPill tone="neutral">{r.kind.toLowerCase()}</StatusPill>
                  <Link to={`/customers/${r.customer.id}`} className="font-medium hover:underline truncate">{r.customer.name}</Link>
                  {r.note && <span className="text-slate-500 truncate">· {r.note}</span>}
                  {canWrite && <button type="button" aria-label="Remove link" onClick={() => onRemoveRelationship(r.id)} className="ml-auto text-slate-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>}
                </li>
              ))}
              {data.referrals.map(r => (
                <li key={r.id} className="flex items-center gap-2 text-sm"><StatusPill tone="info">referred</StatusPill><Link to={`/customers/${r.id}`} className="font-medium hover:underline">{r.name}</Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Open tasks">
          {data.tasks.length === 0 ? <p className="text-sm text-slate-500">Nothing pending.</p> : (
            <ul className="space-y-1.5">
              {data.tasks.map(t => <li key={t.id} className="text-sm flex justify-between gap-2"><span className="truncate">{t.title}</span><span className="text-xs text-slate-500 whitespace-nowrap">{t.dueDate ? fmtDate(t.dueDate) : ''}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function PassportExpiry({ date }: { date: string }) {
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
  const tone: Tone = days < 0 ? 'danger' : days < 180 ? 'warning' : 'success';
  return <span className="inline-flex items-center gap-2">{fmtDate(date)}<StatusPill tone={tone}>{days < 0 ? 'expired' : days < 180 ? `${days} days left` : 'valid'}</StatusPill></span>;
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-md">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100"><h2 className="text-sm font-medium text-slate-800">{title}</h2>{action}</header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function TripsTab({ data, showMoney }: { data: Customer360; showMoney: boolean }) {
  const navigate = useNavigate();
  const cols: Column<Customer360['trips'][number]>[] = [
    { key: 'id', header: 'Trip', render: t => <span className="font-medium">{t.id}</span> },
    { key: 'destination', header: 'Destination' },
    { key: 'departure', header: 'Dates', render: t => `${fmtDate(t.departure)}${t.returnDate ? ` → ${fmtDate(t.returnDate)}` : ''}` },
    { key: 'pax', header: 'Pax', align: 'right' },
    { key: 'status', header: 'Status', render: t => <StatusPill tone={TRIP_TONE[t.status] ?? 'neutral'}>{t.status.replace('_', ' ')}</StatusPill> },
    ...(showMoney ? [
      { key: 'total', header: 'Total', align: 'right', render: t => <Money value={t.totalPayable} /> } as Column<Customer360['trips'][number]>,
      { key: 'due', header: 'Balance', align: 'right', render: t => <Money value={t.balanceDue} /> } as Column<Customer360['trips'][number]>,
    ] : []),
  ];
  return <DataTable columns={cols} rows={data.trips} rowKey={t => t.id} onRowClick={t => navigate(`/trips/${t.id}`)} emptyTitle="No trips yet" dense />;
}

function SalesTab({ data }: { data: Customer360 }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <Card title="Enquiries">
        <DataTable dense rows={data.enquiries} rowKey={e => e.id} emptyTitle="No enquiries" onRowClick={() => navigate('/enquiries')} columns={[
          { key: 'destination', header: 'Destination', render: e => e.destination ?? '—' },
          { key: 'departureDate', header: 'Travel', render: e => fmtDate(e.departureDate) },
          { key: 'pax', header: 'Pax', align: 'right', render: e => e.pax ?? '—' },
          { key: 'status', header: 'Status', render: e => <StatusPill>{e.status}</StatusPill> },
          { key: 'createdAt', header: 'Raised', render: e => fmtDate(e.createdAt) },
        ]} />
      </Card>
      <Card title="Quotations">
        <DataTable dense rows={data.quotations} rowKey={q => q.id} emptyTitle="No quotations" onRowClick={q => navigate(q.engine === 'sales' ? `/sales-quotes/${q.id}` : `/quotations/${q.id}`)} columns={[
          { key: 'number', header: 'Number', render: q => q.number ?? q.id },
          { key: 'status', header: 'Status', render: q => <StatusPill tone={q.status === 'ACCEPTED' || q.status === 'accepted' ? 'success' : 'neutral'}>{q.status}</StatusPill> },
          { key: 'total', header: 'Total', align: 'right', render: q => <Money value={q.total} /> },
          { key: 'createdAt', header: 'Created', render: q => fmtDate(q.createdAt) },
          { key: 'trip', header: 'Trip', render: q => q.convertedTripId ? <Link className="underline" to={`/trips/${q.convertedTripId}`} onClick={e => e.stopPropagation()}>{q.convertedTripId}</Link> : '—' },
        ]} />
      </Card>
    </div>
  );
}

function FinanceTab({ data }: { data: Customer360 }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Invoiced" value={<Money value={data.stats.invoiced} />} />
        <Stat label="Received" value={<Money value={data.stats.received} />} />
        <Stat label="Outstanding" value={<Money value={data.stats.outstanding} />} />
      </div>
      <Card title="Invoices">
        <DataTable dense rows={data.invoices} rowKey={i => i.id} emptyTitle="No invoices" onRowClick={i => navigate(`/invoices/${i.id}`)} columns={[
          { key: 'invoiceNumber', header: 'Invoice' }, { key: 'invoiceDate', header: 'Date', render: i => fmtDate(i.invoiceDate) },
          { key: 'status', header: 'Status', render: i => <StatusPill tone={i.status === 'ISSUED' ? 'accent' : i.status === 'PAID' ? 'success' : 'neutral'}>{i.status}</StatusPill> },
          { key: 'totalAmount', header: 'Amount', align: 'right', render: i => <Money value={i.totalAmount} paise /> },
        ]} />
      </Card>
      <Card title="Recent payments">
        <DataTable dense rows={data.payments} rowKey={p => p.id} emptyTitle="No payments recorded" columns={[
          { key: 'date', header: 'Date', render: p => fmtDate(p.date) }, { key: 'amount', header: 'Amount', align: 'right', render: p => <Money value={p.amount} /> },
          { key: 'method', header: 'Method' }, { key: 'reference', header: 'Reference', render: p => p.reference ?? '—' },
          { key: 'tripId', header: 'Trip', render: p => p.tripId ? <Link className="underline" to={`/trips/${p.tripId}`}>{p.tripId}</Link> : '—' },
        ]} />
      </Card>
    </div>
  );
}

function TravellersTab({ data, canWrite }: { data: Customer360; canWrite: boolean }) {
  const navigate = useNavigate();
  const create = useCreateTraveller();
  const [open, setOpen] = useState(false);
  const addButton = canWrite ? <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add traveller</Button> : undefined;
  return (
    <div className="space-y-3">
      {data.travellers.length > 0 && addButton && <div className="flex justify-end">{addButton}</div>}
      <DataTable dense rows={data.travellers} rowKey={t => t.id} onRowClick={t => navigate(`/travellers/${t.id}`)} emptyTitle="No travellers on file" emptyHint="Add the people who travel under this customer: family, colleagues, group members." emptyAction={addButton} columns={[
        { key: 'name', header: 'Name', render: t => `${t.firstName} ${t.lastName}`.trim() },
        { key: 'dateOfBirth', header: 'Date of birth', render: t => fmtDate(t.dateOfBirth) },
        { key: 'passportNumber', header: 'Passport', render: t => t.passportNumber ?? '—' },
        { key: 'passportExpiry', header: 'Expiry', render: t => <PassportPill expiry={t.passportExpiry} /> },
        { key: 'nationality', header: 'Nationality', render: t => t.nationality ?? '—' },
      ]} />
      <Drawer open={open} onOpenChange={o => { setOpen(o); if (!o) create.reset(); }} title={`New traveller for ${data.customer.name}`} width="xl">
        <TravellerForm customerId={data.customer.id} submitting={create.isPending} error={create.error as ApiError | null} onCancel={() => setOpen(false)}
          onSubmit={v => create.mutate(v, { onSuccess: t => { toast.success('Traveller added', `${t.firstName} ${t.lastName}`); setOpen(false); }, onError: e => { if (!(e instanceof ApiError) || (!e.fields && e.code !== 'CONFLICT')) toast.error('Could not add traveller', (e as Error).message); } })} submitLabel="Add traveller" />
      </Drawer>
    </div>
  );
}

function DocumentsTab({ data }: { data: Customer360 }) {
  return <DataTable dense rows={data.documents} rowKey={d => d.linkId} emptyTitle="No documents attached" emptyHint="Upload passports, IDs and receipts from the Documents module." columns={[
    { key: 'title', header: 'Document' }, { key: 'type', header: 'Type', render: d => <StatusPill>{d.type.toLowerCase()}</StatusPill> },
    { key: 'status', header: 'Status', render: d => d.status.toLowerCase() }, { key: 'expiresAt', header: 'Expires', render: d => fmtDate(d.expiresAt) },
    { key: 'createdAt', header: 'Added', render: d => fmtDate(d.createdAt) },
  ]} />;
}

function ActivityTab({ data }: { data: Customer360 }) {
  if (!data.activity.length) return <EmptyState title="No activity yet" compact />;
  return (
    <ol className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
      {data.activity.map(a => (
        <li key={a.id} className="px-4 py-2.5 text-sm flex gap-3">
          <span className="text-xs text-slate-500 whitespace-nowrap w-36 shrink-0">{fmtDateTime(a.timestamp)}</span>
          <span className="flex-1"><span className="font-medium">{a.title ?? a.action.replace(/_/g, ' ')}</span>{a.description && <span className="text-slate-600"> — {a.description}</span>}</span>
          {a.source !== 'HUMAN' && <StatusPill tone="info">{a.source.toLowerCase()}</StatusPill>}
        </li>
      ))}
    </ol>
  );
}

function RelationshipForm({ excludeId, submitting, onSubmit }: { excludeId: string; submitting: boolean; onSubmit: (b: { relatedCustomerId: string; kind: 'FAMILY' | 'GROUP' | 'COMPANY' | 'FRIEND'; note: string | null }) => void }) {
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [kind, setKind] = useState<'FAMILY' | 'GROUP' | 'COMPANY' | 'FRIEND'>('FAMILY');
  const [note, setNote] = useState('');
  return (
    <div className="space-y-4">
      {picked ? (
        <div className="flex items-center justify-between text-sm border border-slate-200 rounded-md px-3 py-2"><span className="font-medium">{picked.name} <span className="text-slate-500">{picked.id}</span></span><button type="button" className="text-slate-500 hover:text-slate-800" onClick={() => setPicked(null)}>Change</button></div>
      ) : <CustomerPicker excludeId={excludeId} onPick={setPicked} />}
      <Field label="Relationship" htmlFor="kind">
        <Select id="kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
          <option value="FAMILY">Family</option><option value="GROUP">Travel group</option><option value="COMPANY">Company contact</option><option value="FRIEND">Friend</option>
        </Select>
      </Field>
      <Field label="Note" htmlFor="note"><TextInput id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. sister, colleague" /></Field>
      <div className="flex justify-end"><Button disabled={!picked} loading={submitting} onClick={() => picked && onSubmit({ relatedCustomerId: picked.id, kind, note: note || null })}>Link customers</Button></div>
    </div>
  );
}
