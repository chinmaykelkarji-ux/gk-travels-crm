import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@/design-system/brand';
import { portalApi, PortalError, type Agency, type PortalTrip } from './api';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const time = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

function Shell({ agency, children }: { agency?: Agency | null; children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: BRAND.goldLight }}>
      <header style={{ background: BRAND.navy }} className="px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <p className="font-semibold tracking-wide" style={{ color: BRAND.gold }}>{agency?.name ?? 'GK Travels'}</p>
          {agency?.phone && <a href={`tel:${agency.phone.replace(/[^\d+]/g, '')}`} className="text-sm text-white/90 underline underline-offset-2">{agency.phone}</a>}
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">{children}</main>
      {agency && (
        <footer className="max-w-2xl mx-auto px-4 pb-8 text-xs" style={{ color: BRAND.muted }}>
          {[agency.address, agency.email, agency.website].filter(Boolean).join(' · ')}
        </footer>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-lg p-4 shadow-sm" style={{ border: `1px solid ${BRAND.rule}` }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: BRAND.navy }}>{title}</h2>
      {children}
    </section>
  );
}

function CodeGate({ token, channel }: { token: string; channel: 'WHATSAPP' | 'EMAIL' | null }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const send = useMutation({ mutationFn: () => portalApi.sendCode(token) });
  const verify = useMutation({ mutationFn: () => portalApi.verify(token, code), onSuccess: () => void qc.invalidateQueries() });
  return (
    <Card title="Open your page">
      <p className="text-sm text-slate-700">For your privacy we will send a six-digit code to your {channel === 'EMAIL' ? 'email' : 'WhatsApp'}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => send.mutate()} disabled={send.isPending} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: BRAND.navy }}>
          {send.isSuccess ? 'Send again' : 'Send me a code'}
        </button>
      </div>
      {send.isSuccess && <p className="mt-2 text-sm text-slate-600">Sent to {send.data.sentTo}. It can take a minute to arrive.</p>}
      {send.isError && <p className="mt-2 text-sm text-red-700">{(send.error as PortalError).message}</p>}
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); verify.mutate(); }}>
        <label htmlFor="code" className="sr-only">Code</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-36 rounded-md border border-slate-300 px-3 py-2 text-lg tracking-widest" placeholder="••••••" />
        <button type="submit" disabled={code.length !== 6 || verify.isPending} className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: BRAND.gold, color: BRAND.navyDark }}>Open</button>
      </form>
      {verify.isError && <p className="mt-2 text-sm text-red-700">{(verify.error as PortalError).message}</p>}
    </Card>
  );
}

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-checked={value === n} role={onChange ? 'radio' : undefined}
          className="text-2xl leading-none" style={{ color: n <= value ? BRAND.gold : '#D1D5DB' }}>★</button>
      ))}
    </div>
  );
}

