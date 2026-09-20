import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { DataTable, Drawer, EmptyState, Money, PageHeader, Select, StatusPill, TextInput, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { fmtDate } from '@/shared/utils/date';
import { BillCategory, BILL_CATEGORY_LABEL } from '@/shared/contracts/payables';
import { payablesApi, type VendorBill, type VendorPayment } from '../api';
import { useAging, useBills, usePayableMutation, useVendorPayments } from '../hooks';
import { BillForm } from '../components/BillForm';
import { PayForm } from '../components/PayForm';

type Tab = 'owed' | 'bills' | 'payments';
const TABS: { id: Tab; label: string }[] = [{ id: 'owed', label: 'What we owe' }, { id: 'bills', label: 'Bills' }, { id: 'payments', label: 'Payments' }];

/** Supplier money: what is owed and how late, every bill, every payment. */
export default function PayablesPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'owed';
  const [status, setStatus] = useState('OPEN');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [addingBill, setAddingBill] = useState(false);
  const [paying, setPaying] = useState<VendorBill | 'new' | null>(null);
  const [cancelling, setCancelling] = useState<{ kind: 'bill' | 'payment'; id: string; label: string } | null>(null);
  const [reason, setReason] = useState('');

  const aging = useAging(tab === 'owed');
  const bills = useBills({ status: status as never, category: (category || undefined) as never, q: q || undefined, pageSize: 100 }, tab === 'bills');
  const payments = useVendorPayments({ q: q || undefined, status: 'ALL', pageSize: 100 }, tab === 'payments');
  const cancel = usePayableMutation(async (c: { kind: 'bill' | 'payment'; id: string }) => { await (c.kind === 'bill' ? payablesApi.cancelBill(c.id, reason) : payablesApi.cancelPay(c.id, reason)); });
  const importClassic = usePayableMutation(() => payablesApi.importClassic());
  const canWrite = can('finance:write');

  const billCols: Column<VendorBill>[] = [
    { key: 'date', header: 'Bill date', width: '110px', render: b => fmtDate(b.billDate) },
    { key: 'vendor', header: 'Supplier', render: b => <span>{b.vendor?.name ?? b.vendorId}<span className="block text-xs text-slate-500">{b.billNumber}{b.description ? ` · ${b.description}` : ''}</span></span> },
    { key: 'cat', header: 'For', hideBelow: 'md', render: b => <span>{b.categoryLabel}{b.trip && <Link className="block text-xs text-indigo-600 hover:underline" to={`/trips/${b.trip.id}`}>{b.trip.label}</Link>}</span> },
    { key: 'due', header: 'Pay by', hideBelow: 'md', render: b => b.dueDate ? <span className={b.daysOverdue > 0 ? 'text-red-600' : undefined}>{fmtDate(b.dueDate)}{b.daysOverdue > 0 ? ` · ${b.daysOverdue}d late` : ''}</span> : <span className="text-slate-400">—</span> },
    { key: 'amount', header: 'Bill', align: 'right', render: b => <Money value={b.amount} paise /> },
    { key: 'outstanding', header: 'Left to pay', align: 'right', render: b => b.status === 'CANCELLED' ? <StatusPill tone="neutral">cancelled</StatusPill> : b.outstanding > 0 ? <strong><Money value={b.outstanding} paise /></strong> : <StatusPill tone="success">paid</StatusPill> },
    { key: 'act', header: '', align: 'right', render: b => canWrite && b.status === 'OPEN' ? (
      <span className="flex gap-2 justify-end">
        <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={e => { e.stopPropagation(); setPaying(b); }}>Pay</button>
        <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={e => { e.stopPropagation(); setCancelling({ kind: 'bill', id: b.id, label: `${b.billNumber} (${b.vendor?.name ?? ''})` }); setReason(''); }}>Cancel</button>
      </span>
    ) : null },
  ];
  const payCols: Column<VendorPayment>[] = [
    { key: 'date', header: 'Date', width: '110px', render: p => fmtDate(p.paidAt) },
    { key: 'id', header: 'Payment', width: '130px', render: p => <span className="tabular-nums">{p.id}</span> },
    { key: 'vendor', header: 'Supplier', render: p => <span>{p.vendor?.name}<span className="block text-xs text-slate-500">{p.bill ? `bill ${p.bill.billNumber}` : 'advance — no bill yet'}{p.reference ? ` · ${p.reference}` : ''}</span></span> },
    { key: 'mode', header: 'How', hideBelow: 'md', render: p => p.mode.toLowerCase().replace('_', ' ') },
    { key: 'amount', header: 'Amount', align: 'right', render: p => <Money value={p.amount} paise className={p.status === 'CANCELLED' ? 'line-through text-slate-400' : undefined} /> },
    { key: 'act', header: '', align: 'right', render: p => canWrite && p.status === 'POSTED' ? <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => { setCancelling({ kind: 'payment', id: p.id, label: p.id }); setReason(''); }}>Cancel</button> : null },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Supplier money" subtitle="Bills from hotels, transporters, consolidators and activity providers, and what has been paid"
        actions={canWrite ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" loading={importClassic.isPending} title="Bring the classic payables screen into the books"
              onClick={() => importClassic.mutate(undefined, {
                onSuccess: r => toast.success('Classic payables imported', `${r.bills} bill(s), ${r.payments} payment(s)${r.skipped ? `, ${r.skipped} skipped` : ''}`),
                onError: e => toast.error('Import failed', (e as ApiError).message),
              })}><Download className="w-4 h-4 mr-1" />Import classic</Button>
            <Button size="sm" variant="outline" onClick={() => setPaying('new')}>Pay a supplier</Button>
            <Button size="sm" onClick={() => setAddingBill(true)}><Plus className="w-4 h-4 mr-1" />Bill</Button>
          </div>
        ) : undefined} />
      <nav className="px-5 flex gap-1 border-b border-slate-200 bg-white" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams(p => { p.set('tab', t.id); return p; }, { replace: true })}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
        ))}
      </nav>

      <div className="px-5 py-4 space-y-4">
        {tab === 'owed' && (
          aging.isPending ? <p className="text-sm text-slate-500">Loading…</p> : !aging.data ? null : (
            <>
              <section className="bg-white border border-slate-200 rounded-md p-4">
                <div className="flex flex-wrap gap-6">
                  <div><div className="text-2xl font-semibold text-slate-900"><Money value={aging.data.total} paise /></div><div className="text-xs text-slate-500">owed in total</div></div>
                  <div><div className="text-2xl font-semibold text-red-700"><Money value={aging.data.overdue} paise /></div><div className="text-xs text-slate-500">past its date</div></div>
                  {aging.data.unappliedAdvances > 0 && <div><div className="text-2xl font-semibold text-slate-900"><Money value={aging.data.unappliedAdvances} paise /></div><div className="text-xs text-slate-500">advances paid, no bill yet</div></div>}
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {aging.data.buckets.map(b => (
                    <div key={b.key} className={`rounded-md border p-2 ${b.key === 'current' ? 'border-slate-200' : b.amount > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
                      <div className="text-sm font-medium"><Money value={b.amount} paise /></div><div className="text-[11px] text-slate-500">{b.label}</div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="bg-white border border-slate-200 rounded-md">
                <h2 className="px-4 py-2 text-sm font-medium text-slate-800 border-b border-slate-100">By supplier</h2>
                {aging.data.vendors.length === 0 ? <EmptyState compact title="Nothing owed" description="Every supplier bill recorded so far is settled." /> : (
                  <ul className="divide-y divide-slate-100">{aging.data.vendors.map(v => (
                    <li key={v.vendorId} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div><div className="text-slate-900">{v.vendor}</div><div className="text-xs text-slate-500">{v.bills} open bill{v.bills === 1 ? '' : 's'}{v.overdue > 0 ? ` · ₹${v.overdue.toLocaleString('en-IN')} late` : ''}</div></div>
                      <Money value={v.outstanding} paise />
                    </li>
                  ))}</ul>
                )}
              </section>
              <DataTable columns={billCols} rows={aging.data.bills} rowKey={b => b.id} dense emptyTitle="No open bills" />
            </>
          )
        )}

        {tab !== 'owed' && (
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'bills' && (
              <>
                <Select aria-label="Status" className="w-auto" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="OPEN">Open</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option><option value="ALL">All</option>
                </Select>
                <Select aria-label="Category" className="w-auto" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Anything</option>
                  {BillCategory.options.map(c => <option key={c} value={c}>{BILL_CATEGORY_LABEL[c]}</option>)}
                </Select>
              </>
            )}
            <TextInput className="w-64" placeholder="Search supplier, bill number or reference" value={q} onChange={e => setQ(e.target.value)} />
            {tab === 'bills' && bills.data && <span className="ml-auto text-sm text-slate-600">Left to pay <strong><Money value={bills.data.totals.outstanding} paise /></strong> of <Money value={bills.data.totals.billed} paise /></span>}
          </div>
        )}
        {tab === 'bills' && <DataTable columns={billCols} rows={bills.data?.items ?? []} rowKey={b => b.id} loading={bills.isPending} dense emptyTitle="No bills here" emptyHint="Record a supplier bill when it arrives, or import the classic payables." />}
        {tab === 'payments' && <DataTable columns={payCols} rows={payments.data?.items ?? []} rowKey={p => p.id} loading={payments.isPending} dense emptyTitle="Nothing paid yet" />}
      </div>

      <Drawer open={addingBill} onOpenChange={setAddingBill} title="Supplier bill" width="xl">{addingBill && <BillForm onDone={() => setAddingBill(false)} />}</Drawer>
      <Drawer open={!!paying} onOpenChange={o => { if (!o) setPaying(null); }} title="Pay a supplier" width="xl">
        {paying && <PayForm bill={paying === 'new' ? undefined : paying} onDone={() => setPaying(null)} />}
      </Drawer>
      <Drawer open={!!cancelling} onOpenChange={o => { if (!o) { setCancelling(null); cancel.reset(); } }} title={cancelling ? `Cancel ${cancelling.label}` : ''}>
        {cancelling && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">The row stays in the records and its entry in the books is reversed.</p>
            <TextInput placeholder="Why?" value={reason} onChange={e => setReason(e.target.value)} />
            {cancel.error && <p className="text-sm text-red-600">{(cancel.error as ApiError).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelling(null)}>Back</Button>
              <Button variant="destructive" loading={cancel.isPending} disabled={reason.trim().length < 3}
                onClick={() => cancel.mutate(cancelling, { onSuccess: () => { toast.success('Cancelled'); setCancelling(null); } })}>Cancel it</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
