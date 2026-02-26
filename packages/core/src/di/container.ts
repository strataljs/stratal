/**
 * Unified DI Container
 *
 * Provides a developer-friendly wrapper around tsyringe with:
 * - Auto-token extraction from decorator metadata
 * - Auto-scope detection from decorator metadata
 * - Seamless global/request scope interoperability
 * - Request scope lifecycle management
 *
 * **Two-Tier Container Architecture:**
 * ```
 * Global Container (managed by Container)
 *        ↓
 *   All services registered here
 *   (singletons + container-scoped)
 *        ↓
 * Request Container (child, per request)
 *        ↓
 *   Fresh instances for ContainerScoped services
 *   RouterContext registered per request
 * ```
 */
import { type DependencyContainer, type Lifecycle } from 'tsyringe'
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'
import { type StratalEnv } from '../env'
import { LOGGER_TOKENS } from '../logger/logger.tokens'
import type { LoggerService } from '../logger/services/logger.service'
import type { RouterContext } from '../router/router-context'
import type { Constructor } from '../types'
import { ConditionalBindingBuilderImpl, type ConditionalBindingBuilder, type PredicateContainer } from './conditional-binding-builder'
import { RequestScopeOperationNotAllowedError } from './errors/request-scope-operation-not-allowed.error'
import { RequestContextStore } from './request-context-store'
import { CONTAINER_TOKEN, DI_TOKENS } from './tokens'
import type { ExtensionDecorator, Scope, WhenOptions } from './types'

/**
 * Options for creating a Container instance
 */
export interface ContainerOptions {
  /** Cloudflare environment bindings */
  env: StratalEnv
  /** Cloudflare execution context */
  ctx: ExecutionContext
  /** Pre-created DependencyContainer */
  container: DependencyContainer
  /** Whether this is a request-scoped container */
  isRequestScoped?: boolean
}

/**
 * Unified Container for DI management
 *
 * Manages the two-tier container hierarchy:
 * - Global scope: Singletons, base instances of request-scoped services
 * - Request scope: Context-enriched instances per HTTP request
 *
 * @example Basic registration
 * ```typescript
 * import { container as tsyringeRootContainer } from 'tsyringe'
 *
 * const container = new Container({
 *   env,
 *   ctx,
 *   container: tsyringeRootContainer.createChildContainer()
 * })
 *
 * // Auto-extract token and scope from decorator
 * container.register(I18nService)
 *
 * // Explicit token with auto-scope detection
 * container.register(MY_TOKEN, MyService)
 *
 * // Explicit singleton registration
 * container.registerSingleton(ConfigService)
 *
 * // Register a value
 * container.registerValue(MY_TOKEN, myInstance)
 * ```
 *
 * @example Resolution
 * ```typescript
 * // Resolves from container
 * const service = container.resolve(MY_TOKEN)
 * ```
 *
 * @example Request scope (automatic lifecycle)
 * ```typescript
 * await container.runInRequestScope(routerContext, async () => {
 *   const i18n = container.resolve(I18N_TOKEN)
 *   // i18n is context-enriched for this request
 * })
 * ```
 *
 * @example Request scope (manual lifecycle)
 * ```typescript
 * const reqContainer = container.createRequestScope(routerContext)
 * await reqContainer.runWithContextStore(async () => {
 *   // use reqContainer...
 * })
 * // Cleanup is automatic
 * ```
 */
export class Container {
  private readonly container: DependencyContainer
  private readonly contextStore: RequestContextStore
  private readonly env: StratalEnv
  private readonly ctx: ExecutionContext
  private readonly isRequestScoped: boolean

  constructor(options: ContainerOptions) {
    this.env = options.env
    this.ctx = options.ctx
    this.isRequestScoped = options.isRequestScoped ?? false
    this.contextStore = RequestContextStore.getInstance()
    this.container = options.container

    // Only register bindings for global container (not request-scoped)
    if (!this.isRequestScoped) {
      this.container.register(DI_TOKENS.CloudflareEnv, { useValue: options.env })
      this.container.register(DI_TOKENS.ExecutionContext, { useValue: options.ctx })
      this.container.register(CONTAINER_TOKEN, { useValue: this })
    }
  }

  get logger() {
    return this.container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
  }


  // ============================================================
  // Registration Methods
  // ============================================================

