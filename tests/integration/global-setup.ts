// vitest globalSetup: runs once per `vitest run`. When TEST_DATABASE_URL points
// at a throwaway database, sync the Prisma schema into it from scratch so the
// integration suites start from a known state. Never runs against anything
// that is not clearly a local/CI test database.
import { execSync } from 'node:child_process';
import { assertTestDatabase } from './helpers/guard';

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log('[integration] TEST_DATABASE_URL not set — integration suites will be skipped');
    return;
  }
  assertTestDatabase(url);

  // `db push --force-reset` is acceptable ONLY here: the target is a disposable
  // database that the guard above has verified. The application never uses it.
  execSync('npx prisma db push --force-reset --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  // The tenant row every scoped table defaults to (created by the tenancy
  // migration in real databases; db push creates no rows).
  execSync(`npx prisma db execute --url "${url}" --stdin`, {
    input: `INSERT INTO "organizations" ("id","slug","name","updatedAt") VALUES ('org_gktravels','org_gktravels','GK Travels',NOW()) ON CONFLICT ("id") DO NOTHING;`,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, DATABASE_URL: url },
  });
}
