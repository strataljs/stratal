import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { CacheModule } from './cache'
import type { CronJob } from './cron/cron-job'
import { CronManager } from './cron/cron-manager'
import { Container } from './di/container'
import { runWithContainer } from './di/container-storage'
import { DI_TOKENS } from './di/tokens'
import { Scope } from './di/types'
import { type StratalEnv } from './env'
import { ApplicationError } from './errors'
import { DefaultExceptionHandler } from './errors/default-exception-handler'
import { createCliExceptionContext, createCronExceptionContext, createQueueExceptionContext } from './errors/exception-context'
import type { ExceptionHandler } from './errors/exception-handler'
import type { EventHandler } from './events'
import { EventRegistry, getListenerHandlers } from './events'
import type { StratalExecutionContext } from './execution-context'
import { I18nModule } from './i18n/i18n.module'
import type { I18nModuleOptions } from './i18n/i18n.options'
import { I18N_TOKENS } from './i18n/i18n.tokens'
import { ConsoleTransport, JsonFormatter, LOGGER_TOKENS, LoggerService, LogLevel, PrettyFormatter } from './logger'
import { ModuleRegistry } from './module/module-registry'
import type { DynamicModule, ModuleClass } from './module/types'
import { OpenAPIModule } from './openapi'
import type { Command } from './quarry/command'
import { ApiCommand } from './quarry/commands/api.command'
import { EventListCommand } from './quarry/commands/event-list.command'
import { HelpCommand } from './quarry/commands/help.command'
import { McpServeCommand } from './quarry/commands/mcp-serve.command'
import { McpToolsCommand } from './quarry/commands/mcp-tools.command'
import { QueueListCommand } from './quarry/commands/queue-list.command'
import { RouteListCommand } from './quarry/commands/route-list.command'
import { RouteTypesCommand } from './quarry/commands/route-types.command'
import { ScheduleListCommand } from './quarry/commands/schedule-list.command'
import { QuarryRegistry } from './quarry/quarry-registry'
import type { CommandInput, CommandResult } from './quarry/types'
import { type ConsumerRegistry } from './queue/consumer-registry'
import type { IQueueConsumer, QueueMessage } from './queue/queue-consumer'
import { type QueueManager } from './queue/queue-manager'
import { QueueModule } from './queue/queue.module'
import { type IController, type RouterContext } from './router'
import { HonoApp } from './router/hono-app'
import { RouteRegistry } from './router/route-registry'
import { RouterResolver } from './router/router-resolver'
import { ROUTER_TOKENS } from './router/router.tokens'
import { LocalePathService } from './router/services/locale-path.service'
import { RouteRegistrationService } from './router/services/route-registration.service'
import { VersioningService } from './router/services/versioning.service'
import type { VersioningOptions } from './router/types'
import { DbSeedCommand, DbSeedListCommand, SEEDER_TOKENS, SeederRegistry, type Seeder } from './seeder'
import type { Constructor } from './types'

export interface ApplicationConfig {
  /** Root application module */
  module: ModuleClass | DynamicModule
  /** Logging configuration. Defaults: level=INFO, formatter='json' */
  logging?: {
    level?: LogLevel
    formatter?: 'json' | 'pretty'
  }
  /**
   * API versioning configuration.
   * When provided, enables URI-based versioning for controllers.
   */
  versioning?: VersioningOptions
  /**
   * Custom exception handler class.
   *
   * Extend {@link ExceptionHandler} and override `register()` to configure
   * custom reporting, rendering, and post-processing of exceptions.
   *
   * When not provided, {@link DefaultExceptionHandler} is used (standard
   * severity-based logging and JSON error responses).
   *
   * @example
   * ```typescript
   * new Stratal({
   *   module: AppModule,
   *   exceptionHandler: AppExceptionHandler,
   * })
   * ```
   */
  exceptionHandler?: Constructor<ExceptionHandler>
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

  private honoApp!: HonoApp
  private moduleRegistry: ModuleRegistry
  private consumerRegistry!: ConsumerRegistry
  private cronManager!: CronManager
  private quarry!: QuarryRegistry
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

    // Create ModuleRegistry with our Container
    const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
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

  /**
   * Get the application configuration
   */
  get config(): ApplicationConfig {
    return this.appConfig
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Wrap in AsyncLocalStorage so getContainer() works for route() and other standalone functions
    await runWithContainer(this._container, () => this.initializeInternal())
  }

  private async initializeInternal(): Promise<void> {
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

    // Phase 3.5: Initialize ExceptionHandler and call module onException hooks
    this.initializeExceptionHandler()

    // Phase 4: Resolve managers from container
    this.consumerRegistry = this._container.resolve<ConsumerRegistry>(DI_TOKENS.ConsumerRegistry)
    this.cronManager = this._container.resolve<CronManager>(DI_TOKENS.Cron)
    this.quarry = this._container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)

