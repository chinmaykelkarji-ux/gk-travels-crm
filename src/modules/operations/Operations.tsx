import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckSquare, CalendarDays,
  Plus, Clock, AlertTriangle, CheckCircle2,
  ChevronRight, User, Trash2, Pencil,
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

// Defensive fallbacks so null/unknown DB values never crash the UI
const PRIORITY_FALLBACK = PRIORITY_CONFIG.medium;
const STATUS_FALLBACK   = STATUS_CONFIG.pending;

function getPriorityCfg(p: string | undefined) {
  return PRIORITY_CONFIG[p as TaskPriority] ?? PRIORITY_FALLBACK;
}
function getStatusCfg(s: string | undefined) {
  return STATUS_CONFIG[s as TaskStatus] ?? STATUS_FALLBACK;
}

// ─── Task Dialog (Create + Edit) ─────────────────────────────

interface TaskFormData {
  title:       string;
  description: string;
  priority:    TaskPriority;
  status:      TaskStatus;
  dueDate:     string;
  assignedTo:  string;
  tripId:      string;
  customerId:  string;
}

const DEFAULT_TASK: TaskFormData = {
  title:       '',
  description: '',
  priority:    'medium',
  status:      'pending',
  dueDate:     '',
  assignedTo:  '__none__',
  tripId:      '__none__',
  customerId:  '__none__',
};

function taskToForm(task: Task): TaskFormData {
  return {
    title:       task.title,
    description: task.description ?? '',
    priority:    (task.priority as TaskPriority) ?? 'medium',
    status:      (task.status   as TaskStatus)   ?? 'pending',
    dueDate:     task.dueDate    ?? '',
    assignedTo:  task.assignedTo ?? '__none__',
    tripId:      task.tripId     ?? '__none__',
    customerId:  task.customerId ?? '__none__',
  };
}

interface TaskDialogProps {
  open:    boolean;
  onClose: () => void;
  task?:   Task;  // undefined → create mode, defined → edit mode
}

function TaskDialog({ open, onClose, task }: TaskDialogProps) {
  const createTask = useStore(s => s.createTask);
  const updateTask = useStore(s => s.updateTask);
  const staff      = useStore(s => s.staff);
  const trips      = useStore(s => s.trips);
  const customers  = useStore(s => s.customers);

  const isEdit = !!task;

  const [form, setForm] = useState<TaskFormData>(() =>
    task ? taskToForm(task) : DEFAULT_TASK
  );
  const [saving, setSaving] = useState(false);

  // Sync form when the dialog opens with a different task
  useMemo(() => {
    if (open) setForm(task ? taskToForm(task) : DEFAULT_TASK);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  function set<K extends keyof TaskFormData>(key: K, val: TaskFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleClose() { setForm(DEFAULT_TASK); onClose(); }

  function handleSave() {
    if (!form.title.trim()) { toast.error('Task title is required'); return; }
    setSaving(true);
    try {
      const payload = {
        title:       form.title.trim(),
        description: form.description || undefined,
        priority:    form.priority,
        status:      form.status,
        dueDate:     form.dueDate     || undefined,
        assignedTo:  form.assignedTo  === '__none__' ? undefined : form.assignedTo,
        tripId:      form.tripId      === '__none__' ? undefined : form.tripId,
        customerId:  form.customerId  === '__none__' ? undefined : form.customerId,
      };
      if (isEdit && task) {
        updateTask(task.id, payload);
        toast.success('Task updated', form.title.trim());
      } else {
        createTask({ ...payload, status: form.status });
        toast.success('Task created', form.title.trim());
      }
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  const activeTrips = trips.filter(t => t.status !== 'cancelled');

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
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
              {isEdit && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => set('status', v as TaskStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {staff.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Link to Trip</Label>
              <Select value={form.tripId} onValueChange={v => set('tripId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {activeTrips.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.id} — {t.customer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Link to Customer</Label>
              <Select value={form.customerId} onValueChange={v => set('customerId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Card ────────────────────────────────────────────────

interface TaskCardProps {
  task:       Task;
  onComplete: (id: string) => void;
  onEdit:     (task: Task) => void;
  onDelete:   (task: Task) => void;
}

function TaskCard({ task, onComplete, onEdit, onDelete }: TaskCardProps) {
  const pcfg  = getPriorityCfg(task.priority);
  const scfg  = getStatusCfg(task.status);
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
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {!isDone && (
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
            title="Edit task"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(task)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
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

  const reminders    = useStore(selectors.pendingReminders);
  const tasks        = useStore(s => s.tasks);
  const markSent     = useStore(s => s.markReminderSent);
  const completeTask = useStore(s => s.completeTask);
  const deleteTask   = useStore(s => s.deleteTask);
  const trips        = useStore(s => s.trips);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask,    setEditingTask]    = useState<Task | undefined>(undefined);
  const [taskFilter,     setTaskFilter]     = useState<TaskStatus | 'all'>('all');

  // ── Computed ─────────────────────────────────────────────

  const pendingTasks   = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return [...pendingTasks].sort((a, b) => {
      const pOrder: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (pOrder[a.priority as TaskPriority] ?? 3) - (pOrder[b.priority as TaskPriority] ?? 3);
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

  function openNewTask() {
    setEditingTask(undefined);
    setTaskDialogOpen(true);
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setTaskDialogOpen(true);
  }

  function closeTaskDialog() {
    setTaskDialogOpen(false);
    setEditingTask(undefined);
  }

  async function handleDeleteTask(task: Task) {
    const ok = await confirm({
      title:        `Delete "${task.title}"?`,
      description:  'This will permanently remove this task from the database.',
      confirmLabel: 'Delete',
      variant:      'destructive',
    });
    if (ok) {
      deleteTask(task.id);
      toast.success('Task deleted');
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
        <Button size="sm" onClick={openNewTask} className="gap-1.5">
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
            <Button size="sm" variant="outline" onClick={openNewTask} className="gap-1.5">
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
                  onEdit={openEditTask}
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

      <TaskDialog
        open={taskDialogOpen}
        onClose={closeTaskDialog}
        task={editingTask}
      />
    </div>
  );
}
