/**
 * Test database isolation helpers.
 *
 * Implements database-per-test-file isolation for parallel e2e runs against
 * Postgres. A migrated **template** database is built once in global setup;
 * each test file clones it instantly via `CREATE DATABASE ... TEMPLATE` and
 * drops it on teardown. See `@stratal/testing/database`.
 *
 * `pg` is imported dynamically so this module loads without it — consumers
 * that don't use a database never pay the dependency.
 */

import { randomUUID } from 'node:crypto'

/** Postgres isolation mode for tests. */
export type DatabaseIsolation = 'shared' | 'database'

/** Env var that selects the isolation mode (single source of truth). */
export const ISOLATION_ENV_VAR = 'STRATAL_TEST_DB_ISOLATION'

/** Env var carrying the name of the Hyperdrive binding to isolate. */
export const BINDING_ENV_VAR = 'STRATAL_TEST_DB_BINDING'

/** Default Hyperdrive binding name when none is configured. */
export const DEFAULT_DB_BINDING = 'DB'

/**
 * Normalize an isolation value (from an option or env var) to a mode.
 * Anything other than the literal `'database'` resolves to `'shared'` — the
 * default — so parallel isolation is strictly opt-in.
 */
export function normalizeIsolation(value: string | undefined): DatabaseIsolation {
  return value === 'database' ? 'database' : 'shared'
}

/** Quote a Postgres identifier for safe interpolation into DDL. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Parse the database name out of a Postgres connection URL. */
function databaseNameOf(connectionString: string): string {
  const name = new URL(connectionString).pathname.replace(/^\//, '')
  return name || 'postgres'
}

/**
 * Derive an admin connection string pointing at the `postgres` maintenance
 * database. `CREATE`/`DROP DATABASE` cannot run on a connection bound to the
 * target database, so administration always goes through `postgres`.
 */
export function deriveAdminConnectionString(connectionString: string): string {
  const url = new URL(connectionString)
  url.pathname = '/postgres'
  return url.toString()
}

/** Build a connection string identical to `base` but pointing at `dbName`. */
export function buildConnectionString(base: string, dbName: string): string {
  const url = new URL(base)
  url.pathname = `/${dbName}`
  return url.toString()
}

/** The shared prefix for per-file databases, used as the leak-sweep key. */
export function databasePrefix(base: string): string {
  const baseName = databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')
  return `${baseName}_t_`
}

/** Name of the migrated template database cloned per file. */
export function deriveTemplateName(base: string): string {
  return `${databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')}_template`
}

/**
 * Generate a unique per-`compile()` database name. Random (not path-based) so
 * it is collision-free across concurrent isolates and multiple modules in the
 * same file, and stays well within Postgres' 63-char identifier limit.
 */
export function deriveDbName(base: string): string {
  const token = randomUUID().replace(/-/g, '').slice(0, 12)
  return `${databasePrefix(base)}${token}`
}

async function withAdminClient<T>(adminConn: string, fn: (query: (sql: string) => Promise<unknown>) => Promise<T>): Promise<T> {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: adminConn })
  await client.connect()
  try {
    return await fn((sql) => client.query(sql))
  } finally {
    await client.end()
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** True for transient errors worth retrying a `CREATE DATABASE ... TEMPLATE`. */
function isTemplateBusy(error: unknown): boolean {
  const e = error as { code?: string; message?: string }
  return e?.code === '55006' || /is being accessed by other users/i.test(e?.message ?? '')
}

/**
 * Clone the template database into `dbName`. Retries with exponential backoff
 * while the template is briefly locked by a concurrent clone (SQLSTATE 55006).
 */
export async function createDatabaseFromTemplate(
  adminConn: string,
  dbName: string,
  template: string,
  attempts = 10,
): Promise<void> {
  const sql = `CREATE DATABASE ${quoteIdent(dbName)} TEMPLATE ${quoteIdent(template)}`
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await withAdminClient(adminConn, (query) => query(sql))
      return
    } catch (error) {
      if (!isTemplateBusy(error) || attempt === attempts - 1) throw error
      const jitter = parseInt(randomUUID().slice(0, 2), 16)
      await sleep(Math.min(50 * 2 ** attempt, 2000) + jitter)
    }
  }
}

