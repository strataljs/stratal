import { CacheModule } from './cache'
import type { CronJob } from './cron/cron-job'
import { CronManager } from './cron/cron-manager'
import { Container } from './di/container'
import { runWithContainer } from './di/container-storage'
import { DI_TOKENS } from './di/tokens'
import { type StratalEnv } from './env'
import { DefaultExceptionHandler } from './errors/default-exception-handler'
import { createCliExceptionContext, createCronExceptionContext, createQueueExceptionContext } from './errors/exception-context'
import type { ExceptionHandler } from './errors/exception-handler'
import type { EventHandler } from './events'
import { EventRegistry, getListenerHandlers } from './events'
import type { StratalExecutionContext } from './execution-context'
import { I18nModule } from './i18n/i18n.module'
import { JsonFormatter, LOGGER_TOKENS, LoggerService, LogLevel, PrettyFormatter } from './logger'
import { ModuleRegistry } from './module/module-registry'
import type { DynamicModule, ModuleClass } from './module/types'
import { OpenAPIModule } from './openapi'
import type { Command } from './quarry/command'
import { QuarryRegistry } from './quarry/quarry-registry'
import type { CommandInput, CommandResult } from './quarry/types'
import { type ConsumerRegistry } from './queue/consumer-registry'
import type { IQueueConsumer, QueueMessage } from './queue/queue-consumer'
import { type QueueManager } from './queue/queue-manager'
import { QueueModule } from './queue/queue.module'
import { type RouterContext } from './router'
import { HonoApp } from './router/hono-app'
import { RouteRegistry } from './router/route-registry'
import { RouterResolver } from './router/router-resolver'
import { ROUTER_TOKENS } from './router/router.tokens'
import { LocalePathService } from './router/services/locale-path.service'
import { RouteRegistrationService } from './router/services/route-registration.service'
import { VersioningService } from './router/services/versioning.service'
import type { TrailingSlashMode, VersioningOptions } from './router/types'
import { Uri } from './router/uri'
import { SEEDER_TOKENS, SeederRegistry, type Seeder } from './seeder'
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
  private cronManager!: CronManager
  private quarry!: QuarryRegistry
  private initialized = false
  private routingInitPromise: Promise<void> | null = null
  private handlerInitPromise: Promise<void> | null = null

  readonly env: StratalEnv
  private readonly appConfig: ApplicationConfig

  constructor({ env, ctx, ...config }: ApplicationOptions) {
    this.env = env
    this.appConfig = config

    this._container = new Container()

    this._container.registerValue(DI_TOKENS.Application, this)
    this._container.registerValue(DI_TOKENS.CloudflareEnv, env)
    this._container.registerValue(DI_TOKENS.ExecutionContext, ctx)

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
    // Phase 1: Register core infrastructure modules
    this.moduleRegistry.registerAll([
      I18nModule,
      QueueModule,
      CacheModule,
    ])

    // Phase 2: Register user's root module (traverses imports)
    this.moduleRegistry.register(this.appConfig.module)

    // Phase 3: Initialize all modules (only those with lifecycle hooks)
    await this.moduleRegistry.initialize()

    // Phase 3.5: Initialize ExceptionHandler
    this.initializeExceptionHandler()

    // Phase 4: Resolve lightweight managers (CronManager only — others deferred)
    this.cronManager = this._container.resolve<CronManager>(DI_TOKENS.Cron)

    // Phase 5: Register cron jobs (static schedule, no resolve), seeders, commands
    this.registerCronJobs()
    this.registerSeeders()
    this.registerCommands()

    this.initialized = true
  }

  private registerRoutingServices(): void {
    this._container.register(ROUTER_TOKENS.VersioningService, VersioningService)
    this._container.register(ROUTER_TOKENS.HonoApp, HonoApp)
    this._container.register(ROUTER_TOKENS.LocalePathService, LocalePathService)
    this._container.register(ROUTER_TOKENS.RouteRegistry, RouteRegistry)
    this._container.register(ROUTER_TOKENS.Uri, Uri)

    const routerConfigs = this.moduleRegistry.getAllRouterConfigs()
    if (routerConfigs.length > 0) {
      this._container.registerValue(ROUTER_TOKENS.RouterResolver, new RouterResolver(routerConfigs))
    }

    this._container.register(RouteRegistrationService, RouteRegistrationService)
  }

  async initializeHandlers(): Promise<void> {
    this.handlerInitPromise ??= runWithContainer(this._container, () => {
      // Resolve ConsumerRegistry lazily (deferred from Phase 4)
      this.consumerRegistry = this._container.resolve<ConsumerRegistry>(DI_TOKENS.ConsumerRegistry)
      this.registerQueueConsumers()
      this.registerEventListeners()
      return Promise.resolve()
    })
    return this.handlerInitPromise
  }

  private initializeRouting(): Promise<void> {
    this.routingInitPromise ??= runWithContainer(this._container, async () => {
      await this.initializeHandlers()
      this.moduleRegistry.register(OpenAPIModule as unknown as ModuleClass)
      this.registerRoutingServices()
      this.honoApp = this._container.resolve<HonoApp>(ROUTER_TOKENS.HonoApp)
      await this.honoApp.configure()
    })
    return this.routingInitPromise
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
    await this.initializeHandlers()

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
    await this.initializeHandlers()

    const mockRouterContext = this.createMockRouterContext('en')

    await this._container.runInRequestScope(mockRouterContext, async (requestContainer) => {
      try {
        await this.cronManager.executeScheduled(controller, requestContainer)
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
    // Resolve QuarryRegistry lazily (deferred from Phase 4)
    this.quarry ??= this._container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)
    const mockContext = this.createMockRouterContext('en')
    return this._container.runInRequestScope(mockContext, async () => {
      return this.quarry.call(name, input)
    })
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

  private registerCronJobs(): void {
    for (const JobClass of this.moduleRegistry.getAllJobs()) {
      const schedule = (JobClass as unknown as { schedule: string }).schedule
      if (schedule) {
        this.cronManager.registerJob(schedule, JobClass as Constructor<CronJob>)
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

  private initializeExceptionHandler(): void {
    const handler = this._container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
    handler.register()
    this.moduleRegistry.configureExceptionHandlers(handler)
  }
}
