// Customers v2 — routes only parse, authorise and delegate to the service.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import {
  CustomerCreate, CustomerUpdate, CustomerListQuery, RelationshipCreate, MergeInput,
} from '../../../../src/shared/contracts/customers.js';
import * as svc from '../../modules/customers/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('customers:read'), validate({ query: CustomerListQuery }), async (_req, res) => {
  res.json(await svc.listCustomers(valid<unknown, z.infer<typeof CustomerListQuery>>(res).query));
});

router.get('/duplicates', requirePermission('customers:write'), async (_req, res) => {
  res.json(await svc.duplicateGroups());
});

router.get('/check-duplicates', requirePermission('customers:read'), async (req, res) => {
  const phone = typeof req.query.phone === 'string' ? req.query.phone : null;
  const email = typeof req.query.email === 'string' ? req.query.email : null;
  const excludeId = typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined;
  res.json(await svc.findDuplicateCandidates({ phone, email, excludeId }));
});

router.post('/', requirePermission('customers:write'), validate({ body: CustomerCreate }), async (req: AuthRequest, res) => {
  const customer = await svc.createCustomer(valid<z.infer<typeof CustomerCreate>>(res).body, req.userId);
  res.status(201).json(customer);
});

router.get('/:id', requirePermission('customers:read'), async (req, res) => {
  res.json(await svc.getCustomer360(String(req.params.id)));
});

router.put('/:id', requirePermission('customers:write'), validate({ body: CustomerUpdate }), async (req: AuthRequest, res) => {
  res.json(await svc.updateCustomer(String(req.params.id), valid<z.infer<typeof CustomerUpdate>>(res).body, req.userId));
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  await svc.softDeleteCustomer(String(req.params.id), req.userId);
  res.json({ ok: true });
});

router.post('/:id/merge', requireRole('ADMIN'), validate({ body: MergeInput }), async (req: AuthRequest, res) => {
  res.json(await svc.mergeCustomers(String(req.params.id), valid<z.infer<typeof MergeInput>>(res).body.sourceId, req.userId));
});

router.post('/:id/relationships', requirePermission('customers:write'), validate({ body: RelationshipCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.addRelationship(String(req.params.id), valid<z.infer<typeof RelationshipCreate>>(res).body, req.userId));
});

router.delete('/:id/relationships/:relId', requirePermission('customers:write'), async (req, res) => {
  await svc.removeRelationship(String(req.params.id), String(req.params.relId));
  res.json({ ok: true });
});

export default router;