/** Drop a database, terminating any lingering connections. */
export async function dropDatabase(adminConn: string, dbName: string): Promise<void> {
  await withAdminClient(adminConn, (query) => query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE)`))
}

/** Drop every per-file database matching the prefix (recovers leaks). */
async function sweepStaleDatabases(adminConn: string, prefix: string): Promise<void> {
  await withAdminClient(adminConn, async (query) => {
    const { rows } = (await query(
      `SELECT datname FROM pg_database WHERE datname LIKE '${prefix.replace(/'/g, "''")}%'`,
    )) as { rows: { datname: string }[] }
    for (const { datname } of rows) {
      await query(`DROP DATABASE IF EXISTS ${quoteIdent(datname)} WITH (FORCE)`)
    }
  })
}

/** Options for {@link createTestDatabaseGlobalSetup}. */
export interface TestDatabaseGlobalSetupOptions {
  /**
   * Run migrations against the given connection string. In `'database'` mode
   * the string points at the template database; in `'shared'` mode at the base
   * database. Framework consumers typically run `zenstack db push` here.
   */
  migrate: (connectionString: string) => void | Promise<void>
  /** Isolation mode. Defaults to {@link ISOLATION_ENV_VAR} or `'shared'`. */
  isolation?: DatabaseIsolation
  /** Base/admin connection string. Defaults to `process.env.DATABASE_URL`. */
  connectionString?: string
  /** Template database name. Defaults to `<baseDbName>_template`. */
  templateName?: string
}

/**
 * Build a Vitest `globalSetup` default export that prepares the test database.
 *
 * - `'shared'` (default): migrates the base database in place (no isolation).
 * - `'database'`: sweeps stale per-file databases, (re)creates an empty
 *   template, then migrates the template — ready to be cloned per test file.
 *
 * @example
 * ```ts
 * // test/global-setup.ts
 * import { createTestDatabaseGlobalSetup } from '@stratal/testing/database'
 *
 * export default createTestDatabaseGlobalSetup({
 *   migrate: (conn) => execFileSync(zenstackBin, ['db', 'push', '--force-reset', `--schema=${schema}`, '--accept-data-loss'],
 *     { env: { ...process.env, DATABASE_URL: conn }, stdio: 'inherit' }),
 * })
 * ```
 */
export function createTestDatabaseGlobalSetup(
  opts: TestDatabaseGlobalSetupOptions,
): () => Promise<void | (() => Promise<void>)> {
  return async () => {
    const base = opts.connectionString ?? process.env.DATABASE_URL
    if (!base) {
      throw new Error(
        '[stratal-testing] No connection string for test database setup. Set process.env.DATABASE_URL or pass `connectionString`.',
      )
    }

    const isolation = normalizeIsolation(opts.isolation ?? process.env[ISOLATION_ENV_VAR])
    if (isolation === 'shared') {
      await opts.migrate(base)
      return
    }

    const adminConn = deriveAdminConnectionString(base)
    const template = opts.templateName ?? deriveTemplateName(base)

    await sweepStaleDatabases(adminConn, databasePrefix(base))
    await withAdminClient(adminConn, async (query) => {
      await query(`DROP DATABASE IF EXISTS ${quoteIdent(template)} WITH (FORCE)`)
      await query(`CREATE DATABASE ${quoteIdent(template)}`)
    })

    await opts.migrate(buildConnectionString(base, template))

    return async () => {
      await sweepStaleDatabases(adminConn, databasePrefix(base))
      await dropDatabase(adminConn, template)
    }
  }
}
