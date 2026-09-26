// ============================================================
// Webhooks from outside — /api/webhooks.
//
//   GET  /whatsapp   Meta's one-time verification (WHATSAPP_VERIFY_TOKEN)
//   POST /whatsapp   delivery updates, accepted only with a valid
//                    X-Hub-Signature-256 from the app secret
//
// No session: the signature is the authentication. Anything unsigned is
// refused before its body is read.
// ============================================================

import { Router, type Request } from 'express';
import { validWebhookSignature } from '../comms/index.js';
import { applyWhatsAppStatuses } from '../modules/comms/service.js';

const router = Router();

router.get('/whatsapp', (req, res) => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) {
    res.status(200).send(String(req.query['hub.challenge'] ?? ''));
    return;
  }
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Verification failed' } });
});

router.post('/whatsapp', async (req: Request & { rawBody?: Buffer }, res) => {
  if (!process.env.WHATSAPP_APP_SECRET) {
    res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'WhatsApp webhooks are not configured on this server' } });
    return;
  }
  if (!validWebhookSignature(req.rawBody, req.header('x-hub-signature-256'))) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Bad signature' } });
    return;
  }
  const body = req.body as { entry?: { changes?: { value?: { statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[] } }[] }[] };
  const statuses = (body.entry ?? []).flatMap(e => (e.changes ?? []).flatMap(c => c.value?.statuses ?? []));
  const updated = await applyWhatsAppStatuses(statuses);
  res.status(200).json({ received: statuses.length, updated });
});

export default router;
