import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { DataTable, Drawer, Money, PageHeader, Select, StatusPill, TextInput, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { istToday, addDays } from '@/shared/calc/istTime';
import { fmtDate } from '@/shared/utils/date';
import { ExpenseCategory, EXPENSE_CATEGORY_LABEL } from '@/shared/contracts/expenses';
import { expensesApi, type Expense, type Owed } from '../api';
import { useExpenses, useExpenseMutation, useOwed } from '../hooks';
import { ExpenseForm } from '../components/ExpenseForm';

/** Everything the business spends outside supplier bills, and what staff are owed back. */
export default function ExpensesPage() {
  const { can } = usePermissions();
  const [from, setFrom] = useState(addDays(istToday(), -30));
  const [to, setTo] = useState(istToday());
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [settling, setSettling] = useState<Owed | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [mode, setMode] = useState('CASH');
  const [cancelling, setCancelling] = useState<Expense | null>(null);
  const [reason, setReason] = useState('');

  const list = useExpenses({ from, to, category: (category || undefined) as never, q: q || undefined, includeCancelled: true, pageSize: 100 });
  const owed = useOwed(can('expenses:read'));
  const cancel = useExpenseMutation((id: string) => expensesApi.cancel(id, reason));
  const settle = useExpenseMutation(() => expensesApi.reimburse({ userId: settling!.userId, amount: Number(settleAmount), mode: mode as never, paidAt: istToday(), reference: null }));

  const cols: Column<Expense>[] = [
    { key: 'date', header: 'Date', width: '110px', render: e => fmtDate(e.date) },
    { key: 'what', header: 'What', render: e => (
      <span>{e.description}
        <span className="block text-xs text-slate-500">{e.categoryLabel}{e.vendor ? ` · ${e.vendor.name}` : ''}{e.trip ? '' : ''}</span>
      </span>
    ) },
    { key: 'trip', header: 'Trip', hideBelow: 'md', render: e => e.trip ? <Link className="text-indigo-600 hover:underline" to={`/trips/${e.trip.id}`}>{e.trip.label}</Link> : <span className="text-slate-400">—</span> },
    { key: 'paid', header: 'Paid with', hideBelow: 'md', render: e => <span>{e.paidByLabel}{e.paidByUser ? <span className="block text-xs text-slate-500">{e.paidByUser.name}</span> : null}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: e => <Money value={e.amount} paise className={e.status === 'CANCELLED' ? 'line-through text-slate-400' : undefined} /> },
    { key: 'act', header: '', align: 'right', render: e => e.status === 'CANCELLED' ? <StatusPill tone="neutral">cancelled</StatusPill>
      : can('expenses:write') ? <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => { setCancelling(e); setReason(''); }}>Cancel</button> : null },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Spending" subtitle="Fuel, tolls, food on the road, tips and office costs — everything paid directly"
        actions={can('expenses:write') ? <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" />Expense</Button> : undefined} />
      <div className="px-5 py-4 space-y-4">
        {(owed.data?.length ?? 0) > 0 && (
          <section className="bg-white border border-amber-200 rounded-md p-4">
            <h2 className="text-sm font-medium text-slate-800">Owed back to staff</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {owed.data!.map(o => (
                <li key={o.userId} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span>{o.name}</span>
                  <span className="flex items-center gap-3"><Money value={o.owed} paise />
                    {can('finance:write') && <Button size="sm" variant="outline" onClick={() => { setSettling(o); setSettleAmount(String(o.owed)); }}>Pay back</Button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <TextInput type="date" className="w-auto" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
          <TextInput type="date" className="w-auto" aria-label="To" value={to} onChange={e => setTo(e.target.value)} />
          <Select aria-label="Kind" className="w-auto" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Anything</option>
            {ExpenseCategory.options.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </Select>
          <TextInput className="w-56" placeholder="Search what it was for" value={q} onChange={e => setQ(e.target.value)} />
          {list.data && <span className="ml-auto text-sm text-slate-600">Spent <strong><Money value={list.data.total_spent} paise /></strong></span>}
        </div>

        {(list.data?.byCategory.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {list.data!.byCategory.map(c => (
              <div key={c.category} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm font-medium"><Money value={c.amount} paise /></div><div className="text-[11px] text-slate-500">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={e => e.id} loading={list.isPending} dense
          emptyTitle="Nothing recorded in this period" emptyHint="Record spending as it happens so trip costs stay honest." />
      </div>

      <Drawer open={adding} onOpenChange={setAdding} title="Record spending" width="xl">{adding && <ExpenseForm onDone={() => setAdding(false)} />}</Drawer>
      <Drawer open={!!settling} onOpenChange={o => { if (!o) { setSettling(null); settle.reset(); } }} title={settling ? `Pay back ${settling.name}` : ''}>
        {settling && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{settling.name} is owed <Money value={settling.owed} paise />.</p>
            <div className="grid grid-cols-2 gap-3">
              <TextInput aria-label="Amount" inputMode="decimal" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} />
              <Select aria-label="How" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="CASH">Office cash</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option>
              </Select>
            </div>
            {settle.error && <p className="text-sm text-red-600">{(settle.error as ApiError).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSettling(null)}>Back</Button>
              <Button loading={settle.isPending} disabled={!(Number(settleAmount) > 0)} onClick={() => settle.mutate(undefined, { onSuccess: () => { toast.success('Paid back'); setSettling(null); } })}>Pay back</Button>
            </div>
          </div>
        )}
      </Drawer>
      <Drawer open={!!cancelling} onOpenChange={o => { if (!o) { setCancelling(null); cancel.reset(); } }} title={cancelling ? `Cancel ${cancelling.id}` : ''}>
        {cancelling && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">The row stays and its entry in the books is reversed.</p>
            <TextInput placeholder="Why?" value={reason} onChange={e => setReason(e.target.value)} />
            {cancel.error && <p className="text-sm text-red-600">{(cancel.error as ApiError).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelling(null)}>Back</Button>
              <Button variant="destructive" loading={cancel.isPending} disabled={reason.trim().length < 3}
                onClick={() => cancel.mutate(cancelling.id, { onSuccess: () => { toast.success('Cancelled'); setCancelling(null); } })}>Cancel it</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
