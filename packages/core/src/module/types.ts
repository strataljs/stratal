/**
 * Module System Types
 *
 * Type definitions for the @Module decorator pattern with dynamic module support.
 * Simplified for tsyringe's flat container model (no module scoping).
 */

import type { DependencyContainer } from 'tsyringe'
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'
import type { Container } from '../di/container'
import type { Scope } from '../di/types'
import type { LoggerService } from '../logger'
import type { Constructor } from '../types'

// Re-export for convenience
export type { InjectionToken }

/**
 * Provider that uses a class constructor
 *
 * @example Transient (default)
 * ```typescript
 * { provide: UserService, useClass: UserService }
 * ```
 *
 * @example Singleton
 * ```typescript
 * { provide: DI_TOKENS.ConsumerRegistry, useClass: ConsumerRegistry, scope: Scope.Singleton }
 * ```
 *
 * @example Request-scoped
 * ```typescript
 * { provide: DI_TOKENS.ConnectionManager, useClass: ConnectionManager, scope: Scope.Request }
 * ```
 */
export interface ClassProvider<T extends object = object> {
  provide: InjectionToken<T>
  useClass: Constructor<T>
  /** Lifecycle scope - defaults to Transient if not specified */
  scope?: Scope
}

/**
 * Provider that uses a pre-created value
 *
 * Note: Values are inherently singleton-like (same instance always returned).
 * No scope option needed.
 */
export interface ValueProvider<T extends object = object> {
  provide: InjectionToken<T>
  useValue: T
}

/**
 * Provider that uses a factory function with auto-injection support
 *
 * Note: Factory providers do not support scope/lifecycle in tsyringe.
 * Factories are always called fresh on each resolution (transient-like behavior).
 *
 * @example Factory with dependencies
 * ```typescript
 * {
 *   provide: LOGGER_TOKENS.Transports,
 *   useFactory: (console) => [console],
 *   inject: [LOGGER_TOKENS.ConsoleTransport]
 * }
 * ```
 */
export interface FactoryProvider<T extends object = object> {
  provide: InjectionToken<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required for factory parameter contravariance
  useFactory: (...deps: any[]) => T | Promise<T>
  inject?: InjectionToken<unknown>[]
}

/**
 * Provider that creates an alias to an existing token
 *
 * When the `provide` token is resolved, the container resolves `useExisting` instead.
 * Both tokens return the same instance (for singleton/request-scoped services).
 *
 * Use cases:
 * - Creating interface tokens that alias concrete implementations
 * - Multiple tokens resolving to the same service
 *
 * @example Basic alias
 * ```typescript
 * {
 *   provide: 'IUserService',
 *   useExisting: UserService
 * }
 * // Resolving 'IUserService' returns the UserService instance
 * ```
 *
 * @example Interface abstraction
 * ```typescript
 * providers: [
 *   UserService,
 *   { provide: I_USER_SERVICE, useExisting: UserService }
 * ]
 * // Both UserService and I_USER_SERVICE resolve to the same instance
 * ```
 */
export interface ExistingProvider<T extends object = object> {
  provide: InjectionToken<T>
  useExisting: InjectionToken<T>
}

/**
 * Union type for all provider types
 */
export type Provider<T extends object = object> =
  | Constructor<T>
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>

/**
 * Module class type (decorated with @Module)
 *
 * Static methods for dynamic module configuration:
 * - forRoot: Synchronous configuration (like NestJS forRoot)
 * - forRootAsync: Async configuration with factory (like NestJS forRootAsync)
 */
export interface ModuleClass<T extends object = object> extends Constructor<T> {
  /**
   * Synchronous module configuration
   *
   * Use for global singleton modules with static configuration
   *
   * @example
   * ```typescript
   * @Module({ providers: [] })
   * export class ConfigModule {
   *   static forRoot(options: ConfigOptions): DynamicModule {
   *     return {
   *       providers: [
   *         { provide: CONFIG_TOKEN, useValue: options }
   *       ]
   *     }
   *   }
   * }
   *
   * // Usage in AppModule
   * @Module({ imports: [ConfigModule.forRoot({ apiKey: '...' })] })
   * ```
   */
  forRoot?: (...args: unknown[]) => DynamicModule

  /**
   * Async module configuration with dependency injection
   *
   * Use when configuration depends on other services
   *
   * @example
   * ```typescript
   * @Module({ providers: [] })
   * export class DatabaseModule {
   *   static forRootAsync<T>(options: AsyncModuleOptions<T>): DynamicModule {
   *     return {
   *       providers: [
   *         {
   *           provide: DB_TOKEN,
   *           useFactory: options.useFactory,
   *           inject: options.inject
   *         }
   *       ]
   *     }
   *   }
   * }
   *
   * // Usage in AppModule
   * @Module({
   *   imports: [
   *     DatabaseModule.forRootAsync({
   *       inject: [CONFIG_TOKEN],
   *       useFactory: (config) => ({ url: config.databaseUrl })
   *     })
   *   ]
   * })
   * ```
   */
  forRootAsync?: <TOptions>(options: AsyncModuleOptions<TOptions>) => DynamicModule
}

/**
 * Module options for `@Module` decorator
 *
 * Note: Middlewares are configured via the MiddlewareConfigurable interface's
 * configure() method, not via this options object. See middleware/types.ts.
 */
export interface ModuleOptions {
  imports?: (ModuleClass | DynamicModule)[]
  providers?: Provider[]
  controllers?: Constructor[]
  consumers?: Constructor[]
  jobs?: Constructor[]
}

/**
 * Dynamic module returned by forRoot/forRootAsync
 *
 * Contains additional providers, controllers, consumers, and jobs
 * that are added to the module when configured dynamically.
 */
export interface DynamicModule extends Omit<ModuleOptions, 'imports'> {
  /**
   * Reference to the module class that created this dynamic module
   *
   * Required for dynamic modules to support lifecycle methods (configure, onInitialize, onShutdown).
   * ModuleRegistry uses this to instantiate the actual module class instead of an anonymous wrapper.
   *
   * Note: This is NOT for provider scoping (tsyringe is always global).
   * It's purely for preserving the class reference for lifecycle method calls.
   */
  module: Constructor
}

/**
 * Async configuration options for forRootAsync
 */
export interface AsyncModuleOptions<TOptions> {
  inject?: InjectionToken<unknown>[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required for factory parameter contravariance
  useFactory: (...deps: any[]) => TOptions | Promise<TOptions>
}

/**
 * Context passed to lifecycle hooks
 */
export interface ModuleContext {
  container: Container
  logger: LoggerService
}

/**
 * Lifecycle hook: called after all providers are registered
 */
export interface OnInitialize {
  onInitialize(context: ModuleContext): void | Promise<void>
}

/**
 * Lifecycle hook: called during application shutdown
 */
export interface OnShutdown {
  onShutdown(context: ModuleContext): void | Promise<void>
}

/**
 * Tsyringe registry entry type (for internal use)
 *
 * Note: useFactory receives DependencyContainer from tsyringe,
 * but we resolve our Container via CONTAINER_TOKEN for consistency.
 */
export interface RegistryEntry<T extends object = object> {
  token: InjectionToken<T>
  useClass?: Constructor<T>
  useValue?: T
  useFactory?: (dependencyContainer: DependencyContainer) => T
  useToken?: InjectionToken<T>
}
