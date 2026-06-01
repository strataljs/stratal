import type { Container } from '../di/container'
import { isListener } from '../events'
import type { LoggerService } from '../logger'
import { Router, type RouteConfigurable } from '../router/router'
import { isCommand } from '../quarry/is-command'
import { isSeeder } from '../seeder/is-seeder'
import type { Constructor } from '../types'
import { getModuleOptions } from './module.decorator'
import type { ExceptionHandler } from '../errors/exception-handler'
import type {
  DynamicModule,
  ModuleClass,
  ModuleContext,
  ModuleOptions,
  OnException,
  OnInitialize,
  OnShutdown,
  Provider,
} from './types'


interface RegisteredModule {
  moduleClass: Constructor
  options: ModuleOptions
  instance: object | null
  hasLifecycle: boolean
}

export class ModuleRegistry {
  private modules: RegisteredModule[] = []
  private registeredClasses = new Set<Constructor>()
  private initialized = false

  private allControllers: Constructor[] = []
  private allConsumers: Constructor[] = []
  private allJobs: Constructor[] = []
  private allListeners: Constructor[] = []
  private allCommands: Constructor[] = []
  private allSeeders: Constructor[] = []
  private allRouterConfigs: { router: Router; controllers: Constructor[] }[] = []

  constructor(
    private readonly container: Container,
    private readonly logger: LoggerService
  ) { }

  register(moduleOrDynamic: ModuleClass | DynamicModule): void {
    const { moduleClass, options } = this.resolveModule(moduleOrDynamic)

    if (this.handleAlreadyRegistered(moduleClass, moduleOrDynamic)) return

    this.registeredClasses.add(moduleClass)
    this.logger.info(`Registering module: ${moduleClass.name}`)

    for (const ImportedModule of options.imports ?? []) {
      this.register(ImportedModule)
    }

    this.registerModuleNode(moduleClass, options, { includeHttpWiring: true })
  }

  /**
   * Register a module on demand (NestJS-style lazy loading). Registers nested
   * imports recursively and providers, then runs `onInitialize` immediately
   * (the bootstrap-time batch {@link initialize} has already completed).
   *
   * Controllers, queue consumers, and cron jobs are SKIPPED — route, queue, and
   * cron wiring is finalized at bootstrap and cannot be extended at runtime.
   */
  async registerLazy(moduleOrDynamic: ModuleClass | DynamicModule): Promise<void> {
    const { moduleClass, options } = this.resolveModule(moduleOrDynamic)

    if (this.handleAlreadyRegistered(moduleClass, moduleOrDynamic)) return

    this.registeredClasses.add(moduleClass)
    this.logger.info(`Lazily registering module: ${moduleClass.name}`)

    for (const ImportedModule of options.imports ?? []) {
      await this.registerLazy(ImportedModule)
    }

    const registered = this.registerModuleNode(moduleClass, options, { includeHttpWiring: false })

    if (registered.hasLifecycle) {
      const instance = new registered.moduleClass()
      registered.instance = instance
      if (this.hasOnInitialize(instance)) {
        const context: ModuleContext = { container: this.container, logger: this.logger }
        this.logger.info(`Initializing (lazy): ${registered.moduleClass.name}`)
        await instance.onInitialize(context)
      }
    }
  }

  registerAll(modules: (ModuleClass | DynamicModule)[]): void {
    for (const module of modules) {
      this.register(module)
    }
  }

  hasRegistered(moduleClass: Constructor): boolean {
    return this.registeredClasses.has(moduleClass)
  }

  /**
   * Handle re-registration of an already-known module. For a DynamicModule,
   * its extra providers are wired (without re-running lifecycle); for a plain
   * class it is a no-op. Returns true when the module was already registered.
   */
  private handleAlreadyRegistered(
    moduleClass: Constructor,
    moduleOrDynamic: ModuleClass | DynamicModule,
  ): boolean {
    if (!this.registeredClasses.has(moduleClass)) return false

    if (this.isDynamicModule(moduleOrDynamic)) {
      this.logger.debug(`Module ${moduleClass.name} already registered, registering DynamicModule providers`)
      const { module: _, ...dynamicRest } = moduleOrDynamic
      for (const provider of dynamicRest.providers ?? []) {
        this.registerProvider(provider)
      }
    } else {
      this.logger.debug(`Module ${moduleClass.name} already registered, skipping`)
    }
    return true
  }

