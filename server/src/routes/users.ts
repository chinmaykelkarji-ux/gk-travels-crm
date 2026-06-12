import { Router }  from 'express';
import bcrypt      from 'bcryptjs';
import { prisma }  from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

const SAFE_SELECT = {
  id:          true,
  email:       true,
  name:        true,
  role:        true,
  isActive:    true,
  lastLoginAt: true,
  createdAt:   true,
  updatedAt:   true,
} as const;

const VALID_ROLES = ['ADMIN', 'BOOKING', 'OPERATIONS', 'ACCOUNTS'] as const;

// GET /api/users/me — current user's own profile
router.get('/me', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId as string },
      select: SAFE_SELECT,
    });
    if (!user) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/users
router.get('/', requirePermission('users:read'), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select:  SAFE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/users/:id
router.get('/:id', requirePermission('users:read'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.params.id as string },
      select: SAFE_SELECT,
    });
    if (!user) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/users — create new user (ADMIN only)
router.post('/', requirePermission('users:write'), async (req: AuthRequest, res) => {
  try {
    const { email, password, name, role } = req.body as {
      email?: string; password?: string; name?: string; role?: string;
    };

    if (!email?.trim() || !password || !name?.trim()) {
      res.status(400).json({ error: 'email, password and name are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const assignedRole = VALID_ROLES.includes(role as never) ? role : 'OPERATIONS';

    const existing = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email:        email.trim().toLowerCase(),
        passwordHash,
        name:         name.trim(),
        role:         assignedRole as 'ADMIN' | 'BOOKING' | 'OPERATIONS' | 'ACCOUNTS',
      },
      select: SAFE_SELECT,
    });
    res.status(201).json(user);
  } catch (err) {
    console.error('[users POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/users/:id — update name, email, role, isActive (ADMIN only)
router.put('/:id', requirePermission('users:write'), async (req: AuthRequest, res) => {
  try {
    const { name, email, role, isActive } = req.body as {
      name?: string; email?: string; role?: string; isActive?: boolean;
    };

    if (req.userId === req.params.id && isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    if (req.userId === req.params.id && role !== undefined) {
      const self = await prisma.user.findUnique({ where: { id: req.params.id as string }, select: { role: true } });
      if (self && role !== self.role) {
        res.status(400).json({ error: 'You cannot change your own role' });
        return;
      }
    }

    const data: Record<string, unknown> = {};
    if (name     !== undefined) data.name     = name.trim();
    if (email    !== undefined) data.email    = email.trim().toLowerCase();
    if (role     !== undefined && VALID_ROLES.includes(role as never)) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;

    const user = await prisma.user.update({
      where:  { id: req.params.id as string },
      data,
      select: SAFE_SELECT,
    });
    res.json(user);
  } catch (err) {
    console.error('[users PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/users/:id/password — admin resets another user's password
router.put('/:id/password', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { newPassword } = req.body as { newPassword?: string };

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.params.id as string },
      data:  { passwordHash },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/users/:id — soft delete (deactivate), ADMIN only
router.delete('/:id', requirePermission('users:write'), async (req: AuthRequest, res) => {
  try {
    if (req.userId === req.params.id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }
    await prisma.user.update({ where: { id: req.params.id as string }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[users DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