  /**
   * Register a service with optional explicit token and scope
   *
   * Lifecycle is controlled via the scope parameter, which maps to tsyringe's Lifecycle.
   * If no scope is provided, defaults to Transient (new instance per resolution).
   *
   * @overload register(serviceClass, scope?) - Use class as token
   * @overload register(token, serviceClass, scope?) - Explicit token
   *
   * @example
   * ```typescript
   * container.register(MyService)  // Transient by default
   * container.register(MyService, Scope.Singleton)  // Singleton
   * container.register(MY_TOKEN, MyService, Scope.Request)  // Request-scoped with token
   * ```
   */
  register<T extends object>(serviceClass: Constructor<T>, scope?: Scope): void
  register<T extends object>(token: InjectionToken<T>, serviceClass: Constructor<T>, scope?: Scope): void
  register<T extends object>(
    tokenOrClass: InjectionToken<T> | Constructor<T>,
    serviceClassOrScope?: Constructor<T> | Scope,
    scope?: Scope
  ): void {
    let token: InjectionToken<T>
    let serviceClass: Constructor<T>
    let lifecycle: Lifecycle | undefined

    if (typeof serviceClassOrScope === 'function') {
      // Called as register(token, class, scope?)
      token = tokenOrClass as InjectionToken<T>
      serviceClass = serviceClassOrScope
      lifecycle = scope as Lifecycle | undefined
    } else {
      // Called as register(class, scope?)
      token = tokenOrClass as Constructor<T>
      serviceClass = tokenOrClass as Constructor<T>
      lifecycle = serviceClassOrScope as Lifecycle | undefined
    }

    if (lifecycle !== undefined) {
      this.container.register(token, { useClass: serviceClass }, { lifecycle })
    } else {
      this.container.register(token, { useClass: serviceClass })
    }
  }

  /**
   * Register a service as singleton
   *
   * Passthrough to tsyringe's registerSingleton method.
   *
   * @overload registerSingleton(serviceClass) - Use class as token
   * @overload registerSingleton(token, serviceClass) - Explicit token
   *
   * @example
   * ```typescript
   * container.registerSingleton(LoggerService)  // Uses class as token
   * container.registerSingleton(CONFIG_TOKEN, ConfigService)  // Explicit token
   * ```
   */
  registerSingleton<T extends object>(serviceClass: Constructor<T>): void
  registerSingleton<T extends object>(token: InjectionToken<T>, serviceClass: Constructor<T>): void
  registerSingleton<T extends object>(
    tokenOrClass: InjectionToken<T> | Constructor<T>,
    serviceClass?: Constructor<T>
  ): void {
    if (serviceClass !== undefined) {
      this.container.registerSingleton(tokenOrClass as InjectionToken<T>, serviceClass)
    } else {
      const targetClass = tokenOrClass as Constructor<T>
      this.container.registerSingleton(targetClass, targetClass)
    }
  }

  /**
   * Register a value (instance) directly
   *
   * Use for registering pre-created instances or primitive values.
   *
   * @param token - DI token for resolution
   * @param value - Value to register
   *
   * @example
   * ```typescript
   * container.registerValue(CONFIG_TOKEN, configInstance)
   * container.registerValue(DI_TOKENS.Application, app)
   * ```
   */
  registerValue<T>(token: InjectionToken<T>, value: T): void {
    this.container.register(token, { useValue: value })
  }

  /**
   * Register with factory function
   *
   * Use when instance creation requires custom logic or other resolved dependencies.
   *
   * @param token - DI token for resolution
   * @param factory - Factory function that receives the Container
   * @param scope - Optional lifecycle scope (defaults to Transient)
   *
   * @example
   * ```typescript
   * container.registerFactory(FORMATTER_TOKEN, (c) => {
   *   const config = c.resolve(CONFIG_TOKEN)
   *   return config.get('logging').formatter === 'pretty'
   *     ? new PrettyFormatter()
   *     : new JsonFormatter()
   * }, Scope.Singleton)
   * ```
   */
  registerFactory<T>(
    token: InjectionToken<T>,
    factory: (container: Container) => T
  ): void {
    this.container.register(token, { useFactory: () => factory(this) })
  }

  /**
   * Register an alias to an existing token
   *
   * Creates a redirect so that resolving the alias token returns the same
   * instance as the target token. This is useful for:
   * - Interface tokens that alias concrete implementations
   * - Multiple entry points to the same service
   *
   * @param alias - The alias token to register
   * @param target - The target token to redirect to
   *
   * @example Interface abstraction
   * ```typescript
   * // Register concrete implementation
   * container.register(UserService)
   *
   * // Create alias for interface token
   * container.registerExisting(I_USER_SERVICE, UserService)
   *
   * // Both resolve to the same instance
   * const a = container.resolve(UserService)
   * const b = container.resolve(I_USER_SERVICE)
   * // a === b (same instance)
   * ```
   */
  registerExisting<T>(alias: InjectionToken<T>, target: InjectionToken<T>): void {
    this.container.register(alias, { useToken: target })
  }

  // ============================================================
  // Resolution Methods
  // ============================================================

