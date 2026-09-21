// Expenses — /api/v2/expenses. Operations record what they spend on the
// road (expenses:write); accounts see everything and settle what staff are
// owed (finance:write).
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { ExpenseCancel, ExpenseInput, ExpenseListQuery, ReimburseInput } from '../../../../src/shared/contracts/expenses.js';
import * as svc from '../../modules/expenses/service.js';

const router = Router();
router.use(requireAuth);
const READ = requirePermission('expenses:read');
const WRITE = requirePermission('expenses:write');
const FINANCE = requirePermission('finance:write');
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

router.get('/', READ, validate({ query: ExpenseListQuery }), async (_req, res) => { res.json(await svc.listExpenses(valid<unknown, ExpenseListQuery>(res).query)); });
router.get('/reimbursements', READ, async (_req, res) => { res.json(await svc.reimbursementsOwed()); });
router.get('/:id', READ, async (req: AuthRequest, res) => { res.json(await svc.getExpense(p(req))); });
router.post('/', WRITE, validate({ body: ExpenseInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createExpense(valid<ExpenseInput>(res).body, req.userId)); });
router.post('/:id/cancel', WRITE, validate({ body: ExpenseCancel }), async (req: AuthRequest, res) => { res.json(await svc.cancelExpense(p(req), valid<ExpenseCancel>(res).body.reason, req.userId)); });
router.post('/reimbursements', FINANCE, validate({ body: ReimburseInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.reimburse(valid<ReimburseInput>(res).body, req.userId)); });

export default router;
