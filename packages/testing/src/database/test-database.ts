/**
 * Test database isolation helpers.
 *
 * Implements database-per-worker isolation for parallel e2e runs against
 * Postgres. A migrated **template** database is built once in global setup;
 * each worker clones it once into a per-worker database that is reused (and
 * reset between tests, not dropped per file). See `@stratal/testing/database`.
 *
 * `pg` is imported dynamically so this module loads without it — consumers
 * that don't use a database never pay the dependency.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import type pg from 'pg'

/** Env var carrying the name of the Hyperdrive binding to isolate. */
export const BINDING_ENV_VAR = 'STRATAL_TEST_DB_BINDING'

/** Default Hyperdrive binding name when none is configured. */
export const DEFAULT_DB_BINDING = 'DB'

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

/** The shared prefix for per-file databases, used as the leak-sweep key. */
export function databasePrefix(base: string): string {
  const baseName = databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')
  return `${baseName}_f_`
}

/** Name of the migrated template database cloned per worker. */
export function deriveTemplateName(base: string): string {
  const name = `${databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')}_template`
  assertIdentifierLength(name, 'template database name')
  return name
}

/**
 * Name of the database owned by a single test FILE, keyed by a per-file `token`.
 * Each test file clones the template into its OWN database — no two files ever
 * share one — because `@cloudflare/vitest-pool-workers` isolates per file and can
 * run a worker's files concurrently; per-file databases make cross-file
 * contamination impossible by construction. Asserted against Postgres' 63-char
 * identifier limit (keep the base name short so `_f_<token>` fits).
 */
