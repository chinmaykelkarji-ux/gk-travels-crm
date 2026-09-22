// ============================================================
// Reading documents — /api/v2/extractions and the two document routes.
//
//   POST  /api/v2/documents/:id/read        queue it to be read
//   GET   /api/v2/documents/:id/extractions what has been read from it
//   GET   /api/v2/extractions/pending       everything waiting for a person
//   GET   /api/v2/extractions/:id           one proposal, with the matches
//   POST  /api/v2/extractions/:id/approve   create the record (a person's act)
//   POST  /api/v2/extractions/:id/reject    set it aside, with a reason
//
// Reading needs `documents:write`; approving creates a real record, so it
// also needs the permission that record's own route needs — a ticket or a
// stay needs `operations:write`, a supplier bill needs `finance:write`.
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission, hasPermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { AppError } from '../../core/errors.js';
import { ExtractionApproval, ExtractionReject } from '../../../../src/shared/contracts/extraction.js';
import * as svc from '../../modules/extraction/service.js';

const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

/** Mounted under /api/v2/documents for the two document-shaped routes. */
export const documentReadRouter = Router({ mergeParams: true });
documentReadRouter.use(requireAuth);

documentReadRouter.post('/:id/read', requirePermission('documents:write'), async (req: AuthRequest, res) => {
  res.status(202).json(await svc.startExtraction(p(req), req.userId));
});

documentReadRouter.get('/:id/extractions', requirePermission('documents:read'), async (req: AuthRequest, res) => {
  res.json({ items: await svc.extractionsFor(p(req)) });
});

/** Mounted at /api/v2/extractions. */
const router = Router();
router.use(requireAuth);

router.get('/pending', requirePermission('documents:read'), async (_req, res) => {
  res.json(await svc.pendingReviews());
});

router.get('/:id', requirePermission('documents:read'), async (req: AuthRequest, res) => {
  res.json(await svc.getExtraction(p(req)));
});

/** What a proposal would create decides who may approve it. */
const NEEDED: Record<string, string> = { TICKET: 'operations:write', HOTEL_BOOKING: 'operations:write', VENDOR_BILL: 'finance:write' };

router.post('/:id/approve', requirePermission('documents:write'), validate({ body: ExtractionApproval }), async (req: AuthRequest, res) => {
  const row = await svc.getExtraction(p(req));
  const kind = (row.proposal as { kind?: string } | null)?.kind ?? '';
  const needed = NEEDED[kind];
  if (needed && !hasPermission(req.userRole as never, needed)) {
    throw new AppError('FORBIDDEN', 403, `Saving this needs the ${needed} permission`);
  }
  res.json(await svc.approveExtraction(p(req), valid<ExtractionApproval>(res).body, req.userRole, req.userId));
});

router.post('/:id/reject', requirePermission('documents:write'), validate({ body: ExtractionReject }), async (req: AuthRequest, res) => {
  res.json(await svc.rejectExtraction(p(req), valid<ExtractionReject>(res).body.reason, req.userId));
});

export default router;
