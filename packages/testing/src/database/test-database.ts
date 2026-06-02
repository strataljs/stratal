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

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import type pg from 'pg'

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

/**
 * Postgres' identifier length limit. Names longer than this are silently
 * truncated by the server, which would cause distinct logical names to collide
 * on the same physical database. We assert against it everywhere a name is
 * derived.
 */
const MAX_IDENTIFIER_LENGTH = 63

/** Quote a Postgres identifier for safe interpolation into DDL. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Quote a Postgres string literal for safe interpolation into SQL. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Dynamically import `pg` (an optional peer), surfacing an actionable error
 * instead of a raw module-not-found when database isolation is requested
 * without the dependency installed.
 */
async function importPg(): Promise<typeof pg> {
  try {
    const { default: pg } = await import('pg')
    return pg
  } catch (error) {
    throw new Error(
      "[stratal-testing] `pg` is required for database isolation but is not installed. " +
        'Install it: `npm install --save-dev pg` (or `yarn add -D pg`).',
      { cause: error },
    )
  }
}

/**
 * Assert a derived identifier fits within Postgres' {@link MAX_IDENTIFIER_LENGTH}
 * limit. Throws a clear, actionable error instead of letting the server
 * silently truncate and collide names.
 */
function assertIdentifierLength(name: string, kind: string): void {
  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(
      `[stratal-testing] Derived ${kind} "${name}" is ${name.length} characters, ` +
        `exceeding Postgres' ${MAX_IDENTIFIER_LENGTH}-character identifier limit. ` +
        'Use a shorter base database name so the test-isolation suffix fits.',
    )
  }
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

/** Length of the random token appended by {@link deriveDbName}. */
const DB_NAME_TOKEN_LENGTH = 12

/** The shared prefix for per-file databases, used as the leak-sweep key. */
export function databasePrefix(base: string): string {
  const baseName = databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')
  const prefix = `${baseName}_t_`
  // The per-file name is `${prefix}${12-char token}`; assert the full budget so
  // long base names fail loudly here instead of silently truncating + colliding.
  assertIdentifierLength(`${prefix}${'x'.repeat(DB_NAME_TOKEN_LENGTH)}`, 'per-file database name')
  return prefix
}

/** Name of the migrated template database cloned per file. */
export function deriveTemplateName(base: string): string {
  const name = `${databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')}_template`
  assertIdentifierLength(name, 'template database name')
  return name
}

/**
 * Generate a unique per-`compile()` database name. Random (not path-based) so
 * it is collision-free across concurrent isolates and multiple modules in the
 * same file, and stays well within Postgres' 63-char identifier limit.
 */
export function deriveDbName(base: string): string {
  const token = randomUUID().replace(/-/g, '').slice(0, DB_NAME_TOKEN_LENGTH)
  return `${databasePrefix(base)}${token}`
}

