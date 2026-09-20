import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, Money, Select, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { checkLines } from '@/shared/calc/ledger';
import { istToday } from '@/shared/calc/istTime';
import { toRupees } from '@/shared/calc/money';
import { ledgerApi, type AccountRow } from '../api';
import { useAccounts, useLedgerMutation } from '../hooks';

interface Line { code: string; debit: string; credit: string; description: string }
const EMPTY: Line = { code: '', debit: '', credit: '', description: '' };
const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

/** A journal entry typed by hand: opening balances, office costs, corrections. */
export function EntryForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts();
  const [date, setDate] = useState(istToday());
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY }, { ...EMPTY }]);
  const create = useLedgerMutation(() => ledgerApi.create({
    date, narration, tripId: null, contractId: null, customerId: null, vendorId: null,
    lines: lines.filter(l => l.code).map(l => ({ code: l.code, debit: num(l.debit) || null, credit: num(l.credit) || null, description: l.description || null, tripId: null, contractId: null, customerId: null, vendorId: null })),
  }));
  const err = create.error as ApiError | null;

  const check = useMemo(() => checkLines(lines.filter(l => l.code).map(l => ({ code: l.code, debit: num(l.debit), credit: num(l.credit) }))), [lines]);
  const byGroup = useMemo(() => {
    const out = new Map<string, AccountRow[]>();
    for (const a of accounts.data ?? []) if (a.isActive) out.set(a.group, [...(out.get(a.group) ?? []), a]);
    return [...out.entries()];
  }, [accounts.data]);
  const set = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); create.mutate(undefined, { onSuccess: v => { toast.success('Posted', `${v.displayNumber} · ${v.narration}`); onDone(); } }); }}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date" htmlFor="je-date" required error={err?.fields?.date}><TextInput id="je-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="What is this entry for" htmlFor="je-narration" required className="sm:col-span-2" error={err?.fields?.narration}>
          <TextInput id="je-narration" placeholder="e.g. Opening bank balance as on 1 April" value={narration} onChange={e => setNarration(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field label={i === 0 ? 'Account' : ''} className="flex-1 min-w-[200px]">
              <Select aria-label={`Account for line ${i + 1}`} value={l.code} onChange={e => set(i, { code: e.target.value })}>
                <option value="">Choose an account…</option>
                {byGroup.map(([group, rows]) => <optgroup key={group} label={group}>{rows.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>)}
              </Select>
            </Field>
            <Field label={i === 0 ? 'Debit' : ''} className="w-32"><TextInput aria-label={`Debit for line ${i + 1}`} inputMode="decimal" value={l.debit} onChange={e => set(i, { debit: e.target.value, credit: '' })} /></Field>
            <Field label={i === 0 ? 'Credit' : ''} className="w-32"><TextInput aria-label={`Credit for line ${i + 1}`} inputMode="decimal" value={l.credit} onChange={e => set(i, { credit: e.target.value, debit: '' })} /></Field>
            <Field label={i === 0 ? 'Note' : ''} className="flex-1 min-w-[140px]"><TextInput aria-label={`Note for line ${i + 1}`} value={l.description} onChange={e => set(i, { description: e.target.value })} /></Field>
            <button type="button" aria-label={`Remove line ${i + 1}`} className="h-9 px-2 text-slate-400 hover:text-red-600 disabled:opacity-30" disabled={lines.length <= 2} onClick={() => setLines(ls => ls.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setLines(ls => [...ls, { ...EMPTY }])}><Plus className="w-3.5 h-3.5 mr-1" />Add line</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
        <div className="text-slate-600">Debit <Money value={toRupees(check.debitPaise)} paise /> · Credit <Money value={toRupees(check.creditPaise)} paise /></div>
        {check.ok ? <span className="text-emerald-700">Balanced</span> : <span className="text-amber-700">{check.errors[0]}</span>}
      </div>
      {err && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={create.isPending} disabled={!check.ok || !narration.trim()}>Post entry</Button>
      </div>
    </form>
  );
}
