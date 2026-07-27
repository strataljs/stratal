import { Application, type ApplicationConfig } from './application'
import type { StratalEnv } from './env'
import { StratalNotInitializedError, StratalSupersededError } from './errors'
import { markGatewayMode } from './response-cache/gateway-mode'
import type { HonoApp } from './router/hono-app'

/**
 * Stratal — Hono-style entry point for Cloudflare Workers.
 *
 * Eagerly bootstraps the Application at construction time, dynamically
 * importing `cloudflare:workers` for env and waitUntil.
 *
 * @example
 * ```typescript
 * import { Stratal } from 'stratal'
 * import { AppModule } from './app.module'
 *
 * export default new Stratal({ module: AppModule })
 * ```
 */
export class Stratal<Env extends StratalEnv = StratalEnv> {
  private app: Application | null = null
  private initPromise: Promise<Application>

  private static _application: Promise<Application> | null = null
  private static _generation = 0
  private static _current: Stratal | null = null
  /**
   * Serializes generation teardown: each new instance appends the previous
   * instance's shutdown here, and `prepareApp` awaits the chain before
   * allocating the new Application. Old and new DI graphs never coexist,
   * so repeated Vite HMR reloads can't accumulate live object graphs.
   */
  private static _teardownChain: Promise<void> = Promise.resolve()

  constructor(config: ApplicationConfig) {
    this.fetch = this.fetch.bind(this)
    this.queue = this.queue.bind(this)
    this.scheduled = this.scheduled.bind(this)

    // Invalidate any in-flight initialization from a previous instance (Vite HMR reload)
    const generation = ++Stratal._generation

    const previous = Stratal._current
    Stratal._current = this
    if (previous) {
      Stratal._teardownChain = Stratal._teardownChain
        .then(() => previous.shutdown())
        .catch((error: unknown) => {
          console.error('[stratal] Failed to shut down superseded instance:', error)
        })
    }

    // Capture the chain as of THIS construction: it contains only strictly
    // older generations' teardowns. Reading the static inside prepareApp
    // instead would deadlock when this generation is superseded before its
    // first await — it would wait on a chain containing its own shutdown,
    // which waits on this initPromise.
    const teardownBarrier = Stratal._teardownChain

    this.initPromise = this.prepareApp(config, generation, teardownBarrier)
    Stratal._application = this.initPromise
    // A superseded generation rejects; without an awaiter (no in-flight
    // request during the reload) that would surface as an unhandled rejection.
    // Anything else is a real bootstrap failure — log it so it isn't invisible
    // until the first request arrives (awaiters still get the rejection).
    this.initPromise.catch((error: unknown) => {
      if (error instanceof StratalSupersededError) return
      console.error('[stratal] Initialization failed:', error)
    })
  }

  /**
   * The eyeball entrypoint — and, when `stratal/response-cache`'s gateway is
   * configured, the **gateway**.
   *
   * The execution context is marked before it reaches Hono so the dispatch
   * middleware can tell which of the two entrypoints it is running inside.
   * `cachedEntrypoint` deliberately does not mark, which is what stops the
   * cached entrypoint from dispatching back into itself. The mark lives in a
   * module-private `WeakSet` keyed on this object, so nothing a client sends
   * can set or clear it. It is a no-op for apps that configure no gateway.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await this.ensureReady()
    const hono = await app.ensureHono()
    return hono.fetch(request, env, markGatewayMode(ctx))
  }

  async queue(batch: MessageBatch): Promise<void> {
    const app = await this.ensureReady()
    return app.handleQueue(batch, batch.queue)
  }

  async scheduled(controller: ScheduledController): Promise<void> {
    const app = await this.ensureReady()
    return app.handleScheduled(controller)
  }

  get hono(): Promise<HonoApp> {
    return this.ensureReady().then(app => app.ensureHono())
  }

  async shutdown(): Promise<void> {
    try { this.app = await this.initPromise } catch { /* ignore */ }
    if (this.app) {
      await this.app.shutdown()
      this.app = null
    }
    // If we're still the live generation (explicit shutdown, not supersession),
    // clear the statics so resolveApplication() throws StratalNotInitializedError
    // instead of handing out the disposed Application.
    if (Stratal._current === this) {
      Stratal._current = null
      Stratal._application = null
    }
  }

  /**
   * @internal
   * Resolves the Application instance from the static singleton.
   * Used by worker base classes (DurableObject, Workflow, WorkerEntrypoint)
   * to access the DI container without going through Cloudflare RPC.
   * Generations superseded mid-boot reject with {@link StratalSupersededError};
   * this retries against the replacing generation so callers always land on
   * the live Application.
   */
  static async resolveApplication(): Promise<Application> {
    let current = Stratal._application
    while (current) {
      try {
        return await current
      } catch (error) {
        // Superseded by a newer generation while booting — its constructor has
        // already swapped _application; retry against the replacement.
        if (error instanceof StratalSupersededError && Stratal._application !== current) {
          current = Stratal._application
          continue
        }
        throw error
      }
    }
    throw new StratalNotInitializedError()
  }

  private async ensureReady(): Promise<Application> {
    if (this.app) return this.app
    try {
      this.app = await this.initPromise
      return this.app
    } catch (error) {
      if (error instanceof StratalSupersededError) {
        // This instance was replaced mid-boot (Vite HMR reload) — serve the
        // request from the generation that replaced it.
        return Stratal.resolveApplication()
      }
      throw error
    }
  }

  private async prepareApp(
    config: ApplicationConfig,
    generation: number,
    teardownBarrier: Promise<void>,
  ): Promise<Application> {
    const { env, waitUntil } = await import('cloudflare:workers')

    // Let every previous generation finish tearing down before allocating the
    // new DI graph — concurrent old+new graphs are what leak across reloads.
    await teardownBarrier

    // After the awaits, check if a newer instance has replaced us (Vite HMR reload)
    if (generation !== Stratal._generation) {
      throw new StratalSupersededError(generation)
    }

    const app = new Application({ ...config, env: env, ctx: { waitUntil } })
    await app.initialize()

    // Check again after initialization completes
    if (generation !== Stratal._generation) {
      await app.shutdown()
      throw new StratalSupersededError(generation)
    }

    // Pre-warm the HTTP routing stack as part of boot when the app serves HTTP,
    // so the first request doesn't pay route registration. Queue/scheduled-only
    // workers (no controllers) skip it and never build routes they won't use.
    //
    // Awaited, not fire-and-forget: Cloudflare Workers only progress async work
    // while a request is being handled, so a detached `void ensureHono()` would
    // either stall until the first request adopts it (no pre-warm) or, if it ran
    // I/O outside a request context, reject — and `initializeRouting` memoizes
    // that promise, so the first real request would await the poisoned promise
    // and fail. Awaiting folds routing into the same init chain `fetch()` already
    // awaits, running in the identical context as the proven `app.initialize()`.
    //
    // A routing failure is logged but not rethrown so it only breaks the HTTP
    // path (the memoized rejection resurfaces per request, as in lazy routing)
    // without taking down queue/scheduled handlers on a mixed worker.
    if (app.hasHttpRoutes()) {
      try {
        await app.ensureHono()
      } catch (error) {
        app.logger.error(
          '[stratal] Eager route registration failed',
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    }

    return app
  }
}
