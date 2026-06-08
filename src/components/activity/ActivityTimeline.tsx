// Reusable activity timeline — the single rendering surface for the central
// ActivityLog feed (Phase 2). Wired into every entity detail page so the
// audit trail always looks and behaves the same: grouped by day, relative
// timestamps, per-action icon + colour, expandable metadata.
//
// NO duplicated timeline logic: every detail page passes its own filtered
// slice of `activityLog` (and optionally `communications`) — the rendering,
// grouping and styling all live here.

import { useMemo, useState } from 'react';
import {
  UserPlus, UserCog, Trash2, Tag, ArrowRightLeft, FileText, FilePenLine,
  FileCheck2, FileX2, FileClock, Send, Plane, Receipt, Ban, Ticket,
  IndianRupee, Wallet, ReceiptText, RotateCcw, SlidersHorizontal,
  CheckCircle2, BellRing, MessageCircle, Mail, Activity as ActivityIcon,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { fmtDate, fmtDateTime, daysAgo } from '@/shared/utils/date';
import type { ActivityLog, Communication } from '@/shared/types';

// ─── Per-action icon + colour ─────────────────────────────────

interface ActionMeta {
  icon: React.ComponentType<{ className?: string }>;
  className: string; // icon chip background + text colour
}

const DEFAULT_META: ActionMeta = { icon: ActivityIcon, className: 'bg-slate-100 text-slate-600' };

const ACTION_META: Record<string, ActionMeta> = {
  customer_created:            { icon: UserPlus,        className: 'bg-emerald-100 text-emerald-600' },
  customer_updated:            { icon: UserCog,         className: 'bg-slate-100 text-slate-600' },
  customer_deleted:            { icon: Trash2,          className: 'bg-red-100 text-red-600' },
  lead_created:                { icon: UserPlus,        className: 'bg-blue-100 text-blue-600' },
  lead_status_changed:         { icon: Tag,             className: 'bg-amber-100 text-amber-600' },
  lead_converted:              { icon: ArrowRightLeft,  className: 'bg-violet-100 text-violet-600' },
  quotation_created:           { icon: FileText,        className: 'bg-blue-100 text-blue-600' },
  quotation_updated:           { icon: FilePenLine,     className: 'bg-slate-100 text-slate-600' },
  quotation_status_changed:    { icon: Tag,             className: 'bg-amber-100 text-amber-600' },
  quotation_submitted:         { icon: FileClock,       className: 'bg-amber-100 text-amber-600' },
  quotation_approved:          { icon: FileCheck2,      className: 'bg-emerald-100 text-emerald-600' },
  quotation_rejected:          { icon: FileX2,          className: 'bg-red-100 text-red-600' },
  quotation_converted:         { icon: ArrowRightLeft,  className: 'bg-violet-100 text-violet-600' },
  quotation_sent_comm:         { icon: Send,            className: 'bg-blue-100 text-blue-600' },
  trip_created:                { icon: Plane,           className: 'bg-indigo-100 text-indigo-600' },
  trip_status_changed:         { icon: Tag,             className: 'bg-amber-100 text-amber-600' },
  booking_created:             { icon: Receipt,         className: 'bg-indigo-100 text-indigo-600' },
  booking_updated:             { icon: FilePenLine,     className: 'bg-slate-100 text-slate-600' },
  booking_cancelled:           { icon: Ban,             className: 'bg-red-100 text-red-600' },
  voucher_issued:              { icon: Ticket,          className: 'bg-purple-100 text-purple-600' },
  voucher_sent:                { icon: Send,            className: 'bg-blue-100 text-blue-600' },
  itinerary_sent:              { icon: Send,            className: 'bg-blue-100 text-blue-600' },
  receivable_created:          { icon: ReceiptText,     className: 'bg-amber-100 text-amber-600' },
  receivable_payment_recorded: { icon: IndianRupee,     className: 'bg-emerald-100 text-emerald-600' },
  receivable_overdue:          { icon: Ban,             className: 'bg-red-100 text-red-600' },
  payment_received:            { icon: IndianRupee,     className: 'bg-emerald-100 text-emerald-600' },
  payment_sent:                { icon: Wallet,          className: 'bg-orange-100 text-orange-600' },
  payable_created:             { icon: ReceiptText,     className: 'bg-amber-100 text-amber-600' },
  vendor_payment_sent:         { icon: Wallet,          className: 'bg-orange-100 text-orange-600' },
  vendor_payment_settled:      { icon: CheckCircle2,    className: 'bg-emerald-100 text-emerald-600' },
  refund_issued:               { icon: RotateCcw,       className: 'bg-orange-100 text-orange-600' },
  adjustment_recorded:         { icon: SlidersHorizontal, className: 'bg-slate-100 text-slate-600' },
  task_completed:              { icon: CheckCircle2,    className: 'bg-emerald-100 text-emerald-600' },
  reminder_completed:          { icon: BellRing,        className: 'bg-emerald-100 text-emerald-600' },
  communication_sent:          { icon: MessageCircle,   className: 'bg-blue-100 text-blue-600' },
};

function metaFor(action: string): ActionMeta {
  return ACTION_META[action] ?? DEFAULT_META;
}

// ─── Day grouping ─────────────────────────────────────────────

function dayLabel(dateStr: string): string {
  const today = fmtDate(new Date().toISOString());
  const yesterday = fmtDate(new Date(Date.now() - 86400000).toISOString());
  const label = fmtDate(dateStr);
  if (label === today) return 'Today';
  if (label === yesterday) return 'Yesterday';
  return label;
}

interface TimelineEntry {
  id: string;
  kind: 'activity' | 'communication';
  timestamp: string;
  date: string;
  activity?: ActivityLog;
  communication?: Communication;
}

function toEntries(activity: ActivityLog[], communications: Communication[]): TimelineEntry[] {
  const fromActivity: TimelineEntry[] = activity.map(a => ({
    id: `activity-${a.id}`, kind: 'activity', timestamp: a.timestamp, date: a.date, activity: a,
  }));
  const fromComms: TimelineEntry[] = communications.map(c => ({
    id: `comm-${c.id}`, kind: 'communication', timestamp: c.createdAt, date: fmtDate(c.createdAt), communication: c,
  }));
  return [...fromActivity, ...fromComms].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// ─── Single row ───────────────────────────────────────────────

function MetadataPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const keys = Object.keys(metadata);
  if (keys.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-[11px]">
      {keys.map(key => (
        <div key={key} className="flex items-baseline gap-1.5 min-w-0">
          <dt className="text-gray-400 capitalize flex-shrink-0">{key.replace(/([A-Z])/g, ' $1').trim()}:</dt>
          <dd className="text-gray-700 font-medium truncate">{formatMetaValue(metadata[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ActivityRow({ entry }: { entry: TimelineEntry }) {
  const [open, setOpen] = useState(false);

  if (entry.kind === 'communication' && entry.communication) {
    const c = entry.communication;
    const Icon = c.type === 'whatsapp' ? MessageCircle : Mail;
    const colour = c.type === 'whatsapp' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600';
    return (
      <div className="flex items-start gap-3 py-2.5">
        <div className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full', colour)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-700 leading-snug">
            <span className="font-semibold text-gray-900">{c.type === 'whatsapp' ? 'WhatsApp' : 'Email'} sent</span>
            {c.subject ? <> — {c.subject}</> : null}
            {c.recipient ? <span className="text-gray-400"> · to {c.recipient}</span> : null}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-400" title={fmtDateTime(c.createdAt)}>
            {daysAgo(c.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  const a = entry.activity;
  if (!a) return null;
  const { icon: Icon, className } = metaFor(a.action);
  const metadata = (a.metadata && typeof a.metadata === 'object') ? a.metadata as Record<string, unknown> : null;
  const hasMetadata = !!metadata && Object.keys(metadata).length > 0;

  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full', className)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => hasMetadata && setOpen(o => !o)}
            className={cn('flex w-full items-start gap-1.5 text-left', hasMetadata && 'cursor-pointer group')}
            disabled={!hasMetadata}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug text-gray-700">
                <span className="font-semibold text-gray-900">{a.title ?? a.action}</span>
                {a.description && a.description !== a.title ? <> — {a.description}</> : null}
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400" title={fmtDateTime(a.timestamp)}>
                {daysAgo(a.timestamp)}
              </p>
            </div>
            {hasMetadata && (
              open
                ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300 group-hover:text-gray-400" />
                : <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300 group-hover:text-gray-400" />
            )}
          </button>
          {hasMetadata && open && <MetadataPanel metadata={metadata!} />}
        </div>
      </div>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────

export interface ActivityTimelineProps {
  activity: ActivityLog[];
  communications?: Communication[];
  emptyLabel?: string;
  limit?: number;
  className?: string;
}

export function ActivityTimeline({
  activity, communications = [], emptyLabel = 'No activity yet', limit, className,
}: ActivityTimelineProps) {
  const groups = useMemo(() => {
    const entries = toEntries(activity, communications);
    const sliced = limit ? entries.slice(0, limit) : entries;

    const byDay = new Map<string, TimelineEntry[]>();
    for (const entry of sliced) {
      const label = dayLabel(entry.date || entry.timestamp);
      if (!byDay.has(label)) byDay.set(label, []);
      byDay.get(label)!.push(entry);
    }
    return Array.from(byDay.entries());
  }, [activity, communications, limit]);

  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">{emptyLabel}</p>;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {groups.map(([label, entries]) => (
        <div key={label}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
          <div className="divide-y divide-gray-50">
            {entries.map(entry => <ActivityRow key={entry.id} entry={entry} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
