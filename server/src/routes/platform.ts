// ============================================================
// The platform operator — /api/platform. Not a staff route: it answers only
// to X-Platform-Secret matching PLATFORM_ADMIN_SECRET (24+ characters), and
// is switched off entirely when that is not set.
//
//   POST /api/platform/organizations   a new organisation and its first owner
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError, notConfigured } from '../core/errors.js';
import { validate, valid } from '../core/validate.js';
import { OrganizationCreate } from '../../../src/shared/contracts/organization.js';
import { createOrganization } from '../modules/organization/service.js';

const router = Router();

function platformOnly(req: Request, _res: Response, next: NextFunction) {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret || secret.length < 24) return next(notConfigured('Organisation onboarding (PLATFORM_ADMIN_SECRET)'));
  const given = Buffer.from(req.get('x-platform-secret') ?? '');
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return next(new AppError('UNAUTHENTICATED', 401, 'Not allowed'));
  next();
}

router.post('/organizations', platformOnly, validate({ body: OrganizationCreate }), async (_req, res) => {
  res.status(201).json(await createOrganization(valid<OrganizationCreate>(res).body));
});

export default router;
