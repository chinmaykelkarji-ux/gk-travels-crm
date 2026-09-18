import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Send, GitBranch, Copy, CheckCircle2, Eye, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader, KeyValue, Money, StatusPill, Drawer, EmptyState, Field, TextInput, Select, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate, fmtDateTime } from '@/shared/utils/date';
import { QUOTE_TRANSITIONS, EDITABLE_STATUSES, type QuoteStatus } from '@/shared/contracts/quotations';
import { ApiError } from '@/lib/api';
import { useQuote, useQuoteMutations, useCustomerView } from '../hooks';
import { QUOTE_TONE } from './QuotesPage';
import type { QuoteDetail, QuoteItem, CustomerView } from '../api';

export default function QuoteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can, role } = usePermissions();
  const q = useQuote(id);
  const m = useQuoteMutations();
  const [preview, setPreview] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const cv = useCustomerView(id, preview);

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Quotation not found' : 'Could not load quotation'} description={e.message} action={<Button size="sm" variant="outline" onClick={() => navigate('/quotes')}>Back</Button>} /></div>; }
  const d = q.data;
  const canWrite = can('sales-quotes:write');
  const showMargin = can('finance:read') || can('trips:write');
  const editable = EDITABLE_STATUSES.includes(d.status);
  const terminal = ['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(d.status);
  const next = QUOTE_TRANSITIONS[d.status] ?? [];
  const err = (e: unknown) => toast.error('Action failed', (e as Error).message);

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader crumbs={[{ label: 'Quotations', to: '/quotes' }, { label: d.quoteNumber }]} title={d.title ?? `${d.enquiry.destination} — ${d.customer.name}`}
        badge={<><StatusPill tone={QUOTE_TONE[d.status]}>{d.status.toLowerCase()}</StatusPill>{d.approvalStatus === 'PENDING' && <StatusPill tone="danger">needs approval</StatusPill>}{d.approvalStatus === 'APPROVED' && <StatusPill tone="success">approved</StatusPill>}{!d.isCurrent && <StatusPill tone="neutral">superseded</StatusPill>}</>}
        subtitle={<span className="flex flex-wrap gap-x-4">
          <span>{d.quoteNumber} · v{d.version}</span>
          <Link to={`/customers/${d.customer.id}`} className="hover:text-slate-800">{d.customer.name}</Link>
          <Link to={`/enquiries/${d.enquiry.id}`} className="hover:text-slate-800">{d.enquiry.enquiryNumber ?? 'Enquiry'} · {d.enquiry.destination}</Link>
          <span>{d.adults} adults{d.children ? `, ${d.children} children` : ''}{d.infants ? `, ${d.infants} infants` : ''}</span>
          <span>Valid until {fmtDate(d.validUntil)}</span>
        </span>}
        actions={<>
          <Button size="sm" variant="outline" onClick={() => setPreview(p => !p)}><Eye className="w-4 h-4 mr-1.5" />{preview ? 'Internal view' : 'Customer view'}</Button>
          {canWrite && editable && <Button size="sm" variant="outline" onClick={() => navigate(`/quotes/${d.id}/edit`)}><Pencil className="w-4 h-4 mr-1.5" />Edit</Button>}
          {canWrite && (d.status === 'DRAFT' || d.status === 'NEGOTIATING') && <Button size="sm" onClick={() => m.send.mutate(d.id, { onSuccess: () => toast.success('Marked as sent'), onError: err })} loading={m.send.isPending} disabled={d.approvalStatus === 'PENDING'}><Send className="w-4 h-4 mr-1.5" />Send</Button>}
          {canWrite && ['SENT', 'VIEWED', 'NEGOTIATING'].includes(d.status) && <Button size="sm" onClick={() => setAcceptOpen(true)}><CheckCircle2 className="w-4 h-4 mr-1.5" />Accept</Button>}
          {canWrite && next.length > 0 && <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>Status…</Button>}
          {canWrite && !['DRAFT', 'ACCEPTED'].includes(d.status) && <Button size="sm" variant="outline" onClick={() => m.newVersion.mutate(d.id, { onSuccess: v => { toast.success('New version drafted', v.quoteNumber); navigate(`/quotes/${v.id}/edit`); }, onError: err })} loading={m.newVersion.isPending}><GitBranch className="w-4 h-4 mr-1.5" />New version</Button>}
          {canWrite && <Button size="sm" variant="ghost" onClick={() => m.duplicate.mutate(d.id, { onSuccess: v => { toast.success('Duplicated', v.quoteNumber); navigate(`/quotes/${v.id}/edit`); }, onError: err })} loading={m.duplicate.isPending}><Copy className="w-4 h-4" /></Button>}
          {canWrite && d.status === 'DRAFT' && <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete this draft?', variant: 'destructive', confirmLabel: 'Delete' })) m.remove.mutate(d.id, { onSuccess: () => { toast.success('Draft deleted'); navigate('/quotes'); }, onError: err }); }}><Trash2 className="w-4 h-4" /></Button>}
        </>} />

      {d.approvalStatus === 'PENDING' && (
        <div className="mx-5 mt-4 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-700" /><span>Margin is below the threshold. An admin must approve this quotation before it is sent.</span>
          {role === 'ADMIN' && <span className="ml-auto flex gap-2"><Button size="sm" onClick={() => m.approval.mutate({ id: d.id, approve: true }, { onSuccess: () => toast.success('Approved'), onError: err })}>Approve</Button><Button size="sm" variant="outline" onClick={() => m.approval.mutate({ id: d.id, approve: false, comment: 'Revise pricing' }, { onSuccess: () => toast.success('Approval refused'), onError: err })}>Refuse</Button></span>}
        </div>
      )}
      {d.approvalStatus === 'REJECTED' && <div className="mx-5 mt-4 text-sm bg-red-50 border border-red-200 rounded-md px-3 py-2">Approval refused{d.approvalComment ? `: ${d.approvalComment}` : ''}. Revise the pricing and save to re-evaluate.</div>}
      {d.status === 'REJECTED' && d.rejectionReason && <div className="mx-5 mt-4 text-sm bg-slate-100 rounded-md px-3 py-2">Rejected by the customer: {d.rejectionReason}</div>}
      {d.status === 'ACCEPTED' && <div className="mx-5 mt-4 text-sm bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">Accepted on {fmtDate(d.acceptedAt)}. <Link className="underline" to={`/contracts?quoteId=${d.id}`}>View bookings</Link>{d.convertedTripId && <> · Trip <Link className="underline" to={`/trips/${d.convertedTripId}`}>{d.convertedTripId}</Link></>}.</div>}

      {preview ? <CustomerPreview view={cv.data} loading={cv.isPending} /> : <InternalView d={d} showMargin={showMargin} canWrite={canWrite && !terminal} onSelect={(g, i) => m.selectOption.mutate({ id: d.id, optionGroupId: g, itemId: i }, { onError: err })} />}

      <Drawer open={statusOpen} onOpenChange={setStatusOpen} title="Update status">
        <StatusForm options={next} submitting={m.status.isPending} onSubmit={(status, reason) => m.status.mutate({ id: d.id, status, reason }, { onSuccess: () => { toast.success('Status updated'); setStatusOpen(false); }, onError: err })} />
      </Drawer>
      <Drawer open={acceptOpen} onOpenChange={setAcceptOpen} title="Accept quotation" description="Marks the enquiry as won. Bookings are created from the accepted quotation.">
        <AcceptForm parties={d.parties.length} submitting={m.accept.isPending} onSubmit={(split, note) => m.accept.mutate({ id: d.id, splitByParty: split, note }, { onSuccess: () => { toast.success('Quotation accepted'); setAcceptOpen(false); }, onError: err })} />
      </Drawer>
    </div>
  );
}

