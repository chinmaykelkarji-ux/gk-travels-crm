# TravelOS — continuation master prompt (Phase 7 → 9)

Paste this whole file into a new session to carry the work on. It is written to be
self-contained: what TravelOS is, what is already built, exactly where the work
stopped, and what to do next.

---

## Who this is for

You are continuing **TravelOS**, the operating system for **GK Travels, Belagavi
(Karnataka)** — a small, owner-operated travel agency. The legacy CRM is being
evolved into TravelOS in nine phases. The owner (Chinmay) tests each phase by
hand before the next one starts.

Read `CLAUDE.md` first, then `docs/travelos/PROGRESS.md` (the source of truth for
what is done), `docs/travelos/03-migration-and-roadmap.md` (phases + the decision
log at the end), `docs/travelos/02-target-architecture.md` (H.6 is the copilot),
and `docs/travelos/RUNBOOK-production-cutover.md` (the owner's manual steps).

## Hard rules (never break)

1. **Never commit to or merge into `main`. Never touch the production Neon
   database.** Cutover is the owner's, via the runbook. No `db push`,
   `migrate deploy`, `migrate resolve`, seeds or scripts against the main
   checkout's `DATABASE_URL`.
2. **Schema changes = Prisma migrations only**, generated against the local
   Docker Postgres on port 5434. `tests/integration/migrations.test.ts` replays
   the whole chain on an empty database and asserts zero drift.
3. **Money**: `Decimal` in the database, integer paise for arithmetic
   (`src/shared/calc/money.ts`), never float maths. Financial year April–March.
   GST/TCS are configuration, never hard-coded; anything uncertain is labelled
   **"verify with CA"**.
4. **Tenancy, permissions, audit**: `organizationId` on every table (register new
   models in `TENANT_MODELS`, `server/src/core/tenant.ts`); every route calls
   `requirePermission`; every important mutation writes an audit row through
   `core/audit.ts` (actor, source HUMAN/AI/SYSTEM, before/after).
5. **Tests green before a module is marked done**, and a commit **and push** per
   module. Every calculation, state transition and permission rule gets a test.
6. **No secrets in code or git.** `eval-docs/` (gitignored) holds the owner's real
   client PDFs: never commit, log or print their contents.
7. **Aadhaar / passport / government-ID data**: encrypted at rest
   (`core/crypto.ts`), masked on display, every reveal audited; files in the
   private R2 bucket behind short-lived presigned URLs.
8. **AI never writes directly**: extract → validate → compare → propose → human
   approve → save → audit. Low confidence says "unable to confidently identify";
   never guess.
9. **Never fake anything** — no fake analytics, AI output, integrations, payments
   or message sending. Unconfigured integrations show "Not configured".
10. **Business logic lives in shared services** (`server/src/modules/*`, pure
    maths in `src/shared/calc/*`), never in UI components. Reuse before adding.
11. The owner's machine is **Windows**: give PowerShell commands.
12. **Keep legacy data working.** Data migrations are reversible or
    snapshot-protected and covered by a test; classic screens stay reachable.

## How to work

Module by module, in this order every time: understand the business need →
behaviour → data model → backend service → validation → frontend → integrate →
tests → responsive check at 375 px → audit → **commit and push** → update
`docs/travelos/PROGRESS.md` (and the decision log when a choice was made).
Stop at each **phase checkpoint** and hand the owner a short testing checklist in
plain English. Do not start the next phase until they say so.

Write in the owner's language, not the machine's: "Money in", "What customers
owe", "Documents to check". Messages to customers are polite and respectful
("Namaste … Ji", "Shri").

## Branch and state

Branch: `claude/admiring-edison-ibfdfg` — a fast-forward of `claude/travelos-phase-3-41f57b`
(which stops at the Phase 6 groundwork, `1a6b6822`). Nothing merges to `main`.
Remote: `chinmaykelkarji-ux/gk-travels-crm`.

| Phase | State |
|---|---|
| 0 audit, 1 platform core, 2 CRM + sales | ☑ |
| 3 travel operations (identity, masters, hotel/vehicle/activity, tickets, trip control centre, itinerary, task engine, driver view) | ☑ |
| 4 finance (ledger, receipts per family party, supplier bills, expenses, tax rates as data, invoices in the books, receivables + trip profit, Money page, late money raises tasks) | ☑ `fe057ff5` |
| 5 document intelligence (AI provider interface, document centre, reading documents into proposals, evaluation harness) | ☑ `48a641cb` |
| 6 copilot and insights (ask loop, Ask TravelOS screen, proposals a person approves, Needs attention) | ☑ at its checkpoint — see `PROGRESS.md` |
| 7 comms + automation, 8 customer portal, 9 analytics + platform | not started |

Phases 4 and 5 were tested by the owner. **Phase 6 waits for the owner's manual
test**; do not start Phase 7 until they say continue.

## What Phase 6 left in place (reuse it)

- `modules/copilot/service.ts` — `ask()` runs up to six model steps; every tool
  call is looked up, its permission re-checked for the asker, validated, run and
  written to `ai_actions`. `copilot:use` opens it (all staff, never a driver).
- `modules/copilot/tools.ts` (twelve reads) and `writeTools.ts` (four proposals:
  `create_task`, `create_followup`, `draft_message`, `propose_trip_update`, each
  with `apply` that calls the ordinary service). `proposals.ts` approves/rejects —
  only the asker, once, permission re-checked, audited.
- `draft_message` never sends: approving returns a WhatsApp / mail link
  (`src/shared/calc/messageLinks.ts`). **Phase 7 is where real sending lands** —
  through the job runner and the official Meta Cloud API, logged per record.
- `modules/insights/service.ts` + `src/shared/calc/insights.ts` — deterministic
  insights; `phrase()` drops a model's wording if it adds any number
  (`numbersAddedBy`). Phase 7 automation can raise the same facts as events.
- Tests script a recorded exchange by running the same tools: `script()` in
  `tests/integration/copilot.v2.test.ts`.

## What to do next (after the owner says continue)

- **Phase 7 — communication and automation**: templates, provider configuration
  UI with honest status, one communications log per record, in-app
  notifications, WhatsApp/email through the job runner (official Meta Cloud API
  only), automation rules with run history; the existing scheduler rules become
  visible `AutomationRule` rows.
- **Phase 8 — customer portal**: token/OTP access to their own trip, itinerary,
  tickets, stays, transport, driver, payments and documents marked
  customer-visible. Strict read models — no internal field can reach a portal
  serialiser.
- **Phase 9 — analytics and platform**: sales/operations/finance/customer
  analytics on read models, RBAC tables and custom roles, per-organisation
  settings and numbering (the insight thresholds in `calc/insights.ts` move
  there), organisation onboarding, API keys, supplier network groundwork.

## Environment facts that save time

```powershell
npm ci                          # once per worktree (a junction to another node_modules breaks prisma generate)
docker start travelos-pg        # local Postgres on 5434; Docker Desktop must be running
npm run typecheck; npm run typecheck:server
npm run test:unit
$env:TEST_DATABASE_URL = "postgresql://travelos:travelos@127.0.0.1:5434/travelos_test"; npm run test:integration
```

- If Prisma says `P1001` while the container is up, use `127.0.0.1` instead of
  `localhost` (Docker's IPv6 listener goes stale). Docker Desktop stops on a
  machine restart — relaunch it and `docker start travelos-pg`.
- New migration: `migrate deploy` on `travelos_dev` → `migrate diff --from-url` →
  hand-add the header comment with reverse SQL → `migrate deploy` → confirm the
  drift check is empty → `prisma generate` → tests.
- Run the suites in the **background** and read the log when notified; never
  block on sleep loops and never kill ports (the owner rejected both).
- The integration suite refuses any non-local host and any database name without
  `test` (`tests/integration/helpers/guard.ts`).
- Reading documents needs `ANTHROPIC_API_KEY`; the evaluation harness
  (`npm run eval:extraction`) needs the owner's PDFs plus a
  `<name>.expected.json` beside each one in `eval-docs/`.
- When generating code through a script, avoid writing `\n` escapes inside the
  generated source: the tool pipeline turns them into real newlines and breaks
  the file. Use a different separator or build the string in parts.