function Feedback({ token, t }: { token: string; t: PortalTrip }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(t.feedback?.rating ?? 0);
  const [comments, setComments] = useState(t.feedback?.comments ?? '');
  const save = useMutation({ mutationFn: () => portalApi.feedback(token, t.trip.id, rating, comments), onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal', token, t.trip.id] }) });
  return (
    <Card title="Your feedback">
      <Stars value={rating} onChange={setRating} />
      <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3} maxLength={2000} placeholder="Tell us what went well and what we can do better"
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Comments" />
      <button type="button" disabled={!rating || save.isPending} onClick={() => save.mutate()} className="mt-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: BRAND.navy }}>
        {t.feedback ? 'Update feedback' : 'Send feedback'}
      </button>
      {save.isSuccess && <p className="mt-2 text-sm text-emerald-700">Thank you. We have received it.</p>}
      {save.isError && <p className="mt-2 text-sm text-red-700">{(save.error as PortalError).message}</p>}
    </Card>
  );
}

function TripView({ token, id }: { token: string; id: string }) {
  const q = useQuery({ queryKey: ['portal', token, id], queryFn: () => portalApi.trip(token, id) });
  const openDoc = useMutation({ mutationFn: (docId: string) => portalApi.docUrl(token, docId), onSuccess: r => { window.location.href = r.url; } });
  if (q.isPending) return <p className="text-sm text-slate-600">Loading…</p>;
  if (q.isError) return <p className="text-sm text-red-700">{(q.error as PortalError).message}</p>;
  const t = q.data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: BRAND.navy }}>{t.trip.name}</h1>
        <p className="text-sm text-slate-600">{day(t.trip.departure)}{t.trip.returnDate ? ` – ${day(t.trip.returnDate)}` : ''} · {t.trip.status}</p>
      </div>

      {t.travellers.length > 0 && <Card title="Travelling"><ul className="text-sm text-slate-800">{t.travellers.map((p, i) => <li key={i}>{p.name}{p.role !== 'Adult' ? ` (${p.role.toLowerCase()})` : ''}</li>)}</ul></Card>}

      {t.pickupPoints.length > 0 && (
        <Card title="Pickup">
          <ul className="space-y-1.5 text-sm">{t.pickupPoints.map((p, i) => (
            <li key={i}><span className="font-medium">{p.name}</span>{p.time ? ` · ${time(p.time)}` : ''}{p.landmark ? <span className="block text-slate-600">{p.landmark}</span> : null}{p.mapUrl && <a className="text-sky-700 underline" href={p.mapUrl} target="_blank" rel="noreferrer">Map</a>}</li>
          ))}</ul>
        </Card>
      )}

      {(t.itinerary || t.itineraryNote) && (
        <Card title="Itinerary">
          {t.itineraryNote && <p className="text-sm text-slate-700">{t.itineraryNote}</p>}
          {t.itinerary?.days.map(d => (
            <div key={d.dayNumber} className="py-2 border-t first:border-t-0" style={{ borderColor: BRAND.rule }}>
              <p className="text-sm font-semibold" style={{ color: BRAND.navy }}>Day {d.dayNumber}{d.date ? ` · ${day(d.date)}` : ''} — {d.title}</p>
              {[d.morning, d.afternoon, d.evening].filter(Boolean).map((x, i) => <p key={i} className="text-sm text-slate-700 whitespace-pre-wrap">{x}</p>)}
              {d.items.map((it, i) => <p key={i} className="text-sm text-slate-700">{it.time ? `${it.time} · ` : ''}{it.title}{it.details ? ` — ${it.details}` : ''}</p>)}
              {d.hotelName && <p className="text-xs text-slate-500">Stay: {d.hotelName}{d.meals.length ? ` · ${d.meals.join(', ').toLowerCase()}` : ''}</p>}
            </div>
          ))}
        </Card>
      )}

      {t.tickets.length > 0 && (
        <Card title="Tickets">
          <ul className="space-y-3">{t.tickets.map((k, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">{k.mode}{k.pnr ? ` · PNR ${k.pnr}` : ''} · {k.status}</p>
              {k.legs.map((l, j) => (
                <div key={j} className="mt-1">
                  <p>{l.from} → {l.to}{l.service ? ` · ${l.service}` : ''}</p>
                  <p className="text-slate-600">{time(l.departs)}{l.arrives ? ` → ${time(l.arrives)}` : ''}{l.boardingPoint ? ` · board at ${l.boardingPoint}` : ''}</p>
                  {l.passengers.map((p, m) => <p key={m} className="text-slate-700">{p.name}: {p.status}{[p.coach, p.seat, p.berth].filter(Boolean).length ? ` · ${[p.coach, p.seat, p.berth].filter(Boolean).join(' ')}` : ''}</p>)}
                </div>
              ))}
            </li>
          ))}</ul>
        </Card>
      )}

      {t.stays.length > 0 && (
        <Card title="Stays">
          <ul className="space-y-2 text-sm">{t.stays.map((h, i) => (
            <li key={i}><p className="font-medium">{h.hotel}{h.city ? `, ${h.city}` : ''} · {h.status}</p><p className="text-slate-600">{day(h.checkIn)} – {day(h.checkOut)} · {h.rooms} room{h.rooms === 1 ? '' : 's'}{h.roomType ? ` · ${h.roomType}` : ''}{h.confirmationNo ? ` · Ref ${h.confirmationNo}` : ''}</p></li>
          ))}</ul>
        </Card>
      )}

      {t.transport.length > 0 && (
        <Card title="Transport">
          <ul className="space-y-2 text-sm">{t.transport.map((v, i) => (
            <li key={i}>
              <p className="font-medium">{v.vehicle ?? 'Vehicle'} · {v.status}</p>
              <p className="text-slate-600">{time(v.starts)}{v.pickup ? ` · from ${v.pickup}` : ''}</p>
              {v.driver && <p>Driver: {v.driver.name}{v.driver.phone ? <> · <a className="text-sky-700 underline" href={`tel:${v.driver.phone.replace(/[^\d+]/g, '')}`}>{v.driver.phone}</a></> : null}{v.driver.vehicleNumber ? ` · ${v.driver.vehicleNumber}` : ''}</p>}
              {v.driverNote && <p className="text-xs text-slate-500">{v.driverNote}</p>}
            </li>
          ))}</ul>
        </Card>
      )}

      {t.payments.length > 0 && (
        <Card title="Payments">
          {t.payments.map((m, i) => (
            <div key={i} className="text-sm mb-2">
              {m.party && <p className="font-medium">{m.party}</p>}
              <p>Total {inr(m.total)} · Received {inr(m.received)} · <span className="font-semibold">Balance {inr(m.balance)}</span></p>
              {m.instalments.map((s, j) => <p key={j} className="text-slate-600">{s.label}: {inr(s.amount)} by {day(s.dueDate)} — {s.status === 'PAID' ? 'paid' : s.status === 'PARTIAL' ? `${inr(s.paid)} paid` : s.status === 'OVERDUE' ? 'overdue' : 'due'}</p>)}
            </div>
          ))}
          {t.receipts.length > 0 && <ul className="mt-2 text-xs text-slate-600">{t.receipts.map(r => <li key={r.number}>{day(r.date)} · {inr(r.amount)} · {r.mode} · {r.number}</li>)}</ul>}
        </Card>
      )}

      {t.documents.length > 0 && (
        <Card title="Documents">
          <ul className="space-y-1 text-sm">{t.documents.map(d => (
            <li key={d.id}><button type="button" className="text-sky-700 underline text-left" onClick={() => openDoc.mutate(d.id)} disabled={openDoc.isPending}>{d.title}</button></li>
          ))}</ul>
          {openDoc.isError && <p className="mt-1 text-xs text-red-700">{(openDoc.error as PortalError).message}</p>}
        </Card>
      )}

      {t.updates.length > 0 && (
        <Card title="Messages from us">
          <ul className="space-y-2 text-sm">{t.updates.map((u, i) => <li key={i}><p className="text-xs text-slate-500">{time(u.at)}</p><p className="whitespace-pre-wrap text-slate-800">{u.text}</p></li>)}</ul>
        </Card>
      )}

      {t.canGiveFeedback && <Feedback token={token} t={t} />}
    </div>
  );
}

