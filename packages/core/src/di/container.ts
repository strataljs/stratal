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
import type { RouterContext } from '../router/router-context'
import { ROUTER_TOKENS } from '../router/router.tokens'
import type { Constructor } from '../types'
import { ConditionalBindingBuilderImpl, type ConditionalBindingBuilder, type PredicateContainer } from './conditional-binding-builder'
import { RequestScopeOperationNotAllowedError } from './errors/request-scope-operation-not-allowed.error'
import { CONTAINER_TOKEN } from './tokens'
import type { ExtensionDecorator, Scope, WhenOptions } from './types'

/**
 * Options for creating a Container instance
 */
export interface ContainerOptions {
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
 *   container: tsyringeRootContainer.createChildContainer()
 * })
 *
 * container.register(I18nService)
 * container.register(MY_TOKEN, MyService)
 * container.registerSingleton(ConfigService)
 * container.registerValue(MY_TOKEN, myInstance)
 * ```
 *
 * @example Request scope (automatic lifecycle)
 * ```typescript
 * await container.runInRequestScope(routerContext, async (requestContainer) => {
 *   const i18n = requestContainer.resolve(I18N_TOKEN)
 * })
 * ```
 */
export class Container {
  private readonly container: DependencyContainer
  private readonly isRequestScoped: boolean

  constructor(options: ContainerOptions) {
    this.isRequestScoped = options.isRequestScoped ?? false
    this.container = options.container

    // Only register CONTAINER_TOKEN for global container (not request-scoped)
    if (!this.isRequestScoped) {
      this.container.register(CONTAINER_TOKEN, { useValue: this })
    }
  }

  // ============================================================
  // Registration Methods
  // ============================================================

  /**
   * Register a service with optional explicit token and scope
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
   */
  registerValue<T>(token: InjectionToken<T>, value: T): void {
    this.container.register(token, { useValue: value })
  }

  /**
   * Register with factory function
   */
  registerFactory<T>(
    token: InjectionToken<T>,
    factory: (container: Container) => T
  ): void {
    this.container.register(token, { useFactory: () => factory(this) })
  }

  /**
   * Register an alias to an existing token
   */
  registerExisting<T>(alias: InjectionToken<T>, target: InjectionToken<T>): void {
    this.container.register(alias, { useToken: target })
  }

  // ============================================================
  // Resolution Methods
  // ============================================================

  /**
   * Resolve a service from the container
   */
  resolve<T>(token: InjectionToken<T>): T {
    return this.container.resolve<T>(token)
  }

  /**
   * Check if a token is registered
   */
  isRegistered<T>(token: InjectionToken<T>): boolean {
    return this.container.isRegistered(token)
  }

  // ============================================================
  // Conditional Registration Methods
  // ============================================================

  /**
   * Start a conditional binding with predicate evaluation
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
   */
  extend<T>(token: InjectionToken<T>, decorator: ExtensionDecorator<T>): void {
    const currentInstance = this.container.resolve<T>(token)
    const decoratedInstance = decorator(currentInstance, this)
    this.container.register(token, { useValue: decoratedInstance })
  }

  // ============================================================
  // Request Scope Management
  // ============================================================

  /**
   * Run callback within request scope
   *
   * Creates a child container with fresh instances for services registered with `scope: Scope.Request`.
   * Callback receives the request-scoped container as argument.
   *
   * Can only be called on global container (not request-scoped).
   */
  async runInRequestScope<T>(
    routerContext: RouterContext,
    callback: (requestContainer: Container) => T | Promise<T>
  ): Promise<T> {
    if (this.isRequestScoped) {
      throw new RequestScopeOperationNotAllowedError('runInRequestScope')
    }

    const requestContainer = this.createRequestScope(routerContext)
    try {
      return await callback(requestContainer)
    } finally {
      await requestContainer.dispose()
    }
  }

  /**
   * Create request scope container
   *
   * Can only be called on global container (not request-scoped).
   */
  createRequestScope(routerContext: RouterContext): Container {
    if (this.isRequestScoped) {
      throw new RequestScopeOperationNotAllowedError('createRequestScope')
    }

    const childContainer = this.container.createChildContainer()
    childContainer.register(ROUTER_TOKENS.RouterContext, { useValue: routerContext })

    return new Container({ container: childContainer, isRequestScoped: true })
  }

  // ============================================================
  // Escape Hatches
  // ============================================================

  /**
   * Get underlying tsyringe container
   */
  getTsyringeContainer(): DependencyContainer {
    return this.container
  }

  dispose() {
    return this.container.dispose()
  }
}

// Re-export tsyringe utilities for convenience
export { container, inject, injectable, singleton } from 'tsyringe'
export type { DependencyContainer } from 'tsyringe'

