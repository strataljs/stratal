import type pg from 'pg'

/** Options controlling which tables a per-test reset truncates. */
export interface ResetOptions {
  /** Extra schemas to include beyond `current_schema()` (e.g. a tenant schema). */
  schemas?: string[]
  /**
   * Bare table names or SQL LIKE patterns (matched against `tablename` across
   * all target schemas) that must survive the reset — reference/seed data baked
   * into the template. Not schema-qualified: a `schema.table` entry matches a
   * table literally named `schema.table`, not `table` in `schema`. Migration
   * bookkeeping (`_prisma%`) is always preserved.
   */
  preserve?: string[]
}

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

/**
 * Build a single `TRUNCATE ... RESTART IDENTITY CASCADE` (empty when no tables).
 * Takes `{ schema, table }` pairs and quotes each part independently, so a
 * dotted identifier (a legal quoted name, e.g. `"my.table"`) is preserved
 * verbatim rather than mis-split into extra qualifier segments.
 */
export function buildTruncateSql(tables: { schema: string; table: string }[]): string {
  if (tables.length === 0) return ''
  const quoted = tables.map((t) => `${quoteIdent(t.schema)}.${quoteIdent(t.table)}`)
  return `TRUNCATE ${quoted.join(', ')} RESTART IDENTITY CASCADE`
}

/**
 * Sentinel meaning "the active search-path schema" (`current_schema()`). A
 * Symbol so it can never collide with a real schema name — a schema literally
 * named `current` is passed through as the string literal `'current'`.
 */
const CURRENT_SCHEMA = Symbol('current_schema')

/**
 * Build the SQL that discovers truncatable tables: every base table in the
 * given schemas ({@link CURRENT_SCHEMA} → `current_schema()`), excluding
 * migration bookkeeping (`_prisma%`) and any caller-supplied preserve patterns.
 * Returns a SELECT of `schemaname, tablename`. Escaping lives here so both reset
 * paths share one implementation.
 */
export function buildTableDiscoverySql(schemas: string[], preserve: string[]): string {
  const schemaFilter = [CURRENT_SCHEMA, ...schemas]
    .map((s) => (typeof s === 'symbol' ? 'current_schema()' : `'${s.replace(/'/g, "''")}'`))
    .join(', ')
  const notLike = ['_prisma%', ...preserve]
    .map((p) => `tablename NOT LIKE '${p.replace(/'/g, "''")}'`)
    .join(' AND ')
  return `SELECT schemaname::text AS schemaname, tablename::text AS tablename FROM pg_tables WHERE schemaname IN (${schemaFilter}) AND ${notLike}`
}

async function importPg(): Promise<typeof pg> {
  const { default: mod } = await import('pg')
  return mod
}

/**
 * Reset a worker database between tests: discover every non-preserved table in
 * the target schemas and truncate them in one statement. Fast because the
 * schema/DDL is baked into the worker DB — reset only clears mutable rows and
 * resets identities. Opens and closes a short-lived direct `pg` connection.
 */
export async function resetWorkerDatabase(connectionString: string, opts: ResetOptions = {}): Promise<void> {
  const pgMod = await importPg()
  const client = new pgMod.Client({ connectionString })
  await client.connect()
  try {
    const sql = buildTableDiscoverySql(opts.schemas ?? [], opts.preserve ?? [])
    const { rows } = await client.query<{ schemaname: string; tablename: string }>(sql)
    const tables = rows.map((r) => ({ schema: r.schemaname, table: r.tablename }))
    const truncateSql = buildTruncateSql(tables)
    if (truncateSql) await client.query(truncateSql)
  } finally {
    await client.end()
  }
}
