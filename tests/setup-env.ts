// Runs in every vitest worker before a test file is imported, so the server
// modules (which read process.env at import time) see test values.
//
// SAFETY: integration tests only ever talk to TEST_DATABASE_URL. If it is not
// set, DATABASE_URL is cleared so no test can accidentally reach a real
// database through a stray .env. The production Neon database is never a
// valid target here (see assertTestDatabase in tests/integration/helpers/db.ts).

const testUrl = process.env.TEST_DATABASE_URL;

if (testUrl) {
  process.env.DATABASE_URL = testUrl;
} else {
  delete process.env.DATABASE_URL;
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'vitest-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
// Keep optional integrations unconfigured so nothing tries to send anything.
delete process.env.WHATSAPP_BSP_URL;
delete process.env.SMTP_HOST;
delete process.env.GEMINI_API_KEY;
delete process.env.PORT;
// Documents: local disk provider in a per-run temp directory; never a bucket.
delete process.env.STORAGE_BUCKET;
process.env.STORAGE_LOCAL_DIR ??= require('node:path').join(require('node:os').tmpdir(), 'travelos-test-storage-' + process.pid);
process.env.CRON_SECRET ??= 'vitest-cron-secret-0123456789abcdef';
