import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, CalendarDays, Users } from 'lucide-react';
import { PageHeader, Toolbar, SearchInput, Drawer, Select, StatusPill, Money } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import type { EnquiryListQuery } from '@/shared/contracts/sales';
import { ApiError } from '@/lib/api';
import { useEnquiryList, useEnquiryMutations, useTeam } from '../hooks';
import { EnquiryForm } from '../components/EnquiryForm';
import { Board, ENQUIRY_COLUMNS, paxLabel } from '../components/common';
import type { Enquiry } from '../api';

export default function EnquiriesPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const m = useEnquiryMutations();
  const team = useTeam();

  const query: Partial<EnquiryListQuery> = useMemo(() => ({
    q: params.get('q') || undefined, assignedToUserId: params.get('assignee') || undefined, customerId: params.get('customerId') || undefined,
    includeClosed: params.get('closed') === '1', pageSize: 200,
  }), [params]);
  const setParam = (k: string, v: string | undefined) => { const n = new URLSearchParams(params); if (!v) n.delete(k); else n.set(k, v); setParams(n, { replace: true }); };
  const list = useEnquiryList(query);
  const columns = query.includeClosed ? ENQUIRY_COLUMNS : ENQUIRY_COLUMNS.filter(c => c.status !== 'WON' && c.status !== 'LOST');

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Enquiries" subtitle={list.data ? `${list.data.total} open` : undefined}
        actions={<>
          <Link to="/legacy/enquiries" className="text-xs text-slate-500 hover:text-slate-800">Classic view</Link>
          {can('enquiries:write') && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5" />New enquiry</Button>}
        </>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={!!query.includeClosed} onChange={e => setParam('closed', e.target.checked ? '1' : undefined)} />Show won & lost</label>}>
        <SearchInput value={query.q ?? ''} onChange={v => setParam('q', v || undefined)} placeholder="Customer, phone, destination, ENQ number…" />
        <Select aria-label="Assignee" className="w-auto" value={query.assignedToUserId ?? ''} onChange={e => setParam('assignee', e.target.value || undefined)}>
          <option value="">Anyone</option>{(team.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        {query.customerId && <StatusPill tone="accent"><span className="cursor-pointer" onClick={() => setParam('customerId', undefined)}>customer: {query.customerId} ×</span></StatusPill>}
      </Toolbar>
      {list.isError && <div className="mx-5 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
      <Board columns={columns} items={list.data?.items ?? []} statusOf={e => e.status} keyOf={e => e.id} emptyLabel={list.isPending ? 'Loading…' : 'No enquiries'}
        renderCard={e => <EnquiryCard enquiry={e} onOpen={() => navigate(`/enquiries/${e.id}`)} />} />

      <Drawer open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) { m.create.reset(); setParam('new', undefined); } }} title="New enquiry" description="A concrete trip requirement for a customer. Pax is captured as adults, children and infants so quotes can price per person." width="xl">
        <EnquiryForm submitting={m.create.isPending} error={m.create.error as ApiError | null} onCancel={() => setCreateOpen(false)} submitLabel="Create enquiry"
          customer={params.get('customerId') && params.get('customerName') ? { id: params.get('customerId') as string, name: params.get('customerName') as string } : null}
          onSubmit={v => m.create.mutate(v, { onSuccess: e => { toast.success('Enquiry created', `${e.enquiryNumber} · ${e.destination}`); setCreateOpen(false); navigate(`/enquiries/${e.id}`); }, onError: err => { if (!(err instanceof ApiError) || !err.fields) toast.error('Could not create enquiry', (err as Error).message); } })} />
      </Drawer>
    </div>
  );
}

function EnquiryCard({ enquiry: e, onOpen }: { enquiry: Enquiry; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left bg-white border border-slate-200 rounded-md p-3 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-medium text-slate-900 truncate">{e.customer.name}</div><div className="text-xs text-slate-500">{e.enquiryNumber ?? e.id.slice(0, 8)} · {e.source.toLowerCase()}</div></div>
        {e.priority === 'high' && <StatusPill tone="danger">high</StatusPill>}
      </div>
      <div className="text-sm text-slate-800 mt-1.5 truncate">{e.destination}{e.tripType ? ` · ${e.tripType}` : ''}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mt-1">
        <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />{e.departureDate ? fmtDate(e.departureDate) : e.flexibleDates ? 'flexible' : 'TBD'}</span>
        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{paxLabel(e)}</span>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <span>{e.assignee ? e.assignee.name : 'Unassigned'}{e.quoteCount ? ` · ${e.quoteCount} quote${e.quoteCount > 1 ? 's' : ''}` : ''}</span>
        {e.budget != null && <span><Money value={e.budget} muted />{e.budgetMax != null ? <> – <Money value={e.budgetMax} muted /></> : null}</span>}
      </div>
    </button>
  );
}
