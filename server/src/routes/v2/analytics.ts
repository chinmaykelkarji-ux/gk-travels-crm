// ============================================================
// Reports — /api/v2/analytics. Every section is plain queries over the
// records (modules/analytics), shown only to a role that could open the
// screens behind it:
//
//   /sales       enquiries:read      /operations  operations:read
//   /money       finance:read        /customers   customers:read
//   /suppliers   finance:read (bills and what is owed to suppliers)
// ============================================================

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import * as svc from '../../modules/analytics/service.js';

const Period = z.object({ from: z.string().date().optional(), to: z.string().date().optional() })
  .refine(p => !p.from || !p.to || p.from <= p.to, { message: 'From must not be after to' });
type Period = z.infer<typeof Period>;
const period = (q: Period) => { const d = svc.defaultPeriod(q.to); return { from: q.from ?? d.from, to: q.to ?? d.to }; };

const router = Router();
router.use(requireAuth);

router.get('/sales', requirePermission('enquiries:read'), validate({ query: Period }), async (_req, res) => { res.json(await svc.sales(period(valid<unknown, Period>(res).query))); });
router.get('/operations', requirePermission('operations:read'), async (_req, res) => { res.json(await svc.operations()); });
router.get('/money', requirePermission('finance:read'), validate({ query: Period }), async (_req, res) => { res.json(await svc.money(period(valid<unknown, Period>(res).query))); });
router.get('/customers', requirePermission('customers:read'), validate({ query: Period }), async (_req, res) => { res.json(await svc.customers(period(valid<unknown, Period>(res).query))); });
router.get('/suppliers', requirePermission('finance:read'), validate({ query: Period }), async (_req, res) => { res.json(await svc.suppliers(period(valid<unknown, Period>(res).query))); });

export default router;
