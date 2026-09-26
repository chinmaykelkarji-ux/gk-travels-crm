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
import { isPrincipalKey, permissionsOf } from '../../core/principals.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId as string },
    select: { id: true, email: true, name: true, role: true, isActive: true, organizationId: true, lastLoginAt: true, customRole: { select: { id: true, name: true } } },
  });
  if (!user || !user.isActive) throw unauthorized('Account not found or deactivated');

  const organization = await prisma.organization.findUnique({
    where:  { id: currentOrganizationId() },
    select: { id: true, slug: true, name: true, currency: true, timezone: true },
  });

  const role = user.role as UserRole;
  // A custom role's own list (loaded by requireAuth), otherwise the system role's.
  const principal = isPrincipalKey(req.userRole) ? permissionsOf(req.userRole) : null;
  const permissions = principal ? [...principal].sort() : role === 'ADMIN' ? ['*'] : ROLE_PERMISSIONS[role] ?? [];

  res.json({
    user,
    organization,
    role,
    permissions,
    requestId: res.getHeader('x-request-id'),
  });
});

// GET /api/v2/me/team — active colleagues for assignment pickers. Any signed-in
// user may see names and roles; nothing else about an account is exposed.
router.get('/team', async (_req, res) => {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
  res.json(users);
});

export default router;
