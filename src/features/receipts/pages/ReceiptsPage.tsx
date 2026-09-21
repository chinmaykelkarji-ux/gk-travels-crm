import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { DataTable, Drawer, Money, PageHeader, Select, StatusPill, TextInput, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { istToday } from '@/shared/calc/istTime';
import { fmtDate } from '@/shared/utils/date';
import { RECEIPT_MODE_LABEL, ReceiptMode } from '@/shared/contracts/receipts';
import { receiptsApi, type Receipt } from '../api';
import { useDayBook, useReceipts, useReceiptMutation } from '../hooks';
import { ReceiptForm } from '../components/ReceiptForm';
import { ReceivablesTab } from '@/features/finance/components/ReceivablesTab';

/** Money in and out, day by day: what was collected today and everything before it. */
export default function ReceiptsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<'money' | 'owed'>('money');
  const [day] = useState(istToday());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = useReceipts({ from: from || undefined, to: to || undefined, mode: (mode || undefined) as never, q: q || undefined, includeCancelled: true, pageSize: 100 });
  const book = useDayBook(day);
  const importClassic = useReceiptMutation(() => receiptsApi.importClassic());

  const cols: Column<Receipt>[] = [
    { key: 'date', header: 'Date', width: '110px', render: r => fmtDate(r.receivedAt) },
    { key: 'id', header: 'Receipt', width: '140px', render: r => <span className="tabular-nums">{r.id}</span> },
    { key: 'who', header: 'From', render: r => (
      <span>{r.customer?.name ?? '—'}
        {r.contract && <span className="text-xs text-slate-500"> · {r.contract.partyName ?? r.contract.contractNumber}</span>}
        {r.trip && <Link className="ml-2 text-xs text-indigo-600 hover:underline" to={`/trips/${r.trip.id}`}>{r.trip.label}</Link>}
      </span>
    ) },
    { key: 'mode', header: 'How', hideBelow: 'md', render: r => <span>{r.modeLabel}{r.reference ? <span className="text-xs text-slate-500"> · {r.reference}</span> : ''}</span> },
    { key: 'status', header: '', hideBelow: 'lg', render: r => <>{r.kind === 'REFUND' && <StatusPill tone="warning">refund</StatusPill>}{r.status === 'CANCELLED' && <StatusPill tone="neutral">cancelled</StatusPill>}</> },
    { key: 'amount', header: 'Amount', align: 'right', render: r => <Money value={r.kind === 'REFUND' ? -r.amount : r.amount} paise className={r.status === 'CANCELLED' ? 'line-through text-slate-400' : undefined} /> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Receipts" subtitle="Money received from customers and refunds paid back, each against the family that paid"
        actions={can('payments:write') ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" loading={importClassic.isPending} title="Bring customer payments recorded on the classic screens into the books"
              onClick={() => importClassic.mutate(undefined, {
                onSuccess: r => toast.success('Classic payments imported', `${r.imported} brought in${r.unsorted ? `, ${r.unsorted} with no method recorded` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}`),
                onError: e => toast.error('Import failed', (e as ApiError).message),
              })}><Download className="w-4 h-4 mr-1" />Import classic</Button>
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" />Record money</Button>
          </div>
        ) : undefined} />

      <nav className="px-5 flex gap-1 border-b border-slate-200 bg-white" role="tablist">
        {([['money', 'Money in'], ['owed', 'Owed to us']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === id ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </nav>

      <div className="px-5 py-4 space-y-4">
        {tab === 'owed' && <ReceivablesTab />}
        {tab === 'money' && <>
        <section className="bg-white border border-slate-200 rounded-md p-4">
          <h2 className="text-sm font-medium text-slate-800">Today, {fmtDate(day)}</h2>
          {book.isPending ? <p className="text-sm text-slate-500 mt-1">Loading…</p> : (
            <div className="mt-2 flex flex-wrap gap-6 text-sm">
              <div><div className="text-2xl font-semibold text-slate-900"><Money value={book.data?.total ?? 0} paise /></div><div className="text-xs text-slate-500">{book.data?.receipts.length ?? 0} entries</div></div>
              {(book.data?.byMode ?? []).map(m => <div key={m.mode}><div className="font-medium"><Money value={m.amount} paise /></div><div className="text-xs text-slate-500">{m.label}</div></div>)}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <TextInput type="date" className="w-auto" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
          <TextInput type="date" className="w-auto" aria-label="To" value={to} onChange={e => setTo(e.target.value)} />
          <Select aria-label="How" className="w-auto" value={mode} onChange={e => setMode(e.target.value)}>
            <option value="">Any method</option>
            {ReceiptMode.options.map(m => <option key={m} value={m}>{RECEIPT_MODE_LABEL[m]}</option>)}
          </Select>
          <TextInput className="w-56" placeholder="Search receipt, reference or note" value={q} onChange={e => setQ(e.target.value)} />
          {list.data && <span className="ml-auto text-sm text-slate-600">Net <strong><Money value={list.data.totals.net} paise /></strong> of {list.data.total} entries</span>}
        </div>

        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={r => r.id} loading={list.isPending} dense
          emptyTitle="No receipts yet" emptyHint="Record money as it comes in, or import what the classic screens already hold." />
        </>}
      </div>

      <Drawer open={adding} onOpenChange={setAdding} title="Record money">
        {adding && <ReceiptForm onDone={() => setAdding(false)} />}
      </Drawer>
    </div>
  );
}
