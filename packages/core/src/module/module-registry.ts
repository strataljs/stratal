/**
 * Module Registry
 *
 * Manages module lifecycle for the @Module decorator pattern.
 * Simplified for tsyringe's flat container model:
 * - Imports are traversed for registration (organization only)
 * - Modules registered in declaration order
 * - Lifecycle hooks: onInitialize, onShutdown
 */

import { instancePerContainerCachingFactory } from 'tsyringe'
import type { Container } from '../di/container'
import { Scope } from '../di/types'
import type { LoggerService } from '../logger'
import {
  createMiddlewareConsumer,
  type MiddlewareConfigEntry,
  type MiddlewareConfigurable,
} from '../middleware'
import type { Constructor } from '../types'
import { getModuleOptions } from './module.decorator'
import type {
  DynamicModule,
  ModuleClass,
  ModuleContext,
  ModuleOptions,
  OnInitialize,
  OnShutdown,
  Provider,
} from './types'

interface RegisteredModule {
  moduleClass: Constructor
  options: ModuleOptions
  instance: object | null
}

/**
 * ModuleRegistry - manages module lifecycle
 *
 * @example
 * ```typescript
 * const registry = new ModuleRegistry(container, logger)
 * registry.register(AppModule)  // Traverses imports recursively
 * await registry.initialize()
 * // ... application running ...
 * await registry.shutdown()
 * ```
 */
export class ModuleRegistry {
  private modules: RegisteredModule[] = []
  private registeredClasses = new Set<Constructor>()
  private initialized = false

  // Collected items from all modules for Application to use
  private allControllers: Constructor[] = []
  private allConsumers: Constructor[] = []
  private allJobs: Constructor[] = []
  private allMiddlewareConfigs: MiddlewareConfigEntry[] = []

  constructor(
    private readonly container: Container,
    private readonly logger: LoggerService
  ) { }

  /**
   * Register a module (static or dynamic)
   *
   * @param moduleOrDynamic - Module class decorated with `@Module` or DynamicModule from configure()
   */
  register(moduleOrDynamic: ModuleClass | DynamicModule): void {
    const { moduleClass, options } = this.resolveModule(moduleOrDynamic)
    const isDynamic = this.isDynamicModule(moduleOrDynamic)

    // Check for duplicate registration
    if (this.registeredClasses.has(moduleClass)) {
      // For DynamicModules: Still register the additional providers
      // This allows forRoot() to add configuration even if base module is registered
      if (isDynamic) {
        this.logger.debug(`Module ${moduleClass.name} already registered, registering DynamicModule providers`)
        for (const provider of options.providers ?? []) {
          this.registerProvider(provider)
        }
      } else {
        this.logger.debug(`Module ${moduleClass.name} already registered, skipping`)
      }
      return
    }

    this.registeredClasses.add(moduleClass)
    this.logger.info(`Registering module: ${moduleClass.name}`)

    // First, register imported modules recursively
    for (const ImportedModule of options.imports ?? []) {
      this.register(ImportedModule)
    }

    // Register providers in container
    for (const provider of options.providers ?? []) {
      this.registerProvider(provider)
    }

    // Register controllers and collect them
    for (const controller of options.controllers ?? []) {
      this.container.register(controller)
      this.allControllers.push(controller)
    }

    // Register consumers as singletons by default and collect them
    for (const consumer of options.consumers ?? []) {
      this.container.register(consumer, Scope.Singleton)
      this.allConsumers.push(consumer)
      this.logger.info(`Collected consumer: ${consumer.name}`, { queueCount: this.allConsumers.length })
    }

    // Register jobs as singletons by default and collect them
    for (const job of options.jobs ?? []) {
      this.container.register(job, Scope.Singleton)
      this.allJobs.push(job)
    }

    this.modules.push({ moduleClass, options, instance: null })
  }

  /**
   * Register multiple modules in order
   */
  registerAll(modules: (ModuleClass | DynamicModule)[]): void {
    for (const module of modules) {
      this.register(module)
    }
  }

  /**
   * Initialize all modules (call configure and onInitialize hooks)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    this.logger.info('Initializing modules...')

    const context: ModuleContext = {
      container: this.container,
      logger: this.logger,
    }

    for (const registered of this.modules) {
      // Instantiate module class
      const instance = new registered.moduleClass()
      registered.instance = instance

      // Call configure() for middleware configuration if implemented
      if (this.hasMiddlewareConfigurable(instance)) {
        this.logger.debug(`Configuring middleware for: ${registered.moduleClass.name}`)
        const consumer = createMiddlewareConsumer()
        instance.configure(consumer)
        const entries = consumer.getEntries()
        this.allMiddlewareConfigs.push(...entries)
        this.logger.debug(`Collected ${entries.length} middleware config(s) from ${registered.moduleClass.name}`)
      }

      // Call onInitialize if implemented
      if (this.hasOnInitialize(instance)) {
        this.logger.info(`Initializing: ${registered.moduleClass.name}`)
        await instance.onInitialize(context)
      }
    }

    this.initialized = true
    this.logger.info('All modules initialized')
  }

  /**
   * Get all controllers registered from all modules
   */
  getAllControllers(): Constructor[] {
    return this.allControllers
  }

