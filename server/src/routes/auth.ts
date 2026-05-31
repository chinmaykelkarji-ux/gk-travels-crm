// ============================================================
// GK TRAVELS CRM — Authentication Routes
//
// POST /api/auth/login   — validate credentials, set HttpOnly cookie
// POST /api/auth/logout  — clear cookie
// GET  /api/auth/me      — verify cookie, return current user
// PUT  /api/auth/password — change own password (authenticated)
// ============================================================

import { Router }     from 'express';
import bcrypt         from 'bcryptjs';
import { prisma }     from '../lib/prisma.js';
import {
  signToken, requireAuth, COOKIE_NAME, COOKIE_OPTIONS,
  type AuthRequest,
} from '../middleware/auth.js';

const router = Router();

// ─── POST /api/auth/login ─────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Deliberately vague message — don't reveal whether email exists
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        error: 'Account is deactivated. Contact your administrator.',
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Issue JWT stored in an HttpOnly cookie — not accessible from JS
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      user: {
        id:      user.id,
        email:   user.email,
        name:    user.name,
        role:    user.role,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed — please try again' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// ─── GET /api/auth/me ─────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.status(403).json({ error: 'Account deactivated' });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/auth/password ───────────────────────────────────

router.put('/password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?:     string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId }, data: { passwordHash } });

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
