import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Bell, CheckSquare, CalendarDays,
  Plus, Clock, AlertTriangle, CheckCircle2,
  ChevronRight, X, Flag, User, Trash2,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import type { Task, TaskPriority, TaskStatus } from '@/shared/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { fmtDate, daysUntil } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';

// ─── Priority config ──────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dot: string; badge: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-600',    dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200'    },
  high:   { label: 'High',   color: 'text-orange-600', dot: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', color: 'text-amber-600',  dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700 border-amber-200'  },
  low:    { label: 'Low',    color: 'text-gray-500',   dot: 'bg-gray-300',   badge: 'bg-gray-100 text-gray-500 border-gray-200'    },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'text-gray-500'    },
  in_progress: { label: 'In Progress', color: 'text-blue-600'    },
  completed:   { label: 'Completed',   color: 'text-emerald-600' },
  cancelled:   { label: 'Cancelled',   color: 'text-red-400'     },
};

// ─── New Task Dialog ──────────────────────────────────────────

interface TaskFormData {
  title:      string;
  description: string;
  priority:   TaskPriority;
  dueDate:    string;
  assignedTo: string;
}

const DEFAULT_TASK: TaskFormData = {
  title:       '',
  description: '',
  priority:    'medium',
  dueDate:     '',
  assignedTo:  '',
};

interface TaskDialogProps {
  open:    boolean;
  onClose: () => void;
}

