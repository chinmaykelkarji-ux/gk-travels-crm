# TravelOS — Migration Strategy, Roadmap, Risks and Testing

Covers items K (migration strategy), L (phased roadmap), M (highest-risk areas) and N (testing strategy). Depends on `01-audit.md` and `02-target-architecture.md`.

---

## K. Migration strategy

### K.1 Principles

1. **Strangler, not rewrite.** New `/api/v2` modules go in beside the old routes; each screen is switched to v2 only when its whole read + write path is server-authoritative. No entity is ever half-migrated.
2. **Additive schema first.** Every phase adds tables/columns, backfills with an idempotent script, switches the code, verifies, and only then drops the old structure in a later, separate migration.
3. **Production data is small; rehearse anyway.** Every data migration is run on a Neon branch copy first, with row-count and checksum assertions before and after.
4. **One-way doors get a checkpoint.** Dropping tables, changing PKs, or replacing the quotation engine require the owner's explicit go-ahead after the rehearsal report.
5. **Legacy stays reachable** under `/legacy/*` until the replacement has been used for real work for at least one trip.

### K.2 KEEP / REFACTOR / REPLACE / REMOVE / ADD

| Component | Decision | Notes |
|---|---|---|
| React + Vite + TS + Tailwind + Radix shell | KEEP | Restyle to the design system; keep routing and lazy loading |
| Express app, Prisma, Neon, Vercel | KEEP | Add cron tick, staging branch, CI |
| `services/invoiceService.ts`, `gstReports.ts`, invoice/CN/DN screens and print views | KEEP → REFACTOR | Add `organizationId`, replace JSON source ids with `InvoiceSource`, move calc into `shared/calc`, add tests |
| `services/financeService.ts`, `FinancialTransaction` | REFACTOR | Becomes `LedgerEntry` with reversals; the only writer of balances |
| `lib/activity.ts` | REFACTOR | Becomes `core/audit` with `source` and request id |
| `shared/utils/finance.ts`, `gst.ts` | REFACTOR | Move to `src/shared/calc/`, Decimal-safe, fully unit-tested; UI copies deleted |
| `Enquiry`, `SalesQuote` (Gen 2 sales) | REFACTOR | Basis of the single quotation engine; port GST, approval, inclusions/exclusions from legacy `Quotation` |
| `Quotation`/`QuotationItem` (legacy) | REPLACE | Migrated into the unified engine; screens retired |
| `TripService`, dashboard `/today`, Ops Dashboard | REFACTOR | Split into typed operational tables; ops dashboard reads the new tables |
| `Booking` (8-type legacy) | REPLACE | Becomes `Ticket`/`TripExtra`/`HotelBooking`/etc.; `Booking` name reassigned to the commercial contract |
| `Trip` cached finance columns | REPLACE | `trip_financials` view over the ledger |
| Zustand god-store + `/api/data/all` | REPLACE (gradually) | TanStack Query per feature; store shrinks to UI state only, then deleted |
| Client-side ID generation (`id.ts`) | REMOVE | Server numbering |
| Client-side reminders, `Reminder` table, `activity/reminders/*` | REMOVE | Notifications + automation rules |
| `outboxWorker`/`schedulerWorker` `setInterval` | REPLACE | Job tick + seeded automation rules |
| Permission maps (`backend/auth/permissions.ts`, `hooks/usePermissions.ts`) | REPLACE | One catalogue served by `/api/v2/me` |
| `src/backend/{supabase,repositories,services,api}`, `src/lib/supabase.ts`, `supabase/`, Supabase dependency, unrouted auth pages | REMOVE | Phase 1, day one |
| `index.legacy.html`, `assets/js`, `assets/css`, `schema_output.txt`, `ai_check.mjs`, `tmp-test-template.xlsx`, `.set/`, `.set(1)/`, `.vscode/` | REMOVE | Rotate the credentials found in `ai_check.mjs`/seed scripts |
| `README.md` | REPLACE | Describe the real system |
| Gemini prose services | KEEP → REFACTOR | Behind `AiProvider`; prompts read agency details from `Organization` |
| WhatsApp/SMTP adapters | KEEP → REFACTOR | Credentials from `IntegrationConfig`; status visible in Settings |
| Vouchers | KEEP → REFACTOR | Generated from operational records; adopt the 21 drift columns into the schema, then remove unused ones |
| Import/export | REFACTOR | Server-side, dry-run with row-level report, transactional commit |
| Hotels, vehicles, drivers, activities, documents, extraction, copilot, automation UI, notifications, portal, expenses, payment schedules, tax config, tenancy | ADD | Per roadmap |

