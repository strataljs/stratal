import { createExecutionContext } from 'cloudflare:test'
import {
  Application,
  ApplicationConfig,
  type Constructor,
  type StratalEnv,
} from 'stratal'
import { Container } from 'stratal/di'
import { LogLevel } from 'stratal/logger'
import { InjectionToken, Module, ModuleClass, ModuleOptions } from 'stratal/module'
import { STORAGE_TOKENS } from 'stratal/storage'
import { FakeStorageService } from '../storage'
import { getTestEnv } from './env'
import { ProviderOverrideBuilder, type ProviderOverrideConfig } from './override'
import { Test } from './test'
import { TestingModule } from './testing-module'

/**
 * Configuration for creating a testing module
 *
 * Extends ModuleOptions to support all module properties like NestJS.
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [RegistrationModule, GeoModule],
 *   providers: [{ provide: MOCK_TOKEN, useValue: mockValue }],
 *   controllers: [TestController],
 * }).compile()
 * ```
 */
export interface TestingModuleConfig extends ModuleOptions {
  /** Optional environment overrides */
  env?: Partial<StratalEnv>
  /** Logging configuration. Defaults: level=ERROR, formatter='json' */
  logging?: ApplicationConfig['logging']
}

/**
 * Builder for creating test modules with provider overrides
 *
 * Provides a NestJS-style fluent API for configuring test modules.
 * Supports all ModuleOptions properties (imports, providers, controllers, consumers, jobs).
 *
 * @example Basic usage
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [RegistrationModule],
 * }).compile()
 * ```
 *
 * @example Provider override
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [RegistrationModule, GeoModule],
 * })
 *   .overrideProvider(EMAIL_TOKENS.EmailService)
 *   .useValue(mockEmailService)
 *   .compile()
 * ```
 *
 * @example Full ModuleOptions
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [RegistrationModule],
 *   providers: [{ provide: MOCK_TOKEN, useValue: mockValue }],
 *   controllers: [TestController],
 *   consumers: [TestConsumer],
 *   jobs: [TestJob],
 * }).compile()
 * ```
 */
export class TestingModuleBuilder {
  private overrides: ProviderOverrideConfig<object>[] = []

  constructor(private config: TestingModuleConfig) { }

  /**
   * Override a provider with a custom implementation
   *
   * Returns a ProviderOverrideBuilder for specifying the override type.
   *
   * @param token - The injection token to override
   * @returns ProviderOverrideBuilder for chaining useValue/useClass/useFactory
   */
  overrideProvider<T>(token: InjectionToken<T>): ProviderOverrideBuilder<T> {
    return new ProviderOverrideBuilder(this, token)
  }

  /**
   * Add a provider override (internal use by ProviderOverrideBuilder)
   *
   * @internal
   */
  addProviderOverride<T>(override: ProviderOverrideConfig<T>): this {
    this.overrides.push(override as ProviderOverrideConfig<object>)
    return this
  }

  /**
   * Merge additional environment bindings
   *
   * @param env - Partial environment to merge
   * @returns This builder for chaining
   */
  withEnv(env: Partial<StratalEnv>): this {
    this.config.env = { ...this.config.env, ...env }
    return this
  }

  /**
   * Compile the testing module
   *
   * Creates the Application, applies overrides, initializes, and returns TestingModule.
   * The ModuleRegistry handles all module registrations automatically.
   *
   * @returns Promise<TestingModule> - The compiled testing module
   */
  async compile(): Promise<TestingModule> {
    // 1. Create environment (cloudflare:test base + overrides)
    const env = getTestEnv(this.config.env)

    // 2. Create ExecutionContext
    const ctx = createExecutionContext()

    // 3. Build root module from config (supports all ModuleOptions)
    const baseModules = Test.getBaseModules()
    const configImports = this.config.imports ?? []
    const allImports = [...baseModules, ...configImports]

    // Create root module with all config properties
    const rootModule = this.createTestRootModule({
      imports: allImports,
      providers: this.config.providers,
      controllers: this.config.controllers,
      consumers: this.config.consumers,
      jobs: this.config.jobs,
    })

    // 4. Create Application
    const app = new Application(env, ctx, {
      module: rootModule,
      logging: {
        level: this.config.logging?.level ?? LogLevel.ERROR,
        formatter: this.config.logging?.formatter ?? 'pretty',
      },
    })

    // 7. Initialize application - ModuleRegistry handles all module registrations
    await app.initialize()

    // 5. Auto-register FakeStorageService as singleton (can be overridden by user)
    // Must be singleton so files uploaded in setup are available when consumers run
    app.container.registerSingleton(STORAGE_TOKENS.StorageService, FakeStorageService)

    // 6. Apply user overrides BEFORE initialize
    for (const override of this.overrides) {
      switch (override.type) {
        case 'value':
          app.container.registerValue(override.token, override.implementation)
          break
        case 'class':
          app.container.registerSingleton(
            override.token,
            override.implementation as Constructor
          )
          break
        case 'factory':
          app.container.registerFactory(
            override.token,
            override.implementation as (c: Container) => object
          )
          break
        case 'existing':
          app.container.registerExisting(
            override.token,
            override.implementation as InjectionToken<object>
          )
          break
      }
    }

    return new TestingModule(app, env)
  }

  /**
   * Create a test root module with the given options
   */
  private createTestRootModule(options: ModuleOptions): ModuleClass {
    @Module(options)
    class TestRootModule { }
    return TestRootModule
  }
}
