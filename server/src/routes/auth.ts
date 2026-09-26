// ============================================================
// GK TRAVELS CRM / TravelOS — Auth Routes
//
// POST /api/auth/login   — validate credentials, open a session, issue JWT cookie
// POST /api/auth/logout  — revoke the session, clear JWT cookie
// GET  /api/auth/me      — return current user from DB (requires cookie)
// ============================================================

import { Router }                                            from 'express';
import bcrypt                                                from 'bcryptjs';
import { prisma, prismaUnscoped }                            from '../lib/prisma.js';
import {
  signToken, verifyToken, requireAuth,
  COOKIE_NAME, COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS,
  type AuthRequest,
}                                                            from '../middleware/auth.js';
import { loginLimiter }                                      from '../core/security.js';
import { createSession, revokeSession }                      from '../core/sessions.js';
import { runWithContext, DEFAULT_ORGANIZATION_ID }           from '../core/requestContext.js';

const router = Router();

// ── POST /api/auth/login ──────────────────────────────────────

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const normalised = email.trim().toLowerCase();
    // Unscoped on purpose: the organisation is not known until the user is.
    const user       = await prismaUnscoped.user.findUnique({ where: { email: normalised } });

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

    const sid = await createSession({
      userId:         user.id,
      organizationId: user.organizationId,
      ip:             req.ip,
      userAgent:      req.get('user-agent'),
    });

    const token = signToken({
      id:    user.id,
      email: user.email,
      name:  user.name,
      // A custom role is carried as its key; permissions are looked up from it (core/principals.ts).
      role:  user.customRoleId ? `custom:${user.customRoleId}` : user.role,
      orgId: user.organizationId,
      sid,
    });

    await runWithContext({ organizationId: user.organizationId, userId: user.id, source: 'HUMAN' }, () =>
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }));

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    console.log(`[auth/login] Signed in: ${user.email} (${user.role})`);
    res.json({
      user: {
        id:             user.id,
        email:          user.email,
        name:           user.name,
        role:           user.role,
        isActive:       user.isActive,
        organizationId: user.organizationId,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
// Revokes the server-side session named by the cookie (if any) and clears it.

router.post('/logout', async (req, res) => {
  const token = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME];
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload.sid) await revokeSession(payload.sid, payload.orgId ?? DEFAULT_ORGANIZATION_ID, 'logout');
      console.log(`[auth/logout] Signed out: ${payload.email}`);
    } catch {
      // Expired or tampered cookie — nothing to revoke.
    }
  }
  res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────
// Validates the JWT cookie + session and returns the current user from DB.
// Returns 401 (not 500) when there is no valid session.

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId! },
      select: { id: true, email: true, name: true, role: true, isActive: true, organizationId: true },
    });

    if (!user || !user.isActive) {
      // Token was valid but the account was deactivated since issue
      res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
      res.status(401).json({ error: 'Account not found or deactivated.' });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Could not load session.' });
  }
});

export default router;
