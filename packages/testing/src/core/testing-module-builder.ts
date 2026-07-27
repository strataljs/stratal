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
import { markGatewayMode } from 'stratal/response-cache'
import { type InjectionToken, Module, type ModuleClass, type ModuleOptions } from 'stratal/module'
import { EMAIL_TOKENS } from 'stratal/email'
import { RATE_LIMITER_TOKENS } from 'stratal/rate-limiter'
import { STORAGE_TOKENS } from 'stratal/storage'
import {
  BINDING_ENV_VAR,
  buildConnectionString,
  deriveAdminConnectionString,
  deriveFileDbName,
  deriveTemplateName,
  ensureWorkerDatabase,
} from '../database'
import { FakeStorageService } from '../storage'
import { NoopRateLimiterStore } from '../mocks/noop-rate-limiter-store'
import { TestEmailProvider } from '../mocks/test-email-provider'
import { TestWorkerExports } from '../mocks/test-worker-exports'
import { TestWorkersCache } from '../mocks/test-workers-cache'
import { FEATURE_FLAG_SERVICE_TOKEN, FakeFeatureFlagService } from '../feature-flags'
import { ProviderOverrideBuilder, type ProviderOverrideConfig } from './override'
import { Test } from './test'
import { TestingModule } from './testing-module'

/**
 * Per-file guard: the first `compile()` in a file clones its database; later
 * compiles in the same file skip straight to retargeting.
 */
const ensuredWorkerDbs = new Map<string, Promise<void>>()

/**
 * A crypto-random token generated ONCE per test-file isolate. The pool runs one
 * isolate per file (`isolate: true`), so this is stable across a file's compiles
 * and unique across files — giving every file its own database. Lazily created so
 * DB-less test files never touch `crypto`.
 */
