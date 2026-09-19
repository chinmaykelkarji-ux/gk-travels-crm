# Runbook — bringing production onto the TravelOS branch

Audience: the owner, at the moment the branch is ready to merge into `main`.
Nothing in this runbook is executed by the build or by the application. Every step is manual and ordered; the order matters.

## 0. Why a runbook exists

Production's schema was built with `prisma db push` and had drifted (docs/travelos/01-audit.md C.6). The 14 hand-written migration folders could not even replay on an empty database (one renamed a column an earlier one never created), so this branch **squashes them into a single generated baseline**, `prisma/migrations/20260918000000_baseline`, which the test suite proves reproduces `schema.prisma` exactly from scratch (`tests/integration/migrations.test.ts`).

Production already has every table, so it must not run the baseline; it must be **marked** as having it. That is what steps 2–3 do. Until then, `prisma migrate deploy` fails against production and `prisma db push` would drop 21 columns, so production must be baselined **before** this branch's code is deployed.

## 1. Snapshot (Neon console)

1. Neon → project → Branches → **Create branch** from `main` (production) named `pre-travelos-<date>`. This is the rollback point; it is instant and free.
2. Recommended: also create `staging-travelos` from `main`, point a Vercel preview environment at it, and rehearse steps 2–5 there first.

## 2. Catch production up to the schema (Neon SQL editor)

Open `docs/travelos/sql/production-catchup-2026-09-18.sql`, paste it into the SQL editor, run it once. It adds the four customer identity columns, 22 indexes and the `customer_ledger_balances` view. Every statement is `IF NOT EXISTS` / `CREATE OR REPLACE`; nothing is dropped; re-running it is harmless. The 21 voucher pricing columns production already has are now declared in the schema, so they are left exactly as they are.

## 3. Baseline the migration history (Neon SQL editor, then terminal)

Production's `_prisma_migrations` table holds one row for a folder that no longer exists. Replace it with the baseline:

```sql
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260608170000_activity_approval_communication';
```

Then, from a machine with the repository checked out at the merge commit and `DATABASE_URL` pointing at production:

```bash
npx prisma migrate resolve --applied 20260918000000_baseline
```

`migrate resolve --applied` only inserts a row into `_prisma_migrations`; it runs no SQL against your tables.

## 4. Verify (must be clean before going further)

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Expected output: `-- This is an empty migration.` If anything else appears, stop and compare with `prisma/introspected/production-2026-09-18.prisma` (the read-only snapshot taken before this branch changed anything).

```bash
npx prisma migrate deploy
```

Expected: `No pending migrations to apply.`

## 5. Deploy

Merge the branch to `main`. Vercel builds with the server typecheck now included. From this point on, every future schema change ships as a folder in `prisma/migrations/` and is applied with `npx prisma migrate deploy` **run by you, against production, before merging the code that needs it**. The build deliberately does not run `migrate deploy` itself so that preview deployments can never migrate production.

## 6. Post-deploy checks

- Log in as each role once; OPERATIONS should see no supplier cost or margin, ACCOUNTS should see invoices.
- Open Settings → Users: the five seeded accounts are deactivated; `chinmaykelkara@gmail.com` needs a new password if it is still wanted.
- Regenerate `JWT_SECRET` in Vercel (this signs everyone out once): the previous example value and the old fallback string were in git history.

## 7. Rollback

Neon → Branches → restore `main` from `pre-travelos-<date>`; redeploy the previous `main` commit in Vercel. The pre-branch code does not reference any column this branch adds, so restoring only the code (without the database) is also safe.

## Appendix A — settings added in Phase 3 (set before the first deploy of the branch)

- `DATA_ENCRYPTION_KEY` (Vercel → Settings → Environment Variables, Production): 64 hex characters, generated once and stored in your password manager. Without it the API refuses to save passport / Aadhaar / ID numbers. Losing it makes the stored numbers unreadable. Generate in PowerShell: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- After deploy, the `identity.encrypt-legacy` job (runs every 15 minutes through `/api/jobs/tick`) seals passport numbers that production stored in clear and blanks the clear-text column. Check it finished: Settings → activity shows "Encrypted identity numbers held in clear". The `pre-travelos-<date>` Neon snapshot still contains those numbers in clear; delete it once you are happy with the cutover.
- Classic bookings (flight / train / bus / hotel / cab / activity) are copied into the new tickets and trip records by the migration and then hourly by `legacy.bookings-import`; the classic rows are not changed.
- The task engine's `tasks.sweep` job (every 15 minutes) raises tasks for every open trip on its first run: expect a batch in **Today** (web check-in, Tatkal, waitlist, chart, hotel / vehicle / activity confirmations, balance, passport, visa, follow-ups). Open passport alerts from the old scheduler are closed by the migration with the reason "Replaced by the task engine" and raised again by the engine. Check the timings in **Today → Rules** (admin) before the first sweep if your airline or IRCTC timings differ from the defaults.
