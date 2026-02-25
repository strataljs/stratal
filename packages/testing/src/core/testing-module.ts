import type { Application, Container, InjectionToken, StratalEnv, RouterService } from 'stratal'
import { ROUTER_TOKENS } from 'stratal'
import { STORAGE_TOKENS } from 'stratal/storage'
import type { FakeStorageService } from '../storage'
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
 * // Cleanup
 * await module.close()
 * ```
 */
export class TestingModule {
  private _http: TestHttpClient | null = null

  constructor(
    private readonly app: Application,
    private readonly env: StratalEnv
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
   *
   * Provides assertion helpers for testing file storage operations.
   *
   * @example
   * ```typescript
   * module.storage.assertExists('path/to/file.pdf')
   * module.storage.assertMissing('deleted/file.pdf')
   * module.storage.clear() // Reset between tests
   * ```
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
   * Execute an HTTP request through RouterService
   *
   * This is the core method - calls RouterService.fetch() directly, no SELF.fetch()
   */
  async fetch(request: Request): Promise<Response> {
    const router = this.get<RouterService>(ROUTER_TOKENS.RouterService)
    return router.fetch(request, this.env, this.app.ctx)
  }

  /**
   * Run callback in request scope (for DB operations, service access)
   */
  async runInRequestScope<T>(callback: () => T | Promise<T>): Promise<T> {
    const mockContext = this.app.createMockRouterContext()
    return this.app.container.runInRequestScope(mockContext, callback)
  }

  /**
   * Cleanup - call in afterAll
   */
  async close(): Promise<void> {
    await this.app.shutdown()
  }
}
