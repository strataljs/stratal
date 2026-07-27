import type { ConnectionName, DatabaseService } from '@stratal/framework/database'
import { connectionSymbol } from '@stratal/framework/database'
import type { Application, Constructor, StratalEnv, StratalExecutionContext } from 'stratal'
import { DI_TOKENS, type Container } from 'stratal/di'
import type { ResolvedEmailMessage } from 'stratal/email'
import { type InjectionToken } from 'stratal/module'
import { SEEDER_TOKENS, SeederError, type Seeder, type SeederRegistry } from 'stratal/seeder'
import { STORAGE_TOKENS } from 'stratal/storage'
import { expect } from 'vitest'
import { buildTableDiscoverySql, buildTruncateSql, type ResetOptions } from '../database'
import { FEATURE_FLAG_SERVICE_TOKEN, type FakeFeatureFlagService } from '../feature-flags'
import type { FakeStorageService } from '../storage'
import { TestSetupError } from '../errors'
import type { TestEmailProvider } from '../mocks/test-email-provider'
import type { TestWorkerExports } from '../mocks/test-worker-exports'
import type { TestWorkersCache } from '../mocks/test-workers-cache'
import { TestHttpClient } from './http/test-http-client'
import { TestCommandRequest } from './quarry/test-command-request'
import { TestSseRequest } from './sse/test-sse-request'
import { TestWsRequest } from './ws/test-ws-request'

/**
 * TestingModule
 *
 * Provides access to the test application, container, HTTP client, and utilities.
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   modules: [RegistrationModule],
 * }).compile()
 *
 * // Make HTTP requests
 * const response = await module.http
 *   .post('/api/v1/register')
 *   .withBody({ ... })
 *   .send()
 *
 * // Access services
 * const service = module.get(REGISTRATION_TOKENS.RegistrationService)
 *
 * // Database utilities
 * await module.truncateDb()
 * await module.seed(UserSeeder)
 * await module.assertDatabaseHas('user', { email: 'test@example.com' })
 *
 * // Cleanup
 * await module.close()
 * ```
 */
export class TestingModule {
  private _http: TestHttpClient | null = null
  private readonly _requestContainer: Container

  constructor(
    private readonly app: Application,
    private readonly env: StratalEnv,
    private readonly ctx: StratalExecutionContext,
    private readonly testEmailProvider: TestEmailProvider | null = null,
    private readonly pendingTasks: Promise<unknown>[] = [],
    private readonly testWorkersCache: TestWorkersCache | undefined = undefined,
    private readonly testWorkerExports: TestWorkerExports | undefined = undefined,
  ) {
    const mockContext = this.app.createMockRouterContext()
    this._requestContainer = this.app.container.createRequestScope(mockContext)
  }

  /**
   * Emails recorded by the default {@link TestEmailProvider}, in send order.
   * Empty when the email provider factory was overridden.
   */
  get sentEmails(): ResolvedEmailMessage[] {
    return this.testEmailProvider?.sent ?? []
  }

  /**
   * Resolve a service from the container
   */
  get<T>(token: InjectionToken<T>): T {
    return this._requestContainer.resolve(token)
  }

  /**
   * Get HTTP test client for making requests
   */
  get http(): TestHttpClient {
    this._http ??= new TestHttpClient(this)
    return this._http
  }


  /**
   * Get Inertia test client for making Inertia requests
   */
  get inertia(): TestHttpClient {
    return this.http.withHeaders({ 'X-Inertia': 'true', 'X-Inertia-Version': '1' })
  }

  /**
   * Get fake storage service for assertions
   */
  get storage(): FakeStorageService {
    return this.get<FakeStorageService>(STORAGE_TOKENS.StorageService)
  }

  /**
   * Get the fake feature-flag service to configure flags in tests
   * (e.g. `module.featureFlags.set('my-flag', true)`).
   */
  get featureFlags(): FakeFeatureFlagService {
    return this.get<FakeFeatureFlagService>(FEATURE_FLAG_SERVICE_TOKEN)
  }

  /**
   * The default `ctx.cache` stub — present unless this module was compiled
   * with `cache: false`. Assert `@PurgesCache` routes purged what they should
   * via `module.cache.purges`, in call order.
   *
   * @throws {TestSetupError} This module was compiled with `cache: false`,
   *   so there is no stub to inspect.
   */
  get cache(): TestWorkersCache {
    if (!this.testWorkersCache) {
      throw new TestSetupError(
        'module.cache is unavailable because this module was compiled with `cache: false`. ' +
          'Remove that option to use the default ctx.cache stub.',
      )
    }
    return this.testWorkersCache
  }

  /**
   * The default `ctx.exports` stub — present unless this module was compiled
   * with `cache: false`.
   *
   * Assert which requests the response-cache gateway forwarded to the cached
   * entrypoint, and with which resolved partitions, via
   * `module.gateway.loopbacks` — in call order, mirroring
   * `module.cache.purges`. An empty `loopbacks` is the assertion for every
   * fail-closed case: an unresolved partition, a non-GET, or a `@Cacheable`
   * route with no `partitionBy` all run inline and never appear here.
   *
   * @throws {TestSetupError} This module was compiled with `cache: false`,
   *   so there is no stub to inspect.
   */
  get gateway(): TestWorkerExports {
    if (!this.testWorkerExports) {
      throw new TestSetupError(
        'module.gateway is unavailable because this module was compiled with `cache: false`. ' +
          'Remove that option to use the default ctx.exports stub.',
      )
    }
    return this.testWorkerExports
  }

  /**
   * Create a WebSocket test request builder for the given path
   */
  ws(path: string): TestWsRequest {
    return new TestWsRequest(path, this)
  }