async function withAdminClient<T>(adminConn: string, fn: (query: (sql: string) => Promise<unknown>) => Promise<T>): Promise<T> {
  const pg = await importPg()
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
 * Terminate every backend connected to `dbName` except the caller's own. Used
 * to evict lingering sessions on the template database so `CREATE DATABASE ...
 * TEMPLATE` (which requires the source to have no other connections) succeeds.
 */
async function terminateConnections(query: (sql: string) => Promise<unknown>, dbName: string): Promise<void> {
  await query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity ` +
      `WHERE datname = ${quoteLiteral(dbName)} AND pid <> pg_backend_pid()`,
  )
}

/**
 * Clone the template database into `dbName`. `CREATE DATABASE ... TEMPLATE`
 * fails (SQLSTATE 55006) if any session is connected to the template, so we
 * proactively terminate lingering template backends before each attempt and
 * retry with exponential backoff while a concurrent clone briefly locks it.
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
      await withAdminClient(adminConn, async (query) => {
        // Evict any lingering sessions on the template; otherwise the clone
        // below fails with 55006 ("source database is being accessed by other
        // users"). Our own admin connection is excluded by pid.
        await terminateConnections(query, template)
        await query(sql)
      })
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

/**
 * Drop leaked per-file databases matching the prefix while leaving a concurrent
 * process's **live** databases intact.
 *
 * Multiple setups can run at once (CI sharding, several e2e projects). A blanket
 * "drop everything matching the prefix" sweep would delete a sibling process's
 * in-flight per-file databases. So we only drop databases that currently have
 * **no active backend connections** — i.e. true leaks from a crashed prior run.
 * A live per-file database always has the test worker's pool connected, so it is
 * skipped. The `WITH (FORCE)` covers the narrow race where a connection appears
 * between the check and the drop.
 */
async function sweepStaleDatabases(adminConn: string, prefix: string): Promise<void> {
  // Escape both the SQL-string quote and the LIKE metacharacters (`\`, `%`, `_`)
  // so a prefix containing `_` (a single-char wildcard) can't over-match and drop
  // an unrelated database. `\` is the explicit ESCAPE character below.
  const likePrefix = prefix
    .replace(/'/g, "''")
    .replace(/[\\%_]/g, (c) => `\\${c}`)
  await withAdminClient(adminConn, async (query) => {
    const { rows } = (await query(
      `SELECT d.datname FROM pg_database d ` +
        `WHERE d.datname LIKE '${likePrefix}%' ESCAPE '\\' ` +
        `AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)`,
    )) as { rows: { datname: string }[] }
    for (const { datname } of rows) {
      await query(`DROP DATABASE IF EXISTS ${quoteIdent(datname)} WITH (FORCE)`)
    }
  })
}

/**
 * Run `fn` while holding a session-level Postgres advisory lock keyed to
 * `lockKey`, serializing template setup across concurrent processes (CI
 * sharding, multiple e2e projects) so they don't drop/recreate the template out
 * from under each other. The lock is released in `finally`.
 */
async function withAdvisoryLock<T>(adminConn: string, lockKey: string, fn: () => Promise<T>): Promise<T> {
  return withAdminClient(adminConn, async (query) => {
    await query(`SELECT pg_advisory_lock(hashtext(${quoteLiteral(lockKey)}))`)
    try {
      return await fn()
    } finally {
      await query(`SELECT pg_advisory_unlock(hashtext(${quoteLiteral(lockKey)}))`)
    }
  })
}

/** Schema source file extensions hashed into the template fingerprint. */
const SCHEMA_FILE_RE = /\.(zmodel|prisma|sql)$/

/** Matches ZModel `import "..."` / `import '...'` statements. */
const ZMODEL_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]/gm

/**
 * Follow a ZModel file's `import` graph, collecting the root plus every
 * transitively imported `.zmodel` file — ZenStack supports multi-file schemas,
 * so editing an imported file must invalidate the fingerprint. Import paths
 * resolve relative to the importing file; the `.zmodel` extension is optional.
 * A missing import target is skipped (migration surfaces the real error).
 */
function collectZmodelImports(file: string, seen: Set<string>): void {
  if (seen.has(file)) return
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return // missing import target — not part of the fingerprint
  }
  seen.add(file)
  for (const [, importPath] of content.matchAll(ZMODEL_IMPORT_RE)) {
    const target = resolve(dirname(file), importPath)
    collectZmodelImports(target.endsWith('.zmodel') ? target : `${target}.zmodel`, seen)
  }
}

/**
 * Expand a schema path into the concrete files to hash. A directory contributes
 * every schema file in its tree; a single `.zmodel` file contributes its whole
 * `import` graph; any other file contributes itself.
 */
function collectSchemaFiles(path: string): string[] {
  if (statSync(path).isDirectory()) {
    const out: string[] = []
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) out.push(...collectSchemaFiles(full))
      else if (SCHEMA_FILE_RE.test(entry.name)) out.push(full)
    }
    return out
  }
  if (path.endsWith('.zmodel')) {
    const seen = new Set<string>()
    collectZmodelImports(path, seen)
    return [...seen]
  }
  return [path]
}

/**
 * A content-derived fingerprint of the schema source(s) plus the migrate
 * routine. The template is reused across runs while this is unchanged; any edit
 * to a schema file — or to how migration runs — changes it and forces a rebuild.
 * Uses file basenames (not absolute paths) so it is stable across checkouts.
 */
function computeSchemaFingerprint(
  schema: string | string[],
  migrate: TestDatabaseGlobalSetupOptions['migrate'],
): string {
  const roots = Array.isArray(schema) ? schema : [schema]
  const files = roots.flatMap(collectSchemaFiles).sort()
  if (files.length === 0) {
    throw new Error(
      `[stratal-testing] No schema files found for fingerprinting under: ${roots.join(', ')}`,
    )
  }
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(basename(file))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  hash.update(migrate.toString())
  return hash.digest('hex')
}

/**
 * Read the template database's stored schema fingerprint (kept as the database
 * COMMENT). Returns `null` when the template does not exist or carries no
 * fingerprint. Database comments are NOT copied by `CREATE DATABASE ...
 * TEMPLATE`, so per-file clones never inherit it.
 */
async function readTemplateFingerprint(
  query: (sql: string) => Promise<unknown>,
  template: string,
): Promise<string | null> {
  const { rows } = (await query(
    `SELECT shobj_description(oid, 'pg_database') AS fingerprint ` +
      `FROM pg_database WHERE datname = ${quoteLiteral(template)}`,
  )) as { rows: { fingerprint: string | null }[] }
  return rows.length === 0 ? null : rows[0].fingerprint
}

/** Options for {@link createTestDatabaseGlobalSetup}. */
export interface TestDatabaseGlobalSetupOptions {
  /**
   * Run migrations against the given connection string. In `'database'` mode
   * the string points at the template database; in `'shared'` mode at the base
   * database. Framework consumers typically run `zenstack db push` here.
   */
  migrate: (connectionString: string) => void | Promise<void>
  /**
   * Schema source(s) — a file or directory path, or a list of them. Their
   * contents (plus the `migrate` routine) are hashed into a fingerprint; the
   * template is reused across runs while the fingerprint is unchanged and
   * rebuilt + re-migrated when it changes, so only the first run after a schema
   * edit pays the migration cost. **Required** for `'database'` isolation.
   *
   * For a ZenStack multi-file schema, pass the **root `.zmodel`** — its `import`
   * graph is followed, so editing any imported file invalidates the fingerprint.
   * A directory path hashes every `.zmodel`/`.prisma`/`.sql` file in its tree.
   */
  schema?: string | string[]
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
 * - `'database'`: under a Postgres advisory lock (so concurrent setups across
 *   CI shards / multiple e2e projects don't clobber each other), sweeps leaked
 *   per-file databases, then ensures a migrated template exists — ready to be
 *   cloned per test file.
 *
 * **Template reuse.** The template is fingerprinted from the `schema` source(s)
 * + the `migrate` routine and the fingerprint is stored as the template's
 * database COMMENT. On each run, a matching fingerprint means the schema is
 * unchanged and the existing template is reused as-is — `migrate` runs **only**
 * on the first run after a schema edit (or on a fresh database). The fingerprint
 * is stamped only after a successful migrate, so a match always implies a
 * complete template; there is no force/skip flag — reuse is purely fingerprint-
 * driven.
 *
 * **Concurrency model.** The reuse check + rebuild runs under
 * `pg_advisory_lock(hashtext(<template>))`, so only one process rebuilds the
 * template at a time. The stale-database sweep only drops per-file databases
 * with **no active connections**, leaving a sibling process's live databases
 * intact. Teardown deliberately does **not** sweep or drop the template: a
 * concurrent process may still be using both, and the next run's setup sweep is
 * the backstop for any leak.
 *
 * @example
 * ```ts
 * // test/global-setup.ts
 * import { createTestDatabaseGlobalSetup } from '@stratal/testing/database'
 *
 * export default createTestDatabaseGlobalSetup({
 *   schema: schemaPath, // file or directory — reused-when-unchanged fingerprint
 *   migrate: (conn) => execFileSync(zenstackBin, ['db', 'push', '--force-reset', `--schema=${schemaPath}`, '--accept-data-loss'],
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

    if (!opts.schema) {
      throw new Error(
        '[stratal-testing] `schema` is required for database isolation. Pass the schema ' +
          'file(s) or directory so the migrated template can be reused across runs when ' +
          'unchanged (and rebuilt when it changes).',
      )
    }

    const adminConn = deriveAdminConnectionString(base)
    const template = opts.templateName ?? deriveTemplateName(base)
    const prefix = databasePrefix(base)
    const fingerprint = computeSchemaFingerprint(opts.schema, opts.migrate)

    // Serialize template rebuild across concurrent setups so they don't drop or
    // migrate the template out from under each other.
    await withAdvisoryLock(adminConn, template, async () => {
      await sweepStaleDatabases(adminConn, prefix)

      // Reuse the existing template when its stored fingerprint matches — the
      // schema is unchanged, so the migrated template is ready to clone. Only a
      // fingerprint mismatch (or a missing template) pays the migration cost.
      const current = await withAdminClient(adminConn, (query) =>
        readTemplateFingerprint(query, template),
      )
      if (current === fingerprint) return

      await withAdminClient(adminConn, async (query) => {
        await query(`DROP DATABASE IF EXISTS ${quoteIdent(template)} WITH (FORCE)`)
        await query(`CREATE DATABASE ${quoteIdent(template)}`)
      })
      await opts.migrate(buildConnectionString(base, template))
      // Stamp the fingerprint only after a successful migrate, so a matching
      // fingerprint always implies a complete, ready template. Database COMMENTs
      // are not copied by CREATE DATABASE ... TEMPLATE, so clones stay clean.
      await withAdminClient(adminConn, (query) =>
        query(`COMMENT ON DATABASE ${quoteIdent(template)} IS ${quoteLiteral(fingerprint)}`),
      )
    })

    // No teardown hook: anything destructive here (sweeping per-file databases
    // or dropping the template) could clobber a concurrent process that is still
    // running. The next run's setup sweep (connection-guarded) reclaims leaks.
  }
}
