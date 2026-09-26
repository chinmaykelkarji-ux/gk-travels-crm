// Roles — /api/v2/roles. Only the owner (users:write) sees and changes who may do what.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { RoleAssign, RoleInput } from '../../../../src/shared/contracts/roles.js';
import * as svc from '../../modules/roles/service.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission('users:write'));

router.get('/', async (_req, res) => { res.json(await svc.listRoles()); });
router.post('/', validate({ body: RoleInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createRole(valid<RoleInput>(res).body, req.userId)); });
router.post('/assign', validate({ body: RoleAssign }), async (req: AuthRequest, res) => { res.json(await svc.assignRole(valid<RoleAssign>(res).body, req.userId)); });
router.put('/:id', validate({ body: RoleInput }), async (req: AuthRequest, res) => { res.json(await svc.updateRole(String(req.params.id), valid<RoleInput>(res).body, req.userId)); });
router.delete('/:id', async (req: AuthRequest, res) => { await svc.deleteRole(String(req.params.id), req.userId); res.status(204).end(); });

export default router;
