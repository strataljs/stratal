import 'reflect-metadata'

import { container as tsyringeRootContainer } from 'tsyringe'
import { CacheModule } from './cache'
import type { CronJob } from './cron/cron-job'
import { CronManager } from './cron/cron-manager'
import { Container } from './di/container'
import { DI_TOKENS } from './di/tokens'
import { type StratalEnv } from './env'
import { I18nModule } from './i18n/i18n.module'
import { GlobalErrorHandler } from './infrastructure/error-handler'
import { ConsoleTransport, JsonFormatter, LOGGER_TOKENS, LoggerService, LogLevel, PrettyFormatter } from './logger'
import { ModuleRegistry } from './module/module-registry'
import type { DynamicModule, ModuleClass } from './module/types'
import { OpenAPIModule } from './openapi'
import { type ConsumerRegistry } from './queue/consumer-registry'
import type { IQueueConsumer, QueueMessage } from './queue/queue-consumer'
import { type QueueManager } from './queue/queue-manager'
import { QueueModule } from './queue/queue.module'
import { ROUTER_TOKENS, RouterService, type IController, type RouterContext } from './router'
import type { Constructor } from './types'

export interface ApplicationConfig {
  /** Root application module */
  module: ModuleClass | DynamicModule
  /** Logging configuration. Defaults: level=INFO, formatter='json' */
  logging?: {
    level?: LogLevel
    formatter?: 'json' | 'pretty'
  }
}

/**
 * Application
 *
 * Main application class managing the two-tier container hierarchy:
 * - Global Container: All services (singletons via tsyringe native)
 * - Request Container: Child of global, context-enriched instances per request
 *
 * **Architecture:**
 * ```
 * Container (manages global container internally)
 *        ↓
 *   All services registered via container.register()
 *   (auto-detects scope from decorators)
 *        ↓
 * Request Container (child, per request)
 *        ↓
 *   Context-enriched instances via
 *   container.runInRequestScope() or container.createRequestScope()
 * ```
 *
 * @example
 * ```typescript
 * const app = new Application(env, ctx, config)
 * await app.initialize()
 *
 * // Access container via getter
 * const service = app.container.resolve(MY_TOKEN)
 *
 * // Handle HTTP request (via RouterService middleware)
 * // Handle queue batch
 * await app.handleQueue(batch, 'my-queue')
 * ```
 */
export class Application {
  /**
   * Unified Container - manages all DI operations
   * Use app.container to access registration and resolution methods
   */
  private _container: Container

  private moduleRegistry: ModuleRegistry
  private consumerRegistry!: ConsumerRegistry
  private cronManager!: CronManager
  private initialized = false

  constructor(
    readonly env: StratalEnv,
    readonly ctx: ExecutionContext,
    private readonly appConfig: ApplicationConfig
  ) {
    // Create unified Container with explicit child container
    this._container = new Container({
      env,
      ctx,
      container: tsyringeRootContainer.createChildContainer()
    })

    // Register Application instance
    this._container.registerValue(DI_TOKENS.Application, this)

    // Register core infrastructure inline
    this.registerLoggerService()
    this.registerCoreServices()

    // Create ModuleRegistry with our Container
    const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
    this.moduleRegistry = new ModuleRegistry(this._container, logger)

    // Register ModuleRegistry in container so modules can access it in onInitialize
    this._container.registerValue(DI_TOKENS.ModuleRegistry, this.moduleRegistry)
  }

  /**
   * Get the Container instance
   *
   * Use for service registration and resolution:
   * - app.container.register(ServiceClass)
   * - app.container.resolve(TOKEN)
   * - app.container.runInRequestScope(ctx, callback)
   */
  get container(): Container {
    return this._container
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Phase 1: Register core infrastructure modules (internal)
    this.moduleRegistry.registerAll([
      I18nModule,
      OpenAPIModule,  // Before RouterService configuration
      QueueModule,  // Before EmailModule which uses queues
      CacheModule,
    ])

    // Phase 2: Register user's root module (traverses imports)
    this.moduleRegistry.register(this.appConfig.module)

    // Phase 3: Initialize all modules
    await this.moduleRegistry.initialize()

    // Phase 4: Resolve managers from container
    this.consumerRegistry = this._container.resolve<ConsumerRegistry>(DI_TOKENS.ConsumerRegistry)
    this.cronManager = this._container.resolve<CronManager>(DI_TOKENS.Cron)

    // Phase 5: Register RouterService
    this._container.registerSingleton(ROUTER_TOKENS.RouterService, RouterService)

    // Phase 6: Configure routes, queues, and cron jobs
    this.registerRoutes()
    this.registerQueueConsumers()
    this.registerCronJobs()

    this.initialized = true
  }

