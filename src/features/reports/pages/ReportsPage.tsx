import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, PageHeader } from '@/design-system';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { api, type ApiError } from '@/lib/api';

const inr = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mon = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3 min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

/** One series, one hue: a ranked list with its own numbers beside each bar. */
function Bars({ title, rows, format = String }: { title: string; rows: { name: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <section className="bg-white border border-slate-200 rounded-md p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-500">Nothing in this period.</p> : (
        <ul className="space-y-1.5">
          {rows.map(r => (
            <li key={r.name} className="grid grid-cols-[minmax(0,8rem),1fr,auto] items-center gap-2 text-sm" title={`${r.name}: ${format(r.value)}`}>
              <span className="truncate text-slate-700">{r.name}</span>
              <span className="h-2.5 rounded-sm bg-slate-100"><span className="block h-2.5 rounded-sm bg-slate-700" style={{ width: `${(r.value / max) * 100}%` }} /></span>
              <span className="tabular-nums text-slate-800">{format(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Months({ title, rows }: { title: string; rows: { month: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <section className="bg-white border border-slate-200 rounded-md p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      <div className="flex items-end gap-1 h-28" role="img" aria-label={`${title}: ${rows.map(r => `${mon(r.month)} ${r.count}`).join(', ')}`}>
        {rows.map(r => (
          <div key={r.month} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${mon(r.month)}: ${r.count}`}>
            <span className="text-[10px] text-slate-600 tabular-nums">{r.count || ''}</span>
            <span className="w-full max-w-[18px] rounded-t bg-slate-700" style={{ height: `${(r.count / max) * 80}%`, minHeight: r.count ? 2 : 0 }} />
            <span className="text-[9px] text-slate-500 mt-0.5">{mon(r.month).slice(0, 3)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function useSection<T>(key: string, path: string, from: string, to: string, enabled: boolean) {
  return useQuery({ queryKey: ['reports', key, from, to], queryFn: () => api.get<T>(`/v2/analytics/${path}`, { ...(from ? { from } : {}), ...(to ? { to } : {}) }), enabled });
}

type Sales = { enquiries: number; winRate: number | null; byStatus: Record<string, number>; bySource: { source: string; count: number; won: number }[]; quotes: { made: number; sent: number; accepted: number; acceptedValue: number; acceptRate: number | null }; monthly: { month: string; count: number }[]; topDestinations: { name: string; count: number }[] };
type Ops = { tripsByStage: Record<string, number>; departingIn30Days: number; tickets: { confirmed: number; waitlistedOrRac: number; waitlistShare: number | null }; hotelConfirmation: { confirmed: number; medianHours: number | null }; overdueTasks: Record<string, number> };
type Money = { income: number; expense: number; profit: number; monthly: { month: string; income: number; expense: number; profit: number }[]; owedToUs: number; overdue: number; aging: { label: string; amount: number }[]; topCustomersOwing: { name: string; outstanding: number; overdue: number }[]; note: string };
type Cust = { newCustomers: number; monthlyNew: { month: string; count: number }[]; customersWithTrips: number; repeatCustomers: number; repeatRate: number | null; topCustomers: { name: string; trips: number }[]; topDestinations: { name: string; count: number }[] };
type Sup = { vendors: { name: string; bills: number; billed: number; outstanding: number; overdue: number }[]; hotels: { name: string; bookings: number; confirmedRate: number | null; medianHoursToConfirm: number | null }[] };

const TABS = [
  { id: 'sales', label: 'Sales', permission: 'enquiries:read' },
  { id: 'operations', label: 'Operations', permission: 'operations:read' },
  { id: 'money', label: 'Money', permission: 'finance:read' },
  { id: 'customers', label: 'Customers', permission: 'customers:read' },
  { id: 'suppliers', label: 'Suppliers', permission: 'finance:read' },
] as const;

/** Reports from the records themselves: counts, sums and rates — nothing estimated. */
export default function ReportsPage() {
  const { can } = usePermissions();
  const tabs = TABS.filter(t => can(t.permission));
  const [tab, setTab] = useState<string>(tabs[0]?.id ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const sales = useSection<Sales>('sales', 'sales', from, to, tab === 'sales');
  const ops = useSection<Ops>('ops', 'operations', '', '', tab === 'operations');
  const money = useSection<Money>('money', 'money', from, to, tab === 'money');
  const cust = useSection<Cust>('cust', 'customers', from, to, tab === 'customers');
  const sup = useSection<Sup>('sup', 'suppliers', from, to, tab === 'suppliers');
  const current = { sales, operations: ops, money, customers: cust, suppliers: sup }[tab as 'sales'];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Reports" subtitle="Counted from the records — the last 12 months unless you choose dates" />
      <div className="px-5 pt-3 flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white">
        <div className="flex gap-4 overflow-x-auto" role="tablist">
          {tabs.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`pb-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
          ))}
        </div>
        {tab !== 'operations' && (
          <div className="ml-auto flex gap-2 pb-2 text-xs text-slate-600">
            <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ml-1 rounded border border-slate-300 px-1.5 py-0.5" /></label>
            <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ml-1 rounded border border-slate-300 px-1.5 py-0.5" /></label>
          </div>
        )}
      </div>
      <div className="px-5 py-4 space-y-4 max-w-6xl">
        {tabs.length === 0 && <EmptyState title="No reports for your role" />}
        {current?.isPending && current.fetchStatus !== 'idle' && <p className="text-sm text-slate-500">Counting…</p>}
        {current?.isError && <EmptyState title="Could not count" description={(current.error as ApiError).message} />}

        {tab === 'sales' && sales.data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Enquiries" value={sales.data.enquiries} />
              <Tile label="Won of those decided" value={pct(sales.data.winRate)} hint={`${sales.data.byStatus.WON} won · ${sales.data.byStatus.LOST} lost`} />
              <Tile label="Quotations accepted" value={`${sales.data.quotes.accepted} / ${sales.data.quotes.sent}`} hint={`${pct(sales.data.quotes.acceptRate)} of those sent`} />
              <Tile label="Value accepted" value={inr(sales.data.quotes.acceptedValue)} />
            </div>
            <Months title="Enquiries by month" rows={sales.data.monthly} />
            <div className="grid lg:grid-cols-2 gap-4">
              <Bars title="Where enquiries come from" rows={sales.data.bySource.map(s => ({ name: s.source.toLowerCase().replace('_', ' '), value: s.count }))} />
              <Bars title="Most asked-for destinations" rows={sales.data.topDestinations.map(d => ({ name: d.name, value: d.count }))} />
            </div>
          </>
        )}

        {tab === 'operations' && ops.data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Leaving in 30 days" value={ops.data.departingIn30Days} />
              <Tile label="Tickets waitlisted / RAC" value={ops.data.tickets.waitlistedOrRac} hint={`${pct(ops.data.tickets.waitlistShare)} of live tickets`} />
              <Tile label="Hotels: typical time to confirm" value={ops.data.hotelConfirmation.medianHours === null ? '—' : `${ops.data.hotelConfirmation.medianHours} h`} hint={`median of ${ops.data.hotelConfirmation.confirmed} confirmations`} />
              <Tile label="Overdue tasks" value={Object.values(ops.data.overdueTasks).reduce((a, b) => a + b, 0)} hint={Object.entries(ops.data.overdueTasks).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'} />
            </div>
            <Bars title="Trips by stage" rows={['PLANNING', 'CONFIRMING', 'READY', 'ONGOING', 'COMPLETED', 'CANCELLED'].map(s => ({ name: s.toLowerCase(), value: ops.data!.tripsByStage[s] ?? 0 }))} />
          </>
        )}

        {tab === 'money' && money.data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Income" value={inr(money.data.income)} />
              <Tile label="Spent" value={inr(money.data.expense)} />
              <Tile label="Profit" value={inr(money.data.profit)} />
              <Tile label="Customers owe" value={inr(money.data.owedToUs)} hint={`${inr(money.data.overdue)} overdue`} />
            </div>
            <section className="bg-white border border-slate-200 rounded-md p-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Month by month</h3>
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3 font-normal">Month</th><th className="py-1 pr-3 font-normal text-right">Income</th><th className="py-1 pr-3 font-normal text-right">Spent</th><th className="py-1 font-normal text-right">Profit</th></tr></thead>
                <tbody>{money.data.monthly.map(m => <tr key={m.month} className="border-t border-slate-100"><td className="py-1 pr-3">{mon(m.month)}</td><td className="py-1 pr-3 text-right">{inr(m.income)}</td><td className="py-1 pr-3 text-right">{inr(m.expense)}</td><td className="py-1 text-right">{inr(m.profit)}</td></tr>)}</tbody>
              </table>
              {money.data.monthly.length === 0 && <p className="text-sm text-slate-500">Nothing in the books for this period.</p>}
            </section>
            <div className="grid lg:grid-cols-2 gap-4">
              <Bars title="What customers owe, by how late" rows={money.data.aging.map(a => ({ name: a.label, value: a.amount }))} format={inr} />
              <Bars title="Who owes the most" rows={money.data.topCustomersOwing.map(c => ({ name: c.name, value: c.outstanding }))} format={inr} />
            </div>
            <p className="text-xs text-slate-500">{money.data.note}</p>
          </>
        )}

        {tab === 'customers' && cust.data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="New customers" value={cust.data.newCustomers} />
              <Tile label="Customers who travelled" value={cust.data.customersWithTrips} />
              <Tile label="Came back" value={cust.data.repeatCustomers} hint={`${pct(cust.data.repeatRate)} travelled twice or more`} />
            </div>
            <Months title="New customers by month" rows={cust.data.monthlyNew} />
            <div className="grid lg:grid-cols-2 gap-4">
              <Bars title="Most trips" rows={cust.data.topCustomers.map(c => ({ name: c.name, value: c.trips }))} />
              <Bars title="Destinations travelled" rows={cust.data.topDestinations.map(d => ({ name: d.name, value: d.count }))} />
            </div>
          </>
        )}

        {tab === 'suppliers' && sup.data && (
          <>
            <section className="bg-white border border-slate-200 rounded-md p-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Suppliers: billed and owed</h3>
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3 font-normal">Supplier</th><th className="py-1 pr-3 font-normal text-right">Bills</th><th className="py-1 pr-3 font-normal text-right">Billed</th><th className="py-1 pr-3 font-normal text-right">Owed</th><th className="py-1 font-normal text-right">Overdue</th></tr></thead>
                <tbody>{sup.data.vendors.map(v => <tr key={v.name} className="border-t border-slate-100"><td className="py-1 pr-3">{v.name}</td><td className="py-1 pr-3 text-right">{v.bills}</td><td className="py-1 pr-3 text-right">{inr(v.billed)}</td><td className="py-1 pr-3 text-right">{inr(v.outstanding)}</td><td className="py-1 text-right">{inr(v.overdue)}</td></tr>)}</tbody>
              </table>
              {sup.data.vendors.length === 0 && <p className="text-sm text-slate-500">No supplier bills in this period.</p>}
            </section>
            <section className="bg-white border border-slate-200 rounded-md p-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Hotels: how reliably and how fast they confirm</h3>
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3 font-normal">Hotel</th><th className="py-1 pr-3 font-normal text-right">Bookings</th><th className="py-1 pr-3 font-normal text-right">Confirmed</th><th className="py-1 font-normal text-right">Typical hours</th></tr></thead>
                <tbody>{sup.data.hotels.map(h => <tr key={h.name} className="border-t border-slate-100"><td className="py-1 pr-3">{h.name}</td><td className="py-1 pr-3 text-right">{h.bookings}</td><td className="py-1 pr-3 text-right">{pct(h.confirmedRate)}</td><td className="py-1 text-right">{h.medianHoursToConfirm ?? '—'}</td></tr>)}</tbody>
              </table>
              {sup.data.hotels.length === 0 && <p className="text-sm text-slate-500">No hotel bookings in this period.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
