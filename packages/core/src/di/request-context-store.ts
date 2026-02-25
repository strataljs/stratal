import { AsyncLocalStorage } from 'node:async_hooks'
import type { DependencyContainer } from 'tsyringe'

/**
 * Request context store using AsyncLocalStorage
 *
 * Stores and propagates request container across async operations without manual context passing.
 * This enables transparent access to request-scoped services from any part of the application
 * during request handling.
 *
 * **Cloudflare Workers Compatibility**:
 * - Requires `nodejs_als` compatibility flag in wrangler.jsonc
 * - Uses V8's SetContinuationPreservedEmbedderData API (efficient)
 * - Performance overhead: ~3-4% in typical scenarios
 *
 * **Thread Safety**:
 * - Singleton instance shared across application
 * - Each request gets isolated storage context
 * - No context leakage between concurrent requests
 *
 * @example
 * ```typescript
 * // In router middleware
 * const store = RequestContextStore.getInstance()
 * await store.run(requestContainer, async () => {
 *   // All async operations within this callback have access to requestContainer
 *   await handleRequest()
 * })
 *
 * // In service (anywhere in the call stack)
 * const container = RequestContextStore.getInstance().getRequestContainer()
 * if (container) {
 *   // We're in request context
 *   const service = container.resolve(TOKEN)
 * }
 * ```
 */
export class RequestContextStore {
  private static instance: RequestContextStore | null = null
  private readonly storage: AsyncLocalStorage<DependencyContainer>

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {
    this.storage = new AsyncLocalStorage<DependencyContainer>()
  }

  /**
   * Get singleton instance
   *
   * **Note**: Creates instance on first call. Subsequent calls return same instance.
   */
  static getInstance(): RequestContextStore {
    RequestContextStore.instance ??= new RequestContextStore()
    return RequestContextStore.instance
  }

  /**
   * Run callback within request context
   *
   * Container is automatically available to all async operations within the callback,
   * including nested function calls, promises, timers, and queue handlers.
   *
   * @param container - Request-scoped dependency container
   * @param callback - Async operation to run with context
   * @returns Result of callback execution
   *
   * @example
   * ```typescript
   * const result = await store.run(requestContainer, async () => {
   *   // Context automatically propagates to nested calls
   *   await processRequest()
   *   return { success: true }
   * })
   * ```
   */
  run<T>(container: DependencyContainer, callback: () => T): T {
    return this.storage.run(container, callback)
  }

  /**
   * Get current request container
   *
   * Returns the container for the current async context, or undefined if not in request context.
   *
   * **Use Cases**:
   * - Request-scoped services resolving from request container
   * - Services needing conditional logic based on context availability
   * - Debugging/logging request-specific information
   * @deprecated Use container instead
   * @returns Request container if in request context, undefined otherwise
   *
   * @example
   * ```typescript
   * const container = store.getRequestContainer()
   * if (container) {
   *   // Safe to resolve request-scoped services
   *   const i18n = container.resolve(I18N_TOKENS.I18nService)
   * } else {
   *   // Not in request context - use fallback
   *   console.log('No request context available')
   * }
   * ```
   */
  getRequestContainer(): DependencyContainer | undefined {
    return this.storage.getStore()
  }

  /**
   * Check if currently in request context
   *
   * Convenience method for conditional logic based on context availability.
   *
   * @returns true if in request context, false otherwise
   *
   * @example
   * ```typescript
   * if (store.hasRequestContext()) {
   *   // Use request-specific data
   *   const locale = getLocaleFromContext()
   * } else {
   *   // Use default
   *   const locale = 'en'
   * }
   * ```
   */
  hasRequestContext(): boolean {
    return this.storage.getStore() !== undefined
  }

  /**
   * Reset singleton instance (for testing only)
   *
   * **Warning**: Only use in test cleanup. Never call in production code.
   *
   * @internal
   */
  static resetInstance(): void {
    RequestContextStore.instance = null
  }
}
