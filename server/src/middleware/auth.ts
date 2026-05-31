import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ─── Constants ────────────────────────────────────────────────

const JWT_SECRET  = process.env.JWT_SECRET ?? 'gkcrm_dev_secret_change_in_production';
export const COOKIE_NAME = 'gkcrm_session';

// 30-day cookie — HttpOnly so JS cannot read it, Secure in production
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax'  as const,
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path:     '/',
} as const;

// ─── Token helpers ────────────────────────────────────────────

export interface TokenPayload {
  id:    string;
  email: string;
  role:  string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// ─── Augmented request ────────────────────────────────────────

export interface AuthRequest extends Request {
  userId?:    string;
  userEmail?: string;
  userRole?:  string;
}

// ─── Middleware ───────────────────────────────────────────────

/**
 * requireAuth — reads JWT from the HttpOnly cookie `gkcrm_session`.
 * Attaches userId / userEmail / userRole to req for downstream handlers.
 * Returns 401 if cookie is absent or JWT is expired/invalid.
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies: Record<string, string> }).cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: 'Not authenticated — please log in' });
    return;
  }

  try {
    const payload  = verifyToken(token);
    req.userId     = payload.id;
    req.userEmail  = payload.email;
    req.userRole   = payload.role;
    next();
  } catch {
    // Clear the invalid or expired cookie so the browser doesn't keep sending it
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

/**
 * requireRole(...roles) — role-based guard, must come after requireAuth.
 * Usage: router.delete('/:id', requireAuth, requireRole('ADMIN'), handler)
 */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({
        error: `Access denied — requires one of: ${roles.join(', ')}`,
      });
      return;
    }
    next();
  };
}
