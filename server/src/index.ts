import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma.js';

import authRouter     from './routes/auth.js';
import dataRouter     from './routes/data.js';
import tripsRouter    from './routes/trips.js';
import leadsRouter    from './routes/leads.js';
import customersRouter from './routes/customers.js';
import bookingsRouter from './routes/bookings.js';
import paymentsRouter from './routes/payments.js';
import tasksRouter    from './routes/tasks.js';
import activityRouter from './routes/activity.js';
import usersRouter    from './routes/users.js';
import vendorsRouter     from './routes/vendors.js';
import quotationsRouter   from './routes/quotations.js';
import itinerariesRouter  from './routes/itineraries.js';
import vouchersRouter     from './routes/vouchers.js';
import analyticsRouter   from './routes/analytics.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
  origin:      ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/data',      dataRouter);
app.use('/api/trips',     tripsRouter);
app.use('/api/leads',     leadsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/bookings',  bookingsRouter);
app.use('/api/payments',  paymentsRouter);
app.use('/api/tasks',     tasksRouter);
app.use('/api/activity',  activityRouter);
app.use('/api/users',     usersRouter);
app.use('/api/vendors',     vendorsRouter);
app.use('/api/quotations',   quotationsRouter);
app.use('/api/itineraries',  itinerariesRouter);
app.use('/api/vouchers',     vouchersRouter);
app.use('/api/analytics',   analyticsRouter);

// ── 404 ────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ──────────────────────────────────────────────────────
async function start() {
  await prisma.$connect();
  console.log('✅ Prisma connected to PostgreSQL');

  app.listen(PORT, () => {
    console.log(`🚀 GK Travels CRM API running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
  });
}

start().catch(err => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});
