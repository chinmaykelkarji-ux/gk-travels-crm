import { api, type Page } from '@/lib/api';
import type { RuleDef, UrgencyBucket } from '@/shared/calc/taskRules';
import type { TaskCreate, TaskListQuery, TaskRuleUpdate, TaskUpdate } from '@/shared/contracts/tasks';

export interface TaskView {
  id: string; title: string; description: string | null; priority: string; status: string; source: string;
  ruleCode: string | null; ruleName: string | null; tripId: string | null; trip: { id: string; label: string; stage: string } | null;
  customerId: string | null; entityType: string | null; entityId: string | null;
  dueAt: string | null; dueDate: string | null; snoozedUntil: string | null; assignedToUserId: string | null; assignedTo: string | null;
  completedAt: string | null; closeReason: string | null; autoClosed: boolean; createdAt: string;
  bucket?: UrgencyBucket; effectiveDue?: string | null;
}
export interface TodayView { now: string; today: string; buckets: { bucket: UrgencyBucket; label: string; tasks: TaskView[] }[]; counts: Record<UrgencyBucket, number> }
export interface RuleView extends RuleDef { enabled: boolean; values: Record<string, number>; openTasks: number; updatedAt: string | null }

export const tasksApi = {
  today:  (mine: boolean) => api.get<TodayView>('/v2/tasks/today', { mine }),
  list:   (q: Partial<TaskListQuery>) => api.get<Page<TaskView>>('/v2/tasks', q),
  create: (b: TaskCreate) => api.post<TaskView>('/v2/tasks', b),
  update: (id: string, b: TaskUpdate) => api.patch<TaskView>(`/v2/tasks/${id}`, b),
  rules:  () => api.get<RuleView[]>('/v2/task-rules'),
  updateRule: (code: string, b: TaskRuleUpdate) => api.put<{ rules: RuleView[]; recalculated: { created: number; updated: number; closed: number; reopened: number; trips: number } }>(`/v2/task-rules/${code}`, b),
};