let fileToken: string | undefined
function currentFileToken(): string {
  return (fileToken ??= crypto.randomUUID().replace(/-/g, '').slice(0, 16))
}

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
  /**
   * Set to `false` to compile without a `ctx.cache` stub, reproducing a
   * runtime where Workers Caching is genuinely unconfigured. Neither
   * Miniflare nor workerd populates `ExecutionContext.cache` on its own, so by
   * default `@stratal/testing` supplies a stub — a `@Cacheable`/`@PurgesCache`
   * route otherwise 500s on its very first request (`ResponseCacheConfigError`).
   * `cache: false` opts back into that failure, for testing the boot guard
   * itself. See {@link TestWorkersCache}, exposed via `module.cache`.
   */
  cache?: false
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
    // Track work deferred via `ctx.waitUntil` so the test HTTP client can await a request's deferred
    // tail before moving on — matching the Workers runtime, which keeps a request alive until its
    // `waitUntil` promises settle. Without this, background work a request defers (e.g. a non-blocking
    // event listener's DB write) stays in flight past the response and can still be running against a
    // shared resource at teardown — risking a hang when that resource is disposed.
    const pendingTasks: Promise<unknown>[] = []
    // Neither Miniflare nor workerd ever populates `ExecutionContext.cache`, so
    // without this a `@Cacheable`/`@PurgesCache` route 500s on its first
    // request in every test suite that adopts the feature (`assertCachingAvailable`
    // fails boot). Install a stub by default — recording every purge spec for
    // `module.cache.purges` — and opt out via `cache: false` to reproduce that
    // genuinely-unconfigured runtime (e.g. to test the boot guard itself).
    const testWorkersCache = this.config.cache === false ? undefined : new TestWorkersCache()
    // Same defect class, one layer up: workerd never populates
    // `ExecutionContext.exports` here either, so an app configuring
    // `gateway: { entrypoint }` would fail its boot verification on the first
    // request of every suite. The stub answers for any export name and
    // re-runs the loopback through this same app in cached mode; calls are
    // recorded on `module.gateway.loopbacks`.
    const testWorkerExports = this.config.cache === false
      ? undefined
      : new TestWorkerExports(testWorkersCache)
    const ctx: StratalExecutionContext = {
      waitUntil: (promise) => {
        pendingTasks.push(Promise.resolve(promise).catch(() => undefined))
        cf?.waitUntil?.(promise)
      },
      cache: testWorkersCache,
      exports: testWorkerExports?.context,
    }

    // The testing module drives `HonoApp#fetch` directly rather than through
    // `Stratal.fetch`, so it has to supply the gateway mark itself — without
    // it the dispatch middleware is a no-op and a consumer's partitioned
    // routes would silently never be exercised in their own tests. Harmless
    // for every app that configures no gateway: the route table is empty, so
    // the middleware costs one check.
    markGatewayMode(ctx)

    // Point this app's DB binding at its worker's database, creating that
    // database from the template on the slot's first compile. No-op when the
    // app has no DB binding.
    await this.attachWorkerDatabase(env)

    let app: Application | null = null
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

      app = new Application({
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

      // Disable rate limiting: suites fire many requests from one "IP" in
      // seconds and would trip production limiter budgets (and Better Auth's
      // built-in per-path limits, which share this store). Override the token
      // back to a real store to test limiting behavior explicitly.
      app.container.registerSingleton(RATE_LIMITER_TOKENS.Store, NoopRateLimiterStore)

      // Auto-register TestEmailProvider: the sync queue provider runs
      // EmailConsumer inline on dispatch, which would otherwise open a real
      // SMTP connection from the test worker. Recorded messages are exposed
      // via `module.sentEmails`; the user overrides below still replace this.
      const testEmailProvider = new TestEmailProvider()
      app.container.registerValue(EMAIL_TOKENS.EmailProviderFactory, {
        create: () => testEmailProvider,
      })

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

      // Routing init is lazy in production (first fetch keeps cold starts
      // lean), but tests may resolve request-scoped router services before
      // any fetch — e.g. ActingAs minting a session resolves AUTH_OPTIONS,
      // whose factory can inject ROUTER_TOKENS.Uri. Initialize eagerly so
      // test ordering can never matter. Runs last: singleton resolution
      // caches by token without invalidation, so anything resolved here
      // would permanently shadow auto-mocks and user overrides.
      await app.ensureHono()

      // Serve a loopback the way the real cached entrypoint does: the *same*
      // Hono app, an execution context that is deliberately NOT gateway-marked
      // (so it cannot dispatch again), and the props the gateway resolved.
      testWorkerExports?.setHandler(async (request, props) => {
        const hono = await app!.ensureHono()
        const cachedCtx: StratalExecutionContext = {
          waitUntil: ctx.waitUntil.bind(ctx),
          cache: testWorkersCache,
          exports: ctx.exports,
          props,
        }
        return hono.fetch(request, env, cachedCtx as ExecutionContext)
      })

      return new TestingModule(
        app,
        env,
        ctx,
        testEmailProvider,
        pendingTasks,
        testWorkersCache,
        testWorkerExports,
      )
    } catch (error) {
      // Tear down the partially built Application so module-held resources
      // (DB pools, timers) don't outlive a failed compile().
      if (app) {
        await app.shutdown().catch(() => {
          // Best-effort cleanup for partially initialized apps.
        })
      }
      throw error
    }
  }

  /**
   * Point this app's Hyperdrive binding at the current worker's database,
   * creating that database from the template on the slot's first compile. Returns
   * nothing to clean up — worker databases live for the whole run and are reset
   * between tests, not dropped per file. No-op when the consumer didn't opt into
   * `stratalTest({ database })`; throws if they did but no connection string is
   * configured (a misconfiguration that would otherwise silently skip isolation).
   */
  private async attachWorkerDatabase(env: StratalEnv): Promise<void> {
    const bindings = env as unknown as Record<string, unknown>
    // `BINDING_ENV_VAR` is injected only when the consumer opted into per-worker
    // isolation via `stratalTest({ database })`. Absent → plain app, nothing to
    // isolate.
    const bindingName = bindings[BINDING_ENV_VAR] as string | undefined
    if (!bindingName) return
    const db = bindings[bindingName] as { connectionString?: string } | undefined
    const base = db?.connectionString
    if (!base) {
      throw new Error(
        `[stratal-testing] stratalTest({ database }) is enabled but no \`${bindingName}\` ` +
          'Hyperdrive binding with a connectionString was found. Provide it via ' +
          `miniflare.hyperdrives (e.g. { ${bindingName}: DATABASE_URL }), or drop the \`database\` option.`,
      )
    }

    const name = deriveFileDbName(base, currentFileToken())
    const adminConnectionString = deriveAdminConnectionString(base)
    let ensure = ensuredWorkerDbs.get(name)
    if (!ensure) {
      ensure = ensureWorkerDatabase(adminConnectionString, name, deriveTemplateName(base)).catch((error: unknown) => {
        // Don't let one transient failure poison every later compile in this file.
        ensuredWorkerDbs.delete(name)
        throw error
      })
      ensuredWorkerDbs.set(name, ensure)
    }
    await ensure

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