/** The customer's own page: their trips, from a private link. */
export default function PortalPage() {
  const { token = '' } = useParams();
  const [tripId, setTripId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['portal', token], queryFn: () => portalApi.home(token), retry: false });

  if (q.isPending) return <Shell><p className="text-sm text-slate-600">Loading…</p></Shell>;
  if (q.isError) {
    const e = q.error as PortalError;
    return <Shell><Card title="This link does not open">{e.status === 404 ? 'The link may have expired or been replaced. Please ask GK Travels for a new one.' : e.message}</Card></Shell>;
  }
  if (q.data.locked) return <Shell><CodeGate token={token} channel={q.data.codeChannel} /></Shell>;
  const home = q.data;
  const current = tripId ?? home.trips[0]?.id ?? null;
  return (
    <Shell agency={home.agency}>
      <p className="text-lg" style={{ color: BRAND.navy }}>Namaste {home.customer.name} Ji</p>
      {home.trips.length === 0 && <Card title="Your trips">There is nothing to show yet.</Card>}
      {home.trips.length > 1 && (
        <label className="block text-sm">
          <span className="sr-only">Trip</span>
          <select value={current ?? ''} onChange={e => setTripId(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2">
            {home.trips.map(t => <option key={t.id} value={t.id}>{t.name} · {day(t.departure)} · {t.status}</option>)}
          </select>
        </label>
      )}
      {current && <TripView token={token} id={current} />}
    </Shell>
  );
}