### K.3 Database migration mechanics (Phase 1, step 1)

1. Snapshot: create Neon branch `pre-travelos-YYYYMMDD` (instant, free rollback).
2. Reconcile drift **without data loss**: add the 21 existing `vouchers` columns to `schema.prisma` as nullable so the schema matches Neon; run `prisma migrate diff` until it reports only the missing indexes/view/customer columns.
3. Apply the two pending migration folders by hand (indexes with `CONCURRENTLY`, the ledger view, the four customer columns), then uncomment the customer fields and add them to the allow-list.
4. Baseline: `prisma migrate resolve --applied <name>` for every folder in `prisma/migrations/` so `_prisma_migrations` matches git; verify `prisma migrate diff` is empty; verify `prisma migrate deploy` is a no-op.
5. From then on: every schema change is a migration folder; `npm run build` runs `prisma migrate deploy` before `prisma generate`; `db:push` script is deleted.
6. Data migrations live in `prisma/data-migrations/<timestamp>-<name>.ts`, are idempotent, log counts, and are run explicitly (`npm run data:migrate <name>`), never inside the schema migration.

### K.4 Cut-over recipe per module (repeated in every phase)

1. Contracts: zod schemas + types in `src/shared/contracts/<module>.ts`.
2. Schema: additive migration + backfill script + rehearsal on a branch.
3. Server: `modules/<module>/{schemas,service,repo,routes,events}.ts` with permissions, audit, tests.
4. Client: `features/<module>/` with queries/mutations; the old screen keeps working from the store until the new one is complete.
5. Switch: route the sidebar to the new screen; move the old one to `/legacy/<module>`; delete the store slice and v1 routes once the owner has used the new screen for real work.
6. Verify: API tests, permission matrix, a golden-path Playwright run, typecheck, and a production smoke check after deploy.

---

## L. Phased roadmap

Each phase ends with a deployable state, a demo on production data, and a written checkpoint. "Done" means functional + secure + validated + tested + error-handled + auditable + responsive + integrated (brief §50).

### Phase 1 — Foundation (security, integrity, tooling)

Deliverables

- Repo hygiene: remove Gen 0 and junk files; README; rotate seeded credentials.
- `tsconfig.server.json` in the build; the 73 server errors fixed; ESLint + Prettier; Vitest; GitHub Actions running typecheck/lint/tests on every push; Vercel deploys on green only.
- Database: drift reconciled, pending migrations applied, `prisma migrate` baselined (K.3); `Organization` table + `organizationId` on every table with backfill; Neon `staging` branch wired to Vercel previews.
- `core/*`: errors, validation, tenant client extension, audit (renamed from activity), rbac tables + seeded permission catalogue + `/api/v2/me`, sessions with refresh/revocation, login rate limit, helmet, CORS by environment, numbering service.
- Close the open security findings E1–E15: `/api/data/all` reduced to a role-filtered bootstrap (settings, me, enums) and scheduled for deletion; every v1 router gets `requirePermission` and an allow-list; `activity` POST and `reminders/bulk` removed; error envelope; 403s surfaced in the UI.
- Job runner: `Job`/tick endpoint + Vercel cron; the three scheduler rules and outbox handlers moved onto it (they start working in production).
- Storage service + `Document`/`DocumentLink` tables + upload/download endpoints with signed URLs (foundation only; no AI yet).
- Design system tokens and primitives; new shell navigation with `/legacy/*` fallbacks.

Exit criteria: CI green; no route without permission; `prisma migrate deploy` no-op on prod; a non-admin cannot read financials or vendor bank details; reminders fire from Vercel cron.

### Phase 2 — Core CRM + Sales

- Customers: server-side list/search/pagination, `phoneNormalized` dedupe with merge tool, relationships, structured preferences, identity documents, Customer 360 page (trips, enquiries, quotations, bookings, payments, documents, communications, timeline).
- Travellers (renamed passengers) with identity data and document links.
- Leads: new module with the spec lifecycle, pipeline board, assignment to real users, follow-ups → notifications, convert to customer + enquiry.
- Enquiries: extended fields (adults/children/rooms/meal/hotel/activities/special), created from a lead or a customer, one-click "start quotation".
- Quotation engine (unified): items by category with cost/markup/sell/tax rule, versions, internal vs customer views, status flow DRAFT→…→EXPIRED, approval gate, customer-safe PDF/print, share via configured channel, accept → booking.
- Booking (commercial contract) with travellers and payment schedule; `Booking accepted` event.
- Data migration of legacy `Quotation`, `SalesQuote`, `Lead` rows; legacy screens moved to `/legacy`.