function NewTaskDialog({ open, onClose }: TaskDialogProps) {
  const createTask = useStore(s => s.createTask);
  const staff      = useStore(s => s.staff);
  const [form, setForm] = useState<TaskFormData>(DEFAULT_TASK);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TaskFormData>(key: K, val: TaskFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleClose() { setForm(DEFAULT_TASK); onClose(); }

  function handleSave() {
    if (!form.title.trim()) { toast.error('Task title is required'); return; }
    setSaving(true);
    try {
      createTask({
        title:       form.title.trim(),
        description: form.description || undefined,
        priority:    form.priority,
        dueDate:     form.dueDate || undefined,
        assignedTo:  form.assignedTo || undefined,
        status:      'pending',
      });
      toast.success('Task created', form.title);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="tk-title" required>Title</Label>
            <Input
              id="tk-title"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Follow up on visa status"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-desc">Description</Label>
            <Input
              id="tk-desc"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Optional details…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <div className="flex flex-col gap-1">
                {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('priority', p)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
                      form.priority === p
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', PRIORITY_CONFIG[p].dot)} />
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tk-due">Due Date</Label>
                <Input
                  id="tk-due"
                  type="date"
                  value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tk-assign">Assign To</Label>
                <Select value={form.assignedTo} onValueChange={v => set('assignedTo', v)}>
                  <SelectTrigger id="tk-assign">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {staff.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>Create Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Card ────────────────────────────────────────────────

interface TaskCardProps {
  task:     Task;
  onComplete: (id: string) => void;
  onDelete:   (task: Task) => void;
}

function TaskCard({ task, onComplete, onDelete }: TaskCardProps) {
  const pcfg  = PRIORITY_CONFIG[task.priority];
  const scfg  = STATUS_CONFIG[task.status];
  const isDone = task.status === 'completed' || task.status === 'cancelled';

  const daysToGo = task.dueDate ? daysUntil(task.dueDate) : null;
  const isOverdue = daysToGo !== null && daysToGo < 0 && !isDone;

  return (
    <div className={cn(
      'flex items-start gap-3 p-4 bg-white rounded-xl border transition-all',
      isDone ? 'opacity-60 border-gray-100' : 'border-gray-200 hover:border-indigo-200 hover:shadow-sm',
      isOverdue && 'border-red-200 bg-red-50/30',
    )}>
      {/* Checkbox */}
      <button
        onClick={() => !isDone && onComplete(task.id)}
        className={cn(
          'w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
          isDone ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-indigo-400'
        )}
      >
        {isDone && <CheckCircle2 className="w-4 h-4 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium leading-snug', isDone ? 'line-through text-gray-400' : 'text-gray-800')}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {/* Priority */}
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', pcfg.badge)}>
            {pcfg.label}
          </span>
          {/* Due date */}
          {task.dueDate && (
            <span className={cn(
              'flex items-center gap-1 text-[10px] font-medium',
              isOverdue ? 'text-red-600' : daysToGo !== null && daysToGo <= 3 ? 'text-amber-600' : 'text-gray-400'
            )}>
              <Clock className="w-3 h-3" />
              {isOverdue ? `${Math.abs(daysToGo!)}d overdue` : daysToGo === 0 ? 'Today' : `${daysToGo}d`}
            </span>
          )}
          {/* Assigned */}
          {task.assignedTo && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <User className="w-3 h-3" />{task.assignedTo}
            </span>
          )}
          {/* Status */}
          <span className={cn('text-[10px] font-medium capitalize', scfg.color)}>
            {scfg.label}
          </span>
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={() => onDelete(task)}
        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Reminder Card ───────────────────────────────────────────

const REMINDER_BORDER: Record<string, string> = {
  urgent: 'border-red-200 bg-red-50/40',
  high:   'border-orange-200 bg-orange-50/40',
  medium: 'border-amber-100 bg-amber-50/30',
  low:    'border-gray-200 bg-white',
};

// ─── Main Module ─────────────────────────────────────────────

export default function Operations() {
  const navigate = useNavigate();

  const reminders     = useStore(selectors.pendingReminders);
  const tasks         = useStore(s => s.tasks);
  const markSent      = useStore(s => s.markReminderSent);
  const completeTask  = useStore(s => s.completeTask);
  const updateTask    = useStore(s => s.updateTask);
  const trips         = useStore(s => s.trips);

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskFilter,   setTaskFilter]   = useState<TaskStatus | 'all'>('all');

  // ── Computed ─────────────────────────────────────────────

  const pendingTasks   = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return [...pendingTasks].sort((a, b) => {
      const pOrder: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
    });
    return tasks.filter(t => t.status === taskFilter);
  }, [tasks, pendingTasks, taskFilter]);

  // ── Departures board (next 30 days) ──────────────────────

  const upcomingTrips = useMemo(() => {
    return trips.filter(t => {
      const d = daysUntil(t.departure);
      return d !== null && d >= 0 && d <= 30 && t.status !== 'cancelled';
    }).sort((a, b) => (a.departure ?? '').localeCompare(b.departure ?? ''));
  }, [trips]);

  // ── Counts for tab badges ─────────────────────────────────

  const totalPending = reminders.length + pendingTasks.length;

  async function handleDeleteTask(task: Task) {
    const ok = await confirm({
      title:        `Delete "${task.title}"?`,
      description:  'This will permanently remove this task.',
      confirmLabel: 'Delete',
      variant:      'destructive',
    });
    if (ok) {
      updateTask(task.id, { status: 'cancelled' });
      toast.success('Task removed');
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Operations</h2>
          {totalPending > 0 && (
            <Badge variant="destructive">{totalPending} pending</Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setTaskFormOpen(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Task
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Pending Reminders',
            value: reminders.length,
            icon: Bell,
            color: reminders.length > 0 ? 'text-red-600 bg-red-50' : 'text-gray-400 bg-gray-50',
          },
          {
            label: 'Active Tasks',
            value: pendingTasks.length,
            icon: CheckSquare,
            color: pendingTasks.length > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-400 bg-gray-50',
          },
          {
            label: 'Departing (30d)',
            value: upcomingTrips.length,
            icon: CalendarDays,
            color: 'text-blue-600 bg-blue-50',
          },
          {
            label: 'Urgent Alerts',
            value: reminders.filter(r => r.priority === 'urgent').length + tasks.filter(t => t.priority === 'urgent' && t.status === 'pending').length,
            icon: AlertTriangle,
            color: 'text-red-600 bg-red-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', card.color)}>
              <card.icon className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-gray-900 font-display">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="reminders">
        <TabsList>
          <TabsTrigger value="reminders" className="gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            Reminders
            {reminders.length > 0 && (
              <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                {reminders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" />
            Tasks
            {pendingTasks.length > 0 && (
              <span className="ml-1 text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                {pendingTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="departures" className="gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            Departures
            {upcomingTrips.length > 0 && (
              <span className="ml-1 text-[10px] bg-blue-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                {upcomingTrips.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── REMINDERS ─────────────────────────────────────── */}
        <TabsContent value="reminders" className="mt-4">
          {reminders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-gray-800">All clear — no pending reminders!</p>
              <p className="text-xs text-gray-400 mt-1">Reminders are auto-generated from trip dates and deadlines.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Group by priority */}
              {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map(priority => {
                const group = reminders.filter(r => r.priority === priority);
                if (group.length === 0) return null;
                const pcfg = PRIORITY_CONFIG[priority];
                return (
                  <div key={priority}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className={cn('w-2 h-2 rounded-full', pcfg.dot)} />
                      <span className={cn('text-xs font-semibold uppercase tracking-wide', pcfg.color)}>
                        {pcfg.label} · {group.length}
                      </span>
                    </div>
                    <div className="space-y-2 mb-4">
                      {group.map(r => (
                        <div
                          key={r.id}
                          className={cn(
                            'flex items-start gap-4 p-4 rounded-xl border',
                            REMINDER_BORDER[r.priority] ?? REMINDER_BORDER.low
                          )}
                        >
                          <div className="flex-1">
                            <p className="text-sm text-gray-800 leading-relaxed">{r.message}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Due: {fmtDate(r.dueDate)}
                              </span>
                              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', pcfg.badge)}>
                                {pcfg.label}
                              </span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { markSent(r.id); toast.success('Reminder marked as sent'); }}
                            className="text-xs flex-shrink-0 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Done
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── TASKS ────────────────────────────────────────── */}
        <TabsContent value="tasks" className="mt-4 space-y-4">
          {/* Filter + create */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(['all', 'pending', 'in_progress', 'completed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f === 'all' ? 'all' : f as TaskStatus)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full font-medium transition-all capitalize',
                    taskFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {f === 'all' ? `All (${tasks.length})` :
                   f === 'pending' ? `Pending (${tasks.filter(t => t.status === 'pending').length})` :
                   f === 'in_progress' ? `In Progress (${tasks.filter(t => t.status === 'in_progress').length})` :
                   `Done (${completedTasks.length})`}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setTaskFormOpen(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Task
            </Button>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckSquare className="w-7 h-7 text-indigo-300" />
              </div>
              <p className="text-sm font-semibold text-gray-800">No tasks here</p>
              <p className="text-xs text-gray-400 mt-1">
                {taskFilter === 'all' ? 'Create your first task to track pending work' : `No ${taskFilter.replace('_', ' ')} tasks`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={id => { completeTask(id); toast.success('Task completed!'); }}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── DEPARTURES ───────────────────────────────────── */}
        <TabsContent value="departures" className="mt-4">
          {upcomingTrips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="w-7 h-7 text-blue-300" />
              </div>
              <p className="text-sm font-semibold text-gray-800">No departures in the next 30 days</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingTrips.map(t => {
                const days = daysUntil(t.departure);
                const isToday    = days === 0;
                const isTomorrow = days === 1;
                const isUrgent   = (days ?? 99) <= 3;
                const hasBalance = (t.balanceDue ?? 0) > 0;

                return (
                  <div
                    key={t.id}
                    onClick={() => navigate(`/trips/${t.id}`)}
                    className={cn(
                      'flex items-center gap-4 p-4 bg-white rounded-xl border transition-all cursor-pointer hover:shadow-sm group',
                      isToday ? 'border-red-200 bg-red-50/30' :
                      isTomorrow ? 'border-orange-200 bg-orange-50/20' :
                      isUrgent ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200 hover:border-indigo-200'
                    )}
                  >
                    {/* Days countdown */}
                    <div className={cn(
                      'w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 font-bold',
                      isToday ? 'bg-red-100 text-red-700' :
                      isTomorrow ? 'bg-orange-100 text-orange-700' :
                      isUrgent ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-50 text-blue-600'
                    )}>
                      <span className="text-xl leading-none">{days}</span>
                      <span className="text-[9px] font-normal uppercase tracking-wide mt-0.5">
                        {days === 0 ? 'TODAY' : days === 1 ? 'TMRW' : 'DAYS'}
                      </span>
                    </div>

                    {/* Trip info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">{t.customer}</p>
                        {hasBalance && (
                          <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">
                            <AlertTriangle className="w-2.5 h-2.5" /> Balance due
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {t.destination} · {t.pax} pax · {t.type}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-gray-400">
                          Departs: <strong className="text-gray-700">{fmtDate(t.departure)}</strong>
                        </span>
                        {t.returnDate && (
                          <span className="text-[10px] text-gray-400">
                            Returns: <strong className="text-gray-700">{fmtDate(t.returnDate)}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial */}
                    <div className="text-right flex-shrink-0">
                      {hasBalance ? (
                        <>
                          <div className="text-sm font-bold text-red-600">{formatCurrency(t.balanceDue)}</div>
                          <div className="text-[10px] text-red-400">balance due</div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-emerald-600">Paid</div>
                          <div className="text-[10px] text-gray-400">{formatCurrency(t.paidAmount)}</div>
                        </>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewTaskDialog open={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
    </div>
  );
}
