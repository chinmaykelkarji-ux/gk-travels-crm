import { useQuery } from '@tanstack/react-query';
import { Money } from '@/design-system';
import { financeApi } from '../api';

/** What the trip has billed, what it really cost, and the margin — next to what was planned. */
export function TripProfitCard({ tripId }: { tripId: string }) {
  const q = useQuery({ queryKey: ['finance', 'trip-profit', tripId], queryFn: () => financeApi.tripProfit(tripId) });
  if (q.isPending || q.isError || !q.data) return null;
  const p = q.data;
  return (
    <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-800">Money on this trip</h2>
        <span className="text-xs text-slate-500">{p.revenueBasis === 'invoiced' ? 'from invoices raised' : 'from the bookings, nothing invoiced yet'}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><div className="text-lg font-semibold"><Money value={p.revenue} paise /></div><div className="text-xs text-slate-500">Billed</div></div>
        <div><div className="text-lg font-semibold"><Money value={p.actualCost} paise /></div><div className="text-xs text-slate-500">Cost so far{p.plannedCost > 0 && <> · planned <Money value={p.plannedCost} paise /></>}</div></div>
        <div><div className={`text-lg font-semibold ${p.margin < 0 ? 'text-red-700' : 'text-emerald-700'}`}><Money value={p.margin} paise /></div><div className="text-xs text-slate-500">Margin {p.marginPct}%</div></div>
        <div><div className="text-lg font-semibold"><Money value={p.balance} paise /></div><div className="text-xs text-slate-500">Still to collect (received <Money value={p.received} paise />)</div></div>
      </div>
      {p.costLines.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="text-left py-1">Cost</th><th className="text-right">Recorded</th><th className="text-right">Planned</th><th className="text-right">Difference</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {p.costLines.map(l => {
              const diff = l.actual - l.planned;
              return (
                <tr key={l.label}>
                  <td className="py-1.5">{l.label}</td>
                  <td className="text-right"><Money value={l.actual} paise /></td>
                  <td className="text-right text-slate-500"><Money value={l.planned || null} paise /></td>
                  <td className={`text-right ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{l.planned > 0 ? <Money value={diff} paise /> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
