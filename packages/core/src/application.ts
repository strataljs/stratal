import type { CronJob } from './cron/cron-job'
import type { CronManager } from './cron/cron-manager'
import { Container } from './di/container'
import { runWithContainer } from './di/container-storage'
import { DI_TOKENS } from './di/tokens'
import { type StratalEnv } from './env'
import { DefaultExceptionHandler } from './errors/default-exception-handler'
import { createCliExceptionContext, createCronExceptionContext, createQueueExceptionContext } from './errors/exception-context'
import type { ExceptionHandler } from './errors/exception-handler'
import type { EventHandler, EventRegistry } from './events'
import { getListenerHandlers } from './events'
import type { StratalExecutionContext } from './execution-context'
import { JsonFormatter, LOGGER_TOKENS, LoggerService, LogLevel, PrettyFormatter } from './logger'
import { LazyModuleLoader } from './module/lazy-module-loader'
import { ModuleRegistry } from './module/module-registry'
import type { DynamicModule, ModuleClass } from './module/types'
import type { Command } from './quarry/command'
import type { QuarryRegistry } from './quarry/quarry-registry'
import type { CommandInput, CommandResult } from './quarry/types'
import type { ConsumerRegistry } from './queue/consumer-registry'
import type { IQueueConsumer, QueueMessage } from './queue/queue-consumer'
import type { QueueManager } from './queue/queue-manager'
import type { RouterContext } from './router'
import type { HonoApp } from './router/hono-app'
import { ROUTER_TOKENS } from './router/router.tokens'
import type { TrailingSlashMode, VersioningOptions } from './router/types'
import type { Seeder } from './seeder/seeder'
import { SEEDER_TOKENS } from './seeder/seeder-registry'
import type { SeederRegistry } from './seeder/seeder-registry'
import type { Constructor } from './types'

export interface ApplicationConfig {
  module: ModuleClass | DynamicModule
  logging?: {
    level?: LogLevel
    formatter?: 'json' | 'pretty'
  }
  versioning?: VersioningOptions
  trailingSlash?: TrailingSlashMode
  exceptionHandler?: Constructor<ExceptionHandler>
}

export interface ApplicationOptions extends ApplicationConfig {
  env: StratalEnv
  ctx: StratalExecutionContext
}

export class Application {
  private _container: Container
  private honoApp!: HonoApp
  private moduleRegistry: ModuleRegistry
  private consumerRegistry!: ConsumerRegistry
  private cronManager?: CronManager
  private quarry!: QuarryRegistry
  private initialized = false

  // Independently memoized lazy-init promises — each built-in subsystem is
  // loaded on demand at its trigger point to keep cold start lean.
  private routingInitPromise: Promise<void> | null = null
  private eventsInitPromise: Promise<void> | null = null
  private queueInitPromise: Promise<void> | null = null
  private i18nInitPromise: Promise<void> | null = null
  private cronInitPromise: Promise<void> | null = null

  readonly env: StratalEnv
  private readonly appConfig: ApplicationConfig

  constructor({ env, ctx, ...config }: ApplicationOptions) {
    this.env = env
    this.appConfig = config

    this._container = new Container()

    this._container.registerValue(DI_TOKENS.Application, this)
    this._container.registerValue(DI_TOKENS.CloudflareEnv, env)
    this._container.registerValue(DI_TOKENS.ExecutionContext, ctx)
    this._container.registerValue(ROUTER_TOKENS.RouterContext, null)

    this.registerLoggerService()
    this.registerCoreServices()

    const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
    this.moduleRegistry = new ModuleRegistry(this._container, logger)

    this._container.registerValue(DI_TOKENS.ModuleRegistry, this.moduleRegistry)
  }

  get container(): Container {
    return this._container
  }

  async ensureHono(): Promise<HonoApp> {
    await this.initializeRouting()
    return this.honoApp
  }

  get config(): ApplicationConfig {
    return this.appConfig
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await runWithContainer(this._container, () => this.initializeInternal())
  }

  private async initializeInternal(): Promise<void> {
    // Eager subsystem modules — Quarry/Seeder are resolved synchronously
    // post-init (CLI runner, test harness), so they must be registered before
    // initialize() completes. Dynamic import keeps application.ts free of static
    // subsystem imports (uniform with the other built-ins). They load at boot
    // regardless, so this is for consistency, not cold-start deferral.
    const [{ QuarryModule }, { SeederModule }] = await Promise.all([
      import('./quarry/quarry.module'),
      import('./seeder/seeder.module'),
    ])
    this.moduleRegistry.registerAll([QuarryModule, SeederModule])

    // Register the user's root module (traverses imports). Other built-in
    // subsystems (i18n, queue, cache, openapi, cron, events, router) load on
    // demand at their trigger points.
    this.moduleRegistry.register(this.appConfig.module)

    // Initialize all modules (only those with lifecycle hooks)
    await this.moduleRegistry.initialize()

    // Initialize ExceptionHandler
    this.initializeExceptionHandler()

    // Register CLI commands + seeders (class refs only; no instantiation)
    this.registerCommands()
    this.registerSeeders()

    // Cron only loads when the app actually declares scheduled jobs
    if (this.moduleRegistry.getAllJobs().length > 0) {
      await this.ensureCron()
    }

    this.initialized = true
  }

