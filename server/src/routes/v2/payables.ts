// Supplier bills and payments — /api/v2/payables. Accounts work: reading
// needs finance:read, recording needs finance:write. Nothing is deleted;
// /cancel reverses the ledger posting and marks the row.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { CancelInput, PayablesQuery, VendorBillInput, VendorPaymentInput } from '../../../../src/shared/contracts/payables.js';
import * as svc from '../../modules/payables/service.js';
import { importLegacyPayables } from '../../modules/payables/legacyImport.js';

const router = Router();
router.use(requireAuth);
const READ = requirePermission('finance:read');
const WRITE = requirePermission('finance:write');
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);
const query = (res: Parameters<typeof valid>[0]) => valid<unknown, PayablesQuery>(res).query;

router.get('/aging', READ, async (_req, res) => { res.json(await svc.payablesAging()); });
router.get('/bills', READ, validate({ query: PayablesQuery }), async (_req, res) => { res.json(await svc.listBills(query(res))); });
router.get('/bills/:id', READ, async (req: AuthRequest, res) => { res.json(await svc.getBill(p(req))); });
router.post('/bills', WRITE, validate({ body: VendorBillInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createBill(valid<VendorBillInput>(res).body, req.userId)); });
router.post('/bills/:id/cancel', WRITE, validate({ body: CancelInput }), async (req: AuthRequest, res) => { res.json(await svc.cancelBill(p(req), valid<CancelInput>(res).body.reason, req.userId)); });

router.get('/payments', READ, validate({ query: PayablesQuery }), async (_req, res) => { res.json(await svc.listPayments(query(res))); });
router.post('/payments', WRITE, validate({ body: VendorPaymentInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.payVendor(valid<VendorPaymentInput>(res).body, req.userId)); });
router.post('/payments/:id/cancel', WRITE, validate({ body: CancelInput }), async (req: AuthRequest, res) => { res.json(await svc.cancelPayment(p(req), valid<CancelInput>(res).body.reason, req.userId)); });
router.post('/payments/:id/apply', WRITE, async (req: AuthRequest, res) => { res.json(await svc.applyAdvance(p(req), String((req.body as { billId?: string }).billId ?? ''), req.userId)); });

router.get('/vendors/:id/statement', READ, async (req: AuthRequest, res) => { res.json(await svc.vendorStatement(p(req))); });
router.post('/import-classic', WRITE, async (_req, res) => { res.json(await importLegacyPayables()); });

export default router;
