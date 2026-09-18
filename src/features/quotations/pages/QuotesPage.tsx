import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader, DataTable, Toolbar, SearchInput, Select, StatusPill, Money, type Column, type Tone } from '@/design-system';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import type { QuoteListQuery, QuoteStatus } from '@/shared/contracts/quotations';
import { ApiError } from '@/lib/api';
import { useQuoteList } from '../hooks';
import type { QuoteListRow } from '../api';

export const QUOTE_TONE: Record<QuoteStatus, Tone> = { DRAFT: 'neutral', SENT: 'accent', VIEWED: 'info', NEGOTIATING: 'warning', ACCEPTED: 'success', REJECTED: 'danger', EXPIRED: 'neutral' };

export default function QuotesPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const query: Partial<QuoteListQuery> = useMemo(() => ({ q: params.get('q') || undefined, status: (params.get('status') as QuoteStatus) || undefined, customerId: params.get('customerId') || undefined, currentOnly: params.get('all') !== '1', page: Number(params.get('page') || 1), pageSize: 25 }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useQuoteList(query);
  const showMargin = can('finance:read') || can('trips:write');

  const cols: Column<QuoteListRow>[] = [
    { key: 'quoteNumber', header: 'Quote', render: r => <div><div className="font-medium text-slate-900">{r.quoteNumber}</div><div className="text-xs text-slate-500">{r.title ?? r.enquiry.destination}</div></div> },
    { key: 'customer', header: 'Customer', render: r => <Link to={`/customers/${r.customer.id}`} onClick={e => e.stopPropagation()} className="hover:underline">{r.customer.name}</Link> },
    { key: 'trip', header: 'Trip', hideBelow: 'md', render: r => `${r.enquiry.destination}${r.enquiry.departureDate ? ` · ${fmtDate(r.enquiry.departureDate)}` : ''} · ${r.pax} pax` },
    { key: 'status', header: 'Status', render: r => <span className="inline-flex gap-1"><StatusPill tone={QUOTE_TONE[r.status]}>{r.status.toLowerCase()}</StatusPill>{r.approvalStatus === 'PENDING' && <StatusPill tone="danger">approval</StatusPill>}</span> },
    { key: 'total', header: 'Total', align: 'right', render: r => <Money value={r.total} /> },
    ...(showMargin ? [{ key: 'margin', header: 'Margin', align: 'right', hideBelow: 'lg', render: r => <span className={r.margin < 0 ? 'text-red-600' : 'text-emerald-700'}>{r.marginPct}%</span> } as Column<QuoteListRow>] : []),
    { key: 'validUntil', header: 'Valid until', hideBelow: 'md', render: r => fmtDate(r.validUntil) },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Quotations" subtitle={list.data ? `${list.data.total} quotation${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={<><Link to="/sales-quotes" className="text-xs text-slate-500 hover:text-slate-800">Classic builder</Link><Link to="/quotations" className="text-xs text-slate-500 hover:text-slate-800">Legacy quotations</Link></>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={params.get('all') === '1'} onChange={e => setParam('all', e.target.checked ? '1' : undefined)} />Include older versions</label>}>
        <SearchInput value={query.q ?? ''} onChange={v => setParam('q', v)} placeholder="Quote number, customer, destination…" />
        <Select aria-label="Status" className="w-auto" value={query.status ?? ''} onChange={e => setParam('status', e.target.value)}><option value="">All statuses</option>{Object.keys(QUOTE_TONE).map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</Select>
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={r => r.id} loading={list.isPending} onRowClick={r => navigate(`/quotes/${r.id}`)} emptyTitle="No quotations yet" emptyHint="Quotations start from an enquiry: open one and choose New quote."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
    </div>
  );
}
