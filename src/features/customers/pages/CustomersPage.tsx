import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Copy } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, StatusPill, Drawer, Select, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { formatPhone } from '@/shared/calc/phone';
import type { CustomerSummary, CustomerListQuery } from '@/shared/contracts/customers';
import { useCustomerList, useCreateCustomer } from '../hooks';
import { CustomerForm } from '../components/CustomerForm';
import { DuplicatesPanel } from '../components/DuplicatesPanel';
import { ApiError } from '@/lib/api';

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const navigate = useNavigate();
  const { can, role } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [dupesOpen, setDupesOpen] = useState(false);

  const query: Partial<CustomerListQuery> = useMemo(() => ({
    q:        params.get('q') || undefined,
    type:     (params.get('type') as CustomerListQuery['type']) || undefined,
    tag:      params.get('tag') || undefined,
    sort:     (params.get('sort') as CustomerListQuery['sort']) || 'recent',
    page:     Number(params.get('page') || 1),
    pageSize: PAGE_SIZE,
  }), [params]);

  const setParam = (key: string, value: string | number | undefined) => {
    const next = new URLSearchParams(params);
    if (value === undefined || value === '' || value === 1 && key === 'page') next.delete(key); else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const list = useCustomerList(query);
  const create = useCreateCustomer();

  const columns: Column<CustomerSummary>[] = [
    { key: 'name', header: 'Customer', render: c => (
      <div className="min-w-0">
        <div className="font-medium text-slate-900 truncate">{c.name}</div>
        <div className="text-xs text-slate-500">{c.id}{c.companyName ? ` · ${c.companyName}` : ''}</div>
      </div>
    ) },
    { key: 'phone', header: 'Phone', render: c => <span className="tabular-nums">{formatPhone(c.phone)}</span> },
    { key: 'email', header: 'Email', hideBelow: 'md', render: c => <span className="text-slate-600">{c.email ?? '—'}</span> },
    { key: 'city', header: 'City', hideBelow: 'lg', render: c => c.city ?? '—' },
    { key: 'type', header: 'Type', hideBelow: 'sm', render: c => <StatusPill tone={c.type === 'CORPORATE' ? 'accent' : 'neutral'}>{c.type === 'CORPORATE' ? 'Corporate' : 'Individual'}</StatusPill> },
    { key: 'tags', header: 'Tags', hideBelow: 'lg', render: c => c.tags.length ? <span className="text-xs text-slate-600">{c.tags.join(', ')}</span> : null },
    { key: 'trips', header: 'Trips', align: 'right', render: c => <span className="tabular-nums">{c.tripCount}</span> },
    { key: 'lastTrip', header: 'Last trip', hideBelow: 'md', render: c => <span className="text-slate-600">{c.lastTripAt ? fmtDate(c.lastTripAt) : '—'}</span> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader
        title="Customers"
        subtitle={list.data ? `${list.data.total} customer${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            {role === 'ADMIN' && (
              <Button variant="outline" size="sm" onClick={() => setDupesOpen(true)}><Copy className="w-4 h-4 mr-1.5" />Duplicates</Button>
            )}
            {can('customers:write') && (
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5" />New customer</Button>
            )}
          </>
        }
      />
      <Toolbar right={<Link to="/legacy/customers" className="text-xs text-slate-500 hover:text-slate-800 whitespace-nowrap">Classic view</Link>}>
        <SearchInput value={query.q ?? ''} onChange={v => setParam('q', v)} placeholder="Name, phone, email, ID…" autoFocus />
        <Select aria-label="Type" className="w-auto" value={query.type ?? ''} onChange={e => setParam('type', e.target.value)}>
          <option value="">All types</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="CORPORATE">Corporate</option>
        </Select>
        <Select aria-label="Sort" className="w-auto" value={query.sort} onChange={e => setParam('sort', e.target.value)}>
          <option value="recent">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="trips">Most trips</option>
        </Select>
        {query.tag && <StatusPill tone="accent" className="cursor-pointer" ><span onClick={() => setParam('tag', undefined)}>tag: {query.tag} ×</span></StatusPill>}
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          rowKey={c => c.id}
          loading={list.isPending}
          onRowClick={c => navigate(`/customers/${c.id}`)}
          emptyTitle={query.q ? 'No customers match' : 'No customers yet'}
          emptyHint={query.q ? 'Try a different name, phone number or email.' : 'Add your first customer to start building trips.'}
          emptyAction={can('customers:write') && !query.q ? <Button size="sm" onClick={() => setCreateOpen(true)}>New customer</Button> : undefined}
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined}
        />
      </div>

      <Drawer open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) create.reset(); }} title="New customer" description="Phone numbers are checked for duplicates as you type.">
        <CustomerForm
          submitting={create.isPending}
          error={create.error as ApiError | null}
          onCancel={() => setCreateOpen(false)}
          onSubmit={values => create.mutate(values, {
            onSuccess: c => { toast.success('Customer added', `${c.id} · ${c.name}`); setCreateOpen(false); navigate(`/customers/${c.id}`); },
            onError: e => { if (!(e instanceof ApiError) || (!e.fields && e.code !== 'CONFLICT')) toast.error('Could not add customer', (e as Error).message); },
          })}
          submitLabel="Add customer"
        />
      </Drawer>

      <Drawer open={dupesOpen} onOpenChange={setDupesOpen} title="Duplicate customers" description="Customers sharing a phone number. Merging moves trips, invoices and payments to the customer you keep." width="xl">
        <DuplicatesPanel enabled={dupesOpen} />
      </Drawer>
    </div>
  );
}
