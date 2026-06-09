// ============================================================
// GK TRAVELS CRM — Express Application
//
// Shared by both:
//   - server/src/index.ts  (local dev: app.listen)
//   - api/index.ts         (Vercel serverless: exported handler)
// ============================================================

import 'dotenv/config';
import express     from 'express';
import cors        from 'cors';
import cookieParser from 'cookie-parser';

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
import receivablesRouter from './routes/receivables.js';
import analyticsRouter   from './routes/analytics.js';
import communicationsRouter from './routes/communications.js';
import passengersRouter     from './routes/passengers.js';

const app = express();

// ── CORS ───────────────────────────────────────────────────────
// Allow credentials (cookies) from the Vite dev server and
// the production Vercel frontend.  Same-origin requests on Vercel
// (frontend + API share *.vercel.app) also pass through cleanly.

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, SSR, same-origin)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ── Request logging ────────────────────────────────────────────

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

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
app.use('/api/receivables', receivablesRouter);
app.use('/api/analytics',   analyticsRouter);
app.use('/api/communications', communicationsRouter);
app.use('/api/passengers',    passengersRouter);

// ── 404 ────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ───────────────────────────────────────

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('GLOBAL SERVER ERROR:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    details: err?.message || String(err),
  });
});

export default app;
