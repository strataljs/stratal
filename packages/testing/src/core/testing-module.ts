import type { ConnectionName, DatabaseService } from '@stratal/framework/database'
import { connectionSymbol } from '@stratal/framework/database'
import type { Application, StratalEnv } from 'stratal'
import { DI_TOKENS, type Container } from 'stratal/di'
import { type InjectionToken } from 'stratal/module'
import { STORAGE_TOKENS } from 'stratal/storage'
import type { FakeStorageService } from '../storage'
import type { Seeder } from '../types'
import { TestHttpClient } from './http/test-http-client'

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
 * await module.seed(new UserSeeder())
 * await module.assertDatabaseHas('user', { email: 'test@example.com' })
 *
 * // Cleanup
 * await module.close()
 * ```
 */
export class TestingModule {
  private _http: TestHttpClient | null = null

  constructor(
    private readonly app: Application,
    private readonly env: StratalEnv,
    private readonly ctx: ExecutionContext,
  ) { }

  /**
   * Resolve a service from the container
   */
  get<T>(token: InjectionToken<T>): T {
    return this.app.container.resolve(token)
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
   * Get Application instance
   */
  get application(): Application {
    return this.app
  }

  /**
   * Get DI Container
   */
  get container(): Container {
    return this.app.container
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
  async getDb(): Promise<DatabaseService>
  async getDb<K extends ConnectionName>(name: K): Promise<DatabaseService<K>>
  async getDb(name?: string): Promise<unknown> {
    return this.runInRequestScope((container) => {
      const token = name ? connectionSymbol(name) : DI_TOKENS.Database
      return container.resolve(token)
    })
  }

  /**
   * Truncate all non-prisma tables in the database
   */
  async truncateDb(name?: ConnectionName): Promise<void> {
    await this.runInRequestScope(async (container) => {
      const token = name ? connectionSymbol(name) : DI_TOKENS.Database
      const db = container.resolve<DatabaseService>(token)
      const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename::text as tablename FROM pg_tables
        WHERE schemaname = current_schema()
        AND tablename NOT LIKE '_prisma%'
      `
      if (tables.length === 0) return
      const tableList = tables.map((t) => `"${t.tablename}"`).join(', ')
      await db.$executeRawUnsafe(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`)
    })
  }

  /**
   * Run seeders in a database transaction
   */
  async seed(...seeders: Seeder[]): Promise<void>
  async seed(name: ConnectionName, ...seeders: Seeder[]): Promise<void>
  async seed(...args: unknown[]): Promise<void> {
    let name: string | undefined
    let seeders: Seeder[]

    if (typeof args[0] === 'string') {
      name = args[0]
      seeders = args.slice(1) as Seeder[]
    } else {
      seeders = args as Seeder[]
    }

    await this.runInRequestScope(async (container) => {
      const token = name ? connectionSymbol(name) : DI_TOKENS.Database
      const db = container.resolve<DatabaseService>(token)
      await db.$transaction(async (tx) => {
        for (const seeder of seeders) {
          await seeder.run(tx as DatabaseService)
        }
      })
    })
  }

  /**
   * Assert that a record exists in the database
   */
  async assertDatabaseHas(table: string, data: Record<string, unknown>, name?: ConnectionName): Promise<void> {
    const { expect } = await import('vitest')
    await this.runInRequestScope(async (container) => {
      const token = name ? connectionSymbol(name) : DI_TOKENS.Database
      const db = container.resolve<DatabaseService>(token)
      const model = (db as unknown as Record<string, unknown>)[table] as { findFirst: (opts: unknown) => Promise<unknown> }
      const result = await model.findFirst({ where: data })
      expect(result, `Expected ${table} with ${JSON.stringify(data)}`).not.toBeNull()
    })
  }

  /**
   * Assert that a record does not exist in the database
   */
  async assertDatabaseMissing(table: string, data: Record<string, unknown>, name?: ConnectionName): Promise<void> {
    const { expect } = await import('vitest')
    await this.runInRequestScope(async (container) => {
      const token = name ? connectionSymbol(name) : DI_TOKENS.Database
      const db = container.resolve<DatabaseService>(token)
      const model = (db as unknown as Record<string, unknown>)[table] as { findFirst: (opts: unknown) => Promise<unknown> }
      const result = await model.findFirst({ where: data })
      expect(result, `Expected ${table} NOT to have ${JSON.stringify(data)}`).toBeNull()
    })
  }

  /**
   * Assert the number of records in a table
   */
  async assertDatabaseCount(table: string, expected: number, name?: ConnectionName): Promise<void> {
    const { expect } = await import('vitest')
    await this.runInRequestScope(async (container) => {
      const token = name ? connectionSymbol(name) : DI_TOKENS.Database
      const db = container.resolve<DatabaseService>(token)
      const model = (db as unknown as Record<string, unknown>)[table] as { count: () => Promise<number> }
      const actual = await model.count()
      expect(actual, `Expected ${table} count ${expected}, got ${actual}`).toBe(expected)
    })
  }

  /**
   * Cleanup - call in afterAll
   */
  async close(): Promise<void> {
    await this.app.shutdown()
  }
}
