import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Undo2 } from 'lucide-react';
import { DataTable, Drawer, EmptyState, Money, PageHeader, Select, StatusPill, TextInput, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { istToday, addDays } from '@/shared/calc/istTime';
import { fmtDate } from '@/shared/utils/date';
import { ledgerApi, type LedgerEntry } from '../api';
import { useAccounts, useEntries, useLedgerMutation, useStatement, useTrialBalance } from '../hooks';
import { EntryForm } from '../components/EntryForm';

type Tab = 'trial' | 'journal' | 'statement';
const TABS: { id: Tab; label: string }[] = [{ id: 'trial', label: 'Trial balance' }, { id: 'journal', label: 'Journal' }, { id: 'statement', label: 'Account statement' }];

function Period({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-slate-500">From <TextInput type="date" className="w-auto inline-block ml-1" value={from} onChange={e => onChange(e.target.value, to)} /></label>
      <label className="text-slate-500">To <TextInput type="date" className="w-auto inline-block ml-1" value={to} onChange={e => onChange(from, e.target.value)} /></label>
    </div>
  );
}

/** The books: what every account holds, every posting, and one account's movements. */
export default function BooksPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'trial';
  const [from, setFrom] = useState(addDays(istToday(), -90));
  const [to, setTo] = useState(istToday());
  const [code, setCode] = useState('1010');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<LedgerEntry | 'new' | null>(null);
  const [reason, setReason] = useState('');

  const accounts = useAccounts();
  const trial = useTrialBalance({ from, to }, tab === 'trial');
  const entries = useEntries({ from, to, q: q || undefined, pageSize: 100 }, tab === 'journal');
  const statement = useStatement(code, { from, to }, tab === 'statement');
  const reverse = useLedgerMutation((id: string) => ledgerApi.reverse(id, reason));
  const canPost = can('finance:write');

  const trialCols: Column<{ code: string; name: string; group: string; debit: number; credit: number; balance: number }>[] = [
    { key: 'code', header: 'Code', width: '80px' },
    { key: 'name', header: 'Account', render: a => <button type="button" className="text-indigo-700 hover:underline" onClick={() => { setCode(a.code); setParams(p => { p.set('tab', 'statement'); return p; }, { replace: true }); }}>{a.name}</button> },
    { key: 'group', header: 'Group', hideBelow: 'md' },
    { key: 'debit', header: 'Debit', align: 'right', render: a => <Money value={a.debit} paise /> },
    { key: 'credit', header: 'Credit', align: 'right', render: a => <Money value={a.credit} paise /> },
    { key: 'balance', header: 'Balance', align: 'right', render: a => <strong><Money value={a.balance} paise /></strong> },
  ];
  const journalCols: Column<LedgerEntry>[] = [
    { key: 'date', header: 'Date', width: '110px', render: e => fmtDate(e.date) },
    { key: 'no', header: 'No.', width: '130px', render: e => <span className="tabular-nums">{e.displayNumber}</span> },
    { key: 'narration', header: 'Narration', render: e => <span>{e.narration}{e.reversedBy && <StatusPill tone="neutral" className="ml-2">reversed</StatusPill>}{e.reversalOf && <StatusPill tone="warning" className="ml-2">reversal</StatusPill>}</span> },
    { key: 'accounts', header: 'Accounts', hideBelow: 'lg', render: e => <span className="text-xs text-slate-500">{e.lines.map(l => l.code).join(' · ')}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: e => <Money value={e.amount} paise /> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Books" subtitle="Every rupee in and out, in double entry. Posted entries are never edited — a mistake is reversed."
        actions={canPost ? <Button size="sm" onClick={() => setOpen('new')}><Plus className="w-4 h-4 mr-1" />Journal entry</Button> : undefined} />
      <nav className="px-5 flex gap-1 border-b border-slate-200 bg-white" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams(p => { p.set('tab', t.id); return p; }, { replace: true })}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
        ))}
      </nav>

      <div className="px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Period from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          {tab === 'journal' && <TextInput className="w-56" placeholder="Search narration or number" value={q} onChange={e => setQ(e.target.value)} />}
          {tab === 'statement' && (
            <Select aria-label="Account" className="w-auto" value={code} onChange={e => setCode(e.target.value)}>
              {(accounts.data ?? []).map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </Select>
          )}
        </div>

        {tab === 'trial' && (
          <>
            {trial.data && trial.data.difference !== 0 && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Debits and credits differ by <Money value={trial.data.difference} paise />. Tell whoever maintains the books — this should never happen.</p>
            )}
            <DataTable columns={trialCols} rows={trial.data?.accounts.filter(a => a.debit || a.credit) ?? []} rowKey={a => a.code} loading={trial.isPending} dense
              emptyTitle="Nothing posted in this period" emptyHint="Receipts, supplier bills and expenses will appear here as they are recorded." />
            {trial.data && (
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span>Total debit <Money value={trial.data.totalDebit} paise /></span>
                <span>Total credit <Money value={trial.data.totalCredit} paise /></span>
                <span>Income <Money value={trial.data.byType.INCOME} paise /></span>
                <span>Expenses <Money value={trial.data.byType.EXPENSE} paise /></span>
                <span className="font-medium">Profit for the period <Money value={trial.data.byType.INCOME - trial.data.byType.EXPENSE} paise /></span>
              </div>
            )}
          </>
        )}

        {tab === 'journal' && (
          <DataTable columns={journalCols} rows={entries.data?.items ?? []} rowKey={e => e.id} loading={entries.isPending} onRowClick={e => { setOpen(e); setReason(''); }}
            emptyTitle="No entries in this period" />
        )}

        {tab === 'statement' && statement.data && (
          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap justify-between gap-2">
              <div><div className="font-medium text-slate-900">{statement.data.account.code} · {statement.data.account.name}</div><div className="text-xs text-slate-500">{statement.data.account.description}</div></div>
              <div className="text-sm text-slate-600">Opening <Money value={statement.data.opening} paise /> · Closing <strong><Money value={statement.data.closing} paise /></strong></div>
            </div>
            {statement.data.rows.length === 0 ? <EmptyState compact title="No movements in this period" /> : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                  <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Entry</th><th className="px-3 py-2 text-left">Narration</th>
                  <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{statement.data.rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{r.displayNumber}</td>
                    <td className="px-3 py-2">{r.narration}{r.description && <span className="text-slate-500"> — {r.description}</span>}{r.tripId && <Link className="ml-2 text-indigo-600 hover:underline" to={`/trips/${r.tripId}`}>{r.tripId}</Link>}</td>
                    <td className="px-3 py-2 text-right"><Money value={r.debit || null} paise /></td>
                    <td className="px-3 py-2 text-right"><Money value={r.credit || null} paise /></td>
                    <td className="px-3 py-2 text-right"><Money value={r.balance} paise /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <Drawer open={!!open} onOpenChange={o => { if (!o) { setOpen(null); reverse.reset(); } }} title={open === 'new' ? 'New journal entry' : open ? `${open.displayNumber}` : ''} width="xl">
        {open === 'new' && <EntryForm onDone={() => setOpen(null)} />}
        {open && open !== 'new' && (
          <div className="space-y-4">
            <div className="text-sm"><div className="font-medium text-slate-900">{open.narration}</div><div className="text-slate-500">{fmtDate(open.date)} · {open.sourceType.replace('_', ' ')} · posted by {open.source === 'SYSTEM' ? 'the system' : 'a person'}</div></div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="text-left py-1">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{open.lines.map(l => (
                <tr key={l.id}><td className="py-1.5">{l.code} · {(accounts.data ?? []).find(a => a.code === l.code)?.name ?? ''}{l.description && <span className="text-slate-500"> — {l.description}</span>}</td>
                  <td className="text-right"><Money value={l.debit || null} paise /></td><td className="text-right"><Money value={l.credit || null} paise /></td></tr>
              ))}</tbody>
            </table>
            {open.reversedBy && <p className="text-sm text-slate-600">Reversed by {open.reversedBy.displayNumber}{open.reversalReason ? ` — ${open.reversalReason}` : ''}.</p>}
            {open.reversalOf && <p className="text-sm text-slate-600">This entry reverses {open.reversalOf.displayNumber}.</p>}
            {canPost && !open.reversedBy && !open.reversalOf && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <TextInput placeholder="Why is this being reversed?" value={reason} onChange={e => setReason(e.target.value)} />
                {reverse.error && <p className="text-sm text-red-600">{(reverse.error as ApiError).message}</p>}
                <Button size="sm" variant="outline" loading={reverse.isPending} disabled={reason.trim().length < 3}
                  onClick={() => reverse.mutate(open.id, { onSuccess: v => { toast.success('Reversed', `${v.displayNumber} posted`); setOpen(null); } })}>
                  <Undo2 className="w-3.5 h-3.5 mr-1" />Reverse this entry
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
