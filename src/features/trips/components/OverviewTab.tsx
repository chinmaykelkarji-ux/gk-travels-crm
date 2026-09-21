import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { KeyValue, Money, StatusPill } from '@/design-system';
import { fmtDate } from '@/shared/utils/date';
import { TripProfitCard } from '@/features/finance/components/TripProfitCard';
import type { TripWorkspace } from '../api';

/** At a glance: what blocks the trip, the money, the parties and open tasks. */
export function OverviewTab({ ws }: { ws: TripWorkspace }) {
  const blockers = ws.readiness.checks.filter(c => c.severity === 'block');
  const warnings = ws.readiness.checks.filter(c => c.severity === 'warn');
  const counts = [
    { label: 'Travellers', value: ws.travellers.length }, { label: 'Hotels', value: ws.hotels.filter(h => h.status !== 'CANCELLED').length },
    { label: 'Vehicle duties', value: ws.vehicles.filter(v => v.status !== 'CANCELLED').length }, { label: 'Tickets', value: ws.tickets.filter(t => t.status !== 'CANCELLED').length },
    { label: 'Activities', value: ws.activities.filter(a => a.status !== 'CANCELLED').length }, { label: 'Documents', value: ws.documents.length },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="bg-white border border-slate-200 rounded-md p-4 lg:col-span-2 space-y-3">
        <h2 className="text-sm font-medium text-slate-800">Readiness</h2>
        {blockers.length === 0 && warnings.length === 0 && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />Everything booked is confirmed.</p>}
        <ul className="space-y-2">
          {blockers.map(c => <li key={c.code} className="text-sm"><div className="flex items-center gap-2 text-red-700"><XCircle className="w-4 h-4" />{c.message}</div>{c.items && <div className="ml-6 text-xs text-slate-500">{c.items.join(' · ')}</div>}</li>)}
          {warnings.map(c => <li key={c.code} className="text-sm"><div className="flex items-center gap-2 text-amber-700"><AlertTriangle className="w-4 h-4" />{c.message}</div>{c.items && <div className="ml-6 text-xs text-slate-500">{c.items.join(' · ')}</div>}</li>)}
        </ul>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100">{counts.map(c => <div key={c.label}><div className="text-lg font-semibold text-slate-900 tabular-nums">{c.value}</div><div className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</div></div>)}</div>
      </section>
      <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
        <h2 className="text-sm font-medium text-slate-800">Money</h2>
        <KeyValue columns={1} items={[
          { label: 'Tour total', value: <Money value={ws.money.totalPayable} /> }, { label: 'Received', value: <Money value={ws.money.paid} /> },
          { label: 'Balance', value: <strong><Money value={ws.money.balance} /></strong> },
          ...(ws.money.grossMargin !== undefined ? [
            { label: 'Quoted cost / margin', value: <span><Money value={ws.money.quotedCost ?? null} /> · <Money value={ws.money.grossMargin ?? null} /> ({ws.money.marginPct ?? 0}%)</span> },
            { label: 'Booked so far (cost / sell)', value: <span><Money value={ws.money.bookedCost ?? 0} /> / <Money value={ws.money.bookedSell ?? 0} /></span> },
          ] : []),
        ]} />
      </section>
      {ws.money.grossMargin !== undefined && <div className="lg:col-span-3"><TripProfitCard tripId={ws.trip.id} /></div>}
      <section className="bg-white border border-slate-200 rounded-md p-4 lg:col-span-2">
        <h2 className="text-sm font-medium text-slate-800 mb-3">Parties</h2>
        {ws.parties.length === 0 ? <p className="text-sm text-slate-500">No booking yet — this trip was created by hand.</p> : (
          <ul className="divide-y divide-slate-100">{ws.parties.map(p => (
            <li key={p.id} className="py-2 flex flex-wrap items-start justify-between gap-2 text-sm">
              <div><Link to={`/contracts/${p.id}`} className="font-medium text-indigo-700 hover:underline">{p.partyName ?? 'Whole group'}</Link> <span className="text-xs text-slate-500">{p.contractNumber} · {p.adults + p.children + p.infants} pax · {p.travellers} named</span>{p.status === 'CANCELLED' && <StatusPill tone="danger" className="ml-2">cancelled</StatusPill>}</div>
              <div className="text-right"><Money value={p.totalAmount} />
                <div className="text-xs text-slate-500">Paid ₹{p.received.toLocaleString('en-IN')} · balance ₹{p.payments.balance.toLocaleString('en-IN')}</div>
                <div className="text-xs text-slate-500">{p.schedule.map(s => `${s.label} ₹${s.amount.toLocaleString('en-IN')} by ${fmtDate(s.dueDate)}`).join(' · ')}</div>
              </div>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="bg-white border border-slate-200 rounded-md p-4">
        <h2 className="text-sm font-medium text-slate-800 mb-3">Open tasks</h2>
        {ws.tasks.length === 0 ? <p className="text-sm text-slate-500">No open tasks.</p> : <ul className="space-y-1.5 text-sm">{ws.tasks.map(t => <li key={t.id} className="flex justify-between gap-2"><span>{t.title}</span><span className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(t.dueDate)}</span></li>)}</ul>}
      </section>
    </div>
  );
}