  /**
   * Register a single module's providers (and, for eager registration, its
   * controllers/consumers/jobs), detect lifecycle hooks, and record it.
   * Assumes the module's `imports` have already been registered by the caller.
   */
  private registerModuleNode(
    moduleClass: Constructor,
    options: ModuleOptions,
    { includeHttpWiring }: { includeHttpWiring: boolean },
  ): RegisteredModule {
    for (const provider of options.providers ?? []) {
      this.registerProvider(provider)
    }

    if (includeHttpWiring) {
      for (const controller of options.controllers ?? []) {
        this.container.register(controller)
        this.allControllers.push(controller)
      }

      for (const consumer of options.consumers ?? []) {
        this.container.register(consumer)
        this.allConsumers.push(consumer)
        this.logger.info(`Collected consumer: ${consumer.name}`, { queueCount: this.allConsumers.length })
      }

      for (const job of options.jobs ?? []) {
        this.container.register(job)
        this.allJobs.push(job)
      }
    } else if (options.controllers?.length || options.consumers?.length || options.jobs?.length) {
      this.logger.warn(
        `Lazy module ${moduleClass.name} declares controllers/consumers/jobs which are skipped — route, queue, and cron wiring is finalized at bootstrap`,
      )
    }

    const hasLifecycle =
      'onInitialize' in moduleClass.prototype ||
      'onShutdown' in moduleClass.prototype ||
      'onException' in moduleClass.prototype ||
      'configureRoutes' in moduleClass.prototype

    const registered: RegisteredModule = { moduleClass, options, instance: null, hasLifecycle }
    this.modules.push(registered)
    return registered
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    this.logger.info('Initializing modules...')

    const context: ModuleContext = {
      container: this.container,
      logger: this.logger,
    }

    // Snapshot: a module's onInitialize may lazily load another module
    // (LazyModuleLoader.load → registerLazy), which pushes to this.modules and
    // initializes it itself. Iterating a snapshot prevents the batch loop from
    // re-visiting (and double-initializing) those lazily-added modules.
    for (const registered of [...this.modules]) {
      if (!registered.hasLifecycle) continue

      const instance = new registered.moduleClass()
      registered.instance = instance

      if (this.hasOnInitialize(instance)) {
        this.logger.info(`Initializing: ${registered.moduleClass.name}`)
        await instance.onInitialize(context)
      }
    }

    this.initialized = true
    this.logger.info('All modules initialized')
  }

  getAllControllers(): Constructor[] {
    return this.allControllers
  }

  getAllConsumers(): Constructor[] {
    return this.allConsumers
  }

  getAllJobs(): Constructor[] {
    return this.allJobs
  }

  getAllListeners(): Constructor[] {
    return this.allListeners
  }

  getAllCommands(): Constructor[] {
    return this.allCommands
  }

  getAllSeeders(): Constructor[] {
    return this.allSeeders
  }

  getAllRouterConfigs(): { router: Router; controllers: Constructor[] }[] {
    if (this.allRouterConfigs.length === 0) {
      for (const { moduleClass, options, instance } of this.modules) {
        if (instance && this.hasRouteConfigurable(instance)) {
          this.logger.debug(`Configuring routes for: ${moduleClass.name}`)
          const router = new Router()
          instance.configureRoutes(router)
          const moduleControllers = options.controllers ?? []
          this.allRouterConfigs.push({ router, controllers: moduleControllers })
        }
      }
    }
    return this.allRouterConfigs
  }

