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

Exit criteria: the ten example questions in brief §24 answer correctly from live data (owner's manual test with a live key — the brief is not in the repository); a SALES user cannot retrieve finance through the copilot (automated: `tests/integration/copilot.v2.test.ts`).

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

---

## Decision log

### 2026-09-18 — Owner approvals on the Phase 0 plan

| # | Decision | Outcome | Conditions attached |
|---|---|---|---|
| 1 | Evolve-not-rewrite direction and phase order | **Approved** | Phase 1 must put the server typecheck into the build, fix the 73 errors, and add tests around the finance, GST and invoice services **before** those services are refactored |
| 2 | Unify quotations on the Enquiry → Quotation line | **Approved** | The engine must support group per-person costing, multi-option (alternative) flight quotes, and family-wise splits; existing quotes (4 sales quotes + 1 legacy quotation) are migrated |
| 3 | "Booking" becomes the commercial contract; legacy 8-type rows become tickets/stays/transport/activities/extras | **Approved** | Tickets must cover flight, train and bus with group passengers and boarding/dropping points |
| 4 | AI provider | **Deferred to evidence** | Build the `AiProvider` interface first; run Claude vs Gemini on 5–10 real ticket/invoice PDFs (accuracy + cost) before choosing the extraction default |
| 5 | File storage | **Decided: S3-compatible private bucket (Cloudflare R2)** | Short-lived signed URLs only; no public URL for any document, ever |
| 6 | Background jobs | **Vercel Cron if plan limits allow; otherwise an external scheduler** hitting a secret-protected, idempotent tick endpoint | See "Job execution on Vercel" below |
| 7 | Drift reconciliation by adopting the 21 voucher columns first | **Approved** | Take a Neon branch/snapshot **and** run `prisma db pull` to a scratch schema before any schema change |
| 8 | Rotate committed credentials, review admins | **Approved and executed** (see below) | — |

Pre-Phase-1 gate (owner's instruction): hotfix the bootstrap data leak and add authorization to the eleven unprotected routers. Done in commit `hotfix: authorization + bootstrap redaction` on 2026-09-18.

### Credential rotation — executed 2026-09-18

Verified by bcrypt comparison that six of ten accounts still used passwords committed to the repository. All six had their hash replaced with a random value; the five seeded accounts were also deactivated. Files that carried credentials (`ai_check.mjs`, `prisma/create-admin.ts`, `prisma/reset-admin.ts`) were deleted; `prisma/seed.ts` and `server/src/scripts/seedUsers.ts` now read credentials from the environment and refuse to run in production without an explicit override. Every change has an `activity_logs` row.

### Refined requirements from the approvals

**Quotation engine (decision 2).** `QuotationItem` gains `pricingBasis` (PER_PERSON, PER_UNIT, PER_ROOM, PER_GROUP), per-category rates via `QuotationItemRate` (ADULT, CHILD, INFANT with cost and sell), `optionGroupId` + `isSelectedOption` so alternatives (three flight options, two hotel tiers) live in one quotation and the customer picks one, and `partyId` so items can be allocated to a `QuotationParty` (a family or sub-group of travellers). Totals are computed per party and rolled up; accepting a quotation creates one `Booking` per party when splits are requested, each with its own payment schedule and invoice. The customer document shows selected options and per-party totals, never cost.

**Tickets (decision 3).** `Ticket` (kind FLIGHT | TRAIN | BUS, carrier, PNR, status, cost, sell, documentId) → `TicketSegment` (sequence, from, to, boardingPoint, droppingPoint, departAt, arriveAt, carrierNumber, terminal/platform, coach/class) → `TicketPassenger` (ticket × traveller, seat/berth, ticketNumber, status). One PNR carries the whole group; boarding and dropping points are per segment so a bus with multiple pickups and a multi-leg flight are both first-class.

**AI provider comparison (decision 4).** Phase 5 starts with an evaluation harness: the owner supplies 5–10 real ticket and supplier-invoice PDFs; each runs through both adapters with the same zod schema; the report shows per-field accuracy against hand-labelled truth, latency, and cost per document. The default provider is set from that report, per document type if the results differ.

**Storage (decision 5).** `core/storage` uses the S3 API against R2 (`@aws-sdk/client-s3` + presigned URLs). Uploads go browser → R2 via a presigned PUT issued by the API after a permission check (the API never proxies file bytes, so Vercel body-size limits do not apply). Downloads use presigned GET URLs valid for 60 seconds, minted per request after the same check. Bucket is private; object keys are random, never derived from entity ids.

### Job execution on Vercel (decision 6)

Published limits (checked 2026-09-18 on vercel.com/docs):

| | Hobby | Pro |
|---|---|---|
| Cron jobs per project | 100 | 100 |
| Minimum cron interval | once per day | once per minute |
| Cron timing precision | per hour (±59 min) | per minute |
| Function max duration, Fluid compute (default on new projects) | 300 s default and max | 300 s default, 800 s max, 1800 s beta |
| Function max duration, legacy non-Fluid | 10 s default, 60 s max | 15 s default, 300 s max |

Consequence: on Hobby, Vercel Cron cannot drive a minute-level tick. Design therefore:

- The tick endpoint `POST /api/jobs/tick` is **idempotent and safe to call from anywhere**: it requires `Authorization: Bearer $CRON_SECRET`, claims jobs with `SELECT … FOR UPDATE SKIP LOCKED` and a `lockedUntil` lease, runs within a time budget (default 240 s under Fluid, configurable), and returns what it did. Calling it twice, or from two schedulers at once, cannot double-run a job.
- Scheduler: Vercel Cron on Pro (`* * * * *`); on Hobby an external scheduler (cron-job.org, GitHub Actions `schedule`, or Upstash QStash) calls the same endpoint every minute. Switching is a config change, not a code change.
- Long document processing never runs inside one request. The pipeline is a state machine (`UPLOADED → CLASSIFYING → EXTRACTING(page 3/12) → MATCHING → NEEDS_REVIEW`); each tick advances one step and persists a cursor, so a 40-page invoice bundle is many short executions, and a timeout only loses the current step, which is retried with backoff (max 3 attempts, then FAILED with the error shown in the UI). Extraction calls are page-chunked (≤ 5 pages per call), and the per-step budget is set below the platform maximum with a margin.
- Fallback for heavier volume: the same `Job` table can be drained by a resident worker (Fly.io/Railway) running the identical tick loop; no schema or handler changes.

### 2026-09-18 — Phase 3 decisions (continuation prompt)

| # | Decision | Why |
|---|---|---|
| P3-1 | Identity numbers (passport, Aadhaar and other government IDs) are sealed with AES-256-GCM under `DATA_ENCRYPTION_KEY`, indexed by a keyed HMAC, masked as `XXXX-XXXX-1234` everywhere, and revealed only through audited endpoints. Aadhaar is now accepted (it was refused in Phase 2) because hard rule 7 expects it and it is encrypted and masked. | Hard rule 7. Phase 2 stored passports in clear. |
| P3-2 | Passport search is an exact match on the blind index; substring search on identity numbers is gone. | Substring search is impossible on sealed data without leaking it. |
| P3-3 | Production without `DATA_ENCRYPTION_KEY` refuses to store identity numbers (503 NOT_CONFIGURED) instead of storing them in clear. | Rule 9 (never fake) + rule 7. |
| P3-4 | New permissions: `masters:read` (all staff), `masters:write` (BOOKING, OPERATIONS), `rates:write` (BOOKING). Vendor writes stay with `suppliers:write` (OPERATIONS, ADMIN). Hotel rates and activity prices are hidden from roles without commercial access. | BOOKING prices trips; OPERATIONS runs them without seeing margins (Phase 1 policy). |
| P3-5 | Imports accept CSV; Excel is converted to CSV in the browser. The server re-validates the whole file on commit and never trusts the preview. Hotel rate sheets create missing hotels and room types. | One validation path; no binary parsing on the server. |
| P3-6 | One trip, many booking contracts: a pilgrimage tour is one trip and each family party is its own contract (the one-contract-per-trip unique index is dropped). Travellers carry their party and pickup point. | Family-wise parties within one tour (business specifics). |
| P3-7 | The trip stage is the operational truth; contract statuses and the classic trip `status` follow it. A contract can be cancelled on its own; every other contract status change goes through the trip. | One place to move a tour forward; no contradicting statuses. |
| P3-8 | Until per-party receipts exist (Phase 4), contracts on a shared tour report `paymentTracking: TOUR`: the schedule shows amounts and due dates but no paid/overdue status, and no reminders are raised from it. | Rule 9 — a family must never be shown as paid or overdue from tour-level receipts. |
| P3-9 | New display ids skip numbers already used by classic rows (`nextFreeDisplayId`), so the v2 sequence never collides with ids created by the legacy screens. | Classic screens still create CUS/TRP ids with their own counter. |
| P3-10 | Itinerary v2 extends the classic `itineraries` / `itinerary_days` tables (format `CLASSIC` / `V2`) instead of new tables; the classic builder refuses to overwrite or delete a V2 itinerary. | One itinerary per trip, legacy screens keep reading them. |
| P3-11 | The customer copy is built by an explicit allowlist (`toCustomerItinerary`); the print page and WhatsApp text use only that endpoint. Booking-linked items carry generated text that only the booking can change; the office can annotate or hide them. | Rule 8/9 spirit: nothing internal can leak by adding a field; the booking stays the truth. |
| P3-12 | "Mark as shared" is a manual record of which version the customer received. Nothing is sent from the itinerary screen until the WhatsApp Cloud API integration (Phase 7); the text is copied for the person to send. | Rule 9 — never fake message sending. |
| P3-13 | Task rules live in code (`calc/taskRules.ts`, pure and unit-tested); the `task_rules` table stores only each organisation's on/off and timings. Rule tasks are keyed (`organizationId, ruleKey` unique): open ones follow the data and close or reopen themselves; closed-by-a-person ones are never re-created. | Rules need code to read records; timings are the owner's to change. Keys make recalculation idempotent and safe to run on every write. |
| P3-14 | Trip rules recalculate inside the write that changed the trip (trip-change hook); sales rules and time-based rules (e.g. the daily waitlist check) run in the 15-minute `tasks.sweep` job. | Instant feedback where the data changes; no per-write coupling to the sales modules. |
| P3-15 | The old scheduler's passport rule is replaced by the engine's PASSPORT_VALIDITY rule (same trigger, configurable months and window). | One source of passport tasks. |
| P3-16 | Drivers get their own role (DRIVER) with a single permission and a server-side fence in `requireAuth`: a DRIVER session can call only `/api/v2/driver`, `/api/v2/me` and `/api/auth`. A login sees duties only through its linked driver record, and only confirmed ones. | Defence in depth: a legacy route that forgets `requirePermission` still cannot leak office data to a driver's phone. |
| P3-17 | A driver's "Report a problem" creates an urgent SYSTEM task for the trip's ops owner (not a message); completing the last step marks the vehicle duty completed. | The office must act on problems; messaging arrives with Phase 7. |
| P4-1 | The ledger is double-entry from the start: every money movement is a balanced transaction, and balances are always derived from the lines, never stored. Posted entries are immutable; corrections are reversals that keep both entries in the books. | An audit trail the owner's CA can follow, and no "which number is right" between screens. |
| P4-2 | The chart of accounts lives in code (`calc/ledger.ts`) and is seeded into `ledger_accounts` on first use; postings refer to accounts by code. | Services can rely on codes existing; the owner can still rename accounts or add their own later. |
| P4-3 | Other finance modules post through `postEntry(tx, …)` inside their own transaction, so a receipt and its ledger effect are saved together or not at all. | No half-recorded money. |
| P4-4 | A receipt belongs to the family party (booking contract) that paid; money for the whole tour is held against the trip. A party's paid amount, instalment statuses and balance are derived from its own receipts — the Phase 3 `paymentTracking: TOUR` stand-in is retired. | Family-wise accounts within one tour, the business specific that started this. |
| P4-5 | Receipts are never deleted: cancelling marks the row and reverses its ledger posting. Refunds are their own rows and cannot exceed what that party paid. | The money trail has to survive mistakes. |
| P4-6 | Classic payments are imported into receipts once each (`legacyPaymentId`), leaving the classic rows untouched; a method the old screen never recorded posts to "Unsorted receipts" (1030) for someone to classify, rather than being guessed into cash or bank. | Rule 12 (legacy keeps working) and rule 9 (never fake). |
| P4-7 | A supplier bill is what was actually charged and posts the cost; the cost on a hotel/vehicle/activity booking stays an estimate. Profitability (4.5) compares the two rather than one overwriting the other. | Operations plan with estimates; accounts pay bills. Both numbers are worth keeping. |
| P4-8 | A payment with no bill is an advance held in "Advances to suppliers" and is only moved to the supplier's dues when it is applied to a bill. | Advances to hotels and consolidators are normal here, and the money must not look like an expense before the bill exists. |
| P4-9 | Operations record what they spend on the road (`expenses:write`), accounts see everything and settle what staff are owed. Money a staff member put in is a liability ("Staff reimbursements") until it is paid back, not a cash payment. | The people holding the cash are the ones who know what was spent; the books still show who is owed. |
| P4-10 | Tax rates live in `tax_rules` with the day each starts; the catalogue (codes, defaults, what to verify with the CA) lives in `calc/tax.ts`. Code asks for "the rate on this day", so a rate change never needs a deploy and old bills keep their rate. | Hard rule 3: tax is configuration. GST slabs and TCS rules here change often. |
| P4-11 | TCS on overseas packages ships switched off, with its note telling the owner to check with their CA before turning it on. | Charging a tax the business has not decided to charge is worse than not charging it. |
| P4-12 | Money received before an invoice is a liability ("Customer advances"); issuing the invoice moves it against the customer's dues. The advance is never treated as income on its own. | A tour is delivered later; income belongs to the invoice, not the deposit. |
| P4-13 | Invoices, credit notes and debit notes post inside the existing invoice service transaction, so GST numbering, receivables and the books cannot drift apart. Cancelling or deleting reverses the postings rather than editing them. | The GST series is legally fixed; the books must follow it exactly. |
| P4-14 | Money received is applied to invoices already issued before any of it is held as an advance, and the receivables board allocates receipts to the oldest invoice first. | It is what every customer and supplier assumes, and it makes an invoice-by-invoice age possible without anyone allocating payments by hand. |
| P4-15 | Trip profit compares costs actually recorded (bills, spending) with what the bookings planned, and says whether revenue is invoiced or still only booked. A half-billed tour must never look like a loss. | Operations plan; accounts pay. Both numbers matter, and the screen says which is which. |
| P4-16 | The cached money columns on trips are kept rather than dropped as the roadmap first said, because the classic screens still read them. They now have a single writer (`refreshTripMoney`) that follows the receipts, and the v2 screens read the ledger instead. They go when the classic screens do. | Rule 12: legacy data keeps working. A column with one writer and a test is safe; a broken classic screen is not. |
| P4-17 | Overdue money raises a task with the reminder written out on it, and the office copies and sends it. TravelOS sends nothing by itself, and queues nothing to send. | Rule 9: nothing is faked and no message leaves without a person. The draft removes the typing, not the judgement — and until WhatsApp is connected in Phase 6 there is nothing honest to send it through. |
| P5-1 | Everything TravelOS asks a model to do goes through one `AiProvider` interface, and the model id is a setting rather than a constant. A `recorded` provider replays answers a real model already gave, so the test suite never reaches the network and the evaluation harness can re-score a run without paying for it again. | The provider choice is made **after** the Phase 5 harness measures it, not before. Tests that call a live model are slow, costly and flaky, and a test that invents an answer would be exactly the faking rule 9 forbids. |
| P5-2 | The schema a model must answer in is generated from the same zod contract that validates the answer (`calc/jsonSchema.ts`): every field required, `additionalProperties` false, and a field the document does not show answered as `null` rather than left out. | One definition, two uses — a field cannot be asked for in one shape and checked in another. "null" is also how a low-confidence field says "unable to confidently identify" instead of guessing (rule 8). |
| P5-3 | Reading a document is a state machine on the job runner — classify, extract, match — and each step commits before the next begins. The pipeline stops at a proposal; approval is a separate act by a person, recorded as theirs, and it creates the record through the same service a person's own form calls. | Vercel's tick budget means long work must be resumable (P1-4). Going through the ordinary service means an AI-read ticket obeys every rule a typed one does — numbering, audit, trip hooks, the ledger — instead of a second path that could drift. |
| P5-4 | A supplier bill read from a document is refused unless its own amounts add up (before tax + GST = total), and the person is shown the figures to correct. | Money is never adjusted quietly to make a document fit (rule 3). A misread figure must stop at a person, not land in the books. |
| P5-5 | The harness scores a reading as correct, missed, wrong or guessed, and **one guess fails the whole run**. "Missed" is treated as cheap (the review screen asks a person) and "wrong" as expensive. The provider and model are chosen from a run over GK Travels' own documents, not from a general benchmark. | Rule 8 says never guess; a score that averaged a guess away would hide exactly the failure that matters. The documents that matter are IRCTC slips, Indian hotel confirmations and supplier bills in rupees — nobody else's benchmark measures those. |
| P6-1 | The copilot is opened by a new `copilot:use` permission held by every staff role (never a driver), not by `ai:use`. What it can look up is still decided tool by tool by the person's own permissions. | `ai:use` was held only by the owner and sales, and also opens the classic AI message and itinerary generators. Using it would have kept the accounts team — who ask the most money questions — out of the copilot, or handed them the generators too. |
| P6-2 | A copilot write is a **proposal** stored in `ai_actions` (PROPOSED → APPROVED / REJECTED). Approval is a separate act by the person who asked, re-checks their permission for that tool, and creates the record through the same service the screen uses. | Rule 8: the model never writes. Going through the ordinary service keeps numbering, audit and trip hooks identical to a typed change, as P5-3 did for documents. |
| P6-3 | A drafted message is never sent by TravelOS. Approving it records who agreed with the wording and returns a WhatsApp / mail link the person opens and sends themselves. | Rule 9 and the brief: outbound sends are never a copilot tool. Real sending arrives with Phase 7's official Meta Cloud API, behind its own template and log. |
| P6-4 | Insights are counted by plain queries; a model may only re-word them, and its wording is thrown away if it contains any number the facts do not. The plain sentences are always shown. | "The model only phrases them" (architecture H.6) needs an enforceable check, not a request in a prompt. A re-worded total or a rounded figure is exactly the invented number rule 9 forbids. |
| P6-5 | The thin-margin insight judges a trip against the larger of the costs in the books and the costs booked, and ignores trips with no cost recorded. Thresholds (14 days, 30 days, 10%, 90 days) are constants in `calc/insights.ts` until Phase 9 adds per-organisation settings. | Supplier bills often arrive after the trip; waiting for them would warn too late. A trip with no cost yet has no margin to judge, so it is not flagged as 100% profit or as a problem. |
| P7-1 | WhatsApp leaves TravelOS only through the official Meta WhatsApp Cloud API, and only as a template Meta has approved (`metaTemplateName` on the template). Free text is never attempted; without an approved name the screen offers "Open in WhatsApp" instead. | CLAUDE.md infrastructure decision. Outside a conversation the customer started, WhatsApp delivers only approved templates — trying free text would fail silently for the customer and look sent to the office. |
| P7-2 | A send is queued in the request and made by `comms.send` on the job runner; only 429, 5xx and network errors are retried (at most three attempts); a rejected template or number fails at once with Meta's reason. | Vercel request budgets (P1-4) and honesty: a message is "Sent" only when the provider accepted it, and a retry that cannot help is not attempted. |
| P7-3 | Rules that message customers ship switched off; a rule acts only on events after it is switched on, and each event once (unique rule + event key). | P4-17: TravelOS sends nothing by itself until the owner decides. Switching a rule on must never message every past trip at once. |
| P7-4 | The classic scheduler is retired: its three rules are automation rules, the `scheduler.rules` job answers "retired", and anything left in the classic outbox is closed unsent with the reason. The classic manual send route (`/api/messaging`) stays for the classic screen until it is replaced. | One place decides what is sent automatically, visible and switchable. Closing — not sending — the old queue keeps its history readable without messages going out through the old gateway. |
| P7-5 | The agency's phone is used exactly as the office typed it in messages; only customer and driver numbers are normalised. | A landline such as 0831 240 0000 loses its STD code if treated as a mobile. |
| P8-1 | Portal access is a private link: a 256-bit random token of which only the SHA-256 is stored, shown to the office once, lapsing after 1–365 days, revocable, every visit counted. The office may also require a six-digit code sent through a configured channel; the code is stored only as an HMAC, lives 10 minutes, allows five tries and one send a minute, and is masked in the office's log. | A link a customer can open on their phone without an account is what the business needs; a stolen database must not yield working links; the code guards against a forwarded link when the office wants it. A code that cannot be delivered is refused rather than promised. |
| P8-2 | Portal responses are built field by field (`modules/portal/readModel.ts`), never spread from a row; a test scans every response for internal keys and for known cost, margin and note values. | Architecture: "no internal field can reach a portal serialiser". A column added later cannot leak by default. |
| P8-3 | On a group tour with family parties, a customer sees only their own party's travellers, seats, stays and money; the lead customer of a trip without parties sees the whole trip. | Families on one pilgrimage are separate customers; one family's payments and names are not another's business. |
| P8-4 | The driver's name and phone appear only for a confirmed duty, from 48 hours before it starts until it ends; the itinerary appears only as shared (while the office is changing it, the page says so instead of showing a draft). | A driver's number is personal and changes until confirmed; a half-edited itinerary must not reach a customer. |
