import type { ConnectionName, DatabaseService } from '@stratal/framework/database'
import { connectionSymbol } from '@stratal/framework/database'
import type { Application, Constructor, StratalEnv, StratalExecutionContext } from 'stratal'
import { DI_TOKENS, type Container } from 'stratal/di'
import type { ResolvedEmailMessage } from 'stratal/email'
import { type InjectionToken } from 'stratal/module'
import { SEEDER_TOKENS, SeederError, type Seeder, type SeederRegistry } from 'stratal/seeder'
import { STORAGE_TOKENS } from 'stratal/storage'
import { expect } from 'vitest'
import { dropDatabase } from '../database'
import { FEATURE_FLAG_SERVICE_TOKEN, type FakeFeatureFlagService } from '../feature-flags'
import type { FakeStorageService } from '../storage'
import type { TestEmailProvider } from '../mocks/test-email-provider'
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
/**
 * Identifies a per-file database created for test isolation, so it can be
 * dropped on teardown. Produced by the testing module builder.
 */
export interface IsolatedDatabase {
  /** Name of the cloned database. */
  name: string
  /** Admin (maintenance-database) connection string used to drop it. */
  adminConnectionString: string
}

export class TestingModule {
  private _http: TestHttpClient | null = null
  private readonly _requestContainer: Container

  constructor(
    private readonly app: Application,
    private readonly env: StratalEnv,
    private readonly ctx: StratalExecutionContext,
    private readonly isolatedDatabase: IsolatedDatabase | null = null,
    private readonly testEmailProvider: TestEmailProvider | null = null,
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
    return hono.fetch(request, this.env, this.ctx as ExecutionContext)
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
   * Truncate all non-prisma tables in the database
   */
  async truncateDb(name?: ConnectionName): Promise<void> {
    const db = this.getDb(name!)
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename::text as tablename FROM pg_tables
      WHERE schemaname = current_schema()
      AND tablename NOT LIKE '_prisma%'
    `
    if (tables.length === 0) return
    const tableList = tables.map((t) => `"${t.tablename}"`).join(', ')
    await db.$executeRawUnsafe(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`)
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
    this._requestContainer.dispose()
    try {
      await this.app.shutdown()
    }
    finally {
      // Drop the per-file database AFTER shutdown so the app's pool connection is
      // released; `WITH (FORCE)` evicts any that lingers. Runs even if shutdown
      // throws, otherwise a failed shutdown would leak the database until the
      // next run's stale-database sweep.
      //
      // A drop failure here is non-fatal: the next run's connection-guarded sweep
      // reclaims the database. Swallow it (warn only) so a passing suite isn't
      // marked failed by a teardown hiccup.
      if (this.isolatedDatabase) {
        try {
          await dropDatabase(this.isolatedDatabase.adminConnectionString, this.isolatedDatabase.name)
        } catch (error) {
          console.warn(
            `[stratal-testing] Failed to drop isolated test database "${this.isolatedDatabase.name}"; ` +
              'it will be reclaimed by the next run\'s stale-database sweep.',
            error,
          )
        }
      }
    }
  }
}
