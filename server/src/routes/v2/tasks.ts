// Tasks v2 — /api/v2/tasks (Today view, manual tasks, assign/snooze/complete)
// and /api/v2/task-rules (the engine's settings; changing them is admin-only).
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { TaskCreate, TaskListQuery, TaskRuleUpdate, TaskUpdate, TodayQuery } from '../../../../src/shared/contracts/tasks.js';
import * as svc from '../../modules/tasks/service.js';
import { sweep } from '../../modules/tasks/engine.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

tasksRouter.get('/', requirePermission('tasks:read'), validate({ query: TaskListQuery }), async (req: AuthRequest, res) => { res.json(await svc.listTasks(valid<unknown, TaskListQuery>(res).query, req.userId, req.userRole)); });
tasksRouter.get('/today', requirePermission('tasks:read'), validate({ query: TodayQuery }), async (req: AuthRequest, res) => { res.json(await svc.today(valid<unknown, TodayQuery>(res).query, req.userId, new Date(), req.userRole)); });
tasksRouter.post('/', requirePermission('tasks:write'), validate({ body: TaskCreate }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createTask(valid<TaskCreate>(res).body, req.userId)); });
tasksRouter.patch('/:id', requirePermission('tasks:write'), validate({ body: TaskUpdate }), async (req: AuthRequest, res) => { res.json(await svc.updateTask(p(req), valid<TaskUpdate>(res).body, req.userId)); });

export const taskRulesRouter = Router();
taskRulesRouter.use(requireAuth);
taskRulesRouter.get('/', requirePermission('tasks:read'), async (_req, res) => { res.json(await svc.listRules()); });
taskRulesRouter.put('/:code', requirePermission('settings:write'), validate({ body: TaskRuleUpdate }), async (req: AuthRequest, res) => { res.json(await svc.updateRule(p(req, 'code'), valid<TaskRuleUpdate>(res).body, req.userId)); });
taskRulesRouter.post('/recalculate', requirePermission('settings:write'), async (_req, res) => { res.json(await sweep()); });