  /**
   * Resolve a service from the container
   *
   * @param token - DI token for the service
   * @returns Resolved service instance
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is used to allow for any type of token
  resolve<T>(token: symbol): T {
    try {
      return this._container.resolve(token)
    } catch (error) {
      const errorHandler = this._container.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)
      const errorResponse = errorHandler.handle(error)
      throw errorResponse as unknown as Error
    }
  }

  /**
   * Handle queue batch processing
   *
   * Creates a request scope with mock RouterContext and processes the batch.
   * Queue name is passed for logging purposes; routing is by message type.
   */
  async handleQueue(batch: MessageBatch, queueName: string): Promise<void> {
    // Extract locale from first message in batch
    const firstMessage = batch.messages[0]?.body as QueueMessage | undefined
    const locale = firstMessage?.metadata?.locale ?? 'en'

    // Create mock RouterContext for queue context
    const mockRouterContext = this.createMockRouterContext(locale)

    // Process batch within request scope
    await this._container.runInRequestScope(mockRouterContext, async () => {
      try {
        const queueManager = this._container.resolve<QueueManager>(DI_TOKENS.Queue)
        await queueManager.processBatch(queueName, batch)
      } catch (error) {
        const errorHandler = this._container.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)
        errorHandler.handle(error)
        throw error
      }
    })
  }

  /**
   * Handle scheduled cron trigger
   */
  async handleScheduled(controller: ScheduledController): Promise<void> {
    const locale = 'en'
    const mockRouterContext = this.createMockRouterContext(locale)

    await this._container.runInRequestScope(mockRouterContext, async () => {
      try {
        await this.cronManager.executeScheduled(controller)
      } catch (error) {
        const errorHandler = this._container.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)
        errorHandler.handle(error)
        throw error
      }
    })
  }

  /**
   * Create mock RouterContext for queue/cron/seeder processing
   *
   * Use this when you need to create a request scope outside of HTTP context.
   *
   * @param locale - Locale for i18n (default: 'en')
   * @returns Mock RouterContext suitable for runInRequestScope
   */
  createMockRouterContext(locale = 'en'): RouterContext {
    return {
      getLocale: () => locale,
      setLocale: () => { /* no-op */ },
      getContainer: () => this._container,
    } as unknown as RouterContext
  }

  async shutdown(): Promise<void> {
    await this.moduleRegistry.shutdown()
    await this._container.dispose();
  }

  private registerRoutes(): void {
    const middlewareConfigs = this.moduleRegistry.getAllMiddlewareConfigs()
    const controllers = this.moduleRegistry.getAllControllers() as Constructor<IController>[]

    const router = this._container.resolve<RouterService>(ROUTER_TOKENS.RouterService)
    router.configure(middlewareConfigs, controllers)
  }

  private registerQueueConsumers(): void {
    for (const ConsumerClass of this.moduleRegistry.getAllConsumers()) {
      const consumer = this._container.resolve(ConsumerClass) as IQueueConsumer
      this.consumerRegistry.register(consumer)
    }
  }

  private registerCronJobs(): void {
    for (const JobClass of this.moduleRegistry.getAllJobs()) {
      const job = this._container.resolve(JobClass) as CronJob
      this.cronManager.registerJob(job)
    }
  }

  /**
   * Register LoggerService and dependencies
   */
  private registerLoggerService(): void {
    // Get logging config with defaults
    const logLevel = this.appConfig.logging?.level ?? LogLevel.INFO
    const formatter = this.appConfig.logging?.formatter ?? 'json'

    // Register log level for injection
    this._container.registerValue(LOGGER_TOKENS.LogLevelOptions, logLevel)

    // Conditional formatter registration
    this._container
      .when(() => formatter === 'pretty')
      .use(LOGGER_TOKENS.Formatter)
      .give(PrettyFormatter)
      .otherwise(JsonFormatter)

    this._container.registerSingleton(LOGGER_TOKENS.ConsoleTransport, ConsoleTransport)
    this._container.registerFactory(LOGGER_TOKENS.Transports, (c) => [c.resolve(LOGGER_TOKENS.ConsoleTransport)])
    this._container.registerSingleton(LOGGER_TOKENS.LoggerService, LoggerService)
  }

  /**
   * Register core services with explicit scope
   *
   * Scope is specified at registration time:
   * - Singleton: Single instance shared globally
   * - Request: New instance per request (container-scoped)
   * - Transient: New instance per resolution (default)
   */
  private registerCoreServices(): void {
    // Cron manager - singleton
    this._container.registerSingleton(DI_TOKENS.Cron, CronManager)

    // Error handler - transient (fresh instance each time with current I18n)
    this._container.register(DI_TOKENS.ErrorHandler, GlobalErrorHandler)
  }
}
