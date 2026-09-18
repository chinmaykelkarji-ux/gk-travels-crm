# TravelOS — Build progress

Working agreement (owner, 2026-09-18): build all phases continuously on `claude/travelos-operating-system-581b62`; commit after every module; automated tests must pass before a phase is marked done; never merge to `main`; never touch the production database — all schema work happens on a Neon branch or the disposable local Postgres used by the test suite; the owner does full manual testing at the end.

Status legend: ☐ not started · ◐ in progress · ☑ done (tests green) · ⊘ blocked

## How to run the checks

```bash
npm run typecheck && npm run typecheck:server      # both must be clean
npm run test:unit                                   # no database needed
TEST_DATABASE_URL=postgresql://travelos:travelos@localhost:5434/travelos_test npm run test:integration
```

The integration database is a disposable container: `docker run -d --name travelos-pg -e POSTGRES_PASSWORD=travelos -e POSTGRES_USER=travelos -e POSTGRES_DB=travelos_test -p 5434:5432 postgres:16-alpine`. The suite refuses any host that is not local or any database whose name lacks `test` (`tests/integration/helpers/guard.ts`), so it cannot be pointed at production by mistake. CI (`.github/workflows/ci.yml`) runs the same commands against a Postgres service container.

## Phase 1 — Foundation

| # | Module | Status | Commit | Notes |
|---|---|---|---|---|
| 1.0 | Pre-Phase-1 security hotfix + credential rotation | ☑ | `05ba30a8` | 49/49 role probes |
| 1.1 | Tooling: vitest, supertest, server typecheck in build, CI workflow | ☑ | `4ac18b28` | `db:push`/`db:reset` scripts removed |
| 1.2 | Fix the remaining server type errors | ☑ | `4ac18b28` | 73 → 0 |
| 1.3 | Unit tests: finance, GST, task engine, ids, permissions (server = client), redaction | ☑ | `4ac18b28` | 59 tests |
| 1.4 | Integration tests: invoice/credit-note service, finance service | ☑ | (this commit) | 19 tests on a real Postgres |
| 1.5 | API permission-matrix tests (role × route, redaction, write-side guards) | ☑ | (this commit) | 32 tests |
| 1.6 | Migration baseline: drift adopted into the schema, 14 unreplayable folders squashed into one generated baseline (+ ledger view), migration-chain test, production catch-up SQL and runbook | ☑ | (this commit) | Production execution is the owner's step at cutover (RUNBOOK) |
| 1.7 | Tenancy: `Organization`, `organizationId` everywhere, tenant-scoped Prisma client, orgId in session | ☐ | | |
| 1.8 | Core: error envelope, zod validation middleware, audit source/request id, RBAC tables + `/api/v2/me` | ☐ | | |
| 1.9 | Sessions with refresh + revocation, login rate limit, helmet, CORS by environment | ☐ | | |
| 1.10 | Job runner: `Job` table, idempotent tick endpoint, scheduler rules + outbox moved onto it, cron config | ☐ | | |
| 1.11 | Storage: R2/S3 adapter with presigned URLs, `Document`/`DocumentLink`, upload/download API (shows "not configured" without credentials) | ☐ | | |
| 1.12 | Repo hygiene: Gen 0 removal, junk files, README | ☐ | | |
| 1.13 | Design system tokens + primitives, new shell navigation | ☐ | | |

## Phase 2 — Core CRM + Sales
☐ Customers v2 · ☐ Travellers · ☐ Leads · ☐ Enquiries v2 · ☐ Unified quotation engine (per-person, options, parties) · ☐ Booking contract + payment schedule · ☐ Quote migration

## Phase 3 — Travel operations
☐ Trip control centre · ☐ Hotels/vehicles/drivers/activities masters · ☐ Hotel bookings, vehicle assignments (overlap check), activity bookings, tickets (segments, boarding points, group pax), extras · ☐ Itinerary v2 · ☐ Tasks · ☐ Ops today · ☐ Driver view · ☐ Legacy booking/voucher migration

## Phase 4 — Finance
☐ Ledger with reversals · ☐ Customer payments vs schedules · ☐ Vendor invoices/payments · ☐ Expenses · ☐ Tax rules · ☐ Profitability view · ☐ Dashboard/analytics from ledger

## Phase 5 — Document intelligence
☐ Document centre · ☐ `AiProvider` + Claude + Gemini adapters · ☐ Evaluation harness (owner's PDFs in `eval-docs/`) · ☐ Pipeline: classify → extract → match → review → apply

## Phase 6 — Copilot · Phase 7 — Comms + automation · Phase 8 — Portal · Phase 9 — Analytics + platform
☐

## Requests for the owner
- A Neon branch connection string (or a `NEON_API_KEY`) if you want schema work rehearsed on Neon as well as on the local container. Not blocking: the local container covers every automated check.
- 5–10 real ticket / supplier-invoice PDFs in `eval-docs/` for the Phase 5 provider comparison.
- At cutover: follow `docs/travelos/RUNBOOK-production-cutover.md` (snapshot → catch-up SQL → baseline → verify → deploy).
