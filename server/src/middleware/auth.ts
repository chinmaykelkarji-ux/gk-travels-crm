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

// Single-user application — authentication disabled.
// requireAuth and requireRole are no-op passthroughs kept so all
// route files compile without changes.

export function requireAuth(_req: AuthRequest, _res: Response, next: NextFunction): void {
  next();
}

export function requireRole(..._roles: string[]) {
  return (_req: AuthRequest, _res: Response, next: NextFunction): void => {
    next();
  };
}
