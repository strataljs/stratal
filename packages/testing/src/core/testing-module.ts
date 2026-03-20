import type { ConnectionName, DatabaseService } from '@stratal/framework/database'
import { connectionSymbol } from '@stratal/framework/database'
import type { Application, Constructor, StratalEnv } from 'stratal'
import { DI_TOKENS, type Container } from 'stratal/di'
import { type InjectionToken } from 'stratal/module'
import { SEEDER_TOKENS, type Seeder, type SeederRegistry, SeederNotRegisteredError } from 'stratal/seeder'
import { STORAGE_TOKENS } from 'stratal/storage'
import { expect } from 'vitest'
import type { FakeStorageService } from '../storage'
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
    private readonly ctx: ExecutionContext,
  ) {
    const mockContext = this.app.createMockRouterContext()
    this._requestContainer = this.app.container.createRequestScope(mockContext)
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
   * Get fake storage service for assertions
   */
  get storage(): FakeStorageService {
    return this.get<FakeStorageService>(STORAGE_TOKENS.StorageService)
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
    return this.app.hono.fetch(request, this.env, this.ctx)
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
        throw new SeederNotRegisteredError(SeederClass.name)
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
    await this._requestContainer.dispose()
    await this.app.shutdown()
  }
}
