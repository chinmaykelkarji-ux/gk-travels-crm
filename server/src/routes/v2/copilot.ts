// ============================================================
// The copilot — /api/v2/copilot.
//
//   POST /api/v2/copilot/ask            a question (new or in a conversation)
//   GET  /api/v2/copilot/sessions       the asker's own conversations
//   GET  /api/v2/copilot/sessions/:id   one of them, as a person reads it
//
// `copilot:use` (every staff role, never a driver) lets a person talk to it at all. What it can look up is decided per
// tool by the person's own permissions, in modules/copilot.
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { CopilotAsk } from '../../../../src/shared/contracts/copilot.js';
import * as svc from '../../modules/copilot/service.js';

const router = Router();
router.use(requireAuth);

const asker = (req: AuthRequest) => ({ userId: String(req.userId), role: String(req.userRole), name: req.userName ?? null });

router.post('/ask', requirePermission('copilot:use'), validate({ body: CopilotAsk }), async (req: AuthRequest, res) => {
  res.json(await svc.ask(valid<CopilotAsk>(res).body, asker(req)));
});

router.get('/sessions', requirePermission('copilot:use'), async (req: AuthRequest, res) => {
  res.json({ items: await svc.listSessions(String(req.userId)) });
});

router.get('/sessions/:id', requirePermission('copilot:use'), async (req: AuthRequest, res) => {
  res.json(await svc.getSession(String(req.params.id), String(req.userId)));
});

export default router;