  /**
   * Create an SSE test request builder for the given path
   */
  sse(path: string): TestSseRequest {
    return new TestSseRequest(path, this)
  }

  /**
   * Create a Quarry command test request builder
   */
  quarry(name: string): TestCommandRequest {
    return new TestCommandRequest(name, this)
  }

  /**
   * Get Application instance
   */
  get application(): Application {
    return this.app
  }

  /**
   * Get DI Container (request-scoped)
   */
  get container(): Container {
    return this._requestContainer
  }

  /**
   * Execute an HTTP request through HonoApp
   */
  async fetch(request: Request): Promise<Response> {
    const hono = await this.app.ensureHono()
    const response = await hono.fetch(request, this.env, this.ctx as ExecutionContext)
    // The Workers runtime keeps a request alive until its `ctx.waitUntil` promises settle. Mirror that
    // here: await the work THIS request deferred (e.g. a non-blocking event listener's DB write
    // dispatched via waitUntil) before returning. Otherwise it stays in flight past the response and
    // can still be running against a shared resource (e.g. a connection pool) at the next request or at
    // `close()`, where disposing that resource could hang.
    await this.flushDeferredWork()
    return response
  }

  /**
   * Drain background work the most recent request(s) deferred via `ctx.waitUntil`, including any
   * follow-up tasks those tasks enqueue. Settles each (errors are surfaced by the work itself, not
   * here) so deferred side-effects don't outlive the request that triggered them.
   */
  private async flushDeferredWork(): Promise<void> {
    while (this.pendingTasks.length > 0) {
      const batch = this.pendingTasks.splice(0)
      await Promise.allSettled(batch)
    }
  }

  /**
   * Run callback in request scope (for DB operations, service access)
   */
  async runInRequestScope<T>(callback: (container: Container) => T | Promise<T>): Promise<T> {
    const mockContext = this.app.createMockRouterContext()
    return this.app.container.runInRequestScope(mockContext, callback)
  }

  /**
   * Get database service instance (resolved in request scope)
   */
  getDb(): DatabaseService
  getDb<K extends ConnectionName>(name: K): DatabaseService<K>
  getDb(name?: string): unknown {
    const token = name ? connectionSymbol(name) : DI_TOKENS.Database
    return this._requestContainer.resolve(token)
  }

  /**
   * Truncate mutable tables in the connection's schema(s), honoring a preserve-list.
   * Migration bookkeeping (`_prisma%`) is always preserved.
   */
  async truncateDb(name?: ConnectionName, opts: ResetOptions = {}): Promise<void> {
    const db = this.getDb(name!)
    const rows = await db.$queryRawUnsafe<{ schemaname: string; tablename: string }[]>(
      buildTableDiscoverySql(opts.schemas ?? [], opts.preserve ?? []),
    )
    const sql = buildTruncateSql(rows.map((t) => ({ schema: t.schemaname, table: t.tablename })))
    if (sql) await db.$executeRawUnsafe(sql)
  }

  /**
   * Run seeders by class constructor in the request-scoped container
   */
  async seed(...SeederClasses: Constructor<Seeder>[]): Promise<void> {
    const registry = this._requestContainer.resolve<SeederRegistry>(SEEDER_TOKENS.SeederRegistry)
    for (const SeederClass of SeederClasses) {
      if (!registry.has(SeederClass)) {
        throw new SeederError(`Seeder "${SeederClass.name}" is not registered`)
      }
      await registry.run(SeederClass, { container: this._requestContainer })
    }
  }

  /**
   * Assert that a record exists in the database
   */
  async assertDatabaseHas(table: string, data: Record<string, unknown>, name?: ConnectionName): Promise<void> {
    const db = this.getDb(name!)
    const model = (db as unknown as Record<string, unknown>)[table] as { findFirst: (opts: unknown) => Promise<unknown> }
    const result = await model.findFirst({ where: data })
    expect(result, `Expected ${table} with ${JSON.stringify(data)}`).not.toBeNull()
  }

  /**
   * Assert that a record does not exist in the database
   */
  async assertDatabaseMissing(table: string, data: Record<string, unknown>, name?: ConnectionName): Promise<void> {
    const db = this.getDb(name!)
    const model = (db as unknown as Record<string, unknown>)[table] as { findFirst: (opts: unknown) => Promise<unknown> }
    const result = await model.findFirst({ where: data })
    expect(result, `Expected ${table} NOT to have ${JSON.stringify(data)}`).toBeNull()
  }

  /**
   * Assert the number of records in a table
   */
  async assertDatabaseCount(table: string, expected: number, name?: ConnectionName): Promise<void> {
    const db = this.getDb(name!)
    const model = (db as unknown as Record<string, unknown>)[table] as { count: () => Promise<number> }
    const actual = await model.count()
    expect(actual, `Expected ${table} count ${expected}, got ${actual}`).toBe(expected)
  }

  /**
   * Cleanup - call in afterAll
   */
  async close(): Promise<void> {
    // Drain work deferred via `ctx.waitUntil` BEFORE tearing anything down. `fetch()` already drains
    // per call, but the non-HTTP helpers (`ws`/`sse`/`quarry`) share the same `pendingTasks`, so a
    // suite that exclusively uses those can reach `close()` with DB writes still in flight. Disposing
    // the pool under them races teardown — a write hits an already-`end()`ed pool, or hangs holding a
    // connection. HTTP suites are unaffected; this only matters for deferred work outside a `fetch()`.
    await this.flushDeferredWork()
    await this._requestContainer.dispose()
    await this.app.shutdown()
  }
}
