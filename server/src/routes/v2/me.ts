// GET /api/v2/me — the session, its organisation and the effective permission
// list. The SPA reads permissions from here instead of a hard-coded mirror, so
// the server map is the only source of truth.
import { Router } from 'express';
import type { Role as UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { ROLE_PERMISSIONS } from '../../lib/permissions.js';
import { currentOrganizationId } from '../../core/requestContext.js';
import { unauthorized } from '../../core/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId as string },
    select: { id: true, email: true, name: true, role: true, isActive: true, organizationId: true, lastLoginAt: true },
  });
  if (!user || !user.isActive) throw unauthorized('Account not found or deactivated');

  const organization = await prisma.organization.findUnique({
    where:  { id: currentOrganizationId() },
    select: { id: true, slug: true, name: true, currency: true, timezone: true },
  });

  const role = user.role as UserRole;
  const permissions = role === 'ADMIN' ? ['*'] : ROLE_PERMISSIONS[role] ?? [];

  res.json({
    user,
    organization,
    role,
    permissions,
    requestId: res.getHeader('x-request-id'),
  });
});

export default router;
