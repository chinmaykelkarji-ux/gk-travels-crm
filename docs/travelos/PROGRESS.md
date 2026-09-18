# TravelOS — Build progress

Working agreement (owner, 2026-09-18): build all phases continuously on `claude/travelos-operating-system-581b62`; commit after every module; automated tests must pass before a phase is marked done; never merge to `main`; never touch the production database — all schema work happens on a Neon branch or the disposable local Postgres used by the test suite; the owner does full manual testing at the end.

Status legend: ☐ not started · ◐ in progress · ☑ done (tests green) · ⊘ blocked · ⇢ deferred (with the phase it moved to)

## How to run the checks

```bash
npm run typecheck && npm run typecheck:server      # both must be clean
npm run test:unit                                   # no database needed
TEST_DATABASE_URL=postgresql://travelos:travelos@localhost:5434/travelos_test npm run test:integration
```

The integration database is a disposable container: `docker run -d --name travelos-pg -e POSTGRES_PASSWORD=travelos -e POSTGRES_USER=travelos -e POSTGRES_DB=travelos_test -p 5434:5432 postgres:16-alpine`. The suite refuses any host that is not local or any database whose name lacks `test` (`tests/integration/helpers/guard.ts`), so it cannot be pointed at production by mistake. CI (`.github/workflows/ci.yml`) runs the same commands against a Postgres service container.

New schema change recipe (never `db push`): edit `prisma/schema.prisma` → deploy the current chain to a scratch database (`travelos_dev`) → `npx prisma migrate diff --from-url <dev> --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql` → hand-edit if data/view statements are needed → `migrate deploy` on the scratch database → `tests/integration/migrations.test.ts` must stay green.

## Phase 1 — Foundation

| # | Module | Status | Commit | Notes |
|---|---|---|---|---|
| 1.0 | Pre-Phase-1 security hotfix + credential rotation | ☑ | `05ba30a8` | 49/49 role probes |
| 1.1 | Tooling: vitest, supertest, server typecheck in build, CI workflow | ☑ | `4ac18b28` | `db:push`/`db:reset` scripts removed |
| 1.2 | Fix the remaining server type errors | ☑ | `4ac18b28` | 73 → 0 |
| 1.3 | Unit tests: finance, GST, task engine, ids, permissions (server = client), redaction | ☑ | `4ac18b28` | 59 tests |
| 1.4 | Integration tests: invoice/credit-note service, finance service | ☑ | `bbe1a9fd` | 19 tests on a real Postgres |
| 1.5 | API permission-matrix tests (role × route, redaction, write-side guards) | ☑ | `bbe1a9fd` | 32 tests |
| 1.6 | Migration baseline: drift adopted, 14 unreplayable folders squashed into one generated baseline (+ ledger view), migration-chain test, production catch-up SQL and runbook | ☑ | `bbe1a9fd` | Production execution is the owner's step at cutover (RUNBOOK) |
| 1.7 | Tenancy: `Organization`, `organizationId` on all 35 models, tenant-scoped Prisma client (`core/tenant.ts`), org in session, per-org numbering + company settings, ledger view carries org | ☑ | (this commit) | Nested writes rely on the column default until Phase 9 removes it; raw SQL must filter explicitly |
| 1.8 | Core: request context (request id, actor, source), error envelope (`core/errors.ts`), zod validation middleware, audit writer with source/request id, `/api/v2/me` | ☑ | (this commit) | RBAC tables + custom roles ⇢ Phase 9; the static catalogue is served by `/api/v2/me` |
| 1.9 | Server-side sessions with instant revocation (logout, deactivation, role change, password reset), 30-day idle expiry, login rate limit per (IP, email), API ceiling, helmet, CORS by environment | ☑ | (this commit) | Sessions cached 60 s in-process; revocation clears the cache |
| 1.10 | Job runner: `jobs` table, claim with `FOR UPDATE SKIP LOCKED` + lease, retries with backoff, per-organisation handler context, recurring system jobs (scheduler rules every 15 min, outbox dispatch every minute), `POST /api/jobs/tick` behind `CRON_SECRET`, daily safety-net Vercel cron, local dev loop | ☑ | (this commit) | Minute-level scheduling: Pro cron or an external scheduler (decision 6) |
| 1.11 | Storage + documents: S3/R2 provider with presigned PUT/GET, local-disk provider for dev/tests behind HMAC-signed URLs, `documents` + `document_links`, `/api/v2/documents` (register → upload → complete → list/link/download → guarded delete), 503 NOT_CONFIGURED in production without a bucket | ☑ | (this commit) | Phase 5 adds classification/extraction on top |
| 1.12 | Repo hygiene: Supabase-era code, unrouted auth pages, third permission vocabulary, legacy vanilla-JS app, junk files removed; `@supabase/supabase-js` dropped; README rewritten | ☑ | (this commit) | Production Vite build verified |
| 1.13 | Design system tokens + primitives, new shell navigation | ⇢ 2.1 | | Built as the first Phase 2 module so it serves real screens |

