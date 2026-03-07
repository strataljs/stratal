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
 */
export class TestingModuleBuilder {
  private overrides: ProviderOverrideConfig<object>[] = []

  constructor(private config: TestingModuleConfig) { }

  /**
   * Override a provider with a custom implementation
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
   */
  withEnv(env: Partial<StratalEnv>): this {
    this.config.env = { ...this.config.env, ...env }
    return this
  }

  /**
   * Compile the testing module
   *
   * Creates the Application, applies overrides, initializes, and returns TestingModule.
   */
  async compile(): Promise<TestingModule> {
    const env = getTestEnv(this.config.env)
    const ctx = createExecutionContext()

    // Build root module from config
    const baseModules = Test.getBaseModules()
    const allImports = [...baseModules, ...(this.config.imports ?? [])]

    const rootModule = this.createTestRootModule({
      imports: allImports,
      providers: this.config.providers,
      controllers: this.config.controllers,
      consumers: this.config.consumers,
      jobs: this.config.jobs,
    })

    const app = new Application({
      module: rootModule,
      logging: {
        level: this.config.logging?.level ?? LogLevel.ERROR,
        formatter: this.config.logging?.formatter ?? 'pretty',
      },
      env,
      ctx,
    })

    // Auto-register FakeStorageService (can be overridden by user)
    app.container.registerSingleton(STORAGE_TOKENS.StorageService, FakeStorageService)

    // Apply user overrides BEFORE initialize
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

    await app.initialize()

    return new TestingModule(app, env, ctx)
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
