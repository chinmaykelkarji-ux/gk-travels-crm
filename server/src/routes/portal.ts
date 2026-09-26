// ============================================================
// The customer's own page — /api/portal/:token. No staff session: the
// private link (and, when asked for, a one-time code) is the whole of the
// access, and it reaches one customer in one organisation only.
//
//   GET  /:token                       who, the agency, their trips
//   POST /:token/code                  send a one-time code
//   POST /:token/code/verify           check it; sets a 12-hour cookie
//   GET  /:token/trips/:tripId         one trip, strictly the customer's view
//   GET  /:token/documents/:id/url     a 60-second link to a shared document
//   POST /:token/trips/:tripId/feedback
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../core/errors.js';
import { runWithContext } from '../core/requestContext.js';
import { validate, valid } from '../core/validate.js';
import { PortalCode, PortalFeedback } from '../../../src/shared/contracts/portal.js';
import * as access from '../modules/portal/access.js';
import { portalDocument, portalHome, portalTrip } from '../modules/portal/readModel.js';
import { giveFeedback } from '../modules/portal/feedback.js';
import { downloadLink } from '../modules/documents/service.js';
import type { PortalAccess } from '@prisma/client';

const router = Router();

/** 120 requests a minute per address — plenty for a person, little for a guesser. */
router.use(rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== 'yes',
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 429, 'Too many requests. Please wait a minute.')),
}));
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });

type PortalReq = Request & { access?: PortalAccess };

/** Resolves the link and runs the rest of the request inside its organisation. */
function portal(needsUnlock: boolean) {
  return async (req: PortalReq, res: Response, next: NextFunction) => {
    try {
      const a = await access.resolveToken(String(req.params.token));
      if (needsUnlock && !access.unlocked(a, (req.cookies as Record<string, string | undefined>)[access.PORTAL_COOKIE])) {
        throw new AppError('UNAUTHENTICATED', 401, 'Enter the code we sent you to open this page');
      }
      req.access = a;
      runWithContext({ organizationId: a.organizationId, source: 'HUMAN' }, () => next());
    } catch (err) { next(err); }
  };
}

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/portal', maxAge: access.SESSION_TTL_S * 1000 };

router.get('/:token', portal(false), async (req: PortalReq, res) => {
  const a = req.access!;
  const open = access.unlocked(a, (req.cookies as Record<string, string | undefined>)[access.PORTAL_COOKIE]);
  if (!open) { res.json({ locked: true, codeChannel: a.codeChannel }); return; }
  await access.recordVisit(a);
  res.json({ locked: false, ...(await portalHome(a.customerId)) });
});

router.post('/:token/code', portal(false), async (req: PortalReq, res) => {
  res.json(await access.sendCode(req.access!));
});

router.post('/:token/code/verify', portal(false), validate({ body: PortalCode }), async (req: PortalReq, res) => {
  const session = await access.verifyCode(req.access!, valid<{ code: string }>(res).body.code);
  res.cookie(access.PORTAL_COOKIE, session, cookieOpts);
  res.json({ ok: true });
});

router.get('/:token/trips/:tripId', portal(true), async (req: PortalReq, res) => {
  res.json(await portalTrip(req.access!.customerId, String(req.params.tripId)));
});

router.get('/:token/documents/:id/url', portal(true), async (req: PortalReq, res) => {
  const id = await portalDocument(req.access!.customerId, String(req.params.id));
  res.json(await downloadLink(id, 'inline'));
});

router.post('/:token/trips/:tripId/feedback', portal(true), validate({ body: PortalFeedback }), async (req: PortalReq, res) => {
  res.json(await giveFeedback(req.access!.customerId, String(req.params.tripId), valid<PortalFeedback>(res).body, req.access!.id));
});

export default router;
