import { useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { Drawer, Field, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { PassengerStatus, type PassengerRowUpdate, type TicketMode } from '@/shared/contracts/tickets';
import { ApiError } from '@/lib/api';
import { ticketsApi, type Ticket, type TicketRow, type TicketSegment } from '../api';
import { useTicketMutation } from '../hooks';
import { PaxStatusPill } from './TicketStatusPill';

function RowEditor({ row, mode, onDone }: { row: TicketRow; mode: TicketMode; onDone: () => void }) {
  const [v, setV] = useState({ status: '', currentStatus: row.currentStatus ?? '', coach: row.coach ?? '', seat: row.seat ?? '', berth: row.berth ?? '', ticketNumber: row.ticketNumber ?? '', boardingPoint: row.boardingPoint ?? '' });
  const save = useTicketMutation((b: PassengerRowUpdate) => ticketsApi.updateRow(row.id, b));
  function submit() {
    const body: PassengerRowUpdate = { coach: v.coach || null, seat: v.seat || null, berth: v.berth || null, ticketNumber: v.ticketNumber || null, boardingPoint: v.boardingPoint || null };
    if (v.status) body.status = v.status as PassengerRowUpdate['status'];
    if (v.currentStatus !== (row.currentStatus ?? '')) body.currentStatus = v.currentStatus || null;
    save.mutate(body, { onSuccess: () => { toast.success('Passenger updated'); onDone(); }, onError: e => toast.error('Could not update', (e as ApiError).summary) });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {mode === 'TRAIN' && <Field label="Status as shown by IRCTC" htmlFor="r-cs" hint="e.g. CNF/S5/34/LB, WL 12, RAC 5 — read for you" className="col-span-2"><TextInput id="r-cs" className="uppercase" value={v.currentStatus} onChange={e => setV({ ...v, currentStatus: e.target.value })} /></Field>}
        <Field label="Or set status" htmlFor="r-st"><Select id="r-st" value={v.status} onChange={e => setV({ ...v, status: e.target.value })}><option value="">— keep / read above —</option>{PassengerStatus.options.map(s => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></Field>
        <Field label={mode === 'FLIGHT' ? 'E-ticket no.' : 'Ticket no.'} htmlFor="r-tn"><TextInput id="r-tn" value={v.ticketNumber} onChange={e => setV({ ...v, ticketNumber: e.target.value })} /></Field>
        {mode !== 'FLIGHT' && <Field label="Coach" htmlFor="r-co"><TextInput id="r-co" className="uppercase" value={v.coach} onChange={e => setV({ ...v, coach: e.target.value })} /></Field>}
        <Field label={mode === 'TRAIN' ? 'Berth no.' : 'Seat'} htmlFor="r-se"><TextInput id="r-se" value={v.seat} onChange={e => setV({ ...v, seat: e.target.value })} /></Field>
        {mode === 'TRAIN' && <Field label="Berth type" htmlFor="r-be"><TextInput id="r-be" className="uppercase" placeholder="LB / MB / UB / SL / SU" value={v.berth} onChange={e => setV({ ...v, berth: e.target.value })} /></Field>}
        {mode !== 'FLIGHT' && <Field label="Boarding point" htmlFor="r-bp" className="col-span-2"><TextInput id="r-bp" value={v.boardingPoint} onChange={e => setV({ ...v, boardingPoint: e.target.value })} /></Field>}
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save</Button></div>
    </div>
  );
}

function BulkPaste({ ticket, segment, onDone }: { ticket: Ticket; segment: TicketSegment; onDone: () => void }) {
  const rows = segment.passengers.filter(p => p.status !== 'CANCELLED');
  const [text, setText] = useState(rows.map(r => r.currentStatus ?? '').join('\n'));
  const [chart, setChart] = useState(false);
  const save = useTicketMutation((b: Parameters<typeof ticketsApi.bulkStatuses>[1]) => ticketsApi.bulkStatuses(ticket.id, b));
  function submit() {
    const lines = text.split('\n').map(s => s.trim());
    const payload = rows.map((r, i) => ({ rowId: r.id, currentStatus: lines[i] ?? '' })).filter(x => x.currentStatus);
    if (!payload.length) { toast.error('Nothing to save', 'Paste one status per passenger line.'); return; }
    save.mutate({ rows: payload, chartPrepared: chart }, { onSuccess: t => { toast.success('Statuses saved', `Ticket is now ${t.status.toLowerCase()}`); onDone(); }, onError: e => toast.error('Not saved', (e as ApiError).message) });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">One line per passenger, in this order. Lines that cannot be read are refused, nothing is guessed.</p>
      <div className="grid grid-cols-[1fr_1fr] gap-2 text-sm">
        <ol className="space-y-1 pt-2 text-slate-700">{rows.map(r => <li key={r.id} className="h-7 leading-7 truncate">{r.paxIndex + 1}. {r.name}</li>)}</ol>
        <Textarea aria-label="Statuses" rows={Math.max(3, rows.length)} className="font-mono leading-7 uppercase" value={text} onChange={e => setText(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chart} onChange={e => setChart(e.target.checked)} />The chart has been prepared</label>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save statuses</Button></div>
    </div>
  );
}

/** Per-segment passenger rows: status, coach/seat/berth, ticket number, boarding point. */
export function PassengerGrid({ ticket, canWrite }: { ticket: Ticket; canWrite: boolean }) {
  const [editing, setEditing] = useState<TicketRow | null>(null);
  const [pasting, setPasting] = useState<TicketSegment | null>(null);
  return (
    <div className="space-y-4">
      {ticket.segments.map(s => (
        <section key={s.id} className="bg-white border border-slate-200 rounded-md">
          <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-100">
            <div className="text-sm"><span className="font-medium text-slate-900">{s.fromCode ?? s.fromName} → {s.toCode ?? s.toName}</span><span className="text-slate-500"> · {[s.carrierNumber, s.carrierName, s.travelClass].filter(Boolean).join(' · ')} · {s.departLocal?.replace('T', ' ') ?? 'date not set'}</span></div>
            {canWrite && ticket.mode === 'TRAIN' && s.passengers.length > 1 && <Button size="sm" variant="outline" onClick={() => setPasting(s)}><ClipboardPaste className="w-4 h-4 mr-1.5" />Paste statuses</Button>}
          </header>
          {s.passengers.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No passengers on this ticket yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left font-medium px-4 py-1.5">Passenger</th><th className="text-left font-medium">Status</th><th className="text-left font-medium">{ticket.mode === 'FLIGHT' ? 'Seat' : 'Coach / berth'}</th><th className="text-left font-medium hidden md:table-cell">Ticket no.</th>{ticket.mode !== 'FLIGHT' && <th className="text-left font-medium hidden lg:table-cell">Boards at</th>}</tr></thead>
              <tbody className="divide-y divide-slate-100">{s.passengers.map(p => (
                <tr key={p.id} onClick={canWrite ? () => setEditing(p) : undefined} className={canWrite ? 'cursor-pointer hover:bg-slate-50' : ''}>
                  <td className="px-4 py-1.5">{p.name}<span className="text-xs text-slate-400"> {p.paxType !== 'ADULT' ? p.paxType.toLowerCase() : ''}</span></td>
                  <td><PaxStatusPill status={p.status} position={p.waitlistPosition} />{p.currentStatus && <span className="ml-1 text-xs text-slate-500 font-mono">{p.currentStatus}</span>}</td>
                  <td className="font-mono text-xs">{[p.coach, p.seat, p.berth].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="hidden md:table-cell text-xs">{p.ticketNumber ?? '—'}</td>
                  {ticket.mode !== 'FLIGHT' && <td className="hidden lg:table-cell text-xs text-slate-600">{p.boardingPoint ?? '—'}</td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      ))}
      <Drawer open={!!editing} onOpenChange={o => !o && setEditing(null)} title={editing?.name ?? ''} width="md">{editing && <RowEditor row={editing} mode={ticket.mode} onDone={() => setEditing(null)} />}</Drawer>
      <Drawer open={!!pasting} onOpenChange={o => !o && setPasting(null)} title="Paste passenger statuses" width="lg">{pasting && <BulkPaste ticket={ticket} segment={pasting} onDone={() => setPasting(null)} />}</Drawer>
    </div>
  );
}