    // Phase 4.5: Register routing services in container
    // (After Phase 3 so I18N_TOKENS.Options is available for LocalePathService)
    this.registerRoutingServices()

    // Phase 5: Create & configure HonoApp
    const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
    const i18nOptions = this._container.isRegistered(I18N_TOKENS.Options)
      ? this._container.resolve<I18nModuleOptions>(I18N_TOKENS.Options)
      : undefined
    this.honoApp = new HonoApp(this._container, logger, i18nOptions)
    const controllers = this.moduleRegistry.getAllControllers() as Constructor<IController>[]

    const routerResolver = this._container.resolve<RouterResolver | null>(ROUTER_TOKENS.RouterResolver)
    const globalMiddleware = routerResolver?.getGlobalMiddleware() ?? []

    await this.honoApp.configure(controllers, globalMiddleware)

    // Phase 6: Configure queues, cron, events, commands, seeders
    this.registerQueueConsumers()
    this.registerCronJobs()
    this.registerEventListeners()
    this.registerSeeders()
    this.registerCommands()

    this.initialized = true
  }

  /**
   * Register routing services as singletons in the container.
   * Called after module initialization so I18N_TOKENS.Options is available.
   */
  private registerRoutingServices(): void {
    // VersioningService — resolves version prefixes from appConfig.versioning
    this._container.register(ROUTER_TOKENS.VersioningService, VersioningService, Scope.Singleton)

    // LocalePathService — computes LocalePathConfig from I18nModuleOptions
    this._container.register(ROUTER_TOKENS.LocalePathService, LocalePathService, Scope.Singleton)

    // RouteRegistry — single source of truth, expands routes via services above
    this._container.register(ROUTER_TOKENS.RouteRegistry, RouteRegistry, Scope.Singleton)

    // RouterResolver — merges Router configs from modules
    const routerConfigs = this.moduleRegistry.getAllRouterConfigs()
    const routerResolver = routerConfigs.length > 0 ? new RouterResolver(routerConfigs) : null
    this._container.registerValue(ROUTER_TOKENS.RouterResolver, routerResolver)

    // RouteRegistrationService — transient, resolved in HonoApp.configure()
    this._container.register(RouteRegistrationService, RouteRegistrationService)
  }

  /**
   * Resolve a service from the container
   */
  resolve<T>(token: symbol): T {
    try {
      return this._container.resolve(token)
    } catch (error) {
      const handler = this._container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
      const ctx = createCliExceptionContext('resolve')
      // Fire-and-forget — reporting happens via waitUntil internally
      void handler.handle(error, ctx)
      throw error
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
        const handler = requestContainer.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
        await handler.handle(error, createQueueExceptionContext(queueName))
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
        const handler = requestContainer.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
        await handler.handle(error, createCronExceptionContext())
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

  /**
   * Execute a command by name in a request-scoped container.
   */
  async handleCommand(name: string, input?: CommandInput): Promise<CommandResult> {
    const mockContext = this.createMockRouterContext('en')
    return this._container.runInRequestScope(mockContext, async () => {
      return this.quarry.call(name, input)
    })
  }

  private registerCommands(): void {
    // Built-in commands (always available)
    const builtinCommands: Constructor<Command>[] = [
      HelpCommand,
      DbSeedCommand, DbSeedListCommand,
      RouteListCommand, RouteTypesCommand, EventListCommand,
      ScheduleListCommand, QueueListCommand,
      McpServeCommand, McpToolsCommand, ApiCommand,
    ]
    for (const Cmd of builtinCommands) {
      injectable()(Cmd)
      this._container.register(Cmd, Cmd, Scope.Singleton)
      this.quarry.register(Cmd)
    }

    // User commands from modules
    const commands = this.moduleRegistry.getAllCommands()
    if (commands.length === 0) {
      return
    }

    for (const CommandClass of commands) {
      this.quarry.register(CommandClass as Constructor<Command>)
    }
  }

  private registerSeeders(): void {
    const seeders = this.moduleRegistry.getAllSeeders()
    if (seeders.length === 0) return
    const registry = this._container.resolve<SeederRegistry>(SEEDER_TOKENS.SeederRegistry)
    for (const SeederClass of seeders) {
      registry.register(SeederClass as Constructor<Seeder>)
    }
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
    this._container.registerSingleton(
      DI_TOKENS.ExceptionHandler,
      (this.appConfig.exceptionHandler ?? DefaultExceptionHandler) as Constructor,
    )
    this._container.registerSingleton(DI_TOKENS.EventRegistry, EventRegistry)
    this._container.registerSingleton(DI_TOKENS.Quarry, QuarryRegistry)
    this._container.registerValue(SEEDER_TOKENS.SeederRegistry, new SeederRegistry(this))
  }

  /**
   * Initialize the ExceptionHandler: call register(), then module onException hooks.
   */
  private initializeExceptionHandler(): void {
    const handler = this._container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
    handler.register()
    this.moduleRegistry.configureExceptionHandlers(handler)
  }
}
