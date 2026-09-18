// ============================================================
// HTTP hardening — helmet headers and rate limiting.
//
// The SPA is served by Vercel as static files, so the API only needs the
// header set that applies to JSON responses; CSP for the HTML is configured
// in vercel.json. Login is limited per (IP, email) so credential stuffing
// against one account and bcrypt CPU exhaustion are both bounded.
// ============================================================

import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { AppError } from './errors.js';

export const securityHeaders = helmet({
  contentSecurityPolicy: false, // API returns JSON; the page CSP lives in vercel.json
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

function limitedHandler(_req: Request, _res: Response, next: (err?: unknown) => void, message: string): void {
  next(new AppError('RATE_LIMITED', 429, message));
}

/** 10 attempts per 15 minutes per (IP, email). Disabled under test. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:    10,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== 'yes',
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
  },
  handler: (req, res, next) => limitedHandler(req, res, next, 'Too many sign-in attempts. Try again in 15 minutes.'),
});

/** General API ceiling per IP: 600 requests per minute (generous for the SPA's bootstrap + polling). */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit:    600,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== 'yes',
  handler: (req, res, next) => limitedHandler(req, res, next, 'Too many requests. Slow down and try again.'),
});