  private async registerRoutingServices(): Promise<void> {
    const [
      { HonoApp },
      { RouteRegistry },
      { RouterResolver },
      { VersioningService },
      { LocalePathService },
      { LocaleUrlService },
      { RouteRegistrationService },
      { Uri },
    ] = await Promise.all([
      import('./router/hono-app'),
      import('./router/route-registry'),
      import('./router/router-resolver'),
      import('./router/services/versioning.service'),
      import('./router/services/locale-path.service'),
      import('./router/services/locale-url.service'),
      import('./router/services/route-registration.service'),
      import('./router/uri'),
    ])

    this._container.register(ROUTER_TOKENS.VersioningService, VersioningService)
    this._container.register(ROUTER_TOKENS.HonoApp, HonoApp)
    this._container.register(ROUTER_TOKENS.LocalePathService, LocalePathService)
    this._container.register(ROUTER_TOKENS.LocaleUrlService, LocaleUrlService)
    this._container.register(ROUTER_TOKENS.RouteRegistry, RouteRegistry)
    this._container.register(ROUTER_TOKENS.Uri, Uri)

    const routerConfigs = this.moduleRegistry.getAllRouterConfigs()
    if (routerConfigs.length > 0) {
      this._container.registerValue(ROUTER_TOKENS.RouterResolver, new RouterResolver(routerConfigs))
    }

    this._container.register(RouteRegistrationService, RouteRegistrationService)
  }

  /**
   * Load the events subsystem and wire listeners. Needed by the HTTP, queue,
   * and scheduled paths (handlers emit events). Independent of the queue
   * subsystem so HTTP-only apps never load queue code. EventsModule is
   * registered before the (possibly empty) listener wiring so `emit()` works
   * even with zero listeners; dedups against the framework's own load.
   */
  private initializeEventListeners(): Promise<void> {
    this.eventsInitPromise ??= runWithContainer(this._container, async () => {
      const { EventsModule } = await import('./events/events.module')
      await this.moduleRegistry.registerLazy(EventsModule)
      this.registerEventListeners()
    })
    return this.eventsInitPromise
  }

  /**
   * Wire event and queue handlers for a non-HTTP request scope (Durable
   * Objects, Workflows, WorkerEntrypoints), which may emit events or dispatch
   * to queues from arbitrary user code.
   */
  async ensureScopedHandlers(): Promise<void> {
    await this.initializeEventListeners()
    await this.initializeQueue()
  }

  /**
   * Load the queue subsystem on demand (first queue/scheduled trigger). i18n is
   * ensured first because the queue registry depends on it.
   */
  private initializeQueue(): Promise<void> {
    this.queueInitPromise ??= runWithContainer(this._container, async () => {
      await this.ensureI18n()
      const { QueueModule } = await import('./queue/queue.module')
      this.moduleRegistry.register(QueueModule as unknown as ModuleClass)
      this.consumerRegistry = this._container.resolve<ConsumerRegistry>(DI_TOKENS.ConsumerRegistry)
      this.registerQueueConsumers()
    })
    return this.queueInitPromise
  }

  /**
   * Load i18n on demand. Coupled to the request path (Zod validation error maps,
   * OpenAPI descriptions, queue registry), so it loads before routing/queue
   * handling. Uses `registerLazy` because I18nModule has an `onInitialize` hook
   * (configures the Zod error map). Dedups if the app already imported i18n.
   */
  private ensureI18n(): Promise<void> {
    this.i18nInitPromise ??= runWithContainer(this._container, async () => {
      const { I18nModule } = await import('./i18n/i18n.module')
      await this.moduleRegistry.registerLazy(I18nModule as unknown as ModuleClass)
    })
    return this.i18nInitPromise
  }

  /**
   * Load the cron subsystem on demand (first scheduled trigger, or at bootstrap
   * when the app declares jobs).
   */
  private ensureCron(): Promise<CronManager> {
    this.cronInitPromise ??= runWithContainer(this._container, async () => {
      const { CronModule } = await import('./cron/cron.module')
      this.moduleRegistry.register(CronModule)
      this.cronManager = this._container.resolve<CronManager>(DI_TOKENS.Cron)
      this.registerCronJobs(this.cronManager)
    })
    return this.cronInitPromise.then(() => this.cronManager!)
  }

