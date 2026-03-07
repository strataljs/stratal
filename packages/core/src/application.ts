import { container as tsyringeRootContainer } from 'tsyringe'
import { CacheModule } from './cache'
import type { CronJob } from './cron/cron-job'
import { CronManager } from './cron/cron-manager'
import { Container } from './di/container'
import { DI_TOKENS } from './di/tokens'
import { type StratalEnv } from './env'
import { ApplicationError, GlobalErrorHandler } from './errors'
import type { EventHandler } from './events'
import { EventRegistry, getListenerHandlers } from './events'
import type { StratalExecutionContext } from './execution-context'
import { I18nModule } from './i18n/i18n.module'
import { ConsoleTransport, JsonFormatter, LOGGER_TOKENS, LoggerService, LogLevel, PrettyFormatter } from './logger'
import { ModuleRegistry } from './module/module-registry'
import type { DynamicModule, ModuleClass } from './module/types'
import { OpenAPIModule } from './openapi'
import { type ConsumerRegistry } from './queue/consumer-registry'
import type { IQueueConsumer, QueueMessage } from './queue/queue-consumer'
import { type QueueManager } from './queue/queue-manager'
import { QueueModule } from './queue/queue.module'
import { type IController, type RouterContext } from './router'
import { HonoApp } from './router/hono-app'
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

export interface ApplicationOptions extends ApplicationConfig {
  env: StratalEnv
  ctx: StratalExecutionContext
}

/**
 * Application
 *
 * Main application class managing the two-tier container hierarchy:
 * - Global Container: All services (singletons via tsyringe native)
 * - Request Container: Child of global, context-enriched instances per request
 *
 * @example
 * ```typescript
 * const app = new Application({ module: AppModule, env, ctx })
 * await app.initialize()
 *
 * // Access container via getter
 * const service = app.container.resolve(MY_TOKEN)
 *
 * // Handle HTTP request (via HonoApp)
 * // Handle queue batch
 * await app.handleQueue(batch, 'my-queue')
 * ```
 */
export class Application {
  /**
   * Unified Container - manages all DI operations
   */
  private _container: Container

  private readonly honoApp: HonoApp
  private moduleRegistry: ModuleRegistry
  private consumerRegistry!: ConsumerRegistry
  private cronManager!: CronManager
  private initialized = false

  readonly env: StratalEnv
  private readonly appConfig: ApplicationConfig

  constructor({ env, ctx, ...config }: ApplicationOptions) {
    this.env = env
    this.appConfig = config

    ApplicationError.captureStackTraces = env.ENVIRONMENT !== 'production'

    // Create unified Container with explicit child container
    this._container = new Container({
      container: tsyringeRootContainer.createChildContainer()
    })

    // Register globally — env and ctx always available
    this._container.registerValue(DI_TOKENS.Application, this)
    this._container.registerValue(DI_TOKENS.CloudflareEnv, env)
    this._container.registerValue(DI_TOKENS.ExecutionContext, ctx)

    // Register core infrastructure inline
    this.registerLoggerService()
    this.registerCoreServices()

    // Create HonoApp — owns request scope, global middleware, defaultHook, onError
    const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
    this.honoApp = new HonoApp(this._container, logger)

    // Create ModuleRegistry with our Container
    this.moduleRegistry = new ModuleRegistry(this._container, logger)

    // Register ModuleRegistry in container so modules can access it in onInitialize
    this._container.registerValue(DI_TOKENS.ModuleRegistry, this.moduleRegistry)
  }

  /**
   * Get the Container instance
   */
  get container(): Container {
    return this._container
  }

