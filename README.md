# TravelOS (GK Travels)

The operating system for a travel company: CRM, sales, trip operations, finance and GST, documents with AI extraction, communication and automation — built for one real agency first, designed to become a platform.

It started life as the GK Travels Operations CRM. The transformation plan, audit, target architecture and progress live in [`docs/travelos/`](docs/travelos/):

- [`01-audit.md`](docs/travelos/01-audit.md) — what existed, what was wrong, what was missing
- [`02-target-architecture.md`](docs/travelos/02-target-architecture.md) — target architecture, data model, module map
- [`03-migration-and-roadmap.md`](docs/travelos/03-migration-and-roadmap.md) — migration strategy, phases, risks, testing, decision log
- [`PROGRESS.md`](docs/travelos/PROGRESS.md) — module-by-module status
- [`RUNBOOK-production-cutover.md`](docs/travelos/RUNBOOK-production-cutover.md) — how production is brought onto the new migration baseline

## Stack

| Layer | Technology |
|---|---|
| SPA | React 18, Vite 5, TypeScript (strict), Tailwind, Radix primitives, TanStack Query, Zustand (legacy modules) |
| API | Express 5 on Node 22, Prisma 5, zod validation, one error envelope, request context (request id, actor, organisation) |
| Database | PostgreSQL (Neon in production), `prisma migrate` with a generated baseline |
| Background work | Durable `jobs` table drained by `POST /api/jobs/tick` (Vercel Cron, an external scheduler, or the local dev loop) |
| Files | Private S3-compatible bucket (Cloudflare R2) behind short-lived presigned URLs; local disk in development |
| Auth | Email + bcrypt, JWT in an HttpOnly cookie naming a revocable server-side session, role-based permissions enforced server-side |
| AI | Provider interface; Gemini for prose today, Claude/Gemini evaluated for document extraction (Phase 5) |
| Hosting | Vercel (static SPA + one serverless function) |

## Running locally

```bash
cp .env.example .env         # fill DATABASE_URL, JWT_SECRET (32+ chars), CRON_SECRET
npm install                  # also runs prisma generate
npm run dev                  # Vite on :3000, API on :3001 (proxied under /api)
```

The first admin comes from `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASS` (bootstrapped on API start) or `npm run seed:users` with `SEED_USER_PASSWORD` set. No script carries a default password.

## Checks

```bash
npm run typecheck && npm run typecheck:server   # SPA and API, both must be clean
npm run test:unit                                # pure logic, no database
TEST_DATABASE_URL=postgresql://travelos:travelos@localhost:5434/travelos_test npm run test:integration
npm run build
```

Integration tests need a throwaway Postgres (`docker run -d --name travelos-pg -e POSTGRES_PASSWORD=travelos -e POSTGRES_USER=travelos -e POSTGRES_DB=travelos_test -p 5434:5432 postgres:16-alpine`). The suite refuses any database whose host is not local or whose name lacks `test`. CI runs the same commands (`.github/workflows/ci.yml`).

## Schema changes

Never `prisma db push`. Edit `prisma/schema.prisma`, generate a migration from a diff against a scratch database that has the current chain deployed, review the SQL, and keep `tests/integration/migrations.test.ts` green. Production is migrated by the owner with `prisma migrate deploy` before the code that needs it is merged (see the runbook).

## Layout

```
server/src/core/        request context, errors, validation, audit, tenant scoping, sessions, jobs, storage, security
server/src/routes/      API routers (v1 legacy modules; v2/ server-authoritative modules)
server/src/services/    finance and invoicing engines
server/src/jobs/        job handlers (scheduler rules, outbox dispatch)
src/shared/utils/       pure business calculations shared with the server (finance, GST)
src/modules/            SPA feature screens (legacy Zustand-driven modules being replaced module by module)
prisma/                 schema, migrations (generated baseline + increments), read-only production snapshot
tests/unit, tests/integration
docs/travelos/          audit, architecture, roadmap, progress, runbook
```
