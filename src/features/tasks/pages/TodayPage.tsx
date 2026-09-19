import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings2 } from 'lucide-react';
import { PageHeader, EmptyState, Drawer } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useAuth } from '@/backend/auth/AuthContext';
import type { ApiError } from '@/lib/api';
import { useToday } from '../hooks';
import { TaskRow } from '../components/TaskRow';
import { NewTaskForm } from '../components/NewTaskForm';

const BUCKET_STYLE: Record<string, string> = { OVERDUE: 'text-red-700', NOW: 'text-amber-700', TODAY: 'text-slate-800', TOMORROW: 'text-slate-700', THIS_WEEK: 'text-slate-600', NO_DATE: 'text-slate-500' };

/** Everything that needs doing, most urgent first. Rule tasks close themselves when the record is sorted. */
export default function TodayPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const [mine, setMine] = useState(false);
  const [adding, setAdding] = useState(false);
  const q = useToday(mine);
  const total = q.data ? q.data.buckets.reduce((s, b) => s + b.tasks.length, 0) : 0;

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Today" subtitle={q.data ? `${q.data.counts.OVERDUE ?? 0} overdue · ${(q.data.counts.NOW ?? 0) + (q.data.counts.TODAY ?? 0)} due today · ${total} open in the next 7 days` : 'What needs doing, most urgent first'}
        actions={<div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm" role="group" aria-label="Whose tasks">
            {[{ v: false, l: 'Everyone' }, { v: true, l: 'Mine' }].map(o => (
              <button key={o.l} type="button" aria-pressed={mine === o.v} onClick={() => setMine(o.v)} className={`px-3 py-1 rounded ${mine === o.v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{o.l}</button>
            ))}
          </div>
          {can('tasks:write') && <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" />Task</Button>}
          <Link to="/settings/task-rules" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><Settings2 className="w-3.5 h-3.5" />Rules</Link>
        </div>} />
      <div className="px-5 py-4 space-y-4 max-w-5xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load tasks" description={(q.error as ApiError).message} />}
        {q.data && total === 0 && <div className="bg-white border border-slate-200 rounded-md"><EmptyState title="Nothing due" description={mine ? 'No open tasks assigned to you for the next 7 days.' : 'No open tasks for the next 7 days.'} /></div>}
        {q.data?.buckets.map(b => (
          <section key={b.bucket}>
            <h2 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${BUCKET_STYLE[b.bucket] ?? ''}`}>{b.label} <span className="text-slate-400 font-normal">{b.tasks.length}</span></h2>
            <ul className={`bg-white border rounded-md divide-y divide-slate-100 ${b.bucket === 'OVERDUE' ? 'border-red-200' : 'border-slate-200'}`}>
              {b.tasks.map(t => <TaskRow key={t.id} t={t} today={q.data.today} meId={user?.id ?? null} canWrite={can('tasks:write')} />)}
            </ul>
          </section>
        ))}
      </div>
      <Drawer open={adding} onOpenChange={setAdding} title="New task">{adding && <NewTaskForm onDone={() => setAdding(false)} />}</Drawer>
    </div>
  );
}
