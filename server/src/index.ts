// ============================================================
// GK TRAVELS CRM — Local Development Server
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
import { startOutboxWorker }    from './workers/outboxWorker.js';
import { startSchedulerWorker } from './workers/schedulerWorker.js';

const PORT = Number(process.env.PORT) || 3001;

// ── Auto-create default admin ──────────────────────────────────
//
// Runs on every local server start. Uses upsert so it's idempotent —
// if the admin already exists the password is NOT overwritten.

async function ensureDefaultAdmin() {
  const ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL ?? 'chinmaykelkara@gmail.com').toLowerCase();
  const ADMIN_NAME  =  process.env.DEFAULT_ADMIN_NAME  ?? 'Chinmay';
  const ADMIN_PASS  =  process.env.DEFAULT_ADMIN_PASS  ?? 'Chinmay#1015';

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

// ── Start ───────────────────────────────────���──────────────────

async function start() {
  await prisma.$connect();
  console.log('✅ Prisma connected to PostgreSQL');

  await ensureDefaultAdmin();

  app.listen(PORT, () => {
    console.log(`🚀 GK Travels CRM API  →  http://localhost:${PORT}`);
    console.log(`   Health check        →  http://localhost:${PORT}/api/health`);

    // Background workers — started after the server is listening so
    // they never block startup.
    startOutboxWorker();
    startSchedulerWorker();
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