  /**
   * Resolve a service from the container
   *
   * @param token - DI token for the service
   * @returns Resolved service instance
   *
   * @example
   * ```typescript
   * const logger = container.resolve(LOGGER_TOKEN)
   * const config = container.resolve<IConfigService>(CONFIG_TOKEN)
   * ```
   */
  resolve<T>(token: InjectionToken<T>): T {
    return this.container.resolve<T>(token)
  }

  /**
   * Check if a token is registered
   *
   * @param token - DI token to check
   * @returns true if token is registered
   */
  isRegistered<T>(token: InjectionToken<T>): boolean {
    return this.container.isRegistered(token)
  }

  // ============================================================
  // Conditional Registration Methods
  // ============================================================

  /**
   * Start a conditional binding with predicate evaluation
   *
   * Creates a fluent builder for registering a service that chooses between
   * two implementations based on a predicate evaluated at resolution time.
   *
   * @param predicate - Function that returns true/false to determine implementation.
   *                    Receives a container with `resolve()` method for resolving dependencies.
   * @param options - Optional configuration (cache: whether to cache predicate result)
   * @returns Fluent builder for specifying token and implementations
   *
   * @example Environment-based implementation selection
   * ```typescript
   * container
   *   .when((c) => c.resolve(CONFIG_TOKEN).get('env') === 'development')
   *   .use(FORMATTER_TOKEN)
   *   .give(PrettyFormatter)
   *   .otherwise(JsonFormatter)
   * ```
   *
   * @example Feature flag with cached predicate
   * ```typescript
   * container
   *   .when((c) => c.resolve(FEATURE_FLAGS_TOKEN).isEnabled('newPaymentGateway'), { cache: true })
   *   .use(PAYMENT_TOKEN)
   *   .give(StripePaymentService)
   *   .otherwise(LegacyPaymentService)
   * ```
   */
  when(
    predicate: (container: PredicateContainer) => boolean,
    options: WhenOptions = {}
  ): ConditionalBindingBuilder {
    return new ConditionalBindingBuilderImpl(
      this.container,
      this,
      predicate,
      options
    )
  }

  /**
   * Replace a service registration with a decorated version
   *
   * Resolves the current instance, applies the decorator, and re-registers
   * the decorated instance. This is a one-time operation at initialization time.
   *
   * **IMPORTANT:** This method can only be used in a module's `onInitialize()` method.
   * The `onInitialize()` hook runs after all modules have registered their services
   * via the `@Module` decorator, ensuring all dependencies are available for resolution.
   *
   * @param token - DI token of the service to extend
   * @param decorator - Function that receives the service and returns decorated version
   *
   * @example Add logging to database service (in onInitialize)
   * ```typescript
   * // In your module's onInitialize() method:
   * import type { OnInitialize, ModuleContext } from 'stratal/module'
   *
   * @Module({ providers: [...] })
   * export class MyModule implements OnInitialize {
   *   onInitialize({ container }: ModuleContext): void {
   *     container.extend(DI_TOKENS.Database, (db, c) => {
   *       const logger = c.resolve(LOGGER_TOKENS.LoggerService)
   *       return new LoggingDatabaseDecorator(db, logger)
   *     })
   *   }
   * }
   * // DI_TOKENS.Database now resolves to LoggingDatabaseDecorator
   * ```
   *
   * @example Chain multiple decorators
   * ```typescript
   * // In onInitialize()
   * container.extend(SERVICE_TOKEN, (svc) => new LoggingDecorator(svc))
   * container.extend(SERVICE_TOKEN, (svc) => new CachingDecorator(svc))
   * // SERVICE_TOKEN now resolves to CachingDecorator(LoggingDecorator(original))
   * ```
   */
  extend<T>(token: InjectionToken<T>, decorator: ExtensionDecorator<T>): void {
    // Resolve current instance
    const currentInstance = this.container.resolve<T>(token)

    // Apply decorator
    const decoratedInstance = decorator(currentInstance, this)

    // Re-register with decorated instance (replaces existing registration)
    this.container.register(token, { useValue: decoratedInstance })
  }

  // ============================================================
  // Request Scope Management
  // ============================================================

  /**
   * Check if currently in request context
   *
   * @returns true if in request context (inside runInRequestScope or runWithContextStore)
   */
  isInRequestContext(): boolean {
    return this.contextStore.hasRequestContext()
  }

