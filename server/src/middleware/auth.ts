import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ─── Constants ────────────────────────────────────────────────

// No fallback, in any environment. A default signing secret that ships in the
// repository lets anyone mint a valid admin session, so a missing value must
// stop the process rather than quietly downgrade every session to forgeable.
const JWT_SECRET_RAW = process.env.JWT_SECRET;

if (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 32) {
  throw new Error(
    '[auth] JWT_SECRET is missing or too short (min 32 chars). ' +
    'Set a long random value in the environment before starting the API.',
  );
}

// Re-bound as a plain string so jwt.sign/verify resolve their string overloads.
const JWT_SECRET: string = JWT_SECRET_RAW;

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

export interface AuthRequest extends Request {
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