## Phase 2 — Core CRM + Sales
| # | Module | Status | Commit | Notes |
|---|--------|--------|--------|-------|
| 2.1 | Design system primitives (`src/design-system/`), typed API client (`src/lib/api.ts`), TravelOS navigation groups, v2 pages carry their own PageHeader | ☑ | | Legacy screens untouched; superseded pages move under `/legacy/*` as v2 replaces them |
| 2.2 | Customers v2: server-side list/search/pagination, `phoneNormalized` dedupe (block + force), duplicate groups + merge, relationships, referrals, tags, soft delete with guards, Customer 360 (trips · sales · finance · travellers · documents · activity) | ☑ | | Migration `20260918140000_customers_v2` backfills normalised phones, corporate flag, and seeds the `CUS` sequence. Legacy page at `/legacy/customers` |
| 2.3 | Travellers (rename Passenger, per-customer + per-trip, passport expiry alerts) | ☐ | | |
| 2.4 | Leads v2 (spec lifecycle, real-user assignment, pipeline board) | ☐ | | |
| 2.5 | Enquiries v2 (adults/children/infants, rooms, preferences) | ☐ | | |
| 2.6 | Unified quotation engine (per-person rates, option groups, parties; pure calc in `src/shared/calc/quotation.ts`) | ☐ | | |
| 2.7 | Booking contract + payment schedule | ☐ | | |
| 2.8 | Migrate existing sales quotes + legacy quotation | ☐ | | |

## Phase 3 — Travel operations
☐ Trip control centre · ☐ Hotels/vehicles/drivers/activities masters · ☐ Hotel bookings, vehicle assignments (overlap check), activity bookings, tickets (segments, boarding points, group pax), extras · ☐ Itinerary v2 · ☐ Tasks · ☐ Ops today · ☐ Driver view · ☐ Legacy booking/voucher migration

## Phase 4 — Finance
☐ Ledger with reversals · ☐ Customer payments vs schedules · ☐ Vendor invoices/payments · ☐ Expenses · ☐ Tax rules · ☐ Profitability view · ☐ Dashboard/analytics from ledger

## Phase 5 — Document intelligence
☐ Document centre · ☐ `AiProvider` + Claude + Gemini adapters · ☐ Evaluation harness (owner's PDFs in `eval-docs/`) · ☐ Pipeline: classify → extract → match → review → apply

## Phase 6 — Copilot · Phase 7 — Comms + automation · Phase 8 — Portal · Phase 9 — Analytics + platform
☐ (Phase 9 also: RBAC tables and custom roles, per-organisation numbering without column defaults, organisation onboarding)

## Requests for the owner
- A Neon branch connection string (or a `NEON_API_KEY`) if you want schema work rehearsed on Neon as well as on the local container. Not blocking: the local container covers every automated check.
- 5–10 real ticket / supplier-invoice PDFs in `eval-docs/` for the Phase 5 provider comparison.
- At cutover: follow `docs/travelos/RUNBOOK-production-cutover.md` (snapshot → catch-up SQL → baseline → verify → deploy). The tenancy migration is part of the chain the runbook applies.
