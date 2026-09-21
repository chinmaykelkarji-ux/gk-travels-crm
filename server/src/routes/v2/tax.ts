// Tax rules — /api/v2/tax-rules. Anyone who prices work may read the rates;
// only an admin changes them (settings:write), because they decide what the
// business charges and what it owes.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { TaxRuleQuery, TaxRuleUpsert } from '../../../../src/shared/contracts/tax.js';
import * as svc from '../../modules/tax/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('trips:read'), validate({ query: TaxRuleQuery }), async (_req, res) => {
  res.json(await svc.listRules(valid<unknown, TaxRuleQuery>(res).query.on));
});
router.put('/:code', requirePermission('settings:write'), validate({ body: TaxRuleUpsert }), async (req: AuthRequest, res) => {
  res.json(await svc.upsertRule(String(req.params.code), valid<TaxRuleUpsert>(res).body, req.userId));
});

export default router;