  /**
   * Run callback within request scope
   *
   * Creates a child container with fresh instances for services registered with `scope: Scope.Request`.
   * Automatically handles lifecycle (setup and cleanup).
   *
   * Also wraps with RequestContextStore for Zod i18n validation support.
   *
   * Can only be called on global container (not request-scoped).
   *
   * @param routerContext - RouterContext for the current request
   * @param callback - Async operation to run with request context
   * @returns Result of callback execution
   *
   * @example
   * ```typescript
   * await container.runInRequestScope(routerContext, async () => {
   *   const i18n = container.resolve(I18N_TOKEN)
   *   const message = i18n.t('common.welcome')
   *   // ...
   * })
   * ```
   */
  async runInRequestScope<T>(
    routerContext: RouterContext,
    callback: () => T | Promise<T>
  ): Promise<T> {
    if (this.isRequestScoped) {
      throw new RequestScopeOperationNotAllowedError('runInRequestScope')
    }

    const requestChildContainer = this.createRequestChildContainer(routerContext)

    try {
      // Wrap with contextStore for Zod i18n validation
      return await this.contextStore.run(requestChildContainer, callback)
    } finally {
      await this.cleanupRequestContainer(requestChildContainer)
    }
  }

  /**
   * Create request scope container
   *
   * Use when you need manual control over the request container lifecycle,
   * typically in middleware. Returns a new Container instance wrapping
   * a request-scoped child container.
   *
   * Can only be called on global container (not request-scoped).
   *
   * @param routerContext - RouterContext for the current request
   * @returns Request-scoped Container instance
   *
   * @example
   * ```typescript
   * const reqContainer = container.createRequestScope(routerContext)
   * await reqContainer.runWithContextStore(async () => {
   *   // use reqContainer...
   * })
   * // Cleanup is automatic
   * ```
   */
  createRequestScope(routerContext: RouterContext): Container {
    if (this.isRequestScoped) {
      throw new RequestScopeOperationNotAllowedError('createRequestScope')
    }

    const requestChildContainer = this.createRequestChildContainer(routerContext)

    return new Container({
      env: this.env,
      ctx: this.ctx,
      container: requestChildContainer,
      isRequestScoped: true
    })
  }

  /**
   * Run callback within request scope context store
   *
   * Wraps callback with RequestContextStore (for Zod i18n validation)
   * and automatically handles cleanup after callback completes.
   *
   * Can only be called on request-scoped container (not global).
   *
   * @param callback - Async operation to run with context
   * @returns Result of callback execution
   *
   * @example
   * ```typescript
   * const reqContainer = container.createRequestScope(routerContext)
   * await reqContainer.runWithContextStore(async () => {
   *   const i18n = reqContainer.resolve(I18N_TOKENS.I18nService)
   *   // ...
   * })
   * // Cleanup is automatic
   * ```
   */
  async runWithContextStore<T>(callback: () => T | Promise<T>): Promise<T> {
    if (!this.isRequestScoped) {
      throw new RequestScopeOperationNotAllowedError('runWithContextStore')
    }

    try {
      return await this.contextStore.run(this.container, callback)
    } finally {
      await this.cleanupRequestContainer(this.container)
    }
  }

  // ============================================================
  // Escape Hatches
  // ============================================================

  /**
   * Get underlying tsyringe container
   *
   * Use sparingly - prefer Container methods for most operations.
   * Useful for advanced scenarios or compatibility with existing code.
   * @returns The underlying DependencyContainer
   */
  getTsyringeContainer(): DependencyContainer {
    return this.container
  }

  /**
   * Get current request container from context store (if in request context)
   * @deprecated Use container.runWithContextStore() instead
   * @returns Request container if in request context, undefined otherwise
   */
  getRequestContainer(): DependencyContainer | undefined {
    return this.contextStore.getRequestContainer()
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Create request child container with RouterContext registered
   *
   * Services registered with `scope: Scope.Request` will automatically get fresh instances
   * in the child container. RouterContext is registered so services can inject it for
   * request-specific data.
   */
  private createRequestChildContainer(routerContext: RouterContext): DependencyContainer {
    const requestContainer = this.container.createChildContainer()

    // Register RouterContext in request container
    // Services registered with scope: Scope.Request can inject this via DI_TOKENS.RouterContext
    const ROUTER_TOKENS = { RouterContext: Symbol.for('RouterContext') }
    requestContainer.register(ROUTER_TOKENS.RouterContext, { useValue: routerContext })

    return requestContainer
  }

  /**
   * Cleanup request container (disconnect database, etc.)
   *
   * Disposes the ConnectionManager to close all database pools.
   * This is called after each request to prevent connection leaks.
   */
  private async cleanupRequestContainer(requestContainer: DependencyContainer): Promise<void> {
    try {
      if (requestContainer.isRegistered(DI_TOKENS.ConnectionManager)) {
        const connectionManager = requestContainer.resolve<{ dispose(): Promise<void> }>(DI_TOKENS.ConnectionManager)
        await connectionManager.dispose()
      }
    } catch (error) {
      this.logger.warn('Failed to dispose ConnectionManager', { error })
    }
  }

  dispose() {
    this.logger.info('Container disposed.')
    return this.container.dispose()
  }
}

// Re-export tsyringe utilities for convenience
export { container, inject, injectable, singleton } from 'tsyringe'
export type { DependencyContainer } from 'tsyringe'

