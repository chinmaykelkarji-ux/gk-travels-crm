import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
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

router.put('/', async (req: AuthRequest, res) => {
  try {
    const { id, createdAt, updatedAt, ...data } = req.body as Record<string, unknown>;
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
