# TravelOS — continuation master prompt (after Phase 9)

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

Branch: `claude/admiring-edison-ibfdfg` (a fast-forward of `claude/travelos-phase-3-41f57b`).
Nothing merges to `main`. Remote: `chinmaykelkarji-ux/gk-travels-crm`.

All nine phases are built (see `PROGRESS.md`). Phases 4 and 5 were tested by
the owner; **Phases 6–9 wait for the owner's manual test** — the owner said
"continue all" after Phase 6, so the checkpoints were reported together.

## What the last session left in place (reuse it)

- Copilot (`modules/copilot`), proposals, insights (`modules/insights`, thresholds per organisation).
- Messaging: templates (`modules/templates`), channels (`server/src/comms`, Meta Cloud API + SMTP,
  `COMMS_TRANSPORT=memory` in tests), sends through `modules/comms/service.ts` on the job runner,
  the delivery webhook, notifications, automation rules (`modules/automation`).
- Customer portal (`modules/portal`, `server/src/routes/portal.ts`, `src/portal/`): strict read models.
- Reports (`modules/analytics`), custom roles and API keys as principals (`core/principals.ts`),
  organisation settings and onboarding (`modules/organization`).

## What is next (only when the owner asks)

- Fix whatever the owner's manual tests of Phases 6–9 find.
- Deferred on purpose (decision P9-5): removing the `organizationId` column defaults; moving the
  classic screens' role guards to permissions; the shared supplier network (P9-4, H.9).
- The classic `/api/messaging` send route still uses the retired BSP gateway; retire it with the
  classic messaging screen.

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