Exit criteria: lead → enquiry → quotation → booking on production without the store; margin never appears on the customer document; numbering is gap-free per FY.

### Phase 3 — Travel operations

- Trip Control Centre with the spec status flow; created automatically from a booking.
- Masters: hotels (room types, rates, meal plans), vehicles (documents, insurance/permit expiry), drivers, activities/providers; import for hotels/vehicles.
- Operational records: hotel bookings, vehicle assignments (overlap check), activity bookings, tickets, extras; confirmation documents linked; vouchers generated from records.
- Itinerary builder v2: days → items with times/locations, customer vs internal notes, images, customer-facing render; AI prose kept as an assist.
- Tasks assigned to real users, auto-generated from booking items (existing `taskEngine` rules become templates).
- Operations Today rebuilt on the new tables; driver mobile view (today's assignment, passengers, pickup, status update, document upload) behind the DRIVER role.
- Migration of the 8 legacy `Booking` rows and 5 vouchers; legacy trips/bookings screens retired.

Exit criteria: one real trip (hotels, vehicle, driver, tickets, itinerary) fully managed in the workspace; no scheduling overlap possible; drivers see only their assignments.

### Phase 4 — Finance

- Ledger (`LedgerEntry` with reversals) as the single source; customer payments (advance/installment/final/refund) against schedules; vendor invoices and payments; expenses with receipts; receivables/payables aging; trip profitability view by cost category; dashboard KPIs from the ledger with drill-through.
- Tax configuration (`TaxRule`) replacing hard-coded rates; invoice/CN/DN wired to rules; GST reports unchanged in output, tested.
- Removal of cached finance columns on trips/bookings; analytics rewritten on read models; dashboard and analytics agree by construction.
- Automation: payment overdue → follow-up task + notification + reminder draft.

Exit criteria: `finance` test suite (balances, receivables, payables, profitability, GST) green; dashboard, analytics and trip finance show identical numbers for the same period.

### Phase 5 — Document intelligence

- Document centre (list, preview, versions, expiry, permissions, entity links) across all entities.
- Pipeline (H.5) with Claude adapter: classification, per-type extraction schemas (flight, train, bus, hotel confirmation, activity/vehicle voucher, supplier invoice, receipt, insurance, passport), confidence display, entity matching, side-by-side review, approval, audit; async via jobs with visible status; manual correction path.

Exit criteria: upload a real flight ticket → proposed `Ticket` linked to the right trip/traveller with confidences → approved → visible in the trip; nothing written without approval; original retained.

### Phase 6 — AI copilot and insights

- Tool registry (read tools first), permission-scoped sessions, `AiAction` audit, chat surface in the shell; write tools with confirmation (tasks, drafts, follow-ups); deterministic insights feed on the dashboard.

Exit criteria: the ten example questions in brief §24 answer correctly from live data; a SALES user cannot retrieve finance through the copilot.

### Phase 7 — Communication and automation

- Template management, provider configuration UI with live status ("not configured" shown honestly), unified communications log per entity, in-app notifications, WhatsApp/email sends through the job runner, automation rules UI with run history; spec §28 template set seeded.

### Phase 8 — Customer portal

- Token/OTP access for customers: trips, itinerary, tickets, stays, transport, driver info (scoped), payments and schedule, documents (customer-visible only), contacts, updates, feedback. Strict read models — no internal fields can reach the portal serialisers.

### Phase 9 — Analytics and platform foundation

- Sales/operations/finance/customer analytics on read models; organisation onboarding flow, per-organisation settings/roles/templates, API keys, supplier network groundwork.

### Milestone: first success criterion (brief §55)

Achieved at the end of Phase 5 for one real trip: lead → enquiry → quotation → booking → payment → hotel → vehicle → driver → tickets (AI-extracted) → itinerary → customer communication → operations → expenses → vendor payment → profit → completion → feedback, without spreadsheets. Phases 6–9 extend it.

---

## M. Highest-risk areas

| Risk | Where | Mitigation |
|---|---|---|
| Financial correctness during the ledger transition (two sources of truth for a while) | Phase 4 | Ledger runs in shadow mode from Phase 1 (every legacy write also posts entries); a reconciliation report compares cached columns vs ledger daily until cut-over |
| Quotation engine unification changes how staff quote | Phase 2 | Keep the legacy builder under `/legacy` for one full cycle; migrate the one existing quotation; owner sign-off on the customer PDF |
| Schema drift reconciliation | Phase 1 | Rehearse on a Neon branch; `migrate diff` must be empty before baselining; no `db push` ever |
| Vercel execution limits for extraction and jobs | Phases 1, 5 | Chunked jobs with resumable state; time budget per tick; option to run the same tick from a resident worker if needed |
| AI extraction quality and cost | Phase 5 | Strict zod schemas, confidence thresholds, human approval, per-document-type evaluation set built from the owner's real documents |
| Permission regressions when consolidating three maps | Phase 1 | Generated permission-matrix tests (role × endpoint) that fail on any unlisted route |
| Multi-tenant enforcement gaps | Phase 1 onward | Prisma extension tests that assert every query is scoped; a "tenant leak" test seeds two organisations and checks isolation per endpoint |
| Owner-only environment (no staging) | Phase 1 | Neon staging branch + Vercel preview per PR before anything reaches production |
| Scope creep vs the first success criterion | All | Roadmap gates; each phase demoed on real data before the next starts |

---

## N. Testing strategy

| Layer | Tooling | What is covered | Gate |
|---|---|---|---|
| Unit (pure logic) | Vitest | `shared/calc`: GST split/rounding, INCLUDED/EXCLUDED, service-margin mode, quotation totals, discounts, payment balances, receivable/payable status, profitability, financial-year labels, numbering formats; state machines (lead, quotation, booking, trip, document); extraction field mapping; tax rule resolution | CI on every push; 100 % of `shared/calc` |
| Service/API | Vitest + supertest against a Neon test branch (or local Postgres in CI) with seeded fixtures | Every v2 route: validation errors, happy path, audit row written, event emitted, transaction rollback on failure; invoice numbering under concurrency; ledger reversals; tenant isolation (two orgs); permission matrix generated from the route table | CI; must pass before merge |
| Contract | zod schemas | Client forms and server validators share the same schema; a test asserts every v2 route has a schema | CI |
| End-to-end | Playwright | Golden path: login → lead → enquiry → quotation → booking → trip → hotel/vehicle/driver → document upload+approve → payment → invoice → completion; run against the Vercel preview | Per PR (smoke) and before each phase checkpoint (full) |
| Data migrations | Script self-checks | Row counts, sums of money columns, referential checks before/after; rehearsal on a branch produces a report | Manual gate per migration |
| Security | Scripted | Unauthenticated and cross-role probes of every route; secret scanning in CI; dependency audit | CI |
| Performance | k6 or autocannon (light) | Bootstrap, list endpoints and the job tick under 10× current data | Phase 4 and 5 checkpoints |

Definition of done for any feature: unit + API tests for its service, permission entries in the catalogue with matrix coverage, audit assertions, a Playwright step if it is on the golden path, typecheck clean for SPA and server, responsive check at 375 px, and a changelog entry in `docs/travelos/CHANGELOG.md`.

---

## Decisions requested before Phase 1 starts

1. Approve the evolve-not-rewrite direction and the phase order above.
2. Quotation engine: unify on the Enquiry → Quotation line (porting GST/approval from the legacy builder) and retire the legacy `Quotation` screens after migration. (Recommended.)
3. Rename the legacy 8-type "Booking" concept into `Ticket`/`HotelBooking`/`VehicleAssignment`/`ActivityBooking`/`TripExtra`, and use "Booking" for the confirmed commercial contract. (Recommended; it matches the brief.)
4. AI provider for extraction and copilot: Anthropic Claude behind the `AiProvider` interface, keeping Gemini for prose. Needs an `ANTHROPIC_API_KEY`.
5. File storage: Vercel Blob (simplest on the current host) or Cloudflare R2/S3 (cheaper at volume, portable). Either sits behind the same storage interface.
6. Background jobs: Vercel Cron → tick endpoint now; a resident worker only if extraction volume demands it.
7. Drift reconciliation: adopt the 21 voucher columns into the schema temporarily (no data loss), then remove unused ones in Phase 3 with the voucher refactor.
8. Confirm that the seeded credentials in `prisma/seed.ts`, `server/src/scripts/seedUsers.ts` and `ai_check.mjs` may be rotated/removed, and that the five ADMIN accounts should be reviewed.
