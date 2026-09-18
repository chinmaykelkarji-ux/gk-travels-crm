# TravelOS — Build progress

Working agreement (owner, 2026-09-18): build all phases continuously on `claude/travelos-operating-system-581b62`; commit after every module; automated tests must pass before a phase is marked done; never merge to `main`; never touch the production database — all schema work happens on a Neon branch (or the disposable local Postgres used by the test suite); the owner does full manual testing at the end.

Status legend: ☐ not started · ◐ in progress · ☑ done (tests green) · ⊘ blocked

## Phase 1 — Foundation

| # | Module | Status | Commit | Notes |
|---|---|---|---|---|
| 1.0 | Pre-Phase-1 security hotfix + credential rotation | ☑ | `05ba30a8` | 49/49 role probes |
| 1.1 | Tooling: vitest, supertest, server typecheck in build, CI workflow | ◐ | | |
| 1.2 | Fix the remaining server type errors (57) | ◐ | | |
| 1.3 | Unit tests: `finance.ts`, `gst.ts`, `taskEngine.ts`, `id.ts`, `redact.ts`, `permissions.ts` | ☐ | | |
| 1.4 | Integration tests: invoice/credit/debit service (numbering, GST split, cancel/delete guards, freeze), finance service (payments, payables, ledger) | ☐ | | needs test DB |
| 1.5 | API permission-matrix tests (role × route) | ☐ | | |
| 1.6 | Migration baseline (K.3): adopt voucher drift columns, apply pending SQL, `migrate resolve`; production runbook for the owner | ☐ | | on Neon branch / local PG only |
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

## Blockers / requests for the owner
- A Neon branch connection string (or a `NEON_API_KEY` so branches can be created from here). Until then schema work is rehearsed on the local disposable Postgres only.
- 5–10 real ticket / supplier-invoice PDFs in `eval-docs/` for the Phase 5 provider comparison.
