// ============================================================
// GK TRAVELS CRM — Auth Routes
//
// POST /api/auth/login   — validate credentials, issue JWT cookie
// POST /api/auth/logout  — clear JWT cookie
// GET  /api/auth/me      — return current user from DB (requires cookie)
// ============================================================

import { Router }                                            from 'express';
import bcrypt                                                from 'bcryptjs';
import { prisma }                                            from '../lib/prisma.js';
import {
  signToken, requireAuth,
  COOKIE_NAME, COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS,
  type AuthRequest,
}                                                            from '../middleware/auth.js';

const router = Router();

// ── POST /api/auth/login ──────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const normalised = email.trim().toLowerCase();
    const user       = await prisma.user.findUnique({ where: { email: normalised } });

    // Use a generic message for both "not found" and "wrong password"
    // to prevent user-enumeration attacks.
    if (!user || !user.isActive) {
      console.warn(`[auth/login] Failed attempt for: ${normalised}`);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      console.warn(`[auth/login] Bad password for: ${normalised}`);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken({
      id:    user.id,
      email: user.email,
      name:  user.name,
      role:  user.role,
    });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    console.log(`[auth/login] Signed in: ${user.email} (${user.role})`);
    res.json({
      user: {
        id:       user.id,
        email:    user.email,
        name:     user.name,
        role:     user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────

router.post('/logout', (req, res) => {
  const email = (req as AuthRequest).userEmail ?? 'unknown';
  res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
  console.log(`[auth/logout] Signed out: ${email}`);
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────
// Validates the JWT cookie and returns the current user from DB.
// Returns 401 (not 500) when there is no valid session.

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId! },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      // Token was valid but the account was deactivated since issue
      res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
      res.status(401).json({ error: 'Account not found or deactivated.' });
      return;
    }

    res.json({
      user: {
        id:       user.id,
        email:    user.email,
        name:     user.name,
        role:     user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Could not load session.' });
  }
});

export default router;
