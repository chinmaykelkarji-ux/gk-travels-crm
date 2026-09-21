import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Cog, Copy, UserPlus } from 'lucide-react';
import { StatusPill, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { addDays, istDay, istClock } from '@/shared/calc/istTime';
import { draftFrom } from '@/shared/calc/taskRules';
import { tasksApi, type TaskView } from '../api';
import { useTaskMutation } from '../hooks';

const PRIORITY_TONE: Record<string, Tone> = { urgent: 'danger', high: 'warning', medium: 'info', low: 'neutral' };

/** Where a task's record lives in the app. */
function recordLink(t: TaskView): { to: string; label: string } | null {
  if (t.entityType === 'lead' && t.entityId) return { to: '/leads', label: 'Leads' };
  if (t.entityType === 'sales_quote' && t.entityId) return { to: `/quotes/${t.entityId}`, label: 'Quotation' };
  if (t.entityType === 'ticket' && t.entityId) return { to: `/tickets/${t.entityId}`, label: 'Ticket' };
  if (t.entityType === 'invoice' && t.entityId) return { to: `/invoices/${t.entityId}`, label: 'Invoice' };
  if (t.entityType === 'vendor_bill') return { to: '/payables', label: 'Supplier money' };
  if (!t.tripId) return null;
  const tab = ({ hotel_booking: 'hotels', vehicle_assignment: 'transport', activity_booking: 'activities', traveller: 'travellers' } as Record<string, string>)[t.entityType ?? ''];
  return { to: `/trips/${t.tripId}${tab ? `?tab=${tab}` : ''}`, label: t.trip?.label ?? t.tripId };
}

function dueText(iso: string | null | undefined, today: string): string {
  if (!iso) return 'no date';
  const d = istDay(iso)!;
  const when = d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : d === addDays(today, -1) ? 'yesterday' : d;
  return `${when} ${istClock(iso)}`;
}

/** One open task with its quick actions: done, snooze, take it. */
export function TaskRow({ t, today, meId, canWrite }: { t: TaskView; today: string; meId: string | null; canWrite: boolean }) {
  const [closing, setClosing] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const update = useTaskMutation((b: Parameters<typeof tasksApi.update>[1]) => tasksApi.update(t.id, b));
  const act = (b: Parameters<typeof tasksApi.update>[1], ok: string) => update.mutate(b, { onSuccess: () => { toast.success(ok); setClosing(false); }, onError: e => toast.error('Not saved', (e as ApiError).message) });
  const draft = draftFrom(t.description);
  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft!);
      toast.success('Message copied', 'Read it once, then send it from WhatsApp or e-mail.');
    } catch {
      toast.error('Could not copy', 'Select the text above and copy it by hand.');
    }
  };
  const link = recordLink(t);
  const overdue = t.bucket === 'OVERDUE';
  const tomorrow9 = `${addDays(today, 1)}T09:00`;

  return (
    <li className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{t.title}</span>
          <StatusPill tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>{t.priority}</StatusPill>
          {t.ruleName && <span className="inline-flex items-center gap-1 text-[11px] text-slate-500" title="Raised by a task rule; it closes itself when the record no longer needs it"><Cog className="w-3 h-3" />{t.ruleName}</span>}
        </div>
        {t.description && (
          <div className="mt-0.5">
            <p className={`text-sm text-slate-600 whitespace-pre-wrap ${open ? '' : 'line-clamp-2'}`}>{t.description}</p>
            {(draft || t.description.length > 120) && (
              <div className="flex flex-wrap gap-3 mt-1">
                <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setOpen(o => !o)}>{open ? 'Show less' : 'Show more'}</button>
                {draft && (
                  <button type="button" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1" onClick={copyDraft}>
                    <Copy className="w-3 h-3" />Copy the message
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
          <span className={overdue ? 'text-red-600 font-medium' : undefined}><Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />{overdue ? 'was due ' : 'due '}{dueText(t.effectiveDue ?? t.dueAt, today)}{t.snoozedUntil ? ' (snoozed)' : ''}</span>
          {link && <Link to={link.to} className="text-indigo-600 hover:underline">{link.label}</Link>}
          <span>{t.assignedTo ?? 'unassigned'}</span>
        </div>
        {closing && (
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="flex-1 min-w-[200px] h-8 px-2 text-sm rounded border border-slate-300" placeholder="What was done (optional)" value={note} onChange={e => setNote(e.target.value)} autoFocus />
            <Button size="sm" variant="success" loading={update.isPending} onClick={() => act({ status: 'completed', note: note || null }, 'Done')}>Mark done</Button>
            <Button size="sm" variant="ghost" onClick={() => setClosing(false)}>Back</Button>
          </div>
        )}
      </div>
      {canWrite && !closing && (
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <Button size="sm" variant="outline" onClick={() => setClosing(true)}><Check className="w-3.5 h-3.5 mr-1" />Done</Button>
          <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => act({ snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }, 'Snoozed for an hour')}>+1 h</Button>
          <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => act({ snoozedUntil: tomorrow9 }, 'Snoozed to tomorrow 09:00')}>Tomorrow</Button>
          {meId && t.assignedToUserId !== meId && <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => act({ assignedToUserId: meId }, 'Assigned to you')}><UserPlus className="w-3.5 h-3.5 mr-1" />Take</Button>}
        </div>
      )}
    </li>
  );
}
