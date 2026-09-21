# TravelOS — GK Travels operating system

Travel ERP for **GK Travels, Belagavi (Karnataka)**, being evolved from the legacy CRM into "TravelOS" in nine phases.
Read this file first in every session. The detailed contract documents are in `docs/travelos/`:
`01-audit.md` (what existed), `02-target-architecture.md` (where we are going), `03-migration-and-roadmap.md`
(phases + **decision log** at the end), `PROGRESS.md` (module-by-module status — the source of truth for what is done),
`RUNBOOK-production-cutover.md` (the owner's manual cutover steps).

## Hard rules (never break)

1. **Never commit to or merge into `main`. Never touch the production Neon database.** Production cutover is done only by the owner, via the runbook. Do not run `db push`, `migrate deploy`, `migrate resolve`, seeds or scripts against the `DATABASE_URL` in the main checkout's `.env`.
2. **Schema changes = Prisma migrations only**, generated and tested on the local Docker Postgres (port 5434). Never `prisma migrate dev` / `db push` against Neon. `tests/integration/migrations.test.ts` replays the whole chain on an empty database and asserts zero drift.
3. **Money**: `Decimal` in the database, integer paise for arithmetic (`src/shared/calc/money.ts`), never float maths on money. Financial year April–March. Tax rules (GST, TCS) are configuration, never hard-coded; anything uncertain is labelled **"verify with CA"** in settings.
4. **Tenancy, permissions, audit**: `organizationId` on every table (add new models to `TENANT_MODELS` in `server/src/core/tenant.ts`). Every route enforces permissions server-side (`requirePermission`). Every important mutation writes an audit row via `core/audit.ts` (actor, source HUMAN/AI/SYSTEM, before/after).
5. **Tests green before a module is marked done.** Commit after every module with a clear message. Every calculation, state transition and permission rule gets a test.
6. **No secrets in code or git.** `eval-docs/` (gitignored) holds real client PDFs: never commit, log or print their contents.
7. **Aadhaar / passport / government-ID data**: encrypted at rest (`core/crypto.ts`, AES-256-GCM, key `DATA_ENCRYPTION_KEY`), masked on display (`XXXX-XXXX-1234`), every reveal audited. Files live in the private R2 bucket: presigned PUT upload, 60-second presigned GET, random keys, never a public URL.
8. **AI never writes directly**: extract → validate → compare → propose → human approve → save → audit. Low-confidence fields say "Unable to confidently identify"; never guess.
9. **Never fake anything**: no fake analytics, AI output, integrations, payments or message sending. Unconfigured integrations show "Not configured".
10. **Business logic lives in shared services** (`server/src/modules/*`, pure maths in `src/shared/calc/*`), never in UI components. No giant files. Reuse before adding.
11. The owner's machine is **Windows**: give PowerShell commands.
12. **Keep legacy data working.** Data migrations are reversible or snapshot-protected and covered by a test. Legacy screens stay reachable ("Classic" links / `/legacy/*`) until the new module fully replaces them.

## Business specifics (design for these, not generic tours)

- Flight, train and bus ticketing. Trains: IRCTC, Tatkal, waitlist/RAC, chart preparation, coach/berth. One PNR can cover a whole group; every segment has its own boarding and dropping points.
- Large pilgrimage group tours: 40+ passengers, multiple pickup points (e.g. Karad, Sangli, Miraj, Belagavi).
- Family-wise parties: separate advances, balances, receipts and account statements per family **within one tour** (one trip, many booking contracts — one per party).
- Vendors: DMCs, air consolidators, hotels, cab owners, activity providers. Vendor portal wallets with top-ups. Refund tracking with escalation.
- Client documents in the GK Travels brand (**navy and gold**). Messages are polite and respectful ("Ji", "Shri").
- Small, owner-operated team. Every feature must remove real manual work.

## Infrastructure decisions (already made)

- **Vercel Hobby.** An external scheduler calls the secret-protected, idempotent `POST /api/jobs/tick` every minute (`CRON_SECRET`). Long work is a resumable state machine that advances one step per tick; a timeout retries only the current step.
- **Storage**: Cloudflare R2 (private), as in rule 7. Local dev/tests use a `.storage/` disk provider behind HMAC-signed URLs.
- **AI** behind a provider interface. Claude for extraction and copilot, Gemini for prose; final choice after the Phase 5 eval harness.
- **WhatsApp** only via the official Meta Cloud API. **Payments** via Razorpay links when configured.

## Stack and conventions

- SPA: React 18 + Vite + TypeScript + Tailwind in `src/`. Server: Express 5 + Prisma 5 in `server/src/`, deployed as one Vercel function (`api/index.ts`). Postgres (Neon in production).
- v2 feature folders: `src/features/<module>/{api.ts,hooks.ts,components/,pages/}`; design-system primitives in `src/design-system/`; typed client `src/lib/api.ts` (TanStack Query in hooks).
- Server modules: `server/src/modules/<module>/service.ts` + routes `server/src/routes/v2/<module>.ts` (routes only parse, authorise, call one service function).
- zod contracts in `src/shared/contracts/` are shared by SPA and API (`queryBool` for query flags). Pure, dependency-free maths in `src/shared/calc/` with unit tests. Server imports from `src/shared/**` use relative paths with `.js` specifiers.
- Display ids via `server/src/core/numbering.ts` (`nextDisplayId`). Errors via `core/errors.ts` (`AppError` envelope). Validation via `core/validate.ts`. Tenant-scoped Prisma client from `server/src/lib/prisma.ts`.
- Permissions: `server/src/lib/permissions.ts` and `src/shared/hooks/usePermissions.ts` must stay identical (unit test enforces it). Commercial fields (cost, margin) are redacted for roles without `finance:read`/`trips:write` (`server/src/lib/redact.ts`).
- Express 5 gotcha: `req.params.x` is `string | string[]` — always `String(req.params.id)`.
- Legacy (Gen 1) screens still read the Zustand store hydrated by `GET /api/data/all`; v2 pages carry their own `PageHeader` (`V2_PREFIXES` in `src/shared/components/Header.tsx`).

## Commands (PowerShell)

```powershell
npm ci                                   # once per worktree (a junction to another node_modules breaks prisma generate)
docker start travelos-pg                 # local Postgres on port 5434 (Docker Desktop must be running)
npm run typecheck; npm run typecheck:server
npm run test:unit
$env:TEST_DATABASE_URL = "postgresql://travelos:travelos@localhost:5434/travelos_test"; npm run test:integration
```

New migration (never `db push` on a real database):

```powershell
$dev = "postgresql://travelos:travelos@localhost:5434/travelos_dev"
$env:DATABASE_URL = $dev; npx prisma migrate deploy          # bring travelos_dev to the current chain head
npx prisma migrate diff --from-url $dev --to-schema-datamodel prisma/schema.prisma --script | Out-File -Encoding utf8 prisma/migrations/<timestamp>_<name>/migration.sql
# review / hand-append backfills, then: npx prisma migrate deploy (on travelos_dev) → npx prisma generate → tests
```

The integration suite refuses any non-local host and any database name without `test` (`tests/integration/helpers/guard.ts`).

## Status

- Branch for Phase 3 onward: `claude/travelos-phase-3-41f57b` (fast-forward of `claude/travelos-operating-system-581b62`, which holds Phases 0–2 up to `25d07f7b`). Nothing merges to `main`.
- **Phase 0** audit ☑ · **Phase 1** platform core ☑ · **Phase 2** core CRM + sales ☑ (see `docs/travelos/PROGRESS.md`).
- **Phase 3 — travel operations ☑** (3.0 identity protection · 3.1 masters + import · 3.2 hotel/vehicle/activity records · 3.3 tickets + classic import · 3.4 trip control centre · 3.5 itinerary v2 · 3.6 task engine · 3.7 driver view). Module detail in `docs/travelos/PROGRESS.md`.
- **Phase 4 — finance: in progress** (4.0 ledger ☑ · 4.1 customer receipts ☑ · 4.2 supplier bills ☑ · 4.3 expenses ☑ · 4.4 tax rates ☑). Module detail in `docs/travelos/PROGRESS.md`. The owner tested Phase 3 and said continue on 2026-09-20.
- Phases 4–9: not started. The owner tests manually at the end of each checkpoint.
- Task engine and driver view facts worth knowing: trip writes call `tripChanged()` (hooks: readiness, tasks); rule timings live in `task_rules`; a DRIVER session is fenced in `middleware/auth.ts`.
