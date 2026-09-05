import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ─── Constants ────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'gkcrm_dev_secret_change_in_production';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'gkcrm_dev_secret_change_in_production') {
  console.error('[auth] FATAL: JWT_SECRET is using the default dev value in production. Set a strong secret in your environment variables.');
}

export const COOKIE_NAME = 'gkcrm_session';

// Secure in production (HTTPS); lax in dev so cross-port works.
// sameSite: lax — frontend and API share the same Vercel origin so
// cookies are sent on same-origin navigations and safe cross-site GETs.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path:     '/',
} as const;

// Options to clear the cookie on logout / invalid token
export const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/',
} as const;

// ─── Token payload ────────────────────────────────────────────

export interface TokenPayload {
  id:    string;
  email: string;
  name:  string;
  role:  string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// ─── Augmented request ────────────────────────────────────────

// Express 5's default params type is `{ [key: string]: string | string[] }`
// (it allows for repeatable params like `:id+`). Every route in this app uses
// plain `:id` segments, so params are flat strings. Saying so here keeps
// `req.params.id` usable as a string without a cast at each call site.
export type RouteParams = Record<string, string>;

export interface AuthRequest extends Request<RouteParams> {
  userId?:    string;
  userEmail?: string;
  userName?:  string;
  userRole?:  string;
}

// ─── requireAuth middleware ───────────────────────────────────
// Validates the JWT cookie on every protected route.
// On failure: clears the stale cookie and returns 401.

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload  = verifyToken(token);
    req.userId     = payload.id;
    req.userEmail  = payload.email;
    req.userName   = payload.name;
    req.userRole   = payload.role;
    next();
  } catch (err) {
    // Expired or tampered — remove the invalid cookie immediately
    console.warn('[auth] Invalid or expired token:', (err as Error).message);
    res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// ─── requireRole middleware ───────────────────────────────────
// Must come AFTER requireAuth in the middleware chain.

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.userRole)) {
      console.warn(`[auth] Role "${req.userRole}" denied; required one of: ${roles.join(', ')}`);
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}
