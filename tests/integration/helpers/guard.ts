// Refuses any database URL that does not look like a disposable test database.
// Deliberately strict: the production Neon database must be impossible to hit
// from the test suite even by misconfiguration.
export function assertTestDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('[integration] TEST_DATABASE_URL is not a valid URL');
  }

  const host   = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();

  const localHost = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host);
  const testName  = /(^|_)(test|tests|ci)($|_)/.test(dbName) || dbName.endsWith('_test');

  if (host.endsWith('neon.tech') && process.env.ALLOW_NEON_BRANCH_TESTS !== 'yes') {
    throw new Error(
      '[integration] Refusing to run tests against a Neon host. If this is a dedicated Neon *branch* ' +
      'created for tests, set ALLOW_NEON_BRANCH_TESTS=yes and make sure the database name ends in _test.',
    );
  }
  if (!localHost && process.env.ALLOW_REMOTE_TEST_DB !== 'yes' && process.env.ALLOW_NEON_BRANCH_TESTS !== 'yes') {
    throw new Error(`[integration] Refusing non-local test database host "${host}" (set ALLOW_REMOTE_TEST_DB=yes to override)`);
  }
  if (!testName) {
    throw new Error(`[integration] Test database name must contain "test" (got "${dbName}")`);
  }
}
