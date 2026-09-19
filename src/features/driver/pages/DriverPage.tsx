import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LogOut, MapPin, Phone, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/backend/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { BRAND } from '@/design-system/brand';
import { DRIVER_STEPS, type DriverDutyStatus } from '@/shared/calc/operations';
import { shortDate } from '@/shared/calc/itinerary';
import type { DriverStatusChange } from '@/shared/contracts/driver';
import { driverApi, type DriverDuty } from '../api';

const NEXT_LABEL: Partial<Record<DriverDutyStatus, string>> = { ACKNOWLEDGED: 'I have seen this duty', STARTED: 'Start — on the way', ARRIVED: 'Arrived at pickup', ON_BOARD: 'Passengers on board', COMPLETED: 'Duty completed' };

function nextStep(s: DriverDutyStatus): DriverDutyStatus | null {
  if (s === 'COMPLETED') return null;
  if (s === 'ISSUE') return null;
  return DRIVER_STEPS[DRIVER_STEPS.indexOf(s) + 1] ?? null;
}
const when = (local: string) => `${shortDate(local.slice(0, 10))}, ${local.slice(11, 16)}`;

function DutyCard({ d, onUpdate, busy }: { d: DriverDuty; onUpdate: (b: DriverStatusChange) => void; busy: boolean }) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const next = nextStep(d.driverStatus);
  const resume = d.driverStatus === 'ISSUE' ? DRIVER_STEPS.filter(s => s !== 'ASSIGNED' && s !== 'COMPLETED') : [];
  return (
    <article className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 text-white" style={{ background: BRAND.navy }}>
        <div className="text-xs" style={{ color: BRAND.goldSoft }}>{d.isToday ? 'TODAY' : shortDate(d.startLocal.slice(0, 10)).toUpperCase()} · {d.tripLabel}</div>
        <div className="text-2xl font-semibold tabular-nums">{d.startLocal.slice(11, 16)} <span className="text-sm font-normal opacity-80">till {d.endLocal.slice(0, 10) === d.startLocal.slice(0, 10) ? d.endLocal.slice(11, 16) : when(d.endLocal)}</span></div>
      </header>
      <div className="p-4 space-y-3 text-[15px]">
        <div className="flex gap-2"><MapPin className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" /><div><div className="font-medium">{d.pickupPoint ?? 'Pickup to be told'}</div>{d.dropPoint && <div className="text-slate-600">to {d.dropPoint}</div>}{d.route && <div className="text-sm text-slate-500">{d.route}</div>}</div></div>
        <div className="flex gap-2"><Users className="w-5 h-5 text-slate-400 flex-shrink-0" /><div>{d.pax} passenger{d.pax === 1 ? '' : 's'}{d.vehicle && <span className="text-slate-500"> · {d.vehicle}</span>}</div></div>
        {d.instructions && <p className="text-sm bg-amber-50 border border-amber-200 rounded-md p-2">{d.instructions}</p>}
        {d.groupContact.phone && <a href={`tel:${d.groupContact.phone}`} className="flex items-center gap-2 text-indigo-700"><Phone className="w-5 h-5" />{d.groupContact.name} · {d.groupContact.phone}</a>}

        {d.pickupPoints.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup points</div>
            {d.pickupPoints.map((p, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex justify-between gap-2"><span className="font-semibold">{i + 1}. {p.name}</span><span className="tabular-nums text-slate-700">{p.time ? p.time.slice(11, 16) : '—'}</span></div>
                {(p.landmark || p.address) && <div className="text-sm text-slate-500">{[p.landmark, p.address].filter(Boolean).join(', ')}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                  {p.mapUrl && <a href={p.mapUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700">Open map</a>}
                  {p.contactPhone && <a href={`tel:${p.contactPhone}`} className="text-indigo-700">Call {p.contactName ?? 'contact'}</a>}
                </div>
                {p.passengers.length > 0 && <div className="mt-2 text-sm text-slate-700"><span className="text-slate-500">{p.passengers.length} to collect: </span>{p.passengers.join(', ')}</div>}
              </div>
            ))}
            {d.unassignedPassengers > 0 && <p className="text-sm text-amber-700">{d.unassignedPassengers} passenger(s) have no pickup point yet — ask the office.</p>}
          </div>
        )}

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="text-sm text-slate-500">Status: <span className={`font-medium ${d.driverStatus === 'ISSUE' ? 'text-red-700' : 'text-slate-800'}`}>{d.driverStatusLabel}</span>{d.driverNote && <span> — {d.driverNote}</span>}</div>
          {next && <button type="button" disabled={busy} onClick={() => onUpdate({ status: next as DriverStatusChange['status'], note: null })} className="w-full h-12 rounded-lg text-base font-semibold disabled:opacity-60" style={{ background: BRAND.gold, color: BRAND.navy }}>{NEXT_LABEL[next]}</button>}
          {resume.length > 0 && <div className="grid grid-cols-2 gap-2">{resume.map(s => <button key={s} type="button" disabled={busy} onClick={() => onUpdate({ status: s as DriverStatusChange['status'], note: null })} className="h-11 rounded-lg border border-slate-300 text-sm">{NEXT_LABEL[s]}</button>)}</div>}
          {d.driverStatus !== 'COMPLETED' && d.driverStatus !== 'ISSUE' && (reporting ? (
            <div className="space-y-2">
              <textarea className="w-full rounded-lg border border-slate-300 p-2 text-base" rows={3} placeholder="What is the problem? (breakdown, delay, passenger missing…)" value={note} onChange={e => setNote(e.target.value)} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="h-11 rounded-lg border border-slate-300" onClick={() => setReporting(false)}>Back</button>
                <button type="button" disabled={busy || !note.trim()} className="h-11 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-60" onClick={() => { onUpdate({ status: 'ISSUE', note: note.trim() }); setReporting(false); setNote(''); }}>Send to office</button>
              </div>
            </div>
          ) : <button type="button" className="w-full h-11 rounded-lg border border-red-200 text-red-700 flex items-center justify-center gap-2" onClick={() => setReporting(true)}><AlertTriangle className="w-4 h-4" />Report a problem</button>)}
        </div>
      </div>
    </article>
  );
}

/** Mobile-first page for drivers: their confirmed duties only, big buttons, status updates. */
export default function DriverPage() {
  const { signOut } = useAuth();
  const [range, setRange] = useState<'current' | 'past'>('current');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['driver', range], queryFn: () => driverApi.duties(range), refetchInterval: 60_000 });
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: ({ id, b }: { id: string; b: DriverStatusChange }) => driverApi.update(id, b),
    onSuccess: data => { setError(null); qc.setQueryData(['driver', 'current'], data); },
    onError: e => setError((e as ApiError).message),
  });
  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between text-white" style={{ background: BRAND.navyDark, borderBottom: `3px solid ${BRAND.gold}` }}>
        <div><div className="font-semibold" style={{ color: BRAND.goldSoft }}>GK Travels</div><div className="text-xs opacity-80">{q.data ? `Namaste ${q.data.driver.name} Ji` : 'Driver duties'}</div></div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Refresh" className="p-2" onClick={() => void q.refetch()}><RefreshCw className={`w-5 h-5 ${q.isFetching ? 'animate-spin' : ''}`} /></button>
          <button type="button" aria-label="Sign out" className="p-2" onClick={() => void signOut()}><LogOut className="w-5 h-5" /></button>
        </div>
      </header>
      <div className="px-3 py-3 max-w-lg mx-auto space-y-3">
        <div className="grid grid-cols-2 gap-1 bg-white rounded-lg p-1 border border-slate-200">
          {(['current', 'past'] as const).map(r => <button key={r} type="button" onClick={() => setRange(r)} className={`h-9 rounded-md text-sm ${range === r ? 'text-white' : 'text-slate-600'}`} style={range === r ? { background: BRAND.navy } : undefined}>{r === 'current' ? 'My duties' : 'Last 30 days'}</button>)}
        </div>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">{error}</p>}
        {q.isPending && <p className="text-center text-slate-500 py-10">Loading…</p>}
        {q.isError && <p className="text-center text-red-700 py-10">{(q.error as ApiError).message}</p>}
        {q.data && q.data.duties.length === 0 && <p className="text-center text-slate-500 py-10">{range === 'current' ? 'No duties assigned to you right now.' : 'No duties in the last 30 days.'}</p>}
        {q.data?.duties.map(d => <DutyCard key={d.id} d={d} busy={update.isPending} onUpdate={b => update.mutate({ id: d.id, b })} />)}
        {q.data?.officePhone && <a href={`tel:${q.data.officePhone}`} className="block text-center text-sm text-slate-600 py-4">Office: {q.data.officePhone}</a>}
      </div>
    </div>
  );
}
