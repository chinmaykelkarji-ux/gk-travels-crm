import { useState, type ReactNode } from 'react';
import { StatusPill, Field, Select, TextInput, Textarea, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { useTeam } from '../hooks';
import type { LeadStatus, EnquiryStatus } from '@/shared/contracts/sales';

export const LEAD_COLUMNS: { status: LeadStatus; label: string; tone: Tone }[] = [
  { status: 'new', label: 'New', tone: 'info' }, { status: 'contacted', label: 'Contacted', tone: 'accent' },
  { status: 'qualified', label: 'Qualified', tone: 'warning' }, { status: 'converted', label: 'Converted', tone: 'success' }, { status: 'lost', label: 'Lost', tone: 'neutral' },
];
export const ENQUIRY_COLUMNS: { status: EnquiryStatus; label: string; tone: Tone }[] = [
  { status: 'NEW', label: 'New', tone: 'info' }, { status: 'IN_PROGRESS', label: 'In progress', tone: 'accent' }, { status: 'QUOTED', label: 'Quoted', tone: 'warning' },
  { status: 'NEGOTIATING', label: 'Negotiating', tone: 'warning' }, { status: 'WON', label: 'Won', tone: 'success' }, { status: 'LOST', label: 'Lost', tone: 'neutral' },
];
export const PRIORITY_TONE: Record<string, Tone> = { low: 'neutral', medium: 'info', high: 'danger' };

export function StatusBadge<S extends string>({ status, columns }: { status: S; columns: { status: S; label: string; tone: Tone }[] }) {
  const c = columns.find(x => x.status === status);
  return <StatusPill tone={c?.tone ?? 'neutral'}>{c?.label ?? status}</StatusPill>;
}

/** Assignee dropdown fed by /api/v2/me/team. */
export function AssigneeSelect({ value, onChange, id = 'assignee', label = 'Assigned to' }: { value: string | null | undefined; onChange: (userId: string | null) => void; id?: string; label?: ReactNode }) {
  const team = useTeam();
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">Unassigned</option>
        {(team.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name} · {u.role.toLowerCase()}</option>)}
      </Select>
    </Field>
  );
}

/** Kanban-style board: columns per status, cards rendered by the caller. */
export function Board<T, S extends string>({ columns, items, statusOf, renderCard, keyOf, emptyLabel = 'Nothing here' }: {
  columns: { status: S; label: string; tone: Tone }[]; items: T[]; statusOf: (t: T) => S; renderCard: (t: T) => ReactNode; keyOf: (t: T) => string; emptyLabel?: string;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-5 snap-x">
      {columns.map(col => {
        const rows = items.filter(i => statusOf(i) === col.status);
        return (
          <section key={col.status} className="w-72 flex-shrink-0 snap-start">
            <header className="flex items-center justify-between px-1 pb-2"><StatusPill tone={col.tone}>{col.label}</StatusPill><span className="text-xs text-slate-500 tabular-nums">{rows.length}</span></header>
            <div className="space-y-2 min-h-[120px] rounded-md bg-slate-100/70 p-2">
              {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-6">{emptyLabel}</p>}
              {rows.map(r => <div key={keyOf(r)}>{renderCard(r)}</div>)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Status change with optional note / required lost reason. */
export function StatusChangeForm<S extends string>({ options, onSubmit, submitting, lostValue }: { options: { status: S; label: string }[]; onSubmit: (v: { status: S; note: string | null; lostReason: string | null }) => void; submitting: boolean; lostValue: S }) {
  const [status, setStatus] = useState<S>(options[0]?.status);
  const [note, setNote] = useState('');
  const [lostReason, setLostReason] = useState('');
  if (!options.length) return <p className="text-sm text-slate-500">No further moves from this stage.</p>;
  return (
    <div className="space-y-3">
      <Field label="Move to" htmlFor="status"><Select id="status" value={status} onChange={e => setStatus(e.target.value as S)}>{options.map(o => <option key={o.status} value={o.status}>{o.label}</option>)}</Select></Field>
      {status === lostValue && <Field label="Reason" htmlFor="lostReason" required><TextInput id="lostReason" value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Budget, timing, went elsewhere…" /></Field>}
      <Field label="Note" htmlFor="note"><Textarea id="note" rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div className="flex justify-end"><Button size="sm" loading={submitting} disabled={status === lostValue && !lostReason.trim()} onClick={() => onSubmit({ status, note: note.trim() || null, lostReason: status === lostValue ? lostReason.trim() : null })}>Update</Button></div>
    </div>
  );
}

export function NoteForm({ onSubmit, submitting }: { onSubmit: (note: string) => void; submitting: boolean }) {
  const [note, setNote] = useState('');
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (note.trim()) { onSubmit(note.trim()); setNote(''); } }}>
      <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" aria-label="Note" />
      <Button type="submit" size="sm" variant="outline" loading={submitting} disabled={!note.trim()}>Add</Button>
    </form>
  );
}

export function paxLabel(e: { adults: number; children: number; infants: number }): string {
  const parts = [`${e.adults} adult${e.adults === 1 ? '' : 's'}`];
  if (e.children) parts.push(`${e.children} child${e.children === 1 ? '' : 'ren'}`);
  if (e.infants) parts.push(`${e.infants} infant${e.infants === 1 ? '' : 's'}`);
  return parts.join(', ');
}
