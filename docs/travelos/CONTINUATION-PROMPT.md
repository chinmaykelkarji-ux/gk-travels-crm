# TravelOS — continuation master prompt (Phase 6 → 9)

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

Branch: `claude/travelos-phase-3-41f57b` (nothing merges to `main`).
Remote: `chinmaykelkarji-ux/gk-travels-crm`.

| Phase | State |
|---|---|
| 0 audit, 1 platform core, 2 CRM + sales | ☑ |
| 3 travel operations (identity, masters, hotel/vehicle/activity, tickets, trip control centre, itinerary, task engine, driver view) | ☑ |
| 4 finance (ledger, receipts per family party, supplier bills, expenses, tax rates as data, invoices in the books, receivables + trip profit, Money page, late money raises tasks) | ☑ `fe057ff5` |
| 5 document intelligence (AI provider interface, document centre, reading documents into proposals, evaluation harness) | ☑ `48a641cb` |
| 6 copilot | **groundwork only** — `778853a5` |
| 7 comms + automation, 8 customer portal, 9 analytics + platform | not started |

Phase 4 and Phase 5 were both tested by the owner at their checkpoints.

## Where Phase 6 stopped

Committed groundwork (`778853a5`), typechecks clean, 238 unit tests green,
migration chain replays with no drift:

- **`AiProvider.chat()`** (`server/src/ai/types.ts`) — one step of a conversation
  the caller drives: the model either answers or asks for a tool. The loop, the
  permissions and the audit trail stay in `modules/copilot`, never in the adapter.
  - `claude.ts` maps turns to `tool_use` / `tool_result` blocks, `strict: true` on
    every tool, and refuses to pretend when `stop_reason` is `refusal`.
  - `gemini.ts` says plainly it cannot (wording only).
  - `recorded.ts` replays a whole exchange step by step (`chatKey()` hashes the
    conversation so far), so tests never reach the network.
- **`server/src/modules/copilot/tools.ts`** — eleven read tools, each declaring
  the permission it needs: `search_trips`, `get_trip`, `search_customers`,
  `get_customer`, `get_open_tasks`, `get_money_summary`, `get_receivables`,
  `get_trip_profit`, `get_supplier_dues`, `find_documents`,
  `get_documents_to_check`. `toolsFor(role)` / `toolSpecs(role)` hand the model
  only the tools that person already has, so the copilot can never fetch what
  they could not open themselves.
- **`ai_sessions` and `ai_actions`** tables + migration
  `20260926000000_copilot_sessions` (additive, reverse SQL in its header),
  registered in `TENANT_MODELS`.

**Not built yet: everything that makes it usable.**

## What to do next

### 6.0 (finish it) — the loop, the route, the tests

- `server/src/modules/copilot/service.ts`
  - `ask({ message, sessionId })` running **as the user**: load or create an
    `AiSession` (store the conversation in `turns`), then loop at most ~6 steps:
    `provider.chat({ task: 'copilot', instructions, turns, tools: toolSpecs(role) })`
    → for each tool call, look it up, **check the permission again**, validate the
    input with its zod schema, run it, write an `AiAction` row (tool, input,
    output, ok, latency), append the assistant turn and the tool turns → repeat
    until the model answers or the step limit is hit.
  - System prompt rules: answer only from tool results; if a tool returns
    nothing, say so; never invent a number; rupees; today's date in IST; say
    plainly when something is not theirs to see; short, plain answers.
  - `notConfigured('The copilot (AI)')` when no provider — never a fake answer.
- `server/src/routes/v2/copilot.ts` — `POST /ask` (`ai:use`), `GET /sessions`,
  `GET /sessions/:id`; mount in `server/src/app.ts`.
- Tests: unit for `toolsFor`/`toolSpecs` (a SALES/BOOKING role is not offered
  finance tools; schemas are strict). Integration with `AI_PROVIDER=recorded`:
  ask two or three real owner questions end to end, assert the answer, assert an
  `AiAction` row per tool call, and assert **a role without `finance:read` cannot
  get finance through the copilot** (the Phase 6 exit criterion).

### 6.1 — the chat surface

A panel in the shell (`src/features/copilot/`), TanStack Query hooks, showing
what it looked at ("read: receivables, trip GK-2026-0007") under each answer, the
session list, and "Not configured" when it is off. Responsive at 375 px.

### 6.2 — write tools with confirmation

`create_task`, `draft_message`, `create_followup`, `propose_trip_update`. Each
returns a **proposal**; the person presses the button; the record is created
through the ordinary service, and `AiAction.approvedById/approvedAt` records who
agreed. Money, invoices, cancellations and outbound sends are **never** tools.

### 6.3 — insights feed

`GET /api/v2/insights` computed by deterministic queries (never the model):
trips departing soon with something unconfirmed, money overdue past 30 days,
waitlisted tickets, thin margins, passports lapsing. The model may only phrase
them, and the plain text must read well on its own. Show it on the dashboard.

Then **stop at the Phase 6 checkpoint** with a testing checklist.

### After Phase 6

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
  settings and numbering, organisation onboarding, API keys, supplier network
  groundwork.

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
