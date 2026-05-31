// ============================================================
// GK TRAVELS CRM — Vercel Serverless Entry Point
//
// Vercel routes all /api/* requests here (see vercel.json).
// The Express app handles routing internally; Vercel just calls
// the exported handler for each incoming request.
// ============================================================

import app from '../server/src/app.js';

export default app;
