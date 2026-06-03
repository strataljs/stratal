import {
  Application,
  type ApplicationConfig,
  type Constructor,
  type StratalEnv,
  type StratalExecutionContext,
} from 'stratal'
import type { ExceptionHandler } from 'stratal/errors'
import { type Container } from 'stratal/di'
import { LogLevel } from 'stratal/logger'
import { type InjectionToken, Module, type ModuleClass, type ModuleOptions } from 'stratal/module'
import { STORAGE_TOKENS } from 'stratal/storage'
import {
  BINDING_ENV_VAR,
  buildConnectionString,
  createDatabaseFromTemplate,
  DEFAULT_DB_BINDING,
  deriveAdminConnectionString,
  deriveDbName,
  deriveTemplateName,
  dropDatabase,
  ISOLATION_ENV_VAR,
  normalizeIsolation,
} from '../database'
import { FakeStorageService } from '../storage'
import { FEATURE_FLAG_SERVICE_TOKEN, FakeFeatureFlagService } from '../feature-flags'
import { ProviderOverrideBuilder, type ProviderOverrideConfig } from './override'
import { Test } from './test'
import { TestingModule, type IsolatedDatabase } from './testing-module'

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
  /**
   * Custom exception handler. Mirrors `ApplicationConfig.exceptionHandler`.
   * Must be passed at compile time — `overrideProvider(DI_TOKENS.ExceptionHandler)`
   * cannot replace it because the framework resolves the handler during
   * `initialize()` (before overrides apply).
   */
  exceptionHandler?: Constructor<ExceptionHandler>
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

  private async getCloudflareWorkers() {
    try {
      return await import('cloudflare:workers')
    } catch {
      return null
    }
  }

  /**
   * Compile the testing module
   *
   * Creates the Application, applies overrides, initializes, and returns TestingModule.
   */
  async compile(): Promise<TestingModule> {
    const cf = await this.getCloudflareWorkers()

    const env = { ...cf?.env, ...this.config.env } as StratalEnv
    const ctx: StratalExecutionContext = {
      waitUntil: cf ? cf.waitUntil : (p) => {
        p.catch(() => {
          //
        })
      },
    }

    // When database isolation is enabled, clone the migrated template into a
    // fresh per-file database and point this app's DB binding at it. The clone
    // is dropped in TestingModule.close(). No-op in 'shared' mode or when the
    // app has no DB binding.
    const isolatedDb = await this.setupIsolatedDatabase(env)

    // Everything between the clone above and returning the TestingModule (which
    // owns the drop via close()) can throw — module init, overrides, etc. If it
    // does, nothing would ever drop the freshly cloned database. Drop it (FORCE)
    // on failure before rethrowing so a compile() error doesn't leak a database.
    try {
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
        exceptionHandler: this.config.exceptionHandler,
      })

      await app.initialize()

      // Auto-register FakeStorageService after initialize so it replaces module-registered StorageService
      app.container.registerSingleton(STORAGE_TOKENS.StorageService, FakeStorageService)

      // Auto-register FakeFeatureFlagService so feature-gated code resolves without a
      // real Cloudflare Flagship binding. Inert for apps that don't use feature flags.
      app.container.registerSingleton(FEATURE_FLAG_SERVICE_TOKEN, FakeFeatureFlagService)

      // Apply user overrides AFTER initialize so they replace module-registered providers
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

      return new TestingModule(app, env, ctx, isolatedDb)
    } catch (error) {
      if (isolatedDb) {
        await dropDatabase(isolatedDb.adminConnectionString, isolatedDb.name).catch(() => {
          // Best-effort cleanup; the next run's stale-database sweep is the backstop.
        })
      }
      throw error
    }
  }

  /**
   * When `STRATAL_TEST_DB_ISOLATION=database`, create a fresh database cloned
   * from the migrated template and rewrite the Hyperdrive binding's
   * `connectionString` to target it. The binding name is configurable via
   * `stratalTest({ database: { binding } })` (defaults to `DB`). Returns the
   * created name + admin connection so `close()` can drop it, or `null` when
   * isolation is off. Throws if isolation is on but the binding is missing — a
   * misconfiguration, not a case to skip.
   */
  private async setupIsolatedDatabase(env: StratalEnv): Promise<IsolatedDatabase | null> {
    const bindings = env as unknown as Record<string, unknown>
    const isolation = normalizeIsolation(bindings[ISOLATION_ENV_VAR] as string | undefined)
    if (isolation !== 'database') return null

    const bindingName = (bindings[BINDING_ENV_VAR] as string | undefined) ?? DEFAULT_DB_BINDING
    const db = bindings[bindingName] as { connectionString?: string } | undefined
    const base = db?.connectionString
    if (!base) {
      throw new Error(
        `Database isolation is 'database' but no \`${bindingName}\` Hyperdrive binding with a connectionString was found. ` +
          `Provide it via \`stratalTest({ miniflare: { hyperdrives: { ${bindingName} } } })\`, or set isolation to 'shared'.`,
      )
    }

    const adminConnectionString = deriveAdminConnectionString(base)
    const name = deriveDbName(base)
    await createDatabaseFromTemplate(adminConnectionString, name, deriveTemplateName(base))

    // Point the binding at the per-file database by overriding only its
    // connectionString. Clone with the original prototype + descriptors so the
    // Hyperdrive binding's methods (e.g. `connect()`) and other fields survive,
    // and never mutate the shared cloudflare env object.
    const isolated = Object.create(
      Object.getPrototypeOf(db) as object | null,
      Object.getOwnPropertyDescriptors(db),
    ) as Record<string, unknown>
    Object.defineProperty(isolated, 'connectionString', {
      value: buildConnectionString(base, name),
      enumerable: true,
      configurable: true,
      writable: true,
    })
    bindings[bindingName] = isolated

    return { name, adminConnectionString }
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
