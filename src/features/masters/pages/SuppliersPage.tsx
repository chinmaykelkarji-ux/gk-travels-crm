import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, Select, StatusPill, Drawer, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { formatPhone } from '@/shared/calc/phone';
import { VendorKind, VENDOR_KIND_LABEL, type VendorInput } from '@/shared/contracts/masters';
import { ApiError } from '@/lib/api';
import { mastersApi, type Vendor } from '../api';
import { useVendors, useMasterMutation } from '../hooks';
import { VendorForm } from '../components/VendorForm';
import { ImportDrawer } from '../components/ImportDrawer';
import { DocumentsPanel } from '@/features/documents/components/DocumentsPanel';

export default function SuppliersPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const q = useMemo(() => ({ q: params.get('q') || undefined, kind: params.get('kind') || undefined, includeInactive: params.get('inactive') === '1', page: Number(params.get('page') || 1), pageSize: 50 }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useVendors(q);
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const save = useMasterMutation(({ id, body }: { id?: string; body: VendorInput }) => (id ? mastersApi.updateVendor(id, body) : mastersApi.createVendor(body)));
  const canWrite = can('suppliers:write');

  const cols: Column<Vendor>[] = [
    { key: 'name', header: 'Vendor', render: v => <div><div className="font-medium text-slate-900">{v.name}{!v.isActive && <StatusPill className="ml-2">inactive</StatusPill>}</div><div className="text-xs text-slate-500">{v.id}{v.contactPerson ? ` · ${v.contactPerson}` : ''}</div></div> },
    { key: 'kind', header: 'Kind', render: v => <StatusPill tone="accent">{VENDOR_KIND_LABEL[v.kind]}</StatusPill> },
    { key: 'phone', header: 'Phone', render: v => <a href={`tel:${v.phone}`} onClick={e => e.stopPropagation()} className="hover:underline">{formatPhone(v.phone)}</a> },
    { key: 'city', header: 'City', hideBelow: 'md', render: v => v.city ?? <span className="text-slate-400">—</span> },
    { key: 'gst', header: 'GSTIN', hideBelow: 'lg', render: v => v.gstNumber ?? <span className="text-slate-400">—</span> },
    { key: 'linked', header: 'Linked', hideBelow: 'lg', render: v => <span className="text-xs text-slate-500">{[v.counts.hotels && `${v.counts.hotels} hotels`, v.counts.vehicles && `${v.counts.vehicles} vehicles`, v.counts.drivers && `${v.counts.drivers} drivers`, v.counts.activities && `${v.counts.activities} activities`].filter(Boolean).join(' · ') || '—'}</span> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Suppliers" subtitle={list.data ? `${list.data.total} vendor${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={<>
          <Link to="/vendors" className="text-xs text-slate-500 hover:text-slate-800">Classic suppliers &amp; payables</Link>
          {canWrite && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><Upload className="w-4 h-4 mr-1.5" />Import</Button>}
          {canWrite && <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-1.5" />Vendor</Button>}
        </>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={q.includeInactive} onChange={e => setParam('inactive', e.target.checked ? '1' : undefined)} />Show inactive</label>}>
        <SearchInput value={q.q ?? ''} onChange={v => setParam('q', v)} placeholder="Name, phone, GSTIN, contact…" />
        <Select aria-label="Kind" className="w-auto" value={q.kind ?? ''} onChange={e => setParam('kind', e.target.value)}>
          <option value="">All kinds</option>{VendorKind.options.map(k => <option key={k} value={k}>{VENDOR_KIND_LABEL[k]}</option>)}
        </Select>
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={v => v.id} loading={list.isPending} onRowClick={canWrite ? v => setEditing(v) : undefined}
          emptyTitle="No vendors yet" emptyHint="Add DMCs, consolidators, hotels, cab owners and activity providers — or import a spreadsheet."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
      <Drawer open={!!editing} onOpenChange={o => !o && setEditing(null)} title={editing === 'new' ? 'New vendor' : editing ? editing.name : ''}>
        {editing && <VendorForm initial={editing === 'new' ? undefined : editing} canEditBank={can('finance:read')} submitting={save.isPending} error={save.error as ApiError | null}
          onCancel={() => setEditing(null)}
          onSubmit={body => save.mutate({ id: editing === 'new' ? undefined : editing.id, body }, { onSuccess: v => { toast.success(editing === 'new' ? 'Vendor added' : 'Vendor saved', v.name); setEditing(null); save.reset(); } })} />}
        {editing && editing !== 'new' && (
          <div className="mt-4">
            <DocumentsPanel entityType="vendor" entityId={editing.id} title="Agreements, rate sheets and bills" />
          </div>
        )}
      </Drawer>
      <ImportDrawer kind="vendors" open={importing} onOpenChange={setImporting} />
    </div>
  );
}
