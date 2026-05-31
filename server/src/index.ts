// ============================================================
// GK TRAVELS CRM — Express API Server
// ============================================================

import 'dotenv/config';
import express     from 'express';
import cors        from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt      from 'bcryptjs';
import { prisma }  from './lib/prisma.js';

import authRouter        from './routes/auth.js';
import dataRouter        from './routes/data.js';
import tripsRouter       from './routes/trips.js';
import leadsRouter       from './routes/leads.js';
import customersRouter   from './routes/customers.js';
import bookingsRouter    from './routes/bookings.js';
import paymentsRouter    from './routes/payments.js';
import tasksRouter       from './routes/tasks.js';
import activityRouter    from './routes/activity.js';
import usersRouter       from './routes/users.js';
import vendorsRouter     from './routes/vendors.js';
import quotationsRouter  from './routes/quotations.js';
import itinerariesRouter from './routes/itineraries.js';
import vouchersRouter    from './routes/vouchers.js';
import analyticsRouter   from './routes/analytics.js';

const app  = express();
const PORT = Number(process.env.PORT) || 3001;

// ── Middleware ─────────────────────────────────────────────────

// CORS: allow credentials (cookies) from the Vite dev server + production origin
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, Postman, SSR)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,   // required for HttpOnly cookies
}));

app.use(cookieParser());                    // parse req.cookies
app.use(express.json({ limit: '10mb' }));   // parse JSON body

// ── Health check ───────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Routes ─────────────────────────────────────────────────────

app.use('/api/auth',        authRouter);
app.use('/api/data',        dataRouter);
app.use('/api/trips',       tripsRouter);
app.use('/api/leads',       leadsRouter);
app.use('/api/customers',   customersRouter);
app.use('/api/bookings',    bookingsRouter);
app.use('/api/payments',    paymentsRouter);
app.use('/api/tasks',       tasksRouter);
app.use('/api/activity',    activityRouter);
app.use('/api/users',       usersRouter);
app.use('/api/vendors',     vendorsRouter);
app.use('/api/quotations',  quotationsRouter);
app.use('/api/itineraries', itinerariesRouter);
app.use('/api/vouchers',    vouchersRouter);
app.use('/api/analytics',   analyticsRouter);

// ── 404 ────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Auto-create default admin ──────────────────────────────────
//
// Runs on every server start. Uses upsert so it's idempotent —
// if the admin already exists the password is NOT overwritten,
// ensuring the user can change it without it being reset on restart.

async function ensureDefaultAdmin() {
  const ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL ?? 'chinmaykelkara@gmail.com').toLowerCase();
  const ADMIN_NAME  =  process.env.DEFAULT_ADMIN_NAME  ?? 'Chinmay';
  const ADMIN_PASS  =  process.env.DEFAULT_ADMIN_PASS  ?? 'Admin123@';

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

// ── Start ──────────────────────────────────────────────────────

async function start() {
  await prisma.$connect();
  console.log('✅ Prisma connected to PostgreSQL');

  await ensureDefaultAdmin();

  app.listen(PORT, () => {
    console.log(`🚀 GK Travels CRM API  →  http://localhost:${PORT}`);
    console.log(`   Health check        →  http://localhost:${PORT}/api/health`);
  });
}

start().catch(err => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});
