import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, Money, PageHeader, TextInput } from '@/design-system';
import type { ApiError } from '@/lib/api';
import { istToday } from '@/shared/calc/istTime';
import { financialYear, financialYearRange } from '@/shared/calc/tax';
import { api } from '@/lib/api';

interface Summary {
  from: string; to: string; income: number; expense: number; profit: number; cashInHand: number;
  owedToUs: number; receivedNotBilled: number; owedBySupplier: number; owedToStaff: number;
  tax: { outputGst: number; inputGst: number; netGst: number; tcsPayable: number };
  months: { month: string; income: number; expense: number; profit: number }[];
  topTrips: { tripId: string; label: string; billed: number; cost: number; margin: number }[];
}

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: string) => `${MONTH_LABEL[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

function Figure({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-4">
      <div className={`text-2xl font-semibold ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}><Money value={value} paise /></div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

/** One page of numbers for the owner, all read from the books. */
export default function MoneyPage() {
  const fy = financialYearRange(financialYear(istToday()));
  const [from, setFrom] = useState(fy.from);
  const [to, setTo] = useState(istToday());
  const q = useQuery({ queryKey: ['finance', 'summary', from, to], queryFn: () => api.get<Summary>('/v2/finance/summary', { from, to }) });

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Money" subtitle="What came in and went out, what is in hand, and what is owed both ways — straight from the books"
        actions={
          <div className="flex items-center gap-2 text-sm">
            <TextInput type="date" className="w-auto" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
            <TextInput type="date" className="w-auto" aria-label="To" value={to} onChange={e => setTo(e.target.value)} />
            <Link to="/books" className="text-xs text-slate-500 hover:text-slate-800">Books</Link>
          </div>
        } />
      <div className="px-5 py-4 space-y-4">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load the numbers" description={(q.error as ApiError).message} />}
        {q.data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Figure label="Billed in this period" value={q.data.income} />
              <Figure label="Spent in this period" value={q.data.expense} />
              <Figure label="Profit for the period" value={q.data.profit} tone={q.data.profit < 0 ? 'bad' : 'good'} />
              <Figure label="Cash and bank in hand" value={q.data.cashInHand} hint="Including money with the payment gateway" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Figure label="Customers owe us" value={q.data.owedToUs} hint={q.data.receivedNotBilled > 0 ? `₹${q.data.receivedNotBilled.toLocaleString('en-IN')} received but not billed yet` : undefined} />
              <Figure label="We owe suppliers" value={q.data.owedBySupplier} />
              <Figure label="Owed back to staff" value={q.data.owedToStaff} />
              <Figure label="GST to pay" value={q.data.tax.netGst} hint={`Charged ₹${q.data.tax.outputGst.toLocaleString('en-IN')} · on purchases ₹${q.data.tax.inputGst.toLocaleString('en-IN')} — verify with CA`} />
            </div>

            <section className="bg-white border border-slate-200 rounded-md p-4">
              <h2 className="text-sm font-medium text-slate-800 mb-3">Month by month</h2>
              {q.data.months.length === 0 ? <p className="text-sm text-slate-500">Nothing posted in this period yet.</p> : (
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={q.data.months.map(m => ({ ...m, name: monthName(m.month) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${Math.round(Number(v) / 1000)}k`} />
                      <Tooltip formatter={(v: unknown) => `₹${Number(v).toLocaleString('en-IN')}`} />
                      <Legend />
                      <Bar dataKey="income" name="Billed" fill="#1B2A4A" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="expense" name="Spent" fill="#C9A227" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {q.data.topTrips.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-md">
                <h2 className="px-4 py-2 text-sm font-medium text-slate-800 border-b border-slate-100">Trips by margin in this period</h2>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2 text-left">Trip</th><th className="px-3 py-2 text-right">Billed</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Margin</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {q.data.topTrips.map(t => (
                      <tr key={t.tripId}>
                        <td className="px-3 py-2"><Link className="text-indigo-700 hover:underline" to={`/trips/${t.tripId}`}>{t.label}</Link></td>
                        <td className="px-3 py-2 text-right"><Money value={t.billed} paise /></td>
                        <td className="px-3 py-2 text-right"><Money value={t.cost} paise /></td>
                        <td className={`px-3 py-2 text-right ${t.margin < 0 ? 'text-red-600' : ''}`}><Money value={t.margin} paise /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