function basisLabel(i: QuoteItem | CustomerView['items'][number]): string {
  switch (i.pricingBasis) {
    case 'PER_PERSON': return i.rates.filter(r => r.count > 0).map(r => `${r.count} × ${r.band.toLowerCase()} @ ₹${r.sellPrice.toLocaleString('en-IN')}`).join(', ') + (i.nights ? ` × ${i.nights} nights` : '');
    case 'PER_ROOM': return `${i.quantity} room${i.quantity === 1 ? '' : 's'} × ${i.nights ?? 1} night${(i.nights ?? 1) === 1 ? '' : 's'} @ ₹${(i.sellPrice ?? 0).toLocaleString('en-IN')}`;
    case 'PER_GROUP': return `Whole group${i.nights ? ` × ${i.nights}` : ''}`;
    default: return `${i.quantity} × ₹${(i.sellPrice ?? 0).toLocaleString('en-IN')}${i.nights ? ` × ${i.nights} nights` : ''}`;
  }
}

function InternalView({ d, showMargin, canWrite, onSelect }: { d: QuoteDetail; showMargin: boolean; canWrite: boolean; onSelect: (groupId: string, itemId: string) => void }) {
  const t = d.totals;
  const partyName = (id: string | null) => (id ? d.parties.find(p => p.id === id)?.name ?? '?' : null);
  const renderItem = (i: QuoteItem, inGroup: boolean) => (
    <li key={i.id} className={`px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 items-start ${i.totals && !i.totals.included ? 'opacity-60' : ''}`}>
      {inGroup && <input type="radio" aria-label={`Select ${i.description}`} name={`g-${i.optionGroupId}`} checked={i.isSelectedOption} disabled={!canWrite} onChange={() => i.optionGroupId && onSelect(i.optionGroupId, i.id)} className="mt-1" />}
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm text-slate-900">{i.description} <span className="text-xs text-slate-400">{i.serviceType.toLowerCase()}</span>{i.partyId && <StatusPill className="ml-2">{partyName(i.partyId)}</StatusPill>}</div>
        <div className="text-xs text-slate-500">{basisLabel(i)}{i.supplierName ? ` · ${i.supplierName}` : ''}{i.customerNote ? ` · ${i.customerNote}` : ''}</div>
        {i.internalNote && <div className="text-xs text-amber-700">Internal: {i.internalNote}</div>}
      </div>
      <div className="text-right tabular-nums text-sm"><Money value={i.totals?.sell ?? 0} />{showMargin && i.totals && <div className="text-xs text-slate-500">cost <Money value={i.totals.cost} muted /> · <span className={i.totals.margin < 0 ? 'text-red-600' : 'text-emerald-700'}>{i.totals.marginPct}%</span></div>}</div>
    </li>
  );
  return (
    <div className="px-5 py-4 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4 min-w-0">
        <section className="bg-white border border-slate-200 rounded-md">
          <header className="px-4 py-2.5 border-b border-slate-100 text-sm font-medium text-slate-800">Items</header>
          <ul className="divide-y divide-slate-100">{d.items.filter(i => !i.optionGroupId).map(i => renderItem(i, false))}</ul>
          {d.optionGroups.map(g => (
            <div key={g.id} className="border-t border-slate-200">
              <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 bg-slate-50">{g.name} — choose one</div>
              <ul className="divide-y divide-slate-100">{d.items.filter(i => i.optionGroupId === g.id).map(i => renderItem(i, true))}</ul>
            </div>
          ))}
          {d.items.length === 0 && <p className="px-4 py-6 text-sm text-slate-500 text-center">No items.</p>}
        </section>
        <section className="bg-white border border-slate-200 rounded-md p-4">
          <KeyValue columns={2} items={[
            { label: 'Inclusions', value: d.inclusions ? <span className="whitespace-pre-wrap">{d.inclusions}</span> : null }, { label: 'Exclusions', value: d.exclusions ? <span className="whitespace-pre-wrap">{d.exclusions}</span> : null },
            { label: 'Payment policy', value: d.paymentPolicy }, { label: 'Cancellation policy', value: d.cancellationPolicy },
            { label: 'Terms', value: d.termsConditions ? <span className="whitespace-pre-wrap text-xs">{d.termsConditions}</span> : null, span: 2 },
            { label: 'Internal notes', value: d.notes, span: 2 },
          ]} />
        </section>
        <section>
          <h2 className="text-sm font-medium text-slate-800 mb-2">Activity</h2>
          <ol className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{d.activity.map(a => <li key={a.id} className="px-3 py-2 text-sm flex gap-3"><span className="text-xs text-slate-500 w-32 shrink-0">{fmtDateTime(a.timestamp)}</span><span>{a.description}</span></li>)}</ol>
        </section>
      </div>
      <aside className="space-y-3">
        <section className="bg-white border border-slate-200 rounded-md p-4 text-sm space-y-1.5">
          <h2 className="text-sm font-medium text-slate-800 mb-2">Totals</h2>
          <Row label="Subtotal"><Money value={t.subtotal} /></Row>
          {t.discountAmount > 0 && <Row label="Discount">− <Money value={t.discountAmount} /></Row>}
          {d.gstMode !== 'NONE' && <Row label={`GST ${d.gstRate}%${d.gstMode === 'INCLUDED' ? ' (incl.)' : ''}`}><Money value={t.tax} /></Row>}
          <Row label="Customer pays" strong><Money value={t.total} /></Row>
          {t.perPerson !== null && <Row label={`Per person (${t.pax})`}><Money value={t.perPerson} /></Row>}
          {showMargin && <><div className="border-t border-slate-100 my-2" /><Row label="Cost"><Money value={t.cost} muted /></Row><Row label="Margin"><span className={t.margin < 0 ? 'text-red-600' : 'text-emerald-700'}><Money value={t.margin} /> ({t.marginPct}%)</span></Row></>}
          {t.parties.length > 0 && <div className="pt-2"><div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Per party</div>{t.parties.map(p => <Row key={p.partyId} label={`${p.name} (${p.pax})`}><Money value={p.total} /></Row>)}</div>}
        </section>
        {d.versions.length > 1 && (
          <section className="bg-white border border-slate-200 rounded-md p-4 text-sm">
            <h2 className="text-sm font-medium text-slate-800 mb-2">Versions</h2>
            <ul className="space-y-1">{d.versions.map(v => <li key={v.id} className="flex justify-between gap-2"><Link to={`/quotes/${v.id}`} className={v.id === d.id ? 'font-medium' : 'hover:underline'}>v{v.version} · {v.status.toLowerCase()}</Link><Money value={v.totalAmount} muted /></li>)}</ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function CustomerPreview({ view, loading }: { view: CustomerView | undefined; loading: boolean }) {
  if (loading || !view) return <div className="p-6 text-sm text-slate-500">Preparing customer view…</div>;
  const renderItem = (i: CustomerView['items'][number]) => (
    <li key={i.id} className={`flex justify-between gap-4 px-4 py-2 ${i.optionGroupId && !i.isSelectedOption ? 'text-slate-400' : ''}`}><div><div>{i.description}</div><div className="text-xs text-slate-500">{basisLabel(i)}{i.customerNote ? ` · ${i.customerNote}` : ''}</div></div><Money value={i.amount} /></li>
  );
  return (
    <div className="px-5 py-4">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-md p-6 text-sm space-y-5">
        <div className="flex justify-between gap-4">
          <div><div className="text-lg font-semibold">{view.company?.companyName ?? 'Quotation'}</div><div className="text-xs text-slate-500">{[view.company?.addressLine1, view.company?.city, view.company?.phone, view.company?.email].filter(Boolean).join(' · ')}{view.company?.gstin ? ` · GSTIN ${view.company.gstin}` : ''}</div></div>
          <div className="text-right"><div className="font-medium">{view.quoteNumber}</div><div className="text-xs text-slate-500">Valid until {fmtDate(view.validUntil)}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-4"><div><div className="text-[11px] uppercase text-slate-500">Prepared for</div><div>{view.customer.name}</div><div className="text-xs text-slate-500">{view.customer.phone}{view.customer.email ? ` · ${view.customer.email}` : ''}</div></div><div><div className="text-[11px] uppercase text-slate-500">Trip</div><div>{view.title ?? view.trip.destination}</div><div className="text-xs text-slate-500">{view.trip.departureDate ? `${fmtDate(view.trip.departureDate)}${view.trip.returnDate ? ` → ${fmtDate(view.trip.returnDate)}` : ''} · ` : ''}{view.trip.adults} adults{view.trip.children ? `, ${view.trip.children} children` : ''}{view.trip.infants ? `, ${view.trip.infants} infants` : ''}</div></div></div>
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded">{view.items.map(renderItem)}</ul>
        {view.optionGroups.map(g => <div key={g.id}><div className="text-[11px] uppercase text-slate-500 mb-1">{g.name} — please choose</div><ul className="divide-y divide-slate-100 border border-slate-100 rounded">{g.options.map(renderItem)}</ul></div>)}
        <div className="ml-auto w-72 space-y-1">
          <Row label="Subtotal"><Money value={view.totals.subtotal} /></Row>
          {view.totals.discountAmount > 0 && <Row label="Discount">− <Money value={view.totals.discountAmount} /></Row>}
          {view.gstMode !== 'NONE' && <Row label={`GST ${view.gstRate}%`}><Money value={view.totals.tax} /></Row>}
          <Row label="Total" strong><Money value={view.totals.total} /></Row>
          {view.totals.perPerson !== null && <Row label="Per person"><Money value={view.totals.perPerson} /></Row>}
          {view.totals.parties.map(p => <Row key={p.partyId} label={`${p.name} (${p.pax})`}><Money value={p.total} /></Row>)}
        </div>
        <KeyValue columns={2} items={[{ label: 'Inclusions', value: view.inclusions ? <span className="whitespace-pre-wrap">{view.inclusions}</span> : null }, { label: 'Exclusions', value: view.exclusions ? <span className="whitespace-pre-wrap">{view.exclusions}</span> : null }, { label: 'Payment', value: view.paymentPolicy }, { label: 'Cancellation', value: view.cancellationPolicy }, { label: 'Terms', value: view.termsConditions ? <span className="whitespace-pre-wrap text-xs">{view.termsConditions}</span> : null, span: 2 }]} />
      </div>
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return <div className={`flex justify-between gap-2 ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}><span>{label}</span><span className="tabular-nums text-right">{children}</span></div>;
}

function StatusForm({ options, submitting, onSubmit }: { options: QuoteStatus[]; submitting: boolean; onSubmit: (s: QuoteStatus, reason: string | null) => void }) {
  const [status, setStatus] = useState<QuoteStatus>(options[0]);
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3">
      <Field label="Status" htmlFor="qs"><Select id="qs" value={status} onChange={e => setStatus(e.target.value as QuoteStatus)}>{options.map(o => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}</Select></Field>
      {status === 'REJECTED' && <Field label="Customer's reason" htmlFor="qr" required><TextInput id="qr" value={reason} onChange={e => setReason(e.target.value)} /></Field>}
      <div className="flex justify-end"><Button size="sm" loading={submitting} disabled={status === 'REJECTED' && !reason.trim()} onClick={() => onSubmit(status, reason.trim() || null)}>Update</Button></div>
    </div>
  );
}

function AcceptForm({ parties, submitting, onSubmit }: { parties: number; submitting: boolean; onSubmit: (split: boolean, note: string | null) => void }) {
  const [split, setSplit] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3">
      {parties >= 2 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />Create one booking per party ({parties} parties) — each with its own payments and invoice</label>}
      <Field label="Note" htmlFor="an"><Textarea id="an" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Advance received, confirmed on WhatsApp…" /></Field>
      <div className="flex justify-end"><Button loading={submitting} onClick={() => onSubmit(split, note.trim() || null)}>Accept quotation</Button></div>
    </div>
  );
}