  configureExceptionHandlers(handler: ExceptionHandler): void {
    for (const { moduleClass, instance } of this.modules) {
      if (instance && this.hasOnException(instance)) {
        this.logger.debug(`Configuring exception handlers for: ${moduleClass.name}`)
        instance.onException(handler)
      }
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down modules...')

    const context: ModuleContext = {
      container: this.container,
      logger: this.logger,
    }

    const reversed = [...this.modules].reverse()

    for (const { moduleClass, instance } of reversed) {
      if (instance && this.hasOnShutdown(instance)) {
        try {
          await instance.onShutdown(context)
        } catch (error) {
          this.logger.error(`Error shutting down ${moduleClass.name}:`, error as Error)
        }
      }
    }

    this.logger.info('All modules shut down')
  }

  private hasRouteConfigurable(instance: unknown): instance is RouteConfigurable {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'configureRoutes' in instance &&
      typeof (instance as RouteConfigurable).configureRoutes === 'function'
    )
  }

  private hasOnInitialize(instance: unknown): instance is OnInitialize {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'onInitialize' in instance &&
      typeof (instance as OnInitialize).onInitialize === 'function'
    )
  }

  private hasOnShutdown(instance: unknown): instance is OnShutdown {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'onShutdown' in instance &&
      typeof (instance as OnShutdown).onShutdown === 'function'
    )
  }

  private hasOnException(instance: unknown): instance is OnException {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'onException' in instance &&
      typeof (instance as OnException).onException === 'function'
    )
  }

  resolveModule(moduleOrDynamic: ModuleClass | DynamicModule): {
    moduleClass: Constructor
    options: ModuleOptions
  } {
    if (this.isDynamicModule(moduleOrDynamic)) {
      const { module: moduleClass, ...dynamicRest } = moduleOrDynamic

      const decoratorOptions = getModuleOptions(moduleClass) ?? {}
      const mergedOptions: ModuleOptions = {
        ...decoratorOptions,
        ...dynamicRest,
        providers: [...(decoratorOptions.providers ?? []), ...(dynamicRest.providers ?? [])],
        imports: [...(decoratorOptions.imports ?? [])],
      }

      return { moduleClass: moduleClass, options: mergedOptions }
    }

    const moduleClass = moduleOrDynamic as Constructor
    const options = getModuleOptions(moduleClass) ?? {}
    return { moduleClass, options }
  }

  isDynamicModule(value: unknown): value is DynamicModule {
    return (
      typeof value === 'object' &&
      value !== null &&
      'module' in value &&
      typeof (value as DynamicModule).module === 'function'
    )
  }

  private registerProvider(provider: Provider): void {
    if (typeof provider === 'function') {
      this.container.register(provider as Constructor)
      this.collectIfListener(provider as Constructor)
      this.collectIfCommand(provider as Constructor)
      this.collectIfSeeder(provider as Constructor)
    } else if ('useClass' in provider) {
      this.container.register(provider.provide, provider.useClass as Constructor)
      this.collectIfListener(provider.useClass as Constructor)
      this.collectIfCommand(provider.useClass as Constructor)
      this.collectIfSeeder(provider.useClass as Constructor)
    } else if ('useValue' in provider) {
      this.container.registerValue(provider.provide, provider.useValue)
    } else if ('useFactory' in provider) {
      const { provide, useFactory, inject = [] } = provider
      this.container.registerFactory(provide, (c) => {
        const deps = inject.map((token) => c.resolve(token))
        return useFactory(...deps)
      })
    } else if ('useExisting' in provider) {
      this.container.registerExisting(provider.provide, provider.useExisting)
    }
  }

  private collectIfCommand(providerClass: Constructor): void {
    if (isCommand(providerClass) && !this.allCommands.includes(providerClass)) {
      this.allCommands.push(providerClass)
      this.logger.debug(`Collected command: ${providerClass.name}`)
    }
  }

  private collectIfSeeder(providerClass: Constructor): void {
    if (isSeeder(providerClass) && !this.allSeeders.includes(providerClass)) {
      this.allSeeders.push(providerClass)
      this.logger.debug(`Collected seeder: ${providerClass.name}`)
    }
  }

  private collectIfListener(providerClass: Constructor): void {
    if (isListener(providerClass)) {
      this.container.registerSingleton(providerClass)
      this.allListeners.push(providerClass)
      this.logger.debug(`Collected listener: ${providerClass.name}`)
    }
  }
}
