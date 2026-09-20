// The books — /api/v2/ledger. Reading needs finance:read, posting
// finance:write (ACCOUNTS and ADMIN). Posted entries are never edited or
// deleted; corrections go through /:id/reverse.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { LedgerEntriesQuery, LedgerPeriodQuery, ManualEntry, ReverseEntry } from '../../../../src/shared/contracts/ledger.js';
import * as svc from '../../modules/ledger/service.js';

const router = Router();
router.use(requireAuth);
const READ = requirePermission('finance:read');
const WRITE = requirePermission('finance:write');
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

router.get('/accounts', READ, async (_req, res) => { res.json(await svc.listAccounts()); });
router.get('/trial-balance', READ, validate({ query: LedgerPeriodQuery }), async (_req, res) => { res.json(await svc.trialBalanceFor(valid<unknown, LedgerPeriodQuery>(res).query)); });
router.get('/accounts/:code/statement', READ, validate({ query: LedgerPeriodQuery }), async (req: AuthRequest, res) => { res.json(await svc.accountStatement(p(req, 'code'), valid<unknown, LedgerPeriodQuery>(res).query)); });
router.get('/entries', READ, validate({ query: LedgerEntriesQuery }), async (_req, res) => { res.json(await svc.listEntries(valid<unknown, LedgerEntriesQuery>(res).query)); });
router.get('/entries/:id', READ, async (req: AuthRequest, res) => { res.json(await svc.getEntry(p(req))); });
router.post('/entries', WRITE, validate({ body: ManualEntry }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createManualEntry(valid<ManualEntry>(res).body, req.userId)); });
router.post('/entries/:id/reverse', WRITE, validate({ body: ReverseEntry }), async (req: AuthRequest, res) => { res.json(await svc.reverseEntry(p(req), valid<ReverseEntry>(res).body.reason, req.userId)); });

export default router;
