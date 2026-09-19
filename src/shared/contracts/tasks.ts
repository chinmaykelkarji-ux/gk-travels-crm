// Tasks v2: the Today view, manual tasks, and the rule settings.
import { z } from 'zod';
import { queryBool } from './common';
import { parseIst } from '../calc/istTime';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
/** IST wall-clock "YYYY-MM-DDTHH:mm" or an ISO instant → ISO instant. */
const istDateTime = z.string().trim().min(10).transform((v, ctx) => {
  const d = parseIst(v);
  if (!d) { ctx.addIssue({ code: 'custom', message: 'Use a date and time' }); return z.NEVER; }
  return d.toISOString();
});

export const TaskPriority = z.enum(['urgent', 'high', 'medium', 'low']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const TaskListQuery = z.object({
  mine:   queryBool.optional(),
  status: z.enum(['open', 'done', 'all']).default('open'),
  tripId: z.string().trim().max(64).optional(),
  q:      z.string().trim().max(100).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TaskListQuery = z.infer<typeof TaskListQuery>;

export const TodayQuery = z.object({ mine: queryBool.optional() });
export type TodayQuery = z.infer<typeof TodayQuery>;

export const TaskCreate = z.object({
  title:            z.string().trim().min(1, 'Give the task a title').max(200),
  description:      optionalText(2000),
  priority:         TaskPriority.default('medium'),
  dueAt:            istDateTime.optional().nullable(),
  tripId:           z.string().trim().max(64).optional().nullable(),
  assignedToUserId: z.string().trim().max(64).optional().nullable(),
});
export type TaskCreate = z.infer<typeof TaskCreate>;

export const TaskUpdate = z.object({
  title:            z.string().trim().min(1).max(200).optional(),
  description:      optionalText(2000),
  priority:         TaskPriority.optional(),
  dueAt:            istDateTime.optional().nullable(),
  snoozedUntil:     istDateTime.optional().nullable(),
  assignedToUserId: z.string().trim().max(64).optional().nullable(),
  status:           z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  note:             optionalText(500),
}).partial();
export type TaskUpdate = z.infer<typeof TaskUpdate>;

export const TaskRuleUpdate = z.object({
  enabled: z.boolean().optional(),
  params:  z.record(z.string(), z.number()).optional(),
});
export type TaskRuleUpdate = z.infer<typeof TaskRuleUpdate>;