  /**
   * Get all consumers registered from all modules
   */
  getAllConsumers(): Constructor[] {
    return this.allConsumers
  }

  /**
   * Get all jobs registered from all modules
   */
  getAllJobs(): Constructor[] {
    return this.allJobs
  }

  /**
   * Get all middleware configurations from all modules
   */
  getAllMiddlewareConfigs(): MiddlewareConfigEntry[] {
    return this.allMiddlewareConfigs
  }

  /**
   * Shutdown all modules (call onShutdown hooks in reverse order)
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down modules...')

    const context: ModuleContext = {
      container: this.container,
      logger: this.logger,
    }

    // Reverse order for shutdown
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

  /**
   * Type guard for MiddlewareConfigurable
   */
  private hasMiddlewareConfigurable(instance: unknown): instance is MiddlewareConfigurable {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'configure' in instance &&
      typeof (instance as MiddlewareConfigurable).configure === 'function'
    )
  }

  /**
   * Type guard for OnInitialize
   */
  private hasOnInitialize(instance: unknown): instance is OnInitialize {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'onInitialize' in instance &&
      typeof (instance as OnInitialize).onInitialize === 'function'
    )
  }

  /**
   * Type guard for OnShutdown
   */
  private hasOnShutdown(instance: unknown): instance is OnShutdown {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'onShutdown' in instance &&
      typeof (instance as OnShutdown).onShutdown === 'function'
    )
  }

  /**
   * Resolve module class and options from static or dynamic module
   *
   * For DynamicModules, merges the decorator metadata (consumers, controllers, jobs)
   * with the DynamicModule options (providers, imports). This ensures modules using
   * forRoot/forRootAsync patterns still have their decorator-defined consumers registered.
   */
  private resolveModule(moduleOrDynamic: ModuleClass | DynamicModule): {
    moduleClass: Constructor
    options: ModuleOptions
  } {
    // DynamicModule (from forRoot/forRootAsync) - has module property
    if (this.isDynamicModule(moduleOrDynamic)) {
      const { module: moduleClass, ...dynamicRest } = moduleOrDynamic

      // Get decorator options and merge with dynamic options
      // This ensures consumers/controllers/jobs from @Module decorator are included
      const decoratorOptions = getModuleOptions(moduleClass) ?? {}
      const mergedOptions: ModuleOptions = {
        ...decoratorOptions,
        ...dynamicRest,
        // Merge arrays: decorator providers first, then dynamic providers
        providers: [...(decoratorOptions.providers ?? []), ...(dynamicRest.providers ?? [])],
        imports: [...(decoratorOptions.imports ?? [])],
      }

      return { moduleClass: moduleClass, options: mergedOptions }
    }

    // Static module (decorated with @Module)
    const moduleClass = moduleOrDynamic as Constructor
    const options = getModuleOptions(moduleClass) ?? {}
    return { moduleClass, options }
  }

  /**
   * Type guard for DynamicModule
   */
  private isDynamicModule(value: unknown): value is DynamicModule {
    return (
      typeof value === 'object' &&
      value !== null &&
      'module' in value && // Required property for dynamic modules
      typeof (value as DynamicModule).module === 'function'
    )
  }

  /**
   * Register a single provider in the container
   */
  private registerProvider(provider: Provider): void {
    if (typeof provider === 'function') {
      // Class-only provider - transient by default
      this.container.register(provider as Constructor)
    } else if ('useClass' in provider) {
      // ClassProvider with optional scope
      this.container.register(provider.provide, provider.useClass as Constructor, provider.scope)
    } else if ('useValue' in provider) {
      // ValueProvider - no scope needed (values are inherently singleton)
      this.container.registerValue(provider.provide, provider.useValue)
    } else if ('useFactory' in provider) {
      // FactoryProvider - use instancePerContainerCachingFactory to:
      // 1. Get the actual container at resolution time (global vs request)
      // 2. Cache result per container
      const { provide, useFactory, inject = [] } = provider
      this.container.getTsyringeContainer().register(provide, {
        useFactory: instancePerContainerCachingFactory((dependencyContainer) => {
          const deps = inject.map((token) => dependencyContainer.resolve(token))
          return useFactory(...deps)
        })
      })
    } else if ('useExisting' in provider) {
      // ExistingProvider - alias to another token
      this.container.registerExisting(provider.provide, provider.useExisting)
    }
  }
}
