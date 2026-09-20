// Customer receipts and refunds — /api/v2/receipts. Recording money needs
// payments:write (ACCOUNTS, ADMIN); reading needs payments:read. A receipt is
// never deleted: /:id/cancel marks it and reverses its ledger posting.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { ReceiptCancel, ReceiptInput, ReceiptListQuery } from '../../../../src/shared/contracts/receipts.js';
import * as svc from '../../modules/receipts/service.js';
import { importLegacyPayments } from '../../modules/receipts/legacyImport.js';

const router = Router();
router.use(requireAuth);
const READ = requirePermission('payments:read');
const WRITE = requirePermission('payments:write');
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

router.get('/', READ, validate({ query: ReceiptListQuery }), async (_req, res) => { res.json(await svc.listReceipts(valid<unknown, ReceiptListQuery>(res).query)); });
router.get('/day-book', READ, async (req, res) => { res.json(await svc.dayBook(typeof req.query.day === 'string' ? req.query.day : undefined)); });
router.get('/:id', READ, async (req: AuthRequest, res) => { res.json(await svc.getReceipt(p(req))); });
router.post('/import-classic', WRITE, async (_req, res) => { res.json(await importLegacyPayments()); });
router.post('/', WRITE, validate({ body: ReceiptInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createReceipt(valid<ReceiptInput>(res).body, req.userId)); });
router.post('/:id/cancel', WRITE, validate({ body: ReceiptCancel }), async (req: AuthRequest, res) => { res.json(await svc.cancelReceipt(p(req), valid<ReceiptCancel>(res).body.reason, req.userId)); });

export default router;
