// ============================================================
// GK TRAVELS CRM — Vercel Serverless Entry Point
//
// Vercel routes all /api/* requests here (see vercel.json).
// The Express app handles routing internally; Vercel just calls
// the exported handler for each incoming request.
//
// ensureDefaultAdmin runs once per cold start (idempotent). It is a no-op
// unless BOTH DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASS are set — there is
// no default password.
//
// Required env vars (Vercel dashboard):
//   DATABASE_URL          Postgres connection string
//   JWT_SECRET            long random string, min 32 chars — the API refuses
//                         to start without it
// Optional:
//   DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASS / DEFAULT_ADMIN_NAME
//                         first-admin bootstrap on an empty database
//   GEMINI_API_KEY        AI features; absent → /api/ai/* returns 503,
//                         the rest of the API is unaffected
// ============================================================

import 'dotenv/config';
import app        from '../server/src/app.js';
import { prisma } from '../server/src/lib/prisma.js';
import bcrypt     from 'bcryptjs';

// Runs once on each serverless cold start — idempotent (skips if user exists).
//
// Bootstraps the very first administrator ONLY when both the email and a
// password are supplied explicitly. There is deliberately no default password:
// inventing one creates a publicly guessable admin account on a public URL.
async function ensureDefaultAdmin(): Promise<void> {
  try {
    const rawEmail = process.env.DEFAULT_ADMIN_EMAIL;
    const pass     = process.env.DEFAULT_ADMIN_PASS;

    if (!rawEmail || !pass) {
      // Nothing to bootstrap. Existing deployments already have their admin;
      // a fresh one should be seeded with `npm run seed:users`.
      return;
    }

    const email = rawEmail.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const hash = await bcrypt.hash(pass, 12);
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        name:         process.env.DEFAULT_ADMIN_NAME ?? 'Admin',
        role:         'ADMIN',
        isActive:     true,
      },
    });
    console.log('[api] Default admin created:', email);
  } catch (err) {
    // Non-fatal — the admin may already exist or there may be a
    // concurrent cold start that created it first.
    console.error('[api] ensureDefaultAdmin error (non-fatal):', err);
  }
}

// Fire-and-forget — don't block the first request
void ensureDefaultAdmin();

export default app;