export function deriveFileDbName(base: string, token: string): string {
  const baseName = databaseNameOf(base).replace(/[^a-z0-9_]/gi, '_')
  const name = `${baseName}_f_${token}`
  assertIdentifierLength(name, 'per-file database name')
  return name
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

/** True when the error is Postgres' "duplicate database" (concurrent create). */
function isDuplicateDatabase(error: unknown): boolean {
  return (error as { code?: string })?.code === '42P04'
}

/**
 * True for SQLSTATE 55006 ("source database is being accessed by other users") —
 * what `CREATE DATABASE ... TEMPLATE t` raises while another session is using the
 * template (e.g. a concurrent clone of the same template).
 */
function isTemplateInUse(error: unknown): boolean {
  return (error as { code?: string })?.code === '55006'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** True when a database with `dbName` already exists. */
async function databaseExists(
  query: (sql: string) => Promise<unknown>,
  dbName: string,
): Promise<boolean> {
  const { rows } = (await query(
    `SELECT 1 AS one FROM pg_database WHERE datname = ${quoteLiteral(dbName)}`,
  )) as { rows: unknown[] }
  return rows.length > 0
}

/**
 * Ensure worker database `dbName` exists, cloned from `template`. Idempotent and
 * lock-frugal: it first checks `pg_database`, so the common "already exists" path
 * (every file after a slot's first) never issues `CREATE DATABASE ... TEMPLATE`
 * and never takes the clone lock.
 *
 * The clone is serialized across all workers and processes by one Postgres
 * advisory lock keyed on the template. Postgres permits only one
 * `CREATE DATABASE ... TEMPLATE t` at a time — a concurrent one fails with
 * SQLSTATE 55006. On a fresh run every worker's first compile races to clone the
 * same template, so without this they'd all fire `CREATE ... TEMPLATE` at once
 * and all but one would fail their first file. The lock funnels them one-at-a-
 * time, each blocking *in Postgres* (not busy-waiting) until its turn. A create
 * that still hits a transient 55006 is retried with backoff; one that loses the
 * race for the same name (SQLSTATE 42P04) is treated as success.
 */
export async function ensureWorkerDatabase(
  adminConn: string,
  dbName: string,
  template: string,
): Promise<void> {
  await withAdminClient(adminConn, async (query) => {
    if (await databaseExists(query, dbName)) return

    const lockKey = quoteLiteral(`stratal:worker-db-clone:${template}`)
    await query(`SELECT pg_advisory_lock(hashtext(${lockKey}))`)
    try {
      // A sibling worker may have cloned it while we waited for the lock.
      if (await databaseExists(query, dbName)) return
      const create = `CREATE DATABASE ${quoteIdent(dbName)} TEMPLATE ${quoteIdent(template)}`
      for (let attempt = 1; ; attempt++) {
        try {
          await query(create)
          return
        } catch (error) {
          if (isDuplicateDatabase(error)) return
          if (isTemplateInUse(error) && attempt < 5) {
            await sleep(250 * attempt)
            continue
          }
          throw error
        }
      }
    } finally {
      await query(`SELECT pg_advisory_unlock(hashtext(${lockKey}))`)
    }
  })
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
 * A content-derived fingerprint of the schema source(s) plus the migrate and
 * prepare routines. The template is reused across runs while this is
 * unchanged; any edit to a schema file — or to how migration/preparation run
 * — changes it and forces a rebuild. Uses file basenames (not absolute paths)
 * so it is stable across checkouts.
 *
 * @internal exported for fingerprint unit tests
 */
export function computeSchemaFingerprint(
  schema: string | string[],
  migrate: TestDatabaseGlobalSetupOptions['migrate'],
  prepare?: TestDatabaseGlobalSetupOptions['prepare'],
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
  hash.update('\0')
  hash.update(prepare ? prepare.toString() : '')
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
  /** Run migrations against the template connection string. */
  migrate: (connectionString: string) => void | Promise<void>
  /**
   * Schema source(s) — file or directory path(s). Contents + `migrate` + `prepare`
   * are hashed into the template fingerprint; the template is reused across runs
   * while unchanged. For a ZenStack multi-file schema pass the root `.zmodel`.
   */
  schema: string | string[]
  /**
   * One-time preparation run against the template **after** migrations (before
   * the fingerprint is stamped). Bake expensive baseline state here — seed data,
   * a default tenant schema, reference rows — so every worker database inherits
   * it via the clone instead of rebuilding it per test.
   *
   * The fingerprint hashes this hook's **source text only** — if `prepare` reads
   * external data files (seed JSON/SQL) at runtime, changing only those files
   * will NOT invalidate the template. Bump the hook's source (e.g. a version
   * comment) or drop the template manually when seed data changes.
   */
  prepare?: (connectionString: string) => void | Promise<void>
  /** Base/admin connection string. Defaults to `process.env.DATABASE_URL`. */
  connectionString?: string
  /** Template database name. Defaults to `<baseDbName>_template`. */
  templateName?: string
}

/**
 * Build a Vitest `globalSetup` default export that prepares the test database.
 *
 * Under a Postgres advisory lock (so concurrent setups across CI shards /
 * multiple e2e projects don't clobber each other), sweeps leaked per-worker
 * databases, then ensures a migrated (and optionally prepared) template exists
 * — ready to be cloned per worker.
 *
 * **Template reuse.** The template is fingerprinted from the `schema` source(s)
 * + the `migrate` routine + the `prepare` routine, and the fingerprint is
 * stored as the template's database COMMENT. On each run, a matching
 * fingerprint means nothing has changed and the existing template is reused
 * as-is — `migrate`/`prepare` run **only** on the first run after an edit (or on
 * a fresh database). The fingerprint is stamped only after a successful
 * migrate + prepare, so a match always implies a complete template; there is no
 * force/skip flag — reuse is purely fingerprint-driven.
 *
 * **Concurrency model.** The reuse check + rebuild runs under
 * `pg_advisory_lock(hashtext(<template>))`, so only one process rebuilds the
 * template at a time. The stale-database sweep only drops per-worker databases
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
): () => Promise<void> {
  return async () => {
    const base = opts.connectionString ?? process.env.DATABASE_URL
    if (!base) {
      throw new Error(
        '[stratal-testing] No connection string for test database setup. Set process.env.DATABASE_URL or pass `connectionString`.',
      )
    }

    const adminConn = deriveAdminConnectionString(base)
    const template = opts.templateName ?? deriveTemplateName(base)
    const prefix = databasePrefix(base)
    const fingerprint = computeSchemaFingerprint(opts.schema, opts.migrate, opts.prepare)

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
      const templateConn = buildConnectionString(base, template)
      await opts.migrate(templateConn)
      if (opts.prepare) await opts.prepare(templateConn)
      // Stamp the fingerprint only after a successful migrate + prepare, so a
      // matching fingerprint always implies a complete, ready template. Database
      // COMMENTs are not copied by CREATE DATABASE ... TEMPLATE, so clones stay
      // clean.
      await withAdminClient(adminConn, (query) =>
        query(`COMMENT ON DATABASE ${quoteIdent(template)} IS ${quoteLiteral(fingerprint)}`),
      )
    })

    // No teardown hook: anything destructive here (sweeping per-worker databases
    // or dropping the template) could clobber a concurrent process that is still
    // running. The next run's setup sweep (connection-guarded) reclaims leaks.
  }
}
