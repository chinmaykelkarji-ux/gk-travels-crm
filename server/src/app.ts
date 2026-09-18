// ============================================================
// GK TRAVELS CRM / TravelOS — Express Application
//
// Shared by both:
//   - server/src/index.ts  (local dev: app.listen)
//   - api/index.ts         (Vercel serverless: exported handler)
// ============================================================

import 'dotenv/config';
import express     from 'express';
import cors        from 'cors';
import cookieParser from 'cookie-parser';

import { requestContextMiddleware } from './core/requestContext.js';
import { errorHandler, notFoundHandler } from './core/errors.js';
import { securityHeaders, apiLimiter } from './core/security.js';

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
import companySettingsRouter from './routes/companySettings.js';
import invoicesRouter       from './routes/invoices.js';
import creditNotesRouter    from './routes/creditNotes.js';
import debitNotesRouter     from './routes/debitNotes.js';
import gstReportsRouter     from './routes/gstReports.js';
import tripServiceRouter    from './routes/tripService.js';
import messagingRouter      from './routes/messaging.js';
import dashboardRouter      from './routes/dashboard.js';
import enquiryRouter        from './routes/enquiry.js';
import salesQuoteRouter     from './routes/salesQuote.js';
import aiRouter              from './routes/ai.js';
import meV2Router            from './routes/v2/me.js';
import documentsV2Router     from './routes/v2/documents.js';
import customersV2Router     from './routes/v2/customers.js';
import { travellersRouter, tripTravellersRouter } from './routes/v2/travellers.js';
import storageLocalRouter    from './routes/v2/storageLocal.js';
import jobsRouter            from './routes/jobs.js';
import { getStorage }        from './core/storage.js';

const app = express();

// Vercel/other proxies terminate TLS; trust the first hop so `secure` cookies
// and client IPs (rate limiting) are read from the forwarded headers.
app.set('trust proxy', 1);
app.use(securityHeaders);

// ── CORS ───────────────────────────────────────────────────────
// Same-origin in production (frontend and API share the Vercel origin).
// Localhost origins are only allowed outside production.

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173']),
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, same-origin navigations)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// Request id + actor context for every request (core/requestContext.ts).
app.use(requestContextMiddleware);
app.use('/api', apiLimiter);

// ── Request logging ────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

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
app.use('/api/company-settings', companySettingsRouter);
app.use('/api/invoices',      invoicesRouter);
app.use('/api/credit-notes',  creditNotesRouter);
app.use('/api/debit-notes',   debitNotesRouter);
app.use('/api/gst-reports',   gstReportsRouter);
app.use('/api/trip-services', tripServiceRouter);
app.use('/api/messaging',     messagingRouter);
app.use('/api/dashboard',     dashboardRouter);
app.use('/api/enquiries',     enquiryRouter);
app.use('/api/sales-quotes',  salesQuoteRouter);
app.use('/api/ai',            aiRouter);

// ── v2 (server-authoritative modules; see docs/travelos/02-target-architecture.md) ──
app.use('/api/v2/me',         meV2Router);
app.use('/api/v2/documents',  documentsV2Router);
app.use('/api/v2/customers',  customersV2Router);
app.use('/api/v2/travellers', travellersRouter);
app.use('/api/v2/trips/:tripId/travellers', tripTravellersRouter);
if (getStorage()?.kind === 'local') app.use('/api/v2/storage/local', storageLocalRouter);
app.use('/api/jobs',          jobsRouter);

// ── 404 + error envelope ───────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
