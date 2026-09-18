import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader, DataTable, Toolbar, SearchInput, Select, StatusPill, Money, type Column, type Tone } from '@/design-system';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import type { ContractListQuery, ContractStatus } from '@/shared/contracts/contracts';
import { ApiError } from '@/lib/api';
import { useContractList } from '../hooks';
import type { Contract } from '../api';

export const CONTRACT_TONE: Record<ContractStatus, Tone> = { CONFIRMED: 'accent', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'danger' };
export const INSTALMENT_TONE: Record<string, Tone> = { PAID: 'success', PARTIAL: 'warning', DUE: 'warning', OVERDUE: 'danger', UPCOMING: 'neutral' };

export default function ContractsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const query: Partial<ContractListQuery> = useMemo(() => ({ q: params.get('q') || undefined, status: (params.get('status') as ContractStatus) || undefined, customerId: params.get('customerId') || undefined, salesQuoteId: params.get('quoteId') || undefined, includeClosed: params.get('closed') === '1', page: Number(params.get('page') || 1), pageSize: 25 }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useContractList(query);
  const showMoney = can('finance:read') || can('trips:write');

  const cols: Column<Contract>[] = [
    { key: 'contractNumber', header: 'Booking', render: c => <div><div className="font-medium text-slate-900">{c.contractNumber}</div><div className="text-xs text-slate-500">{c.quote.quoteNumber}{c.partyName ? ` · ${c.partyName}` : ''}</div></div> },
    { key: 'customer', header: 'Customer', render: c => <Link to={`/customers/${c.customer.id}`} onClick={e => e.stopPropagation()} className="hover:underline">{c.customer.name}</Link> },
    { key: 'trip', header: 'Trip', render: c => <span>{c.destination} · {fmtDate(c.departureDate)}{c.tripId && <span className="text-xs text-slate-500"> · {c.tripId}</span>}</span> },
    { key: 'pax', header: 'Pax', align: 'right', hideBelow: 'md', render: c => c.adults + c.children + c.infants },
    { key: 'status', header: 'Status', render: c => <StatusPill tone={CONTRACT_TONE[c.status]}>{c.status.replace('_', ' ').toLowerCase()}</StatusPill> },
    ...(showMoney ? [
      { key: 'total', header: 'Total', align: 'right', render: c => <Money value={c.totalAmount} /> } as Column<Contract>,
      { key: 'balance', header: 'Balance', align: 'right', render: c => <span className={c.payments.overdue > 0 ? 'text-red-600' : ''}><Money value={c.payments.balance} /></span> } as Column<Contract>,
      { key: 'next', header: 'Next due', hideBelow: 'lg', render: c => c.payments.next ? <span className="inline-flex items-center gap-1"><StatusPill tone={INSTALMENT_TONE[c.payments.next.status]}>{c.payments.next.label}</StatusPill><span className="text-xs text-slate-500">{fmtDate(c.payments.next.dueDate)}</span></span> : <span className="text-slate-400">settled</span> } as Column<Contract>,
    ] : []),
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Bookings" subtitle={list.data ? `${list.data.total} booking${list.data.total === 1 ? '' : 's'}` : undefined} actions={<Link to="/bookings" className="text-xs text-slate-500 hover:text-slate-800">Service bookings (classic)</Link>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={!!query.includeClosed} onChange={e => setParam('closed', e.target.checked ? '1' : undefined)} />Show completed & cancelled</label>}>
        <SearchInput value={query.q ?? ''} onChange={v => setParam('q', v)} placeholder="Booking, customer, destination, trip…" />
        <Select aria-label="Status" className="w-auto" value={query.status ?? ''} onChange={e => setParam('status', e.target.value)}><option value="">Any status</option>{Object.keys(CONTRACT_TONE).map(s => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</Select>
        {query.salesQuoteId && <StatusPill tone="accent"><span className="cursor-pointer" onClick={() => setParam('quoteId', undefined)}>from quotation ×</span></StatusPill>}
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={c => c.id} loading={list.isPending} onRowClick={c => navigate(`/contracts/${c.id}`)} emptyTitle="No bookings yet" emptyHint="Bookings are created when a quotation is accepted."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
    </div>
  );
}
