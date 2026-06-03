import { Application, type ApplicationConfig } from './application'
import type { StratalEnv } from './env'
import { StratalNotInitializedError } from './errors'
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
  private static _previousInstance: Stratal | null = null

  constructor(config: ApplicationConfig) {
    this.fetch = this.fetch.bind(this)
    this.queue = this.queue.bind(this)
    this.scheduled = this.scheduled.bind(this)

    // Invalidate any in-flight initialization from a previous instance (Vite HMR reload)
    const generation = ++Stratal._generation

    if (Stratal._previousInstance) {
      void Stratal._previousInstance.shutdown()
    }
    Stratal._previousInstance = this

    this.initPromise = this.prepareApp(config, generation)
    Stratal._application = this.initPromise
  }

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await this.ensureReady()
    const hono = await app.ensureHono()
    return hono.fetch(request, env, ctx)
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
    return this.initPromise.then(app => app.ensureHono())
  }

  async shutdown(): Promise<void> {
    try { this.app = await this.initPromise } catch { /* ignore */ }
    if (this.app) {
      await this.app.shutdown()
      this.app = null
    }
  }

  /**
   * @internal
   * Resolves the Application instance from the static singleton.
   * Used by worker base classes (DurableObject, Workflow, WorkerEntrypoint)
   * to access the DI container without going through Cloudflare RPC.
   */
  static resolveApplication(): Promise<Application> {
    if (!Stratal._application) {
      throw new StratalNotInitializedError()
    }
    return Stratal._application
  }

  private async ensureReady(): Promise<Application> {
    this.app ??= await this.initPromise;
    return this.app
  }

  private async prepareApp(config: ApplicationConfig, generation: number): Promise<Application> {
    const { env, waitUntil } = await import('cloudflare:workers')

    // After async import, check if a newer instance has replaced us (Vite HMR reload)
    if (generation !== Stratal._generation) {
      return new Promise<Application>(() => {
        //
      }) // Never resolves — avoids cross-request promise warning
    }

    const app = new Application({ ...config, env: env as Env, ctx: { waitUntil } })
    await app.initialize()

    // Check again after initialization completes
    if (generation !== Stratal._generation) {
      await app.shutdown()
      return new Promise<Application>(() => {
        //
      })
    }

    return app
  }
}
