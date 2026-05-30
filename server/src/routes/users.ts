import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const SAFE_SELECT = {
  id:        true,
  email:     true,
  name:      true,
  role:      true,
  isActive:  true,
  createdAt: true,
  updatedAt: true,
} as const;

// GET /api/users
router.get('/', async (_req, res) => {
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

// POST /api/users — create new user
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { email, password, name, role } = req.body as {
      email: string; password: string; name: string; role?: string;
    };

    if (!email || !password || !name) {
      res.status(400).json({ error: 'email, password and name are required' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user   = await prisma.user.create({
      data:   { email: email.toLowerCase(), password: hashed, name, role: role ?? 'STAFF' },
      select: SAFE_SELECT,
    });
    res.status(201).json(user);
  } catch (err) {
    console.error('[users POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/users/:id — update name, email, role, isActive
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { name, email, role, isActive } = req.body as {
      name?: string; email?: string; role?: string; isActive?: boolean;
    };

    // Prevent self-deactivation
    if (req.userId === req.params.id && isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name     !== undefined) data.name     = name;
    if (email    !== undefined) data.email    = email.toLowerCase();
    if (role     !== undefined) data.role     = role;
    if (isActive !== undefined) data.isActive = isActive;

    const user = await prisma.user.update({
      where:  { id: req.params.id },
      data,
      select: SAFE_SELECT,
    });
    res.json(user);
  } catch (err) {
    console.error('[users PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/users/:id/password — change password (admin sets it directly)
router.put('/:id/password', async (req: AuthRequest, res) => {
  try {
    const { newPassword } = req.body as { newPassword: string };
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data:  { password: hashed },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    if (req.userId === req.params.id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[users DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
