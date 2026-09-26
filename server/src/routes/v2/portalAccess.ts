// ============================================================
// The office's side of the customer portal.
//
//   GET  /api/v2/portal-links?customerId=     the customer's links
//   POST /api/v2/portal-links                 make one (the link is shown once)
//   POST /api/v2/portal-links/:id/revoke
//   GET  /api/v2/feedback?tripId|customerId   what customers said
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { AppError } from '../../core/errors.js';
import { PortalLinkCreate } from '../../../../src/shared/contracts/portal.js';
import * as access from '../../modules/portal/access.js';
import { feedbackFor } from '../../modules/portal/feedback.js';

export const portalLinksRouter = Router();
portalLinksRouter.use(requireAuth);
portalLinksRouter.get('/', requirePermission('customers:read'), async (req, res) => {
  const customerId = String(req.query.customerId ?? '');
  if (!customerId) throw new AppError('VALIDATION_ERROR', 400, 'Give a customer');
  res.json({ items: await access.listAccess(customerId), baseUrl: access.portalBaseUrl() });
});
portalLinksRouter.post('/', requirePermission('customers:write'), validate({ body: PortalLinkCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await access.issueAccess(valid<PortalLinkCreate>(res).body, req.userId));
});
portalLinksRouter.post('/:id/revoke', requirePermission('customers:write'), async (req: AuthRequest, res) => {
  res.json(await access.revokeAccess(String(req.params.id), req.userId));
});

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);
feedbackRouter.get('/', requirePermission('customers:read'), async (req, res) => {
  const tripId = req.query.tripId ? String(req.query.tripId) : undefined;
  const customerId = req.query.customerId ? String(req.query.customerId) : undefined;
  if (!tripId && !customerId) throw new AppError('VALIDATION_ERROR', 400, 'Give a trip or a customer');
  res.json({ items: await feedbackFor({ tripId, customerId }) });
});
