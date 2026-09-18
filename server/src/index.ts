// ============================================================
// GK TRAVELS CRM / TravelOS — Local Development Server
//
// This file is only used when running locally with:
//   npm run server  (tsx watch server/src/index.ts)
//
// For production (Vercel), the Express app is exported from
// server/src/app.ts and served via api/index.ts as a
// serverless function — this file is never executed there.
// ============================================================

import app         from './app.js';
import { prisma }  from './lib/prisma.js';
import bcrypt      from 'bcryptjs';
import { runTick } from './core/jobs.js';
import './jobs/handlers.js';

const PORT = Number(process.env.PORT) || 3001;

// ── Auto-create default admin ──────────────────────────────────
//
// Runs on every local server start. Uses upsert so it's idempotent —
// if the admin already exists the password is NOT overwritten.

async function ensureDefaultAdmin() {
  const rawEmail   = process.env.DEFAULT_ADMIN_EMAIL;
  const ADMIN_PASS = process.env.DEFAULT_ADMIN_PASS;
  const ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME ?? 'Admin';

  // No default credentials. Set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASS in
  // .env to bootstrap the first account, or run `npm run seed:users`.
  if (!rawEmail || !ADMIN_PASS) {
    console.log('ℹ️  Admin bootstrap skipped — set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASS to enable it.');
    return;
  }

  const ADMIN_EMAIL = rawEmail.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`✅ Admin exists: ${ADMIN_EMAIL} (role: ${existing.role})`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
  const admin = await prisma.user.create({
    data: {
      email:        ADMIN_EMAIL,
      passwordHash,
      name:         ADMIN_NAME,
      role:         'ADMIN',
      isActive:     true,
    },
  });
  console.log(`✅ Default admin created: ${admin.email}`);
}

// ── Start ─────────────────────────────────────────────────────

async function start() {
  await prisma.$connect();
  console.log('✅ Prisma connected to PostgreSQL');

  await ensureDefaultAdmin();

  app.listen(PORT, () => {
    console.log(`🚀 TravelOS API           →  http://localhost:${PORT}`);
    console.log(`   Health check           →  http://localhost:${PORT}/api/health`);

    // Local job loop — production uses a scheduler hitting POST /api/jobs/tick.
    const every = Number(process.env.LOCAL_TICK_INTERVAL_MS) || 60_000;
    setInterval(() => {
      runTick({ budgetMs: Math.max(5_000, every - 5_000), workerId: 'local-loop' })
        .then(s => { if (s.claimed) console.log(`[jobs] tick: ${s.claimed} claimed, ${s.succeeded} ok, ${s.retried} retried, ${s.failed} failed`); })
        .catch(err => console.error('[jobs] tick failed', err));
    }, every).unref();
    console.log(`   Job loop               →  every ${every / 1000}s (POST /api/jobs/tick in production)`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Run: npx kill-port ${PORT}`);
      process.exit(1);
    }
    throw err;
  });
}

start().catch(err => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});