  /**
   * Get the HonoApp instance
   */
  get hono(): HonoApp {
    return this.honoApp
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Phase 1: Register core infrastructure modules (internal)
    this.moduleRegistry.registerAll([
      I18nModule,
      OpenAPIModule,
      QueueModule,
      CacheModule,
    ])

    // Phase 2: Register user's root module (traverses imports)
    this.moduleRegistry.register(this.appConfig.module)

    // Phase 3: Initialize all modules
    await this.moduleRegistry.initialize()

    // Phase 4: Resolve managers from container
    this.consumerRegistry = this._container.resolve<ConsumerRegistry>(DI_TOKENS.ConsumerRegistry)
    this.cronManager = this._container.resolve<CronManager>(DI_TOKENS.Cron)

    // Phase 5: Configure HonoApp — module middleware, OpenAPI, routes, 404
    const middlewareConfigs = this.moduleRegistry.getAllMiddlewareConfigs()
    const controllers = this.moduleRegistry.getAllControllers() as Constructor<IController>[]
    this.honoApp.configure(middlewareConfigs, controllers)

    // Phase 6: Configure queues, cron, events
    this.registerQueueConsumers()
    this.registerCronJobs()
    this.registerEventListeners()

    this.initialized = true
  }

  /**
   * Resolve a service from the container
   */
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
   */
  async handleQueue(batch: MessageBatch, queueName: string): Promise<void> {
    const firstMessage = batch.messages[0]?.body as QueueMessage | undefined
    const locale = firstMessage?.metadata?.locale ?? 'en'
    const mockRouterContext = this.createMockRouterContext(locale)

    await this._container.runInRequestScope(mockRouterContext, async (requestContainer) => {
      try {
        const queueManager = requestContainer.resolve<QueueManager>(DI_TOKENS.Queue)
        await queueManager.processBatch(queueName, batch)
      } catch (error) {
        const errorHandler = requestContainer.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)
        errorHandler.handle(error)
        throw error
      }
    })
  }

  /**
   * Handle scheduled cron trigger
   */
  async handleScheduled(controller: ScheduledController): Promise<void> {
    const mockRouterContext = this.createMockRouterContext('en')

    await this._container.runInRequestScope(mockRouterContext, async (requestContainer) => {
      try {
        await this.cronManager.executeScheduled(controller)
      } catch (error) {
        const errorHandler = requestContainer.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)
        errorHandler.handle(error)
        throw error
      }
    })
  }

  /**
   * Create mock RouterContext for queue/cron/seeder processing
   */
  createMockRouterContext(locale = 'en'): RouterContext {
    return {
      getLocale: () => locale,
      setLocale: () => { /* no-op */ },
      getContainer: () => this._container,
    } as unknown as RouterContext
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return
    this.initialized = false

    await this.moduleRegistry.shutdown()

    const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
    logger.info('Disposing container...')

    await this._container.dispose()
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
   * Auto-wire `@Listener()` classes with the EventRegistry.
   */
  private registerEventListeners(): void {
    const listeners = this.moduleRegistry.getAllListeners()
    if (listeners.length === 0) {
      return
    }

    const eventRegistry = this._container.resolve<EventRegistry>(DI_TOKENS.EventRegistry)

    for (const ListenerClass of listeners) {
      const instance = this._container.resolve(ListenerClass) as Record<string, ((...args: unknown[]) => unknown)>
      const handlers = getListenerHandlers(ListenerClass)

      for (const { methodName, event, options } of handlers) {
        eventRegistry.on(event, instance[methodName].bind(instance) as EventHandler, options)
      }
    }
  }

  /**
   * Register LoggerService and dependencies
   */
  private registerLoggerService(): void {
    const logLevel = this.appConfig.logging?.level ?? LogLevel.INFO
    const formatter = this.appConfig.logging?.formatter ?? 'json'

    this._container.registerValue(LOGGER_TOKENS.LogLevelOptions, logLevel)

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
   */
  private registerCoreServices(): void {
    this._container.registerSingleton(DI_TOKENS.Cron, CronManager)
    this._container.register(DI_TOKENS.ErrorHandler, GlobalErrorHandler)
    this._container.registerSingleton(DI_TOKENS.EventRegistry, EventRegistry)
  }
}
