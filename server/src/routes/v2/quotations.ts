// Unified quotation engine — /api/v2/quotations
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { QuoteCreate, QuoteUpdate, QuoteListQuery, QuoteStatusChange, SelectOption, ApprovalDecision, AcceptInput } from '../../../../src/shared/contracts/quotations.js';
import * as svc from '../../modules/quotations/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('sales-quotes:read'), validate({ query: QuoteListQuery }), async (_req, res) => {
  res.json(await svc.listQuotes(valid<unknown, z.infer<typeof QuoteListQuery>>(res).query));
});
router.post('/', requirePermission('sales-quotes:write'), validate({ body: QuoteCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.createQuote(valid<z.infer<typeof QuoteCreate>>(res).body, req.userId));
});
router.get('/:id', requirePermission('sales-quotes:read'), async (req, res) => {
  res.json(await svc.getQuote(String(req.params.id)));
});
router.get('/:id/customer-view', requirePermission('sales-quotes:read'), async (req, res) => {
  res.json(await svc.customerView(String(req.params.id)));
});
router.put('/:id', requirePermission('sales-quotes:write'), validate({ body: QuoteUpdate }), async (req: AuthRequest, res) => {
  res.json(await svc.updateQuote(String(req.params.id), valid<z.infer<typeof QuoteUpdate>>(res).body, req.userId));
});
router.post('/:id/send', requirePermission('sales-quotes:write'), async (req: AuthRequest, res) => {
  res.json(await svc.sendQuote(String(req.params.id), req.userId));
});
router.post('/:id/status', requirePermission('sales-quotes:write'), validate({ body: QuoteStatusChange }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof QuoteStatusChange>>(res).body;
  res.json(await svc.setQuoteStatus(String(req.params.id), b.status, b.reason, req.userId));
});
router.post('/:id/approval', requirePermission('sales-quotes:write'), validate({ body: ApprovalDecision }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof ApprovalDecision>>(res).body;
  res.json(await svc.decideApproval(String(req.params.id), b.approve, b.comment, { id: req.userId, role: req.userRole }));
});
router.post('/:id/select-option', requirePermission('sales-quotes:write'), validate({ body: SelectOption }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof SelectOption>>(res).body;
  res.json(await svc.selectOption(String(req.params.id), b.optionGroupId, b.itemId, req.userId));
});
router.post('/:id/new-version', requirePermission('sales-quotes:write'), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.newVersion(String(req.params.id), req.userId));
});
router.post('/:id/duplicate', requirePermission('sales-quotes:write'), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.duplicateQuote(String(req.params.id), req.userId));
});
router.post('/:id/accept', requirePermission('sales-quotes:write'), validate({ body: AcceptInput }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof AcceptInput>>(res).body;
  res.json(await svc.acceptQuote(String(req.params.id), { splitByParty: b.splitByParty, note: b.note }, req.userId));
});
router.delete('/:id', requirePermission('sales-quotes:write'), async (req: AuthRequest, res) => {
  await svc.softDeleteQuote(String(req.params.id), req.userId);
  res.json({ ok: true });
});

export default router;
