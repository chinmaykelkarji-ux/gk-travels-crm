// ============================================================
// GK TRAVELS CRM — Vercel Serverless Entry Point
//
// Vercel routes all /api/* requests here (see vercel.json).
// The Express app handles routing internally; Vercel just calls
// the exported handler for each incoming request.
//
// ensureDefaultAdmin runs once per cold start (idempotent).
// Set these env vars in the Vercel dashboard:
//   DEFAULT_ADMIN_EMAIL   e.g. admin@gktravels.local
//   DEFAULT_ADMIN_NAME    e.g. Chinmay
//   DEFAULT_ADMIN_PASS    strong password
//   JWT_SECRET            long random string (DO NOT use the default)
// ============================================================

import 'dotenv/config';
import app        from '../server/src/app.js';
import { prisma } from '../server/src/lib/prisma.js';
import bcrypt     from 'bcryptjs';

// Runs once on each serverless cold start — idempotent (skips if user exists).
async function ensureDefaultAdmin(): Promise<void> {
  try {
    const email = (process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@gktravels.local').toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const pass = process.env.DEFAULT_ADMIN_PASS ?? 'admin123';
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
