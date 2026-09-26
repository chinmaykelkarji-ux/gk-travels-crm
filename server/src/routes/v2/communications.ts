// ============================================================
// Communications — /api/v2/communications.
//
//   GET  /status            which channels can really send
//   GET  /?tripId|customerId   one log per record (classic rows included)
//   POST /preview           the template filled from the real records
//   POST /send              queue it for TravelOS to send (job runner)
//   POST /opened            a person opened it in their own WhatsApp / mail
//
// Reading the log needs customers:read (every staff role); sending needs
// messaging:write.
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { channelStatus } from '../../comms/index.js';
import { CommLogQuery, CommOpened, CommSend } from '../../../../src/shared/contracts/comms.js';
import * as svc from '../../modules/comms/service.js';

const router = Router();
router.use(requireAuth);

router.get('/status', requirePermission('insights:read'), (_req, res) => { res.json(channelStatus()); });

router.get('/', requirePermission('customers:read'), validate({ query: CommLogQuery }), async (_req, res) => {
  res.json({ items: await svc.messageLog(valid<unknown, CommLogQuery>(res).query) });
});

router.post('/preview', requirePermission('messaging:write'), validate({ body: CommSend }), async (_req, res) => {
  res.json(await svc.previewMessage(valid<CommSend>(res).body));
});

router.post('/send', requirePermission('messaging:write'), validate({ body: CommSend }), async (req: AuthRequest, res) => {
  res.status(202).json(await svc.sendMessage(valid<CommSend>(res).body, req.userId ?? null));
});

router.post('/opened', requirePermission('messaging:write'), validate({ body: CommOpened }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.logOpened(valid<CommOpened>(res).body, req.userId ?? null));
});

export default router;
