import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, EmptyState } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { useEnquiry } from '@/features/sales/hooks';
import { useQuote, useQuoteMutations } from '../hooks';
import { QuoteBuilder, stateFromQuote } from '../components/QuoteBuilder';
import { EDITABLE_STATUSES } from '@/shared/contracts/quotations';

/** /quotes/new?enquiryId=… creates; /quotes/:id/edit updates a draft or negotiating quote. */
export default function QuoteEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const m = useQuoteMutations();
  const enquiryId = params.get('enquiryId') ?? undefined;
  const existing = useQuote(id);
  const enquiry = useEnquiry(id ? undefined : enquiryId);

  if (id) {
    if (existing.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
    if (existing.isError) return <div className="p-6"><EmptyState title="Quotation not found" description={(existing.error as ApiError).message} /></div>;
    const q = existing.data;
    if (!EDITABLE_STATUSES.includes(q.status)) return <div className="p-6"><EmptyState title={`A ${q.status.toLowerCase()} quotation cannot be edited`} description="Create a new version from the quotation page instead." action={<Button size="sm" onClick={() => navigate(`/quotes/${q.id}`)}>Open quotation</Button>} /></div>;
    return (
      <div className="min-h-full bg-slate-50">
        <PageHeader crumbs={[{ label: 'Quotations', to: '/quotes' }, { label: q.quoteNumber, to: `/quotes/${q.id}` }, { label: 'Edit' }]} title={`Edit ${q.quoteNumber}`} subtitle={`${q.customer.name} · ${q.enquiry.destination}`} />
        <QuoteBuilder initial={stateFromQuote(q, { adults: q.adults, children: q.children, infants: q.infants })} submitting={m.update.isPending} error={m.update.error as ApiError | null} submitLabel="Save quotation" onCancel={() => navigate(`/quotes/${q.id}`)}
          onSubmit={body => m.update.mutate({ id: q.id, body }, { onSuccess: () => { toast.success('Quotation saved'); navigate(`/quotes/${q.id}`); }, onError: e => toast.error('Could not save', (e as Error).message) })} />
      </div>
    );
  }

  if (!enquiryId) return <div className="p-6"><EmptyState title="Start from an enquiry" description="Open an enquiry and choose New quote." action={<Button size="sm" onClick={() => navigate('/enquiries')}>Go to enquiries</Button>} /></div>;
  if (enquiry.isPending) return <div className="p-6 text-sm text-slate-500">Loading enquiry…</div>;
  if (enquiry.isError) return <div className="p-6"><EmptyState title="Enquiry not found" description={(enquiry.error as ApiError).message} /></div>;
  const e = enquiry.data;
  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: e.enquiryNumber ?? e.id, to: `/enquiries/${e.id}` }, { label: 'New quotation' }]} title={`Quote ${e.destination} for ${e.customer.name}`} subtitle={`${e.adults} adults${e.children ? `, ${e.children} children` : ''}${e.infants ? `, ${e.infants} infants` : ''}${e.departureDate ? ` · from ${e.departureDate}` : ''}${e.budget ? ` · budget ₹${e.budget.toLocaleString('en-IN')}` : ''}`} />
      <QuoteBuilder initial={stateFromQuote(null, { adults: e.adults, children: e.children, infants: e.infants })} submitting={m.create.isPending} error={m.create.error as ApiError | null} submitLabel="Create draft" onCancel={() => navigate(`/enquiries/${e.id}`)}
        onSubmit={body => m.create.mutate({ enquiryId: e.id, ...body }, { onSuccess: q => { toast.success('Quotation drafted', q.quoteNumber); navigate(`/quotes/${q.id}`); }, onError: err => toast.error('Could not create', (err as Error).message) })} />
    </div>
  );
}