  resolve<T>(token: symbol): T {
    try {
      return this._container.resolve(token)
    } catch (error) {
      const handler = this._container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
      const ctx = createCliExceptionContext('resolve')
      void handler.handle(error, ctx)
      throw error
    }
  }

  async handleQueue(batch: MessageBatch, queueName: string): Promise<void> {
    await this.initializeQueue()
    await this.initializeEventListeners()

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

  async handleScheduled(controller: ScheduledController): Promise<void> {
    const cronManager = await this.ensureCron()
    await this.initializeEventListeners()
    await this.ensureI18n()

    const mockRouterContext = this.createMockRouterContext('en')

    await this._container.runInRequestScope(mockRouterContext, async (requestContainer) => {
      try {
        await cronManager.executeScheduled(controller, requestContainer)
      } catch (error) {
        const handler = requestContainer.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
        await handler.handle(error, createCronExceptionContext())
        throw error
      }
    })
  }

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

    this._container.dispose()
  }

  async handleCommand(name: string, input?: CommandInput): Promise<CommandResult> {
    await this.initializeRouting()
    // A CLI command is a non-HTTP scope that can dispatch to queues and emit
    // events from arbitrary user code (e.g. tenant:bootstrap → email.send /
    // tenant.geo.seed). Initialize the queue subsystem so consumers are
    // registered — otherwise the (dev/CLI) sync provider finds zero consumers
    // and silently drops every dispatched message. Events are already wired by
    // initializeRouting; both inits are memoized, so this is idempotent.
    await this.initializeQueue()
    // Resolve QuarryRegistry lazily (deferred from bootstrap)
    this.quarry ??= this._container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)
    const mockContext = this.createMockRouterContext('en')
    return this._container.runInRequestScope(mockContext, async () => {
      return this.quarry.call(name, input)
    })
  }

  private initializeRouting(): Promise<void> {
    this.routingInitPromise ??= runWithContainer(this._container, async () => {
      await this.initializeEventListeners()
      await this.ensureI18n()
      const { OpenAPIModule } = await import('./openapi')
      this.moduleRegistry.register(OpenAPIModule as unknown as ModuleClass)
      await this.registerRoutingServices()
      this.honoApp = this._container.resolve<HonoApp>(ROUTER_TOKENS.HonoApp)
      await this.honoApp.configure()
    })
    return this.routingInitPromise
  }

  private registerCommands(): void {
    this.quarry ??= this._container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)
    const commands = this.moduleRegistry.getAllCommands()
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

  private registerCronJobs(cronManager: CronManager): void {
    for (const JobClass of this.moduleRegistry.getAllJobs()) {
      const schedule = (JobClass as unknown as { schedule: string }).schedule
      if (schedule) {
        cronManager.registerJob(schedule, JobClass as Constructor<CronJob>)
      } else {
        const logger = this._container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
        logger.warn(`Cron job "${JobClass.name}" has no static schedule property — skipped`)
      }
    }
  }

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

  private registerLoggerService(): void {
    const logLevel = this.appConfig.logging?.level ?? LogLevel.INFO
    const formatter = this.appConfig.logging?.formatter ?? 'json'

    this._container.registerValue(LOGGER_TOKENS.LogLevelOptions, logLevel)

    this._container
      .when(() => formatter === 'pretty')
      .use(LOGGER_TOKENS.Formatter)
      .give(PrettyFormatter)
      .otherwise(JsonFormatter)

    this._container.registerSingleton(LOGGER_TOKENS.LoggerService, LoggerService)
  }

  /**
   * Bootstrap kernel — registered imperatively because they cannot be expressed
   * as ordinary module providers: ExceptionHandler is a user-overridable forced
   * singleton (a module ClassProvider derives scope from the class decorator,
   * which a user handler may not carry), and LazyModuleLoader is the loader
   * itself. Subsystem registries (events/cron/quarry/seeder) are modules.
   */
  private registerCoreServices(): void {
    this._container.registerSingleton(
      DI_TOKENS.ExceptionHandler,
      (this.appConfig.exceptionHandler ?? DefaultExceptionHandler) as Constructor,
    )
    this._container.registerSingleton(DI_TOKENS.LazyModuleLoader, LazyModuleLoader)
  }

  private initializeExceptionHandler(): void {
    const handler = this._container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
    handler.register()
    this.moduleRegistry.configureExceptionHandlers(handler)
  }
}
