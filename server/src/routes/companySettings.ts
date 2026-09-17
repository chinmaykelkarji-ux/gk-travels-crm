import { Router } from 'express';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { prisma } from '../lib/prisma.js';
import { getOrCreateCompanySettings, updateCompanySettings } from '../services/invoiceService.js';

const router = Router();
router.use(requireAuth);

// ── Get (singleton, auto-created on first read) ─────────────────

router.get('/', async (_req, res) => {
  try {
    res.json(await getOrCreateCompanySettings());
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Update ────────────────────────────────────────────────────
//
// ADMIN only. This single row holds the agency's GSTIN, PAN, bank account and
// the GST period freeze date, and it is printed on every invoice — changing
// the bank details silently redirects customer payments.
//
// Only these columns may be written. Anything else in the body is ignored
// rather than passed through to Prisma.
const EDITABLE_FIELDS = [
  'companyName', 'legalName', 'gstin', 'pan',
  'addressLine1', 'addressLine2', 'city', 'state', 'stateCode', 'pincode',
  'phone', 'email', 'website', 'logoUrl',
  'bankName', 'bankAccountName', 'bankAccountNumber', 'bankIfsc', 'bankBranch',
  'invoicePrefix', 'invoiceTerms', 'authorizedSignatory', 'signatureUrl',
  'gstFrozenUntil',
] as const;

router.put('/', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    const before = await getOrCreateCompanySettings();
    const updated = await updateCompanySettings(
      data as Parameters<typeof updateCompanySettings>[0],
    );

    await logActivity(prisma, {
      action:      'company_settings_updated',
      description: `Company Master details updated`,
      entityType:  'company_settings',
      entityId:    'default',
      userId:      req.userId,
      before,
      after:       updated,
    });

    res.json(updated);
  } catch (err) {
    console.error('[companySettings PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
